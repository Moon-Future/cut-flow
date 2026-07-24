import {describe, expect, it} from 'vitest';
import {projectFileSchema} from '../src/core/schema';
import {buildShotTimeline, buildTimeline, secondsToFrames} from '../src/core/timeline';

describe('timeline', () => {
  it('rounds seconds to frames and never returns zero', () => {
    expect(secondsToFrames(1.25, 30)).toBe(38);
    expect(secondsToFrames(0.001, 30)).toBe(1);
  });
  it('places scenes consecutively', () => {
    const project = projectFileSchema.parse({
      version: 1,
      project: {title: 'T', width: 1080, height: 1920, fps: 30},
      style: {
        template: 'x',
        fontFamily: 'sans',
        captionPosition: 'bottom',
        captionAnimation: 'none',
        transition: 'none',
      },
      scenes: [
        {
          id: 'a',
          narration: '',
          caption: 'A',
          assetType: 'image',
          assetPath: 'a',
          duration: 1,
          layout: 'full-screen',
          motion: 'none',
        },
        {
          id: 'b',
          narration: '',
          caption: 'B',
          assetType: 'image',
          assetPath: 'b',
          duration: 2,
          layout: 'center-card',
          motion: 'pan-left',
        },
      ],
    });
    expect(buildTimeline(project)).toMatchObject({
      durationInFrames: 90,
      scenes: [
        {from: 0, durationInFrames: 30},
        {from: 30, durationInFrames: 60},
      ],
    });
  });
  it('fits visual shots exactly into their narration scene', () => {
    const scene = projectFileSchema.parse({
      version: 1,
      project: {title: 'T', width: 1080, height: 1920, fps: 30},
      style: {
        template: 'x',
        fontFamily: 'sans',
        captionPosition: 'bottom',
        captionAnimation: 'none',
        transition: 'none',
      },
      scenes: [
        {
          id: 'a',
          narration: '',
          caption: 'A',
          assetType: 'image',
          assetPath: 'a',
          duration: 5,
          layout: 'full-screen',
          motion: 'none',
          shots: [
            {
              id: 'one',
              visualPurpose: 'A',
              shotType: 'stock-video',
              assetStrategy: 'stock-search',
              duration: 2,
              searchQueries: ['a'],
              selectedAsset: null,
              sourceStart: 0,
              status: 'missing-asset',
              candidates: [],
              generationTask: null,
            },
            {
              id: 'two',
              visualPurpose: 'B',
              shotType: 'science-animation',
              assetStrategy: 'programmatic',
              duration: 3,
              searchQueries: [],
              selectedAsset: null,
              sourceStart: 0,
              status: 'missing-asset',
              candidates: [],
              generationTask: null,
            },
          ],
        },
      ],
    }).scenes[0]!;
    const shots = buildShotTimeline(scene, 30);
    expect(shots).toMatchObject([
      {from: 0, durationInFrames: 60},
      {from: 60, durationInFrames: 90},
    ]);
  });
});
