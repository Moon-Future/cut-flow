import {interpolate} from 'remotion';
import type {LayerAnimation} from '../../core/schema';

export type LayerAnimationState = {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

const clampProgress = (frame: number, startFrame: number, durationFrames: number) =>
  interpolate(frame, [startFrame, startFrame + Math.max(1, durationFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const layerAnimationState = (
  animation: LayerAnimation | undefined,
  frame: number,
  fps: number,
  direction: 'enter' | 'idle' | 'exit',
): LayerAnimationState => {
  const neutral = {opacity: 1, x: 0, y: 0, scale: 1, rotation: 0};
  if (!animation || animation.preset === 'none') return neutral;
  const startFrame = animation.start * fps;
  const durationFrames = animation.duration * fps;
  const progress = clampProgress(frame, startFrame, durationFrames);
  const strength = animation.intensity;
  const amount = direction === 'exit' ? progress : 1 - progress;

  switch (animation.preset) {
    case 'fade-in':
      return {...neutral, opacity: direction === 'exit' ? 1 - progress : progress};
    case 'fade-up':
      return {
        ...neutral,
        opacity: direction === 'exit' ? 1 - progress : progress,
        y: amount * 140 * strength,
      };
    case 'slide-in-left':
      return {
        ...neutral,
        opacity: 1 - amount * 0.35,
        x: amount === 0 ? 0 : -amount * 720 * strength,
      };
    case 'slide-in-right':
      return {...neutral, opacity: 1 - amount * 0.35, x: amount * 720 * strength};
    case 'pop': {
      const overshoot = Math.sin(progress * Math.PI) * 0.12 * strength;
      return {...neutral, opacity: direction === 'exit' ? 1 - progress : progress, scale: 1 - amount * 0.65 + overshoot};
    }
    case 'shake': {
      const active = direction === 'idle' ? 1 : progress;
      return {...neutral, x: Math.sin(frame * 1.8) * 18 * strength * active, rotation: Math.sin(frame * 1.3) * 2 * strength};
    }
    case 'float':
      return {...neutral, y: Math.sin(frame / Math.max(1, fps) * Math.PI * 2) * 18 * strength};
    case 'slow-zoom':
      return {...neutral, scale: 1 + progress * 0.12 * strength};
  }
};
