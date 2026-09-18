import React from 'react';
import { useExportQueueStore } from '../engine/exportQueue';
import { Loader2, CheckCircle, ShieldAlert, Trash2 } from 'lucide-react';

export const ExportQueue: React.FC = () => {
  const { jobs, clearCompleted } = useExportQueueStore();

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-neutral-800 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          Render Queue ({jobs.length})
        </h3>
        {jobs.some(j => j.status === 'done' || j.status === 'failed') && (
          <button
            onClick={clearCompleted}
            className="flex items-center space-x-1 text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear Finished</span>
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
        {jobs.map((job) => (
          <div key={job.id} className="bg-neutral-950 border border-neutral-800 rounded p-2.5 flex flex-col space-y-2">
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <span className="font-semibold text-neutral-200 text-xs">{job.config.presetName}</span>
                <span className="text-[10px] text-neutral-500 font-mono truncate max-w-[200px]">
                  {job.config.outputPath}
                </span>
              </div>
              <div className="flex items-center space-x-1.5 shrink-0">
                {job.status === 'idle' && (
                  <span className="text-[10px] text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded font-medium">
                    Queued
                  </span>
                )}
                {job.status === 'processing' && (
                  <span className="text-[10px] text-indigo-400 bg-indigo-950/30 border border-indigo-900/50 px-1.5 py-0.5 rounded flex items-center font-medium">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    {job.progress.toFixed(0)}%
                  </span>
                )}
                {job.status === 'done' && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-1.5 py-0.5 rounded flex items-center font-medium">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Done
                  </span>
                )}
                {job.status === 'failed' && (
                  <span className="text-[10px] text-red-400 bg-red-950/30 border border-red-900/50 px-1.5 py-0.5 rounded flex items-center font-medium" title={job.error}>
                    <ShieldAlert className="w-3 h-3 mr-1" />
                    Failed
                  </span>
                )}
              </div>
            </div>

            {job.status === 'processing' && (
              <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${job.progress}%` }}
                  className="bg-indigo-500 h-full transition-all duration-200"
                />
              </div>
            )}

            {job.status === 'failed' && job.error && (
              <div className="text-[10px] text-red-400/80 mt-1 font-mono leading-tight">
                {job.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
