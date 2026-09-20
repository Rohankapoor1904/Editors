import React, { useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { rationalToSeconds, secondsToRational } from '../types/time';
import { addRational, compareRational, subRational } from '../types/time';
import { Play, Pause, SkipBack, Volume2, Cpu, Maximize2, Repeat, ChevronLeft, ChevronRight, Monitor, Smartphone, Square, SplitSquareHorizontal, Zap, Subtitles, Sparkles, LayoutGrid } from 'lucide-react';
import { webgpuEngine } from '../engine/webgpuRenderer';
import { WordTimestamp, whisperService } from '../services/whisperTranscriber';
import { transportEngine } from '../engine/transport';
import { audioEngine } from '../engine/audioEngine';
import { frameCache } from '../engine/frameCache';
import { useMediaPoolStore } from '../store/mediaPool';
import { useLayoutStore } from '../store/layoutStore';
import { TransformGizmo } from './TransformGizmo';
import { captionEngine, CaptionPreset } from '../engine/captions/captionEngine';
import { MultiCamViewer } from './MultiCamViewer';

export const ProgramMonitor: React.FC = () => {
  const {
    tracks,
    playheadPosition,
    metadata,
    setPlayheadPosition,
    selectedClipIds,
    updateClipTransform,
    autoReframeClipToAspect,
  } = useTimelineStore();
  const { assets, proxyModeEnabled, toggleProxyMode } = useMediaPoolStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWebGPUActive, setIsWebGPUActive] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [previewQuality, setPreviewQuality] = useState<'Full' | '1/2' | '1/4'>('Full');
  const [captionPreset, setCaptionPreset] = useState<CaptionPreset | 'off'>('hormozi');
  const [isLooping, setIsLooping] = useState(transportEngine.isLooping);
  const monitorRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [transcriptWords, setTranscriptWords] = useState<WordTimestamp[]>([]);
  const [webgpuError, setWebgpuError] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(0);
  const [isMultiCamMode, setIsMultiCamMode] = useState<boolean>(false);
  const { monitorViewMode, toggleMonitorViewMode } = useLayoutStore();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize((prev) => {
          if (Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1) {
            return prev;
          }
          return { width: rect.width, height: rect.height };
        });
      }
    };

    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        updateSize();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  const frameDimensions = React.useMemo(() => {
    const targetAspect = aspectRatio === '16:9' ? 16 / 9 : aspectRatio === '9:16' ? 9 / 16 : 1;
    
    // Available container size with small padding
    const availWidth = Math.max(containerSize.width - 12, 100);
    const availHeight = Math.max(containerSize.height - 12, 100);

    let width: number;
    let height: number;

    if (availWidth / availHeight > targetAspect) {
      // Container is wider than aspect ratio (e.g. 9:16 or 1:1 on desktop screen) -> fit by height
      height = availHeight;
      width = height * targetAspect;
    } else {
      // Container is narrower than aspect ratio (e.g. 16:9 in narrow panel) -> fit by width
      width = availWidth;
      height = width / targetAspect;
    }

    return {
      width: Math.floor(width),
      height: Math.floor(height),
    };
  }, [containerSize, aspectRatio]);

  useEffect(() => {
    const unsubscribe = transportEngine.subscribe((playing) => {
      setIsPlaying(playing);
    });
    return unsubscribe;
  }, []);

  const computeDimensions = () => {
    let width = metadata.width;
    let height = metadata.height;

    // Apply aspect ratio
    if (aspectRatio === '16:9') {
      width = Math.max(metadata.width, metadata.height);
      height = width * (9 / 16);
    } else if (aspectRatio === '9:16') {
      height = Math.max(metadata.width, metadata.height);
      width = height * (9 / 16);
    } else if (aspectRatio === '1:1') {
      width = Math.min(metadata.width, metadata.height);
      height = width;
    }

    // Apply preview quality
    if (previewQuality === '1/2') {
      width = Math.round(width / 2);
      height = Math.round(height / 2);
    } else if (previewQuality === '1/4') {
      width = Math.round(width / 4);
      height = Math.round(height / 4);
    }

    return { width, height };
  };

  const { width: canvasWidth, height: canvasHeight } = computeDimensions();

  useEffect(() => {
    if (canvasRef.current) {
      webgpuEngine.init(canvasRef.current).then((supported: boolean) => {
        setIsWebGPUActive(supported);
        setWebgpuError(null);
      }).catch((err) => {
        setWebgpuError(err.message || String(err));
      });
    }
  }, [canvasWidth, canvasHeight]);


  useEffect(() => {
    let newActiveClipId = null;

    // Find the topmost video clip at playheadPosition
    const videoTracks = tracks.filter(t => t.type === 'video').sort((a, b) => a.index - b.index);
    for (const track of videoTracks) {
      if (track.muted || track.locked) continue;
      const clip = track.clips.find(c =>
        compareRational(playheadPosition, c.startOffset) >= 0 &&
        compareRational(playheadPosition, addRational(c.startOffset, c.duration)) < 0
      );
      if (clip) {
        newActiveClipId = clip.id;
        break; // Stop at topmost clip
      }
    }

    if (newActiveClipId !== activeClipId) {
       setActiveClipId(newActiveClipId);
    }
  }, [playheadPosition, tracks]);

  useEffect(() => {
    if (!activeClipId) {
      setTranscriptWords([]);
      return;
    }

    let isMounted = true;

    const activeClip = tracks.flatMap(t => t.clips).find(c => c.id === activeClipId);
    if (!activeClip) return;

    const asset = assets.find(a => a.id === activeClip.assetId);
    if (!asset) return;

    whisperService.transcribeAudio(asset.path).then(res => {
      if (isMounted) {
         const clipStartSec = rationalToSeconds(activeClip.startOffset);
         const sourceInSec = rationalToSeconds(activeClip.sourceIn);

         const offsetWords = res.words.map(w => {
            const wordOffsetSec = w.startTime - sourceInSec;
            const newStartTime = clipStartSec + wordOffsetSec;
            const newEndTime = newStartTime + (w.endTime - w.startTime);
            return {
              ...w,
              startTime: newStartTime,
              endTime: newEndTime
            }
         }).filter(w => w.endTime >= clipStartSec && w.startTime <= clipStartSec + rationalToSeconds(activeClip.duration));

         setTranscriptWords(offsetWords);
      }
    }).catch(err => {
      console.warn("Failed to fetch captions", err);
      if (isMounted) setTranscriptWords([]);
    });

    return () => { isMounted = false; };
  }, [activeClipId, tracks, assets]);

  useEffect(() => {
    if (!isWebGPUActive || !canvasRef.current) return;

    let activeClip = null;

    // Find the topmost video clip at playheadPosition
    const videoTracks = tracks.filter(t => t.type === 'video').sort((a, b) => a.index - b.index);
    for (const track of videoTracks) {
      if (track.muted || track.locked) continue;
      const clip = track.clips.find(c =>
        compareRational(playheadPosition, c.startOffset) >= 0 &&
        compareRational(playheadPosition, addRational(c.startOffset, c.duration)) < 0
      );
      if (clip) {
        activeClip = clip;
        break; // Stop at topmost clip
      }
    }

    if (activeClip) {
      const asset = assets.find(a => a.id === activeClip.assetId);
      if (asset) {
        // timeWithinClip = playheadPosition - clip.startOffset + clip.sourceIn
        const offsetInClip = subRational(playheadPosition, activeClip.startOffset);
        const sourceTime = addRational(activeClip.sourceIn, offsetInClip);

        frameCache.getOrFetchFrame(asset.path, sourceTime).then((frameBuffer) => {
          if (!frameBuffer) return;

          const width = frameBuffer.width;
          const height = frameBuffer.height;
          const uvSize = (width / 2) * (height / 2);

          const yData = frameBuffer.data.subarray(0, width * height);
          const uData = frameBuffer.data.subarray(width * height, width * height + uvSize);
          const vData = frameBuffer.data.subarray(width * height + uvSize, width * height + uvSize * 2);

          const colorGradeEffect = activeClip.effects?.find(e => e.type === 'colorGrade' && e.enabled);

          webgpuEngine.renderFrame({
            width: width,
            height: height,
            timecode: rationalToSeconds(playheadPosition),
            transform: activeClip.transform, // Pass transform if present
            colorSettings: colorGradeEffect ? (colorGradeEffect.params as any) : undefined,
            captionData: {
              words: transcriptWords
            },
            yuvData: {
              y: yData,
              u: uData,
              v: vData
            }
          });

          // Free WebGPU buffers if needed, or release frame
          try {
            frameBuffer.release();
          } catch (e) {
            // ignore
          }
        }).catch(err => {
          console.warn("Error fetching frame for preview", err);
          const colorGradeEffect = activeClip.effects?.find(e => e.type === 'colorGrade' && e.enabled);
          webgpuEngine.renderFrame({
             width: canvasWidth,
             height: canvasHeight,
             timecode: rationalToSeconds(playheadPosition),
             colorSettings: colorGradeEffect ? (colorGradeEffect.params as any) : undefined,
             captionData: { words: transcriptWords }
          });
        });
        return;
      }
    }

    // Fallback if no video clip is active
    webgpuEngine.renderFrame({
      width: canvasWidth,
      height: canvasHeight,
      timecode: rationalToSeconds(playheadPosition),
      captionData: {
        words: transcriptWords
      },
    });

  }, [playheadPosition, isWebGPUActive, canvasWidth, canvasHeight, tracks, assets, transcriptWords]);

  useEffect(() => {
    const canvas = captionCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (captionPreset === 'off' || transcriptWords.length === 0) return;

    const timecodeSec = rationalToSeconds(playheadPosition);
    captionEngine.renderKineticCaptionsToCanvas(
      ctx,
      canvasWidth,
      canvasHeight,
      transcriptWords,
      timecodeSec,
      { preset: captionPreset }
    );
  }, [playheadPosition, captionPreset, transcriptWords, canvasWidth, canvasHeight]);

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

  const handleFullscreen = () => {
    if (monitorRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        monitorRef.current.requestFullscreen();
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioEngine.isInitialized) {
       // A bit of a hack: no explicit "setMasterVolume" so we just scale everything using a master bus if possible,
       // or we'll assume there is no direct exposed `setMasterVolume` in `audioEngine.ts` and set a track volume?
       // Let's set an internal property or map over tracks. Wait, let's use track volume for all tracks.
       tracks.filter(t => t.type === 'audio').forEach(t => {
           audioEngine.setTrackVolume(t.id, val);
       });
    }
  };

  const selectedVideoClip = tracks
    .filter(t => t.type === 'video')
    .flatMap(t => t.clips)
    .find(c => selectedClipIds.includes(c.id));

  return (
    <div ref={monitorRef} className="flex-1 h-full w-full max-h-full bg-neutral-950 flex flex-col justify-between items-center p-3 select-none relative overflow-hidden min-h-0">
      {/* Top Monitor Bar / Quality & Aspect Selectors */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-1.5 px-2 text-[11px] text-neutral-400 shrink-0 gap-2 flex-wrap sm:flex-nowrap">
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

          {/* AI Smart Auto-Reframe (9:16) */}
          <button
            type="button"
            onClick={() => {
              setAspectRatio('9:16');
              const targetClip = selectedVideoClip || tracks.flatMap(t => t.clips).find(c => c.id === activeClipId);
              if (targetClip) {
                autoReframeClipToAspect(targetClip.id, 9 / 16);
              }
            }}
            className="flex items-center space-x-1 px-2 py-0.5 rounded transition-all text-[11px] font-medium border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60 hover:text-white shadow-sm ml-1"
            title="AI Smart Auto-Reframe (16:9 to 9:16 Vertical with Kalman Filter Tracking)"
            data-testid="auto-reframe-btn"
          >
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span className="hidden sm:inline">Auto-Reframe</span>
          </button>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0 flex-wrap">
          {/* Kinetic Captions Preset Selector */}
          <div className="flex items-center space-x-1 bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded text-[11px]">
            <Subtitles className={`w-3 h-3 ${captionPreset !== 'off' ? 'text-amber-400' : 'text-neutral-500'}`} />
            <select
              value={captionPreset}
              onChange={(e) => setCaptionPreset(e.target.value as any)}
              className="bg-transparent text-neutral-300 text-[11px] focus:outline-none cursor-pointer"
              title="Kinetic Caption Animation Style Preset"
              data-testid="caption-preset-selector"
            >
              <option value="hormozi">Hormozi (Bounce)</option>
              <option value="karaoke">Karaoke (Sky Glow)</option>
              <option value="neon">Neon (Hot Pink)</option>
              <option value="minimal">Minimal (Clean)</option>
              <option value="off">Captions Off</option>
            </select>
          </div>

          {/* Dual / Single Monitor View Switcher */}
          <button
            type="button"
            onClick={toggleMonitorViewMode}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-all text-[11px] font-medium border ${
              monitorViewMode === 'dual'
                ? 'bg-gradient-to-r from-indigo-accent to-purple-600 text-white border-indigo-400/50 shadow-sm shadow-indigo-500/20'
                : 'bg-neutral-900/90 text-neutral-400 border-neutral-800 hover:text-neutral-200 hover:border-neutral-700'
            }`}
            title={monitorViewMode === 'dual' ? 'Switch to Single Monitor (100% Full Canvas Preview)' : 'Switch to Dual Monitor (Source + Program Side-by-Side)'}
          >
            <SplitSquareHorizontal className="w-3 h-3" />
            <span className="hidden sm:inline">{monitorViewMode === 'dual' ? 'Dual' : 'Single'}</span>
          </button>

          <span className="text-[10px] text-neutral-500 font-mono hidden sm:inline">Res:</span>
          <select
            value={previewQuality}
            onChange={(e) => setPreviewQuality(e.target.value as any)}
            className="bg-neutral-900 text-neutral-200 text-[11px] px-1.5 py-0.5 rounded border border-neutral-800 focus:outline-none cursor-pointer"
          >
            <option value="Full">Full</option>
            <option value="1/2">1/2</option>
            <option value="1/4">1/4</option>
          </select>

          {/* Multi-Cam Studio Mode Button */}
          <button
            type="button"
            onClick={() => setIsMultiCamMode(!isMultiCamMode)}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-all ${
              isMultiCamMode
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm shadow-emerald-500/20 font-semibold'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
            title={isMultiCamMode ? 'Exit Multi-Cam Studio Mode' : 'Enter Multi-Cam 4-Up Studio Mode'}
            data-testid="multicam-toggle-btn"
          >
            <LayoutGrid className={`w-3 h-3 ${isMultiCamMode ? 'text-white' : 'text-neutral-400'}`} />
            <span>Multi-Cam</span>
          </button>

          {/* Proxy Mode Toggle Button */}
          <button
            type="button"
            onClick={toggleProxyMode}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-all ${
              proxyModeEnabled
                ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 shadow-sm shadow-amber-500/20 font-semibold'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
            title={proxyModeEnabled ? 'Proxy Mode: ACTIVE (Faster 720p Playback)' : 'Proxy Mode: OFF (Full 4K+ Source Playback)'}
            data-testid="proxy-mode-toggle"
          >
            <Zap className={`w-3 h-3 ${proxyModeEnabled ? 'text-amber-400' : 'text-neutral-500'}`} />
            <span>Proxy {proxyModeEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Canvas Video Surface Frame or Multi-Cam Studio */}
      <div ref={containerRef} className="flex-1 w-full flex items-center justify-center relative min-h-0 py-1 overflow-hidden">
        {isMultiCamMode ? (
          <MultiCamViewer onClose={() => setIsMultiCamMode(false)} />
        ) : (
          <div
            style={{
              width: `${frameDimensions.width}px`,
              height: `${frameDimensions.height}px`,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
            className="bg-neutral-900 border border-neutral-800/90 rounded-xl shadow-2xl flex flex-col items-center justify-center relative overflow-hidden group transition-all duration-150 shrink-0"
          >
            {/* WebGPU / Canvas2D Surface */}
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="w-full h-full object-contain"
            />

            {/* Real-Time Kinetic Captions Overlay */}
            <canvas
              ref={captionCanvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="w-full h-full object-contain absolute inset-0 pointer-events-none z-10"
              data-testid="kinetic-captions-canvas"
            />

            {/* Active Proxy Indicator Overlay Badge */}
            {proxyModeEnabled && (
              <div
                data-testid="proxy-badge"
                className="absolute top-2 right-2 bg-amber-500/90 text-black px-2 py-0.5 rounded text-[9px] font-mono font-bold shadow-lg flex items-center space-x-1 z-10 pointer-events-none"
              >
                <Zap className="w-2.5 h-2.5 text-black fill-current" />
                <span>PROXY 720p</span>
              </div>
            )}

            {selectedVideoClip && (
              <TransformGizmo
                clip={selectedVideoClip}
                containerWidth={frameDimensions.width}
                containerHeight={frameDimensions.height}
                onUpdateTransform={(t) => updateClipTransform(selectedVideoClip.id, t)}
              />
            )}


            {webgpuError && (
              <div className="absolute inset-0 bg-neutral-900/90 flex flex-col items-center justify-center p-4 text-center z-20">
                <span className="text-red-400 font-bold mb-2">Renderer Error</span>
                <span className="text-red-300 text-xs">{webgpuError}</span>
              </div>
            )}

            {/* Timecode Badge Overlay (Top Left) */}
            <div className="absolute top-2 left-2 bg-neutral-950/85 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-mono text-indigo-400 border border-neutral-800 shadow-lg font-semibold z-10 pointer-events-none">
              {formatTimecode(rationalToSeconds(playheadPosition))}
            </div>

            {/* WebGPU Status Pill Overlay (Bottom Right) */}
            {webgpuError ? (
              <div className="absolute bottom-2 right-2 bg-red-950/85 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-mono flex items-center space-x-1 border border-red-800 shadow-lg z-10 pointer-events-none">
                <span className="text-red-300 font-semibold">WebGPU Error</span>
              </div>
            ) : (
              <div className="absolute bottom-2 right-2 bg-neutral-950/85 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-mono flex items-center space-x-1 border border-neutral-800 shadow-lg z-10 pointer-events-none">
                <Cpu className={`w-2.5 h-2.5 ${isWebGPUActive ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className={isWebGPUActive ? 'text-emerald-300 font-semibold' : 'text-amber-300'}>
                  {isWebGPUActive ? 'WebGPU' : 'Canvas2D'}
                </span>
              </div>
            )}
          </div>
        )}
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
            onClick={() => transportEngine.stepFrame(-1)}
            className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
            title="Step Back 1 Frame (Left Arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => transportEngine.togglePlayback()}
            className="p-2.5 bg-gradient-to-tr from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-full text-white shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            onClick={() => transportEngine.stepFrame(1)}
            className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
            title="Step Forward 1 Frame (Right Arrow)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              transportEngine.toggleLoop();
              setIsLooping(transportEngine.isLooping);
            }}
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
            <div className="w-16 bg-neutral-800 h-1.5 rounded-full flex items-center">
              <input
                 type="range"
                 min="-60"
                 max="0"
                 value={volume}
                 onChange={handleVolumeChange}
                 className="w-full h-full accent-indigo-500 bg-transparent cursor-pointer"
                 title="Master Volume"
              />
            </div>
          </div>
          <button
             onClick={handleFullscreen}
             className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white"
             title="Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
