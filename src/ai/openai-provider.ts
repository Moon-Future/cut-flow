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
    const sceneIndex = path[0] === 'scenes' && /^\d+$/.test(path[1] ?? '') ? Number(path[1]) : null;
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
    if (/数字人|digital.?human/.test(text)) return allowDigitalHuman ? 'digital-human' : 'video';
    if (/科学|动画|animation/.test(text)) return 'science-animation';
    if (/视频|实拍|真实|footage|video/.test(text)) return 'video';
    if (/图片|图像|image/.test(text)) return 'image';
    return 'video';
  };
  const normalizeStrategy = (input: unknown, shotType: string) => {
    const text = String(input ?? '').toLowerCase();
    if (text === 'digital-human' && allowDigitalHuman) return text;
    if (strategies.has(text))
      return text === 'digital-human' && allowDigitalHuman ? 'digital-human' : 'source-agnostic';
    if (/数字人|digital/.test(text)) return allowDigitalHuman ? 'digital-human' : 'stock-search';
    return 'source-agnostic';
  };
  return {
    ...script,
    scenes: scenes.map((sceneValue) => {
      const scene =
        sceneValue && typeof sceneValue === 'object' ? (sceneValue as Record<string, unknown>) : {};
      const shots = Array.isArray(scene.shots) ? scene.shots : [];
      const requestedSegmentType = String(scene.segmentType ?? '');
      const segmentType = ['digital-human', 'voiceover', 'visual-explanation'].includes(
        requestedSegmentType,
      )
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
        visualPrompt:
          String(
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
          const rawMotionPlan =
            shot.motionPlan && typeof shot.motionPlan === 'object'
              ? (shot.motionPlan as Record<string, unknown>)
              : {};
          const motionPresets = [
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
          ] as const;
          const requestedMotionIntensity = Number(rawMotionPlan.intensity);
          const motionPlan = {
            preset: motionPresets.includes(rawMotionPlan.preset as (typeof motionPresets)[number])
              ? (rawMotionPlan.preset as (typeof motionPresets)[number])
              : ('slow-zoom-in' as const),
            intensity: Number.isFinite(requestedMotionIntensity)
              ? Math.max(0, Math.min(1, requestedMotionIntensity))
              : 0.35,
            focusStart: String(rawMotionPlan.focusStart ?? shot.visualPurpose ?? '画面主体'),
            focusEnd: String(rawMotionPlan.focusEnd ?? '核心细节'),
            requiresLayering: Boolean(rawMotionPlan.requiresLayering),
            requiresAiVideo: Boolean(rawMotionPlan.requiresAiVideo),
          };
          const sceneDescription = [
            shot.visualPurpose,
            scene.visualIntent,
            scene.visualPrompt,
            scene.caption,
          ]
            .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
            .join('; ');
          const imagePrompt =
            rawImagePrompt.length >= 220
              ? rawImagePrompt
              : `Vertical ${input.aspectRatio} cinematic keyframe centered on "${sceneDescription}". Build a clear visual narrative that communicates the subject without captions. Place the core subject or essential object in the foreground from the lower frame toward the visual center, with realistic material, texture, color, and state details. In the middle ground, show the people, actions, or visible process required by the narration; define plausible roles, positions, gaze directions, facial expressions, hand gestures, and body language so every element supports the same narrative point. Use the background to establish a specific location, time, atmosphere, and relevant props without distracting decoration. Create distinct foreground, middle-ground, and background depth with a stable close-up plus medium-close composition. Freeze the most informative instant of action, emotion, contrast, or result. Expressions may be vivid but must remain believable and non-cartoonish. Use scene-appropriate cinematic lighting, clear facial modeling, controlled depth of field, a coherent color palette, ${input.visualStyle}, realistic high detail, and enough spatial continuity for later animation. Avoid abstract symbols, illegible interface text, unrelated people, text, subtitles, logos, and watermarks.`;
          const videoPrompt =
            rawVideoPrompt.length >= 280
              ? rawVideoPrompt
              : `Vertical ${input.aspectRatio} cinematic video, approximately ${Math.max(3, Math.min(8, Number(scene.suggestedDuration) || 5))} seconds, telling a concise visual story about "${sceneDescription}" with a clear beginning, change, and result. Use the corresponding image as the first frame and preserve the exact subject identity, facial features, clothing, props, object positions, background layout, lighting direction, and color palette. During the opening second, hold a stable establishing view so the relationship between the subject, people, and environment is readable. In the middle, let the characters perform scene-specific visible actions in a logical sequence, including natural gaze changes, hand movements, facial reactions, and body posture, while key objects respond according to real-world physics. In the final one to two seconds, settle on the most informative emotional contrast, transformation, or outcome. Begin with a stable camera, then use a restrained slow push-in, subtle lateral track, or gentle subject follow; avoid large rotations and abrupt scene changes. Keep motion continuous, pacing deliberate, environmental movement subtle, and all anatomy, fingers, clothing colors, object structures, and spatial relationships consistent. Do not introduce unrelated people or make objects appear or disappear. ${input.visualStyle}, cinematic lighting, realistic high detail, no abstract effects, illegible interface text, text, subtitles, logos, or watermarks.`;
          const imagePromptZh =
            rawImagePromptZh.length >= 220
              ? rawImagePromptZh
              : `${input.aspectRatio} 竖屏电影感画面，围绕“${sceneDescription}”设计有明确叙事重点的关键帧，让观众不看文字也能理解本镜头表达的关系、变化或冲突。前景安排核心主体或关键物体，占据画面下方至中央的主要区域，清楚表现材质、纹理、颜色和状态；中景安排承担叙事作用的人物、动作或变化过程，明确人物身份、数量、位置、视线、面部表情、手势和身体姿态；背景完整交代地点、时间、环境和相关道具，避免无关装饰。采用前景特写与中近景结合的稳定构图，主体位于视觉中心或三分线交点，形成清晰的前、中、后景层次。定格在动作、情绪、差异或结果最有信息量的一瞬间，突出真实的情绪和视觉对比，但不要卡通化。使用符合场景的电影级布光，主体清晰明亮，人物面部明暗层次自然，背景适度虚化；保持${input.visualStyle}、统一色彩、真实高细节，并为后续动作留出空间。不要抽象符号、无法辨认的界面文字、无关人物、文字、字幕、标志、Logo 和水印。`;
          const videoPromptZh =
            rawVideoPromptZh.length >= 260
              ? rawVideoPromptZh
              : `${input.aspectRatio} 竖屏电影感视频，约 ${Math.max(3, Math.min(8, Number(scene.suggestedDuration) || 5))} 秒，围绕“${sceneDescription}”完成一个有起点、变化和结果的微型镜头叙事。以对应图片作为首帧，前景主体、中景人物、背景环境、外貌服装、道具位置、光线和色彩完全一致。开始 0—1 秒稳定建立场景，让观众看清主体关系；中段人物依次完成与画面意图直接相关的可见动作，具体表现视线、手部动作、面部情绪和身体反应，关键物体同步产生符合真实物理的变化；最后 1—2 秒停留在最能说明观点、差异或结果的状态。镜头先稳定，再缓慢推近核心主体或小幅平滑横移，必要时轻微跟随人物，不大幅旋转、不突然切换场景。保持节奏清楚、动作连续、环境动态克制，人物外貌、手指、服装颜色、物体结构和空间布局稳定，不新增无关人物，不让物体凭空出现或消失。使用${input.visualStyle}、电影级光影、真实高细节，不要抽象特效、无法辨认的界面内容、文字、字幕、标志、Logo 和水印。`;
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
            motionPlan,
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
      const digitalHumanDirection = isDigitalHuman
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

只输出合法 JSON，不要 Markdown。结构必须为 {title, hook, scenes, ending}。scenes 必须恰好有 ${requiredSceneCount} 项，每项包含 segmentType、narration、caption、visualPrompt、suggestedDuration、visualIntent、digitalHumanEmotion、digitalHumanAction、digitalHumanBackground、soundEffect、shots。segmentType 只能是 ${speakerType} 或 visual-explanation。caption 是段落短标题，不是最终字幕。shots 每项包含 visualPurpose、shotType、assetStrategy、durationWeight、searchQueries、searchQueriesZh、imagePrompt、videoPrompt、imagePromptZh、videoPromptZh、motionPlan。
输出 JSON 前再次检查：仅将 scenes 中每个 narration 的汉字数量相加，结果必须在 ${minimumNarrationChars}-${maximumNarrationChars} 之间。
shotType 优先使用与来源无关的英文枚举：image、video、science-animation；只有数字人口播段可使用 digital-human。
assetStrategy 统一使用 source-agnostic；只有数字人口播段可使用 digital-human。是否为 AI 生成素材由素材库元数据标记，不在分镜中预设。
searchQueries 必须是字符串数组，不能是单个字符串。
每个 shot 都必须提供 2-6 个英文 searchQueries 和一一对应的中文 searchQueriesZh。两组搜索词用途不同：
- searchQueries 用于 Pixabay 等素材库，必须描述可拍摄的完整场景，至少包含“核心主体 + 人或物的行为 + 环境/用途”，优先采用 3-8 个常用英文单词。不得只写孤立物体名或“close-up”，例如不要只写“cilantro leaves close-up”，应写“people eating cilantro different facial reactions”或“chef adding fresh cilantro to food”。
- searchQueriesZh 用于 YouTube、B站、抖音等内容平台，必须保留视频主题和问题语义，写成用户真正会搜索的中文短语，例如“为什么有人觉得香菜像肥皂”“不爱吃香菜和基因有关吗”。不要把英文素材词逐字翻译成中文。
同一镜头的多个搜索词要覆盖“主题解释、人物行为、具体场景或过程”，不能只是同义词替换。
每个 shot 同时提供 imagePrompt、videoPrompt、imagePromptZh、videoPromptZh。imagePrompt 和 videoPrompt 使用专业英文撰写，供图片和视频模型直接调用；imagePromptZh 和 videoPromptZh 是准确完整的中文翻译，供页面展示。
每个 shot 的 motionPlan 必须给出可由 Remotion 执行的图片动态化方案：preset 只能是 none、slow-zoom-in、slow-zoom-out、pan-left、pan-right、pan-up、pan-down、ken-burns-left、ken-burns-right、gentle-float；intensity 为 0～1；focusStart 和 focusEnd 用中文描述运镜开始和结束关注的画面区域；requiresLayering 表示是否需要抠图分层；requiresAiVideo 仅在静态图片无法表达关键动作时为 true。优先让 requiresAiVideo 为 false，不得把人物表情变化、转头、抬手等静态图片无法实现的动作伪装成普通 Ken Burns。

图片提示词必须达到可直接执行的视觉导演稿质量，中文不少于 280 个汉字，禁止使用一段“主体清晰、构图稳定、光线统一”式的通用镜头规范敷衍。按以下顺序具体设计：
1. 先说明本镜头的主题、叙事重点，以及要让观众一眼理解的关系、变化、反差或情绪；没有冲突的主题则明确知识过程、因果关系或视觉发现。
2. 分别描述前景、中景、背景。写清核心主体占画面的位置和比例、材质纹理与状态；人物镜头要明确合理的人数、身份、外貌特征、服装、站位或座位。
3. 每位关键人物都要有与内容对应且彼此不重复的表情、视线、手部动作和身体姿态。没有人物时，要同等详细地描述物体状态、变化阶段、空间关系和可见现象。
4. 指定与主题直接相关的场景、道具和环境细节，不得堆放无关装饰。
5. 明确景别、机位、构图、视觉中心和前中后景关系，并说明画面定格在哪个最有信息量的瞬间。
6. 明确主光方向、冷暖关系、色彩、景深、真实度和视觉风格；情绪可以鲜明，但动作和表演必须真实，除非用户指定卡通风格。
7. 最后写清禁止项和为图生视频预留的动作空间。

视频提示词必须是图片提示词的动态延续，中文不少于 320 个汉字，不能直接复制图片提示词。必须写清：
0. 不得复制、引用或概括完整 narration，不要把口播稿写入提示词；只把其中与当前镜头有关的信息转译成可见的场景、主体、动作、变化和结果。
1. 总时长、画面比例，并按“开始 0—1 秒 / 中段 / 最后 1—2 秒”描述动作先后顺序和最终状态。
2. 每位人物的视线、表情、手势、身体动作，以及关键物体如何随动作变化；无人物镜头则描述现象或过程的连续变化。
3. 镜头从何处开始，何时推近、横移、跟随或保持稳定，运镜必须服务叙事且幅度克制。
4. 节奏、环境动态和光线变化；视频只生成无声画面，不要音乐、配音、旁白、对白或人声。
5. 明确以对应图片为首帧，保持人物外貌、服装、道具、物体位置、场景布局、光线、色彩和镜头方向一致。
6. 避免变脸、异常手指、物体消失、无关人物、突然换景、违反物理规律和无法辨认的文字。

四条提示词必须针对当前镜头逐条重新设计，不能在不同镜头间只替换主题名。英文版本必须完整保留中文版本中的人物、动作、构图和时间信息。
不要参考任何短占位文案或示例长度。先完成达到目标字数的 narration，再补充其他 JSON 字段。`;
      config.onPrompt?.({
        system: useChatCompletions
          ? jsonSystemPrompt
          : '使用 Responses API 的 video_script 严格 JSON Schema 生成视频文案。',
        user: prompt,
      });
      const response = await request(
        `${config.baseUrl ?? 'https://api.openai.com/v1'}/${useChatCompletions ? 'chat/completions' : 'responses'}`,
        config.apiKey,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(
            useChatCompletions
              ? {
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
                }
              : {
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
                                      'motionPlan',
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
                                      motionPlan: {
                                        type: 'object',
                                        additionalProperties: false,
                                        required: [
                                          'preset',
                                          'intensity',
                                          'focusStart',
                                          'focusEnd',
                                          'requiresLayering',
                                          'requiresAiVideo',
                                        ],
                                        properties: {
                                          preset: {
                                            type: 'string',
                                            enum: [
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
                                            ],
                                          },
                                          intensity: {type: 'number'},
                                          focusStart: {type: 'string'},
                                          focusEnd: {type: 'string'},
                                          requiresLayering: {type: 'boolean'},
                                          requiresAiVideo: {type: 'boolean'},
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
                    },
                  },
                },
          ),
        },
      );
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
      const parsedScript = videoScriptSchema.safeParse(normalizeCompatibleScript(rawScript, input));
      if (!parsedScript.success) {
        console.error('[AI 文案结构校验失败]', parsedScript.error.issues);
        throw new Error(formatScriptValidationError(parsedScript.error.issues));
      }
      return parsedScript.data;
    },
  },
  tts: {
    synthesize: async (text) => {
      const response = await request(
        `${config.baseUrl ?? 'https://api.openai.com/v1'}/audio/speech`,
        config.apiKey,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            model: config.ttsModel ?? 'tts-1',
            voice: 'alloy',
            input: text,
            response_format: 'wav',
          }),
        },
      );
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
