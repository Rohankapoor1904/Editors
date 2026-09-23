import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AssetBin } from '../AssetBin';
import { useMediaPoolStore } from '../../store/mediaPool';

vi.mock('../../services/nativeBridge', () => ({
  nativeBridge: {
    importMediaFile: vi.fn(),
    getFileFingerprint: vi.fn(),
    checkFileExists: vi.fn().mockResolvedValue(true),
  },
}));

function seedLabelledPool() {
  useMediaPoolStore.setState({
    assets: [
      {
        id: 'a1', name: 'Interview_Take1.mp4', path: '/m/i.mp4', type: 'video',
        duration: '00:00:10', fingerprint: 'fp1', isOffline: false,
        scene: 'SC1', take: 1, rating: 5, tags: ['interview'],
      },
      {
        id: 'a2', name: 'Broll_Mountain.mp4', path: '/m/b.mp4', type: 'video',
        duration: '00:00:08', fingerprint: 'fp2', isOffline: false,
        scene: 'SC2', take: 3, rating: 3,
      },
      {
        id: 'a3', name: 'Lofi_Bed.mp3', path: '/m/l.mp3', type: 'audio',
        duration: '00:01:00', fingerprint: 'fp3', isOffline: false, rating: 4,
      },
    ],
    customBins: [],
    activeBinId: 'bin-all',
    selectedAssetId: null,
  });
}

describe('R24.7 — labelled search and bins (acceptance)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedLabelledPool();
  });

  afterEach(() => {
    cleanup();
  });

  it('searching returns the expected labelled clip', () => {
    render(<AssetBin />);
    fireEvent.change(screen.getByPlaceholderText('Search assets, clips, tags...'), {
      target: { value: 'broll' },
    });
    expect(screen.getByText('Broll_Mountain.mp4')).toBeTruthy();
    expect(screen.queryByText('Interview_Take1.mp4')).toBeNull();
    expect(screen.queryByText('Lofi_Bed.mp3')).toBeNull();
  });

  it('smart bins narrow the pool with live counts', () => {
    render(<AssetBin />);
    expect(screen.getByTitle('All Media (3)')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Favorites (2)'));
    expect(screen.getByText('Interview_Take1.mp4')).toBeTruthy();
    expect(screen.getByText('Lofi_Bed.mp3')).toBeTruthy();
    expect(screen.queryByText('Broll_Mountain.mp4')).toBeNull();
  });

  it('AI Generated bin filters with no duplicate pill row (single taxonomy)', () => {
    useMediaPoolStore.setState({
      assets: [
        {
          id: 'a1', name: 'Interview_Take1.mp4', path: '/m/i.mp4', type: 'video',
          duration: '00:00:10', fingerprint: 'fp1', isOffline: false,
        },
        {
          id: 'g1', name: 'AI_Broll.mp4', path: '/m/g.mp4', type: 'ai',
          duration: '00:00:05', fingerprint: 'fpg', isOffline: false,
        },
      ],
      customBins: [],
      activeBinId: 'bin-all',
      selectedAssetId: null,
    });
    render(<AssetBin />);
    // Bins strip owns every category with live counts…
    expect(screen.getByTitle('AI Generated (1)')).toBeTruthy();
    // …and no second pill row duplicates All/Video/Audio.
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Video' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Audio' })).toBeNull();
    // The AI bin actually filters.
    fireEvent.click(screen.getByTitle('AI Generated (1)'));
    expect(screen.getByText('AI_Broll.mp4')).toBeTruthy();
    expect(screen.queryByText('Interview_Take1.mp4')).toBeNull();
  });

  it('edits scene/take/rating/tags on the selected asset', () => {
    render(<AssetBin />);
    fireEvent.click(screen.getByText('Broll_Mountain.mp4'));
    fireEvent.change(screen.getByLabelText('Asset scene'), { target: { value: 'SC9' } });
    fireEvent.click(screen.getByLabelText('Rate 5 stars'));
    const asset = useMediaPoolStore.getState().assets.find((a) => a.id === 'a2')!;
    expect(asset.scene).toBe('SC9');
    expect(asset.rating).toBe(5);
  });
});
