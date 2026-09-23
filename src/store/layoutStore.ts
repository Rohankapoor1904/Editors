import { create } from 'zustand';

export type MonitorViewMode = 'single' | 'dual';

export interface LayoutState {
  leftPanelWidth: number;
  leftPanelCollapsed: boolean;
  rightPanelWidth: number;
  rightPanelCollapsed: boolean;
  timelineHeight: number;
  timelineCollapsed: boolean;
  monitorViewMode: MonitorViewMode;
  sourceMonitorRatio: number;

  setLeftPanelWidth: (width: number) => void;
  resizeLeftPanel: (delta: number) => void;
  toggleLeftPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  resizeRightPanel: (delta: number) => void;
  toggleRightPanel: () => void;
  setTimelineHeight: (height: number) => void;
  resizeTimeline: (delta: number) => void;
  toggleTimeline: () => void;
  setMonitorViewMode: (mode: MonitorViewMode) => void;
  toggleMonitorViewMode: () => void;
  setSourceMonitorRatio: (ratio: number) => void;
  resizeMonitorRatio: (deltaRatio: number) => void;
  /**
   * Re-clamps saved panel widths to the current viewport so a layout
   * persisted on a big monitor never crushes the center on a smaller
   * window / new tab. No-op when everything already fits.
   */
  clampPanelsToViewport: () => void;
  resetLayout: () => void;
}

const STORAGE_KEY = 'cinecraft_layout_v1';

const defaultLayout: {
  leftPanelWidth: number;
  leftPanelCollapsed: boolean;
  rightPanelWidth: number;
  rightPanelCollapsed: boolean;
  timelineHeight: number;
  timelineCollapsed: boolean;
  monitorViewMode: MonitorViewMode;
  sourceMonitorRatio: number;
} = {
  leftPanelWidth: 280,
  leftPanelCollapsed: false,
  rightPanelWidth: 340,
  rightPanelCollapsed: false,
  timelineHeight: 280,
  timelineCollapsed: false,
  monitorViewMode: 'single',
  sourceMonitorRatio: 0.5,
};

/** Minimum center width we refuse to crush (monitors + splitters). */
export const MIN_CENTER_WIDTH = 320;

/** Absolute panel minimums (match the store clamps below). */
export const MIN_LEFT_WIDTH = 180;
export const MIN_RIGHT_WIDTH = 240;

export function clampWidthsToViewport(
  leftPanelWidth: number,
  rightPanelWidth: number,
  viewportWidth: number
): { leftPanelWidth: number; rightPanelWidth: number } {
  let left = Math.max(MIN_LEFT_WIDTH, Math.min(leftPanelWidth, 600));
  let right = Math.max(MIN_RIGHT_WIDTH, Math.min(rightPanelWidth, 650));
  const budget = viewportWidth - MIN_CENTER_WIDTH;
  if (left + right > budget) {
    // Shrink the right panel first (it hosts the densest tab bar),
    // then the left, then scale both proportionally as a last resort.
    right = Math.max(MIN_RIGHT_WIDTH, budget - left);
    left = Math.max(MIN_LEFT_WIDTH, budget - right);
    if (left + right > budget && budget > 0) {
      const scale = budget / (left + right);
      left = Math.floor(left * scale);
      right = Math.floor(right * scale);
    }
  }
  return { leftPanelWidth: left, rightPanelWidth: right };
}

const loadInitialState = () => {
  if (typeof window === 'undefined') return defaultLayout;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLayout;
    const parsed = JSON.parse(raw);
    const merged = {
      ...defaultLayout,
      ...parsed,
    };
    // New tab / smaller window with stale widths: clamp before first paint.
    const clamped = clampWidthsToViewport(
      merged.leftPanelWidth,
      merged.rightPanelWidth,
      window.innerWidth
    );
    return { ...merged, ...clamped };
  } catch {
    return defaultLayout;
  }
};

