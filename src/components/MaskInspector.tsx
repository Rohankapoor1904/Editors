import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { ClipMask, MaskShape, MaskSubjectClass } from '../types/timeline';
import { BoxSelect } from 'lucide-react';

const SHAPES: MaskShape[] = ['rect', 'ellipse'];
const CLASSES: MaskSubjectClass[] = ['person', 'skin', 'hair', 'sky', 'foliage', 'clothing', 'custom'];

/**
 * R24.1 remainder — manual mask authoring wired to the undoable mask
 * commands. The first mask on the active clip gates the whole GPU grade
 * (ProgramMonitor feeds it as RenderOptions.mask); neural auto-detect is
 * absent, so there is no "detect" button here — only honest manual masks.
 */
export const MaskInspector: React.FC = () => {
  const { selectedClipIds, tracks, addClipMask, updateClipMask, removeClipMask } = useTimelineStore();

  const selectedVideoClip = React.useMemo(() => {
    return tracks
      .filter((t) => t.type === 'video')
      .flatMap((t) => t.clips)
      .find((c) => selectedClipIds.includes(c.id));
  }, [tracks, selectedClipIds]);

  const masks = selectedVideoClip?.masks ?? [];
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const editing = masks.find((m) => m.id === editingId) ?? masks[0] ?? null;

  const [draft, setDraft] = React.useState({
    shape: 'rect' as MaskShape,
    subjectClass: 'person' as MaskSubjectClass,
  });

  if (!selectedVideoClip) {
    return (
      <div className="flex items-center justify-center p-3 text-neutral-600 text-[11px] select-none">
        <BoxSelect className="w-4 h-4 mr-1.5" />
        Select a video clip to add a mask
      </div>
    );
  }

  const handleAdd = (): void => {
    const mask: ClipMask = {
      id: `mask_${Date.now()}`,
      shape: draft.shape,
      subjectClass: draft.subjectClass,
      centerX: 0.5,
      centerY: 0.5,
      sizeX: 0.4,
      sizeY: 0.4,
      feather: 0,
    };
    addClipMask(selectedVideoClip.id, mask);
    setEditingId(mask.id);
  };

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void
  ): React.ReactNode => (
    <label className="flex items-center space-x-2 text-[11px] text-neutral-400">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-indigo-500"
      />
      <span className="w-10 text-right font-mono text-neutral-500">{value.toFixed(2)}</span>
    </label>
  );

  return (
    <div className="flex flex-col p-3 space-y-2 select-none">
      <div className="flex items-center space-x-2">
        <BoxSelect className="w-3.5 h-3.5 text-neutral-400" />
        <h3 className="text-xs font-semibold text-neutral-200 tracking-wide uppercase">Mask ({masks.length})</h3>
      </div>

      <div className="flex items-center space-x-1.5">
        <select
          aria-label="Mask shape"
          value={draft.shape}
          onChange={(e) => setDraft({ ...draft, shape: e.target.value as MaskShape })}
          className="bg-neutral-800 text-neutral-200 text-[11px] rounded px-1.5 py-0.5 border border-neutral-700"
        >
          {SHAPES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Subject class"
          value={draft.subjectClass}
          onChange={(e) => setDraft({ ...draft, subjectClass: e.target.value as MaskSubjectClass })}
          className="bg-neutral-800 text-neutral-200 text-[11px] rounded px-1.5 py-0.5 border border-neutral-700"
        >
          {CLASSES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          className="px-2 py-0.5 text-[11px] rounded border border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/60 transition-colors"
        >
          + Add
        </button>
      </div>

      {editing && (
        <div className="flex flex-col space-y-1.5 border-t border-neutral-800 pt-2">
          <div className="flex items-center space-x-1.5">
            <select
              aria-label="Edit mask"
              value={editing.id}
              onChange={(e) => setEditingId(e.target.value)}
              className="flex-1 bg-neutral-800 text-neutral-200 text-[11px] rounded px-1.5 py-0.5 border border-neutral-700"
            >
              {masks.map((m) => (
                <option key={m.id} value={m.id}>{m.shape} · {m.subjectClass}</option>
              ))}
            </select>
            <button
              onClick={() => {
                removeClipMask(selectedVideoClip.id, editing.id);
                setEditingId(null);
              }}
              className="px-2 py-0.5 text-[11px] rounded border border-red-500/30 text-red-300 hover:bg-red-950/60 transition-colors"
            >
              Remove
            </button>
          </div>
          {slider('Center X', editing.centerX, 0, 1, 0.01, (v) =>
            updateClipMask(selectedVideoClip.id, editing.id, { centerX: v })
          )}
          {slider('Center Y', editing.centerY, 0, 1, 0.01, (v) =>
            updateClipMask(selectedVideoClip.id, editing.id, { centerY: v })
          )}
          {slider('Size X', editing.sizeX, 0.05, 1, 0.01, (v) =>
            updateClipMask(selectedVideoClip.id, editing.id, { sizeX: v })
          )}
          {slider('Size Y', editing.sizeY, 0.05, 1, 0.01, (v) =>
            updateClipMask(selectedVideoClip.id, editing.id, { sizeY: v })
          )}
          {slider('Feather', editing.feather ?? 0, 0, 1, 0.01, (v) =>
            updateClipMask(selectedVideoClip.id, editing.id, { feather: v })
          )}
          <label className="flex items-center space-x-2 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              aria-label="Invert mask"
              checked={!!editing.invert}
              onChange={(e) => updateClipMask(selectedVideoClip.id, editing.id, { invert: e.target.checked })}
              className="accent-indigo-500"
            />
            <span>Invert (grade outside)</span>
          </label>
        </div>
      )}
    </div>
  );
};
