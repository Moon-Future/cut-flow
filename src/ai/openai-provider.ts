import {videoScriptSchema} from './script-schema';
import type {GenerateInput, ProviderSet, TranscriptWord} from './types';

type OpenAIConfig = {
  apiKey: string;
  textModel?: string;
  ttsModel?: string;
  transcriptionModel?: string;
};

const request = async (url: string, apiKey: string, init: RequestInit): Promise<Response> => {
  const response = await fetch(url, {
    ...init,
    headers: {Authorization: `Bearer ${apiKey}`, ...init.headers},
  });
  if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
  return response;
};

export const createOpenAIProviders = (config: OpenAIConfig): ProviderSet => ({
  text: {
    generateScript: async (input: GenerateInput) => {
      const response = await request('https://api.openai.com/v1/responses', config.apiKey, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          model: config.textModel ?? 'gpt-5.6-luna',
          input: `为开发者自媒体生成中文短视频脚本。主题：${input.topic}；受众：${input.audience}；语气：${input.tone}；目标时长：${input.targetDuration}秒。`,
          text: {
            format: {
              type: 'json_schema',
              name: 'video_script',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'hook', 'scenes', 'ending'],
                properties: {
                  title: {type: 'string'},
                  hook: {type: 'string'},
                  ending: {type: 'string'},
                  scenes: {
                    type: 'array',
                    minItems: 3,
                    maxItems: 12,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['narration', 'caption', 'visualPrompt', 'suggestedDuration'],
                      properties: {
                        narration: {type: 'string'},
                        caption: {type: 'string'},
                        visualPrompt: {type: 'string'},
                        suggestedDuration: {type: 'number'},
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });
      const result = (await response.json()) as {output_text?: string};
      if (!result.output_text) throw new Error('OpenAI response did not include output_text');
      return videoScriptSchema.parse(JSON.parse(result.output_text) as unknown);
    },
  },
  tts: {
    synthesize: async (text) => {
      const response = await request('https://api.openai.com/v1/audio/speech', config.apiKey, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          model: config.ttsModel ?? 'tts-1',
          voice: 'alloy',
          input: text,
          response_format: 'wav',
        }),
      });
      return {audio: Buffer.from(await response.arrayBuffer()), format: 'wav'};
    },
  },
  transcription: {
    transcribe: async (audio) => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], {type: 'audio/wav'}), 'narration.wav');
      form.append('model', config.transcriptionModel ?? 'whisper-1');
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      const response = await request(
        'https://api.openai.com/v1/audio/transcriptions',
        config.apiKey,
        {method: 'POST', body: form},
      );
      const result = (await response.json()) as {
        words?: {word: string; start: number; end: number}[];
      };
      if (!result.words?.length) throw new Error('Transcription did not return word timestamps');
      return result.words.map((word): TranscriptWord => ({
        text: word.word,
        start: word.start,
        end: word.end,
      }));
    },
  },
});
