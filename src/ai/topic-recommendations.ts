import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {ProjectFile} from '../core/schema';
import {aiSettingsFile, type AiProviderId, type AiProviderSetting} from './settings';
import type {TrendingTopic} from './trending-topics';

export type TopicRecommendation = {
  title: string;
  category: string;
  heatScore: number;
  reason: string;
  angle: string;
  trendSource?: 'douyin' | 'toutiao';
  sourceTopic?: string;
};

export type SavedTopicRecommendations = {
  pages: TopicRecommendation[][];
  provider: AiProviderId;
  generatedAt: string;
};

type LegacySavedTopicRecommendations = Omit<SavedTopicRecommendations, 'pages'> & {
  topics?: TopicRecommendation[];
  pages?: TopicRecommendation[][];
};

const topicRecommendationsFile = () =>
  path.join(path.dirname(aiSettingsFile()), 'topic-recommendations.json');

const normalizeSavedTopicRecommendations = (
  value: LegacySavedTopicRecommendations,
): SavedTopicRecommendations | null => {
  const pages = Array.isArray(value.pages)
    ? value.pages
        .filter((page): page is TopicRecommendation[] => Array.isArray(page) && page.length > 0)
        .map((page) => page.slice(0, 10))
    : Array.isArray(value.topics) && value.topics.length
      ? [value.topics.slice(0, 10)]
      : [];
  return pages.length
    ? {
        pages,
        provider: value.provider,
        generatedAt: value.generatedAt,
      }
    : null;
};

export const loadTopicRecommendations = async (): Promise<SavedTopicRecommendations | null> => {
  try {
    const value = JSON.parse(
      await readFile(topicRecommendationsFile(), 'utf8'),
    ) as LegacySavedTopicRecommendations;
    return normalizeSavedTopicRecommendations(value);
  } catch {
    const legacyFiles = [
      path.join(
        path.dirname(path.dirname(topicRecommendationsFile())),
        '.cut-flow',
        'topic-recommendations.json',
      ),
      path.join(os.homedir(), '.cut-flow', 'topic-recommendations.json'),
    ];
    for (const legacyFile of legacyFiles) {
      try {
        if (path.resolve(legacyFile) === path.resolve(topicRecommendationsFile())) continue;
        const value = JSON.parse(
          await readFile(legacyFile, 'utf8'),
        ) as LegacySavedTopicRecommendations;
        const migrated = normalizeSavedTopicRecommendations(value);
        if (!migrated) continue;
        await saveTopicRecommendations(migrated);
        return migrated;
      } catch {
        // Try the next legacy location.
      }
    }
    return null;
  }
};

export const saveTopicRecommendations = async (value: SavedTopicRecommendations): Promise<void> => {
  const file = topicRecommendationsFile();
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
  await chmod(file, 0o600).catch(() => undefined);
};

const topicSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['topics'],
  properties: {
    topics: {
      type: 'array',
      minItems: 10,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'category',
          'heatScore',
          'reason',
          'angle',
          'trendSource',
          'sourceTopic',
        ],
        properties: {
          title: {type: 'string'},
          category: {type: 'string'},
          heatScore: {type: 'number'},
          reason: {type: 'string'},
          angle: {type: 'string'},
          trendSource: {type: 'string', enum: ['douyin', 'toutiao', 'evergreen']},
          sourceTopic: {type: 'string'},
        },
      },
    },
  },
} as const;

export const normalizeTopicTitle = (title: string) =>
  title
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/^为什么/u, '')
    .replace(/[\s，。！？、：；,.!?:;'"“”‘’（）()《》【】[\]-]/gu, '');

const recommendationTitle = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('title' in value)) return '';
  return typeof value.title === 'string' ? value.title : '';
};

