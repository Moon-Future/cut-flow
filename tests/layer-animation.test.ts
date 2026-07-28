import {describe, expect, it} from 'vitest';
import {layerAnimationState} from '../src/remotion/motion/layer-animation';

describe('layer animation', () => {
  it('slides a subject in from the left and reaches its resting position', () => {
    const animation = {
      preset: 'slide-in-left' as const,
      start: 0,
      duration: 1,
      intensity: 1,
    };
    expect(layerAnimationState(animation, 0, 30, 'enter').x).toBe(-720);
    expect(layerAnimationState(animation, 30, 30, 'enter').x).toBe(0);
  });

  it('fades an overlay out at the end', () => {
    const animation = {
      preset: 'fade-in' as const,
      start: 1,
      duration: 1,
      intensity: 1,
    };
    expect(layerAnimationState(animation, 30, 30, 'exit').opacity).toBe(1);
    expect(layerAnimationState(animation, 60, 30, 'exit').opacity).toBe(0);
  });
});
