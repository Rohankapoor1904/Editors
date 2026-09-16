import { TimelineState } from '../../types/timeline';

export interface Command {
  apply: (state: TimelineState) => TimelineState;
  invert: (state: TimelineState) => TimelineState;
  coalesceKey?: string;
}

export * from './edits';
export { AddTrackCommand, AddClipCommand, RemoveClipCommand, ToggleTrackStateCommand } from './storeCommands';
export * from './audio';
