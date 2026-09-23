import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { rationalToSeconds } from '../types/time';
import { ListOrdered, MapPin, Plus, X } from 'lucide-react';

/**
 * R24.7 — spreadsheet-style Sequence Index: every timeline clip in one
 * searchable table plus the marker list. Row click seeks the playhead
 * exactly and selects the clip; markers seek on click. Add/remove markers
 * inline. Pure store reads/writes — no invented rows.
 */
export const SequenceIndex: React.FC = () => {
  const {
    tracks,
    markers,
    selectedClipIds,
    selectClip,
    setPlayheadPosition,
    addMarker,
    removeMarker,
  } = useTimelineStore();
  const [query, setQuery] = React.useState('');
  const [markerName, setMarkerName] = React.useState('');

  const q = query.trim().toLowerCase();
  const safeMarkers = markers ?? [];
  const clipRows = tracks.flatMap((track) =>
    track.clips.map((clip) => ({ track, clip }))
  ).filter(
    ({ track, clip }) =>
      q.length === 0 ||
      clip.name.toLowerCase().includes(q) ||
      track.name.toLowerCase().includes(q)
  );
  const markerRows = safeMarkers.filter(
    (m) => q.length === 0 || m.name.toLowerCase().includes(q)
  );

  const fmt = (value: number): string => value.toFixed(2);

  return (
    <div className="bg-dark-900 border-b border-subtle max-h-64 overflow-y-auto text-xs">
      <div className="sticky top-0 bg-dark-900/95 backdrop-blur px-3 py-1.5 flex items-center space-x-2 border-b border-subtle">
        <ListOrdered className="w-3.5 h-3.5 text-indigo-400" />
        <span className="font-semibold text-neutral-200">Sequence Index</span>
        <input
          aria-label="Search sequence"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clips & markers…"
          className="flex-1 min-w-0 bg-dark-950 text-neutral-200 px-2 py-0.5 rounded border border-subtle focus:outline-none focus:border-indigo-accent text-[11px]"
        />
        <span className="text-[10px] font-mono text-neutral-500">
          {clipRows.length} clips · {markerRows.length} markers
        </span>
      </div>

      <table className="w-full text-left text-[11px]">
        <thead className="text-neutral-500 uppercase text-[9px] tracking-wide">
          <tr>
            <th className="px-3 py-1 font-medium">Track</th>
            <th className="px-3 py-1 font-medium">Clip</th>
            <th className="px-3 py-1 font-medium text-right">Start (s)</th>
            <th className="px-3 py-1 font-medium text-right">Duration (s)</th>
          </tr>
        </thead>
        <tbody>
          {clipRows.map(({ track, clip }) => {
            const selected = selectedClipIds.includes(clip.id);
            return (
              <tr
                key={clip.id}
                onClick={() => {
                  selectClip(clip.id);
                  setPlayheadPosition({ ...clip.startOffset });
                }}
                title={`Seek to ${clip.name}`}
                className={`cursor-pointer border-t border-subtle/50 transition-colors ${
                  selected ? 'bg-indigo-950/60 text-white' : 'text-neutral-300 hover:bg-dark-850'
                }`}
              >
                <td className="px-3 py-1 font-mono text-neutral-500">{track.name}</td>
                <td className="px-3 py-1 font-medium truncate max-w-[220px]">{clip.name}</td>
                <td className="px-3 py-1 text-right font-mono tabular-nums">
                  {fmt(rationalToSeconds(clip.startOffset))}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums">
                  {fmt(rationalToSeconds(clip.duration))}
                </td>
              </tr>
            );
          })}
          {clipRows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-2 text-center text-neutral-500">
                No clips match “{query}”.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="px-3 py-1.5 border-t border-subtle space-y-1">
        <div className="flex items-center space-x-2">
          <MapPin className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-neutral-300 text-[11px]">Markers</span>
          <input
            aria-label="New marker name"
            value={markerName}
            onChange={(e) => setMarkerName(e.target.value)}
            placeholder="Name for marker at playhead…"
            className="flex-1 min-w-0 bg-dark-950 text-neutral-200 px-2 py-0.5 rounded border border-subtle focus:outline-none focus:border-indigo-accent text-[11px]"
          />
          <button
            onClick={() => {
              addMarker(markerName.trim() || undefined);
              setMarkerName('');
            }}
            title="Add marker at playhead"
            className="p-1 text-neutral-400 hover:text-white"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {markerRows.map((m) => (
          <div key={m.id} className="flex items-center space-x-2 text-[11px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
            <button
              onClick={() => setPlayheadPosition({ ...m.time })}
              title={`Seek to ${m.name}`}
              className="flex-1 text-left truncate text-neutral-300 hover:text-white"
            >
              {m.name} <span className="font-mono text-neutral-500">{fmt(rationalToSeconds(m.time))}s</span>
            </button>
            <button
              onClick={() => removeMarker(m.id)}
              title={`Remove ${m.name}`}
              aria-label={`Remove marker ${m.name}`}
              className="text-neutral-600 hover:text-red-400"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
