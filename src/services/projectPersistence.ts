import { writeTextFile, readTextFile, exists, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { save, open } from '@tauri-apps/plugin-dialog';
import { TimelineState } from '../types/timeline';
import { MediaAsset } from '../store/mediaPool';
import { serializeProject, deserializeProject } from '../core/project/serialize';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { getRuntimeMode } from './runtimeConfig';

const AUTOSAVE_FILE = 'autosave.cinecraft';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function saveProjectWeb(state: TimelineState, assets: MediaAsset[]): void {
  const jsonString = serializeProject(state, assets);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename = `${(state.metadata?.name || 'project').replace(/[^a-zA-Z0-9_-]/g, '_')}.cinecraft`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function openProjectWeb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cinecraft,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve();
        return;
      }
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const text = re.target?.result as string;
          const { timelineState, assets } = deserializeProject(text);

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
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read project file'));
      reader.readAsText(file);
    };
    input.click();
  });
}

export async function saveProjectNative(state: TimelineState, assets: MediaAsset[]): Promise<void> {
  if (getRuntimeMode() === 'demo') {
    saveProjectWeb(state, assets);
    return;
  }

  const jsonString = serializeProject(state, assets);

  try {
    const filePath = await save({
      filters: [{
        name: 'Cinecraft Project',
        extensions: ['cinecraft']
      }]
    });

    if (filePath) {
      await writeTextFile(filePath, jsonString);
    }
  } catch (err) {
    console.warn('[projectPersistence] Native save unavailable, using web download fallback:', err);
    saveProjectWeb(state, assets);
  }
}

export async function openProjectNative(): Promise<void> {
  if (getRuntimeMode() === 'demo') {
    await openProjectWeb();
    return;
  }

  try {
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
  } catch (err) {
    console.warn('[projectPersistence] Native open unavailable, using web file picker fallback:', err);
    await openProjectWeb();
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
    try {
      localStorage.setItem(`cinecraft_${AUTOSAVE_FILE}`, jsonString);
    } catch {
      console.error('Failed to autosave project:', err);
    }
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
    try {
      const stored = localStorage.getItem(`cinecraft_${AUTOSAVE_FILE}`);
      if (stored) {
        const { timelineState, assets } = deserializeProject(stored);
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
    } catch {
      console.error('Failed to load autosave project:', err);
    }
  }
  return false;
}
