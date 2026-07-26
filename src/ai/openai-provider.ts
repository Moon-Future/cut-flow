import {videoScriptSchema} from './script-schema';
import type {GenerateInput, ProviderSet, TranscriptWord} from './types';

const videoTypeLabels: Record<GenerateInput['videoType'], string> = {
  'science-explainer': '科普讲解',
  'knowledge-narration': '知识口播',
  'digital-human': '数字人口播',
  'product-showcase': '产品展示',
  storytelling: '故事叙事',
};

export type OpenAIConfig = {
  apiKey: string;
  baseUrl?: string;
  textModel?: string;
  ttsModel?: string;
  transcriptionModel?: string;
  apiMode?: 'responses' | 'chat-completions';
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
      const prompt = `生成中文短视频导演脚本。
视频标题/主题：${input.topic}
视频类型：${videoTypeLabels[input.videoType]}
受众：${input.audience}
语气：${input.tone}
目标时长：${input.targetDuration}秒

用户补充要求：
${input.customPrompt?.trim() || '从标题提炼核心观点，开头快速建立悬念，正文层层推进，结尾给出明确收束。'}

根据视频类型选择叙事结构、镜头语言和素材策略。每个旁白段拆成1到5个视觉镜头，优先真实视频，其次科学动画、AI生成内容；为每个镜头给出中英文素材搜索词和生成提示词。字幕不是主体。`;
      const useChatCompletions = config.apiMode === 'chat-completions';
      const response = await request(`${config.baseUrl ?? 'https://api.openai.com/v1'}/${useChatCompletions ? 'chat/completions' : 'responses'}`, config.apiKey, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(useChatCompletions ? {
          model: config.textModel,
          messages: [
            {
              role: 'system',
              content:
                '只输出合法 JSON，结构必须为 {title, hook, scenes, ending}。scenes 每项包含 narration、caption、visualPrompt、suggestedDuration、visualIntent、shots；shots 每项包含 visualPurpose、shotType、assetStrategy、durationWeight、searchQueries、imagePrompt、videoPrompt。',
            },
            {role: 'user', content: prompt},
          ],
          response_format: {type: 'json_object'},
        } : {
          model: config.textModel ?? 'gpt-5.6-luna',
          input: prompt,
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
                      required: [
                        'narration',
                        'caption',
                        'visualPrompt',
                        'suggestedDuration',
                        'visualIntent',
                        'shots',
                      ],
                      properties: {
                        narration: {type: 'string'},
                        caption: {type: 'string'},
                        visualPrompt: {type: 'string'},
                        suggestedDuration: {type: 'number'},
                        visualIntent: {type: 'string'},
                        shots: {
                          type: 'array',
                          minItems: 1,
                          maxItems: 8,
                          items: {
                            type: 'object',
                            additionalProperties: false,
                            required: [
                              'visualPurpose',
                              'shotType',
                              'assetStrategy',
                              'durationWeight',
                              'searchQueries',
                              'imagePrompt',
                              'videoPrompt',
                            ],
                            properties: {
                              visualPurpose: {type: 'string'},
                              shotType: {
                                type: 'string',
                                enum: [
                                  'real-footage',
                                  'stock-video',
                                  'generated-video',
                                  'generated-image',
                                  'science-animation',
                                  'digital-human',
                                ],
                              },
                              assetStrategy: {
                                type: 'string',
                                enum: [
                                  'local-first',
                                  'stock-search',
                                  'ai-generate',
                                  'programmatic',
                                  'digital-human',
                                ],
                              },
                              durationWeight: {type: 'number'},
                              searchQueries: {type: 'array', items: {type: 'string'}},
                              imagePrompt: {type: 'string'},
                              videoPrompt: {type: 'string'},
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });
      const result = (await response.json()) as {
        output_text?: string;
        choices?: Array<{message?: {content?: string}}>;
      };
      const output = result.output_text ?? result.choices?.[0]?.message?.content;
      if (!output) throw new Error('AI 服务未返回可用的文案内容');
      return videoScriptSchema.parse(JSON.parse(output) as unknown);
    },
  },
  tts: {
    synthesize: async (text) => {
      const response = await request(`${config.baseUrl ?? 'https://api.openai.com/v1'}/audio/speech`, config.apiKey, {
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
        `${config.baseUrl ?? 'https://api.openai.com/v1'}/audio/transcriptions`,
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
