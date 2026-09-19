export type RuntimeMode = 'demo' | 'live';

export class NotImplementedError extends Error {
  constructor(featureName: string) {
    super(`[NotImplementedError]: "${featureName}" is not implemented in 'live' mode. Switch runtime mode to 'demo' to run stubbed behavior.`);
    this.name = 'NotImplementedError';
  }
}

// INVARIANT: Default mode MUST ALWAYS be 'live' (Safe-by-default).
// Demo mode is strictly opt-in for visual UI previews.
let currentRuntimeMode: RuntimeMode = 'live';
const modeListeners: Set<(mode: RuntimeMode) => void> = new Set();

export function getRuntimeMode(): RuntimeMode {
  return currentRuntimeMode;
}

export function setRuntimeMode(mode: RuntimeMode): void {
  if (mode === 'demo' && !import.meta.env.DEV) {
    console.warn('[RuntimeConfig]: Demo mode is restricted to development environments.');
    return;
  }
  currentRuntimeMode = mode;
  modeListeners.forEach((listener) => listener(currentRuntimeMode));
}

export function subscribeRuntimeMode(listener: (mode: RuntimeMode) => void): () => void {
  modeListeners.add(listener);
  return () => {
    modeListeners.delete(listener);
  };
}

export function isLiveMode(): boolean {
  return currentRuntimeMode === 'live';
}

export function isDemoMode(): boolean {
  return currentRuntimeMode === 'demo';
}
