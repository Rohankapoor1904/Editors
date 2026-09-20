import { useTimelineStore } from '../store/timelineStore';
import { agentOrchestrator } from './agentOrchestrator';
import { globalToolRegistry } from './tools/registry';
import { CompoundCommand } from '../core/commands/transaction';
import { Clip } from '../types/timeline';

const AGENT_BRIDGE_BASE = 'http://localhost:3000/api/agent';

class AgentBridgeClient {
  private isRunning = false;
  private connected = false;
  private pollInterval: any = null;
  private heartbeatInterval: any = null;

  public isConnected(): boolean {
    return this.connected;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Start heartbeat
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 2000);

    // Start polling for agent commands
    this.pollLoop();
  }

  public stop() {
    this.isRunning = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.pollInterval) clearTimeout(this.pollInterval);
  }

  private getSnapshot() {
    const state = useTimelineStore.getState();
    return {
      activeWorkspace: state.activeWorkspace,
      metadata: state.metadata,
      playhead: state.playheadPosition,
      tracksCount: state.tracks.length,
      clipsCount: state.tracks.reduce((acc, t) => acc + t.clips.length, 0),
      selectedClipIds: state.selectedClipIds,
      timeline: {
        tracks: state.tracks.map(t => ({
          id: t.id,
          name: t.name,
          type: t.type,
          clips: t.clips.map(c => ({
            id: c.id,
            name: c.name,
            startOffset: c.startOffset,
            duration: c.duration,
            sourceIn: c.sourceIn,
            sourceOut: c.sourceOut,
          }))
        }))
      }
    };
  }

  private async sendHeartbeat() {
    try {
      const snapshot = this.getSnapshot();

      const res = await fetch(`${AGENT_BRIDGE_BASE}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });

      if (res.ok) {
        this.connected = true;
      }
    } catch {
      this.connected = false;
    }
  }

  private async pollLoop() {
    if (!this.isRunning) return;

    try {
      const res = await fetch(`${AGENT_BRIDGE_BASE}/pending`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tasks) && data.tasks.length > 0) {
          for (const task of data.tasks) {
            await this.handleTask(task);
          }
        }
      }
    } catch {
      // Ignored during server restart / offline
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollInterval = setTimeout(() => this.pollLoop(), 350);
    }
  }

  private async handleTask(task: { id: string; type: string; payload: any }) {
    try {
      let result: any = null;

      if (task.type === 'prompt') {
        const { prompt } = task.payload;
        const logs: string[] = [];
        const commands = await agentOrchestrator.processPrompt(prompt, (log) => {
          logs.push(`[${log.type}] ${log.message}`);
        });

        if (commands && commands.length > 0) {
          useTimelineStore.getState().executeCommand(new CompoundCommand(commands));
        }

        result = {
          prompt,
          commandsCount: commands.length,
          logs,
          timeline: {
            tracks: useTimelineStore.getState().tracks.map(t => ({
              id: t.id,
              name: t.name,
              type: t.type,
              clipsCount: t.clips.length,
            }))
          }
        };
      } else if (task.type === 'tool') {
        const { tool, args } = task.payload;
        const toolResult = await globalToolRegistry.execute(tool, args);

        if (toolResult && typeof (toolResult as any).apply === 'function') {
          useTimelineStore.getState().executeCommand(toolResult as any);
        } else if (Array.isArray(toolResult) && toolResult.every(r => r && typeof r.apply === 'function')) {
          useTimelineStore.getState().executeCommand(new CompoundCommand(toolResult));
        }

        result = {
          tool,
          toolResult: toolResult && (toolResult as any).error ? toolResult : 'Executed successfully',
        };
      } else if (task.type === 'action') {
        const payload = task.payload;
        const store = useTimelineStore.getState();

        switch (payload.action) {
          case 'set_workspace':
            store.setWorkspace(payload.workspace);
            result = { workspace: payload.workspace };
            break;

          case 'undo':
            store.undo();
            result = { undone: true };
            break;

          case 'redo':
            store.redo();
            result = { redone: true };
            break;

          case 'seek':
            store.setPlayheadPosition({ value: payload.seconds || 0, rate: 1 });
            result = { playhead: store.playheadPosition };
            break;

          case 'add_sample_clip': {
            const track = store.tracks[0];
            if (track) {
              const sampleClip: Clip = {
                id: `sample-${Date.now()}`,
                name: payload.name || 'RAW_Cinema_Take_4K.mov',
                assetId: 'sample-asset-1',
                startOffset: { value: 0, rate: 1 },
                duration: { value: payload.duration || 30, rate: 1 },
                sourceIn: { value: 0, rate: 1 },
                sourceOut: { value: payload.duration || 30, rate: 1 },
                volume: 0,
                pan: 0,
                muted: false,
              };
              store.addClipToTrack(track.id, sampleClip);
              result = { addedClip: sampleClip };
            } else {
              result = { error: 'No video track found' };
            }
            break;
          }

          default:
            result = { error: `Unknown action: ${payload.action}` };
        }
      }

      // Report result and fresh state snapshot back to server
      await fetch(`${AGENT_BRIDGE_BASE}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, result, state: this.getSnapshot() }),
      });
    } catch (err: any) {
      await fetch(`${AGENT_BRIDGE_BASE}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, error: err.message || String(err), state: this.getSnapshot() }),
      });
    }
  }
}

export const agentBridge = new AgentBridgeClient();
