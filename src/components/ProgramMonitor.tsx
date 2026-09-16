import React, { useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { rationalToSeconds, secondsToRational } from '../types/time';
import { Play, Pause, SkipBack, Volume2, Cpu, Maximize2, Repeat, ChevronLeft, ChevronRight, Monitor, Smartphone, Square } from 'lucide-react';
import { webgpuEngine } from '../engine/webgpuRenderer';

export const ProgramMonitor: React.FC = () => {
  const { playheadPosition, metadata, setPlayheadPosition } = useTimelineStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWebGPUActive, setIsWebGPUActive] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [previewQuality, setPreviewQuality] = useState<'Full' | '1/2' | '1/4'>('Full');
  const [isLooping, setIsLooping] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      webgpuEngine.init(canvasRef.current).then((supported: boolean) => {
        setIsWebGPUActive(supported);
      });
    }
  }, []);

  useEffect(() => {
    if (isWebGPUActive && canvasRef.current) {
      webgpuEngine.renderFrame({
        width: metadata.width,
        height: metadata.height,
        timecode: rationalToSeconds(playheadPosition),
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

  const stepFrame = (deltaFrames: number) => {
    const frameDuration = 1 / metadata.fps;
    const newPos = Math.max(0, rationalToSeconds(playheadPosition) + deltaFrames * frameDuration);
    setPlayheadPosition(secondsToRational(newPos));
  };

  return (
    <div className="flex-1 bg-neutral-950 flex flex-col justify-between items-center p-3 select-none relative overflow-hidden">
      {/* Top Monitor Bar / Quality & Aspect Selectors */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-1.5 px-2 text-[11px] text-neutral-400 shrink-0 gap-2">
        <div className="flex items-center space-x-1 bg-neutral-900/90 p-1 rounded-md border border-neutral-800 shrink-0">
          <button
            onClick={() => setAspectRatio('16:9')}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
              aspectRatio === '16:9' ? 'bg-neutral-800 text-white font-medium' : 'hover:text-neutral-200'
            }`}
            title="Horizontal 16:9 YouTube / Film"
          >
            <Monitor className="w-3 h-3" />
            <span>16:9</span>
          </button>
          <button
            onClick={() => setAspectRatio('9:16')}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
              aspectRatio === '9:16' ? 'bg-neutral-800 text-white font-medium' : 'hover:text-neutral-200'
            }`}
            title="Vertical 9:16 Shorts / TikTok"
          >
            <Smartphone className="w-3 h-3" />
            <span>9:16</span>
          </button>
          <button
            onClick={() => setAspectRatio('1:1')}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
              aspectRatio === '1:1' ? 'bg-neutral-800 text-white font-medium' : 'hover:text-neutral-200'
            }`}
            title="Square 1:1 Instagram Post"
          >
            <Square className="w-3 h-3" />
            <span>1:1</span>
          </button>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          <span className="text-[10px] text-neutral-500 font-mono hidden sm:inline">Res:</span>
          <select
            value={previewQuality}
            onChange={(e) => setPreviewQuality(e.target.value as any)}
            className="bg-neutral-900 text-neutral-200 text-[11px] px-2 py-0.5 rounded border border-neutral-800 focus:outline-none cursor-pointer"
          >
            <option value="Full">Full (1080p)</option>
            <option value="1/2">1/2 (540p)</option>
            <option value="1/4">1/4 (270p)</option>
          </select>
        </div>
      </div>

      {/* Canvas Video Surface Frame */}
      <div className="flex-1 w-full flex items-center justify-center relative min-h-0 py-1">
        <div
          className={`h-full bg-neutral-900 border border-neutral-800/90 rounded-xl shadow-2xl flex flex-col items-center justify-center relative overflow-hidden group transition-all duration-300 ${
            aspectRatio === '16:9' ? 'aspect-[16/9]' : aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-square'
          }`}
        >
          {/* WebGPU / Canvas2D Surface */}
          <canvas
            ref={canvasRef}
            width={metadata.width}
            height={metadata.height}
            className="w-full h-full object-contain"
          />

          {/* Timecode Badge Overlay (Top Left) */}
          <div className="absolute top-2 left-2 bg-neutral-950/85 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-mono text-indigo-400 border border-neutral-800 shadow-lg font-semibold z-10 pointer-events-none">
            {formatTimecode(rationalToSeconds(playheadPosition))}
          </div>

          {/* WebGPU Status Pill Overlay (Bottom Right) */}
          <div className="absolute bottom-2 right-2 bg-neutral-950/85 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-mono flex items-center space-x-1 border border-neutral-800 shadow-lg z-10 pointer-events-none">
            <Cpu className={`w-2.5 h-2.5 ${isWebGPUActive ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className={isWebGPUActive ? 'text-emerald-300 font-semibold' : 'text-amber-300'}>
              {isWebGPUActive ? 'WebGPU' : 'Canvas2D'}
            </span>
          </div>
        </div>
      </div>

      {/* Modern Transport Controls Bar */}
      <div className="w-full max-w-xl bg-neutral-900/90 backdrop-blur border border-neutral-800/90 rounded-xl p-2.5 mt-2 flex items-center justify-between text-xs text-neutral-300 shadow-xl">
        {/* Left Timecode */}
        <div className="flex items-center space-x-2 font-mono text-indigo-400 font-semibold text-[11px] px-2 bg-neutral-950 py-1 rounded-md border border-neutral-800/80">
          {formatTimecode(rationalToSeconds(playheadPosition))}
        </div>

        {/* Center Playback Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setPlayheadPosition(secondsToRational(0))}
            className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
            title="Jump to Start (Home)"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => stepFrame(-1)}
            className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
            title="Step Back 1 Frame (Left Arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2.5 bg-gradient-to-tr from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-full text-white shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            onClick={() => stepFrame(1)}
            className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
            title="Step Forward 1 Frame (Right Arrow)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsLooping(!isLooping)}
            className={`p-1.5 rounded-lg transition-colors ${
              isLooping ? 'bg-indigo-950 text-indigo-300' : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
            title="Toggle Loop Playback"
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Right Volume & Fullscreen */}
        <div className="flex items-center space-x-3 px-2">
          <div className="flex items-center space-x-1.5">
            <Volume2 className="w-4 h-4 text-neutral-400" />
            <div className="w-16 bg-neutral-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full w-3/4" />
            </div>
          </div>
          <button className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
