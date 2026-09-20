import React, { useEffect, useState, useRef } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { audioEngine } from '../engine/audioEngine';
import { Track } from '../types/timeline';

// A helper to map dB to a height percentage (assuming -48dB to +12dB range)
const dbToPercent = (db: number) => {
  const minDb = -48;
  const maxDb = 12;
  const clampedDb = Math.max(minDb, Math.min(maxDb, db));
  return ((clampedDb - minDb) / (maxDb - minDb)) * 100;
};

const TrackStrip: React.FC<{ track: Track }> = ({ track }) => {
  const toggleTrackState = useTimelineStore(state => state.toggleTrackState);

  // Track visual levels
  const [levels, setLevels] = useState<[number, number]>([-60, -60]);
  const frameRef = useRef<number>();

  useEffect(() => {
    const updateMeters = () => {
      const newLevels = audioEngine.getTrackLevels(track.id);
      setLevels(newLevels);
      frameRef.current = requestAnimationFrame(updateMeters);
    };
    frameRef.current = requestAnimationFrame(updateMeters);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [track.id]);

  // Read volume from clip state or default to 0
  // For a track mixer, ideally the track itself has a volume property.
  // The current timeline store doesn't have track.volume, but it expects us to set track volume via audioEngine.
  // We'll manage local UI state for the fader here if there's no track volume in the store.
  // We can also initialize it to 0.
  const [volume, setVolume] = useState(0);
  const [pan, setPan] = useState(0);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    audioEngine.setTrackVolume(track.id, newVol);
  };

  const handlePanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPan = parseFloat(e.target.value);
    setPan(newPan);
    audioEngine.setTrackPan(track.id, newPan);
  };

  return (
    <div className="flex flex-col items-center flex-1 bg-neutral-950 p-3 rounded-md border border-neutral-800" data-testid={`track-fader-${track.id}`}>
      <div className="text-xs font-semibold text-neutral-400 mb-2 truncate w-full text-center" title={track.name}>
        {track.name}
      </div>

      <div className="flex space-x-2 mb-4 w-full justify-center">
        <button
          onClick={() => toggleTrackState(track.id, 'muted')}
          className={`w-8 h-8 rounded text-xs font-bold transition-colors ${track.muted ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
          title="Mute"
        >
          M
        </button>
        <button
          onClick={() => toggleTrackState(track.id, 'solo')}
          className={`w-8 h-8 rounded text-xs font-bold transition-colors ${track.solo ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
          title="Solo"
        >
          S
        </button>
      </div>

      <div className="flex flex-col items-center mb-4 w-full">
        <div className="text-[10px] text-neutral-500 mb-1 flex justify-between w-full px-2">
           <span>L</span>
           <span>{pan > 0 ? `+${pan.toFixed(2)}` : pan.toFixed(2)}</span>
           <span>R</span>
        </div>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={pan}
          onChange={handlePanChange}
          className="w-16 h-2 appearance-none bg-neutral-700 outline-none rounded-full"
        />
      </div>

      <div className="flex space-x-2 h-48 mb-2">
        {/* Left Meter */}
        <div className="w-2 h-full bg-neutral-900 rounded-full flex flex-col justify-end overflow-hidden border border-neutral-800">
          <div
             className="w-full bg-green-500 transition-all duration-75"
             style={{ height: `${dbToPercent(levels[0])}%`, backgroundColor: levels[0] > -3 ? '#ef4444' : levels[0] > -12 ? '#eab308' : '#22c55e' }}
          />
        </div>

        {/* Fader */}
        <input
          type="range"
          min="-48"
          max="12"
          step="1"
          value={volume}
          onChange={handleVolumeChange}
          className="w-4 h-full appearance-none bg-neutral-800 outline-none rounded-full"
          style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
        />

        {/* Right Meter */}
        <div className="w-2 h-full bg-neutral-900 rounded-full flex flex-col justify-end overflow-hidden border border-neutral-800">
          <div
             className="w-full bg-green-500 transition-all duration-75"
             style={{ height: `${dbToPercent(levels[1])}%`, backgroundColor: levels[1] > -3 ? '#ef4444' : levels[1] > -12 ? '#eab308' : '#22c55e' }}
          />
        </div>
      </div>

      <div className="text-[10px] text-neutral-400 font-mono w-full text-center">
        {volume > 0 ? `+${volume.toFixed(1)}` : volume.toFixed(1)} dB
      </div>
    </div>
  );
};

export const AudioMixer: React.FC = () => {
  const tracks = useTimelineStore((state) => state.tracks);
  const audioTracks = tracks.filter((t) => t.type === 'audio');

  return (
    <div className="bg-neutral-900 p-4 rounded-md border border-neutral-800 flex-1 overflow-x-auto">
      <h3 className="text-sm font-semibold mb-4 text-neutral-300">Track Mixer</h3>
      <div className="flex space-x-4 min-w-max">
        {audioTracks.map(track => (
          <TrackStrip key={track.id} track={track} />
        ))}
      </div>
    </div>
  );
};
