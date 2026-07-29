import {z} from 'zod';

export const videoScriptSchema = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  scenes: z
    .array(
      z.object({
        segmentType: z.enum(['digital-human', 'voiceover', 'visual-explanation']),
        narration: z.string().min(1),
        caption: z.string().min(1),
        visualPrompt: z.string().min(1),
        suggestedDuration: z.number().positive().max(30),
        visualIntent: z.string().min(1),
        digitalHumanEmotion: z.string().default(''),
        digitalHumanAction: z.string().default(''),
        digitalHumanBackground: z.string().default(''),
        soundEffect: z.string().default(''),
        shots: z
          .array(
            z.object({
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
              durationWeight: z.number().positive(),
              searchQueries: z.array(z.string().min(1)).max(8),
              searchQueriesZh: z.array(z.string().min(1)).max(8).optional(),
              imagePrompt: z.string().optional(),
              videoPrompt: z.string().optional(),
              imagePromptZh: z.string().optional(),
              videoPromptZh: z.string().optional(),
              motionPlan: z
                .object({
                  preset: z.enum([
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
                  ]),
                  intensity: z.number().min(0).max(1),
                  focusStart: z.string().min(1),
                  focusEnd: z.string().min(1),
                  requiresLayering: z.boolean(),
                  requiresAiVideo: z.boolean(),
                })
                .optional(),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(3)
    .max(20),
  ending: z.string().min(1),
});
