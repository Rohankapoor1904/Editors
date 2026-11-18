import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  createCineCraftMcpServer,
  resolveMcpConfig,
  readSidecarInfo,
  type McpBridgeConfig,
} from '../mcpServer';

/**
 * Behavioural tests for the MCP bridge (R27.1). These exercise the real code
 * path: a real local HTTP server plays the CineCraft agent bridge, the real
 * MCP `Server` is connected to a real MCP `Client` over an in-memory
 * transport, and tool discovery/execution flows through genuine JSON-RPC.
 * No application module is mocked.
 */
describe('R27.1: MCP bridge server', () => {
  let server: http.Server | null = null;
  let lastAuth: string | undefined;
  let lastToolBody: any = null;

  const CATALOGUE = {
    tools: [
      {
        name: 'probe_media',
        description: 'Returns metadata for an asset.',
        parameters: {
          type: 'object',
          properties: { asset_id: { type: 'string' } },
          required: ['asset_id'],
        },
      },
      {
        name: 'timeline_remove_silence',
        description: 'Removes silent segments.',
        parameters: { type: 'object', properties: { threshold_seconds: { type: 'number' } } },
      },
    ],
    count: 2,
    source: 'frontend-registry',
  };

  async function startBridge(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
    server = http.createServer((req, res) => {
      lastAuth = req.headers['authorization'];
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        (req as any).rawBody = body;
        handler(req, res);
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server!.address() as AddressInfo;
    return { baseUrl: `http://127.0.0.1:${port}/api/agent`, token: 'tok-1' } as McpBridgeConfig;
  }

  function jsonResponse(res: http.ServerResponse, status: number, payload: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  beforeEach(() => {
    lastAuth = undefined;
    lastToolBody = null;
  });

  it('mirrors the live app catalogue as MCP tools over real JSON-RPC', async () => {
    const config = await startBridge((req, res) => {
      if (req.url === '/api/agent/tools') return jsonResponse(res, 200, CATALOGUE);
      jsonResponse(res, 404, { error: 'not found' });
    });

    const mcp = createCineCraftMcpServer(config);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)]);

    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name)).toEqual(['probe_media', 'timeline_remove_silence']);
    // The input schema is the app's real parameter schema, not a stub.
    const probe = listed.tools.find((t) => t.name === 'probe_media')!;
    expect(probe.inputSchema).toMatchObject({
      type: 'object',
      required: ['asset_id'],
    });
    expect(lastAuth).toBe('Bearer tok-1');

    await client.close();
    await mcp.close();
  });

  it('forwards a tool call to the app bridge and returns its real result', async () => {
    const config = await startBridge((req, res) => {
      if (req.url === '/api/agent/tools') return jsonResponse(res, 200, CATALOGUE);
      if (req.url === '/api/agent/tool') {
        lastToolBody = JSON.parse((req as any).rawBody);
        return jsonResponse(res, 200, { success: true, id: 'req-1', result: { width: 1920, height: 1080 } });
      }
      jsonResponse(res, 404, { error: 'not found' });
    });

    const mcp = createCineCraftMcpServer(config);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({ name: 'probe_media', arguments: { asset_id: 'asset-1' } });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual({ width: 1920, height: 1080 });
    expect(lastToolBody).toEqual({ tool: 'probe_media', args: { asset_id: 'asset-1' } });

    await client.close();
    await mcp.close();
  });

  it('reports an honest error result when the app bridge returns a failure', async () => {
    const config = await startBridge((req, res) => {
      if (req.url === '/api/agent/tools') return jsonResponse(res, 200, CATALOGUE);
      if (req.url === '/api/agent/tool') return jsonResponse(res, 500, { error: 'Tool not found: nope' });
      jsonResponse(res, 404, { error: 'not found' });
    });

    const mcp = createCineCraftMcpServer(config);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({ name: 'nope', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('Tool not found: nope');

    await client.close();
    await mcp.close();
  });

  it('fails loudly (not silently empty) when the app is unreachable', async () => {
    const mcp = createCineCraftMcpServer({ baseUrl: 'http://127.0.0.1:1/api/agent', token: '' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)]);

    await expect(client.listTools()).rejects.toThrow(/not reachable/i);

    await client.close();
    await mcp.close();
  });

  it('resolveMcpConfig prefers env, then sidecar discovery, then dev default', () => {
    expect(
      resolveMcpConfig({ MCP_BRIDGE_URL: 'http://host:9/api/agent/', MCP_BRIDGE_TOKEN: 'env-tok' }, () => null)
    ).toEqual({ baseUrl: 'http://host:9/api/agent', token: 'env-tok' });

    expect(
      resolveMcpConfig({}, () => ({ baseUrl: 'http://127.0.0.1:45555/api/agent', token: 'sc-tok' }))
    ).toEqual({ baseUrl: 'http://127.0.0.1:45555/api/agent', token: 'sc-tok' });

    expect(resolveMcpConfig({}, () => null)).toEqual({
      baseUrl: 'http://localhost:3000/api/agent',
      token: '',
    });
  });

  it('readSidecarInfo parses a valid discovery file and rejects malformed ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cinecraft-mcp-'));
    const good = join(dir, 'good.json');
    writeFileSync(good, JSON.stringify({ port: 46000, token: 'abc' }));
    expect(readSidecarInfo(good)).toEqual({ baseUrl: 'http://127.0.0.1:46000/api/agent', token: 'abc' });

    const badPort = join(dir, 'bad-port.json');
    writeFileSync(badPort, JSON.stringify({ port: 0, token: 'abc' }));
    expect(readSidecarInfo(badPort)).toBeNull();

    const noToken = join(dir, 'no-token.json');
    writeFileSync(noToken, JSON.stringify({ port: 46000, token: '' }));
    expect(readSidecarInfo(noToken)).toBeNull();

    expect(readSidecarInfo(join(dir, 'missing.json'))).toBeNull();
  });
});
