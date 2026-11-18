import { DEFAULT_AGENT_BRIDGE_BASE } from '../agentBridge';

/**
 * Builds the copy-pasteable instructions that connect an MCP-capable agent
 * (Claude Code, Cursor, ...) to this running app (R27.2).
 *
 * Pure on purpose: the BridgePanel renders exactly what this returns, so the
 * UI can never drift from the real `npm run mcp` entrypoint or invent an
 * endpoint. The dev default URL needs no env; anything else carries the
 * bridge URL + token explicitly.
 */

export type McpBridgeKind = 'unknown' | 'dev-middleware' | 'native-sidecar';

export interface McpConnectionInput {
  bridgeKind: McpBridgeKind;
  bridgeUrl: string;
  token: string;
}

export interface McpConnectionInfo {
  /** True when an MCP client can actually reach the app right now. */
  available: boolean;
  /** The shell command that registers the server with Claude Code. */
  claudeCommand: string;
  /** An `.mcp.json` body for clients that use a config file. */
  configJson: string;
  /** One-line honest status shown above the commands. */
  note: string;
}

const SERVER_NAME = 'cinecraft';

function configEntry(input: McpConnectionInput): Record<string, unknown> {
  const env: Record<string, string> = {};
  if (input.bridgeUrl && input.bridgeUrl !== DEFAULT_AGENT_BRIDGE_BASE) {
    env.MCP_BRIDGE_URL = input.bridgeUrl;
  }
  if (input.token) {
    env.MCP_BRIDGE_TOKEN = input.token;
  }
  const entry: Record<string, unknown> = {
    command: 'npm',
    args: ['run', 'mcp'],
  };
  if (Object.keys(env).length > 0) entry.env = env;
  return entry;
}

function claudeCommand(input: McpConnectionInput): string {
  const parts = ['claude', 'mcp', 'add', SERVER_NAME];
  if (input.bridgeUrl && input.bridgeUrl !== DEFAULT_AGENT_BRIDGE_BASE) {
    parts.push('-e', `MCP_BRIDGE_URL=${input.bridgeUrl}`);
  }
  if (input.token) {
    parts.push('-e', `MCP_BRIDGE_TOKEN=${input.token}`);
  }
  parts.push('--', 'npm', 'run', 'mcp');
  return parts.join(' ');
}

export function buildMcpConnectionInfo(input: McpConnectionInput): McpConnectionInfo {
  const available = input.bridgeKind === 'dev-middleware' || input.bridgeKind === 'native-sidecar';

  if (!available) {
    return {
      available: false,
      claudeCommand: '',
      configJson: '',
      note:
        'No agent transport is live. Start the app with "npm run dev" (or the desktop build), ' +
        'then reload this panel to get the MCP connect command.',
    };
  }

  const note =
    input.bridgeKind === 'native-sidecar'
      ? 'Connect Claude Code (or any MCP client) to this desktop build:'
      : 'Connect Claude Code (or any MCP client) to the dev app:';

  return {
    available: true,
    claudeCommand: claudeCommand(input),
    configJson: JSON.stringify({ mcpServers: { [SERVER_NAME]: configEntry(input) } }, null, 2),
    note,
  };
}
