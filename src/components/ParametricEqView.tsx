import React, { useState } from 'react';
import { parametricEqEngine } from '../engine/parametricEq';

const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const ParametricEqView: React.FC = () => {
  const [gains, setGains] = useState<number[]>(new Array(10).fill(0));

  const handleGainChange = (index: number, value: number) => {
    const newGains = [...gains];
    newGains[index] = value;
    setGains(newGains);
    parametricEqEngine.setBandGain(index, value);
  };

  return (
    <div className="flex flex-col bg-neutral-900 p-4 rounded-md border border-neutral-800">
      <h3 className="text-sm font-semibold mb-4 text-neutral-300">10-Band Parametric EQ</h3>
      <div className="flex space-x-2 items-end h-48">
        {FREQUENCIES.map((freq, idx) => (
          <div key={freq} className="flex flex-col items-center flex-1">
            <div className="text-xs text-neutral-500 mb-2">{gains[idx].toFixed(1)}</div>
            <input
              type="range"
              min="-12"
              max="12"
              step="0.1"
              value={gains[idx]}
              onChange={(e) => handleGainChange(idx, parseFloat(e.target.value))}
              className="w-1 h-32 appearance-none bg-neutral-700 outline-none rounded-full"
              style={{
                writingMode: 'vertical-lr',
                direction: 'rtl'
              }}
              aria-label={`EQ Band ${freq}Hz`}
              data-testid={`eq-band-${idx}`}
            />
            <div className="text-[10px] text-neutral-400 mt-2">
              {freq >= 1000 ? `${freq / 1000}k` : freq}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
