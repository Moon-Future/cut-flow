import {create} from 'zustand';
import type {ProjectFile, Scene, VisualShot} from '../core/schema';

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error';

type StudioState = {
  project: ProjectFile | null;
  selectedSceneId: string | null;
  lockedSceneIds: string[];
  saveStatus: SaveStatus;
  error: string | null;
  setProject: (project: ProjectFile) => void;
  selectScene: (id: string) => void;
  updateScene: (id: string, patch: Partial<Scene>) => void;
  updateVisualShot: (sceneId: string, shotId: string, patch: Partial<VisualShot>) => void;
  reorderScenes: (sourceId: string, targetId: string) => void;
  toggleLock: (id: string) => void;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
};

export const useStudioStore = create<StudioState>((set) => ({
  project: null,
  selectedSceneId: null,
  lockedSceneIds: [],
  saveStatus: 'loading',
  error: null,
  setProject: (project) =>
    set({project, selectedSceneId: project.scenes[0]?.id ?? null, saveStatus: 'saved'}),
  selectScene: (id) => set({selectedSceneId: id}),
  updateScene: (id, patch) =>
    set((state) => ({
      project: state.project
        ? {
            ...state.project,
            scenes: state.project.scenes.map((scene) =>
              scene.id === id ? {...scene, ...patch} : scene,
            ),
          }
        : null,
      saveStatus: 'saving',
    })),
  updateVisualShot: (sceneId, shotId, patch) =>
    set((state) => ({
      project: state.project
        ? {
            ...state.project,
            scenes: state.project.scenes.map((scene) =>
              scene.id === sceneId
                ? {
                    ...scene,
                    shots: scene.shots?.map((shot) =>
                      shot.id === shotId ? {...shot, ...patch} : shot,
                    ),
                  }
                : scene,
            ),
          }
        : null,
      saveStatus: 'saving',
    })),
  reorderScenes: (sourceId, targetId) =>
    set((state) => {
      if (!state.project || sourceId === targetId) return state;
      const scenes = [...state.project.scenes];
      const sourceIndex = scenes.findIndex((scene) => scene.id === sourceId);
      const targetIndex = scenes.findIndex((scene) => scene.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return state;
      const [source] = scenes.splice(sourceIndex, 1);
      if (!source) return state;
      scenes.splice(targetIndex, 0, source);
      return {project: {...state.project, scenes}, saveStatus: 'saving'};
    }),
  toggleLock: (id) =>
    set((state) => ({
      lockedSceneIds: state.lockedSceneIds.includes(id)
        ? state.lockedSceneIds.filter((item) => item !== id)
        : [...state.lockedSceneIds, id],
    })),
  setSaveStatus: (saveStatus, error = null) => set({saveStatus, error}),
}));
