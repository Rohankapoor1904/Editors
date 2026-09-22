import React, { useEffect, useRef } from 'react';
import { computeHistogram, computeRGBParade, computeVectorscope } from '../engine/scopes';

interface ScopesProps {
  imageData?: ImageData | null;
}

export const Scopes: React.FC<ScopesProps> = ({ imageData }) => {
  const histogramCanvas = useRef<HTMLCanvasElement>(null);
  const paradeCanvas = useRef<HTMLCanvasElement>(null);
  const vectorscopeCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!imageData) return;

    // --- Histogram ---
    if (histogramCanvas.current) {
      const ctx = histogramCanvas.current.getContext('2d');
      if (ctx) {
        const histData = computeHistogram(imageData);
        const w = histogramCanvas.current.width;
        const h = histogramCanvas.current.height;

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);

        ctx.globalCompositeOperation = 'screen';
        const max = Math.max(1, histData.maxCount);

        const drawChannel = (data: Uint32Array, color: string) => {
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let i = 0; i < 256; i++) {
            const x = (i / 255) * w;
            const y = h - (data[i] / max) * h;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.fillStyle = color;
          ctx.fill();
        };

        drawChannel(histData.r, 'rgba(255, 0, 0, 0.5)');
        drawChannel(histData.g, 'rgba(0, 255, 0, 0.5)');
        drawChannel(histData.b, 'rgba(0, 0, 255, 0.5)');

        ctx.globalCompositeOperation = 'source-over';

        ctx.beginPath();
        for (let i = 0; i < 256; i++) {
          const x = (i / 255) * w;
          const y = h - (histData.luma[i] / max) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // --- RGB Parade ---
    if (paradeCanvas.current) {
      const ctx = paradeCanvas.current.getContext('2d');
      if (ctx) {
        const paradeW = 256;
        const paradeData = computeRGBParade(imageData, paradeW);
        const w = paradeCanvas.current.width;
        const h = paradeCanvas.current.height;

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);

        const id = ctx.createImageData(w, h);
        const out = id.data;
        const max = Math.max(1, paradeData.maxCount);

        // Render 3 sections: R, G, B
        const sectionW = Math.floor(w / 3);

        for (let y = 0; y < 256; y++) {
          for (let x = 0; x < paradeW; x++) {
            const idx = y * paradeW + x;

            // Map 256x256 to canvas output
            const canvasY = h - 1 - Math.floor((y / 256) * h);

            // Red
            const rVal = paradeData.r[idx];
            if (rVal > 0) {
              const canvasX = Math.floor((x / paradeW) * sectionW);
              const pxIdx = (canvasY * w + canvasX) * 4;
              const intensity = (rVal / max) * 255;
              out[pxIdx] = 255;
              out[pxIdx+3] = Math.max(out[pxIdx+3], intensity);
            }

            // Green
            const gVal = paradeData.g[idx];
            if (gVal > 0) {
              const canvasX = sectionW + Math.floor((x / paradeW) * sectionW);
              const pxIdx = (canvasY * w + canvasX) * 4;
              const intensity = (gVal / max) * 255;
              out[pxIdx+1] = 255;
              out[pxIdx+3] = Math.max(out[pxIdx+3], intensity);
            }

            // Blue
            const bVal = paradeData.b[idx];
            if (bVal > 0) {
              const canvasX = sectionW * 2 + Math.floor((x / paradeW) * sectionW);
              const pxIdx = (canvasY * w + canvasX) * 4;
              const intensity = (bVal / max) * 255;
              out[pxIdx+2] = 255;
              out[pxIdx+3] = Math.max(out[pxIdx+3], intensity);
            }
          }
        }
        ctx.putImageData(id, 0, 0);
      }
    }

    // --- Vectorscope ---
    if (vectorscopeCanvas.current) {
      const ctx = vectorscopeCanvas.current.getContext('2d');
      if (ctx) {
        const size = 256;
        const vecData = computeVectorscope(imageData, size);
        const w = vectorscopeCanvas.current.width;
        const h = vectorscopeCanvas.current.height;

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);

        const id = ctx.createImageData(size, size);
        const out = id.data;
        const max = Math.max(1, vecData.maxCount);

        // Draw vectorscope points
        for (let i = 0; i < vecData.data.length; i++) {
          if (vecData.data[i] > 0) {
            const intensity = (vecData.data[i] / max) * 255;
            const pxIdx = i * 4;
            // Draw as green-ish points
            out[pxIdx] = 100;
            out[pxIdx+1] = 255;
            out[pxIdx+2] = 100;
            out[pxIdx+3] = intensity;
          }
        }

        // We'll use a temporary canvas to draw the 256x256 image data,
        // then scale it to the output canvas size
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = size;
        tempCanvas.height = size;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.putImageData(id, 0, 0);
            ctx.drawImage(tempCanvas, 0, 0, w, h);
        }

        // Draw graticule
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Crosshair
        ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h);
        ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
        // Circle
        ctx.arc(w/2, h/2, w/2 - 2, 0, 2*Math.PI);
        ctx.stroke();
      }
    }

  }, [imageData]);

  const [scopeMode, setScopeMode] = React.useState<'all' | 'parade' | 'histogram' | 'vectorscope'>('all');

  return (
    <div className="flex flex-col h-full bg-[#0d0f17] text-white select-none">
      {/* Scope Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08] bg-dark-950/80 shrink-0">
        <div className="flex items-center space-x-2">
          <h2 className="font-semibold text-xs text-neutral-200 tracking-wide">Video Scopes</h2>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-dark-800 text-neutral-400 border border-subtle">
            REC.709
          </span>
        </div>

        {/* Scope Type Tabs */}
        <div className="flex items-center bg-dark-950 p-0.5 rounded-lg border border-subtle text-[10px]">
          {(['all', 'parade', 'histogram', 'vectorscope'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setScopeMode(mode)}
              className={`px-2 py-0.5 rounded transition-all capitalize ${
                scopeMode === mode
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {mode === 'all' ? 'All 3-Up' : mode === 'parade' ? 'Parade' : mode === 'histogram' ? 'Histogram' : 'Vector'}
            </button>
          ))}
        </div>
      </div>

      {/* Scope Visualizer Surface */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* RGB Parade */}
        {(scopeMode === 'all' || scopeMode === 'parade') && (
          <div className="rounded-xl border border-white/[0.08] bg-dark-900/60 p-2.5 shadow-sm">
            <div className="flex items-center justify-between text-[11px] mb-1.5 font-medium text-neutral-400">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                <span className="text-neutral-200">RGB Parade</span>
              </span>
              <div className="flex items-center space-x-2 text-[9px] font-mono">
                <span className="text-red-400 font-bold">R</span>
                <span className="text-emerald-400 font-bold">G</span>
                <span className="text-blue-400 font-bold">B</span>
              </div>
            </div>
            <div className="w-full bg-black rounded-lg border border-neutral-800/90 overflow-hidden flex items-center justify-center p-1">
              <canvas
                ref={paradeCanvas}
                width={384}
                height={128}
                className="w-full h-auto max-h-[140px] object-contain rounded"
              />
            </div>
          </div>
        )}

        {/* Histogram */}
        {(scopeMode === 'all' || scopeMode === 'histogram') && (
          <div className="rounded-xl border border-white/[0.08] bg-dark-900/60 p-2.5 shadow-sm">
            <div className="flex items-center justify-between text-[11px] mb-1.5 font-medium text-neutral-400">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-neutral-200">Histogram</span>
              </span>
              <span className="text-[9px] font-mono text-neutral-500">RGB + Luma</span>
            </div>
            <div className="w-full bg-black rounded-lg border border-neutral-800/90 overflow-hidden flex items-center justify-center p-1">
              <canvas
                ref={histogramCanvas}
                width={256}
                height={128}
                className="w-full h-auto max-h-[130px] object-contain rounded"
              />
            </div>
          </div>
        )}

        {/* Vectorscope */}
        {(scopeMode === 'all' || scopeMode === 'vectorscope') && (
          <div className="rounded-xl border border-white/[0.08] bg-dark-900/60 p-2.5 shadow-sm">
            <div className="flex items-center justify-between text-[11px] mb-1.5 font-medium text-neutral-400">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-400" />
                <span className="text-neutral-200">Vectorscope</span>
              </span>
              <span className="text-[9px] font-mono text-neutral-500">Hue / Saturation</span>
            </div>
            <div className="w-full bg-black rounded-lg border border-neutral-800/90 overflow-hidden flex items-center justify-center p-1">
              <canvas
                ref={vectorscopeCanvas}
                width={160}
                height={160}
                className="w-auto h-36 aspect-square object-contain rounded mx-auto"
              />
            </div>
          </div>
        )}

        {!imageData && (
          <div className="text-center py-2 px-3 rounded-lg bg-neutral-900/40 border border-neutral-800/50">
            <p className="text-[10px] text-neutral-500 font-mono">
              Awaiting video frame — play timeline to inspect real-time scopes
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