export const generateTopicRecommendations = async (
  provider: AiProviderId,
  setting: AiProviderSetting,
  project: ProjectFile,
  excludedTitles: string[] = [],
  trendingTopics: TrendingTopic[] = [],
): Promise<TopicRecommendation[]> => {
  const system = `你是一名擅长大众科普系列的中文视频选题策划，请严格推荐恰好 10 条有知识增量和传播潜力的主题。

选题配比：
1. 7 条“为什么”主系列：从自然科学、生活现象、人体心理、动物植物、历史文化、科技原理中选择观众熟悉但说不清原因的问题。
2. 3 条其他有趣科普系列，可以采用“民间说法 + 科学纠正”“反常识结论”“现象揭秘”“真假判断”“身体发出的信号”等结构。例如“左眼跳财，右眼跳灾？其实你的眼皮在抗议。”标题仍要落到可验证的科学解释，不能只做情绪或猎奇表达。
3. 10 条中兼顾常青知识和近期受关注的电影、社会话题、科技产品或文化现象，但不得编造上映信息、数据或事件。

标题规则：
1. 恰好 7 条标题以“为什么”开头；另外 3 条不得以“为什么”开头，题型和句式也要彼此不同。
2. 标题要具体、有悬念、有认知反差，读完让人想立刻知道答案；非“为什么”标题优先使用观众熟悉的说法或现象开场，再用后半句给出意外但不过度剧透的科学方向。
3. 10 条不能只是替换同义词，题材和解释角度必须明显不同。
4. 避免低俗、虚假夸张和无法验证的标题党。

heatScore 是 0-100 的 AI 热度判断，根据当前日期、普遍社会关注、讨论潜力、受众覆盖和长期搜索价值估算，不得声称读取了抖音、微博或其他平台的实时热榜。
热点使用规则：
1. 下方如果提供实时热点，它们只用于发现选题机会，不是必须覆盖的任务。先判断是否存在自然、可靠且对大众有用的科学、技术、健康、自然、历史或社会机制解释。
2. 能科普的热点应转化为独立、清晰的知识问题，不要照抄热搜词，不要在标题中生硬捆绑热点人物或事件；即使热点消退，标题也应仍有知识价值。
3. 纯娱乐、粉圈、营销、穿搭挑战、游戏活动、未经证实的传闻，以及只有猎奇或情绪价值的事件，必须跳过。不能为了凑数量强行科普。
4. 灾害、事故、健康和公共事件只解释可核验的通用原理与辨别方法，不消费伤亡，不根据一条热搜补写未经提供的事实。
5. 谣言热点可以转化为信息核验或相关科学概念，但不要重复放大谣言。若合格热点不足，用高质量常青科普补足 10 条。
6. reason 应如实说明选题来自近期热点启发或属于常青知识；heatScore 可以参考提供的榜单热度，但不等同于官方热度值。
7. 每条都必须输出 trendSource 和 sourceTopic。只有确实由候选中的某条热点转化时，trendSource 才能填 douyin 或 toutiao，sourceTopic 必须逐字复制对应候选标题；否则 trendSource 填 evergreen、sourceTopic 填空字符串。不得为了获得热点标记虚构关联。
reason 用一句话说明“为什么现在值得做”；angle 写清视频应该解释的核心答案方向。
输出前按 1 到 10 逐项清点，必须恰好返回 10 条。只输出合法 JSON，不要 Markdown。`;
  const user = `当前日期：${new Date().toISOString().slice(0, 10)}
当前项目：${project.project.title}
已有主题：${project.content?.topic || '暂无'}
视频类型：${project.content?.videoType || '未指定'}
目标观众：${project.content?.audience || '短视频平台普通观众'}
视频目的：${project.content?.purpose || '提升内容传播和互动'}
${excludedTitles.length ? `以下主题已经推荐过，本次不得重复，也不能只改写措辞或标点：\n${excludedTitles.map((title) => `- ${title}`).join('\n')}` : ''}
${trendingTopics.length ? `以下是刚刚获取的公开实时热点候选（来源与热度仅供筛选，不代表事实已经完整核验）：\n${trendingTopics.slice(0, 75).map((topic) => `- [${topic.source === 'douyin' ? '抖音' : '头条'}${topic.heat ? ` / ${topic.heat}` : ''}] ${topic.title}`).join('\n')}` : '本次未获取到实时热点，请完全按科普价值生成常青选题，不要假装掌握实时热榜。'}
请避免与已有主题和同批其他主题重复，并兼顾时效性、实用性、争议讨论度和长期价值。`;
  const apiKey = setting.apiKey || setting.secretKey;
  if (!apiKey) throw new Error('请先在设置中配置 AI 服务密钥');
  const isOpenAI = provider === 'openai';
  const response = await fetch(
    `${setting.baseUrl.replace(/\/$/, '')}/${isOpenAI ? 'responses' : 'chat/completions'}`,
    {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(
        isOpenAI
          ? {
              model: setting.model,
              input: `${system}\n\n${user}`,
              text: {
                format: {
                  type: 'json_schema',
                  name: 'topic_recommendations',
                  strict: true,
                  schema: topicSchema,
                },
              },
            }
          : {
              model: setting.model,
              messages: [
                {role: 'system', content: system},
                {role: 'user', content: user},
              ],
              response_format: {type: 'json_object'},
              max_tokens: 5000,
              stream: false,
              ...(provider === 'deepseek' ? {thinking: {type: 'disabled'}} : {}),
            },
      ),
    },
  );
  if (!response.ok)
    throw new Error(`AI 选题推荐失败（${response.status}）：${await response.text()}`);
  const result = (await response.json()) as {
    output_text?: string;
    choices?: Array<{message?: {content?: string}}>;
  };
  const output = result.output_text ?? result.choices?.[0]?.message?.content;
  if (!output) throw new Error('AI 未返回选题推荐内容');
  let parsed: {topics?: unknown; recommendations?: unknown} | unknown[];
  try {
    parsed = JSON.parse(output.replace(/^```json\s*|\s*```$/g, '')) as
      {topics?: unknown; recommendations?: unknown} | unknown[];
  } catch {
    throw new Error('AI 返回的选题推荐格式不正确，请刷新重试');
  }
  const received = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.topics)
      ? parsed.topics
      : Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [];
  if (!received.length) throw new Error('AI 没有返回可用的推荐主题，请刷新重试');
  const fallbackTitles = [
    '为什么天空会变成蓝色？',
    '为什么人一紧张就容易忘词？',
    '为什么猫能从高处稳稳落地？',
    '为什么手机电量最后 10% 掉得特别快？',
    '为什么有些旋律听一遍就忘不掉？',
    '为什么同样睡八小时，有人醒来还是很累？',
    '为什么越简单的视频反而越容易传播？',
    '左眼跳财，右眼跳灾？其实你的眼皮在抗议。',
    '憋住的喷嚏会消失吗？身体其实换了一条出口。',
    '手机越用越卡，不一定是存储空间惹的祸。',
  ];
  const excludedKeys = new Set(excludedTitles.map(normalizeTopicTitle));
  const completed = received.filter((value, index, values) => {
    const title = recommendationTitle(value);
    const key = normalizeTopicTitle(title);
    return (
      key.length > 0 &&
      !excludedKeys.has(key) &&
      values.findIndex(
        (candidate) => normalizeTopicTitle(recommendationTitle(candidate)) === key,
      ) === index
    );
  });
  for (const title of fallbackTitles) {
    if (completed.length >= 10) break;
    const key = normalizeTopicTitle(title);
    if (
      !excludedKeys.has(key) &&
      !completed.some((value) => normalizeTopicTitle(recommendationTitle(value)) === key)
    ) {
      completed.push({
        title,
        category: '常青知识',
        heatScore: 72,
        reason: '问题贴近日常认知，兼具好奇心与长期搜索价值',
        angle: '从常见误解切入，用具体场景解释背后的原因',
        trendSource: undefined,
        sourceTopic: undefined,
      });
    }
  }
  if (completed.length < 10) {
    throw new Error(`本批只有 ${completed.length} 条不重复主题，请再次生成下一批`);
  }
  return completed.slice(0, 10).map((value, index) => {
    const item = value as Partial<TopicRecommendation>;
    const rawTitle = String(item.title || fallbackTitles[index]).trim();
    const requestedSource = item.trendSource;
    const requestedSourceTopic = String(item.sourceTopic || '').trim();
    const matchedTrend = trendingTopics.find(
      (topic) => topic.source === requestedSource && topic.title === requestedSourceTopic,
    );
    return {
      title: rawTitle,
      category: String(item.category || '综合'),
      heatScore: Math.max(0, Math.min(100, Number(item.heatScore) || 0)),
      reason: String(item.reason || '具备一定内容传播潜力'),
      angle: String(item.angle || '从观众实际问题切入'),
      trendSource: matchedTrend?.source,
      sourceTopic: matchedTrend?.title,
    };
  });
};
