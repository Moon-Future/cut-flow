import type {ProjectFile} from '../core/schema';

export const demoProject: ProjectFile = {
  version: 1,
  project: {
    title: 'CutFlow 预览',
    width: 1080,
    height: 1920,
    fps: 30,
    durationTarget: 5,
  },
  style: {
    template: 'cinematic',
    fontFamily: 'Microsoft YaHei',
    captionPosition: 'bottom',
    captionAnimation: 'fade',
    transition: 'fade',
    transitionDuration: 0.35,
  },
  scenes: [
    {
      id: 'preview-scene',
      narration: '在项目中选择素材后，即可预览最终画面。',
      caption: 'CutFlow 预览',
      assetType: 'image',
      assetPath: 'assets/placeholder.svg',
      duration: 5,
      layout: 'full-screen',
      motion: 'slow-zoom-in',
    },
  ],
};
