import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopBar } from './TopBar';
import * as timelineStore from '../store/timelineStore';

vi.mock('../store/timelineStore');

describe('TopBar component', () => {
  let mockSetWorkspace: ReturnType<typeof vi.fn>;
  let mockUndo: ReturnType<typeof vi.fn>;
  let mockRedo: ReturnType<typeof vi.fn>;
  let mockSplitClip: ReturnType<typeof vi.fn>;
  let mockSetZoomLevel: ReturnType<typeof vi.fn>;
  let mockToggleMagneticSnapping: ReturnType<typeof vi.fn>;
  let mockAddTrack: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSetWorkspace = vi.fn();
    mockUndo = vi.fn();
    mockRedo = vi.fn();
    mockSplitClip = vi.fn();
    mockSetZoomLevel = vi.fn();
    mockToggleMagneticSnapping = vi.fn();
    mockAddTrack = vi.fn();

    vi.mocked(timelineStore.useTimelineStore).mockReturnValue({
      activeWorkspace: 'edit',
      setWorkspace: mockSetWorkspace,
      magneticSnapping: true,
      toggleMagneticSnapping: mockToggleMagneticSnapping,
      metadata: { name: 'Test', width: 1920, height: 1080, fps: 60, sampleRate: 48000, colorSpace: 'Rec.709' },
      undo: mockUndo,
      redo: mockRedo,
      splitClip: mockSplitClip,
      selectedClipIds: ['clip_1'],
      playheadPosition: { value: 10, rate: 1 },
      setZoomLevel: mockSetZoomLevel,
      zoomLevel: 20,
      addTrack: mockAddTrack,
    } as any);
  });

  it('renders dropdown menus and can open and close them', () => {
    render(<TopBar />);

    // Check that menus are rendered
    expect(screen.getAllByText('File')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Edit')[0]).toBeInTheDocument();

    // Menu dropdown shouldn't be visible initially
    expect(screen.queryByText('Export...')).not.toBeInTheDocument();

    // Click to open File menu
    fireEvent.click(screen.getAllByText('File')[0]);
    expect(screen.getByText('Export...')).toBeInTheDocument();

    // Click again to close
    fireEvent.click(screen.getAllByText('File')[0]);
    expect(screen.queryByText('Export...')).not.toBeInTheDocument();
  });

  it('closes dropdown on click outside', () => {
    render(
      <div data-testid="outside">
        <TopBar />
      </div>
    );

    // Open menu
    fireEvent.click(screen.getAllByText('File')[0]);
    expect(screen.getByText('Export...')).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Export...')).not.toBeInTheDocument();
  });

  it('dispatches store actions correctly on menu option click', () => {
    render(<TopBar />);

    // Test File -> Export
    fireEvent.click(screen.getAllByText('File')[0]);
    fireEvent.click(screen.getByText('Export...'));
    expect(mockSetWorkspace).toHaveBeenCalledWith('export');

    // Menu should close
    expect(screen.queryByText('Export...')).not.toBeInTheDocument();

    // Test Edit -> Undo
    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.click(screen.getByText('Undo'));
    expect(mockUndo).toHaveBeenCalled();

    // Test Edit -> Redo
    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.click(screen.getByText('Redo'));
    expect(mockRedo).toHaveBeenCalled();

    // Test Edit -> Split
    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.click(screen.getByText('Split at Playhead'));
    expect(mockSplitClip).toHaveBeenCalledWith('clip_1', { value: 10, rate: 1 });

    // Test View -> Zoom In
    fireEvent.click(screen.getAllByText('View')[0]);
    fireEvent.click(screen.getByText('Zoom In'));
    expect(mockSetZoomLevel).toHaveBeenCalledWith(25); // 20 + 5

    // Test View -> Snapping
    fireEvent.click(screen.getAllByText('View')[0]);
    fireEvent.click(screen.getByText('Toggle Snapping'));
    expect(mockToggleMagneticSnapping).toHaveBeenCalled();

    // Test Sequence -> Add Video Track
    fireEvent.click(screen.getAllByText('Sequence')[0]);
    fireEvent.click(screen.getByText('Add Video Track'));
    expect(mockAddTrack).toHaveBeenCalledWith('video');
  });
});
