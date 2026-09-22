
import React, { useState, useEffect } from 'react';
import { ProgramMonitor } from './ProgramMonitor';
import { Scopes } from './Scopes';
import { ColorWheelsView } from './ColorWheelsView';
import { webgpuEngine } from '../engine/webgpuRenderer';

export const ColorWorkspace: React.FC = () => {
  const [imageData, setImageData] = useState<ImageData | null>(null);

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

        {/* Right: Studio Video Scopes Panel */}
        <div className="w-[380px] lg:w-[430px] shrink-0 flex flex-col rounded-xl border border-neutral-800/80 bg-[#0d0f17] overflow-hidden shadow-xl">
          <Scopes imageData={imageData} />
        </div>
      </div>

      {/* Lower Area: 3-Way Color Corrector (Lift, Gamma, Gain Wheels) */}
      <div className="h-60 shrink-0 rounded-xl border border-neutral-800/80 bg-neutral-900/95 overflow-y-auto shadow-xl">
        <ColorWheelsView />
      </div>
    </div>
  );
};
