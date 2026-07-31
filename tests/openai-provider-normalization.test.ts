import {describe, expect, it} from 'vitest';
import {normalizeCompatibleScript} from '../src/ai/openai-provider';
import type {GenerateInput} from '../src/ai/types';

const input: GenerateInput = {
  topic: '测试主题',
  audience: '普通观众',
  purpose: '知识讲解',
  coreViewpoint: '',
  sourceMaterial: '',
  visualStyle: '真实电影感',
  aspectRatio: '9:16',
  tone: '自然',
  targetWordCount: 500,
  videoType: 'science-explainer',
};

describe('OpenAI 文案兼容处理', () => {
  it('兼容旁白别名并推导缺失的段落标题和建议时长', () => {
    const normalized = normalizeCompatibleScript(
      {
        title: '标题',
        hook: '钩子',
        scenes: [
          {
            narration: '',
            content: '水滴接触热油后会迅速汽化，膨胀的水蒸气把油滴推向四周。',
            caption: '',
            suggestedDuration: 0,
            visualIntent: '水滴落入热油并发生飞溅',
          },
        ],
      },
      input,
    ) as {scenes: Array<{narration: string; caption: string; suggestedDuration: number}>};

    expect(normalized.scenes[0]?.narration).toContain('迅速汽化');
    expect(normalized.scenes[0]?.caption).toBeTruthy();
    expect(normalized.scenes[0]?.suggestedDuration).toBeGreaterThan(0);
  });

  it('不使用画面描述伪造真正缺失的旁白', () => {
    const normalized = normalizeCompatibleScript(
      {scenes: [{visualIntent: '水滴落入热油'}]},
      input,
    ) as {scenes: Array<{narration: string; suggestedDuration: number}>};

    expect(normalized.scenes[0]?.narration).toBe('');
    expect(normalized.scenes[0]?.suggestedDuration).toBe(0);
  });
});
