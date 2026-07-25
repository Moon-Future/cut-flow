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

  it('replaces an asset without changing timing or narration and keeps history', () => {
    useStudioStore.getState().setProject(project);
    useStudioStore.getState().replaceSceneAsset('a', 'replacement.mp4', 'video');
    const scene = useStudioStore.getState().project?.scenes[0];
    expect(scene?.assetPath).toBe('replacement.mp4');
    expect(scene?.assetType).toBe('video');
    expect(scene?.assetHistory).toEqual(['a.svg']);
    expect(scene?.duration).toBe(1);
    expect(scene?.narration).toBe('A');
  });

  it('updates project-level content and style settings', () => {
    useStudioStore.getState().setProject(project);
    useStudioStore.getState().updateContent({topic: '新的主题'});
    useStudioStore.getState().updateProjectSettings({durationTarget: 60});
    useStudioStore.getState().updateStyle({tone: '轻松幽默'});
    const state = useStudioStore.getState();
    expect(state.project?.content?.topic).toBe('新的主题');
    expect(state.project?.project.durationTarget).toBe(60);
    expect(state.project?.style.tone).toBe('轻松幽默');
    expect(state.saveStatus).toBe('saving');
  });

  it('syncs a background generation result without triggering autosave', () => {
    const projectWithShot = projectFileSchema.parse({
      ...project,
      scenes: [
        {
          ...project.scenes[0],
          shots: [
            {
              id: 'shot-1',
              visualPurpose: '测试镜头',
              shotType: 'generated-image',
              assetStrategy: 'ai-generate',
              duration: 1,
            },
          ],
        },
      ],
    });
    useStudioStore.getState().setProject(projectWithShot);
    const shot = projectWithShot.scenes[0]!.shots![0]!;
    useStudioStore.getState().syncVisualShot('a', 'shot-1', {
      ...shot,
      status: 'ready',
      selectedAsset: 'assets/generated/result.mp4',
    });
    expect(useStudioStore.getState().project?.scenes[0]?.shots?.[0]?.status).toBe('ready');
    expect(useStudioStore.getState().saveStatus).toBe('saved');
  });
});
