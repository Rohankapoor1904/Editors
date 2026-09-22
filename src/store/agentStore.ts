import { create } from 'zustand';
import { Command } from '../core/commands';

export interface ActionDiff {
  id: string;
  type: 'cut' | 'subtitle' | 'denoise' | 'color';
  title: string;
  description: string;
  changeType: 'removed' | 'added' | 'modified';
  timestamp: string;
  status: 'pending' | 'accepted' | 'rejected';
  command?: Command;
}

export interface AgentLog {
  id: string;
  type: 'user' | 'thought' | 'tool' | 'response';
  message: string;
  timestamp: string;
}

export interface AgentTask {
  id: string;
  source: 'copilot' | 'bridge' | 'model';
  prompt?: string;
  tool?: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  currentStep: number; // -1: idle/waiting, 0: Analyzing, 1: Transcribing/Reasoning, 2: Slicing/Tool Execution, 3: Arranging/Completed
  currentStepLabel?: string;
  logs: AgentLog[];
  commandsCount?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AgentStoreState {
  isConnected: boolean;
  activeModel: string;
  bridgeAvailability: 'unknown' | 'dev-middleware' | 'unavailable-in-production';
  bridgeUrl: string;
  currentTask: AgentTask | null;
  taskHistory: AgentTask[];
  actionDiffs: ActionDiff[];
  isProcessing: boolean;

  // Actions
  setConnected: (connected: boolean) => void;
  setActiveModel: (model: string) => void;
  setBridgeAvailability: (availability: 'unknown' | 'dev-middleware' | 'unavailable-in-production') => void;
  setBridgeUrl: (url: string) => void;
  startTask: (params: { source: 'copilot' | 'bridge' | 'model'; prompt?: string; tool?: string }) => string;
  updateTaskStep: (taskId: string, step: number, stepLabel?: string) => void;
  addTaskLog: (taskId: string, log: { type: 'user' | 'thought' | 'tool' | 'response'; message: string }) => void;
  completeTask: (taskId: string, commandsCount?: number) => void;
  failTask: (taskId: string, error: string) => void;
  addActionDiff: (diff: ActionDiff) => void;
  updateActionDiffStatus: (diffId: string, status: 'accepted' | 'rejected') => void;
  acceptAllDiffs: () => void;
  rollbackDiffs: () => void;
  clearHistory: () => void;
}

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  isConnected: false,
  activeModel: 'CineCraft ReAct Copilot (Whisper ONNX + WebGPU)',
  bridgeAvailability: 'unknown',
  bridgeUrl: '',
  currentTask: null,
  taskHistory: [],
  actionDiffs: [],
  isProcessing: false,

  setConnected: (connected) => set({ isConnected: connected }),

  setActiveModel: (model) => set({ activeModel: model }),

  setBridgeAvailability: (availability) => set({ bridgeAvailability: availability }),

  setBridgeUrl: (url) => set({ bridgeUrl: url }),

  startTask: ({ source, prompt, tool }) => {
    const id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newTask: AgentTask = {
      id,
      source,
      prompt,
      tool,
      status: 'running',
      currentStep: 0,
      currentStepLabel: 'Analyzing intent...',
      logs: prompt ? [{
        id: `log-${Date.now()}-0`,
        type: 'user',
        message: prompt,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }] : [],
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    set({
      currentTask: newTask,
      isProcessing: true,
    });

    return id;
  },

  updateTaskStep: (taskId, step, stepLabel) => {
    const current = get().currentTask;
    if (current && current.id === taskId) {
      set({
        currentTask: {
          ...current,
          currentStep: step,
          currentStepLabel: stepLabel || current.currentStepLabel,
        },
      });
    }
  },

  addTaskLog: (taskId, log) => {
    const current = get().currentTask;
    if (current && current.id === taskId) {
      const newLog: AgentLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: log.type,
        message: log.message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      set({
        currentTask: {
          ...current,
          logs: [...current.logs, newLog],
        },
      });
    }
  },

  completeTask: (taskId, commandsCount = 0) => {
    const current = get().currentTask;
    if (current && current.id === taskId) {
      const completedTask: AgentTask = {
        ...current,
        status: 'completed',
        currentStep: 3,
        currentStepLabel: 'Arranging completed',
        commandsCount,
        completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      set({
        currentTask: completedTask,
        taskHistory: [completedTask, ...get().taskHistory.slice(0, 19)],
        isProcessing: false,
      });
    }
  },

  failTask: (taskId, error) => {
    const current = get().currentTask;
    if (current && current.id === taskId) {
      const failedTask: AgentTask = {
        ...current,
        status: 'failed',
        error,
        completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      set({
        currentTask: failedTask,
        taskHistory: [failedTask, ...get().taskHistory.slice(0, 19)],
        isProcessing: false,
      });
    }
  },

  addActionDiff: (diff) => {
    set({ actionDiffs: [diff, ...get().actionDiffs] });
  },

  updateActionDiffStatus: (diffId, status) => {
    set({
      actionDiffs: get().actionDiffs.map((d) => (d.id === diffId ? { ...d, status } : d)),
    });
  },

  acceptAllDiffs: () => {
    set({
      actionDiffs: get().actionDiffs.map((d) =>
        d.status === 'pending' ? { ...d, status: 'accepted' as const } : d
      ),
    });
  },

  rollbackDiffs: () => {
    set({
      actionDiffs: get().actionDiffs.map((d) =>
        d.status === 'pending' ? { ...d, status: 'rejected' as const } : d
      ),
    });
  },

  clearHistory: () => {
    set({ taskHistory: [] });
  },
}));
