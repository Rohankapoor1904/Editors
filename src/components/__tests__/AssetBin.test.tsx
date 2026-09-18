import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssetBin } from '../AssetBin';
import { useMediaPoolStore } from '../../store/mediaPool';
import { useTimelineStore } from '../../store/timelineStore';

vi.mock('../../services/nativeBridge', () => ({
  nativeBridge: {
    importMediaFile: vi.fn(),
    getFileFingerprint: vi.fn(),
    checkFileExists: vi.fn(),
  }
}));

describe('AssetBin', () => {
  beforeEach(() => {
    useMediaPoolStore.setState({ assets: [] });
    // Minimal mock setup to bypass any error in initializing store if needed
    vi.clearAllMocks();
  });

  it('should render without errors', () => {
    render(<AssetBin />);
    expect(screen.getByText('Project Bin')).toBeInTheDocument();
  });

  it('adds an asset to the store when a file is selected', async () => {
    render(<AssetBin />);

    // Web object URL mocking
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

    // Mock audio duration loading
    global.Audio = class {
      duration = 10;
      constructor() {
        setTimeout(() => {
          // @ts-expect-error test mock
          this.onloadmetadata?.();
          // We need a proper event target mock or just bypass the load entirely
        }, 0);
      }
      addEventListener(type: string, cb: any) {
        if (type === 'loadedmetadata' || type === 'error') {
          setTimeout(cb, 10);
        }
      }
    } as any;

    const fileInputs = screen.getAllByTestId('hidden-file-input');
    const fileInput = fileInputs[0] as HTMLInputElement;
    const file = new File(['dummy content'], 'test.mp3', { type: 'audio/mp3' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(useMediaPoolStore.getState().assets.length).toBe(1);
    });

    const asset = useMediaPoolStore.getState().assets[0];
    expect(asset.name).toBe('test.mp3');
    expect(asset.type).toBe('audio');
    expect(asset.duration).toBe('00:00:10');
  });
});

  it('adds an asset to the timeline via Add to Timeline button', async () => {
    // We already have a track in the initial state for audio 'track_a1'
    useMediaPoolStore.setState({
      assets: [{
        id: 'asset_test',
        name: 'test.mp3',
        path: 'blob:test',
        type: 'audio',
        duration: '00:00:10',
        fingerprint: '123',
        isOffline: false
      }]
    });

    render(<AssetBin />);

    // There are 2 buttons (one for grid, one for list). Just use the first one.
    const buttons = screen.getAllByRole('button');
    const addButtons = buttons.filter(b => b.className.includes('bg-dark-950/90 hover:bg-indigo-900') || b.className.includes('bg-dark-800 hover:bg-indigo-900'));
    // Find the one with the Plus icon context or just the right class.
    // Given the structure, we can just grab the buttons and filter for those containing 'Add to timeline' (if we had title)
    // We'll click the add button by identifying it via its parent's asset ID, or we can just mock addClipToTrack.

    // Actually we can spy on timeline store executeCommand
    const timelineStore = useTimelineStore.getState();
    const executeSpy = vi.spyOn(timelineStore, 'executeCommand');

    // Using a more robust query in case there are multiple Plus buttons (Import vs Add to Timeline)
    // The "Add to Timeline" button in the AssetBin grid view is the second one typically after "Import".
    // Since we know the markup, let's grab the button containing the Plus icon and has no text
    if (addButtons.length > 0) {
      fireEvent.click(addButtons[0]);
    }

    expect(executeSpy).toHaveBeenCalled();
    const commandArg = executeSpy.mock.calls[0][0];
    // We can just verify it is an instance of AddClipCommand or check its properties
    expect((commandArg as any).trackId).toBe('track_a1');
    expect((commandArg as any).clip.assetId).toBe('asset_test');
  });
