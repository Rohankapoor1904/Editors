import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { SetMetadataCommand } from '../core/commands/storeCommands';
import { ColorGradeSettings } from '../engine/colorEngine';
import { renderComparison, CompareMode } from '../engine/compare';
import { Columns2, SplitSquareHorizontal } from 'lucide-react';

/** Deep-copies grade params; LUT buffers are shared by reference (read-only). */
function snapshotGrade(params: Record<string, unknown> | undefined): ColorGradeSettings | null {
  if (!params) return null;
  const { lutData, ...rest } = params as Record<string, unknown> & { lutData?: unknown };
  return { ...(JSON.parse(JSON.stringify(rest)) as ColorGradeSettings), lutData: lutData as never };
}

export interface ComparisonViewProps {
  imageData: ImageData | null;
}

/**
 * R26.3 — A/B comparison: snapshot two grades (or grade vs. bypass) and
 * preview side-by-side or with a split wipe, rendered on the CPU from the
 * live monitor frame. Snapshots are isolated copies — later live edits
 * never leak into them (no grade cross-talk, pinned by test).
 */
export const ComparisonView: React.FC<ComparisonViewProps> = ({ imageData }) => {
  const { tracks, selectedClipIds } = useTimelineStore();
  const [gradeA, setGradeA] = React.useState<ColorGradeSettings | null>(null);
  const [gradeB, setGradeB] = React.useState<ColorGradeSettings | null>(null);
  const [mode, setMode] = React.useState<CompareMode>('side-by-side');
  const [splitX, setSplitX] = React.useState(0.5);
  const leftRef = React.useRef<HTMLCanvasElement | null>(null);
  const rightRef = React.useRef<HTMLCanvasElement | null>(null);

  const liveParams = React.useMemo(() => {
    const clip = tracks
      .filter((t) => t.type === 'video')
      .flatMap((t) => t.clips)
      .find((c) => selectedClipIds.includes(c.id));
    const effect = clip?.effects?.find((e) => e.type === 'colorGrade');
    return (effect?.params ?? null) as Record<string, unknown> | null;
  }, [tracks, selectedClipIds]);

  React.useEffect(() => {
    if (!imageData) return;
    let frame: { width: number; height: number; data: Uint8ClampedArray };
    try {
      frame = { width: imageData.width, height: imageData.height, data: new Uint8ClampedArray(imageData.data) };
    } catch {
      return;
    }
    let result;
    try {
      result = renderComparison(frame, gradeA, gradeB, mode, splitX);
    } catch {
      return;
    }
    for (const [ref, buf] of [[leftRef, result.left], [rightRef, result.right]] as const) {
      const canvas = ref.current;
      if (!canvas) continue;
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = canvas.getContext('2d');
      } catch {
        ctx = null;
      }
      if (!ctx) continue;
      canvas.width = buf.width;
      canvas.height = buf.height;
      try {
        // Load-bearing cast (R22.1 pattern): TS 5.4 types Uint8ClampedArray
        // generically over ArrayBufferLike while ImageData demands a
        // concrete ArrayBuffer; the runtime value always satisfies it.
        ctx.putImageData(new ImageData(buf.data as unknown as ImageDataArray, buf.width, buf.height), 0, 0);
      } catch {
        // Host canvas without ImageData support: preview stays blank, honestly.
      }
    }
  }, [imageData, gradeA, gradeB, mode, splitX]);

  return (
    <div className="flex flex-col h-full min-h-0 p-2 space-y-2 select-none">
      <div className="flex items-center space-x-1.5">
        <button
          onClick={() => setGradeA(snapshotGrade(liveParams ?? undefined))}
          title="Snapshot the live grade into slot A"
          className="flex-1 px-2 py-1 text-[11px] rounded border border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/60 transition-colors"
        >
          Snapshot A{gradeA ? ' ✓' : ''}
        </button>
        <button
          onClick={() => setGradeB(snapshotGrade(liveParams ?? undefined))}
          title="Snapshot the live grade into slot B"
          className="flex-1 px-2 py-1 text-[11px] rounded border border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/60 transition-colors"
        >
          Snapshot B{gradeB ? ' ✓' : ''}
        </button>
        <button
          onClick={() => setMode(mode === 'side-by-side' ? 'split' : 'side-by-side')}
          title="Toggle side-by-side / split wipe"
          className="px-2 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors flex items-center space-x-1"
        >
          {mode === 'side-by-side' ? <Columns2 className="w-3.5 h-3.5" /> : <SplitSquareHorizontal className="w-3.5 h-3.5" />}
          <span>{mode === 'side-by-side' ? 'Split' : 'Side'}</span>
        </button>
      </div>
      {mode === 'split' && (
        <input
          type="range"
          aria-label="Split position"
          min={0}
          max={100}
          value={Math.round(splitX * 100)}
          onChange={(e) => setSplitX(Number(e.target.value) / 100)}
          className="w-full accent-indigo-500"
        />
      )}
      {!imageData ? (
        <div className="flex-1 flex items-center justify-center text-neutral-600 text-[11px] text-center p-4">
          No frame to compare — play or scrub the timeline first.
        </div>
      ) : (
        <div className={`flex-1 grid gap-1 min-h-0 ${mode === 'side-by-side' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div className="flex flex-col min-h-0">
            <span className="text-[10px] font-mono text-neutral-500 mb-0.5">A {gradeA ? '(snapshot)' : '(bypass)'}</span>
            <canvas ref={leftRef} data-testid="compare-left" className="w-full flex-1 min-h-0 rounded border border-neutral-800 bg-black object-contain" />
          </div>
          {mode === 'side-by-side' && (
            <div className="flex flex-col min-h-0">
              <span className="text-[10px] font-mono text-neutral-500 mb-0.5">B {gradeB ? '(snapshot)' : '(bypass)'}</span>
              <canvas ref={rightRef} data-testid="compare-right" className="w-full flex-1 min-h-0 rounded border border-neutral-800 bg-black object-contain" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const WORKING_SPACES = ['sRGB', 'Rec.709', 'ACEScg', 'ACES2065-1'];

/**
 * R26.3 — working-space selector: writes the project colorSpace through an
 * undoable command (serialized into project JSON, consumed by export).
 * It does not reinterpret the live grade math — full working-space
 * evaluation rides the future DAG; the selector is the project setting.
 */
export const WorkingSpaceSelect: React.FC = () => {
  const metadata = useTimelineStore((s) => s.metadata);
  const executeCommand = useTimelineStore((s) => s.executeCommand);
  return (
    <label className="flex items-center space-x-1.5 text-[11px] text-neutral-400">
      <span>Working space</span>
      <select
        aria-label="Working color space"
        value={metadata.colorSpace}
        onChange={(e) => executeCommand(new SetMetadataCommand({ colorSpace: e.target.value }))}
        className="bg-neutral-800 text-neutral-200 rounded px-1.5 py-0.5 border border-neutral-700"
      >
        {WORKING_SPACES.map((ws) => (
          <option key={ws} value={ws}>{ws}</option>
        ))}
        {!WORKING_SPACES.includes(metadata.colorSpace) && (
          <option value={metadata.colorSpace}>{metadata.colorSpace}</option>
        )}
      </select>
    </label>
  );
};
