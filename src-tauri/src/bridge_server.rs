//! Native agent-bridge sidecar (R23.2, ADR-009).
//!
//! Serves the exact dev-plugin protocol (`scripts/agentBridgePlugin.ts`) on
//! `127.0.0.1` with an OS-assigned port, so external IDE/LLM callers can
//! reach production builds without the Vite dev server.
//!
//! The sidecar is a *transport*, not an executor: task requests are queued
//! here and drained by the frontend `AgentBridgeClient` (`GET /pending`),
//! which executes them in JS and reports back (`POST /result`) — the same
//! polling handshake as the dev middleware.
//!
//! R23.2 scope: shared state, Bearer gate, CORS, `GET /status`,
//! `GET /timeline`, `POST /heartbeat`. Task routes (`/prompt`, `/tool`,
//! `/action`, `/connect`, `/pending`, `/result`) land in R23.3.
//!
//! VERIFICATION STATUS: `cargo check` cannot run in environments without an
//! MSVC linker. This module is `unverified` until a tooled host compiles it.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, Method, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Connection facts handed to the frontend via `get_bridge_info`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeInfo {
    pub port: u16,
    pub token: String,
}

/// A task waiting for the frontend poll loop (R23.3 fills the queue).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeTask {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub payload: Value,
}

#[derive(Debug, Default)]
struct BridgeQueues {
    pending: VecDeque<BridgeTask>,
    latest_state: Option<Value>,
    last_heartbeat_ms: u64,
    #[allow(clippy::type_complexity)]
    channels: std::collections::HashMap<String, tokio::sync::oneshot::Sender<Result<Value, String>>>,
}

/// Shared sidecar state: connection facts + polled queues.
#[derive(Debug, Clone)]
pub struct BridgeServerState {
    info: BridgeInfo,
    queues: Arc<Mutex<BridgeQueues>>,
}

impl BridgeServerState {
    /// Binds `127.0.0.1:0` (OS-assigned port) and mints a random token.
    pub async fn bind_loopback() -> std::io::Result<(tokio::net::TcpListener, Self)> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();
        let state = Self {
            info: BridgeInfo {
                port,
                token: uuid::Uuid::new_v4().to_string(),
            },
            queues: Arc::new(Mutex::new(BridgeQueues::default())),
        };
        Ok((listener, state))
    }

    pub fn info(&self) -> BridgeInfo {
        self.info.clone()
    }

    pub fn router(&self) -> Router {
        Router::new()
            .route("/api/agent/status", get(handle_status))
            .route("/api/agent/timeline", get(handle_timeline))
            .route("/api/agent/heartbeat", post(handle_heartbeat))
            .route("/api/agent/prompt", post(handle_prompt))
            .route("/api/agent/tool", post(handle_tool))
            .route("/api/agent/action", post(handle_action))
            .route("/api/agent/connect", post(handle_connect))
            .route("/api/agent/pending", get(handle_pending))
            .route("/api/agent/result", post(handle_result))
            .layer(middleware::from_fn(cors_layer))
            .with_state(self.clone())
    }

    fn heartbeat_ms_locked(queues: &BridgeQueues) -> Option<u64> {
        if queues.last_heartbeat_ms == 0 {
            None
        } else {
            Some(queues.last_heartbeat_ms)
        }
    }
}

async fn handle_connect(
    State(state): State<BridgeServerState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    if let Some(err) = require_bearer(&state.info, &headers) {
        return err;
    }

    let model = payload
        .get("model")
        .and_then(|v| v.as_str())
        .or_else(|| payload.get("agent").and_then(|v| v.as_str()))
        .unwrap_or("External Connected Agent")
        .to_string();

    let agent = payload.get("agent").cloned().unwrap_or(Value::Null);

    let id = format!("req-{}-{}", now_millis(), uuid::Uuid::new_v4().to_string().chars().take(6).collect::<String>());

    let task = BridgeTask {
        id,
        kind: "connect".to_string(),
        payload: json!({ "model": model, "agent": agent }),
    };

    {
        let mut queues = state.queues.lock().unwrap();
        queues.pending.push_back(task);
        queues.last_heartbeat_ms = now_millis();
    }

    Json(json!({
        "success": true,
        "connected": true,
        "model": model,
        "message": format!("Agent/Model {} registered and connected to CineCraft Studio.", model)
    })).into_response()
}

