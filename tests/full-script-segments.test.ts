import {describe, expect, it} from 'vitest';
import {recommendedStoryboardCount, splitFullScript} from '../src/ai/full-script-segments';

describe('全文文案分段', () => {
  it('按语义边界拆段且不改变原文内容', () => {
    const source = '第一句提出问题。第二句解释现象！第三句给出原因？第四句回到生活。第五句总结。';
    const segments = splitFullScript(source, 4);
    expect(segments).toHaveLength(4);
    expect(segments.join('')).toBe(source);
  });

  it('长句缺少句号时仍能拆成指定数量', () => {
    const source =
      '这是一段没有句号但已经定稿的完整旁白文案需要被稳定拆分并保持每一个原始字符不被模型改写';
    const segments = splitFullScript(source, 3);
    expect(segments).toHaveLength(3);
    expect(segments.join('')).toBe(source);
  });

  it('均衡分配句子，不把剩余内容集中到最后一段', () => {
    const source = Array.from({length: 18}, (_, index) => `第${index + 1}句说明知识。`).join('');
    const segments = splitFullScript(source, 12);
    const lengths = segments.map((segment) => Array.from(segment).length);
    const average = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
    expect(segments).toHaveLength(12);
    expect(segments.join('')).toBe(source);
    expect(lengths.at(-1)).toBeLessThanOrEqual(average * 1.5);
  });

  it('根据目标时长推荐分镜数量并限制在 3 到 20 个', () => {
    expect(recommendedStoryboardCount(20)).toBe(3);
    expect(recommendedStoryboardCount(120)).toBe(12);
    expect(recommendedStoryboardCount(600)).toBe(20);
  });
});
