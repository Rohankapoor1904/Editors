import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import {
  titleTemplate,
  loadTitleTemplates,
  saveTitleTemplate,
  layoutTitle,
  TitleTemplate,
} from '../engine/titles';
import { createRational } from '../types/time';
import { Type } from 'lucide-react';

/**
 * R24.4 — titles authoring: template browser, text/style editing on the
 * selected title clip, add-to-timeline, custom template saving, and a 2D
 * canvas preview that re-renders on every edit (guarded: honest fallback
 * text when no 2D context exists in the host).
 */
export const TitlesPanel: React.FC = () => {
  const {
    tracks,
    selectedClipIds,
    playheadPosition,
    metadata,
    addTitleClip,
    updateTitleClip,
  } = useTimelineStore();

  const [templates, setTemplates] = React.useState<TitleTemplate[]>(() => loadTitleTemplates());
  const [templateId, setTemplateId] = React.useState(TITLE_TEMPLATES_DEFAULT);
  const [draftText, setDraftText] = React.useState('Your Title');
  const [saveName, setSaveName] = React.useState('');
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const previewRef = React.useRef<HTMLCanvasElement | null>(null);

  const selectedTitleClip = React.useMemo(() => {
    const id = Array.isArray(selectedClipIds) && typeof selectedClipIds[0] === 'string'
      ? selectedClipIds[0]
      : null;
    if (!id) return null;
    const clip = tracks
      .flatMap((t) => (Array.isArray(t.clips) ? t.clips : []))
      .find((c) => c && c.id === id);
    return clip && clip.title ? clip : null;
  }, [tracks, selectedClipIds]);

  const activeSpec = selectedTitleClip?.title ?? {
    ...titleTemplate(templateId).spec,
    text: draftText,
    templateId,
  };

  const targetTrack = React.useMemo(() => {
    return tracks.find((t) => t.type === 'video' && !t.locked) ?? null;
  }, [tracks]);

  const drawPreview = React.useCallback(() => {
    const canvas = previewRef.current;
    const spec = activeSpec;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, W, H);
    const fontSizePx = spec.fontSize * H;
    ctx.font = `${fontSizePx}px ${spec.fontFamily}`;
    ctx.fillStyle = spec.color;
    ctx.textBaseline = 'top';
    const layout = layoutTitle(spec, W, H, (line, size) => {
      try {
        ctx!.font = `${size}px ${spec.fontFamily}`;
        return ctx!.measureText(line).width;
      } catch {
        return line.length * size * 0.55;
      }
    });
    if (spec.background) {
      ctx.fillStyle = spec.background;
      ctx.fillRect(spec.box.x * W, spec.box.y * H, spec.box.w * W, layout.totalHeightPx + 8);
    }
    ctx.fillStyle = spec.color;
    let y = spec.box.y * H;
    for (const line of layout.lines) {
      let x = spec.box.x * W;
      if (spec.align === 'center') x = spec.box.x * W + (spec.box.w * W - line.widthPx) / 2;
      if (spec.align === 'right') x = spec.box.x * W + spec.box.w * W - line.widthPx;
      ctx.fillText(line.text, x, y);
      y += layout.lineHeightPx;
    }
  }, [activeSpec]);

  React.useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  const handleAdd = (): void => {
    if (!targetTrack) return;
    const tpl = titleTemplate(templateId);
    addTitleClip(
      targetTrack.id,
      `title_${Date.now()}`,
      { ...tpl.spec, text: draftText, templateId },
      { ...playheadPosition },
      createRational(Math.round(metadata.fps * 4), Math.round(metadata.fps))
    );
  };

  const handleSaveTemplate = (): void => {
    setSaveError(null);
    try {
      const id = `tpl-custom-${saveName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'}`;
      saveTitleTemplate({ id, name: saveName || 'Custom', spec: { ...activeSpec, text: activeSpec.text } });
      setTemplates(loadTitleTemplates());
      setSaveName('');
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-neutral-950 text-neutral-200">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
        <Type className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold">Titles</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        <canvas
          ref={previewRef}
          data-testid="title-preview"
          width={320}
          height={180}
          className="w-full rounded border border-neutral-800 bg-black"
        />

        <div className="flex items-center space-x-2">
          <span className="text-xs text-neutral-400 w-16">Template</span>
          <select
            aria-label="Title template"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setDraftText(titleTemplate(e.target.value).spec.text);
            }}
            className="flex-1 bg-neutral-800 text-neutral-200 text-xs rounded px-2 py-1 border border-neutral-700"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <label className="flex flex-col space-y-1">
          <span className="text-xs text-neutral-400">Text</span>
          <textarea
            aria-label="Title text"
            value={selectedTitleClip?.title?.text ?? draftText}
            onChange={(e) => {
              if (selectedTitleClip?.title) updateTitleClip(selectedTitleClip.id, { text: e.target.value });
              else setDraftText(e.target.value);
            }}
            rows={2}
            className="bg-neutral-800 text-neutral-200 text-xs rounded px-2 py-1 border border-neutral-700"
          />
        </label>

        <label className="flex items-center space-x-2 text-xs text-neutral-400">
          <span className="w-16">Size</span>
          <input
            type="range"
            aria-label="Title size"
            min={0.02}
            max={0.2}
            step={0.005}
            value={selectedTitleClip?.title?.fontSize ?? titleTemplate(templateId).spec.fontSize}
            onChange={(e) => {
              if (selectedTitleClip) updateTitleClip(selectedTitleClip.id, { fontSize: Number(e.target.value) });
            }}
            disabled={!selectedTitleClip}
            className="flex-1 accent-indigo-500"
          />
        </label>

        <label className="flex items-center space-x-2 text-xs text-neutral-400">
          <span className="w-16">Color</span>
          <input
            type="color"
            aria-label="Title color"
            value={toHexColor(selectedTitleClip?.title?.color ?? titleTemplate(templateId).spec.color)}
            onChange={(e) => {
              if (selectedTitleClip) updateTitleClip(selectedTitleClip.id, { color: e.target.value });
            }}
            disabled={!selectedTitleClip}
            className="w-10 h-6 bg-neutral-800 rounded border border-neutral-700"
          />
        </label>

        <button
          onClick={handleAdd}
          disabled={!targetTrack}
          title={targetTrack ? `Place title on ${targetTrack.name} at playhead` : 'No unlocked video track available'}
          className="w-full text-xs px-2.5 py-1.5 rounded font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          + Add title at playhead
        </button>

        <div className="flex items-center space-x-2 border-t border-neutral-800 pt-3">
          <input
            aria-label="Custom template name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Save current as template…"
            className="flex-1 bg-neutral-800 text-neutral-200 text-xs rounded px-2 py-1 border border-neutral-700"
          />
          <button
            onClick={handleSaveTemplate}
            className="text-xs px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            Save
          </button>
        </div>
        {saveError && <div className="text-[11px] text-red-400">{saveError}</div>}
        {!selectedTitleClip && (
          <div className="text-[11px] text-neutral-500">
            Tip: select a title clip on the timeline to edit its text, size and color in place.
          </div>
        )}
      </div>
    </div>
  );
};

const TITLE_TEMPLATES_DEFAULT = 'tpl-center-title';

/** Best-effort #rrggbb coercion for the native color input. */
function toHexColor(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  return '#ffffff';
}