async fn handle_pending(State(state): State<BridgeServerState>) -> impl IntoResponse {
    let mut queues = state.queues.lock().unwrap();
    let tasks: Vec<BridgeTask> = queues.pending.drain(..).collect();
    Json(json!({ "tasks": tasks }))
}

async fn handle_result(
    State(state): State<BridgeServerState>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let id = match payload.get("id").and_then(|v| v.as_str()) {
        Some(i) => i.to_string(),
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Missing \"id\" parameter" }))).into_response(),
    };

    let result = payload.get("result").cloned().unwrap_or(Value::Null);
    let error = payload.get("error").and_then(|v| v.as_str()).map(|s| s.to_string());
    let frontend_state = payload.get("state").cloned();

    let tx = {
        let mut queues = state.queues.lock().unwrap();
        if let Some(s) = frontend_state {
            queues.latest_state = Some(s);
            queues.last_heartbeat_ms = now_millis();
        }
        queues.channels.remove(&id)
    };

    if let Some(sender) = tx {
        if let Some(err_msg) = error {
            let _ = sender.send(Err(err_msg));
        } else {
            let _ = sender.send(Ok(result));
        }
    }

    Json(json!({ "acknowledged": true })).into_response()
}

async fn handle_action(
    State(state): State<BridgeServerState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    if let Some(err) = require_bearer(&state.info, &headers) {
        return err;
    }

    let action = match payload.get("action").and_then(|v| v.as_str()) {
        Some(a) => a,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Missing \"action\" parameter" }))).into_response(),
    };

    let id = format!("req-{}-{}", now_millis(), uuid::Uuid::new_v4().to_string().chars().take(6).collect::<String>());

    let (tx, rx) = tokio::sync::oneshot::channel();

    let task = BridgeTask {
        id: id.clone(),
        kind: "action".to_string(),
        payload: payload.clone(), // Pass the entire body as payload for action
    };

    {
        let mut queues = state.queues.lock().unwrap();
        queues.pending.push_back(task);
        queues.channels.insert(id.clone(), tx);
    }

    match tokio::time::timeout(std::time::Duration::from_secs(15), rx).await {
        Ok(Ok(Ok(result))) => Json(json!({ "success": true, "id": id, "result": result })).into_response(),
        Ok(Ok(Err(err))) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": err }))).into_response(),
        Ok(Err(_)) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Channel closed" }))).into_response(),
        Err(_) => {
            let mut queues = state.queues.lock().unwrap();
            queues.channels.remove(&id);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Action {} timed out.", action) }))).into_response()
        }
    }
}

async fn handle_tool(
    State(state): State<BridgeServerState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    if let Some(err) = require_bearer(&state.info, &headers) {
        return err;
    }

    let tool = match payload.get("tool").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Missing \"tool\" parameter" }))).into_response(),
    };
    let args = payload.get("args").cloned().unwrap_or_else(|| json!({}));
    let model = payload.get("model").cloned().unwrap_or(Value::Null);

    let id = format!("req-{}-{}", now_millis(), uuid::Uuid::new_v4().to_string().chars().take(6).collect::<String>());

    let (tx, rx) = tokio::sync::oneshot::channel();

    let task = BridgeTask {
        id: id.clone(),
        kind: "tool".to_string(),
        payload: json!({ "tool": tool, "args": args, "model": model }),
    };

    {
        let mut queues = state.queues.lock().unwrap();
        queues.pending.push_back(task);
        queues.channels.insert(id.clone(), tx);
    }

    match tokio::time::timeout(std::time::Duration::from_secs(20), rx).await {
        Ok(Ok(Ok(result))) => Json(json!({ "success": true, "id": id, "result": result })).into_response(),
        Ok(Ok(Err(err))) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": err }))).into_response(),
        Ok(Err(_)) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Channel closed" }))).into_response(),
        Err(_) => {
            let mut queues = state.queues.lock().unwrap();
            queues.channels.remove(&id);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Tool {} execution timed out.", tool) }))).into_response()
        }
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_authorized(token: &str, headers: &HeaderMap) -> bool {
    if token.is_empty() {
        return true;
    }
    match headers.get("authorization").and_then(|v| v.to_str().ok()) {
        Some(value) => value == format!("Bearer {token}"),
        None => false,
    }
}

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": "Missing or invalid bearer token" })),
    )
        .into_response()
}

