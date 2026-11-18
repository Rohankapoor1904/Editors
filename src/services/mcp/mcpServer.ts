import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

/**
 * CineCraft MCP bridge server (R27.1).
 *
 * Exposes the live CineCraft tool registry to any MCP-capable agent
 * (Claude Code, Cursor, ...). This module is a thin, *honest* client of the
 * in-app agent bridge: it never invents a tool catalogue and never claims
 * success it did not observe. It:
 *
 *   - discovers the running app's bridge (URL + bearer token),
 *   - mirrors the app's real tool catalogue (`GET /tools`) as MCP tools,
 *   - forwards every `tools/call` to the app (`POST /tool`), where the
 *     registry validates args and the resulting command is applied to the
 *     timeline.
 *
 * Because it depends only on `node:*` + the MCP SDK it lives under `src/`
 * for type-checking but is launched directly by Node's TypeScript support
 * (`npm run mcp`), not bundled into the browser app.
 */

export interface McpBridgeConfig {
  baseUrl: string;
  token: string;
}

export interface BridgeTool {
  name: string;
  description: string;
  parameters: unknown;
}

/** Minimal fetch shape so tests can inject a transport without mocking app code. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const DEFAULT_BRIDGE_URL = 'http://localhost:3000/api/agent';

/** Reads the sidecar discovery file the Tauri host writes at startup (ADR-009). */
export function readSidecarInfo(path: string = join(tmpdir(), 'cinecraft_bridge_info.json')): McpBridgeConfig | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as { port?: unknown; token?: unknown };
    if (typeof raw.port !== 'number' || !Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535) {
      return null;
    }
    if (typeof raw.token !== 'string' || raw.token.length === 0) return null;
    return { baseUrl: `http://127.0.0.1:${raw.port}/api/agent`, token: raw.token };
  } catch {
    return null;
  }
}

/**
 * Resolves the bridge config. Explicit env wins; otherwise fall back to the
 * sidecar discovery file; otherwise the dev default. Never throws — a
 * missing app is reported honestly on first use, not at startup.
 */
export function resolveMcpConfig(
  env: Record<string, string | undefined> = process.env,
  sidecarReader: () => McpBridgeConfig | null = readSidecarInfo
): McpBridgeConfig {
  if (env.MCP_BRIDGE_URL) {
    return { baseUrl: env.MCP_BRIDGE_URL.replace(/\/+$/, ''), token: env.MCP_BRIDGE_TOKEN || '' };
  }
  const sidecar = sidecarReader();
  if (sidecar) return sidecar;
  return { baseUrl: DEFAULT_BRIDGE_URL, token: env.MCP_BRIDGE_TOKEN || '' };
}

function authHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Fetches the live tool catalogue from the app. Throws a descriptive error
 * (surfaced verbatim to the calling agent) when the app is unreachable or
 * has not yet published its registry — this is the intended honest failure.
 */
export async function fetchBridgeTools(
  config: McpBridgeConfig,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<BridgeTool[]> {
  let res;
  try {
    res = await fetchImpl(`${config.baseUrl}/tools`, { method: 'GET', headers: authHeaders(config.token) });
  } catch (err) {
    throw new Error(
      `CineCraft app is not reachable at ${config.baseUrl}. Start the app ` +
        `(npm run dev, or the desktop build) and try again. Underlying error: ${
          (err as Error)?.message || String(err)
        }`
    );
  }
  if (!res.ok) {
    throw new Error(`CineCraft bridge returned HTTP ${res.status} for ${config.baseUrl}/tools.`);
  }
  const body = JSON.parse(await res.text()) as { tools?: unknown };
  const tools = Array.isArray(body.tools) ? (body.tools as BridgeTool[]) : [];
  if (tools.length === 0) {
    throw new Error(
      'CineCraft reported an empty tool catalogue. The app may still be starting; ' +
        'wait for its status to become "connected" and retry.'
    );
  }
  return tools;
}

/**
 * Forwards a single tool call to the app's registry and returns the parsed
 * JSON result. A bridge-reported error becomes a thrown Error so the MCP
 * layer can surface it as an honest `isError` tool result.
 */
export async function callBridgeTool(
  config: McpBridgeConfig,
  name: string,
  args: Record<string, unknown>,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<unknown> {
  let res;
  try {
    res = await fetchImpl(`${config.baseUrl}/tool`, {
      method: 'POST',
      headers: authHeaders(config.token),
      body: JSON.stringify({ tool: name, args: args || {} }),
    });
  } catch (err) {
    throw new Error(
      `CineCraft app is not reachable at ${config.baseUrl}. Underlying error: ${
        (err as Error)?.message || String(err)
      }`
    );
  }

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const message = parsed && typeof parsed.error === 'string' ? parsed.error : `HTTP ${res.status}`;
    throw new Error(`Tool "${name}" failed: ${message}`);
  }
  // The app wraps the executor result as { success, id, result }. An executor
  // that returned a typed error object is still reported honestly.
  return parsed && 'result' in parsed ? parsed.result : parsed;
}

export const MCP_SERVER_INFO = { name: 'cinecraft', version: '1.0.0' } as const;

/**
 * Builds an MCP `Server` that mirrors the app's registry. Kept pure (no
 * process I/O) so it can be driven over an in-memory transport in tests.
 */
export function createCineCraftMcpServer(
  config: McpBridgeConfig,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Server {
  const server = new Server(MCP_SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await fetchBridgeTools(config, fetchImpl);
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: (tool.parameters as Record<string, unknown>) || { type: 'object', properties: {} },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await callBridgeTool(config, name, (args as Record<string, unknown>) || {}, fetchImpl);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: (err as Error)?.message || String(err) }],
      };
    }
  });

  return server;
}
