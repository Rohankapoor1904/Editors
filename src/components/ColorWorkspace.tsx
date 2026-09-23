
import React, { useState, useEffect } from 'react';
import { ProgramMonitor } from './ProgramMonitor';
import { Scopes } from './Scopes';
import { ColorWheelsView } from './ColorWheelsView';
import { ColorCurvesView } from './ColorCurvesView';
import { MaskInspector } from './MaskInspector';
import { ComparisonView, WorkingSpaceSelect } from './ComparisonView';
import { webgpuEngine } from '../engine/webgpuRenderer';

export const ColorWorkspace: React.FC = () => {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    let isSubscribed = true;

    const updateScopes = () => {
      if (!isSubscribed) return;

      const data = webgpuEngine.getImageData();
      if (data) {
         setImageData(data);
      }

      requestAnimationFrame(updateScopes);
    };

    updateAnimationFrameId = requestAnimationFrame(updateScopes);

    return () => {
      isSubscribed = false;
      cancelAnimationFrame(updateAnimationFrameId);
    };
  }, []);

  let updateAnimationFrameId = 0;

  return (
    <div className="flex-1 flex flex-col p-2 space-y-2 bg-neutral-950 min-h-0 overflow-hidden">
      {/* Upper Area: Program Monitor (Main Preview) + Video Scopes side-by-side */}
      <div className="flex-1 flex space-x-2 min-h-0 overflow-hidden">
        {/* Left: Program Monitor with maximum room */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-900 shadow-xl">
          <ProgramMonitor />
        </div>

        {/* Right: Studio Video Scopes Panel (R26.3: scopes / compare toggle) */}
        <div className="w-[380px] lg:w-[430px] shrink-0 flex flex-col rounded-xl border border-neutral-800/80 bg-[#0d0f17] overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-2 py-1 border-b border-neutral-800/80">
            <WorkingSpaceSelect />
            <button
              onClick={() => setShowCompare(!showCompare)}
              className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                showCompare
                  ? 'border-indigo-500/50 text-indigo-300 bg-indigo-950/60'
                  : 'border-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              {showCompare ? 'Scopes' : 'Compare'}
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {showCompare ? <ComparisonView imageData={imageData} /> : <Scopes imageData={imageData} />}
          </div>
        </div>
      </div>

      {/* Lower Area: 3-Way Corrector + Curves/Auto + Mask */}
      <div className="h-64 shrink-0 flex rounded-xl border border-neutral-800/80 bg-neutral-900/95 overflow-hidden shadow-xl">
        <div className="flex-1 min-w-0 overflow-y-auto">
          <ColorWheelsView />
        </div>
        <div className="w-[340px] shrink-0 border-l border-neutral-800/80 overflow-y-auto divide-y divide-neutral-800/80">
          <ColorCurvesView />
          <MaskInspector />
        </div>
      </div>
    </div>
  );
};
