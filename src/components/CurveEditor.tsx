import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { Keyframe } from '../types/timeline';
import { rationalToSeconds, secondsToRational } from '../types/time';
import { parseCubicBezier, formatCubicBezier, sampleCubicBezierCurve, EASING_PRESETS } from '../utils/keyframing';
import { Activity, Plus, Trash2, X, MoveHorizontal, RotateCw, Sun, Volume2 } from 'lucide-react';

export interface CurveEditorProps {
  clipId?: string;
  onClose?: () => void;
  height?: number;
  className?: string;
}

export type AnimatableProperty =
  | 'position.x'
  | 'position.y'
  | 'scale.x'
  | 'scale.y'
  | 'rotation'
  | 'opacity'
  | 'volume';

interface PropertyConfig {
  id: AnimatableProperty;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
  unit: string;
  icon: React.ReactNode;
}

const PROPERTIES: PropertyConfig[] = [
  { id: 'position.x', label: 'Position X', min: -1000, max: 1000, defaultValue: 0, unit: 'px', icon: <MoveHorizontal className="w-3 h-3 text-cyan-400" /> },
  { id: 'position.y', label: 'Position Y', min: -1000, max: 1000, defaultValue: 0, unit: 'px', icon: <MoveHorizontal className="w-3 h-3 text-cyan-400 rotate-90" /> },
  { id: 'scale.x', label: 'Scale X', min: 0, max: 4, defaultValue: 1, unit: 'x', icon: <Activity className="w-3 h-3 text-indigo-400" /> },
  { id: 'scale.y', label: 'Scale Y', min: 0, max: 4, defaultValue: 1, unit: 'x', icon: <Activity className="w-3 h-3 text-indigo-400" /> },
  { id: 'rotation', label: 'Rotation', min: -360, max: 360, defaultValue: 0, unit: '°', icon: <RotateCw className="w-3 h-3 text-amber-400" /> },
  { id: 'opacity', label: 'Opacity', min: 0, max: 1, defaultValue: 1, unit: '', icon: <Sun className="w-3 h-3 text-purple-400" /> },
  { id: 'volume', label: 'Volume', min: -60, max: 12, defaultValue: 0, unit: 'dB', icon: <Volume2 className="w-3 h-3 text-emerald-400" /> },
];

