import {createHash, createHmac, randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {GenerationCandidate, VisualShot} from '../core/schema';
import {limitVideoPrompt} from './video-generation-prompt';

const endpoint = 'https://visual.volcengineapi.com';
const region = 'cn-north-1';
const service = 'cv';
const version = '2022-08-31';
const reqKey = 'pippit_iv2v_cvtob';

type Config = {
  accessKey: string;
  secretKey: string;
  outputDirectory: string;
  projectRelativeDirectory?: string;
  ratio: '16:9' | '9:16' | '4:3' | '3:4';
  duration?: '～15s' | '～30s' | '40～60s';
  enableWatermark?: boolean;
  pollIntervalMs?: number;
  maxPolls?: number;
  fetch?: typeof globalThis.fetch;
  referenceImageUrls?: string[];
};

type VolcResponse = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: {
    task_id?: string;
    status?: 'processing' | 'in_queue' | 'generating' | 'done' | 'not_found' | 'expired';
    video_url?: string;
    resp_data?: string;
  } | null;
};

const diagnosticText = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const parseResponseData = (value?: string) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const findVideoUrl = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['video_url', 'videoUrl', 'url']) {
    if (typeof record[key] === 'string' && /^https?:\/\//u.test(record[key])) {
      return record[key];
    }
  }
  for (const nested of Object.values(record)) {
    const found = findVideoUrl(nested);
    if (found) return found;
  }
  return undefined;
};

const responseDiagnostic = (value: VolcResponse) =>
  [
    value.code !== undefined ? `错误码：${value.code}` : '',
    value.message ? `原因：${value.message}` : '',
    value.request_id ? `Request ID：${value.request_id}` : '',
    value.data?.resp_data ? `服务详情：${diagnosticText(parseResponseData(value.data.resp_data))}` : '',
  ]
    .filter(Boolean)
    .join('\n');

const chineseFailureExplanation = (value: VolcResponse) => {
  const detail = [
    value.code,
    value.message,
    value.data?.status,
    diagnosticText(parseResponseData(value.data?.resp_data)),
  ]
    .join(' ')
    .toLowerCase();
  if (/access.?key|secret|signature|authorization|auth|鉴权|签名|unauthorized/u.test(detail)) {
    return '火山引擎身份验证失败。请检查设置中的 AK、SK 是否正确，以及当前账号是否已开通小云雀服务。';
  }
  if (/balance|insufficient|arrears|quota|credit|余额|欠费|额度|配额/u.test(detail)) {
    return '账号余额、资源额度或调用配额不足。请到火山引擎控制台检查余额、资源包和服务额度。';
  }
  if (/sensitive|moderation|risk|audit|violation|违规|敏感|审核|安全/u.test(detail)) {
    return '输入内容、参考图片或生成结果未通过内容安全审核。请更换图片或删减可能敏感的提示词后重试。';
  }
  if (
    /image|img_url|download.*url|fetch.*url|invalid.*url|图片|图像|地址.*访问|url.*访问/u.test(
      detail,
    )
  ) {
    return '参考图片读取失败或不符合要求。请确认七牛云图片能公网打开，格式、大小和分辨率符合接口限制。';
  }
  if (/rate.?limit|too many|concurr|qps|频率|并发|限流/u.test(detail)) {
    return '当前提交过于频繁或并发任务已满。请等待正在运行的任务结束后再试，避免重复扣费风险。';
  }
  if (/invalid|parameter|argument|prompt|ratio|duration|参数|提示词|时长|比例/u.test(detail)) {
    return '提交参数不符合接口要求。请检查提示词长度、视频比例、目标时长和参考图片数量。';
  }
  if (/expired|过期/u.test(detail)) {
    return '任务结果已经过期，平台无法继续查询。需要重新提交生成任务。';
  }
  if (/not.?found|不存在|找不到/u.test(detail)) {
    return '平台找不到该任务，任务可能已过期、被清理或任务编号无效。';
  }
  if (/timeout|time.?out|超时/u.test(detail)) {
    return '平台处理或网络请求超时。任务可能仍在服务端运行，请先到控制台确认，不要立即重复提交。';
  }
  if (/internal|server|service unavailable|系统|服务异常/u.test(detail)) {
    return '小云雀平台内部服务异常，通常不是当前项目配置问题。建议稍后重试，并保留 Request ID。';
  }
  return '小云雀没有返回可识别的中文失败分类。请复制 Request ID，到火山引擎控制台或工单中查询具体原因。';
};

const failureDiagnostic = (value: VolcResponse) =>
  `中文说明：${chineseFailureExplanation(value)}\n${responseDiagnostic(value)}`;

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const hmac = (key: string | Buffer, value: string) =>
  createHmac('sha256', key).update(value).digest();
const utcDate = (date: Date) =>
  date
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, '')
    .replace('Z', 'Z');

