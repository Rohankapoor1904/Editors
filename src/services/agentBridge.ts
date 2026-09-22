import { useTimelineStore } from '../store/timelineStore';
import { agentOrchestrator } from './agentOrchestrator';
import { globalToolRegistry } from './tools/registry';
import { CompoundCommand } from '../core/commands/transaction';
import { SetMetadataCommand } from '../core/commands/storeCommands';
import { UpdateClipEffectCommand } from '../core/commands/edits';
import { getCaptionWordsForClip } from '../engine/captions/clipCaptions';
import { Clip } from '../types/timeline';
import { useAgentStore } from '../store/agentStore';

export const DEFAULT_AGENT_BRIDGE_BASE = 'http://localhost:3000/api/agent';

const BRIDGE_URL_STORAGE_KEY = 'cinecraft.bridge.url';
const BRIDGE_TOKEN_STORAGE_KEY = 'cinecraft.bridge.token';

export type BridgeAvailability = 'dev-middleware' | 'unavailable-in-production';

/**
 * Normalizes a bridge base URL. Throws on non-HTTP(S) values so a
 * misconfigured IDE endpoint fails loudly instead of silently polling nowhere.
 */
export function normalizeBridgeBaseUrl(url: string): string {
  const trimmed = (url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/.+/.test(trimmed)) {
    throw new Error(`Invalid agent bridge URL: "${url}" (expected http:// or https://)`);
  }
  return trimmed;
}

/**
 * Pure helper so tests do not depend on bundler env.
 * The bridge middleware only ships inside the Vite dev server (R21.1 / ADR-008),
 * so any non-dev build is explicitly unavailable.
 */
export function resolveBridgeAvailability(isDev: boolean): BridgeAvailability {
  return isDev ? 'dev-middleware' : 'unavailable-in-production';
}

function readStored(key: string): string {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) || '' : '';
  } catch {
    return '';
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable (e.g. tests) — keep in-memory only
  }
}

let agentBridgeBase = (() => {
  try {
    const fromEnv =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AGENT_BRIDGE_URL) ||
      '';
    const stored = readStored(BRIDGE_URL_STORAGE_KEY);
    return normalizeBridgeBaseUrl(fromEnv || stored || DEFAULT_AGENT_BRIDGE_BASE);
  } catch {
    return DEFAULT_AGENT_BRIDGE_BASE;
  }
})();

let agentBridgeToken = (() => {
  try {
    const fromEnv =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AGENT_BRIDGE_TOKEN) ||
      '';
    return fromEnv || readStored(BRIDGE_TOKEN_STORAGE_KEY);
  } catch {
    return '';
  }
})();

export function getAgentBridgeBase(): string {
  return agentBridgeBase;
}

export function setAgentBridgeBase(url: string): string {
  agentBridgeBase = normalizeBridgeBaseUrl(url);
  writeStored(BRIDGE_URL_STORAGE_KEY, agentBridgeBase);
  return agentBridgeBase;
}

export function getAgentBridgeToken(): string {
  return agentBridgeToken;
}

export function setAgentBridgeToken(token: string): string {
  agentBridgeToken = (token || '').trim();
  writeStored(BRIDGE_TOKEN_STORAGE_KEY, agentBridgeToken);
  return agentBridgeToken;
}

export function getBridgeAvailability(): BridgeAvailability {
  try {
    const isDev =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, boolean | undefined> }).env?.DEV) === true;
    return resolveBridgeAvailability(isDev);
  } catch {
    return 'unavailable-in-production';
  }
}

