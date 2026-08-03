import {describe, expect, it} from 'vitest';
import {buildPortableScriptPrompt} from '../src/ai/portable-script-prompt';

const baseInput = {
  topic: '左眼跳财，右眼跳灾？其实你的眼皮在抗议。',
  referenceText: '',
  customPrompt: '',
  audience: '喜欢生活科普的普通观众',
  purpose: '解释常见误区',
  coreViewpoint: '眼皮跳动通常与肌肉疲劳和刺激有关',
  sourceMaterial: '',
  visualStyle: '电影级写实',
  aspectRatio: '16:9',
  tone: '有趣但严谨',
  targetWordCount: 800,
  durationTarget: 120,
  videoType: 'science-explainer' as const,
};

describe('可移植文案提示词', () => {
  it('包含当前创作选项且不暴露内部结构化输出说明', () => {
    const prompt = buildPortableScriptPrompt(baseInput);
    expect(prompt).toContain(baseInput.topic);
    expect(prompt).toContain('目标字数：约 800 个汉字');
    expect(prompt).toContain('目标时长：约 120 秒');
    expect(prompt).toContain('有趣但严谨');
    expect(prompt).not.toMatch(/json|system prompt|user prompt/iu);
  });

  it('仅生成分镜模式明确锁定全文原文', () => {
    const prompt = buildPortableScriptPrompt({
      ...baseInput,
      storyboardOnly: true,
      fullScript: '这是已经定稿的全文文案。',
    });
    expect(prompt).toContain('这是已经定稿的全文文案。');
    expect(prompt).toContain('不要改写、润色、纠错、删减或补充');
    expect(prompt).toContain('只执行分段和分镜设计');
  });
  it('随参考原文和补充要求更新', () => {
    const prompt = buildPortableScriptPrompt({
      ...baseInput,
      referenceText: '这是新的参考原文',
      customPrompt: '结尾不要提问',
    });
    expect(prompt).toContain('这是新的参考原文');
    expect(prompt).toContain('结尾不要提问');
  });
});
