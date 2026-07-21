import {z} from 'zod';

export const videoScriptSchema = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  scenes: z
    .array(
      z.object({
        narration: z.string().min(1),
        caption: z.string().min(1),
        visualPrompt: z.string().min(1),
        suggestedDuration: z.number().positive().max(30),
      }),
    )
    .min(3)
    .max(12),
  ending: z.string().min(1),
});
