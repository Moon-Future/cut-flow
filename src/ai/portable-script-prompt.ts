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
    return `请根据以下科普视频文案，制作一份专业的 ${input.aspectRatio} 横屏电影级分镜脚本。下面提供的是已经定稿的完整旁白文案，不要改写、润色、纠错、删减或补充任何原文，只执行分段和分镜设计。

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

【目标】
将文字内容转化为适合 AI 文生视频或图生视频的视觉脚本。每个镜头不仅要展示画面，还必须准确表达对应旁白传递的知识点、逻辑关系和情绪；即使没有字幕和旁白，观众也能通过画面理解正在解释的知识。

【分镜拆解要求】
1. 先分析文案中的核心问题、知识解释过程、关键转折点和最终结论，再按知识传播逻辑拆镜，不得按句子或字数机械切割。
2. 分镜数量由内容合理决定，全片最多 20 个分镜。单个镜头最长 10 秒，并必须对应明确的原文旁白。
3. 每个镜头都要写清“本镜头视觉目的”：这个画面为什么出现、要让观众理解什么。
4. 禁止只生成漂亮但无信息的背景、只展示旁白提到的物体，或使用与知识点无关的装饰元素。
5. 每段旁白必须逐字保留原文，不得改变文字和顺序；只执行拆分和视觉设计。

【时间轴要求】
每个镜头按实际时长拆成首尾连续、精确到秒的时间段。每个时间段必须同时包含：①主体变化；②动作变化；③摄影机运动变化。需要写清开场主体如何出现、中段信息如何演变、结尾如何强化重点或完成转场。

【画面演变描述要求】
不要只描述“有什么”，必须同时写清：
1. Scene：发生在哪里；
2. Subject：谁或什么是视觉核心；
3. Action：主体发生什么动作或变化；
4. Information relationship：画面如何解释旁白中的因果、对比、变化过程或逻辑关系；
5. Camera：景别、机位、构图和运镜如何服务知识表达。

【AI 中文视频提示词要求】
每个提示词必须采用“视觉目的 + 场景 + 主体 + 动作 + 信息关系 + 运镜 + 视觉风格”的完整结构，并按精确时间段书写。明确告诉 AI 每段画面想表达什么，突出因果关系、对比关系和变化过程，使用电影纪录片视觉语言。没有参考图片时，不得出现“对应图片”“参考图片”或依赖预设首帧的描述。

【AI 英文视频提示词要求】
英文提示词必须与中文时间轴逐段对应，并在每个时间段明确包含：
Narrative purpose: ...
Scene: ...
Subject: ...
Action: ...
Camera movement: ...
Style: ...

【整体视觉要求】
统一采用电影级纪录片风格、真实摄影质感、自然光影、真实材质、丰富景深和 ${input.aspectRatio} 横屏构图。避免卡通风、PPT 展示感、简单插画感和无意义特效。

【输出格式】
不要输出表格，也不要解释创作过程。按“分镜 1、分镜 2……”依次输出真实分镜描述，每个分镜必须固定包含以下内容：

分镜序号：
台词/旁白：
本镜头视觉目的：
画面演变描述（时间轴）：
AI中文视频提示词：
AI英文视频提示词：

每项内容都必须完整、具体，不得留空，不得只填写关键词或重复台词。`;
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
