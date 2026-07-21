import {beforeEach, describe, expect, it} from 'vitest';
import {projectFileSchema} from '../src/core/schema';
import {useStudioStore} from '../src/studio/store';

const project = projectFileSchema.parse({
  version: 1,
  project: {title: 'Editor test', width: 1080, height: 1920, fps: 30},
  style: {
    template: 'test',
    fontFamily: 'sans-serif',
    captionPosition: 'bottom',
    captionAnimation: 'fade',
    transition: 'fade',
  },
  scenes: [
    {
      id: 'a',
      narration: 'A',
      caption: 'A',
      assetType: 'image',
      assetPath: 'a.svg',
      duration: 1,
      layout: 'full-screen',
      motion: 'none',
    },
    {
      id: 'b',
      narration: 'B',
      caption: 'B',
      assetType: 'image',
      assetPath: 'b.svg',
      duration: 2,
      layout: 'center-card',
      motion: 'pan-left',
    },
  ],
});

describe('studio store', () => {
  beforeEach(() =>
    useStudioStore.setState({
      project: null,
      selectedSceneId: null,
      lockedSceneIds: [],
      saveStatus: 'loading',
      error: null,
    }),
  );

  it('selects the first scene and updates only its data', () => {
    useStudioStore.getState().setProject(project);
    useStudioStore.getState().updateScene('a', {caption: 'Changed'});
    const state = useStudioStore.getState();
    expect(state.selectedSceneId).toBe('a');
    expect(state.project?.scenes.map((scene) => scene.caption)).toEqual(['Changed', 'B']);
    expect(state.saveStatus).toBe('saving');
  });

  it('reorders and locks scenes', () => {
    useStudioStore.getState().setProject(project);
    useStudioStore.getState().reorderScenes('b', 'a');
    useStudioStore.getState().toggleLock('b');
    expect(useStudioStore.getState().project?.scenes.map((scene) => scene.id)).toEqual(['b', 'a']);
    expect(useStudioStore.getState().lockedSceneIds).toEqual(['b']);
  });
});
