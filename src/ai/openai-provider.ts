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
  disableThinking?: boolean;
  onPrompt?: (prompt: {system: string; user: string}) => void;
};

const request = async (url: string, apiKey: string, init: RequestInit): Promise<Response> => {
  const response = await fetch(url, {
    ...init,
    headers: {Authorization: `Bearer ${apiKey}`, ...init.headers},
  });
  if (!response.ok) throw new Error(`AI 服务 ${response.status}: ${await response.text()}`);
  return response;
};

const normalizeCompatibleScript = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  const script = value as Record<string, unknown>;
  const scenes = Array.isArray(script.scenes) ? script.scenes : [];
  const shotTypes = new Set([
    'real-footage',
    'stock-video',
    'generated-video',
    'generated-image',
    'science-animation',
    'digital-human',
  ]);
  const strategies = new Set([
    'local-first',
    'stock-search',
    'ai-generate',
    'programmatic',
    'digital-human',
  ]);
  const normalizeShotType = (input: unknown) => {
    const text = String(input ?? '').toLowerCase();
    if (shotTypes.has(text)) return text;
    if (/数字人|digital/.test(text)) return 'digital-human';
    if (/科学|动画|animation/.test(text)) return 'science-animation';
    if (/生成.*视频|generated.*video/.test(text)) return 'generated-video';
    if (/图片|图像|image/.test(text)) return 'generated-image';
    if (/实拍|真实|footage/.test(text)) return 'real-footage';
    return 'stock-video';
  };
  const normalizeStrategy = (input: unknown, shotType: string) => {
    const text = String(input ?? '').toLowerCase();
    if (strategies.has(text)) return text;
    if (/数字人|digital/.test(text)) return 'digital-human';
    if (/程序|program|动画/.test(text)) return 'programmatic';
    if (/生成|generate/.test(text)) return 'ai-generate';
    if (/本地|local/.test(text)) return 'local-first';
    return shotType === 'real-footage' || shotType === 'stock-video'
      ? 'stock-search'
      : 'ai-generate';
  };
  return {
    ...script,
    scenes: scenes.map((sceneValue) => {
      const scene =
        sceneValue && typeof sceneValue === 'object'
          ? (sceneValue as Record<string, unknown>)
          : {};
      const shots = Array.isArray(scene.shots) ? scene.shots : [];
      return {
        ...scene,
        shots: shots.map((shotValue) => {
          const shot =
            shotValue && typeof shotValue === 'object'
              ? (shotValue as Record<string, unknown>)
              : {};
          const shotType = normalizeShotType(shot.shotType);
          const queries = Array.isArray(shot.searchQueries)
            ? shot.searchQueries
            : String(shot.searchQueries ?? '')
                .split(/[,，;；\n]/)
                .map((item) => item.trim())
                .filter(Boolean);
          return {
            ...shot,
            shotType,
            assetStrategy: normalizeStrategy(shot.assetStrategy, shotType),
            durationWeight: Number(shot.durationWeight) || 1,
            searchQueries: queries.slice(0, 8),
          };
        }),
      };
    }),
  };
};

export const createOpenAIProviders = (config: OpenAIConfig): ProviderSet => ({
  text: {
    generateScript: async (input: GenerateInput) => {
      const prompt = `生成中文短视频导演脚本。
视频标题/主题：${input.topic}
视频类型：${videoTypeLabels[input.videoType]}
受众：${input.audience}
语气：${input.tone}
目标字数：约 ${input.targetWordCount} 个中文字符（允许上下浮动 10%）

用户补充要求：
${input.customPrompt?.trim() || '从标题提炼核心观点，开头快速建立悬念，正文层层推进，结尾给出明确收束。'}

根据视频类型选择叙事结构、镜头语言和素材策略。每个旁白段拆成1到5个视觉镜头，优先真实视频，其次科学动画、AI生成内容；为每个镜头给出中英文素材搜索词和生成提示词。字幕不是主体。`;
      const useChatCompletions = config.apiMode === 'chat-completions';
      const jsonSystemPrompt = `只输出合法 JSON，不要 Markdown。结构必须为 {title, hook, scenes, ending}。scenes 必须有 3-12 项，每项包含 narration、caption、visualPrompt、suggestedDuration、visualIntent、shots。shots 每项包含 visualPurpose、shotType、assetStrategy、durationWeight、searchQueries、imagePrompt、videoPrompt。
shotType 只能使用英文枚举：real-footage、stock-video、generated-video、generated-image、science-animation、digital-human。
assetStrategy 只能使用英文枚举：local-first、stock-search、ai-generate、programmatic、digital-human。
searchQueries 必须是字符串数组，不能是单个字符串。
JSON 输出格式示例：
{
  "title": "示例标题",
  "hook": "示例开头",
  "scenes": [
    {"narration":"第一段旁白","caption":"第一段字幕","visualPrompt":"第一段画面","suggestedDuration":10,"visualIntent":"建立问题","shots":[{"visualPurpose":"展示场景","shotType":"stock-video","assetStrategy":"stock-search","durationWeight":1,"searchQueries":["keyword one","关键词一"],"imagePrompt":"","videoPrompt":"真实视频画面"}]},
    {"narration":"第二段旁白","caption":"第二段字幕","visualPrompt":"第二段画面","suggestedDuration":10,"visualIntent":"解释原因","shots":[{"visualPurpose":"解释原理","shotType":"science-animation","assetStrategy":"programmatic","durationWeight":1,"searchQueries":["concept animation"],"imagePrompt":"科普动画","videoPrompt":""}]},
    {"narration":"第三段旁白","caption":"第三段字幕","visualPrompt":"第三段画面","suggestedDuration":10,"visualIntent":"总结观点","shots":[{"visualPurpose":"完成收束","shotType":"real-footage","assetStrategy":"stock-search","durationWeight":1,"searchQueries":["closing scene"],"imagePrompt":"","videoPrompt":"结尾真实镜头"}]}
  ],
  "ending": "示例结尾"
}`;
      config.onPrompt?.({
        system: useChatCompletions
          ? jsonSystemPrompt
          : '使用 Responses API 的 video_script 严格 JSON Schema 生成视频文案。',
        user: prompt,
      });
      const response = await request(`${config.baseUrl ?? 'https://api.openai.com/v1'}/${useChatCompletions ? 'chat/completions' : 'responses'}`, config.apiKey, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(useChatCompletions ? {
          model: config.textModel,
          messages: [
            {
              role: 'system',
              content: jsonSystemPrompt,
            },
            {role: 'user', content: prompt},
          ],
          response_format: {type: 'json_object'},
          max_tokens: 16000,
          stream: false,
          ...(config.disableThinking ? {thinking: {type: 'disabled'}} : {}),
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
      return videoScriptSchema.parse(normalizeCompatibleScript(JSON.parse(output) as unknown));
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
