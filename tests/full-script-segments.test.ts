import {describe, expect, it} from 'vitest';
import {splitFullScript} from '../src/ai/full-script-segments';

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
});
