import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BridgePanel } from '../BridgePanel';
import { useAgentStore } from '../../store/agentStore';
import { setAgentBridgeBase, setAgentBridgeToken, DEFAULT_AGENT_BRIDGE_BASE } from '../../services/agentBridge';

function baseStore() {
  useAgentStore.setState({
    isConnected: false,
    activeModel: 'test-model',
    bridgeAvailability: 'unknown',
    bridgeUrl: '',
    bridgeKind: 'unknown',
    sidecarPort: null,
    sidecarToken: '',
    currentTask: null,
    taskHistory: [],
    actionDiffs: [],
    isProcessing: false,
  });
}

describe('R23.4: BridgePanel connection display', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    baseStore();
    setAgentBridgeBase(DEFAULT_AGENT_BRIDGE_BASE);
    setAgentBridgeToken('');
  });

  it('shows dev-middleware kind with the configured URL', () => {
    useAgentStore.setState({ bridgeKind: 'dev-middleware', bridgeUrl: DEFAULT_AGENT_BRIDGE_BASE });
    render(<BridgePanel />);
    expect(screen.getByTestId('bridge-kind')).toHaveTextContent('dev-middleware');
    expect(screen.getByText(DEFAULT_AGENT_BRIDGE_BASE)).toBeInTheDocument();
  });

  it('shows sidecar port and masked token, and copies connect JSON', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    useAgentStore.setState({
      bridgeKind: 'native-sidecar',
      bridgeUrl: 'http://127.0.0.1:45222/api/agent',
      sidecarPort: 45222,
      sidecarToken: 'tok-secret-1',
    });
    render(<BridgePanel />);

    expect(screen.getByTestId('bridge-kind')).toHaveTextContent('native-sidecar');
    expect(screen.getByTestId('bridge-port')).toHaveTextContent('45222');
    expect(screen.getByTestId('bridge-token')).toHaveTextContent('tok-secr');

    fireEvent.click(screen.getByText('Copy connect JSON'));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const copied = JSON.parse(writeText.mock.calls[0][0] as string);
    expect(copied).toEqual({
      url: 'http://127.0.0.1:45222/api/agent',
      token: 'tok-secret-1',
    });
  });

  it('shows explicit guidance when the bridge is unavailable', () => {
    useAgentStore.setState({ bridgeAvailability: 'unavailable-in-production' });
    render(<BridgePanel />);
    expect(screen.getByTestId('bridge-kind')).toHaveTextContent('unavailable');
    expect(screen.getByText(/npm run dev/i)).toBeInTheDocument();
  });

  it('refresh probes /status and reports success or failure honestly', async () => {
    useAgentStore.setState({ bridgeKind: 'dev-middleware', bridgeUrl: DEFAULT_AGENT_BRIDGE_BASE });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'connected',
          bridge: 'native-sidecar',
          authRequired: true,
          connected: true,
        }),
      })
    );
    const { unmount } = render(<BridgePanel />);
    fireEvent.click(screen.getByText('Refresh status'));
    await waitFor(() => {
      expect(screen.getByTestId('bridge-probe-ok')).toHaveTextContent('native-sidecar');
    });
    unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused'))
    );
    render(<BridgePanel />);
    fireEvent.click(screen.getByText('Refresh status'));
    await waitFor(() => {
      expect(screen.getByTestId('bridge-probe-error')).toHaveTextContent(/connection refused/);
    });
  });
});
