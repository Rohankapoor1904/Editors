import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ParametricEqView } from '../ParametricEqView';
import { parametricEqEngine } from '../../engine/parametricEq';

vi.mock('../../engine/parametricEq', () => ({
  parametricEqEngine: {
    setBandGain: vi.fn(),
  },
}));

describe('ParametricEqView', () => {
  it('renders 10 equalizer bands', () => {
    render(<ParametricEqView />);

    // There should be 10 range inputs
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(10);

    // Check for some labels
    expect(screen.getByText('31')).toBeDefined();
    expect(screen.getByText('1k')).toBeDefined();
    expect(screen.getByText('16k')).toBeDefined();
  });

  it('updates gain and calls engine when slider changes', () => {
    render(<ParametricEqView />);

    const sliders = screen.getAllByTestId('eq-band-5'); // 1kHz band
    const slider = sliders[0];

    fireEvent.change(slider, { target: { value: '6.5' } });

    expect(parametricEqEngine.setBandGain).toHaveBeenCalledWith(5, 6.5);

    // Check if UI updated
    expect(screen.getAllByText('6.5')[0]).toBeDefined();
  });
});
