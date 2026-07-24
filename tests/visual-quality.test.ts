import {describe, expect, it} from 'vitest';
import type {ProjectFile} from '../src/core/schema';
import {analyzeVisualQuality} from '../src/core/visual-quality';

const project = {
  version: 1,
  project: {title: '科普', width: 1920, height: 1080, fps: 30},
  style: {
    template: 'game-dev-log',
    fontFamily: 'sans-serif',
    captionPosition: 'bottom',
    captionAnimation: 'fade',
    transition: 'fade',
    transitionDuration: 0.35,
  },
  scenes: [
    {
      id: 'one',
      narration: '旁白',
      caption: '字幕',
      assetType: 'video',
      assetPath: 'assets/a.mp4',
      duration: 4,
      layout: 'full-screen',
      motion: 'none',
      shots: [
        {
          id: 'a',
          visualPurpose: '真实天空',
          shotType: 'stock-video',
          assetStrategy: 'stock-search',
          duration: 2,
          searchQueries: ['blue sky'],
          selectedAsset: 'assets/a.mp4',
          sourceStart: 0,
          sourceEnd: 2,
          status: 'ready',
          candidates: [],
          generationTask: null,
        },
        {
          id: 'b',
          visualPurpose: '散射动画',
          shotType: 'science-animation',
          assetStrategy: 'programmatic',
          duration: 2,
          searchQueries: [],
          selectedAsset: null,
          sourceStart: 0,
          sourceEnd: 2,
          status: 'missing-asset',
          candidates: [],
          generationTask: null,
        },
      ],
    },
  ],
} satisfies ProjectFile;

describe('analyzeVisualQuality', () => {
  it('reports footage ratios and missing assets', () => {
    const report = analyzeVisualQuality(project);
    expect(report.totalShots).toBe(2);
    expect(report.realFootageRatio).toBe(0.5);
    expect(report.missingAssets).toBe(1);
    expect(report.publishable).toBe(false);
  });
});
