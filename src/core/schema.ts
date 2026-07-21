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

export const sceneSchema = z.object({
  id: z.string().min(1),
  narration: z.string(),
  caption: z.string().min(1),
  assetType: z.enum(['image', 'video']),
  assetPath: z.string().min(1),
  duration: z.number().positive().max(300),
  layout: layoutSchema,
  motion: motionSchema,
  words: z.array(captionWordSchema).optional(),
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
