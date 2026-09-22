import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_AGENT_BRIDGE_BASE,
  normalizeBridgeBaseUrl,
  resolveBridgeAvailability,
  getAgentBridgeBase,
  setAgentBridgeBase,
  setAgentBridgeToken,
  buildBridgeHeaders,
  getBridgeAvailability,
} from '../agentBridge';
import { useAgentStore } from '../../store/agentStore';

describe('R21.1: agent bridge connection config + honest production state', () => {
  beforeEach(() => {
    setAgentBridgeBase(DEFAULT_AGENT_BRIDGE_BASE);
    setAgentBridgeToken('');
    useAgentStore.setState({ isConnected: false, bridgeAvailability: 'unknown', bridgeUrl: '' });
  });

  it('keeps the localhost dev default for back-compat', () => {
    expect(DEFAULT_AGENT_BRIDGE_BASE).toBe('http://localhost:3000/api/agent');
    expect(getAgentBridgeBase()).toBe(DEFAULT_AGENT_BRIDGE_BASE);
  });

  it('accepts a configured URL and strips trailing slashes', () => {
    expect(setAgentBridgeBase('http://192.168.1.10:4000/api/agent///')).toBe(
      'http://192.168.1.10:4000/api/agent'
    );
    expect(getAgentBridgeBase()).toBe('http://192.168.1.10:4000/api/agent');
  });

  it('rejects non-HTTP(S) bridge URLs loudly', () => {
    expect(() => normalizeBridgeBaseUrl('ftp://host/api')).toThrow(/Invalid agent bridge URL/);
    expect(() => normalizeBridgeBaseUrl('')).toThrow(/Invalid agent bridge URL/);
    expect(() => setAgentBridgeBase('not-a-url')).toThrow(/Invalid agent bridge URL/);
  });

  it('sends a bearer token only when configured', () => {
    expect(buildBridgeHeaders()).toEqual({ 'Content-Type': 'application/json' });
    setAgentBridgeToken('secret-123');
    expect(buildBridgeHeaders()).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret-123',
    });
  });

  it('resolves availability explicitly: dev-middleware vs unavailable-in-production', () => {
    expect(resolveBridgeAvailability(true)).toBe('dev-middleware');
    expect(resolveBridgeAvailability(false)).toBe('unavailable-in-production');
    expect(['dev-middleware', 'unavailable-in-production']).toContain(getBridgeAvailability());
  });

  it('publishes bridge URL + availability to the agent store', () => {
    useAgentStore.getState().setBridgeUrl('http://localhost:3000/api/agent');
    useAgentStore.getState().setBridgeAvailability('unavailable-in-production');
    const state = useAgentStore.getState();
    expect(state.bridgeUrl).toBe('http://localhost:3000/api/agent');
    expect(state.bridgeAvailability).toBe('unavailable-in-production');
  });
});
