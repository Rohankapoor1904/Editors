import React, { useEffect } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { ParametricEqView } from './ParametricEqView';
import { audioEngine } from '../engine/audioEngine';

export const AudioWorkspace: React.FC = () => {
  const tracks = useTimelineStore((state) => state.tracks);
  const audioTracks = tracks.filter((t) => t.type === 'audio');

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

          <div className="bg-neutral-900 p-4 rounded-md border border-neutral-800">
            <h3 className="text-sm font-semibold mb-4 text-neutral-300">Track Mixer</h3>
            <div className="flex space-x-4">
              {audioTracks.map(track => (
                <div key={track.id} className="flex flex-col items-center flex-1 bg-neutral-950 p-2 rounded-md" data-testid={`track-fader-${track.id}`}>
                  <div className="text-xs font-semibold text-neutral-400 mb-2 truncate w-full text-center" title={track.name}>
                    {track.name}
                  </div>
                  <input
                    type="range"
                    min="-48"
                    max="12"
                    step="1"
                    defaultValue="0"
                    onChange={(e) => {
                      // Apply track volume via store or engine
                      // We can directly use audioEngine here
                      audioEngine.setTrackVolume(track.id, parseFloat(e.target.value));
                    }}
                    className="w-2 h-40 appearance-none bg-neutral-700 outline-none rounded-full"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  />
                  <div className="text-[10px] text-neutral-500 mt-2">0 dB</div>
                </div>
              ))}
            </div>
          </div>
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
