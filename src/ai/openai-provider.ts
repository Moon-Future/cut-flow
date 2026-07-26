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

const normalizeCompatibleScript = (value: unknown, input: GenerateInput): unknown => {
  const allowDigitalHuman = input.videoType === 'digital-human';
  if (!value || typeof value !== 'object') return value;
  const script = value as Record<string, unknown>;
  const scenes = Array.isArray(script.scenes) ? script.scenes : [];
  const shotTypes = new Set([
    'image',
    'video',
    'real-footage',
    'stock-video',
    'generated-video',
    'generated-image',
    'science-animation',
    'digital-human',
  ]);
  const strategies = new Set([
    'source-agnostic',
    'local-first',
    'stock-search',
    'ai-generate',
    'programmatic',
    'digital-human',
  ]);
  const normalizeShotType = (input: unknown) => {
    const text = String(input ?? '').toLowerCase();
    if (['stock-video', 'generated-video', 'real-footage'].includes(text)) return 'video';
    if (text === 'generated-image') return 'image';
    if (shotTypes.has(text)) return text;
    if (/数字人|digital.?human/.test(text))
      return allowDigitalHuman ? 'digital-human' : 'video';
    if (/科学|动画|animation/.test(text)) return 'science-animation';
    if (/视频|实拍|真实|footage|video/.test(text)) return 'video';
    if (/图片|图像|image/.test(text)) return 'image';
    return 'video';
  };
  const normalizeStrategy = (input: unknown, shotType: string) => {
    const text = String(input ?? '').toLowerCase();
    if (text === 'digital-human' && allowDigitalHuman) return text;
    if (strategies.has(text)) return text === 'digital-human' && allowDigitalHuman
      ? 'digital-human'
      : 'source-agnostic';
    if (/数字人|digital/.test(text)) return allowDigitalHuman ? 'digital-human' : 'stock-search';
    return 'source-agnostic';
  };
  return {
    ...script,
    scenes: scenes.map((sceneValue) => {
      const scene =
        sceneValue && typeof sceneValue === 'object'
          ? (sceneValue as Record<string, unknown>)
          : {};
      const shots = Array.isArray(scene.shots) ? scene.shots : [];
      const requestedSegmentType = String(scene.segmentType ?? '');
      const segmentType =
        ['digital-human', 'voiceover', 'visual-explanation'].includes(requestedSegmentType)
          ? requestedSegmentType === 'digital-human' && !allowDigitalHuman
            ? 'voiceover'
            : requestedSegmentType
          : /画面|案例|步骤|数据|操作|界面/.test(String(scene.visualIntent ?? ''))
            ? 'visual-explanation'
            : allowDigitalHuman
              ? 'digital-human'
              : 'voiceover';
      return {
        ...scene,
        segmentType,
        digitalHumanEmotion:
          segmentType === 'digital-human' ? String(scene.digitalHumanEmotion ?? '认真') : '',
        digitalHumanAction:
          segmentType === 'digital-human' ? String(scene.digitalHumanAction ?? '正视镜头') : '',
        digitalHumanBackground:
          segmentType === 'digital-human'
            ? String(scene.digitalHumanBackground ?? '简洁演播室背景')
            : '',
        soundEffect: String(scene.soundEffect ?? '无'),
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
          const rawImagePrompt = String(shot.imagePrompt ?? '').trim();
          const rawVideoPrompt = String(shot.videoPrompt ?? '').trim();
          const hasTooMuchEnglish = (text: string) =>
            (text.match(/[A-Za-z]/g)?.length ?? 0) > 12;
          const toChinesePrompt = (text: string) =>
            text.replace(/\bLogo\b/gi, '标志').replace(/\bAI\b/gi, '人工智能');
          const usableImagePrompt = hasTooMuchEnglish(rawImagePrompt) ? '' : rawImagePrompt;
          const usableVideoPrompt = hasTooMuchEnglish(rawVideoPrompt) ? '' : rawVideoPrompt;
          const sceneDescription = String(
            scene.visualIntent ?? shot.visualPurpose ?? scene.narration ?? scene.visualPrompt ?? '',
          );
          const imagePromptBase =
            usableImagePrompt.length >= 80
              ? usableImagePrompt
              : `${input.aspectRatio} 画面，${usableImagePrompt || sceneDescription}。画面主体清晰，位于视觉中心或三分线构图，完整呈现所在环境、关键物体和动作定格状态；使用与主题一致的${input.visualStyle}，光线层次明确，色彩统一，中近景或最适合表达内容的景别，高细节，主体与背景关系清楚，为后续视频运动预留空间。不要文字，不要字幕，不要标志，不要水印。`;
          const imagePrompt = toChinesePrompt(
            /不要文字|no text/i.test(imagePromptBase)
              ? imagePromptBase
              : `${imagePromptBase} 不要文字，不要字幕，不要标志，不要水印。`,
          );
          const videoPromptCore =
            usableVideoPrompt.length >= 100
              ? usableVideoPrompt
              : `${input.aspectRatio}，约 ${Math.max(3, Math.min(8, Number(scene.suggestedDuration) || 5))} 秒视频。初始画面为：${sceneDescription}。${usableVideoPrompt || '主体先保持短暂停顿，随后完成与内容对应的自然动作，环境元素产生轻微动态变化'}。镜头先稳定建立场景，再缓慢推近或平滑横移跟随主体，动作按清晰先后顺序发生，节奏自然，避免突然跳切和大幅旋转。使用${input.visualStyle}，保持光线方向、主色调和空间布局稳定。`;
          return {
            ...shot,
            shotType,
            assetStrategy: normalizeStrategy(shot.assetStrategy, shotType),
            durationWeight: Number(shot.durationWeight) || 1,
            searchQueries:
              queries.length > 0
                ? queries.slice(0, 8)
                : [sceneDescription, `${input.visualStyle} ${String(shot.visualPurpose ?? '')}`],
            imagePrompt,
            videoPrompt: toChinesePrompt(
              `${videoPromptCore} 以对应图片作为首帧，保持主体外貌、服装、场景布局、物体位置和色彩风格一致，只增加自然动作、镜头运动和环境动态，不改变主体结构。避免变脸、异常手指、服装变色、物体消失和违反真实物理的动作。不要文字，不要字幕，不要标志，不要水印。`,
            ),
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

【整体视觉风格】
${input.visualStyle}

【画面比例】
${input.aspectRatio}

【目标字数】
约 ${input.targetWordCount} 个中文字符，允许上下浮动 10%。

【额外创作要求】
${input.customPrompt?.trim() || '无'}

必须严格遵守系统提示词中的文案质量、段落交替和 JSON 输出要求。`;
      const useChatCompletions = config.apiMode === 'chat-completions';
      const isDigitalHuman = input.videoType === 'digital-human';
      const digitalHumanDirection =
        isDigitalHuman
          ? `
数字人口播专项要求：
1. 视频形式是“数字人口播 + 画面讲解”交替切换；画面素材可混用真实素材、AI 图片和 AI 视频。
2. digital-human 段必须填写 digitalHumanEmotion、digitalHumanAction、digitalHumanBackground；动作简单自然，不频繁挥手。
3. visual-explanation 段的旁白必须与具体画面同步，画面描述要写清主体、环境、构图位置、动作、变化和观众应理解的信息。
4. 每个 visual-explanation 段必须同时提供完整 imagePrompt 和 videoPrompt，不能留空；后续可按需要选择真实素材或 AI 生成素材。
5. imagePrompt 必须包含主体、环境、构图、人物或物体特征、动作定格、光线、色彩、景别、视觉风格、${input.aspectRatio}，并明确不要文字、字幕、Logo、水印。
6. videoPrompt 不能复制 imagePrompt；必须描述初始画面、动作顺序、场景变化、镜头运动、节奏、建议时长、光线、色彩、风格和 ${input.aspectRatio}。
7. videoPrompt 结尾必须追加：以对应 AI 图片作为首帧，保持主体外貌、服装、场景布局、物体位置和色彩风格一致，只增加自然动作、镜头运动和环境动态，不改变主体结构。
8. 所有图片与视频提示词重复使用一致的主角特征、服装、主场景、核心物体、主色调、光线、视觉风格和镜头语言。
9. 避免变脸、异常手指、服装变色、场景突变、物体消失、大幅旋转、违反物理的动作、无关人物和无法辨认的界面文字。
10. visual-explanation 段填写具体 soundEffect，没有则写“无”。`
          : `
非数字人专项要求：
1. 本视频禁止出现数字人、虚拟主播、digital-human 类型镜头或 digital-human 素材策略。
2. 使用 voiceover 普通旁白与 visual-explanation 画面讲解组织内容；旁白不要求人物正面出镜。
3. voiceover 负责钩子、串联、观点和结论；visual-explanation 负责场景、案例、证据、步骤和变化。
4. 每个画面都允许从真实素材、AI 图片、AI 视频中选择或混用，文案阶段不预设素材来源。
5. visual-explanation 段必须给出具体画面内容、imagePrompt、videoPrompt 和 soundEffect。
6. imagePrompt 和 videoPrompt 遵循 ${input.aspectRatio}、${input.visualStyle}，不要文字、字幕、Logo 和水印。`;
      const speakerType = isDigitalHuman ? 'digital-human' : 'voiceover';
      const speakerVisual = isDigitalHuman ? '数字人正面出镜' : '主题相关真实画面';
      const speakerShotType = isDigitalHuman ? 'digital-human' : 'video';
      const speakerStrategy = isDigitalHuman ? 'digital-human' : 'source-agnostic';
      const speakerQuery = isDigitalHuman ? 'digital human presenter' : 'topic related footage';
      const jsonSystemPrompt = `你是一名专业的抖音短视频文案策划、视觉导演和 AI 视频提示词设计师，擅长创作“${isDigitalHuman ? '数字人口播' : '普通旁白'} + 画面讲解”交替呈现的短视频内容。

文案质量要求：
1. 前 3 秒对应的第一段必须使用冲突、痛点、结果或反常识形成强钩子。
2. 全文口语化、短句化，像真人自然说话；每句话只表达一个重点。
3. 禁止使用“随着时代发展”“众所周知”“在当今社会”等空洞开场。
4. 不堆砌形容词，不写没有信息量的正确废话。
5. 不编造补充资料中没有的数据、案例、经历或用户反馈。
6. 结尾给出明确结论，并自然引导评论、收藏或关注。
7. 全文安排 6-9 个段落，${speakerType} 与 visual-explanation 交替出现。
8. ${speakerType} 负责钩子、提问、观点、情绪变化、关键结论和收束；每段 1-3 句话。
9. visual-explanation 负责原因、案例、步骤、对比、产品功能、数据和过程，语言必须具体到后期人员能判断该配什么画面。
10. ${isDigitalHuman ? '数字人口播' : '普通旁白'}负责“说观点”，画面讲解负责“给证据”，两者不得重复相同信息。
${digitalHumanDirection}

只输出合法 JSON，不要 Markdown。结构必须为 {title, hook, scenes, ending}。scenes 必须有 6-9 项，每项包含 segmentType、narration、caption、visualPrompt、suggestedDuration、visualIntent、digitalHumanEmotion、digitalHumanAction、digitalHumanBackground、soundEffect、shots。segmentType 只能是 ${speakerType} 或 visual-explanation。caption 是段落短标题，不是最终字幕。shots 每项包含 visualPurpose、shotType、assetStrategy、durationWeight、searchQueries、imagePrompt、videoPrompt。
shotType 优先使用与来源无关的英文枚举：image、video、science-animation；只有数字人口播段可使用 digital-human。
assetStrategy 统一使用 source-agnostic；只有数字人口播段可使用 digital-human。是否为 AI 生成素材由素材库元数据标记，不在分镜中预设。
searchQueries 必须是字符串数组，不能是单个字符串。
每个 shot 都必须提供 2-6 个可检索的中英文 searchQueries，并同时提供完整 imagePrompt 和 videoPrompt。imagePrompt 和 videoPrompt 必须使用中文撰写，不得输出英文提示词。imagePrompt 不能只是几个风格词，必须写清主体、环境、构图位置、外观特征、动作定格、光线、色彩、景别、视觉风格和画面比例。videoPrompt 不能复制 imagePrompt，必须写清初始画面、动作先后顺序、场景变化、镜头运动、节奏、时长、光线、色彩、比例和首帧一致性。
JSON 输出格式示例：
{
  "title": "示例标题",
  "hook": "示例开头",
  "scenes": [
    {"segmentType":"${speakerType}","narration":"第一段旁白","caption":"开场钩子","visualPrompt":"${speakerVisual}","suggestedDuration":6,"visualIntent":"提出冲突","digitalHumanEmotion":"","digitalHumanAction":"","digitalHumanBackground":"","soundEffect":"无","shots":[{"visualPurpose":"说出钩子","shotType":"${speakerShotType}","assetStrategy":"${speakerStrategy}","durationWeight":1,"searchQueries":["${speakerQuery}"],"imagePrompt":"","videoPrompt":""}]},
    {"segmentType":"visual-explanation","narration":"第二段旁白","caption":"问题展示","visualPrompt":"具体问题场景","suggestedDuration":8,"visualIntent":"用场景展示问题","shots":[{"visualPurpose":"展示具体问题","shotType":"video","assetStrategy":"source-agnostic","durationWeight":1,"searchQueries":["problem scenario"],"imagePrompt":"关键帧提示词","videoPrompt":"动态视频提示词"}]},
    {"segmentType":"${speakerType}","narration":"第三段旁白","caption":"核心判断","visualPrompt":"${speakerVisual}","suggestedDuration":6,"visualIntent":"说出核心判断","digitalHumanEmotion":"","digitalHumanAction":"","digitalHumanBackground":"","soundEffect":"无","shots":[{"visualPurpose":"强调观点","shotType":"${speakerShotType}","assetStrategy":"${speakerStrategy}","durationWeight":1,"searchQueries":["${speakerQuery}"],"imagePrompt":"","videoPrompt":""}]},
    {"segmentType":"visual-explanation","narration":"第四段旁白","caption":"原因拆解","visualPrompt":"原因拆解过程","suggestedDuration":8,"visualIntent":"解释原因","shots":[{"visualPurpose":"可视化解释原因","shotType":"science-animation","assetStrategy":"source-agnostic","durationWeight":1,"searchQueries":["concept animation"],"imagePrompt":"解释动画关键帧","videoPrompt":"解释动画的动态过程"}]},
    {"segmentType":"${speakerType}","narration":"第五段旁白","caption":"关键观点","visualPrompt":"${speakerVisual}","suggestedDuration":6,"visualIntent":"强化记忆点","digitalHumanEmotion":"","digitalHumanAction":"","digitalHumanBackground":"","soundEffect":"无","shots":[{"visualPurpose":"强调关键结论","shotType":"${speakerShotType}","assetStrategy":"${speakerStrategy}","durationWeight":1,"searchQueries":["${speakerQuery}"],"imagePrompt":"","videoPrompt":""}]},
    {"segmentType":"visual-explanation","narration":"第六段旁白","caption":"解决方法","visualPrompt":"具体操作步骤","suggestedDuration":8,"visualIntent":"给出可执行方法","shots":[{"visualPurpose":"展示操作步骤","shotType":"video","assetStrategy":"source-agnostic","durationWeight":1,"searchQueries":["step by step solution"],"imagePrompt":"步骤关键帧","videoPrompt":"步骤动态演示"}]},
    {"segmentType":"${speakerType}","narration":"第七段旁白","caption":"结尾收束","visualPrompt":"${speakerVisual}","suggestedDuration":6,"visualIntent":"总结并互动引导","digitalHumanEmotion":"","digitalHumanAction":"","digitalHumanBackground":"","soundEffect":"无","shots":[{"visualPurpose":"完成总结","shotType":"${speakerShotType}","assetStrategy":"${speakerStrategy}","durationWeight":1,"searchQueries":["${speakerQuery}"],"imagePrompt":"","videoPrompt":""}]}
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
                        'digitalHumanEmotion',
                        'digitalHumanAction',
                        'digitalHumanBackground',
                        'soundEffect',
                        'shots',
                      ],
                      properties: {
                        segmentType: {
                          type: 'string',
                          enum: ['digital-human', 'voiceover', 'visual-explanation'],
                        },
                        narration: {type: 'string'},
                        caption: {type: 'string'},
                        visualPrompt: {type: 'string'},
                        suggestedDuration: {type: 'number'},
                        visualIntent: {type: 'string'},
                        digitalHumanEmotion: {type: 'string'},
                        digitalHumanAction: {type: 'string'},
                        digitalHumanBackground: {type: 'string'},
                        soundEffect: {type: 'string'},
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
                                  'image',
                                  'video',
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
                                  'source-agnostic',
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
      return videoScriptSchema.parse(
        normalizeCompatibleScript(JSON.parse(output) as unknown, input),
      );
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
