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
              imagePrompt: z.string().optional(),
              videoPrompt: z.string().optional(),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(3)
    .max(12),
  ending: z.string().min(1),
});
