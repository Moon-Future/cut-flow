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
        segmentType:
          scene.segmentType === 'digital-human' || scene.segmentType === 'visual-explanation'
            ? scene.segmentType
            : /画面|案例|步骤|数据|操作|界面/.test(String(scene.visualIntent ?? ''))
              ? 'visual-explanation'
              : 'digital-human',
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
      const prompt = `请根据以下信息创作一篇专业的短视频文案。

【视频主题】
${input.topic}

视频类型：${videoTypeLabels[input.videoType]}

【目标观众】
${input.audience}

【视频目的】
${input.purpose}

【核心观点】
${input.coreViewpoint}

【补充资料】
${input.sourceMaterial || '无'}

【表达语气】
${input.tone}

【目标字数】
约 ${input.targetWordCount} 个中文字符，允许上下浮动 10%。

【额外创作要求】
${input.customPrompt?.trim() || '无'}

必须严格遵守系统提示词中的文案质量、段落交替和 JSON 输出要求。`;
      const useChatCompletions = config.apiMode === 'chat-completions';
      const jsonSystemPrompt = `你是一名专业的抖音短视频文案策划，擅长创作“数字人口播 + 画面讲解”交替呈现的短视频文案。

文案质量要求：
1. 前 3 秒对应的第一段必须使用冲突、痛点、结果或反常识形成强钩子。
2. 全文口语化、短句化，像真人自然说话；每句话只表达一个重点。
3. 禁止使用“随着时代发展”“众所周知”“在当今社会”等空洞开场。
4. 不堆砌形容词，不写没有信息量的正确废话。
5. 不编造补充资料中没有的数据、案例、经历或用户反馈。
6. 结尾给出明确结论，并自然引导评论、收藏或关注。
7. 全文安排 6-9 个段落，digital-human 与 visual-explanation 交替出现，不得连续出现超过两个 digital-human。
8. digital-human 负责钩子、提问、观点、情绪变化、关键结论和收束；每段 1-3 句话。
9. visual-explanation 负责原因、案例、步骤、对比、产品功能、数据和过程，语言必须具体到后期人员能判断该配什么画面。
10. 数字人口播负责“说观点”，画面讲解负责“给证据”，两者不得重复相同信息。

只输出合法 JSON，不要 Markdown。结构必须为 {title, hook, scenes, ending}。scenes 必须有 6-9 项，每项包含 segmentType、narration、caption、visualPrompt、suggestedDuration、visualIntent、shots。segmentType 只能是 digital-human 或 visual-explanation。caption 是段落短标题，不是最终字幕。shots 每项包含 visualPurpose、shotType、assetStrategy、durationWeight、searchQueries、imagePrompt、videoPrompt。
shotType 只能使用英文枚举：real-footage、stock-video、generated-video、generated-image、science-animation、digital-human。
assetStrategy 只能使用英文枚举：local-first、stock-search、ai-generate、programmatic、digital-human。
searchQueries 必须是字符串数组，不能是单个字符串。
JSON 输出格式示例：
{
  "title": "示例标题",
  "hook": "示例开头",
  "scenes": [
    {"segmentType":"digital-human","narration":"第一段旁白","caption":"开场钩子","visualPrompt":"数字人正面出镜","suggestedDuration":6,"visualIntent":"提出冲突","shots":[{"visualPurpose":"数字人说出钩子","shotType":"digital-human","assetStrategy":"digital-human","durationWeight":1,"searchQueries":["digital human presenter"],"imagePrompt":"","videoPrompt":"数字人口播"}]},
    {"segmentType":"visual-explanation","narration":"第二段旁白","caption":"问题展示","visualPrompt":"具体问题场景","suggestedDuration":8,"visualIntent":"用场景展示问题","shots":[{"visualPurpose":"展示具体问题","shotType":"stock-video","assetStrategy":"stock-search","durationWeight":1,"searchQueries":["problem scenario"],"imagePrompt":"","videoPrompt":"真实场景"}]},
    {"segmentType":"digital-human","narration":"第三段旁白","caption":"核心判断","visualPrompt":"数字人强调观点","suggestedDuration":6,"visualIntent":"说出核心判断","shots":[{"visualPurpose":"数字人强调观点","shotType":"digital-human","assetStrategy":"digital-human","durationWeight":1,"searchQueries":["digital human presenter"],"imagePrompt":"","videoPrompt":"数字人口播"}]},
    {"segmentType":"visual-explanation","narration":"第四段旁白","caption":"原因拆解","visualPrompt":"原因拆解过程","suggestedDuration":8,"visualIntent":"解释原因","shots":[{"visualPurpose":"可视化解释原因","shotType":"science-animation","assetStrategy":"programmatic","durationWeight":1,"searchQueries":["concept animation"],"imagePrompt":"解释动画","videoPrompt":""}]},
    {"segmentType":"digital-human","narration":"第五段旁白","caption":"关键观点","visualPrompt":"数字人强调结论","suggestedDuration":6,"visualIntent":"强化记忆点","shots":[{"visualPurpose":"数字人强调关键结论","shotType":"digital-human","assetStrategy":"digital-human","durationWeight":1,"searchQueries":["digital human presenter"],"imagePrompt":"","videoPrompt":"数字人口播"}]},
    {"segmentType":"visual-explanation","narration":"第六段旁白","caption":"解决方法","visualPrompt":"具体操作步骤","suggestedDuration":8,"visualIntent":"给出可执行方法","shots":[{"visualPurpose":"展示操作步骤","shotType":"stock-video","assetStrategy":"stock-search","durationWeight":1,"searchQueries":["step by step solution"],"imagePrompt":"","videoPrompt":"步骤演示"}]},
    {"segmentType":"digital-human","narration":"第七段旁白","caption":"结尾收束","visualPrompt":"数字人结尾出镜","suggestedDuration":6,"visualIntent":"总结并互动引导","shots":[{"visualPurpose":"数字人总结","shotType":"digital-human","assetStrategy":"digital-human","durationWeight":1,"searchQueries":["digital human closing"],"imagePrompt":"","videoPrompt":"数字人结尾"}]}
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
                    minItems: 6,
                    maxItems: 9,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: [
                        'segmentType',
                        'narration',
                        'caption',
                        'visualPrompt',
                        'suggestedDuration',
                        'visualIntent',
                        'shots',
                      ],
                      properties: {
                        segmentType: {
                          type: 'string',
                          enum: ['digital-human', 'visual-explanation'],
                        },
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
