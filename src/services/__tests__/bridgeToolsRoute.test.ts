import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { agentBridgePlugin } from '../../../scripts/agentBridgePlugin';

/**
 * Behavioural test for the dev-middleware `/api/agent/tools` route (R27.1).
 * Drives the real plugin middleware behind a real HTTP server so the route
 * logic (heartbeat ingestion → catalogue publication) is exercised end to end.
 * The frontend registry itself is not mocked.
 */
describe('R27.1: dev bridge /tools route', () => {
  let server: http.Server | null = null;

  async function startPluginServer(): Promise<string> {
    const plugin = agentBridgePlugin();
    let middleware: ((req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void) | null = null;
    (plugin.configureServer as (s: unknown) => void)({
      middlewares: {
        use: (fn: typeof middleware) => {
          middleware = fn;
        },
      },
    });
    if (!middleware) throw new Error('plugin did not register middleware');

    server = http.createServer((req, res) => {
      (middleware as NonNullable<typeof middleware>)(req, res, () => {
        res.statusCode = 404;
        res.end('not handled');
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}/api/agent`;
  }

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it('returns an empty catalogue before the app heartbeats (no fabrication)', async () => {
    const base = await startPluginServer();
    const res = await fetch(`${base}/tools`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ tools: [], count: 0, source: 'frontend-registry' });
  });

  it('publishes the tool catalogue the app reported via heartbeat', async () => {
    const base = await startPluginServer();
    const tools = [
      {
        name: 'probe_media',
        description: 'Returns metadata for an asset.',
        parameters: { type: 'object', properties: { asset_id: { type: 'string' } }, required: ['asset_id'] },
      },
    ];

    const hb = await fetch(`${base}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playhead: 0, timeline: { tracks: [] }, tools }),
    });
    expect(hb.status).toBe(200);

    const res = await fetch(`${base}/tools`);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.tools[0].name).toBe('probe_media');
    expect(body.source).toBe('frontend-registry');
  });
});
