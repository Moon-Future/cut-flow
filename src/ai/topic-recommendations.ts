import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {ProjectFile} from '../core/schema';
import {aiSettingsFile, type AiProviderId, type AiProviderSetting} from './settings';

export type TopicRecommendation = {
  title: string;
  category: string;
  heatScore: number;
  reason: string;
  angle: string;
};

export type SavedTopicRecommendations = {
  topics: TopicRecommendation[];
  provider: AiProviderId;
  generatedAt: string;
};

const topicRecommendationsFile = () =>
  path.join(path.dirname(aiSettingsFile()), 'topic-recommendations.json');

export const loadTopicRecommendations = async (): Promise<SavedTopicRecommendations | null> => {
  try {
    const value = JSON.parse(
      await readFile(topicRecommendationsFile(), 'utf8'),
    ) as SavedTopicRecommendations;
    return Array.isArray(value.topics) && value.topics.length
      ? {...value, topics: value.topics.slice(0, 10)}
      : null;
  } catch {
    return null;
  }
};

export const saveTopicRecommendations = async (
  value: SavedTopicRecommendations,
): Promise<void> => {
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
        required: ['title', 'category', 'heatScore', 'reason', 'angle'],
        properties: {
          title: {type: 'string'},
          category: {type: 'string'},
          heatScore: {type: 'number'},
          reason: {type: 'string'},
          angle: {type: 'string'},
        },
      },
    },
  },
} as const;

export const generateTopicRecommendations = async (
  provider: AiProviderId,
  setting: AiProviderSetting,
  project: ProjectFile,
): Promise<TopicRecommendation[]> => {
  const system = `你是一名擅长“十万个为什么”系列的中文短视频选题策划，请严格推荐恰好 10 条“为什么”主题。

选题配比：
1. 6 条常青有趣知识：从自然科学、生活现象、人体心理、动物植物、历史文化、科技原理中选择观众熟悉但说不清原因的问题。
2. 4 条热点变体：结合当前受到关注的电影、明星、社会话题、科技产品或文化现象，改写成有解释空间的“为什么”问题。例如某位电影人近期受到关注时，可以设计“为什么他能持续影响几代观众”，但不得编造新电影上映、数据或事件。

标题规则：
1. 每条标题必须以“为什么”开头，像观众真的会问的问题。
2. 标题要具体、有悬念、有认知反差，读完让人想立刻知道答案。
3. 10 条不能只是替换同义词，题材和解释角度必须明显不同。
4. 避免低俗、虚假夸张和无法验证的标题党。

heatScore 是 0-100 的 AI 热度判断，根据当前日期、普遍社会关注、讨论潜力、受众覆盖和长期搜索价值估算，不得声称读取了抖音、微博或其他平台的实时热榜。
reason 用一句话说明“为什么现在值得做”；angle 写清视频应该解释的核心答案方向。
输出前按 1 到 10 逐项清点，必须恰好返回 10 条。只输出合法 JSON，不要 Markdown。`;
  const user = `当前日期：${new Date().toISOString().slice(0, 10)}
当前项目：${project.project.title}
已有主题：${project.content?.topic || '暂无'}
视频类型：${project.content?.videoType || '未指定'}
目标观众：${project.content?.audience || '短视频平台普通观众'}
视频目的：${project.content?.purpose || '提升内容传播和互动'}
请避免与已有主题完全重复，并兼顾时效性、实用性、争议讨论度和长期价值。`;
  const apiKey = setting.apiKey || setting.secretKey;
  if (!apiKey) throw new Error('请先在设置中配置 AI 服务密钥');
  const isOpenAI = provider === 'openai';
  const response = await fetch(
    `${setting.baseUrl.replace(/\/$/, '')}/${isOpenAI ? 'responses' : 'chat/completions'}`,
    {
      method: 'POST',
      headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
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
  if (!response.ok) throw new Error(`AI 选题推荐失败（${response.status}）：${await response.text()}`);
  const result = (await response.json()) as {
    output_text?: string;
    choices?: Array<{message?: {content?: string}}>;
  };
  const output = result.output_text ?? result.choices?.[0]?.message?.content;
  if (!output) throw new Error('AI 未返回选题推荐内容');
  let parsed: {topics?: unknown; recommendations?: unknown} | unknown[];
  try {
    parsed = JSON.parse(output.replace(/^```json\s*|\s*```$/g, '')) as
      | {topics?: unknown; recommendations?: unknown}
      | unknown[];
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
    '为什么经典电影过了很多年依然有人看？',
    '为什么人们明知道是套路，还是会被悬念吸引？',
    '为什么真正流行的内容总能说中普通人的情绪？',
  ];
  const completed = [...received];
  for (const title of fallbackTitles) {
    if (completed.length >= 10) break;
    if (!completed.some((value) => String((value as {title?: unknown})?.title ?? '') === title)) {
      completed.push({
        title,
        category: '常青知识',
        heatScore: 72,
        reason: '问题贴近日常认知，兼具好奇心与长期搜索价值',
        angle: '从常见误解切入，用具体场景解释背后的原因',
      });
    }
  }
  return completed.slice(0, 10).map((value, index) => {
    const item = value as Partial<TopicRecommendation>;
    const rawTitle = String(item.title || fallbackTitles[index]);
    return {
      title: rawTitle.startsWith('为什么') ? rawTitle : `为什么${rawTitle.replace(/[？?]$/, '')}？`,
      category: String(item.category || '综合'),
      heatScore: Math.max(0, Math.min(100, Number(item.heatScore) || 0)),
      reason: String(item.reason || '具备一定内容传播潜力'),
      angle: String(item.angle || '从观众实际问题切入'),
    };
  });
};