export function buildBridgeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (agentBridgeToken) {
    headers['Authorization'] = `Bearer ${agentBridgeToken}`;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// R23.1: native sidecar transport (ADR-009).
// The production sidecar speaks the exact dev-plugin protocol; only the base
// URL discovery differs (Tauri `get_bridge_info` invoke -> 127.0.0.1:port).
// ---------------------------------------------------------------------------

export interface BridgeStatusInfo {
  status: string;
  bridge: string;
  authRequired: boolean;
  connected: boolean;
  appName?: string;
}

export interface SidecarInfo {
  port: number;
  token: string;
  baseUrl: string;
}

type FetchImpl = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Fetches `/status` from any bridge base URL (dev middleware or native
 * sidecar). Throws on transport failure or non-2xx — callers decide fallback.
 */
export async function fetchBridgeStatus(
  baseUrl: string = getAgentBridgeBase(),
  token: string = getAgentBridgeToken(),
  fetchImpl: FetchImpl = fetch as unknown as FetchImpl
): Promise<BridgeStatusInfo> {
  const base = normalizeBridgeBaseUrl(baseUrl);
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetchImpl(`${base}/status`, { headers });
  } catch (err: unknown) {
    throw new Error(`Bridge unreachable at ${base}: ${(err as Error)?.message || String(err)}`);
  }
  if (!res.ok) {
    throw new Error(`Bridge status ${res.status} from ${base}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    status: typeof data.status === 'string' ? data.status : 'unknown',
    bridge: typeof data.bridge === 'string' ? data.bridge : 'unknown',
    authRequired: data.authRequired === true,
    connected: data.connected === true,
    appName: typeof data.appName === 'string' ? data.appName : undefined,
  };
}

/**
 * Validates raw sidecar info and derives its base URL. Throws loudly on
 * malformed data so a broken host response can never become a silent poll
 * to nowhere.
 */
export function resolveSidecarBase(info: { port: unknown; token: unknown }): SidecarInfo {
  if (
    typeof info.port !== 'number' ||
    !Number.isInteger(info.port) ||
    info.port < 1 ||
    info.port > 65535
  ) {
    throw new Error(`Invalid sidecar port: ${JSON.stringify(info.port)}`);
  }
  if (typeof info.token !== 'string' || info.token.length === 0) {
    throw new Error('Invalid sidecar token: expected a non-empty string');
  }
  return {
    port: info.port,
    token: info.token,
    baseUrl: `http://127.0.0.1:${info.port}/api/agent`,
  };
}

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function defaultTauriInvoke(): TauriInvoke | null {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      return (window as unknown as { __TAURI_INTERNALS__: { invoke: TauriInvoke } })
        .__TAURI_INTERNALS__.invoke;
    }
  } catch {
    // no Tauri host
  }
  return null;
}

/**
 * Discovers the native sidecar on a Tauri host via `get_bridge_info`.
 * Applies base URL + token on success (the sidecar is authoritative on
 * desktop) and publishes to the agent store. Returns `null` on any failure
 * — discovery must degrade to the dev default, never throw into startup.
 */
export async function discoverSidecar(tauriInvoke?: TauriInvoke | null): Promise<SidecarInfo | null> {
  const invoke = tauriInvoke === undefined ? defaultTauriInvoke() : tauriInvoke;
  if (!invoke) return null;

  try {
    const raw = (await invoke('get_bridge_info')) as { port: unknown; token: unknown };
    if (!raw || typeof raw !== 'object') return null;
    const info = resolveSidecarBase(raw);
    setAgentBridgeBase(info.baseUrl);
    setAgentBridgeToken(info.token);
    try {
      useAgentStore.getState().setBridgeUrl(info.baseUrl);
      useAgentStore.getState().setSidecarInfo(info.port, info.token);
      useAgentStore.getState().setBridgeKind('native-sidecar');
    } catch {
      // store unavailable in some test contexts
    }
    return info;
  } catch {
    return null;
  }
}

class AgentBridgeClient {
  private isRunning = false;
  private connected = false;
  private pollInterval: any = null;
  private heartbeatInterval: any = null;

  public isConnected(): boolean {
    return this.connected;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      useAgentStore.getState().setBridgeUrl(getAgentBridgeBase());
      useAgentStore.getState().setBridgeAvailability(getBridgeAvailability());
      useAgentStore.getState().setBridgeKind(
        getBridgeAvailability() === 'dev-middleware' ? 'dev-middleware' : 'unknown'
      );
    } catch {
      // store unavailable in some test contexts — polling still works
    }

