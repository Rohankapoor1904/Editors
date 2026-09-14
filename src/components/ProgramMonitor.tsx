import React, { useEffect, useRef } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { Play, Pause, SkipBack, SkipForward, Volume2, Cpu } from 'lucide-react';
import { webgpuEngine } from '../engine/webgpuRenderer';

export const ProgramMonitor: React.FC = () => {
  const { playheadPosition, metadata, setPlayheadPosition } = useTimelineStore();
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isWebGPUActive, setIsWebGPUActive] = React.useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      webgpuEngine.init(canvasRef.current).then((supported) => {
        setIsWebGPUActive(supported);
      });
    }
  }, []);

  useEffect(() => {
    if (isWebGPUActive && canvasRef.current) {
      webgpuEngine.renderFrame({
        width: metadata.width,
        height: metadata.height,
        timecode: playheadPosition,
      });
    }
  }, [playheadPosition, isWebGPUActive, metadata]);

  const formatTimecode = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * metadata.fps);
    return `${hrs.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames
      .toString()
      .padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 bg-neutral-950 flex flex-col justify-between items-center p-3 select-none relative">
      {/* Canvas Video Surface */}
      <div className="flex-1 w-full flex items-center justify-center relative min-h-0">
        <div className="h-full aspect-[9/16] bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl flex flex-col items-center justify-center relative overflow-hidden group">
          {/* WebGPU Canvas Element */}
          <canvas
            ref={canvasRef}
            width={metadata.width}
            height={metadata.height}
            className="w-full h-full object-contain"
          />

          {/* Overlay Status Badge */}
          <div className="absolute top-3 right-3 bg-neutral-950/80 backdrop-blur px-2 py-1 rounded text-[10px] font-mono flex items-center space-x-1.5 border border-neutral-800">
            <Cpu className={`w-3 h-3 ${isWebGPUActive ? 'text-green-400' : 'text-yellow-400'}`} />
            <span className={isWebGPUActive ? 'text-green-300' : 'text-yellow-300'}>
              {isWebGPUActive ? 'WebGPU 32-bit Float' : 'Canvas2D Fallback'}
            </span>
          </div>

          {/* Timecode Overlay */}
          <div className="absolute top-3 left-3 bg-neutral-950/80 backdrop-blur px-2 py-1 rounded text-[11px] font-mono text-indigo-400 border border-neutral-800">
            {formatTimecode(playheadPosition)}
          </div>
        </div>
      </div>

      {/* Transport Controls Bar */}
      <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-lg p-2 mt-3 flex items-center justify-between text-xs text-neutral-300 shadow-lg">
        <div className="flex items-center space-x-2 font-mono text-indigo-400 text-[11px] px-2">
          {formatTimecode(playheadPosition)}
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setPlayheadPosition(0)}
            className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white shadow"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            onClick={() => setPlayheadPosition(playheadPosition + 5)}
            className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center space-x-2 px-2">
          <Volume2 className="w-4 h-4 text-neutral-400" />
          <div className="w-16 bg-neutral-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-indigo-500 h-full w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
};
