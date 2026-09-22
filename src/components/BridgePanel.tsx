import React from 'react';
import { Plug, Copy, Check, RefreshCw } from 'lucide-react';
import { useAgentStore } from '../store/agentStore';
import { fetchBridgeStatus, BridgeStatusInfo } from '../services/agentBridge';

type StatusState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; info: BridgeStatusInfo }
  | { state: 'failed'; error: string };

/**
 * Bridge Connection panel (R23.4).
 *
 * Shows how external IDE/LLM callers reach this app: dev middleware URL,
 * native sidecar port + token, or an explicit unavailable state. Copy
 * buttons hand the IDE its connection JSON; Refresh probes `/status` live.
 * All data comes from the agent store — this panel never invents endpoints.
 */
export const BridgePanel: React.FC = () => {
  const bridgeKind = useAgentStore((s) => s.bridgeKind);
  const bridgeUrl = useAgentStore((s) => s.bridgeUrl);
  const bridgeAvailability = useAgentStore((s) => s.bridgeAvailability);
  const isConnected = useAgentStore((s) => s.isConnected);
  const sidecarPort = useAgentStore((s) => s.sidecarPort);
  const sidecarToken = useAgentStore((s) => s.sidecarToken);

  const [status, setStatus] = React.useState<StatusState>({ state: 'idle' });
  const [copied, setCopied] = React.useState(false);

  const token = bridgeKind === 'native-sidecar' ? sidecarToken : '';

  const handleRefresh = async () => {
    setStatus({ state: 'checking' });
    try {
      const info = await fetchBridgeStatus();
      setStatus({ state: 'ok', info });
    } catch (err) {
      setStatus({ state: 'failed', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleCopy = async (text: string) => {
    try {
      const clipboard = (navigator as unknown as { clipboard?: { writeText: (t: string) => Promise<void> } })
        .clipboard;
      if (!clipboard) {
        return;
      }
      await clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (permissions, insecure context) — user copies manually
    }
  };

  const connectJson = JSON.stringify(
    { url: bridgeUrl || undefined, ...(token ? { token } : {}) },
    null,
    2
  );

  const kindLabel =
    bridgeKind === 'native-sidecar'
      ? 'native-sidecar'
      : bridgeKind === 'dev-middleware'
        ? 'dev-middleware'
        : bridgeAvailability === 'unavailable-in-production'
          ? 'unavailable'
          : 'unknown';

  return (
    <div className="p-2.5 rounded-panel bg-dark-900 border border-neutral-800 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <Plug className="w-3.5 h-3.5 text-indigo-accent" />
          <span className="text-[11px] font-semibold text-neutral-200">Bridge Connection</span>
        </div>
        <span
          data-testid="bridge-kind"
          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase tracking-wider ${
            kindLabel === 'native-sidecar' || kindLabel === 'dev-middleware'
              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
              : kindLabel === 'unavailable'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
          }`}
        >
          {kindLabel}
        </span>
      </div>

      <div className="font-mono text-[10px] text-neutral-400 break-all" title={bridgeUrl}>
        {bridgeUrl || 'no bridge URL configured'}
      </div>

      {bridgeKind === 'native-sidecar' && (
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="bg-dark-950 rounded border border-neutral-800/80 px-2 py-1.5">
            <div className="text-neutral-500 uppercase tracking-wider text-[9px]">Port</div>
            <div className="font-mono text-neutral-200" data-testid="bridge-port">
              {sidecarPort ?? '—'}
            </div>
          </div>
          <div className="bg-dark-950 rounded border border-neutral-800/80 px-2 py-1.5">
            <div className="text-neutral-500 uppercase tracking-wider text-[9px]">Token</div>
            <div className="font-mono text-neutral-200 truncate" title={sidecarToken} data-testid="bridge-token">
              {sidecarToken ? `${sidecarToken.slice(0, 8)}…` : '—'}
            </div>
          </div>
        </div>
      )}

      {kindLabel === 'unavailable' && (
        <p className="text-[11px] text-amber-300/90">
          Production build has no agent transport. Run <span className="font-mono">npm run dev</span> for
          IDE access, or ship the native sidecar.
        </p>
      )}

      <div className="flex items-center space-x-1.5">
        <button
          onClick={() => void handleCopy(connectJson)}
          className="px-2 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-md text-[10px] font-medium flex items-center space-x-1 transition-all"
          title="Copy IDE connection JSON"
        >
          {copied ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy connect JSON'}</span>
        </button>
        <button
          onClick={() => void handleRefresh()}
          disabled={status.state === 'checking'}
          className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md text-[10px] font-medium flex items-center space-x-1 transition-all disabled:opacity-50"
          title="Probe bridge /status now"
        >
          <RefreshCw className={`w-3 h-3 ${status.state === 'checking' ? 'animate-spin' : ''}`} />
          <span>Refresh status</span>
        </button>
        {isConnected && (
          <span className="text-[10px] font-mono text-emerald-400 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>live</span>
          </span>
        )}
      </div>

      {status.state === 'ok' && (
        <p className="font-mono text-[10px] text-teal-300" data-testid="bridge-probe-ok">
          {status.info.bridge} · {status.info.status} · auth {status.info.authRequired ? 'required' : 'open'}
        </p>
      )}
      {status.state === 'failed' && (
        <p className="font-mono text-[10px] text-rose-400 break-words" data-testid="bridge-probe-error">
          {status.error}
        </p>
      )}
    </div>
  );
};
