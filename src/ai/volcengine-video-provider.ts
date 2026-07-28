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
    const requestId = value.request_id ? `，RequestId：${value.request_id}` : '';
    throw new Error(`小云雀接口失败：${value.message || `HTTP ${response.status}`}${requestId}`);
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
          throw new Error(status === 'expired' ? '小云雀任务已过期' : '找不到小云雀任务');
        }
        if (status !== 'done') continue;
        const videoUrl = result.data?.video_url;
        if (!videoUrl) throw new Error('小云雀任务结束，但没有返回视频地址');
        const videoResponse = await request(videoUrl);
        if (!videoResponse.ok) {
          throw new Error(`小云雀视频下载失败：HTTP ${videoResponse.status}`);
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
      throw new Error('小云雀视频生成超时，请稍后重试');
    },
  };
};
