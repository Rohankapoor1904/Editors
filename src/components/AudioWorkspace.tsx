import React, { useEffect } from 'react';
import { ParametricEqView } from './ParametricEqView';
import { AudioMixer } from './AudioMixer';

export const AudioWorkspace: React.FC = () => {

  useEffect(() => {
    // We are honestly disabling the LUFS meter because extracting float data buffers
    // from the WebAudio graph for the loudness meter is not implemented.
  }, []);

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 bg-neutral-950 min-h-0 text-neutral-200 overflow-y-auto">
      <h2 className="text-xl font-bold border-b border-neutral-800 pb-2">Audio Workspace</h2>

      <div className="flex space-x-6">
        <div className="flex-1 space-y-4">
          <ParametricEqView />

          <AudioMixer />
        </div>

        <div className="w-24 bg-neutral-900 p-4 rounded-md border border-neutral-800 flex flex-col items-center opacity-50">
          <h3 className="text-sm font-semibold mb-4 text-neutral-300 text-center">Master<br/>LUFS</h3>
          <div className="w-4 h-64 bg-neutral-950 rounded-full flex items-end justify-center overflow-hidden border border-neutral-700 relative">
               <div className="text-neutral-500 text-[10px] transform -rotate-90 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">DISABLED</div>
          </div>
          <div className="text-[10px] mt-2 text-neutral-500">
            DISABLED
          </div>
        </div>
      </div>
    </div>
  );
};
