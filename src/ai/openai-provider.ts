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

const scriptFieldLabels: Record<string, string> = {
  title: '标题',
  hook: '开场钩子',
  scenes: '文案段落',
  segmentType: '段落类型',
  narration: '旁白文案',
  caption: '段落标题',
  visualPrompt: '画面描述',
  suggestedDuration: '建议时长',
  visualIntent: '画面意图',
  shots: '分镜素材',
  visualPurpose: '画面用途',
  shotType: '镜头类型',
  assetStrategy: '素材策略',
  durationWeight: '时长权重',
  searchQueries: '素材搜索词',
  ending: '结尾文案',
};

const formatScriptValidationError = (
  issues: Array<{path: PropertyKey[]; code: string}>,
): string => {
  const grouped = new Map<string, number[]>();
  const generalFields = new Set<string>();
  for (const issue of issues) {
    const path = issue.path.map(String);
    const sceneIndex = path[0] === 'scenes' && /^\d+$/.test(path[1] ?? '')
      ? Number(path[1])
      : null;
    const field = path.at(-1) ?? 'scenes';
    if (sceneIndex === null) {
      generalFields.add(scriptFieldLabels[field] ?? field);
      continue;
    }
    const key = `${issue.code === 'too_small' ? '缺少' : '格式不正确'}“${scriptFieldLabels[field] ?? field}”`;
    grouped.set(key, [...(grouped.get(key) ?? []), sceneIndex + 1]);
  }
  const details = [
    ...[...grouped].map(
      ([problem, indexes]) => `第 ${[...new Set(indexes)].join('、')} 段${problem}`,
    ),
    ...[...generalFields].map((field) => `“${field}”缺失或格式不正确`),
  ];
  return `AI 返回的文案结构不完整：${details.slice(0, 4).join('；') || '存在缺失字段'}。请重新生成，或调整补充要求后再试。`;
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
        visualPrompt: String(
          scene.visualPrompt ??
            scene.visualIntent ??
            scene.narration ??
            scene.caption ??
            '主题相关画面',
        ).trim() || '主题相关画面',
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
          const queriesZh = Array.isArray(shot.searchQueriesZh)
            ? shot.searchQueriesZh.map((item) => String(item).trim()).filter(Boolean)
            : [];
          const rawImagePrompt = String(shot.imagePrompt ?? '').trim();
          const rawVideoPrompt = String(shot.videoPrompt ?? '').trim();
          const rawImagePromptZh = String(shot.imagePromptZh ?? '').trim();
          const rawVideoPromptZh = String(shot.videoPromptZh ?? '').trim();
          const sceneDescription = String(
            scene.visualIntent ?? shot.visualPurpose ?? scene.narration ?? scene.visualPrompt ?? '',
          );
          const imagePrompt =
            rawImagePrompt.length >= 80
              ? rawImagePrompt
              : `Vertical ${input.aspectRatio} composition, ${sceneDescription}. Clear main subject placed on the visual center or rule-of-thirds intersection, complete environment and key objects, frozen natural action, layered lighting, coherent color palette, medium or context-appropriate shot, ${input.visualStyle}, high detail, clean space for subsequent motion, no text, no subtitles, no logo, no watermark.`;
          const videoPrompt =
            rawVideoPrompt.length >= 100
              ? rawVideoPrompt
              : `Vertical ${input.aspectRatio}, approximately ${Math.max(3, Math.min(8, Number(scene.suggestedDuration) || 5))} seconds. Start from the matching keyframe showing ${sceneDescription}. The subject pauses briefly, then performs a natural action related to the narration while subtle environmental motion develops. Establish the scene with a stable shot, then use a slow push-in or smooth lateral tracking movement. Keep the pacing clear, lighting direction, color palette, subject identity and spatial layout consistent. Use the corresponding image as the first frame; add only natural subject motion, camera movement and environmental dynamics. No text, subtitles, logo or watermark.`;
          const imagePromptZh =
            rawImagePromptZh.length >= 40
              ? rawImagePromptZh
              : `${input.aspectRatio} 竖屏画面，${sceneDescription}。主体位于视觉中心或三分线位置，完整呈现场景环境、关键物体和动作定格；光线层次清晰，色彩统一，使用${input.visualStyle}，采用适合内容表达的景别，高细节，为后续运动留出空间，不要文字、字幕、标志和水印。`;
          const videoPromptZh =
            rawVideoPromptZh.length >= 60
              ? rawVideoPromptZh
              : `${input.aspectRatio} 竖屏，约 ${Math.max(3, Math.min(8, Number(scene.suggestedDuration) || 5))} 秒。以对应图片为首帧，初始画面展示${sceneDescription}。主体短暂停顿后完成与旁白对应的自然动作，环境产生轻微动态；镜头先稳定建立场景，再缓慢推近或平滑横移。保持人物、物体、光线、色彩和空间布局一致，不要文字、字幕、标志和水印。`;
          return {
            ...shot,
            shotType,
            assetStrategy: normalizeStrategy(shot.assetStrategy, shotType),
            durationWeight: Number(shot.durationWeight) || 1,
            searchQueries:
              queries.length > 0
                ? queries.slice(0, 8)
                : [sceneDescription, `${input.visualStyle} ${String(shot.visualPurpose ?? '')}`],
            searchQueriesZh:
              queriesZh.length > 0
                ? queriesZh.slice(0, 8)
                : [
                    String(shot.visualPurpose ?? scene.visualIntent ?? scene.caption ?? '主题画面'),
                    `${input.visualStyle} ${String(scene.visualPrompt ?? '相关场景')}`,
                  ],
            imagePrompt,
            videoPrompt,
            imagePromptZh,
            videoPromptZh,
          };
        }),
      };
    }),
  };
};

