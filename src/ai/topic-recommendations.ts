import type {ProjectFile} from '../core/schema';
import type {AiProviderId, AiProviderSetting} from './settings';

export type TopicRecommendation = {
  title: string;
  category: string;
  heatScore: number;
  reason: string;
  angle: string;
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
  const system = `你是一名中文短视频选题策划。请推荐恰好 10 条具体、可拍摄、有内容价值的视频主题。
heatScore 是 0-100 的 AI 热度判断，只能根据当前日期、普遍社会关注、内容传播潜力和你的已有知识估算，不得声称读取了抖音、微博或其他平台的实时热榜。
标题避免空泛和标题党；reason 用一句话解释热度依据；angle 给出明确切入角度。只输出合法 JSON。`;
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
  let parsed: {topics?: unknown};
  try {
    parsed = JSON.parse(output.replace(/^```json\s*|\s*```$/g, '')) as {topics?: unknown};
  } catch {
    throw new Error('AI 返回的选题推荐格式不正确，请刷新重试');
  }
  if (!Array.isArray(parsed.topics) || parsed.topics.length !== 10) {
    throw new Error('AI 未返回完整的 10 条推荐主题，请刷新重试');
  }
  return parsed.topics.map((value, index) => {
    const item = value as Partial<TopicRecommendation>;
    return {
      title: String(item.title || `推荐主题 ${index + 1}`),
      category: String(item.category || '综合'),
      heatScore: Math.max(0, Math.min(100, Number(item.heatScore) || 0)),
      reason: String(item.reason || '具备一定内容传播潜力'),
      angle: String(item.angle || '从观众实际问题切入'),
    };
  });
};