    // Native sidecar (production): discover port+token, then heartbeat/poll
    // against it with the exact dev protocol. Fire-and-forget on purpose:
    // discoverSidecar() never rejects; failure degrades to the dev default.
    void discoverSidecar();

    // Start heartbeat
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 2000);

    // Start polling for agent commands
    this.pollLoop();
  }

  public stop() {
    this.isRunning = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.pollInterval) clearTimeout(this.pollInterval);
  }

  private getSnapshot() {
    const state = useTimelineStore.getState();
    return {
      activeWorkspace: state.activeWorkspace,
      metadata: state.metadata,
      playhead: state.playheadPosition,
      tracksCount: state.tracks.length,
      clipsCount: state.tracks.reduce((acc, t) => acc + t.clips.length, 0),
      selectedClipIds: state.selectedClipIds,
      timeline: {
        tracks: state.tracks.map(t => ({
          id: t.id,
          name: t.name,
          type: t.type,
          clips: t.clips.map(c => ({
            id: c.id,
            name: c.name,
            startOffset: c.startOffset,
            duration: c.duration,
            sourceIn: c.sourceIn,
            sourceOut: c.sourceOut,
            effects: c.effects,
          }))
        }))
      }
    };
  }

  private async sendHeartbeat() {
    try {
      const snapshot = this.getSnapshot();

      const res = await fetch(`${getAgentBridgeBase()}/heartbeat`, {
        method: 'POST',
        headers: buildBridgeHeaders(),
        body: JSON.stringify(snapshot),
      });

      if (res.ok) {
        this.connected = true;
        useAgentStore.getState().setConnected(true);
        try {
          useAgentStore.getState().setBridgeAvailability('dev-middleware');
        } catch {
          // ignore store failures in tests
        }
      }
    } catch {
      this.connected = false;
      try {
        useAgentStore.getState().setConnected(false);
        if (getBridgeAvailability() === 'unavailable-in-production') {
          useAgentStore.getState().setBridgeAvailability('unavailable-in-production');
        }
      } catch {
        // ignore store failures in tests
      }
    }
  }

  private async pollLoop() {
    if (!this.isRunning) return;

    try {
      const res = await fetch(`${getAgentBridgeBase()}/pending`, {
        headers: buildBridgeHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tasks) && data.tasks.length > 0) {
          for (const task of data.tasks) {
            await this.handleTask(task);
          }
        }
      }
    } catch {
      // Ignored during server restart / offline
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollInterval = setTimeout(() => this.pollLoop(), 350);
    }
  }

  private async handleTask(task: { id: string; type: string; payload: any }) {
    let currentTaskId: string | null = null;
    try {
      let result: any = null;

      if (task.type === 'connect') {
        const modelName = task.payload.model || task.payload.agent || 'External Agent';
        useAgentStore.getState().setActiveModel(modelName);
        useAgentStore.getState().setConnected(true);
        result = { connected: true, model: modelName };
      } else if (task.type === 'prompt') {
        const { prompt, model } = task.payload;
        if (model) {
          useAgentStore.getState().setActiveModel(model);
        }

        currentTaskId = useAgentStore.getState().startTask({
          source: 'bridge',
          prompt,
        });
        useAgentStore.getState().updateTaskStep(currentTaskId, 0, 'Analyzing agent prompt...');
        useAgentStore.getState().addTaskLog(currentTaskId, { type: 'user', message: prompt });

        const logs: string[] = [];
        const commands = await agentOrchestrator.processPrompt(prompt, (log) => {
          logs.push(`[${log.type}] ${log.message}`);
          if (currentTaskId) {
            useAgentStore.getState().addTaskLog(currentTaskId, {
              type: log.type,
              message: log.message,
            });
            if (log.type === 'thought') {
              useAgentStore.getState().updateTaskStep(currentTaskId, 1, 'Reasoning & Planning...');
            } else if (log.type === 'tool') {
              useAgentStore.getState().updateTaskStep(currentTaskId, 2, 'Executing edits on timeline...');
            } else if (log.type === 'response') {
              useAgentStore.getState().updateTaskStep(currentTaskId, 3, 'Arranging timeline...');
            }
          }
        });

        if (commands && commands.length > 0) {
          const compound = new CompoundCommand(commands);
          useTimelineStore.getState().executeCommand(compound);

          useAgentStore.getState().addActionDiff({
            id: `diff-${Date.now()}`,
            type: prompt.includes('silence') ? 'cut' : prompt.includes('color') ? 'color' : 'subtitle',
            title: `Agent Action: ${prompt.slice(0, 24)}...`,
            description: `Applied ${commands.length} edits via agent bridge`,
            changeType: 'modified',
            timestamp: 'Just now',
            status: 'accepted',
            command: compound,
          });
        }

        if (currentTaskId) {
          useAgentStore.getState().completeTask(currentTaskId, commands.length);
        }

        result = {
          prompt,
          commandsCount: commands.length,
          logs,
          timeline: {
            tracks: useTimelineStore.getState().tracks.map(t => ({
              id: t.id,
              name: t.name,
              type: t.type,
              clipsCount: t.clips.length,
            }))
          }
        };
      } else if (task.type === 'tool') {
        const { tool, args, model } = task.payload;
        if (model) {
          useAgentStore.getState().setActiveModel(model);
        }

        currentTaskId = useAgentStore.getState().startTask({
          source: 'bridge',
          tool: `${tool}(${JSON.stringify(args || {})})`,
        });
        useAgentStore.getState().updateTaskStep(currentTaskId, 2, `Executing tool: ${tool}`);
        useAgentStore.getState().addTaskLog(currentTaskId, {
          type: 'tool',
          message: `Executing tool ${tool} with args: ${JSON.stringify(args || {})}`,
        });

        const toolResult = await globalToolRegistry.execute(tool, args);

        let cmdCount = 0;
        if (toolResult && typeof (toolResult as any).apply === 'function') {
          useTimelineStore.getState().executeCommand(toolResult as any);
          cmdCount = 1;
        } else if (Array.isArray(toolResult) && toolResult.every(r => r && typeof r.apply === 'function')) {
          useTimelineStore.getState().executeCommand(new CompoundCommand(toolResult));
          cmdCount = toolResult.length;
        } else if (toolResult && Array.isArray((toolResult as any).commands) && (toolResult as any).commands.length > 0) {
          useTimelineStore.getState().executeCommand(new CompoundCommand((toolResult as any).commands));
          cmdCount = (toolResult as any).commands.length;
        }

        if (cmdCount > 0) {
          useAgentStore.getState().addActionDiff({
            id: `diff-${Date.now()}`,
            type: tool.includes('cut') || tool.includes('silence') ? 'cut' : tool.includes('color') ? 'color' : 'subtitle',
            title: `Tool: ${tool}`,
            description: `Applied ${cmdCount} edits via ${tool}`,
            changeType: 'modified',
            timestamp: 'Just now',
            status: 'accepted',
          });
        }

        if (currentTaskId) {
          useAgentStore.getState().addTaskLog(currentTaskId, {
            type: 'response',
            message: `Tool ${tool} completed successfully.`,
          });
          useAgentStore.getState().completeTask(currentTaskId, cmdCount);
        }

        result = {
          tool,
          toolResult: toolResult && (toolResult as any).error ? toolResult : 'Executed successfully',
        };
      } else if (task.type === 'action') {
        const payload = task.payload;
        if (payload.model) {
          useAgentStore.getState().setActiveModel(payload.model);
        }

        currentTaskId = useAgentStore.getState().startTask({
          source: 'bridge',
          tool: `Action: ${payload.action}`,
        });
        useAgentStore.getState().updateTaskStep(currentTaskId, 2, `Executing action: ${payload.action}`);
        useAgentStore.getState().addTaskLog(currentTaskId, {
          type: 'tool',
          message: `Action requested: ${payload.action}`,
        });

        const store = useTimelineStore.getState();

        switch (payload.action) {
          case 'set_workspace':
            store.setWorkspace(payload.workspace);
            result = { workspace: payload.workspace };
            break;

          case 'undo':
            store.undo();
            result = { undone: true };
            break;

          case 'redo':
            store.redo();
            result = { redone: true };
            break;

          case 'seek': {
            const fps = store.metadata.fps || 60;
            const targetSec = typeof payload.seconds === 'number' ? payload.seconds : 0;
            store.setPlayheadPosition({ value: Math.round(targetSec * fps), rate: fps });
            result = { playhead: store.playheadPosition, seconds: targetSec };
            break;
          }

          case 'add_sample_clip': {
            const track = store.tracks[0];
            if (track) {
              const sampleClip: Clip = {
                id: `sample-${Date.now()}`,
                name: payload.name || 'RAW_Cinema_Take_4K.mov',
                assetId: 'sample-asset-1',
                startOffset: { value: 0, rate: 1 },
                duration: { value: payload.duration || 30, rate: 1 },
                sourceIn: { value: 0, rate: 1 },
                sourceOut: { value: payload.duration || 30, rate: 1 },
                volume: 0,
                pan: 0,
                muted: false,
              };
              store.addClipToTrack(track.id, sampleClip);
              result = { addedClip: sampleClip };
            } else {
              result = { error: 'No video track found' };
            }
            break;
          }

          case 'add_captions': {
            const targetClip = payload.clipId
              ? store.tracks.flatMap((t) => t.clips).find((c) => c.id === payload.clipId)
              : store.tracks.flatMap((t) => t.clips)[0];

            if (!targetClip) {
              result = { error: 'No video clip found on timeline' };
              break;
            }

            const words = payload.words || getCaptionWordsForClip(targetClip);
            const preset = payload.preset || 'hormozi';

            store.executeCommand(
              new UpdateClipEffectCommand(targetClip.id, 'caption_overlay', 'caption', {
                preset,
                words,
                enabled: true,
              })
            );

            useAgentStore.getState().addActionDiff({
              id: `diff-${Date.now()}`,
              type: 'subtitle',
              title: `Agent Captions (${preset})`,
              description: `Added ${words.length} animated words to "${targetClip.name}"`,
              changeType: 'added',
              timestamp: 'Just now',
              status: 'accepted',
            });

            result = {
              success: true,
              clipId: targetClip.id,
              wordsCount: words.length,
              preset,
            };
            break;
          }

          case 'set_aspect_ratio': {
            const width = payload.width || 1080;
            const height = payload.height || 1080;
            store.executeCommand(new SetMetadataCommand({ width, height }));
            result = { width, height };
            break;
          }

          default:
            result = { error: `Unknown action: ${payload.action}` };
        }

        if (currentTaskId) {
          useAgentStore.getState().addTaskLog(currentTaskId, {
            type: 'response',
            message: `Action ${payload.action} executed.`,
          });
          useAgentStore.getState().completeTask(currentTaskId, 1);
        }
      }

      // Report result and fresh state snapshot back to server
      await fetch(`${getAgentBridgeBase()}/result`, {
        method: 'POST',
        headers: buildBridgeHeaders(),
        body: JSON.stringify({ id: task.id, result, state: this.getSnapshot() }),
      });
    } catch (err: any) {
      if (currentTaskId) {
        useAgentStore.getState().failTask(currentTaskId, err.message || String(err));
      }
      await fetch(`${getAgentBridgeBase()}/result`, {
        method: 'POST',
        headers: buildBridgeHeaders(),
        body: JSON.stringify({ id: task.id, error: err.message || String(err), state: this.getSnapshot() }),
      });
    }
  }
}

export const agentBridge = new AgentBridgeClient();
