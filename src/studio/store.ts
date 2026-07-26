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
  updateContent: (patch: Partial<NonNullable<ProjectFile['content']>>) => void;
  updateProjectSettings: (patch: Partial<ProjectFile['project']>) => void;
  updateStyle: (patch: Partial<ProjectFile['style']>) => void;
  restoreCopyVersion: (versionId: string) => void;
  replaceSceneAsset: (id: string, assetPath: string, assetType: Scene['assetType']) => void;
  duplicateScene: (id: string) => void;
  deleteScene: (id: string) => void;
  updateVisualShot: (sceneId: string, shotId: string, patch: Partial<VisualShot>) => void;
  syncVisualShot: (sceneId: string, shotId: string, shot: VisualShot) => void;
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
  updateContent: (patch) =>
    set((state) => ({
      project: state.project
        ? {
            ...state.project,
            content: {
              topic: '',
              videoType: 'science-explainer',
              hook: '',
              ending: '',
              ...state.project.content,
              ...patch,
            },
          }
        : null,
      saveStatus: 'saving',
    })),
  updateProjectSettings: (patch) =>
    set((state) => ({
      project: state.project
        ? {...state.project, project: {...state.project.project, ...patch}}
        : null,
      saveStatus: 'saving',
    })),
  updateStyle: (patch) =>
    set((state) => ({
      project: state.project ? {...state.project, style: {...state.project.style, ...patch}} : null,
      saveStatus: 'saving',
    })),
  restoreCopyVersion: (versionId) =>
    set((state) => {
      if (!state.project) return state;
      const version = state.project.copyVersions?.find((item) => item.id === versionId);
      if (!version) return state;
      return {
        project: {
          ...state.project,
          project: {...state.project.project, title: version.title},
          content: {
            topic: version.topic,
            videoType: state.project.content?.videoType ?? 'science-explainer',
            description: state.project.content?.description,
            audience: state.project.content?.audience,
            purpose: state.project.content?.purpose,
            sourceText: state.project.content?.sourceText,
            keywords: state.project.content?.keywords,
            hook: version.hook,
            ending: version.ending,
          },
          scenes: version.scenes,
          activeCopyVersionId: version.id,
        },
        selectedSceneId: version.scenes[0]?.id ?? null,
        saveStatus: 'saving',
      };
    }),
  replaceSceneAsset: (id, assetPath, assetType) =>
    set((state) => ({
      project: state.project
        ? {
            ...state.project,
            scenes: state.project.scenes.map((scene) =>
              scene.id === id
                ? {
                    ...scene,
                    assetPath,
                    assetType,
                    assetHistory:
                      scene.assetPath === assetPath
                        ? scene.assetHistory
                        : [
                            scene.assetPath,
                            ...(scene.assetHistory ?? []).filter((path) => path !== assetPath),
                          ]
                            .filter(Boolean)
                            .slice(0, 12),
                  }
                : scene,
            ),
          }
        : null,
      saveStatus: 'saving',
    })),
  duplicateScene: (id) =>
    set((state) => {
      if (!state.project) return state;
      const index = state.project.scenes.findIndex((scene) => scene.id === id);
      const source = state.project.scenes[index];
      if (!source) return state;
      const copy = {
        ...source,
        id: `${source.id}-copy-${Date.now()}`,
        caption: `${source.caption}（副本）`,
        shots: source.shots?.map((shot) => ({
          ...shot,
          id: `${shot.id}-copy-${Date.now()}`,
          candidates: [...shot.candidates],
        })),
      };
      const scenes = [...state.project.scenes];
      scenes.splice(index + 1, 0, copy);
      return {
        project: {...state.project, scenes},
        selectedSceneId: copy.id,
        saveStatus: 'saving',
      };
    }),
  deleteScene: (id) =>
    set((state) => {
      if (!state.project || state.project.scenes.length <= 1) return state;
      const index = state.project.scenes.findIndex((scene) => scene.id === id);
      if (index < 0) return state;
      const scenes = state.project.scenes.filter((scene) => scene.id !== id);
      return {
        project: {...state.project, scenes},
        selectedSceneId: scenes[Math.min(index, scenes.length - 1)]?.id ?? null,
        saveStatus: 'saving',
      };
    }),
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
  syncVisualShot: (sceneId, shotId, shot) =>
    set((state) => ({
      project: state.project
        ? {
            ...state.project,
            scenes: state.project.scenes.map((scene) =>
              scene.id === sceneId
                ? {
                    ...scene,
                    shots: scene.shots?.map((item) => (item.id === shotId ? shot : item)),
                  }
                : scene,
            ),
          }
        : null,
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
