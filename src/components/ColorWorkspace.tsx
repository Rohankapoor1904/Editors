
import React, { useState, useEffect } from 'react';
import { ProgramMonitor } from './ProgramMonitor';
import { Scopes } from './Scopes';
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
    <div className="flex-1 flex p-2 space-x-2 bg-neutral-950 min-h-0">
       <ProgramMonitor />
       <div className="w-[400px] shrink-0 flex flex-col bg-neutral-900 border border-neutral-800 overflow-y-auto">
          <Scopes imageData={imageData} />
       </div>
    </div>
  );
};
