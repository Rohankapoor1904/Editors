import React, { useRef, useState, useEffect } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { RGBColor } from '../engine/colorEngine';
import { RotateCcw, Palette } from 'lucide-react';

interface ColorGradeSettings {
  lift: RGBColor;
  gamma: RGBColor;
  gain: RGBColor;
}

export const ColorWheelsView: React.FC = () => {
  const { selectedClipIds, tracks, updateClipEffect } = useTimelineStore();

  const selectedVideoClip = React.useMemo(() => {
    return tracks
      .filter(t => t.type === 'video')
      .flatMap(t => t.clips)
      .find(c => selectedClipIds.includes(c.id));
  }, [tracks, selectedClipIds]);

  const colorGradeEffect = React.useMemo(() => {
    if (!selectedVideoClip) return null;
    return selectedVideoClip.effects?.find(e => e.type === 'colorGrade') || null;
  }, [selectedVideoClip]);

  const baseSettings = (colorGradeEffect?.params as unknown as Partial<ColorGradeSettings>) || {};
  const currentSettings: ColorGradeSettings = {
    lift: baseSettings.lift || { r: 0, g: 0, b: 0 },
    gamma: baseSettings.gamma || { r: 1, g: 1, b: 1 },
    gain: baseSettings.gain || { r: 1, g: 1, b: 1 },
  };

  const handleWheelChange = (wheelName: 'lift' | 'gamma' | 'gain', r: number, g: number, b: number) => {
    if (!selectedVideoClip) return;
    const effectId = colorGradeEffect?.id || 'color_grade_effect';
    updateClipEffect(selectedVideoClip.id, effectId, 'colorGrade', {
      ...currentSettings,
      [wheelName]: { r, g, b }
    });
  };

  const handleReset = () => {
    if (!selectedVideoClip) return;
    const effectId = colorGradeEffect?.id || 'color_grade_effect';
    updateClipEffect(selectedVideoClip.id, effectId, 'colorGrade', {
      lift: { r: 0, g: 0, b: 0 },
      gamma: { r: 1, g: 1, b: 1 },
      gain: { r: 1, g: 1, b: 1 },
    });
  };

  if (!selectedVideoClip) {
    return (
      <div className="h-full min-h-[160px] flex items-center justify-center p-4 select-none">
        <div className="flex flex-col items-center justify-center text-center">
          <Palette className="w-7 h-7 text-neutral-600 mb-2" />
          <span className="text-neutral-400 text-xs font-semibold">Select a video clip to grade</span>
          <span className="text-neutral-600 text-[11px] mt-0.5">Click any video clip on the timeline to adjust Lift, Gamma, and Gain color wheels</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <h3 className="text-xs font-semibold text-neutral-200 tracking-wide uppercase">3-Way Color Corrector</h3>
          <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-500/30">
            {selectedVideoClip.name}
          </span>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center space-x-1 px-2 py-0.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors text-[11px] border border-neutral-800"
          title="Reset All Wheels"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      <div className="flex-1 flex justify-around items-center space-x-4">
        <ColorWheel
          title="Lift (Shadows)"
          wheelType="lift"
          value={currentSettings.lift}
          onChange={(r, g, b) => handleWheelChange('lift', r, g, b)}
        />
        <ColorWheel
          title="Gamma (Midtones)"
          wheelType="gamma"
          value={currentSettings.gamma}
          onChange={(r, g, b) => handleWheelChange('gamma', r, g, b)}
        />
        <ColorWheel
          title="Gain (Highlights)"
          wheelType="gain"
          value={currentSettings.gain}
          onChange={(r, g, b) => handleWheelChange('gain', r, g, b)}
        />
      </div>
    </div>
  );
};

interface ColorWheelProps {
  title: string;
  wheelType: 'lift' | 'gamma' | 'gain';
  value: RGBColor;
  onChange: (r: number, g: number, b: number) => void;
}

const ColorWheel: React.FC<ColorWheelProps> = ({ title, wheelType, value, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert RGB offset to XY coordinates for the puck
  // This is a simplified mapping. Real apps do YUV/HSL conversion.
  // For Lift: 0 is center, range is approx -1 to 1.
  // For Gamma: 1 is center, range is approx 0 to 2.
  // For Gain: 1 is center, range is approx 0 to 2.

  const getCenterOffset = () => {
    return wheelType === 'lift' ? 0 : 1;
  };

  const getScale = () => {
    return wheelType === 'lift' ? 1 : 2;
  };

  const calculateXY = (rgb: RGBColor) => {
    const center = getCenterOffset();
    const scale = getScale();

    const r = (rgb.r - center) / scale;
    const g = (rgb.g - center) / scale;
    const b = (rgb.b - center) / scale;

    // Simple mapping: R->angle 0 (right), G->angle 120, B->angle 240
    // x = r * cos(0) + g * cos(120) + b * cos(240)
    // y = r * sin(0) + g * sin(120) + b * sin(240)
    const x = r * 1 + g * -0.5 + b * -0.5;
    const y = r * 0 + g * (Math.sqrt(3)/2) + b * (-Math.sqrt(3)/2);

    return { x: x * 50, y: y * 50 }; // scale to puck radius
  };

  const [puckPos, setPuckPos] = useState(calculateXY(value));

  // Sync state when external value changes
  useEffect(() => {
    if (!isDragging) {
      setPuckPos(calculateXY(value));
    }
  }, [value, isDragging]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    updateFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      updateFromPointer(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  };

  const updateFromPointer = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate raw displacement from center
    let dx = e.clientX - rect.left - centerX;
    let dy = e.clientY - rect.top - centerY;

    // Clamp to circle radius (e.g. 50px)
    const maxRadius = rect.width / 2;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setPuckPos({ x: dx, y: dy });

    // Convert back to RGB offsets
    // Inverse of the simple mapping above
    const normX = dx / maxRadius;
    const normY = dy / maxRadius;

    // Project back onto R, G, B axes
    const rProj = normX * 1 + normY * 0;
    const gProj = normX * -0.5 + normY * (Math.sqrt(3)/2);
    const bProj = normX * -0.5 + normY * (-Math.sqrt(3)/2);

    const center = getCenterOffset();
    const scale = getScale();

    const newR = Math.max(0, center + rProj * scale);
    const newG = Math.max(0, center + gProj * scale);
    const newB = Math.max(0, center + bProj * scale);

    onChange(newR, newG, newB);
  };

  const handleResetWheel = () => {
    const center = getCenterOffset();
    onChange(center, center, center);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center justify-between w-full mb-3 px-2">
        <span className="text-xs font-medium text-neutral-400">{title}</span>
        <button
          onClick={handleResetWheel}
          className="text-[10px] text-neutral-500 hover:text-neutral-300"
        >
          Reset
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative w-32 h-32 rounded-full cursor-crosshair touch-none"
        style={{
          background: 'conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red)',
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Inner dark circle for neutral zone */}
        <div className="absolute inset-4 rounded-full bg-neutral-900/60 pointer-events-none" />

        {/* Crosshairs */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-full h-px bg-white" />
          <div className="absolute h-full w-px bg-white" />
        </div>

        {/* Puck */}
        <div
          className="absolute w-4 h-4 bg-white border-2 border-neutral-900 rounded-full shadow-md pointer-events-none"
          style={{
            left: `calc(50% + ${puckPos.x}px)`,
            top: `calc(50% + ${puckPos.y}px)`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      {/* Readouts */}
      <div className="flex space-x-2 mt-4 text-[10px] font-mono text-neutral-500">
        <span>R:{value.r.toFixed(2)}</span>
        <span>G:{value.g.toFixed(2)}</span>
        <span>B:{value.b.toFixed(2)}</span>
      </div>
    </div>
  );
};
