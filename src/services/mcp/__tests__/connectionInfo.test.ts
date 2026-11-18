import { describe, it, expect } from 'vitest';
import { buildMcpConnectionInfo } from '../connectionInfo';
import { DEFAULT_AGENT_BRIDGE_BASE } from '../../agentBridge';

/**
 * R27.2: the MCP connection instructions must be built from the live bridge
 * state — the dev default needs no env, a sidecar carries URL + token, and an
 * unavailable bridge yields honest guidance instead of a dead command.
 */
describe('R27.2: buildMcpConnectionInfo', () => {
  it('omits env for the dev default and points at npm run mcp', () => {
    const info = buildMcpConnectionInfo({
      bridgeKind: 'dev-middleware',
      bridgeUrl: DEFAULT_AGENT_BRIDGE_BASE,
      token: '',
    });
    expect(info.available).toBe(true);
    expect(info.claudeCommand).toBe('claude mcp add cinecraft -- npm run mcp');
    expect(JSON.parse(info.configJson)).toEqual({
      mcpServers: { cinecraft: { command: 'npm', args: ['run', 'mcp'] } },
    });
  });

  it('carries the URL and token for a native sidecar', () => {
    const info = buildMcpConnectionInfo({
      bridgeKind: 'native-sidecar',
      bridgeUrl: 'http://127.0.0.1:45222/api/agent',
      token: 'tok-secret-1',
    });
    expect(info.available).toBe(true);
    expect(info.claudeCommand).toBe(
      'claude mcp add cinecraft -e MCP_BRIDGE_URL=http://127.0.0.1:45222/api/agent -e MCP_BRIDGE_TOKEN=tok-secret-1 -- npm run mcp'
    );
    expect(JSON.parse(info.configJson)).toEqual({
      mcpServers: {
        cinecraft: {
          command: 'npm',
          args: ['run', 'mcp'],
          env: {
            MCP_BRIDGE_URL: 'http://127.0.0.1:45222/api/agent',
            MCP_BRIDGE_TOKEN: 'tok-secret-1',
          },
        },
      },
    });
  });

  it('includes a non-default dev URL in env but never a token for dev', () => {
    const info = buildMcpConnectionInfo({
      bridgeKind: 'dev-middleware',
      bridgeUrl: 'http://localhost:4000/api/agent',
      token: '',
    });
    expect(info.claudeCommand).toContain('-e MCP_BRIDGE_URL=http://localhost:4000/api/agent');
    expect(info.claudeCommand).not.toContain('MCP_BRIDGE_TOKEN');
  });

  it('reports honest guidance (no command) when no transport is live', () => {
    for (const kind of ['unknown', 'unavailable-in-production'] as const) {
      const info = buildMcpConnectionInfo({ bridgeKind: kind as never, bridgeUrl: '', token: '' });
      expect(info.available).toBe(false);
      expect(info.claudeCommand).toBe('');
      expect(info.configJson).toBe('');
      expect(info.note).toMatch(/npm run dev/i);
    }
  });
});
