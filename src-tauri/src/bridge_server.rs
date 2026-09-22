//! Native agent-bridge sidecar (R23.2–R23.3, ADR-009).
//!
//! Serves the exact dev-plugin protocol (`scripts/agentBridgePlugin.ts`) on
//! `127.0.0.1` with an OS-assigned port, so external IDE/LLM callers can
//! reach production builds without the Vite dev server.
//!
//! The sidecar is a *transport*, not an executor: task requests are queued
//! here and drained by the frontend `AgentBridgeClient` (`GET /pending`),
//! which executes them in JS and reports back (`POST /result`) — the same
//! polling handshake as the dev middleware. `POST /prompt|/tool|/action`
//! wait (with dev-plugin timeouts) for the frontend round-trip.
//!
//! VERIFICATION STATUS: see R23.3 row in `PROGRESS.md`. `cargo check` needs
//! an MSVC linker; `rustfmt` parsing is verified everywhere.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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
use tokio::sync::oneshot;
use tokio::time::timeout;

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
    /// Request ids whose HTTP handlers are parked waiting for the frontend
    /// round-trip (`POST /result` completes them).
    waiting: HashMap<String, oneshot::Sender<Value>>,
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
            .route("/api/agent/connect", post(handle_connect))
            .route("/api/agent/prompt", post(handle_prompt))
            .route("/api/agent/tool", post(handle_tool))
            .route("/api/agent/action", post(handle_action))
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

/// Bearer gate shared by the task POST routes.
pub fn require_bearer(info: &BridgeInfo, headers: &HeaderMap) -> Option<Response> {
    if is_authorized(&info.token, headers) {
        None
    } else {
        Some(unauthorized())
    }
}

// ---------------------------------------------------------------------------
// R23.3 task routes: the polling handshake mirrored from
// `scripts/agentBridgePlugin.ts`. POST handlers park on a oneshot channel
// until the frontend drains `GET /pending`, executes in JS, and completes
// via `POST /result` — or until the dev-plugin timeout elapses.
// ---------------------------------------------------------------------------

fn bad_request(message: &str) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": message }))).into_response()
}

/// Splits a completed outcome into success vs frontend-reported failure.
fn split_outcome(outcome: &Value) -> Result<&Value, String> {
    match outcome.get("error") {
        Some(err) if !err.is_null() => Err(err
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| err.to_string())),
        _ => Ok(outcome.get("result").unwrap_or(&Value::Null)),
    }
}

/// Enqueues a task for the frontend poll loop and waits for its completion.
async fn enqueue_and_wait(
    state: &BridgeServerState,
    kind: &str,
    payload: Value,
    timeout_secs: u64,
) -> Result<(String, Value), String> {
    let id = format!("req-{}", uuid::Uuid::new_v4().simple());
    let (tx, rx) = oneshot::channel();
    {
        let mut queues = state.queues.lock().unwrap();
        queues.pending.push_back(BridgeTask {
            id: id.clone(),
            kind: kind.to_string(),
            payload,
        });
        queues.waiting.insert(id.clone(), tx);
    }
    match timeout(Duration::from_secs(timeout_secs), rx).await {
        Ok(Ok(outcome)) => Ok((id, outcome)),
        Ok(Err(_)) => {
            state.queues.lock().unwrap().waiting.remove(&id);
            Err("bridge result channel closed before completion".to_string())
        }
        Err(_) => {
            state.queues.lock().unwrap().waiting.remove(&id);
            Err(format!("request timed out after {timeout_secs} seconds"))
        }
    }
}

fn outcome_response(id: &str, outcome: Value) -> Response {
    match split_outcome(&outcome) {
        Ok(result) => Json(json!({ "success": true, "id": id, "result": result })).into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
            .into_response(),
    }
}