const persistState = (state: Partial<LayoutState>) => {
  if (typeof window === 'undefined') return;
  try {
    const dataToSave = {
      leftPanelWidth: state.leftPanelWidth,
      leftPanelCollapsed: state.leftPanelCollapsed,
      rightPanelWidth: state.rightPanelWidth,
      rightPanelCollapsed: state.rightPanelCollapsed,
      timelineHeight: state.timelineHeight,
      timelineCollapsed: state.timelineCollapsed,
      monitorViewMode: state.monitorViewMode,
      sourceMonitorRatio: state.sourceMonitorRatio,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  } catch {
    // Ignore persistence errors
  }
};

export const useLayoutStore = create<LayoutState>((set) => ({
  ...loadInitialState(),

  setLeftPanelWidth: (width) =>
    set((state) => {
      const clamped = Math.max(180, Math.min(width, 600));
      const next = { ...state, leftPanelWidth: clamped, leftPanelCollapsed: false };
      persistState(next);
      return next;
    }),

  resizeLeftPanel: (delta) =>
    set((state) => {
      const clamped = Math.max(180, Math.min(state.leftPanelWidth + delta, 600));
      const next = { ...state, leftPanelWidth: clamped, leftPanelCollapsed: false };
      persistState(next);
      return next;
    }),

  toggleLeftPanel: () =>
    set((state) => {
      const next = { ...state, leftPanelCollapsed: !state.leftPanelCollapsed };
      persistState(next);
      return next;
    }),

  setRightPanelWidth: (width) =>
    set((state) => {
      const clamped = Math.max(240, Math.min(width, 650));
      const next = { ...state, rightPanelWidth: clamped, rightPanelCollapsed: false };
      persistState(next);
      return next;
    }),

  resizeRightPanel: (delta) =>
    set((state) => {
      const clamped = Math.max(240, Math.min(state.rightPanelWidth - delta, 650));
      const next = { ...state, rightPanelWidth: clamped, rightPanelCollapsed: false };
      persistState(next);
      return next;
    }),

  toggleRightPanel: () =>
    set((state) => {
      const next = { ...state, rightPanelCollapsed: !state.rightPanelCollapsed };
      persistState(next);
      return next;
    }),

  setTimelineHeight: (height) =>
    set((state) => {
      const clamped = Math.max(140, Math.min(height, 600));
      const next = { ...state, timelineHeight: clamped, timelineCollapsed: false };
      persistState(next);
      return next;
    }),

  resizeTimeline: (delta) =>
    set((state) => {
      const clamped = Math.max(140, Math.min(state.timelineHeight - delta, 600));
      const next = { ...state, timelineHeight: clamped, timelineCollapsed: false };
      persistState(next);
      return next;
    }),

  toggleTimeline: () =>
    set((state) => {
      const next = { ...state, timelineCollapsed: !state.timelineCollapsed };
      persistState(next);
      return next;
    }),

  setMonitorViewMode: (mode) =>
    set((state) => {
      const next = { ...state, monitorViewMode: mode };
      persistState(next);
      return next;
    }),

  toggleMonitorViewMode: () =>
    set((state) => {
      const nextMode: MonitorViewMode = state.monitorViewMode === 'single' ? 'dual' : 'single';
      const next = {
        ...state,
        monitorViewMode: nextMode,
      };
      persistState(next);
      return next;
    }),

  setSourceMonitorRatio: (ratio) =>
    set((state) => {
      const clamped = Math.max(0.2, Math.min(ratio, 0.8));
      const next = { ...state, sourceMonitorRatio: clamped };
      persistState(next);
      return next;
    }),

  resizeMonitorRatio: (deltaRatio) =>
    set((state) => {
      const clamped = Math.max(0.2, Math.min(state.sourceMonitorRatio + deltaRatio, 0.8));
      const next = { ...state, sourceMonitorRatio: clamped };
      persistState(next);
      return next;
    }),

  clampPanelsToViewport: () =>
    set((state) => {
      if (typeof window === 'undefined') return state;
      const clamped = clampWidthsToViewport(
        state.leftPanelWidth,
        state.rightPanelWidth,
        window.innerWidth
      );
      if (
        clamped.leftPanelWidth === state.leftPanelWidth &&
        clamped.rightPanelWidth === state.rightPanelWidth
      ) {
        return state;
      }
      const next = { ...state, ...clamped };
      persistState(next);
      return next;
    }),

  resetLayout: () =>
    set(() => {
      persistState(defaultLayout);
      return { ...defaultLayout };
    }),
}));
