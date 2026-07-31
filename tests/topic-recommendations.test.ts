import {describe, expect, it} from 'vitest';
import {normalizeTopicTitle} from '../src/ai/topic-recommendations';

describe('topic recommendations', () => {
  it('normalizes fixed prefixes, punctuation and spaces for deduplication', () => {
    expect(normalizeTopicTitle('为什么 人一紧张，就容易忘词？')).toBe('人一紧张就容易忘词');
    expect(normalizeTopicTitle('为什么人一紧张就容易忘词！')).toBe('人一紧张就容易忘词');
  });

  it('keeps genuinely different topics distinguishable', () => {
    expect(normalizeTopicTitle('为什么天空是蓝色的？')).not.toBe(
      normalizeTopicTitle('为什么夕阳是红色的？'),
    );
  });
});
