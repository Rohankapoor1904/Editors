import { sileroVadService } from './sileroVad';
import { whisperService } from './whisperTranscriber';
import { useTimelineStore } from '../store/timelineStore';
import { secondsToRational } from '../types/time';
import { isLiveMode, NotImplementedError } from './runtimeConfig';
import { Command, RippleDeleteCommand } from '../core/commands';
import { CompoundCommand } from '../core/commands/transaction';

export interface AgentStepLog {
  type: 'thought' | 'tool' | 'response' | 'user';
  message: string;
}

export class AgentOrchestratorService {
  /**
   * Autonomous ReAct Agent Execution Loop
   */
  async processPrompt(
    prompt: string,
    onLog: (log: AgentStepLog) => void
  ): Promise<void> {
    onLog({ type: 'user', message: prompt });

    if (isLiveMode()) {
      throw new NotImplementedError('ReAct Agent Tool & Reasoning Loop');
    }

    const lower = prompt.toLowerCase();

    if (lower.includes('silence') || lower.includes('pause')) {
      onLog({ type: 'thought', message: 'Analyzing audio track for silent pauses > 0.5s via Silero VAD...' });
      const silences = await sileroVadService.detectSilence('/demo/audio.wav', 0.5);

      // Sort silences in descending order by startTime to avoid shifting issues
      const sortedSilences = [...silences].sort((a, b) => b.startTime - a.startTime);
      const commands: Command[] = [];

      for (const silence of sortedSilences) {
        onLog({
          type: 'tool',
          message: `detect_silence() -> Found silence window (${silence.startTime}s to ${silence.endTime}s).`,
        });
        commands.push(
          new RippleDeleteCommand(
            secondsToRational(silence.startTime),
            secondsToRational(silence.duration)
          )
        );
      }

      if (commands.length > 0) {
        useTimelineStore.getState().executeCommand(new CompoundCommand(commands));
      }

      onLog({
        type: 'response',
        message: `Successfully removed ${silences.length} silent pause(s) from the timeline EDL.`,
      });
    } else if (lower.includes('caption') || lower.includes('subtitle') || lower.includes('transcribe')) {
      onLog({ type: 'thought', message: 'Generating frame-accurate transcript via local Whisper ONNX...' });
      const result = await whisperService.transcribeAudio('/demo/audio.wav');

      onLog({
        type: 'tool',
        message: `transcribe_and_align() -> Generated ${result.words.length} word timestamps.`,
      });

      onLog({
        type: 'response',
        message: `Successfully generated dynamic captions track!`,
      });
    } else {
      onLog({ type: 'thought', message: `Evaluating user intent for prompt: "${prompt}"...` });
      onLog({
        type: 'response',
        message: `Processed agent action: ${prompt}`,
      });
    }
  }
}

export const agentOrchestrator = new AgentOrchestratorService();