async fn cors_layer(req: Request<Body>, next: Next) -> Response {
    if req.method() == Method::OPTIONS {
        return Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header("access-control-allow-origin", "*")
            .header("access-control-allow-methods", "GET, POST, OPTIONS")
            .header(
                "access-control-allow-headers",
                "Content-Type, Authorization",
            )
            .body(Body::empty())
            .unwrap();
    }
    let mut res = next.run(req).await;
    res.headers_mut().insert(
        "access-control-allow-origin",
        axum::http::HeaderValue::from_static("*"),
    );
    res
}

fn status_snapshot(queues: &BridgeQueues) -> Value {
    let now = now_millis();
    let alive = match BridgeServerState::heartbeat_ms_locked(queues) {
        Some(last) => now.saturating_sub(last) < 10_000,
        None => false,
    };
    json!({
        "status": if alive { "connected" } else { "waiting_for_app" },
        "bridge": "native-sidecar",
        "authRequired": true,
        "appName": "CineCraft AI Studio",
        "connected": alive,
        "lastHeartbeatMsAgo": BridgeServerState::heartbeat_ms_locked(queues).map(|last| now.saturating_sub(last)),
        "state": queues.latest_state,
    })
}

async fn handle_status(State(state): State<BridgeServerState>) -> impl IntoResponse {
    let queues = state.queues.lock().unwrap();
    Json(status_snapshot(&queues))
}

async fn handle_timeline(State(state): State<BridgeServerState>) -> impl IntoResponse {
    let queues = state.queues.lock().unwrap();
    let latest = queues.latest_state.clone().unwrap_or(Value::Null);
    Json(json!({
        "timeline": latest.get("timeline").unwrap_or(&Value::Null),
        "metadata": latest.get("metadata").unwrap_or(&Value::Null),
        "playhead": latest.get("playhead").unwrap_or(&Value::Null),
        "activeWorkspace": latest.get("activeWorkspace").unwrap_or(&Value::Null),
    }))
}

async fn handle_heartbeat(
    State(state): State<BridgeServerState>,
    Json(snapshot): Json<Value>,
) -> impl IntoResponse {
    let mut queues = state.queues.lock().unwrap();
    queues.latest_state = Some(snapshot);
    queues.last_heartbeat_ms = now_millis();
    Json(json!({ "ok": true, "timestamp": queues.last_heartbeat_ms }))
}

/// Bearer gate shared by the R23.3 POST routes.
pub fn require_bearer(info: &BridgeInfo, headers: &HeaderMap) -> Option<Response> {
    if is_authorized(&info.token, headers) {
        None
    } else {
        Some(unauthorized())
    }
}