export const createVolcengineSignedHeaders = (
  action: string,
  body: string,
  accessKey: string,
  secretKey: string,
  now = new Date(),
) => {
  const host = 'visual.volcengineapi.com';
  const xDate = utcDate(now);
  const shortDate = xDate.slice(0, 8);
  const payloadHash = sha256(body);
  const query = `Action=${encodeURIComponent(action)}&Version=${version}`;
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalHeaders =
    `content-type:application/json\nhost:${host}\n` +
    `x-content-sha256:${payloadHash}\nx-date:${xDate}\n`;
  const canonicalRequest = `POST\n/\n${query}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = `HMAC-SHA256\n${xDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const signingKey = hmac(hmac(hmac(hmac(secretKey, shortDate), region), service), 'request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return {
    'Content-Type': 'application/json',
    Host: host,
    'X-Content-Sha256': payloadHash,
    'X-Date': xDate,
    Authorization:
      `HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
};

const requestApi = async (
  request: typeof globalThis.fetch,
  config: Pick<Config, 'accessKey' | 'secretKey'>,
  action: 'CVSync2AsyncSubmitTask' | 'CVSync2AsyncGetResult',
  input: object,
): Promise<VolcResponse> => {
  const body = JSON.stringify(input);
  const response = await request(`${endpoint}?Action=${action}&Version=${version}`, {
    method: 'POST',
    headers: createVolcengineSignedHeaders(action, body, config.accessKey, config.secretKey),
    body,
  });
  const value = (await response.json()) as VolcResponse;
  if (!response.ok || value.code !== 10000) {
    const phase = action === 'CVSync2AsyncSubmitTask' ? '提交失败' : '查询失败';
    throw new Error(
      `小云雀任务${phase}\n${
        failureDiagnostic(value) || `中文说明：接口请求失败。\nHTTP 状态：${response.status}`
      }`,
    );
  }
  return value;
};

export const createVolcengineVideoProvider = (config: Config) => {
  const request = config.fetch ?? globalThis.fetch;
  const relativeDirectory = config.projectRelativeDirectory ?? 'assets/generated';
  return {
    id: 'volcengine-pippit-video',
    model: reqKey,
    generate: async (shot: VisualShot): Promise<GenerationCandidate[]> => {
      const prompt = (shot.videoPromptZh || shot.videoPrompt || shot.visualPurpose).trim();
      const limitedPrompt = limitVideoPrompt(prompt);
      if (!prompt) throw new Error('视频提示词不能为空');
      const created = await requestApi(request, config, 'CVSync2AsyncSubmitTask', {
        req_key: reqKey,
        prompt: limitedPrompt,
        ratio: config.ratio,
        duration: config.duration ?? '～15s',
        language: 'Chinese',
        accent: 'PuTongHua',
        enable_watermark: config.enableWatermark ?? true,
        img_url_list: config.referenceImageUrls?.length ? config.referenceImageUrls : undefined,
      });
      const taskId = created.data?.task_id;
      if (!taskId) throw new Error('小云雀未返回任务 ID');

      for (let poll = 0; poll < (config.maxPolls ?? 360); poll += 1) {
        await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs ?? 10_000));
        const result = await requestApi(request, config, 'CVSync2AsyncGetResult', {
          req_key: reqKey,
          task_id: taskId,
        });
        const status = result.data?.status;
        if (status === 'not_found' || status === 'expired') {
          throw new Error(
            `${status === 'expired' ? '小云雀任务已过期' : '找不到小云雀任务'}\n` +
              `${failureDiagnostic(result)}\n任务 ID：${taskId}`,
          );
        }
        if (status !== 'done') continue;
        const parsedResponseData = parseResponseData(result.data?.resp_data);
        const videoUrl = result.data?.video_url ?? findVideoUrl(parsedResponseData);
        if (!videoUrl) {
          throw new Error(
            `小云雀生成失败：任务已结束，但没有返回视频地址\n${
              failureDiagnostic(result) || '中文说明：服务端未返回具体失败详情'
            }`,
          );
        }
        const videoResponse = await request(videoUrl);
        if (!videoResponse.ok) {
          throw new Error(
            `小云雀视频下载失败\nHTTP 状态：${videoResponse.status}\n视频地址：${videoUrl}`,
          );
        }
        await mkdir(config.outputDirectory, {recursive: true});
        const id = `candidate-${randomUUID()}`;
        const filename = `${Date.now()}-${shot.id}-${id.slice(-8)}.mp4`;
        await writeFile(
          path.join(config.outputDirectory, filename),
          Buffer.from(await videoResponse.arrayBuffer()),
        );
        return [
          {
            id,
            kind: 'video',
            path: path.posix.join(relativeDirectory, filename),
            provider: 'volcengine-pippit-video',
            model: reqKey,
            prompt: limitedPrompt,
            createdAt: new Date().toISOString(),
          },
        ];
      }
      throw new Error(
        `小云雀视频生成轮询超时\n任务 ID：${taskId}\n本地等待已达到上限，任务在服务端可能仍在运行，请勿立即重复提交。`,
      );
    },
  };
};
