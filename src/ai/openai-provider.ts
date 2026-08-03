import {videoScriptSchema} from './script-schema';
import type {GenerateInput, ProviderSet, TranscriptWord} from './types';
import {buildFallbackVideoPromptZh} from './video-prompt-fallback';
import {splitFullScript} from './full-script-segments';

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

export const normalizeCompatibleScript = (value: unknown, input: GenerateInput): unknown => {
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
  const firstNonEmptyString = (...values: unknown[]) =>
    values
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      ?.trim() ?? '';
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
    ending: String(script.ending ?? '').trim(),
    scenes: scenes.map((sceneValue) => {
      const scene =
        sceneValue && typeof sceneValue === 'object' ? (sceneValue as Record<string, unknown>) : {};
      const returnedShots = Array.isArray(scene.shots) ? scene.shots : [];
      const requestedSegmentType = String(scene.segmentType ?? '');
      const narration = firstNonEmptyString(
        scene.narration,
        scene.narrationText,
        scene.voiceover,
        scene.script,
        scene.content,
        scene.text,
      );
      const caption =
        firstNonEmptyString(scene.caption, scene.heading, scene.subtitle, scene.title) ||
        (narration
          ? `${Array.from(narration).slice(0, 18).join('')}${Array.from(narration).length > 18 ? '…' : ''}`
          : '');
      const requestedDuration = Number(
        scene.suggestedDuration ?? scene.duration ?? scene.estimatedDuration,
      );
      const suggestedDuration =
        Number.isFinite(requestedDuration) && requestedDuration > 0
          ? Math.min(30, requestedDuration)
          : narration
            ? Math.max(3, Math.min(30, Array.from(narration).length / 4))
            : 0;
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
      const visualIntent =
        String(
          scene.visualIntent ??
            scene.visualPrompt ??
            scene.caption ??
            scene.narration ??
            '围绕本段内容呈现清晰的主题画面',
        ).trim() || '围绕本段内容呈现清晰的主题画面';
      const shots =
        returnedShots.length > 0
          ? returnedShots
          : [
              {
                visualPurpose: visualIntent,
                shotType: segmentType === 'digital-human' ? 'digital-human' : 'image',
                assetStrategy:
                  segmentType === 'digital-human' ? 'digital-human' : 'source-agnostic',
                durationWeight: 1,
                searchQueries: [visualIntent],
                searchQueriesZh: [visualIntent],
              },
            ];
      return {
        ...scene,
        narration,
        caption,
        suggestedDuration,
        segmentType,
        visualIntent,
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
            rawImagePrompt.length > 0
              ? rawImagePrompt
              : `Vertical ${input.aspectRatio} cinematic keyframe centered on "${sceneDescription}". Build a clear visual narrative that communicates the subject without captions. Place the core subject or essential object in the foreground from the lower frame toward the visual center, with realistic material, texture, color, and state details. In the middle ground, show the people, actions, or visible process required by the narration; define plausible roles, positions, gaze directions, facial expressions, hand gestures, and body language so every element supports the same narrative point. Use the background to establish a specific location, time, atmosphere, and relevant props without distracting decoration. Create distinct foreground, middle-ground, and background depth with a stable close-up plus medium-close composition. Freeze the most informative instant of action, emotion, contrast, or result. Expressions may be vivid but must remain believable and non-cartoonish. Use scene-appropriate cinematic lighting, clear facial modeling, controlled depth of field, a coherent color palette, ${input.visualStyle}, realistic high detail, and enough spatial continuity for later animation. Avoid abstract symbols, illegible interface text, unrelated people, text, subtitles, logos, and watermarks.`;
          const videoPrompt =
            rawVideoPrompt.length > 0
              ? rawVideoPrompt
              : `Vertical ${input.aspectRatio} cinematic video, approximately ${Math.max(3, Math.min(8, Number(scene.suggestedDuration) || 5))} seconds. Build a self-contained visible scene that concretely depicts "${sceneDescription}" instead of displaying or paraphrasing those words. Open on the core subject, relevant people or objects, and a specific environment with appearance, materials, positions, lighting direction, and color palette fully established. During the opening second, hold a stable establishing view so their relationship is readable. In the middle, perform scene-specific visible actions in a logical sequence, including natural gaze changes, hand movements, facial reactions, body posture, and physically accurate object changes. In the final one to two seconds, settle on the most informative emotional contrast, transformation, or outcome. Begin with a stable camera, then use a restrained slow push-in, subtle lateral track, or gentle subject follow; avoid large rotations and abrupt scene changes. Keep motion continuous, pacing deliberate, environmental movement subtle, and all anatomy, clothing colors, object structures, and spatial relationships consistent. Do not introduce unrelated people or make objects appear or disappear. ${input.visualStyle}, cinematic lighting, realistic high detail, no abstract effects, illegible interface text, text, subtitles, logos, or watermarks.`;
          const imagePromptZh =
            rawImagePromptZh.length > 0
              ? rawImagePromptZh
              : `${input.aspectRatio} 竖屏电影感画面，围绕“${sceneDescription}”设计有明确叙事重点的关键帧，让观众不看文字也能理解本镜头表达的关系、变化或冲突。前景安排核心主体或关键物体，占据画面下方至中央的主要区域，清楚表现材质、纹理、颜色和状态；中景安排承担叙事作用的人物、动作或变化过程，明确人物身份、数量、位置、视线、面部表情、手势和身体姿态；背景完整交代地点、时间、环境和相关道具，避免无关装饰。采用前景特写与中近景结合的稳定构图，主体位于视觉中心或三分线交点，形成清晰的前、中、后景层次。定格在动作、情绪、差异或结果最有信息量的一瞬间，突出真实的情绪和视觉对比，但不要卡通化。使用符合场景的电影级布光，主体清晰明亮，人物面部明暗层次自然，背景适度虚化；保持${input.visualStyle}、统一色彩、真实高细节，并为后续动作留出空间。不要抽象符号、无法辨认的界面文字、无关人物、文字、字幕、标志、Logo 和水印。`;
          const videoPromptZh =
            rawVideoPromptZh.length > 0
              ? rawVideoPromptZh
              : buildFallbackVideoPromptZh({
                  aspectRatio: input.aspectRatio,
                  subject: sceneDescription,
                  duration: Number(scene.suggestedDuration) || 5,
                  visualStyle: `${input.visualStyle}、电影级光影和真实高细节`,
                });
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
      const desiredSceneCount = Math.max(
        3,
        Math.min(20, Math.ceil((input.durationTarget ?? 120) / 10)),
      );
      const fixedNarrations = input.storyboardOnly
        ? splitFullScript(input.fullScript ?? '', desiredSceneCount)
        : [];
      const narrationTarget = fixedNarrations.length
        ? fixedNarrations.reduce((sum, narration) => sum + Array.from(narration).length, 0)
        : input.targetWordCount;
      const minimumNarrationChars = fixedNarrations.length
        ? narrationTarget
        : Math.floor(narrationTarget * 0.9);
      const maximumNarrationChars = fixedNarrations.length
        ? narrationTarget
        : Math.ceil(narrationTarget * 1.1);
      const requiredSceneCount = fixedNarrations.length || desiredSceneCount;
      const minimumSceneCount = fixedNarrations.length ? requiredSceneCount : 3;
      const maximumSceneCount = fixedNarrations.length ? requiredSceneCount : 20;
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
【目标时长】
约 ${input.durationTarget ?? 120} 秒。以自然讲完和留出必要停顿为优先，不要为了凑字数重复解释。
${
  fixedNarrations.length
    ? `必须生成 ${requiredSceneCount} 段，并逐段保留锁定旁白。`
    : '段落数量由知识传播逻辑决定，不按字数或句子机械切分；总段落数控制在 3-20 段。'
}
只统计 narration 中的汉字；title、hook、ending、caption、画面描述、搜索词以及图片/视频提示词均不计入目标字数。

【额外创作要求】
${input.customPrompt?.trim() || '无'}

${
  fixedNarrations.length
    ? `【仅生成分镜模式】
下面 ${fixedNarrations.length} 段旁白已经由用户最终确认。必须逐段原样填写 narration，不得增删、改写、纠错、润色或交换顺序；你的任务只是在每段原文基础上设计段落标题、画面意图、镜头与素材提示。
${fixedNarrations.map((narration, index) => `第 ${index + 1} 段固定旁白：${narration}`).join('\n')}`
    : ''
}

必须严格遵守系统提示词中的文案质量、叙事节奏和 JSON 输出要求。`;
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
7. videoPrompt 必须独立、完整地描述开场画面，不得假设存在对应图片、参考图片或预设首帧；保持主体外貌、服装、场景布局、物体位置和色彩风格在视频全过程一致。
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
1. 你不是在写百科或课堂讲稿，而是在讲一个由日常困惑引出的科学小故事。观众应先认出熟悉现象，再产生疑问，最后得到可信、意外且容易转述的答案。
2. 写作前先在内部确定“核心问题、核心答案、必要的辅助信息、记忆点”，不要输出分析过程。
3. 从具体生活场景、反常现象或情绪瞬间切入，前两句内让观众理解问题，但不要第一句话直接解释原因。
4. 文案整体完成“生活现象—提出疑问—逐步揭秘—改变理解—回到生活”的认知变化，不要机械输出结构标签，也不要逐项套模板。
5. 只保留支撑核心答案所必需的 1～3 个信息点。没有三个可靠原因时不得强行凑数；先讲最主要原因，再补充真正有助于理解的因素。
6. 优先寻找误解纠正、反常识细节或视角转换；没有可靠反转时，用一个具体、易复述的事实作为记忆点，禁止为了戏剧效果编造冲突。
7. 全文口语化、短句化，像朋友分享一个有趣发现。多使用具体人物、动作、物体和场景，减少抽象概念，每句话只表达一个重点。
8. 禁止使用“今天我们来讲”“科学研究发现”“随着时代发展”“众所周知”“综上所述”“你学会了吗”等课堂式或空洞表达；不堆形容词，不重复问题和结论。
9. 避免绝对化，按证据合理使用“通常”“可能”“更容易”“主要原因之一”。不虚构研究、数据、专家、案例或因果关系，不把相关性写成确定因果。
10. 结尾重新解释开头现象，给出新的理解，并提出一个与观众真实经历有关、能够产生不同回答的问题；不要使用空泛的“你怎么看”，也不要生硬索要关注收藏。
11. ${
        fixedNarrations.length
          ? `全文必须恰好安排 ${requiredSceneCount} 个段落，并与锁定旁白逐段对应。`
          : '先分析核心问题、知识解释过程、关键转折点和最终结论，再按知识传播逻辑安排 3-20 个段落，不得按句子或字数机械切割。'
      }${speakerType} 与 visual-explanation 根据叙事需要合理穿插，不强制机械地逐段交替；各段长短服从口播节奏。
12. ${speakerType} 负责钩子、提问、观点、情绪变化、关键结论和收束；visual-explanation 负责原因、案例、步骤、对比、证据和过程。两者共同推进内容，不得重复相同信息。
13. 字数目标只针对所有 scenes[].narration 的汉字合计。生成后在内部精简或补充，使总数达到 ${minimumNarrationChars}-${maximumNarrationChars} 个汉字；不要把其他 JSON 字段计入文案字数。
${digitalHumanDirection}

只输出合法 JSON，不要 Markdown。结构必须为 {title, hook, scenes, ending}。scenes ${fixedNarrations.length ? `必须恰好有 ${requiredSceneCount} 项` : '应有 3-20 项，数量服从知识传播逻辑'}，每项包含 segmentType、narration、caption、visualPrompt、suggestedDuration、visualIntent、digitalHumanEmotion、digitalHumanAction、digitalHumanBackground、soundEffect、shots。segmentType 只能是 ${speakerType} 或 visual-explanation。caption 是段落短标题，不是最终字幕。shots 每项包含 visualPurpose、shotType、assetStrategy、durationWeight、searchQueries、searchQueriesZh、imagePrompt、videoPrompt、imagePromptZh、videoPromptZh、motionPlan。
每一段都必须一次性写完整：narration、caption、visualPrompt、visualIntent 不得为空字符串，suggestedDuration 必须是 0 到 30 之间的正数，禁止先放空字段或占位符等待后续补充。
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

分镜拆解总要求：
1. 先在内部识别核心问题、知识解释过程、关键转折点和最终结论，再按知识传播逻辑拆镜，不得按句子或字数机械切割。
2. 全片所有 shots 合计不得超过 20 个；每个 shot 最长 10 秒，并必须对应明确的旁白内容和明确的 visualPurpose。visualPurpose 要回答“这个画面为什么出现、要让观众理解什么”。
3. 禁止只生成漂亮但无信息的背景、只展示旁白提到的物体、堆放与知识点无关的装饰。画面必须可视化因果、对比、变化过程或信息关系。
4. videoPromptZh 必须按镜头实际时长精确标注连续时间段。每个时间段都要同时写明主体变化、动作变化和摄影机运动变化，并采用“视觉目的 + 场景 + 主体 + 动作 + 信息关系 + 运镜 + 视觉风格”的完整结构。
5. videoPrompt 必须与中文时间轴逐段对应，并明确使用 Narrative purpose、Scene、Subject、Action、Camera movement、Style 标签；不得省略信息关系或只翻译物体名称。
6. 整体采用电影级纪录片风格、真实摄影质感、自然光影、真实材质、丰富景深和 ${input.aspectRatio} 横屏构图。避免卡通风、PPT 展示感、简单插画感和无意义特效。
7. 最终画面应做到：即使没有字幕和旁白，观众也能从主体行为、空间关系与变化过程理解正在解释的知识。

图片提示词必须达到可直接执行的视觉导演稿质量，中文不少于 280 个汉字，禁止使用一段“主体清晰、构图稳定、光线统一”式的通用镜头规范敷衍。按以下顺序具体设计：
0. visualPurpose、visualPrompt 和四条生成提示词不得复制 narration、caption、标题或只罗列其中的关键词。必须先把抽象文案转译为摄像机能拍到的具体人物、物体、动作、环境、空间关系和可见结果；提示词中不得出现“围绕这段文案”“表现这个主题”“对应图片”“参考图片”等元描述。
1. 先说明本镜头的主题、叙事重点，以及要让观众一眼理解的关系、变化、反差或情绪；没有冲突的主题则明确知识过程、因果关系或视觉发现。
2. 分别描述前景、中景、背景。写清核心主体占画面的位置和比例、材质纹理与状态；人物镜头要明确合理的人数、身份、外貌特征、服装、站位或座位。
3. 每位关键人物都要有与内容对应且彼此不重复的表情、视线、手部动作和身体姿态。没有人物时，要同等详细地描述物体状态、变化阶段、空间关系和可见现象。
4. 指定与主题直接相关的场景、道具和环境细节，不得堆放无关装饰。
5. 明确景别、机位、构图、视觉中心和前中后景关系，并说明画面定格在哪个最有信息量的瞬间。
6. 明确主光方向、冷暖关系、色彩、景深、真实度和视觉风格；情绪可以鲜明，但动作和表演必须真实，除非用户指定卡通风格。
7. 最后写清禁止项和为图生视频预留的动作空间。

视频提示词必须是图片提示词的动态延续，中文不少于 320 个汉字，不能直接复制图片提示词。必须写清：
0. 不得复制、引用或概括完整 narration，不要把口播稿写入提示词；只把其中与当前镜头有关的信息转译成可见的场景、主体、动作、变化和结果。
0.1 先判断镜头属于人物、物体、地图/数据、环境或界面中的哪一类，再按实际存在的主体编写。无人镜头严禁出现人物、视线、面部、手部、手指、服装或身体动作；地图/数据镜头应具体描述区域高亮顺序、数据强弱变化、空间对应关系和最终比较结果。
1. 总时长、画面比例，并按“开始 0—1 秒 / 中段 / 最后 1—2 秒”描述动作先后顺序和最终状态。
2. 每位人物的视线、表情、手势、身体动作，以及关键物体如何随动作变化；无人物镜头则描述现象或过程的连续变化。
3. 镜头从何处开始，何时推近、横移、跟随或保持稳定，运镜必须服务叙事且幅度克制。
4. 节奏、环境动态和光线变化；视频只生成无声画面，不要音乐、配音、旁白、对白或人声。
5. 独立写清开场第一帧中人物或物体的外观、服装、道具、位置、场景布局、光线、色彩和镜头方向；不得假设存在对应图片或参考图片。
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
                  input: `${jsonSystemPrompt}\n\n${prompt}`,
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
                          title: {type: 'string', minLength: 1},
                          hook: {type: 'string', minLength: 1},
                          ending: {type: 'string'},
                          scenes: {
                            type: 'array',
                            minItems: minimumSceneCount,
                            maxItems: maximumSceneCount,
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
                                narration: {type: 'string', minLength: 1},
                                caption: {type: 'string', minLength: 1},
                                visualPrompt: {type: 'string', minLength: 1},
                                suggestedDuration: {
                                  type: 'number',
                                  exclusiveMinimum: 0,
                                  maximum: 30,
                                },
                                visualIntent: {type: 'string', minLength: 1},
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
                                      visualPurpose: {type: 'string', minLength: 1},
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
                                      durationWeight: {type: 'number', exclusiveMinimum: 0},
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
      const compatibleScript = normalizeCompatibleScript(rawScript, input) as Record<
        string,
        unknown
      >;
      const compatibleScenes = Array.isArray(compatibleScript.scenes)
        ? (compatibleScript.scenes as Array<Record<string, unknown>>)
        : [];
      const protectedScript = fixedNarrations.length
        ? {
            ...compatibleScript,
            title: input.topic,
            hook: fixedNarrations[0],
            ending: fixedNarrations.at(-1) ?? '',
            scenes: compatibleScenes.map((scene, index) => ({
              ...scene,
              narration: fixedNarrations[index] ?? '',
              caption:
                String(scene.caption ?? '').trim() ||
                `第 ${index + 1} 段：${Array.from(fixedNarrations[index] ?? '')
                  .slice(0, 12)
                  .join('')}`,
              suggestedDuration: Math.max(
                3,
                Math.min(30, Array.from(fixedNarrations[index] ?? '').length / 4),
              ),
            })),
          }
        : compatibleScript;
      const parsedScript = videoScriptSchema.safeParse(protectedScript);
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