async fn handle_connect(
    State(state): State<BridgeServerState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    if let Some(response) = require_bearer(&state.info(), &headers) {
        return response;
    }
    let model = body
        .get("model")
        .or_else(|| body.get("agent"))
        .and_then(|v| v.as_str())
        .unwrap_or("External Connected Agent")
        .to_string();
    let id = format!("req-{}", uuid::Uuid::new_v4().to_string());
    {
        let mut queues = state.queues.lock().unwrap();
        queues.pending.push_back(BridgeTask {
            id,
            kind: "connect".to_string(),
            payload: json!({ "model": model, "agent": body.get("agent").unwrap_or(&Value::Null) }),
        });
        queues.last_heartbeat_ms = now_millis();
    }
    Json(json!({
        "success": true,
        "connected": true,
        "model": model,
        "message": format!("Agent/Model {model} registered and connected to CineCraft Studio."),
    }))
    .into_response()
}

async fn handle_prompt(
    State(state): State<BridgeServerState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    if let Some(response) = require_bearer(&state.info(), &headers) {
        return response;
    }
    let Some(prompt) = body.get("prompt").and_then(|v| v.as_str()) else {
        return bad_request("Missing \"prompt\" parameter");
    };
    let payload = json!({ "prompt": prompt, "model": body.get("model").unwrap_or(&Value::Null) });
    match enqueue_and_wait(&state, "prompt", payload, 20).await {
        Ok((id, outcome)) => outcome_response(&id, outcome),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
            .into_response(),
    }
}

async fn handle_tool(
    State(state): State<BridgeServerState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    if let Some(response) = require_bearer(&state.info(), &headers) {
        return response;
    }
    let Some(tool) = body.get("tool").and_then(|v| v.as_str()) else {
        return bad_request("Missing \"tool\" parameter");
    };
    let payload = json!({
        "tool": tool,
        "args": body.get("args").unwrap_or(&json!({})),
        "model": body.get("model").unwrap_or(&Value::Null),
    });
    match enqueue_and_wait(&state, "tool", payload, 20).await {
        Ok((id, outcome)) => outcome_response(&id, outcome),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
            .into_response(),
    }
}

async fn handle_action(
    State(state): State<BridgeServerState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    if let Some(response) = require_bearer(&state.info(), &headers) {
        return response;
    }
    if body.get("action").is_none() {
        return bad_request("Missing \"action\" parameter");
    }
    match enqueue_and_wait(&state, "action", body, 15).await {
        Ok((id, outcome)) => outcome_response(&id, outcome),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
            .into_response(),
    }
}

async fn handle_pending(State(state): State<BridgeServerState>) -> impl IntoResponse {
    let mut queues = state.queues.lock().unwrap();
    let tasks: Vec<BridgeTask> = queues.pending.drain(..).collect();
    Json(json!({ "tasks": tasks }))
}

async fn handle_result(
    State(state): State<BridgeServerState>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    {
        let mut queues = state.queues.lock().unwrap();
        if let Some(snapshot) = body.get("state") {
            queues.latest_state = Some(snapshot.clone());
            queues.last_heartbeat_ms = now_millis();
        }
        if let Some(tx) = queues.waiting.remove(&id) {
            let outcome = match body.get("error") {
                Some(err) if !err.is_null() => json!({ "error": err }),
                _ => json!({ "result": body.get("result").unwrap_or(&Value::Null) }),
            };
            let _ = tx.send(outcome);
        }
    }
    Json(json!({ "acknowledged": true }))
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

    #[test]
    fn split_outcome_routes_success_and_frontend_failure() {
        let ok = json!({ "result": { "commandsCount": 2 } });
        assert_eq!(split_outcome(&ok).unwrap()["commandsCount"], json!(2));
        // Missing "result" degrades to Null, never panics.
        assert_eq!(split_outcome(&json!({})).unwrap(), &Value::Null);

        let failed = json!({ "error": "Tool execution failed: boom" });
        assert_eq!(
            split_outcome(&failed).unwrap_err(),
            "Tool execution failed: boom"
        );
        // Explicit JSON null error counts as success (mirrors the dev plugin,
        // which only rejects on a real error payload).
        assert!(split_outcome(&json!({ "error": null })).is_ok());
    }

    #[test]
    fn request_ids_are_unique_prefixed_hex() {
        let a = format!("req-{}", uuid::Uuid::new_v4().simple());
        let b = format!("req-{}", uuid::Uuid::new_v4().simple());
        assert_ne!(a, b);
        assert!(a.starts_with("req-") && a.len() == 36);
    }
}
