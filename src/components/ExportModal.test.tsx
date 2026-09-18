import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportModal } from './ExportModal';
import { nativeBridge } from '../services/nativeBridge';

// Mock the native bridge
vi.mock('../services/nativeBridge', () => ({
  nativeBridge: {
    getAvailableEncoders: vi.fn(),
  },
}));

describe('ExportModal R8.2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects available hardware encoders and populates the dropdown', async () => {
    (nativeBridge.getAvailableEncoders as any).mockResolvedValue([
      'Software x264',
      'VideoToolbox (Apple)',
    ]);

    render(<ExportModal />);

    // Wait for the native bridge call to resolve and state to update
    await waitFor(() => {
      expect(screen.getByText('VideoToolbox (Apple)')).toBeInTheDocument();
    });

    // Check that both options are present
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(select.children.length).toBe(2);
    expect(select.children[0].textContent).toBe('Software x264');
    expect(select.children[1].textContent).toBe('VideoToolbox (Apple)');

    // Check it defaults to the last one
    expect((select as HTMLSelectElement).value).toBe('VideoToolbox (Apple)');
  });

  it('falls back correctly when no hardware encoders are available', async () => {
     (nativeBridge.getAvailableEncoders as any).mockResolvedValue([]);

    render(<ExportModal />);

    await waitFor(() => {
       const fallback = screen.getByTestId('encoder-fallback');
       expect(fallback).toBeInTheDocument();
       expect(fallback).toHaveTextContent('Software x264');
    });
  });
});