export const CurveEditor: React.FC<CurveEditorProps> = ({
  clipId,
  onClose,
  height = 200,
  className = '',
}) => {
  const { tracks, playheadPosition, selectedClipIds, setClipKeyframe, removeClipKeyframe } = useTimelineStore();
  const [activeProperty, setActiveProperty] = useState<AnimatableProperty>('opacity');
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<number | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<{
    keyframeIndex: number;
    handleType: 'cp1' | 'cp2';
  } | null>(null);
  const [draggingKeyframe, setDraggingKeyframe] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 600, height });

  // Resolve target clip: explicit prop or first selected clip on timeline
  const effectiveClipId = clipId || selectedClipIds[0] || null;
  const targetClip = useMemo(() => {
    if (!effectiveClipId) return null;
    for (const track of tracks) {
      const found = track.clips.find((c) => c.id === effectiveClipId);
      if (found) return found;
    }
    return null;
  }, [tracks, effectiveClipId]);

  // Active property configuration
  const propConfig = useMemo(() => {
    return PROPERTIES.find((p) => p.id === activeProperty) || PROPERTIES[0];
  }, [activeProperty]);

  // Current keyframes for the selected property
  const keyframes: Keyframe[] = useMemo(() => {
    if (!targetClip || !targetClip.keyframes || !targetClip.keyframes[activeProperty]) {
      return [];
    }
    return targetClip.keyframes[activeProperty];
  }, [targetClip, activeProperty]);

  // Measure SVG container dynamically
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateSize);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  // Time and Value bounds for graph mapping
  const clipDurationSec = targetClip ? Math.max(0.1, rationalToSeconds(targetClip.duration)) : 10;
  const paddingX = 40;
  const paddingY = 25;
  const graphW = Math.max(100, dimensions.width - paddingX * 2);
  const graphH = Math.max(50, dimensions.height - paddingY * 2);

  const valMin = propConfig.min;
  const valMax = propConfig.max;

  // Screen mapping helpers
  const timeToX = useCallback((tSec: number) => {
    const progress = Math.max(0, Math.min(1, tSec / clipDurationSec));
    return paddingX + progress * graphW;
  }, [clipDurationSec, graphW, paddingX]);

  const xToTime = useCallback((x: number) => {
    const clampedX = Math.max(paddingX, Math.min(paddingX + graphW, x));
    const progress = (clampedX - paddingX) / graphW;
    return progress * clipDurationSec;
  }, [clipDurationSec, graphW, paddingX]);

  const valToY = useCallback((val: number) => {
    const normalized = Math.max(0, Math.min(1, (val - valMin) / (valMax - valMin)));
    return paddingY + (1 - normalized) * graphH;
  }, [valMin, valMax, graphH, paddingY]);

  const yToVal = useCallback((y: number) => {
    const clampedY = Math.max(paddingY, Math.min(paddingY + graphH, y));
    const normalized = 1 - (clampedY - paddingY) / graphH;
    return valMin + normalized * (valMax - valMin);
  }, [valMin, valMax, graphH, paddingY]);

  // Playhead X position inside clip
  const playheadSecInClip = useMemo(() => {
    if (!targetClip) return 0;
    const playheadSec = rationalToSeconds(playheadPosition);
    const clipStartSec = rationalToSeconds(targetClip.startOffset);
    return Math.max(0, Math.min(clipDurationSec, playheadSec - clipStartSec));
  }, [targetClip, playheadPosition, clipDurationSec]);

  // Add keyframe at playhead position
  const handleAddKeyframeAtPlayhead = () => {
    if (!targetClip) return;
    const existingKf = keyframes.find(
      (k) => Math.abs(rationalToSeconds(k.time) - playheadSecInClip) < 0.05
    );

    const initialVal = existingKf ? existingKf.value : propConfig.defaultValue;
    const newKf: Keyframe = {
      time: secondsToRational(playheadSecInClip),
      value: initialVal,
      easing: 'ease-in-out',
    };

    setClipKeyframe(targetClip.id, activeProperty, newKf);
    setSelectedKeyframeIndex(keyframes.length);
  };

  // Remove selected keyframe
  const handleDeleteSelectedKeyframe = () => {
    if (!targetClip || selectedKeyframeIndex === null) return;
    const kf = keyframes[selectedKeyframeIndex];
    if (!kf) return;
    removeClipKeyframe(targetClip.id, activeProperty, kf.time);
    setSelectedKeyframeIndex(null);
  };

  // Apply easing preset to current keyframe
  const handleApplyPreset = (presetName: string) => {
    if (!targetClip || selectedKeyframeIndex === null) return;
    const kf = keyframes[selectedKeyframeIndex];
    if (!kf) return;

    const updated: Keyframe = {
      ...kf,
      easing: presetName,
    };
    setClipKeyframe(targetClip.id, activeProperty, updated);
  };

  // Tangent and Keyframe drag handlers
  useEffect(() => {
    if (!draggingHandle && draggingKeyframe === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!svgRef.current || !targetClip) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (draggingKeyframe !== null) {
        const kf = keyframes[draggingKeyframe];
        if (!kf) return;
        const newTimeSec = xToTime(mouseX);
        const newVal = yToVal(mouseY);

        const updated: Keyframe = {
          ...kf,
          time: secondsToRational(newTimeSec),
          value: Math.round(newVal * 100) / 100,
        };
        setClipKeyframe(targetClip.id, activeProperty, updated);
      } else if (draggingHandle) {
        const { keyframeIndex, handleType } = draggingHandle;
        const k0 = keyframes[keyframeIndex];
        const k1 = keyframes[keyframeIndex + 1];
        if (!k0 || !k1) return;

        const x0 = timeToX(rationalToSeconds(k0.time));
        const y0 = valToY(k0.value);
        const x1 = timeToX(rationalToSeconds(k1.time));
        const y1 = valToY(k1.value);

        const deltaX = Math.max(1, x1 - x0);
        const deltaY = y1 - y0;

        const currentBezier = parseCubicBezier(k0.easing);
        let [cp1x, cp1y, cp2x, cp2y] = currentBezier;

        if (handleType === 'cp1') {
          cp1x = Math.max(0, Math.min(1, (mouseX - x0) / deltaX));
          cp1y = deltaY !== 0 ? (y0 - mouseY) / Math.abs(deltaY) : 0.5;
        } else {
          cp2x = Math.max(0, Math.min(1, (mouseX - x0) / deltaX));
          cp2y = deltaY !== 0 ? (y0 - mouseY) / Math.abs(deltaY) : 0.5;
        }

        const newEasing = formatCubicBezier(cp1x, cp1y, cp2x, cp2y);
        const updated: Keyframe = {
          ...k0,
          easing: newEasing,
        };
        setClipKeyframe(targetClip.id, activeProperty, updated);
      }
    };

    const handleMouseUp = () => {
      setDraggingHandle(null);
      setDraggingKeyframe(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    draggingHandle,
    draggingKeyframe,
    targetClip,
    activeProperty,
    keyframes,
    xToTime,
    yToVal,
    timeToX,
    valToY,
    setClipKeyframe,
  ]);

  if (!targetClip) {
    return (
      <div
        style={{ height: `${height}px` }}
        className={`bg-dark-950 border-t border-subtle flex flex-col items-center justify-center p-4 text-center select-none ${className}`}
      >
        <Activity className="w-6 h-6 text-neutral-600 mb-2" />
        <span className="text-xs font-semibold text-neutral-400">Spline Keyframe Curve Editor</span>
        <span className="text-[11px] text-neutral-500 mt-1 max-w-sm">
          Select a clip on the timeline to inspect and visually shape its Bezier animation curves.
        </span>
      </div>
    );
  }

  return (
    <div
      style={{ height: `${height}px` }}
      className={`bg-dark-950 border-t border-subtle flex flex-col select-none text-xs ${className}`}
    >
      {/* Top Header / Property Selector Bar */}
      <div className="h-9 px-3 bg-dark-900/90 border-b border-subtle flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
          <div className="flex items-center space-x-1.5 font-semibold text-neutral-200 text-[11px] pr-2 border-r border-neutral-800 shrink-0">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>Curves</span>
            <span className="text-[10px] text-neutral-500 font-normal truncate max-w-[120px]">
              ({targetClip.name})
            </span>
          </div>

          {/* Property Pills */}
          <div className="flex items-center space-x-1 shrink-0">
            {PROPERTIES.map((prop) => (
              <button
                key={prop.id}
                onClick={() => {
                  setActiveProperty(prop.id);
                  setSelectedKeyframeIndex(null);
                }}
                className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  activeProperty === prop.id
                    ? 'bg-indigo-accent text-white shadow-sm shadow-indigo-500/20'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
                }`}
              >
                {prop.icon}
                <span>{prop.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Easing Presets & Keyframe Tools */}
        <div className="flex items-center space-x-1.5 shrink-0">
          <div className="hidden sm:flex items-center space-x-1 bg-dark-950 p-0.5 rounded border border-subtle">
            {Object.keys(EASING_PRESETS).map((preset) => (
              <button
                key={preset}
                onClick={() => handleApplyPreset(preset)}
                disabled={selectedKeyframeIndex === null}
                className="px-1.5 py-0.5 text-[9px] rounded text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title={`Set easing to ${preset}`}
              >
                {preset}
              </button>
            ))}
          </div>

          <button
            onClick={handleAddKeyframeAtPlayhead}
            className="flex items-center space-x-1 px-2 py-1 bg-indigo-accent hover:bg-indigo-hover text-white rounded text-[10px] font-medium shadow transition-all hover:scale-[1.02]"
            title="Add keyframe at current playhead position"
          >
            <Plus className="w-3 h-3" />
            <span>Add Key</span>
          </button>

          <button
            onClick={handleDeleteSelectedKeyframe}
            disabled={selectedKeyframeIndex === null}
            className="p-1 text-neutral-400 hover:text-red-400 hover:bg-red-950/40 rounded transition-colors disabled:opacity-30"
            title="Delete selected keyframe"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
              title="Close Curve Editor"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main SVG Curve Canvas */}
      <div className="flex-1 relative overflow-hidden bg-dark-950">
        <svg
          ref={svgRef}
          className="w-full h-full cursor-crosshair"
          onMouseDown={() => setSelectedKeyframeIndex(null)}
        >
          <defs>
            {/* Gradient for the Bezier spline line */}
            <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>

            {/* Grid pattern */}
            <pattern id="gridPattern" width="40" height="25" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="40" y2="0" stroke="#262626" strokeWidth="0.5" />
              <line x1="0" y1="0" x2="0" y2="25" stroke="#262626" strokeWidth="0.5" />
            </pattern>
          </defs>

          {/* Grid Background */}
          <rect width="100%" height="100%" fill="url(#gridPattern)" />

          {/* Time & Value Axis Guides */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={paddingX}
            y2={dimensions.height - paddingY}
            stroke="#404040"
            strokeWidth="1"
          />
          <line
            x1={paddingX}
            y1={dimensions.height - paddingY}
            x2={dimensions.width - paddingX}
            y2={dimensions.height - paddingY}
            stroke="#404040"
            strokeWidth="1"
          />

          {/* Value Labels */}
          <text x={paddingX - 6} y={paddingY + 8} fill="#737373" fontSize="9" textAnchor="end">
            {propConfig.max}
            {propConfig.unit}
          </text>
          <text x={paddingX - 6} y={dimensions.height - paddingY} fill="#737373" fontSize="9" textAnchor="end">
            {propConfig.min}
            {propConfig.unit}
          </text>

          {/* Red Playhead Time Line */}
          <line
            x1={timeToX(playheadSecInClip)}
            y1={paddingY}
            x2={timeToX(playheadSecInClip)}
            y2={dimensions.height - paddingY}
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />

          {/* Default Flat Curve if no keyframes */}
          {keyframes.length === 0 && (
            <line
              x1={timeToX(0)}
              y1={valToY(propConfig.defaultValue)}
              x2={timeToX(clipDurationSec)}
              y2={valToY(propConfig.defaultValue)}
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.6"
            />
          )}

          {/* Connected Bezier Curves */}
          {keyframes.map((kf, i) => {
            if (i === keyframes.length - 1) return null;
            const nextKf = keyframes[i + 1];

            const x0 = timeToX(rationalToSeconds(kf.time));
            const y0 = valToY(kf.value);
            const x1 = timeToX(rationalToSeconds(nextKf.time));
            const y1 = valToY(nextKf.value);

            const deltaX = x1 - x0;
            const deltaY = y1 - y0;

            const [cp1x, cp1y, cp2x, cp2y] = parseCubicBezier(kf.easing);
            const samples = sampleCubicBezierCurve(cp1x, cp1y, cp2x, cp2y, 25);

            const pathD = samples.reduce((acc, pt, sIdx) => {
              const px = x0 + pt.x * deltaX;
              const py = y0 + (1 - pt.y) * deltaY;
              return `${acc} ${sIdx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
            }, '');

            return (
              <g key={`segment_${i}`}>
                {/* Visual glow backdrop */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="4"
                  opacity="0.25"
                />
                {/* Crisp main spline */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="url(#curveGradient)"
                  strokeWidth="2"
                />
              </g>
            );
          })}

          {/* Tangent Handles for the Selected Keyframe */}
          {selectedKeyframeIndex !== null && selectedKeyframeIndex < keyframes.length - 1 && (
            (() => {
              const k0 = keyframes[selectedKeyframeIndex];
              const k1 = keyframes[selectedKeyframeIndex + 1];
              const x0 = timeToX(rationalToSeconds(k0.time));
              const y0 = valToY(k0.value);
              const x1 = timeToX(rationalToSeconds(k1.time));
              const y1 = valToY(k1.value);

              const deltaX = x1 - x0;
              const deltaY = y1 - y0;
              const [cp1x, cp1y, cp2x, cp2y] = parseCubicBezier(k0.easing);

              const h1x = x0 + cp1x * deltaX;
              const h1y = y0 + (1 - cp1y) * deltaY;
              const h2x = x0 + cp2x * deltaX;
              const h2y = y0 + (1 - cp2y) * deltaY;

              return (
                <g className="tangent-handles">
                  {/* Tangent guide lines */}
                  <line x1={x0} y1={y0} x2={h1x} y2={h1y} stroke="#a5b4fc" strokeWidth="1" strokeDasharray="2 2" />
                  <line x1={x1} y1={y1} x2={h2x} y2={h2y} stroke="#e9d5ff" strokeWidth="1" strokeDasharray="2 2" />

                  {/* Handle 1 (Out Tangent) */}
                  <circle
                    cx={h1x}
                    cy={h1y}
                    r="4.5"
                    fill="#6366f1"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    data-testid="tangent-handle-cp1"
                    className="cursor-pointer hover:scale-125 transition-transform"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingHandle({ keyframeIndex: selectedKeyframeIndex, handleType: 'cp1' });
                    }}
                  />

                  {/* Handle 2 (In Tangent) */}
                  <circle
                    cx={h2x}
                    cy={h2y}
                    r="4.5"
                    fill="#a855f7"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    data-testid="tangent-handle-cp2"
                    className="cursor-pointer hover:scale-125 transition-transform"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingHandle({ keyframeIndex: selectedKeyframeIndex, handleType: 'cp2' });
                    }}
                  />
                </g>
              );
            })()
          )}

          {/* Keyframe Diamond Nodes */}
          {keyframes.map((kf, i) => {
            const kx = timeToX(rationalToSeconds(kf.time));
            const ky = valToY(kf.value);
            const isSelected = selectedKeyframeIndex === i;

            return (
              <g
                key={`kf_${i}`}
                data-testid="keyframe-node"
                className="cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedKeyframeIndex(i);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setSelectedKeyframeIndex(i);
                  setDraggingKeyframe(i);
                }}
              >
                {/* Hit target */}
                <circle cx={kx} cy={ky} r="10" fill="transparent" />

                {/* Keyframe diamond */}
                <polygon
                  points={`${kx},${ky - 6} ${kx + 6},${ky} ${kx},${ky + 6} ${kx - 6},${ky}`}
                  fill={isSelected ? '#38bdf8' : '#818cf8'}
                  stroke={isSelected ? '#ffffff' : '#1e1b4b'}
                  strokeWidth={isSelected ? '2' : '1.5'}
                  className="transition-all filter drop-shadow-md group-hover:scale-125"
                />

                {/* Tooltip value */}
                {isSelected && (
                  <text
                    x={kx}
                    y={ky - 10}
                    fill="#e0e7ff"
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="pointer-events-none"
                  >
                    {kf.value}
                    {propConfig.unit}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default CurveEditor;
