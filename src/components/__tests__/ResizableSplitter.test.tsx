import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ResizableSplitter } from '../layout/ResizableSplitter';
import { useLayoutStore } from '../../store/layoutStore';

describe('ResizableSplitter & LayoutStore', () => {
  beforeEach(() => {
    cleanup();
    useLayoutStore.getState().resetLayout();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders horizontal splitter with vertical separator role', () => {
    const onResize = vi.fn();
    render(<ResizableSplitter direction="horizontal" onResize={onResize} />);
    const separator = screen.getByRole('separator');
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('renders vertical splitter with horizontal separator role', () => {
    const onResize = vi.fn();
    render(<ResizableSplitter direction="vertical" onResize={onResize} />);
    const separator = screen.getByRole('separator');
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('handles mouse drag on horizontal splitter to invoke onResize', () => {
    const onResize = vi.fn();
    render(<ResizableSplitter direction="horizontal" onResize={onResize} />);
    const separator = screen.getByRole('separator');

    // Simulate drag from x=100 to x=150
    fireEvent.mouseDown(separator, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window);

    expect(onResize).toHaveBeenCalledWith(50);
  });

  it('handles mouse drag on vertical splitter to invoke onResize', () => {
    const onResize = vi.fn();
    render(<ResizableSplitter direction="vertical" onResize={onResize} />);
    const separator = screen.getByRole('separator');

    // Simulate drag from y=200 to y=170
    fireEvent.mouseDown(separator, { clientY: 200 });
    fireEvent.mouseMove(window, { clientY: 170 });
    fireEvent.mouseUp(window);

    expect(onResize).toHaveBeenCalledWith(-30);
  });

  it('triggers onCollapseToggle when collapse button is clicked', () => {
    const onResize = vi.fn();
    const onCollapseToggle = vi.fn();
    render(
      <ResizableSplitter
        direction="horizontal"
        onResize={onResize}
        onCollapseToggle={onCollapseToggle}
        isCollapsed={false}
      />
    );

    const button = screen.getByTitle('Collapse panel');
    fireEvent.click(button);
    expect(onCollapseToggle).toHaveBeenCalledTimes(1);
  });

  it('updates layoutStore widths, heights, and single/dual monitor mode cleanly', () => {
    const store = useLayoutStore.getState();
    expect(store.monitorViewMode).toBe('single');

    // Toggle monitor view mode
    store.toggleMonitorViewMode();
    expect(useLayoutStore.getState().monitorViewMode).toBe('dual');

    // Resize left panel
    store.setLeftPanelWidth(350);
    expect(useLayoutStore.getState().leftPanelWidth).toBe(350);

    // Resize right panel
    store.setRightPanelWidth(420);
    expect(useLayoutStore.getState().rightPanelWidth).toBe(420);

    // Resize timeline
    store.setTimelineHeight(320);
    expect(useLayoutStore.getState().timelineHeight).toBe(320);

    // Toggle panels
    store.toggleLeftPanel();
    expect(useLayoutStore.getState().leftPanelCollapsed).toBe(true);
    store.toggleRightPanel();
    expect(useLayoutStore.getState().rightPanelCollapsed).toBe(true);
  });
});
