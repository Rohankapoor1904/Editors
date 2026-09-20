import { TimelineState } from '../../types/timeline';

export interface Command {
  apply: (state: TimelineState) => TimelineState;
  invert: (state: TimelineState) => TimelineState;
  coalesceKey?: string;
}

export * from './edits';
export { AddTrackCommand, AddClipCommand, RemoveClipCommand, ToggleTrackStateCommand, SetMetadataCommand } from './storeCommands';
export * from './audio';
export * from './multicam';
