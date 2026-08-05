import {describe, expect, it} from 'vitest';
import {parseDouyinTrends, parseToutiaoTrends} from '../src/ai/trending-topics';

describe('trending topic sources', () => {
  it('parses and cleans Douyin topics', () => {
    expect(
      parseDouyinTrends({word_list: [{word: ' 台风 为什么转弯 ', hot_value: 123}]}),
    ).toEqual([{title: '台风 为什么转弯', source: 'douyin', heat: 123}]);
  });

  it('ignores malformed Toutiao topics', () => {
    expect(parseToutiaoTrends({data: [{Title: '新型电池发布'}, {Title: null}]})).toEqual([
      {title: '新型电池发布', source: 'toutiao', heat: undefined},
    ]);
  });
});
