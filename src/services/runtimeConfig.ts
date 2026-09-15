export type RuntimeMode = 'demo' | 'live';

export class NotImplementedError extends Error {
  constructor(featureName: string) {
    super(`[NotImplementedError]: "${featureName}" is not implemented in 'live' mode. Switch runtime mode to 'demo' to run stubbed behavior.`);
    this.name = 'NotImplementedError';
  }
}

let currentRuntimeMode: RuntimeMode = 'demo';
const modeListeners: Set<(mode: RuntimeMode) => void> = new Set();

export function getRuntimeMode(): RuntimeMode {
  return currentRuntimeMode;
}

export function setRuntimeMode(mode: RuntimeMode): void {
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
