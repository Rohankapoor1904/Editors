import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { RGBCurves } from '../engine/colorCurves';
import { computeAutoColorGrade } from '../engine/colorMatch';
import { webgpuEngine } from '../engine/webgpuRenderer';
import { Spline, Wand2 } from 'lucide-react';

const IDENTITY_PRESETS: Record<string, RGBCurves | undefined> = {
  Identity: undefined,
  'S-Contrast': {
    master: [
      { input: 0, output: 0 },
      { input: 0.25, output: 0.2 },
      { input: 0.75, output: 0.8 },
      { input: 1, output: 1 },
    ],
  },
  'Lifted Blacks': {
    master: [
      { input: 0, output: 0.08 },
      { input: 1, output: 1 },
    ],
  },
};

/**
 * R24.2 remainder — curves presets + 1-click Auto Color.
 * Writes ordinary `colorGrade` effect params through the undoable
 * updateClipEffect path. Auto Color samples the live monitor frame
 * (webgpuEngine.getImageData); the button stays disabled with an honest
 * tooltip when no frame is available instead of guessing pixels.
 */
export const ColorCurvesView: React.FC = () => {
  const { selectedClipIds, tracks, updateClipEffect } = useTimelineStore();

  const selectedVideoClip = React.useMemo(() => {
    return tracks
      .filter((t) => t.type === 'video')
      .flatMap((t) => t.clips)
      .find((c) => selectedClipIds.includes(c.id));
  }, [tracks, selectedClipIds]);

  const colorGradeEffect = selectedVideoClip?.effects?.find((e) => e.type === 'colorGrade') || null;
  const hasCurves = !!(colorGradeEffect?.params as { curves?: RGBCurves } | undefined)?.curves;

  const [frame, setFrame] = React.useState<ImageData | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const poll = (): void => {
      if (cancelled) return;
      try {
        const data = webgpuEngine.getImageData();
        if (!cancelled && data) setFrame(data);
      } catch {
        // No readable frame in this environment — button stays disabled.
      }
    };
    poll();
    const id = window.setInterval(poll, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!selectedVideoClip) {
    return (
      <div className="flex items-center justify-center p-3 text-neutral-600 text-[11px] select-none">
        <Spline className="w-4 h-4 mr-1.5" />
        Select a video clip to edit curves
      </div>
    );
  }

  const applyPreset = (name: string): void => {
    const effectId = colorGradeEffect?.id || 'color_grade_effect';
    updateClipEffect(selectedVideoClip.id, effectId, 'colorGrade', {
      curves: IDENTITY_PRESETS[name],
    });
  };

  const applyAutoColor = (): void => {
    if (!frame) return;
    const pixels: { r: number; g: number; b: number }[] = [];
    const stride = Math.max(1, Math.floor((frame.width * frame.height) / 20000));
    for (let i = 0; i < frame.width * frame.height; i += stride) {
      pixels.push({
        r: frame.data[i * 4] / 255,
        g: frame.data[i * 4 + 1] / 255,
        b: frame.data[i * 4 + 2] / 255,
      });
    }
    if (pixels.length === 0) return;
    const auto = computeAutoColorGrade(pixels);
    const effectId = colorGradeEffect?.id || 'color_grade_effect';
    updateClipEffect(selectedVideoClip.id, effectId, 'colorGrade', {
      temperature: auto.temperature,
      offset: auto.offset,
    });
  };

  return (
    <div className="flex flex-col p-3 space-y-2 select-none">
      <div className="flex items-center space-x-2">
        <Spline className="w-3.5 h-3.5 text-neutral-400" />
        <h3 className="text-xs font-semibold text-neutral-200 tracking-wide uppercase">Curves & Auto</h3>
        {hasCurves && (
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
            curves on
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.keys(IDENTITY_PRESETS).map((name) => (
          <button
            key={name}
            onClick={() => applyPreset(name)}
            className="px-2 py-0.5 text-[11px] rounded border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            {name}
          </button>
        ))}
        <button
          onClick={applyAutoColor}
          disabled={!frame}
          title={frame ? 'Balance white point + exposure from the monitor frame' : 'No readable frame yet — play or scrub the timeline first'}
          className="flex items-center space-x-1 px-2 py-0.5 text-[11px] rounded border border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Wand2 className="w-3 h-3" />
          <span>Auto Color</span>
        </button>
      </div>
    </div>
  );
};
