import { create } from 'zustand';
import { ExportPresetConfig, exportEngine } from './exportEngine';

export interface ExportJob {
  id: string;
  config: ExportPresetConfig;
  status: 'idle' | 'processing' | 'done' | 'failed';
  progress: number;
  error?: string;
}

interface ExportQueueStore {
  jobs: ExportJob[];
  isProcessing: boolean;
  addJob: (config: ExportPresetConfig) => void;
  updateJob: (id: string, updates: Partial<ExportJob>) => void;
  processNextJob: () => Promise<void>;
  clearCompleted: () => void;
}

export const useExportQueueStore = create<ExportQueueStore>((set, get) => ({
  jobs: [],
  isProcessing: false,
  addJob: (config: ExportPresetConfig) => {
    const newJob: ExportJob = {
      id: Math.random().toString(36).substring(2, 9),
      config,
      status: 'idle',
      progress: 0,
    };
    set((state) => ({ jobs: [...state.jobs, newJob] }));
    get().processNextJob();
  },
  updateJob: (id: string, updates: Partial<ExportJob>) => {
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...updates } : job)),
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
        get().updateJob(nextJob.id, { progress });
      });
      get().updateJob(nextJob.id, { status: 'done', progress: 100 });
    } catch (error: any) {
      get().updateJob(nextJob.id, { status: 'failed', error: error.message || 'Export failed' });
    } finally {
      set({ isProcessing: false });
      // Schedule the next job if there are any left
      setTimeout(() => {
        get().processNextJob();
      }, 0);
    }
  },
  clearCompleted: () => {
    set((state) => ({
      jobs: state.jobs.filter((job) => job.status !== 'done' && job.status !== 'failed'),
    }));
  },
}));
