import React, { useState, useEffect } from 'react';
import { exportEngine, ExportConfig } from '../engine/exportEngine';
import { Share2, Cpu, CheckCircle, Loader2 } from 'lucide-react';
import { nativeBridge } from '../services/nativeBridge';

export const ExportModal: React.FC = () => {
  const [preset, setPreset] = useState<ExportConfig['presetName']>('TikTok / Reels (1080x1920)');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [availableEncoders, setAvailableEncoders] = useState<string[]>(['Software x264']);
  const [selectedEncoder, setSelectedEncoder] = useState<ExportConfig['encoder']>('Software x264');

  useEffect(() => {
    const fetchEncoders = async () => {
      try {
        const encoders = await nativeBridge.getAvailableEncoders();
        if (encoders && encoders.length > 1) {
          setAvailableEncoders(encoders);
          setSelectedEncoder(encoders[encoders.length - 1] as ExportConfig['encoder']); // select best hw encoder or fallback
        } else {
          setAvailableEncoders(['Software x264']);
          setSelectedEncoder('Software x264');
        }
      } catch (err) {
        console.warn('Failed to fetch encoders:', err);
      }
    };
    fetchEncoders();
  }, []);

  const presets: { name: ExportConfig['presetName']; w: number; h: number; fps: number; bitrate: number }[] = [
    { name: 'TikTok / Reels (1080x1920)', w: 1080, h: 1920, fps: 59.94, bitrate: 25 },
    { name: 'YouTube 4K', w: 3840, h: 2160, fps: 59.94, bitrate: 60 },
    { name: 'ProRes 422 HQ', w: 3840, h: 2160, fps: 24, bitrate: 220 },
    { name: 'Master Audio AAC', w: 0, h: 0, fps: 0, bitrate: 320 },
  ];

  const handleStartExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setIsComplete(false);

    const selectedPreset = presets.find((p) => p.name === preset) || presets[0];

    await exportEngine.renderSequence(
      {
        presetName: selectedPreset.name,
        width: selectedPreset.w,
        height: selectedPreset.h,
        fps: selectedPreset.fps,
        bitrateMbps: selectedPreset.bitrate,
        encoder: selectedEncoder,
        outputPath: `/exports/${selectedPreset.name.replace(/\s+/g, '_')}.mp4`,
      },
      (p) => setProgress(p)
    );

    setIsExporting(false);
    setIsComplete(true);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col space-y-4 max-w-md w-full shadow-2xl text-xs text-neutral-200 select-none">
      {/* Header */}
      <div className="flex items-center space-x-2 font-bold text-sm text-neutral-100 border-b border-neutral-800 pb-2">
        <Share2 className="w-4 h-4 text-indigo-400" />
        <span>Hardware Accelerated Export Studio</span>
      </div>

      {/* Preset Target Selection */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-neutral-400">Export Preset</label>
        <div className="grid grid-cols-1 gap-2">
          {presets.map((p) => (
            <button
              key={p.name}
              onClick={() => setPreset(p.name)}
              className={`flex items-center justify-between p-2.5 rounded border transition-all text-left ${
                preset === p.name
                  ? 'bg-indigo-950 border-indigo-500 text-white shadow-sm'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <div className="font-semibold">{p.name}</div>
              {p.w > 0 && (
                <div className="text-[10px] text-neutral-500 font-mono">
                  {p.w}x{p.h} @ {p.fps}fps ({p.bitrate}Mbps)
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Encoder Hardware Info */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-neutral-400">Encoder Selection</label>
        <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800 flex items-center justify-between font-mono text-[10px] text-neutral-400">
          <span className="flex items-center">
            <Cpu className="w-3.5 h-3.5 mr-1.5 text-green-400" /> Hardware Encoder:
          </span>
          {availableEncoders.length > 1 ? (
            <select
              data-testid="encoder-select"
              value={selectedEncoder}
              onChange={(e) => setSelectedEncoder(e.target.value as ExportConfig['encoder'])}
              className="bg-neutral-900 border border-neutral-700 text-green-300 font-semibold p-1 rounded"
            >
              {availableEncoders.map(enc => (
                <option key={enc} value={enc}>{enc}</option>
              ))}
            </select>
          ) : (
             <span data-testid="encoder-fallback" className="text-green-300 font-semibold">Software x264</span>
          )}
        </div>
      </div>

      {/* Render Progress Bar */}
      {isExporting && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-mono">
            <span className="flex items-center text-indigo-400">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Rendering Timeline...
            </span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800">
            <div
              style={{ width: `${progress}%` }}
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-200"
            />
          </div>
        </div>
      )}

      {/* Completion Banner */}
      {isComplete && (
        <div className="bg-emerald-950/80 border border-emerald-700 text-emerald-200 p-2.5 rounded flex items-center space-x-2 font-medium">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Render complete! Export saved to /exports folder.</span>
        </div>
      )}

      {/* Export Action Button */}
      <button
        disabled={isExporting}
        onClick={handleStartExport}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded shadow transition-all flex items-center justify-center space-x-2"
      >
        <Share2 className="w-4 h-4" />
        <span>{isExporting ? 'Exporting...' : 'Render & Export Video'}</span>
      </button>
    </div>
  );
};
