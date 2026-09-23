import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clampWidthsToViewport,
  MIN_CENTER_WIDTH,
  MIN_LEFT_WIDTH,
  MIN_RIGHT_WIDTH,
  useLayoutStore,
} from '../layoutStore';

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe('layout viewport clamp (resize + new-tab UI)', () => {
  const realInnerWidth = window.innerWidth;

  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    setViewportWidth(realInnerWidth);
    localStorage.clear();
    vi.resetModules();
  });

  it('leaves fitting widths untouched', () => {
    const out = clampWidthsToViewport(280, 340, 1600);
    expect(out).toEqual({ leftPanelWidth: 280, rightPanelWidth: 340 });
  });

  it('shrinks the right panel first, never below its minimum', () => {
    // Budget = 1000 - 320 = 680; 280 + 650 = 930 > 680 → right gives way.
    const out = clampWidthsToViewport(280, 650, 1000);
    expect(out.leftPanelWidth).toBe(280);
    expect(out.rightPanelWidth).toBe(680 - 280);
    expect(out.rightPanelWidth).toBeGreaterThanOrEqual(MIN_RIGHT_WIDTH);
  });

  it('never crushes the center below MIN_CENTER_WIDTH', () => {
    for (const viewport of [1600, 1400, 1000, 800, 640]) {
      const out = clampWidthsToViewport(600, 650, viewport);
      // Panels always leave room for the center, scaling below minimums
      // on tiny viewports rather than hiding the monitors.
      expect(out.leftPanelWidth + out.rightPanelWidth).toBeLessThanOrEqual(
        viewport - MIN_CENTER_WIDTH
      );
    }
  });

  it('clampPanelsToViewport re-clamps live state on window resize', () => {
    setViewportWidth(1600);
    useLayoutStore.setState({ leftPanelWidth: 600, rightPanelWidth: 650 });
    setViewportWidth(1000);
    useLayoutStore.getState().clampPanelsToViewport();
    const { leftPanelWidth, rightPanelWidth } = useLayoutStore.getState();
    expect(leftPanelWidth + rightPanelWidth).toBeLessThanOrEqual(1000 - MIN_CENTER_WIDTH);
    expect(leftPanelWidth).toBeGreaterThanOrEqual(MIN_LEFT_WIDTH);
    expect(rightPanelWidth).toBeGreaterThanOrEqual(MIN_RIGHT_WIDTH);
  });

  it('fresh load clamps stale localStorage widths (new-tab scenario)', async () => {
    // Simulate: widths saved on a big monitor, new tab opened at 1100px.
    localStorage.setItem(
      'cinecraft_layout_v1',
      JSON.stringify({ leftPanelWidth: 600, rightPanelWidth: 650 })
    );
    setViewportWidth(1100);
    const fresh = await import('../layoutStore');
    const state = fresh.useLayoutStore.getState();
    expect(state.leftPanelWidth + state.rightPanelWidth).toBeLessThanOrEqual(
      1100 - MIN_CENTER_WIDTH
    );
  });
});
