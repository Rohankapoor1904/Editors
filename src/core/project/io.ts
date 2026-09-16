import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { serializeProject, deserializeProject } from './serialize';
import { nativeBridge } from '../../services/nativeBridge';

export async function handleSaveProject() {
  try {
    const state = useTimelineStore.getState();
    const assets = useMediaPoolStore.getState().assets;

    const jsonString = serializeProject(state, assets);
    await nativeBridge.saveProjectFile(jsonString);
    console.log('[IO] Project saved successfully');
  } catch (error) {
    console.error('[IO] Failed to save project:', error);
  }
}

export async function handleLoadProject() {
  try {
    const jsonString = await nativeBridge.loadProjectFile();
    const { timelineState, assets } = deserializeProject(jsonString);

    useTimelineStore.getState().loadProjectState(timelineState);
    useMediaPoolStore.getState().loadAssets(assets);

    console.log('[IO] Project loaded successfully');
  } catch (error) {
    console.error('[IO] Failed to load project:', error);
  }
}
