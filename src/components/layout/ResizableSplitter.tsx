import React, { useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, GripVertical, GripHorizontal } from 'lucide-react';

export interface ResizableSplitterProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  onCollapseToggle?: () => void;
  isCollapsed?: boolean;
  collapsePosition?: 'start' | 'end';
  className?: string;
}

export const ResizableSplitter: React.FC<ResizableSplitterProps> = ({
  direction,
  onResize,
  onCollapseToggle,
  isCollapsed = false,
  collapsePosition = 'start',
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  const startDragging = useCallback((startClientX: number, startClientY: number) => {
    setIsDragging(true);
    let lastPos = direction === 'horizontal' ? startClientX : startClientY;

    const onMove = (clientX: number, clientY: number) => {
      const currentPos = direction === 'horizontal' ? clientX : clientY;
      const delta = currentPos - lastPos;
      if (delta !== 0) {
        onResizeRef.current(delta);
        lastPos = currentPos;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      onMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const stopDragging = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopDragging);
      window.removeEventListener('touchcancel', stopDragging);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', stopDragging);
    window.addEventListener('touchcancel', stopDragging);
  }, [direction]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startDragging(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      startDragging(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // Collapse Icon selection
  const renderCollapseIcon = () => {
    if (!onCollapseToggle) return null;

    if (direction === 'horizontal') {
      if (collapsePosition === 'start') {
        return isCollapsed ? (
          <ChevronRight className="w-2.5 h-2.5 text-neutral-400 group-hover:text-indigo-300" />
        ) : (
          <ChevronLeft className="w-2.5 h-2.5 text-neutral-400 group-hover:text-indigo-300" />
        );
      } else {
        return isCollapsed ? (
          <ChevronLeft className="w-2.5 h-2.5 text-neutral-400 group-hover:text-indigo-300" />
        ) : (
          <ChevronRight className="w-2.5 h-2.5 text-neutral-400 group-hover:text-indigo-300" />
        );
      }
    } else {
      return isCollapsed ? (
        <ChevronUp className="w-2.5 h-2.5 text-neutral-400 group-hover:text-indigo-300" />
      ) : (
        <ChevronDown className="w-2.5 h-2.5 text-neutral-400 group-hover:text-indigo-300" />
      );
    }
  };

  if (direction === 'horizontal') {
    return (
      <div
        className={`relative w-2 flex items-center justify-center group shrink-0 z-10 transition-colors select-none cursor-col-resize ${
          isDragging ? 'bg-indigo-500/80 shadow-md shadow-indigo-500/50' : 'bg-neutral-900/90 hover:bg-indigo-600/40'
        } ${className}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        role="separator"
        aria-orientation="vertical"
      >
        {/* Invisible wider hit-target area (16px) for effortless mouse grabbing */}
        <div className="absolute -inset-x-2 inset-y-0 z-10 cursor-col-resize pointer-events-auto" />

        {/* Visible divider line */}
        <div
          className={`w-[1px] h-full transition-colors z-20 ${
            isDragging ? 'bg-indigo-300' : 'bg-neutral-700/80 group-hover:bg-indigo-400'
          }`}
        />

        {/* Center Grip Handle & Optional Collapse Button */}
        <div className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center z-20 pointer-events-none">
          {onCollapseToggle && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCollapseToggle();
              }}
              className="pointer-events-auto p-0.5 rounded bg-dark-900 border border-neutral-700/80 shadow hover:bg-neutral-800 hover:border-indigo-500 transition-all opacity-0 group-hover:opacity-100 mb-1"
              title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {renderCollapseIcon()}
            </button>
          )}
          <GripVertical className={`w-2.5 h-2.5 transition-colors ${
            isDragging ? 'text-indigo-200' : 'text-neutral-500 group-hover:text-indigo-300'
          }`} />
        </div>
      </div>
    );
  }

  // Vertical (Horizontal divider bar)
  return (
    <div
      className={`relative h-2 flex items-center justify-center group shrink-0 z-10 transition-colors select-none cursor-row-resize ${
        isDragging ? 'bg-indigo-500/80 shadow-md shadow-indigo-500/50' : 'bg-neutral-900/90 hover:bg-indigo-600/40'
      } ${className}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      role="separator"
      aria-orientation="horizontal"
    >
      {/* Invisible wider hit-target area (16px) for effortless mouse grabbing */}
      <div className="absolute -inset-y-2 inset-x-0 z-10 cursor-row-resize pointer-events-auto" />

      {/* Visible divider line */}
      <div
        className={`h-[1px] w-full transition-colors z-20 ${
          isDragging ? 'bg-indigo-300' : 'bg-neutral-700/80 group-hover:bg-indigo-400'
        }`}
      />

      {/* Center Grip Handle & Optional Collapse Button */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center z-20 pointer-events-none">
        {onCollapseToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCollapseToggle();
            }}
            className="pointer-events-auto p-0.5 rounded bg-dark-900 border border-neutral-700/80 shadow hover:bg-neutral-800 hover:border-indigo-500 transition-all opacity-0 group-hover:opacity-100 mr-1"
            title={isCollapsed ? 'Expand timeline' : 'Collapse timeline'}
          >
            {renderCollapseIcon()}
          </button>
        )}
        <GripHorizontal className={`w-2.5 h-2.5 transition-colors ${
          isDragging ? 'text-indigo-200' : 'text-neutral-500 group-hover:text-indigo-300'
        }`} />
      </div>
    </div>
  );
};
