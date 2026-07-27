import {z} from 'zod';

export const layoutSchema = z.enum(['full-screen', 'center-card', 'split-top-bottom']);
export const motionSchema = z.enum([
  'none',
  'slow-zoom-in',
  'slow-zoom-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'ken-burns-left',
  'ken-burns-right',
  'gentle-float',
]);
export const shotMotionPlanSchema = z.object({
  preset: motionSchema.default('slow-zoom-in'),
  intensity: z.number().min(0).max(1).default(0.35),
  focusStart: z.string().default('画面主体'),
  focusEnd: z.string().default('核心细节'),
  requiresLayering: z.boolean().default(false),
  requiresAiVideo: z.boolean().default(false),
});
export const videoTypeSchema = z.enum([
  'science-explainer',
  'knowledge-narration',
  'digital-human',
  'product-showcase',
  'storytelling',
]);

export const captionWordSchema = z.object({
  text: z.string().min(1),
  start: z.number().min(0),
  end: z.number().positive(),
});

export const generationCandidateSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['image', 'video']),
  path: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  createdAt: z.string().min(1),
  duration: z.number().positive().optional(),
  taskId: z.string().min(1).optional(),
  taskStatus: z
    .enum(['queued', 'running', 'needs-selection', 'succeeded', 'failed', 'cancelled'])
    .optional(),
  taskAttempt: z.number().int().positive().optional(),
  taskStartedAt: z.string().min(1).optional(),
  taskEstimatedCompletedAt: z.string().min(1).optional(),
  taskCompletedAt: z.string().min(1).optional(),
});

export const generationTaskSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['image', 'video', 'image-to-video', 'digital-human']),
  status: z.enum(['queued', 'running', 'needs-selection', 'succeeded', 'failed', 'cancelled']),
  attempt: z.number().int().positive(),
  provider: z.string().min(1),
  model: z.string().min(1),
  error: z.string().nullable().default(null),
  startedAt: z.string().min(1).optional(),
  estimatedCompletedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1),
});

export const visualShotSchema = z.object({
  id: z.string().min(1),
  visualPurpose: z.string().min(1),
  shotType: z.enum([
    'image',
    'video',
    'real-footage',
    'stock-video',
    'generated-video',
    'generated-image',
    'science-animation',
    'digital-human',
  ]),
  assetStrategy: z.enum([
    'source-agnostic',
    'local-first',
    'stock-search',
    'ai-generate',
    'programmatic',
    'digital-human',
  ]),
  duration: z.number().positive().max(30),
  searchQueries: z.array(z.string().min(1)).max(8).default([]),
  searchQueriesZh: z.array(z.string().min(1)).max(8).optional(),
  imagePrompt: z.string().optional(),
  videoPrompt: z.string().optional(),
  imagePromptZh: z.string().optional(),
  videoPromptZh: z.string().optional(),
  motionPlan: shotMotionPlanSchema.optional(),
  selectedAsset: z.string().nullable().default(null),
  selectionCleared: z.boolean().optional(),
  sourceStart: z.number().min(0).default(0),
  sourceEnd: z.number().positive().optional(),
  status: z.enum(['ready', 'missing-asset', 'needs-review']).default('missing-asset'),
  candidates: z.array(generationCandidateSchema).default([]),
  generationTask: generationTaskSchema.nullable().default(null),
});

export const sceneSchema = z.object({
  id: z.string().min(1),
  copyRole: z.enum(['digital-human', 'voiceover', 'visual-explanation']).optional(),
  narration: z.string(),
  caption: z.string().min(1),
  assetType: z.enum(['image', 'video']),
  assetPath: z.string().min(1),
  assetHistory: z.array(z.string().min(1)).optional(),
  assetQuery: z.string().optional(),
  duration: z.number().positive().max(300),
  layout: layoutSchema,
  motion: motionSchema,
  words: z.array(captionWordSchema).optional(),
  visualIntent: z.string().optional(),
  digitalHumanEmotion: z.string().optional(),
  digitalHumanAction: z.string().optional(),
  digitalHumanBackground: z.string().optional(),
  soundEffect: z.string().optional(),
  shots: z.array(visualShotSchema).min(1).optional(),
});

export const copyVersionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().optional(),
  title: z.string().min(1),
  topic: z.string(),
  targetWordCount: z.number().int().min(100).max(5000).optional(),
  hook: z.string(),
  ending: z.string(),
  scenes: z.array(sceneSchema).min(1),
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
      creationMode: z.enum(['ai-generate', 'import-copy', 'import-script', 'blank']).optional(),
      platform: z
        .enum(['douyin', 'xiaohongshu', 'wechat-video', 'bilibili', 'youtube', 'custom'])
        .optional(),
    }),
    content: z
      .object({
        topic: z.string().default(''),
        videoType: videoTypeSchema.default('science-explainer'),
        description: z.string().optional(),
        audience: z.string().optional(),
        purpose: z.string().optional(),
        visualStyle: z.string().optional(),
        sourceText: z.string().optional(),
        keywords: z.string().optional(),
        hook: z.string().default(''),
        ending: z.string().default(''),
      })
      .optional(),
    style: z.object({
      template: z.string().min(1),
      fontFamily: z.string().min(1),
      captionPosition: z.enum(['top', 'center', 'bottom']),
      captionAnimation: z.enum(['none', 'fade']),
      transition: z.enum(['none', 'fade']),
      transitionDuration: z.number().min(0).max(2).default(0.35),
      backgroundMusicVolume: z.number().min(0).max(1).optional(),
      tone: z.string().optional(),
      captionStyle: z.string().optional(),
    }),
    narrationAudio: z.string().min(1).nullable().optional(),
    scenes: z.array(sceneSchema).min(1),
    copyVersions: z.array(copyVersionSchema).optional(),
    activeCopyVersionId: z.string().nullable().optional(),
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
export type GenerationCandidate = z.infer<typeof generationCandidateSchema>;
export type GenerationTask = z.infer<typeof generationTaskSchema>;
export type VideoType = z.infer<typeof videoTypeSchema>;
export type CopyVersion = z.infer<typeof copyVersionSchema>;
export type Motion = z.infer<typeof motionSchema>;