async fn handle_prompt(
    State(state): State<BridgeServerState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    if let Some(err) = require_bearer(&state.info, &headers) {
        return err;
    }

    let prompt = match payload.get("prompt").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Missing \"prompt\" parameter" }))).into_response(),
    };
    let model = payload.get("model").cloned().unwrap_or(Value::Null);

    let id = format!("req-{}-{}", now_millis(), uuid::Uuid::new_v4().to_string().chars().take(6).collect::<String>());

    let (tx, rx) = tokio::sync::oneshot::channel();

    let task = BridgeTask {
        id: id.clone(),
        kind: "prompt".to_string(),
        payload: json!({ "prompt": prompt, "model": model }),
    };

    {
        let mut queues = state.queues.lock().unwrap();
        queues.pending.push_back(task);
        queues.channels.insert(id.clone(), tx);
    }

    match tokio::time::timeout(std::time::Duration::from_secs(20), rx).await {
        Ok(Ok(Ok(result))) => Json(json!({ "success": true, "id": id, "result": result })).into_response(),
        Ok(Ok(Err(err))) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": err }))).into_response(),
        Ok(Err(_)) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Channel closed" }))).into_response(),
        Err(_) => {
            let mut queues = state.queues.lock().unwrap();
            queues.channels.remove(&id);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Agent prompt execution timed out after 20 seconds." }))).into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers_with(auth: Option<&str>) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Some(value) = auth {
            headers.insert(
                "authorization",
                axum::http::HeaderValue::from_str(value).unwrap(),
            );
        }
        headers
    }

    #[test]
    fn bearer_gate_accepts_exact_token_only() {
        assert!(is_authorized("tok-1", &headers_with(Some("Bearer tok-1"))));
        assert!(!is_authorized("tok-1", &headers_with(Some("Bearer tok-2"))));
        assert!(!is_authorized("tok-1", &headers_with(None)));
        assert!(!is_authorized("tok-1", &headers_with(Some("tok-1"))));
    }

    #[test]
    fn empty_server_token_keeps_local_dev_open() {
        assert!(is_authorized("", &headers_with(None)));
    }

    #[test]
    fn status_reports_waiting_before_first_heartbeat() {
        let queues = BridgeQueues::default();
        let snapshot = status_snapshot(&queues);
        assert_eq!(snapshot["status"], "waiting_for_app");
        assert_eq!(snapshot["bridge"], "native-sidecar");
        assert_eq!(snapshot["authRequired"], true);
        assert_eq!(snapshot["connected"], false);
    }

    #[test]
    fn status_reports_connected_after_heartbeat() {
        let mut queues = BridgeQueues::default();
        queues.last_heartbeat_ms = now_millis();
        queues.latest_state = Some(json!({ "playhead": 12 }));
        let snapshot = status_snapshot(&queues);
        assert_eq!(snapshot["status"], "connected");
        assert_eq!(snapshot["connected"], true);
    }

    #[test]
    fn bridge_task_round_trips_through_json() {
        let task = BridgeTask {
            id: "req-1".to_string(),
            kind: "prompt".to_string(),
            payload: json!({ "prompt": "cut silences" }),
        };
        let serialized = serde_json::to_string(&task).unwrap();
        assert!(serialized.contains("\"type\":\"prompt\""));
        let back: BridgeTask = serde_json::from_str(&serialized).unwrap();
        assert_eq!(back.id, "req-1");
    }
}

#[cfg(test)]
mod e2e_tests {
    use super::*;

    #[tokio::test]
    async fn e2e_status_endpoint_returns_json() {
        use axum::{body::Body, http::{Request, StatusCode}};
        use tower::ServiceExt as _;

        let state = BridgeServerState {
            info: BridgeInfo {
                port: 0,
                token: "test-token".to_string(),
            },
            queues: std::sync::Arc::new(std::sync::Mutex::new(BridgeQueues::default())),
        };
        let app = state.router();

        let req = Request::builder()
            .uri("/api/agent/status")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn e2e_action_endpoint_requires_auth() {
        use axum::{body::Body, http::{Request, StatusCode}};
        use tower::ServiceExt as _;

        let state = BridgeServerState {
            info: BridgeInfo {
                port: 0,
                token: "test-token".to_string(),
            },
            queues: std::sync::Arc::new(std::sync::Mutex::new(BridgeQueues::default())),
        };
        let app = state.router();

        let req = Request::builder()
            .method("POST")
            .uri("/api/agent/action")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"action": "test"}"#))
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        // Since no token is provided, it should return UNAUTHORIZED
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
