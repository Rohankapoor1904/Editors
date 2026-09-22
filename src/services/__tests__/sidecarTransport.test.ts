import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  DEFAULT_AGENT_BRIDGE_BASE,
  fetchBridgeStatus,
  resolveSidecarBase,
  discoverSidecar,
  setAgentBridgeBase,
  setAgentBridgeToken,
  getAgentBridgeBase,
  getAgentBridgeToken,
} from '../agentBridge';
import { useAgentStore } from '../../store/agentStore';

describe('R23.1: native sidecar transport', () => {
  let server: http.Server | null = null;
  let seenAuth: string | undefined;

  async function startStatusServer(statusBody: unknown, statusCode = 200): Promise<string> {
    seenAuth = undefined;
    server = http.createServer((req, res) => {
      seenAuth = req.headers['authorization'];
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(statusBody));
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

  beforeEach(() => {
    setAgentBridgeBase(DEFAULT_AGENT_BRIDGE_BASE);
    setAgentBridgeToken('');
    useAgentStore.setState({
      bridgeUrl: '',
      bridgeKind: 'unknown',
      sidecarPort: null,
      sidecarToken: '',
    });
  });

  it('fetches and parses bridge status over real HTTP, forwarding the bearer token', async () => {
    const base = await startStatusServer({
      status: 'connected',
      bridge: 'native-sidecar',
      authRequired: true,
      connected: true,
      appName: 'CineCraft AI Studio',
    });

    const info = await fetchBridgeStatus(base, 'sidecar-token-1');
    expect(info).toEqual({
      status: 'connected',
      bridge: 'native-sidecar',
      authRequired: true,
      connected: true,
      appName: 'CineCraft AI Studio',
    });
    expect(seenAuth).toBe('Bearer sidecar-token-1');
  });

  it('throws loudly on transport failure and non-2xx status', async () => {
    await expect(fetchBridgeStatus('http://127.0.0.1:1/api/agent', '')).rejects.toThrow(
      /Bridge unreachable/
    );

    const base = await startStatusServer({ error: 'nope' }, 401);
    await expect(fetchBridgeStatus(base)).rejects.toThrow(/Bridge status 401/);
  });

  it('validates sidecar info instead of polling nowhere', () => {
    expect(resolveSidecarBase({ port: 43111, token: 'abc' })).toEqual({
      port: 43111,
      token: 'abc',
      baseUrl: 'http://127.0.0.1:43111/api/agent',
    });
    for (const bad of [
      { port: 0, token: 'abc' },
      { port: 99999, token: 'abc' },
      { port: '43111', token: 'abc' },
      { port: 43111, token: '' },
      { port: 43111, token: undefined },
    ]) {
      expect(() => resolveSidecarBase(bad as { port: unknown; token: unknown })).toThrow();
    }
  });

  it('discoverSidecar applies base+token+store on success, null on any failure', async () => {
    const ok = await discoverSidecar(async () => ({ port: 45222, token: 'tok-1' }));
    expect(ok?.baseUrl).toBe('http://127.0.0.1:45222/api/agent');
    expect(getAgentBridgeBase()).toBe('http://127.0.0.1:45222/api/agent');
    expect(getAgentBridgeToken()).toBe('tok-1');
    const state = useAgentStore.getState();
    expect(state.bridgeKind).toBe('native-sidecar');
    expect(state.sidecarPort).toBe(45222);
    expect(state.sidecarToken).toBe('tok-1');

    expect(await discoverSidecar(null)).toBeNull();
    expect(await discoverSidecar(async () => { throw new Error('ipc down'); })).toBeNull();
    expect(await discoverSidecar(async () => ({ port: 'bad', token: 'x' }))).toBeNull();
    expect(await discoverSidecar(async () => null)).toBeNull();
  });
});
