import type {GenerateInput} from './types';

const videoTypeLabels: Record<GenerateInput['videoType'], string> = {
  'science-explainer': '科普讲解',
  'knowledge-narration': '知识口播',
  'digital-human': '数字人口播',
  'product-showcase': '产品展示',
  storytelling: '故事叙事',
};

type PortableScriptPromptInput = GenerateInput & {
  referenceText?: string;
  customPrompt?: string;
  platformLabel?: string;
};

export const buildPortableScriptPrompt = (input: PortableScriptPromptInput) => {
  const duration = input.durationTarget ?? 120;
  const referenceText = input.referenceText?.trim() || '无，请根据主题原创';
  const sourceMaterial = input.sourceMaterial.trim() || '无';
  const customPrompt = input.customPrompt?.trim() || '无';

  if (input.storyboardOnly) {
    return `你是一名专业的视频分镜导演。下面提供的是已经定稿的完整旁白文案，不要改写、润色、纠错、删减或补充任何原文，只执行分段和分镜设计。

【视频主题】
${input.topic.trim() || '请根据全文概括主题'}

【定稿全文】
${input.fullScript?.trim() || input.referenceText?.trim() || '请粘贴全文文案'}

【制作配置】
- 视频类型：${videoTypeLabels[input.videoType]}
- 画面比例：${input.aspectRatio}
- 整体视觉风格：${input.visualStyle}
- 目标时长：约 ${duration} 秒

【补充分镜要求】
${customPrompt}

【分镜任务】
1. 按原文叙事顺序自然拆段，每段旁白必须逐字保留原文，不得改变文字和顺序。
2. 为每段提供简短标题、建议时长和具体画面意图。
3. 每段设计一个或多个镜头，写清可见主体、人物或物体动作、真实环境、构图、景别、光线和色彩。
4. 同时提供适合素材检索的中英文搜索词，以及可以直接用于图片生成和视频生成的详细提示词。
5. 画面必须把旁白含义转译成可以拍摄或生成的具体场景，不能只复述旁白关键词。
6. 没有参考图片时，不得出现“对应图片”“参考图片”或依赖预设首帧的描述。
7. 只输出分段后的原文旁白及其分镜方案，不要重新创作文案。`;
  }
  return `你是一名专业的中文视频文案策划，请围绕下面的选题创作一篇可以直接口播的完整文案。

【选题】
${input.topic.trim() || '请填写选题'}

【创作配置】
- 视频类型：${videoTypeLabels[input.videoType]}
- 发布平台：${input.platformLabel || '横屏视频平台'}
- 目标观众：${input.audience}
- 视频目的：${input.purpose}
- 核心观点：${input.coreViewpoint}
- 叙事语气：${input.tone}
- 目标字数：约 ${input.targetWordCount} 个汉字
- 目标时长：约 ${duration} 秒

【参考原文】
${referenceText}

【其他素材与事实依据】
${sourceMaterial}

【补充创作要求】
${customPrompt}

【文案要求】
1. 从具体生活场景、反常现象或情绪瞬间切入，前两句让观众立刻理解问题并产生好奇，但不要第一句就直接公布答案。
2. 按“熟悉现象—提出疑问—逐步揭秘—改变理解—回到生活”的节奏推进，重点讲清一个核心答案和真正必要的辅助信息。
3. 全文口语化、短句化，像朋友分享有趣发现；多用具体人物、动作、物体和场景，少用抽象概念、空话和课堂腔。
4. 优先加入可信的误区纠正、反常识细节或视角转换；不得虚构研究、数据、专家、案例或因果关系。
5. 避免“今天我们来讲”“众所周知”“综上所述”“你学会了吗”等套话，不重复问题和结论，不为了凑字数反复解释。
6. 根据内容自然分段。每段给出简短段落标题、完整旁白和建议时长，段落之间要有自然承接。
7. 结尾重新解释开头现象，给观众一个容易记住和转述的结论，再提出一个与真实经历有关、能产生不同回答的问题。
8. 只写最终可用的文案内容，不解释创作过程。`;
};
