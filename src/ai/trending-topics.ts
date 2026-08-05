export type TrendingTopic = {
  title: string;
  source: 'douyin' | 'toutiao';
  heat?: number;
};

type DouyinResponse = {
  word_list?: Array<{word?: unknown; hot_value?: unknown}>;
};

type ToutiaoResponse = {
  data?: Array<{Title?: unknown; HotValue?: unknown}>;
};

const normalizeTrendTitle = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

export const parseDouyinTrends = (value: DouyinResponse): TrendingTopic[] =>
  (value.word_list ?? [])
    .map((item) => ({
      title: normalizeTrendTitle(item.word),
      source: 'douyin' as const,
      heat: Number.isFinite(Number(item.hot_value)) ? Number(item.hot_value) : undefined,
    }))
    .filter((item) => item.title.length > 0);

export const parseToutiaoTrends = (value: ToutiaoResponse): TrendingTopic[] =>
  (value.data ?? [])
    .map((item) => ({
      title: normalizeTrendTitle(item.Title),
      source: 'toutiao' as const,
      heat: Number.isFinite(Number(item.HotValue)) ? Number(item.HotValue) : undefined,
    }))
    .filter((item) => item.title.length > 0);

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Cut-Flow/0.1',
      Referer: 'https://www.douyin.com/',
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`热点源请求失败：${response.status}`);
  return (await response.json()) as T;
};

export const fetchTrendingTopics = async (): Promise<TrendingTopic[]> => {
  const results = await Promise.allSettled([
    fetchJson<DouyinResponse>('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/').then(
      parseDouyinTrends,
    ),
    fetchJson<ToutiaoResponse>('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc').then(
      parseToutiaoTrends,
    ),
  ]);
  // Douyin currently exposes about 50 official entries; retain all of them and
  // supplement them with a smaller second source rather than crowding either out.
  const topics = results.flatMap((result, index) =>
    result.status === 'fulfilled' ? result.value.slice(0, index === 0 ? 50 : 25) : [],
  );
  const seen = new Set<string>();
  return topics.filter((topic) => {
    const key = topic.title.toLocaleLowerCase('zh-CN');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
