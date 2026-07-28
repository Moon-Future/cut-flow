import type {VisualLayer, VisualShot} from '../core/schema';

const baseLayer = (
  id: string,
  role: VisualLayer['role'],
  assetPath: string | null,
  position: VisualLayer['position'],
): VisualLayer => ({
  id,
  type: 'image',
  role,
  assetPath,
  position,
  fit: role === 'background' ? 'cover' : 'contain',
  opacity: 1,
  start: 0,
});

export const createVersusLayers = (
  shotId: string,
  backgroundAsset: string | null,
): VisualLayer[] => [
  {
    ...baseLayer(`${shotId}-background`, 'background', backgroundAsset, {
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      rotation: 0,
      zIndex: 0,
    }),
    idle: {preset: 'slow-zoom', start: 0, duration: 5, intensity: 0.25},
  },
  {
    ...baseLayer(`${shotId}-left-subject`, 'subject', null, {
      x: 0.27,
      y: 0.62,
      width: 0.43,
      rotation: 0,
      zIndex: 10,
    }),
    enter: {preset: 'slide-in-left', start: 0.2, duration: 0.6, intensity: 0.7},
    idle: {preset: 'float', start: 0, duration: 5, intensity: 0.25},
    effects: {shadow: true, outline: false, blur: 0, brightness: 1},
  },
  {
    ...baseLayer(`${shotId}-right-subject`, 'subject', null, {
      x: 0.73,
      y: 0.62,
      width: 0.43,
      rotation: 0,
      zIndex: 10,
    }),
    enter: {preset: 'slide-in-right', start: 0.45, duration: 0.6, intensity: 0.7},
    idle: {preset: 'float', start: 0, duration: 5, intensity: 0.2},
    effects: {shadow: true, outline: false, blur: 0, brightness: 1},
  },
];

export const applyVersusComposition = (shot: VisualShot): Partial<VisualShot> => ({
  composition: 'versus',
  layers: createVersusLayers(shot.id, shot.selectedAsset),
  motionPlan: {
    preset: shot.motionPlan?.preset ?? 'slow-zoom-in',
    intensity: shot.motionPlan?.intensity ?? 0.35,
    focusStart: shot.motionPlan?.focusStart ?? shot.visualPurpose,
    focusEnd: shot.motionPlan?.focusEnd ?? '核心细节',
    requiresLayering: true,
    requiresAiVideo: shot.motionPlan?.requiresAiVideo ?? false,
  },
});
