import {z} from 'zod';

export const layoutSchema = z.enum(['full-screen', 'center-card', 'split-top-bottom']);
export const motionSchema = z.enum([
  'none',
  'slow-zoom-in',
  'slow-zoom-out',
  'pan-left',
  'pan-right',
]);

export const captionWordSchema = z.object({
  text: z.string().min(1),
  start: z.number().min(0),
  end: z.number().positive(),
});

export const visualShotSchema = z.object({
  id: z.string().min(1),
  visualPurpose: z.string().min(1),
  shotType: z.enum([
    'real-footage',
    'stock-video',
    'generated-video',
    'generated-image',
    'science-animation',
    'digital-human',
  ]),
  assetStrategy: z.enum([
    'local-first',
    'stock-search',
    'ai-generate',
    'programmatic',
    'digital-human',
  ]),
  duration: z.number().positive().max(30),
  searchQueries: z.array(z.string().min(1)).max(8).default([]),
  imagePrompt: z.string().optional(),
  videoPrompt: z.string().optional(),
  selectedAsset: z.string().nullable().default(null),
  sourceStart: z.number().min(0).default(0),
  sourceEnd: z.number().positive().optional(),
  status: z.enum(['ready', 'missing-asset', 'needs-review']).default('missing-asset'),
});

export const sceneSchema = z.object({
  id: z.string().min(1),
  narration: z.string(),
  caption: z.string().min(1),
  assetType: z.enum(['image', 'video']),
  assetPath: z.string().min(1),
  assetQuery: z.string().optional(),
  duration: z.number().positive().max(300),
  layout: layoutSchema,
  motion: motionSchema,
  words: z.array(captionWordSchema).optional(),
  visualIntent: z.string().optional(),
  shots: z.array(visualShotSchema).min(1).optional(),
});

export const projectFileSchema = z
  .object({
    version: z.literal(1),
    project: z.object({
      title: z.string().min(1),
      width: z.number().int().min(320).max(7680),
      height: z.number().int().min(320).max(7680),
      fps: z.number().int().min(1).max(120),
      durationTarget: z.number().positive().max(3600).optional(),
    }),
    style: z.object({
      template: z.string().min(1),
      fontFamily: z.string().min(1),
      captionPosition: z.enum(['top', 'center', 'bottom']),
      captionAnimation: z.enum(['none', 'fade']),
      transition: z.enum(['none', 'fade']),
      transitionDuration: z.number().min(0).max(2).default(0.35),
      backgroundMusicVolume: z.number().min(0).max(1).optional(),
    }),
    narrationAudio: z.string().min(1).nullable().optional(),
    scenes: z.array(sceneSchema).min(1),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.scenes.forEach((scene, index) => {
      if (seen.has(scene.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', index, 'id'],
          message: `Duplicate scene id: ${scene.id}`,
        });
      }
      seen.add(scene.id);
    });
  });

export type ProjectFile = z.infer<typeof projectFileSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type CaptionWord = z.infer<typeof captionWordSchema>;
export type VisualShot = z.infer<typeof visualShotSchema>;
