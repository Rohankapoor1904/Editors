import { TimelineState } from '../../types/timeline';

export interface Command {
  apply: (state: TimelineState) => TimelineState;
  invert: (state: TimelineState) => TimelineState;
  coalesceKey?: string;
}