export const createOpenAIProviders = (config: OpenAIConfig): ProviderSet => ({
  text: {
    generateScript: async (input: GenerateInput) => {
      const minimumNarrationChars = Math.floor(input.targetWordCount * 0.9);
      const maximumNarrationChars = Math.ceil(input.targetWordCount * 1.1);
      const requiredSceneCount = input.targetWordCount > 500 ? 9 : 7;
      const minimumCharsPerScene = Math.floor(minimumNarrationChars / requiredSceneCount);
      const maximumCharsPerScene = Math.ceil(maximumNarrationChars / requiredSceneCount);
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

【参考原文】
${input.referenceText?.trim() || '无'}
${input.referenceText?.trim() ? '请以参考原文为主要内容基础，在不改变事实、数据和核心观点的前提下优化结构、钩子、节奏与口语表达；不要照抄，也不要编造原文没有的信息。' : ''}

【表达语气】
${input.tone}

【整体视觉风格】
${input.visualStyle}

【画面比例】
${input.aspectRatio}

【目标字数】
所有 scenes[].narration 拼接后的文案总字数约 ${input.targetWordCount} 个汉字。
合格范围：${minimumNarrationChars}-${maximumNarrationChars} 个汉字。
必须生成 ${requiredSceneCount} 段，每段 narration 控制在 ${minimumCharsPerScene}-${maximumCharsPerScene} 个汉字；不得用一句短句代替完整段落。
只统计 narration 中的汉字；title、hook、ending、caption、画面描述、搜索词以及图片/视频提示词均不计入目标字数。

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
      const jsonSystemPrompt = `你是一名专业的抖音短视频文案策划、视觉导演和 AI 视频提示词设计师，擅长创作“${isDigitalHuman ? '数字人口播' : '普通旁白'} + 画面讲解”交替呈现的短视频内容。

文案质量要求：
1. 前 3 秒对应的第一段必须使用冲突、痛点、结果或反常识形成强钩子。
2. 全文口语化、短句化，像真人自然说话；每句话只表达一个重点。
3. 禁止使用“随着时代发展”“众所周知”“在当今社会”等空洞开场。
4. 不堆砌形容词，不写没有信息量的正确废话。
5. 不编造补充资料中没有的数据、案例、经历或用户反馈。
6. 结尾给出明确结论，并自然引导评论、收藏或关注。
7. 全文必须恰好安排 ${requiredSceneCount} 个段落，${speakerType} 与 visual-explanation 交替出现。
8. ${speakerType} 负责钩子、提问、观点、情绪变化、关键结论和收束；每段 narration 必须写成 ${minimumCharsPerScene}-${maximumCharsPerScene} 个汉字的完整内容。
9. visual-explanation 负责原因、案例、步骤、对比、产品功能、数据和过程，语言必须具体到后期人员能判断该配什么画面。
10. ${isDigitalHuman ? '数字人口播' : '普通旁白'}负责“说观点”，画面讲解负责“给证据”，两者不得重复相同信息。
11. 字数目标只针对所有 scenes[].narration 的汉字合计。生成后必须在内部逐段统计并补充或精简 narration，使总数达到 ${minimumNarrationChars}-${maximumNarrationChars} 个汉字；不要把其他 JSON 字段计入文案字数。
${digitalHumanDirection}

只输出合法 JSON，不要 Markdown。结构必须为 {title, hook, scenes, ending}。scenes 必须恰好有 ${requiredSceneCount} 项，每项包含 segmentType、narration、caption、visualPrompt、suggestedDuration、visualIntent、digitalHumanEmotion、digitalHumanAction、digitalHumanBackground、soundEffect、shots。segmentType 只能是 ${speakerType} 或 visual-explanation。caption 是段落短标题，不是最终字幕。shots 每项包含 visualPurpose、shotType、assetStrategy、durationWeight、searchQueries、searchQueriesZh、imagePrompt、videoPrompt、imagePromptZh、videoPromptZh。
输出 JSON 前再次检查：仅将 scenes 中每个 narration 的汉字数量相加，结果必须在 ${minimumNarrationChars}-${maximumNarrationChars} 之间。
shotType 优先使用与来源无关的英文枚举：image、video、science-animation；只有数字人口播段可使用 digital-human。
assetStrategy 统一使用 source-agnostic；只有数字人口播段可使用 digital-human。是否为 AI 生成素材由素材库元数据标记，不在分镜中预设。
searchQueries 必须是字符串数组，不能是单个字符串。
每个 shot 都必须提供 2-6 个英文 searchQueries 和一一对应的中文 searchQueriesZh，并同时提供 imagePrompt、videoPrompt、imagePromptZh、videoPromptZh。imagePrompt 和 videoPrompt 使用专业英文撰写，供图片和视频模型直接调用；imagePromptZh 和 videoPromptZh 是准确完整的中文翻译，供页面展示。英文提示词不能只是几个风格词：图片提示词必须写清主体、环境、构图位置、外观特征、动作定格、光线、色彩、景别、视觉风格和画面比例；视频提示词必须写清初始画面、动作先后顺序、场景变化、镜头运动、节奏、时长、光线、色彩、比例和首帧一致性。
不要参考任何短占位文案或示例长度。先完成达到目标字数的 narration，再补充其他 JSON 字段。`;
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
                    minItems: requiredSceneCount,
                    maxItems: requiredSceneCount,
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
                              'searchQueriesZh',
                              'imagePrompt',
                              'videoPrompt',
                              'imagePromptZh',
                              'videoPromptZh',
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
                              searchQueriesZh: {type: 'array', items: {type: 'string'}},
                              imagePrompt: {type: 'string'},
                              videoPrompt: {type: 'string'},
                              imagePromptZh: {type: 'string'},
                              videoPromptZh: {type: 'string'},
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
      let rawScript: unknown;
      try {
        rawScript = JSON.parse(output) as unknown;
      } catch (error) {
        console.error('[AI 文案 JSON 解析失败]', error, output);
        throw new Error('AI 返回的内容不是有效的文案结构，请重新生成一次。');
      }
      const parsedScript = videoScriptSchema.safeParse(
        normalizeCompatibleScript(rawScript, input),
      );
      if (!parsedScript.success) {
        console.error('[AI 文案结构校验失败]', parsedScript.error.issues);
        throw new Error(formatScriptValidationError(parsedScript.error.issues));
      }
      return parsedScript.data;
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
