import {describe, expect, it} from 'vitest';
import {projectFileSchema} from '../src/core/schema';

const valid = {
  version: 1,
  project: {title: 'Test', width: 1080, height: 1920, fps: 30},
  style: {
    template: 'dark-tech',
    fontFamily: 'sans-serif',
    captionPosition: 'bottom',
    captionAnimation: 'fade',
    transition: 'fade',
  },
  scenes: [
    {
      id: 'one',
      narration: '',
      caption: 'Hello',
      assetType: 'image',
      assetPath: 'assets/one.svg',
      duration: 2,
      layout: 'full-screen',
      motion: 'none',
    },
  ],
};

describe('projectFileSchema', () => {
  it('accepts a valid project and supplies transition duration', () => {
    expect(projectFileSchema.parse(valid).style.transitionDuration).toBe(0.35);
  });
  it('rejects duplicate scene ids', () => {
    expect(
      projectFileSchema.safeParse({...valid, scenes: [valid.scenes[0], valid.scenes[0]]}).success,
    ).toBe(false);
  });
  it('rejects unsupported motion values', () => {
    const scenes = [{...valid.scenes[0], motion: 'spin'}];
    expect(projectFileSchema.safeParse({...valid, scenes}).success).toBe(false);
  });
});
