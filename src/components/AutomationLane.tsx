import React from 'react';
import { AutomationLane, AutomationMode } from '../types/timeline';
import { evaluateLane, validateLane, AUTOMATION_MODES } from '../engine/automation';

export interface AutomationLaneProps {
  lane: AutomationLane;
  param: 'volume' | 'pan';
  /** View window in seconds. */
  durationSec: number;
  onChange: (lane: AutomationLane) => void;
}

const W = 300;
const H = 96;

function scaleFor(param: 'volume' | 'pan'): { min: number; max: number; unit: string } {
  return param === 'volume' ? { min: -60, max: 6, unit: 'dB' } : { min: -1, max: 1, unit: '' };
}

/**
 * R26.2 — keyframe lane editor (SVG, no canvas dependency): renders the
 * evaluated curve, drags points, double-click adds, double-click on a
 * point removes it. All mutations produce validated, time-sorted lanes.
 */
export const AutomationLaneEditor: React.FC<AutomationLaneProps> = ({
  lane,
  param,
  durationSec,
  onChange,
}) => {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const dragIndex = React.useRef<number | null>(null);
  const scale = scaleFor(param);
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 60;

  const toX = (t: number): number => Math.max(0, Math.min(W, (t / safeDuration) * W));
  const toY = (v: number): number => {
    const k = (v - scale.min) / (scale.max - scale.min);
    return H - Math.max(0, Math.min(1, k)) * H;
  };
  const fromPoint = (clientX: number, clientY: number): { t: number; v: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    const w = rect && rect.width > 0 ? rect.width : W;
    const h = rect && rect.height > 0 ? rect.height : H;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const t = Math.max(0, Math.min(safeDuration, ((clientX - left) / w) * safeDuration));
    const k = 1 - Math.max(0, Math.min(1, (clientY - top) / h));
    return { t, v: scale.min + k * (scale.max - scale.min) };
  };

  const commitPoints = (points: { timeSec: number; value: number }[]): void => {
    const sorted = [...points].sort((a, b) => a.timeSec - b.timeSec);
    onChange({ mode: lane.mode, points: sorted });
  };

  const handleBackgroundDoubleClick = (e: React.MouseEvent): void => {
    const { t, v } = fromPoint(e.clientX, e.clientY);
    commitPoints([...lane.points, { timeSec: Math.round(t * 100) / 100, value: Math.round(v * 100) / 100 }]);
  };

  const handlePointDoubleClick = (e: React.MouseEvent, index: number): void => {
    e.stopPropagation();
    commitPoints(lane.points.filter((_, i) => i !== index));
  };

  const handlePointerDown = (e: React.PointerEvent, index: number): void => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragIndex.current = index;
  };

  const handlePointerMove = (e: React.PointerEvent): void => {
    if (dragIndex.current === null) return;
    const { t, v } = fromPoint(e.clientX, e.clientY);
    const next = lane.points.map((p, i) =>
      i === dragIndex.current ? { timeSec: Math.round(t * 100) / 100, value: Math.round(v * 100) / 100 } : p
    );
    commitPoints(next);
  };

  const handlePointerUp = (): void => {
    dragIndex.current = null;
  };

  let curve = '';
  try {
    validateLane(lane);
    const steps = 60;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (safeDuration * i) / steps;
      const v = evaluateLane(lane, t) ?? 0;
      pts.push(`${toX(t).toFixed(1)},${toY(v).toFixed(1)}`);
    }
    curve = pts.join(' ');
  } catch {
    curve = '';
  }

  const baseY = toY(0);

  return (
    <div className="flex flex-col space-y-1.5" data-testid="automation-lane">
      <div className="flex items-center space-x-2">
        <span className="text-[11px] text-neutral-400 font-semibold uppercase">
          {param} automation
        </span>
        <select
          aria-label="Automation mode"
          value={lane.mode}
          onChange={(e) => onChange({ ...lane, mode: e.target.value as AutomationMode })}
          className="bg-neutral-800 text-neutral-200 text-[11px] rounded px-1.5 py-0.5 border border-neutral-700"
        >
          {AUTOMATION_MODES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="text-[10px] font-mono text-neutral-500">
          {lane.points.length} pt{lane.points.length === 1 ? '' : 's'}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        onDoubleClick={handleBackgroundDoubleClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full h-24 rounded border border-neutral-800 bg-neutral-950 cursor-crosshair"
      >
        <line x1={0} y1={baseY} x2={W} y2={baseY} stroke="#3f3f46" strokeWidth={1} strokeDasharray="3 3" />
        {curve.length > 0 && <polyline points={curve} fill="none" stroke="#22d3ee" strokeWidth={1.5} />}
        {lane.points.map((p, i) => (
          <circle
            key={i}
            data-testid={`lane-point-${i}`}
            cx={toX(p.timeSec)}
            cy={toY(p.value)}
            r={4}
            fill="#22d3ee"
            stroke="#0e7490"
            onPointerDown={(e) => handlePointerDown(e, i)}
            onDoubleClick={(e) => handlePointDoubleClick(e, i)}
            style={{ cursor: 'grab' }}
          />
        ))}
      </svg>
      <div className="text-[10px] text-neutral-600">
        Double-click to add · drag to move · double-click a point to remove
      </div>
    </div>
  );
};
