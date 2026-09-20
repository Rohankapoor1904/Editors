import { Plugin, ViteDevServer } from 'vite';
import { IncomingMessage, ServerResponse } from 'http';

interface PendingRequest {
  id: string;
  type: 'prompt' | 'tool' | 'action';
  payload: any;
  resolve: (data: any) => void;
  reject: (err: any) => void;
  timer: NodeJS.Timeout;
}

export function agentBridgePlugin(): Plugin {
  const pendingRequests = new Map<string, PendingRequest>();
  const queue: Array<{ id: string; type: string; payload: any }> = [];
  let latestState: any = null;
  let lastHeartbeat = 0;

  function parseJsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  function sendJson(res: ServerResponse, status: number, data: any) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end(JSON.stringify(data, null, 2));
  }

  return {
    name: 'cinecraft-agent-bridge',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/agent')) {
          return next();
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          return res.end();
        }

        const pathname = req.url.split('?')[0];

        // 1. GET /api/agent/status
        if (pathname === '/api/agent/status' && req.method === 'GET') {
          const isAlive = Date.now() - lastHeartbeat < 10000;
          return sendJson(res, 200, {
            status: isAlive ? 'connected' : 'waiting_for_app',
            appName: 'CineCraft AI Studio',
            connected: isAlive,
            lastHeartbeatMsAgo: lastHeartbeat ? Date.now() - lastHeartbeat : null,
            state: latestState,
          });
        }

        // 2. GET /api/agent/timeline
        if (pathname === '/api/agent/timeline' && req.method === 'GET') {
          return sendJson(res, 200, {
            timeline: latestState?.timeline || null,
            metadata: latestState?.metadata || null,
            playhead: latestState?.playhead || null,
            activeWorkspace: latestState?.activeWorkspace || null,
          });
        }

        // 3. POST /api/agent/prompt
        if (pathname === '/api/agent/prompt' && req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            const prompt = body.prompt;
            if (!prompt) {
              return sendJson(res, 400, { error: 'Missing "prompt" parameter' });
            }

            const id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            const promise = new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error('Agent prompt execution timed out after 20 seconds.'));
              }, 20000);

              pendingRequests.set(id, { id, type: 'prompt', payload: { prompt }, resolve, reject, timer });
              queue.push({ id, type: 'prompt', payload: { prompt } });
            });

            const result = await promise;
            return sendJson(res, 200, { success: true, id, result });
          } catch (err: any) {
            return sendJson(res, 500, { error: err.message || String(err) });
          }
        }

        // 4. POST /api/agent/tool
        if (pathname === '/api/agent/tool' && req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            const { tool, args } = body;
            if (!tool) {
              return sendJson(res, 400, { error: 'Missing "tool" parameter' });
            }

            const id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            const promise = new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error(`Tool ${tool} execution timed out.`));
              }, 20000);

              pendingRequests.set(id, { id, type: 'tool', payload: { tool, args: args || {} }, resolve, reject, timer });
              queue.push({ id, type: 'tool', payload: { tool, args: args || {} } });
            });

            const result = await promise;
            return sendJson(res, 200, { success: true, id, result });
          } catch (err: any) {
            return sendJson(res, 500, { error: err.message || String(err) });
          }
        }

        // 5. POST /api/agent/action
        if (pathname === '/api/agent/action' && req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            if (!body.action) {
              return sendJson(res, 400, { error: 'Missing "action" parameter' });
            }

            const id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            const promise = new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error(`Action ${body.action} timed out.`));
              }, 15000);

              pendingRequests.set(id, { id, type: 'action', payload: body, resolve, reject, timer });
              queue.push({ id, type: 'action', payload: body });
            });

            const result = await promise;
            return sendJson(res, 200, { success: true, id, result });
          } catch (err: any) {
            return sendJson(res, 500, { error: err.message || String(err) });
          }
        }

        // 6. GET /api/agent/pending (Polled by frontend client)
        if (pathname === '/api/agent/pending' && req.method === 'GET') {
          const tasks = queue.splice(0, queue.length);
          return sendJson(res, 200, { tasks });
        }

        // 7. POST /api/agent/result (Reported by frontend client upon completion)
        if (pathname === '/api/agent/result' && req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            const { id, result, error, state } = body;
            if (state) {
              latestState = state;
              lastHeartbeat = Date.now();
            }
            const pending = pendingRequests.get(id);
            if (pending) {
              clearTimeout(pending.timer);
              pendingRequests.delete(id);
              if (error) {
                pending.reject(new Error(error));
              } else {
                pending.resolve(result);
              }
            }
            return sendJson(res, 200, { acknowledged: true });
          } catch (err: any) {
            return sendJson(res, 500, { error: err.message });
          }
        }

        // 8. POST /api/agent/heartbeat (Reported periodically by frontend client)
        if (pathname === '/api/agent/heartbeat' && req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            latestState = body;
            lastHeartbeat = Date.now();
            return sendJson(res, 200, { ok: true, timestamp: lastHeartbeat });
          } catch (err: any) {
            return sendJson(res, 500, { error: err.message });
          }
        }

        return next();
      });
    },
  };
}
