import { TimelineState } from '../../types/timeline';

export interface Command {
  apply: (state: TimelineState) => TimelineState;
  invert: (state: TimelineState) => TimelineState;
  coalesceKey?: string;
}

export * from './edits';
export * from './masking';
export * from './titleCommands';
export * from './nest';
export { AddTrackCommand, AddClipCommand, RemoveClipCommand, ToggleTrackStateCommand, SetMetadataCommand } from './storeCommands';
export * from './audio';
export * from './multicam';
