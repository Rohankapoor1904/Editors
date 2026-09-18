import { Command } from './index';
import { TimelineState } from '../../types/timeline';

export class CompoundCommand implements Command {
  private commands: Command[];

  constructor(commands: Command[]) {
    this.commands = commands;
  }

  apply(state: TimelineState): TimelineState {
    let currentState = state;
    for (const cmd of this.commands) {
      currentState = cmd.apply(currentState);
    }
    return currentState;
  }

  invert(state: TimelineState): TimelineState {
    let currentState = state;
    for (let i = this.commands.length - 1; i >= 0; i--) {
      currentState = this.commands[i].invert(currentState);
    }
    return currentState;
  }
}
