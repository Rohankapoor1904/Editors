import { writeTextFile, readTextFile, exists, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { save, open } from '@tauri-apps/plugin-dialog';
import { TimelineState } from '../types/timeline';
import { MediaAsset } from '../store/mediaPool';
import { serializeProject, deserializeProject } from '../core/project/serialize';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { getRuntimeMode } from './runtimeConfig';

const AUTOSAVE_FILE = 'autosave.cinecraft';

export async function saveProjectNative(state: TimelineState, assets: MediaAsset[]): Promise<void> {
  if (getRuntimeMode() === 'demo') {
    throw new Error('Native save not available in demo mode');
  }

  const jsonString = serializeProject(state, assets);

  const filePath = await save({
    filters: [{
      name: 'Cinecraft Project',
      extensions: ['cinecraft']
    }]
  });

  if (filePath) {
    await writeTextFile(filePath, jsonString);
  }
}

export async function openProjectNative(): Promise<void> {
  if (getRuntimeMode() === 'demo') {
    throw new Error('Native open not available in demo mode');
  }

  const selected = await open({
    filters: [{
      name: 'Cinecraft Project',
      extensions: ['cinecraft']
    }]
  });

  if (selected && !Array.isArray(selected)) {
    const contents = await readTextFile(selected);
    const { timelineState, assets } = deserializeProject(contents);

    for (const a of assets) {
      useMediaPoolStore.getState().addAsset(a);
    }

    useTimelineStore.setState({
      version: timelineState.version,
      projectId: timelineState.projectId,
      metadata: timelineState.metadata,
      tracks: timelineState.tracks,
      playheadPosition: { value: 0, rate: 1 },
      selectedClipIds: []
    });
  }
}

export async function saveAutosave(state: TimelineState, assets: MediaAsset[]): Promise<void> {
  if (getRuntimeMode() === 'demo') {
    return;
  }

  const jsonString = serializeProject(state, assets);

  try {
    const isDirExists = await exists('', { baseDir: BaseDirectory.AppData });
    if (!isDirExists) {
        await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
    }

    await writeTextFile(AUTOSAVE_FILE, jsonString, { baseDir: BaseDirectory.AppData });
  } catch (err) {
    console.error('Failed to autosave project:', err);
  }
}

export async function loadAutosave(): Promise<boolean> {
  if (getRuntimeMode() === 'demo') {
    return false;
  }

  try {
    if (await exists(AUTOSAVE_FILE, { baseDir: BaseDirectory.AppData })) {
      const contents = await readTextFile(AUTOSAVE_FILE, { baseDir: BaseDirectory.AppData });
      const { timelineState, assets } = deserializeProject(contents);

      for (const a of assets) {
        useMediaPoolStore.getState().addAsset(a);
      }

      useTimelineStore.setState({
        version: timelineState.version,
        projectId: timelineState.projectId,
        metadata: timelineState.metadata,
        tracks: timelineState.tracks,
        playheadPosition: { value: 0, rate: 1 },
        selectedClipIds: []
      });
      return true;
    }
  } catch (err) {
    console.error('Failed to load autosave project:', err);
  }
  return false;
}
