import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Clip, Transform } from '../types/timeline';
import { RotateCw, Crosshair } from 'lucide-react';

interface TransformGizmoProps {
  clip: Clip;
  containerWidth: number;
  containerHeight: number;
  onUpdateTransform: (transform: Transform) => void;
}

type DragMode = 'move' | 'scale-nw' | 'scale-ne' | 'scale-se' | 'scale-sw' | 'scale-n' | 'scale-s' | 'scale-e' | 'scale-w' | 'rotate' | null;

export const TransformGizmo: React.FC<TransformGizmoProps> = ({
  clip,
  containerWidth,
  containerHeight,
  onUpdateTransform,
}) => {
  const initialTransform: Transform = clip.transform || {
    position: { x: 0.5, y: 0.5 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
    anchorPoint: { x: 0.5, y: 0.5 },
  };

  const [liveTransform, setLiveTransform] = useState<Transform>(initialTransform);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startTransform: Transform;
    centerScreenX: number;
    centerScreenY: number;
  } | null>(null);

  useEffect(() => {
    if (clip.transform) {
      setLiveTransform(clip.transform);
    }
  }, [clip.transform]);

  const baseW = Math.max(80, containerWidth * 0.85);
  const baseH = Math.max(60, containerHeight * 0.85);
  const boxW = Math.max(40, baseW * liveTransform.scale.x);
  const boxH = Math.max(30, baseH * liveTransform.scale.y);

  const liveTransformRef = useRef<Transform>(liveTransform);
  liveTransformRef.current = liveTransform;

  const handlePointerDown = (e: React.PointerEvent, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();

    const target = e.currentTarget as HTMLElement;
    if (typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback in non-pointer environments
      }
    }

    const rect = target.getBoundingClientRect();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startTransform: { ...liveTransformRef.current },
      centerScreenX: rect.left + rect.width / 2,
      centerScreenY: rect.top + rect.height / 2,
    };
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !dragRef.current.mode) return;
    const { mode, startX, startY, startTransform, centerScreenX, centerScreenY } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (mode === 'move') {
      const deltaNormX = containerWidth > 0 ? dx / containerWidth : 0;
      const deltaNormY = containerHeight > 0 ? dy / containerHeight : 0;
      const next: Transform = {
        ...startTransform,
        position: {
          x: Number((startTransform.position.x + deltaNormX).toFixed(4)),
          y: Number((startTransform.position.y + deltaNormY).toFixed(4)),
        },
      };
      liveTransformRef.current = next;
      setLiveTransform(next);
    } else if (mode === 'scale-se') {
      const scaleDeltaX = (dx / (baseW / 2));
      const scaleDeltaY = (dy / (baseH / 2));
      const nextScale = Math.max(0.1, Math.min(4.0, startTransform.scale.x + Math.max(scaleDeltaX, scaleDeltaY)));
      const next: Transform = {
        ...startTransform,
        scale: { x: Number(nextScale.toFixed(3)), y: Number(nextScale.toFixed(3)) },
      };
      liveTransformRef.current = next;
      setLiveTransform(next);
    } else if (mode === 'scale-nw') {
      const scaleDeltaX = (-dx / (baseW / 2));
      const scaleDeltaY = (-dy / (baseH / 2));
      const nextScale = Math.max(0.1, Math.min(4.0, startTransform.scale.x + Math.max(scaleDeltaX, scaleDeltaY)));
      const next: Transform = {
        ...startTransform,
        scale: { x: Number(nextScale.toFixed(3)), y: Number(nextScale.toFixed(3)) },
      };
      liveTransformRef.current = next;
      setLiveTransform(next);
    } else if (mode === 'scale-ne') {
      const scaleDelta = Math.max(dx / (baseW / 2), -dy / (baseH / 2));
      const nextScale = Math.max(0.1, Math.min(4.0, startTransform.scale.x + scaleDelta));
      const next: Transform = {
        ...startTransform,
        scale: { x: Number(nextScale.toFixed(3)), y: Number(nextScale.toFixed(3)) },
      };
      liveTransformRef.current = next;
      setLiveTransform(next);
    } else if (mode === 'scale-sw') {
      const scaleDelta = Math.max(-dx / (baseW / 2), dy / (baseH / 2));
      const nextScale = Math.max(0.1, Math.min(4.0, startTransform.scale.x + scaleDelta));
      const next: Transform = {
        ...startTransform,
        scale: { x: Number(nextScale.toFixed(3)), y: Number(nextScale.toFixed(3)) },
      };
      liveTransformRef.current = next;
      setLiveTransform(next);
    } else if (mode === 'rotate') {
      const angleRad = Math.atan2(e.clientY - centerScreenY, e.clientX - centerScreenX);
      const angleDeg = Math.round((angleRad * (180 / Math.PI)) + 90);
      const next: Transform = {
        ...startTransform,
        rotation: (angleDeg + 360) % 360,
      };
      liveTransformRef.current = next;
      setLiveTransform(next);
    }
  }, [baseW, baseH, containerWidth, containerHeight]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try {
      if (typeof (e.currentTarget as any)?.releasePointerCapture === 'function') {
        (e.currentTarget as any).releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    dragRef.current = null;
    onUpdateTransform(liveTransformRef.current);
  }, [onUpdateTransform]);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-30"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Interactive Bounding Box */}
      <div
        style={{
          width: `${boxW}px`,
          height: `${boxH}px`,
          left: `${liveTransform.position.x * 100}%`,
          top: `${liveTransform.position.y * 100}%`,
          transform: `translate(-50%, -50%) rotate(${liveTransform.rotation}deg)`,
        }}
        className="absolute border-2 border-indigo-400 bg-indigo-500/10 pointer-events-auto cursor-move select-none shadow-xl shadow-indigo-950/40 rounded-sm"
        onPointerDown={(e) => handlePointerDown(e, 'move')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Rotation Arm & Puck */}
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
          <div
            className="w-5 h-5 bg-neutral-900 border-2 border-indigo-400 text-indigo-300 rounded-full flex items-center justify-center cursor-grab hover:bg-indigo-600 hover:text-white transition-all shadow-md active:cursor-grabbing"
            title="Rotate Clip"
            onPointerDown={(e) => handlePointerDown(e, 'rotate')}
          >
            <RotateCw className="w-2.5 h-2.5" />
          </div>
          <div className="w-0.5 h-2 bg-indigo-400" />
        </div>

        {/* Center Pivot Crosshair */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400 opacity-60 pointer-events-none">
          <Crosshair className="w-3.5 h-3.5" />
        </div>

        {/* Corner Handles */}
        <div
          className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-sm cursor-nwse-resize shadow hover:scale-125 transition-transform"
          onPointerDown={(e) => handlePointerDown(e, 'scale-nw')}
        />
        <div
          className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-sm cursor-nesw-resize shadow hover:scale-125 transition-transform"
          onPointerDown={(e) => handlePointerDown(e, 'scale-ne')}
        />
        <div
          className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-sm cursor-nesw-resize shadow hover:scale-125 transition-transform"
          onPointerDown={(e) => handlePointerDown(e, 'scale-sw')}
        />
        <div
          className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-sm cursor-nwse-resize shadow hover:scale-125 transition-transform"
          onPointerDown={(e) => handlePointerDown(e, 'scale-se')}
        />

        {/* Status Coordinate Tag */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-neutral-950/90 text-indigo-300 font-mono text-[9px] px-1.5 py-0.5 rounded border border-neutral-800 whitespace-nowrap shadow pointer-events-none">
          X: {Math.round((liveTransform.position.x - 0.5) * 100)}% Y: {Math.round((liveTransform.position.y - 0.5) * 100)}% | {Math.round(liveTransform.scale.x * 100)}% | {liveTransform.rotation}°
        </div>
      </div>
    </div>
  );
};
