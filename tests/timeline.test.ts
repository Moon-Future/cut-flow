import {describe, expect, it} from 'vitest';
import {projectFileSchema} from '../src/core/schema';
import {buildTimeline, secondsToFrames} from '../src/core/timeline';

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
});
