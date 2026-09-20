import { create } from 'zustand';
import { ExportPresetConfig, exportEngine } from './exportEngine';

export interface ExportJob {
  id: string;
  config: ExportPresetConfig;
  status: 'idle' | 'processing' | 'done' | 'failed' | 'canceled';
  progress: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
  speedFps?: number;
}

interface ExportQueueStore {
  jobs: ExportJob[];
  isProcessing: boolean;
  addJob: (config: ExportPresetConfig) => string;
  updateJob: (id: string, updates: Partial<ExportJob>) => void;
  cancelJob: (id: string) => void;
  retryJob: (id: string) => void;
  removeJob: (id: string) => void;
  processNextJob: () => Promise<void>;
  clearCompleted: () => void;
}

export const useExportQueueStore = create<ExportQueueStore>((set, get) => ({
  jobs: [],
  isProcessing: false,

  addJob: (config: ExportPresetConfig) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newJob: ExportJob = {
      id: jobId,
      config,
      status: 'idle',
      progress: 0,
      createdAt: Date.now(),
    };
    set((state) => ({ jobs: [...state.jobs, newJob] }));
    get().processNextJob();
    return jobId;
  },

  updateJob: (id: string, updates: Partial<ExportJob>) => {
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...updates } : job)),
    }));
  },

  cancelJob: (id: string) => {
    const state = get();
    const target = state.jobs.find((j) => j.id === id);
    if (!target) return;

    if (target.status === 'processing') {
      get().updateJob(id, { status: 'canceled', error: 'Canceled by user' });
      set({ isProcessing: false });
      setTimeout(() => get().processNextJob(), 50);
    } else if (target.status === 'idle') {
      get().updateJob(id, { status: 'canceled', error: 'Canceled before start' });
    }
  },

  retryJob: (id: string) => {
    get().updateJob(id, { status: 'idle', progress: 0, error: undefined });
    get().processNextJob();
  },

  removeJob: (id: string) => {
    set((state) => ({
      jobs: state.jobs.filter((j) => j.id !== id),
    }));
  },

  processNextJob: async () => {
    const state = get();
    if (state.isProcessing) return;

    const nextJob = state.jobs.find((job) => job.status === 'idle');
    if (!nextJob) return;

    set({ isProcessing: true });
    get().updateJob(nextJob.id, { status: 'processing', progress: 0 });

    try {
      await exportEngine.renderSequence(nextJob.config, (progress) => {
        // If canceled mid-flight, do not overwrite canceled status
        const current = get().jobs.find((j) => j.id === nextJob.id);
        if (current?.status === 'canceled') return;

        get().updateJob(nextJob.id, { progress });
      });

      const current = get().jobs.find((j) => j.id === nextJob.id);
      if (current?.status !== 'canceled') {
        get().updateJob(nextJob.id, { status: 'done', progress: 100, completedAt: Date.now() });
      }
    } catch (error: any) {
      const current = get().jobs.find((j) => j.id === nextJob.id);
      if (current?.status !== 'canceled') {
        get().updateJob(nextJob.id, {
          status: 'failed',
          error: error.message || 'Export failed',
          completedAt: Date.now(),
        });
      }
    } finally {
      set({ isProcessing: false });
      // Schedule the next job in FIFO queue asynchronously
      setTimeout(() => {
        get().processNextJob();
      }, 0);
    }
  },

  clearCompleted: () => {
    set((state) => ({
      jobs: state.jobs.filter((job) => job.status !== 'done' && job.status !== 'failed' && job.status !== 'canceled'),
    }));
  },
}));
