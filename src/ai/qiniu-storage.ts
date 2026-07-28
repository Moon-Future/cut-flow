import {createHmac, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

type QiniuConfig = {
  accessKey: string;
  secretKey: string;
  bucket: string;
  cdnDomain: string;
  uploadHost?: string;
};

const base64Url = (value: string | Buffer) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_');

const uploadToQiniu = async (
  content: Buffer,
  fileName: string,
  contentType: string,
  config: QiniuConfig,
) => {
  const extension = path.extname(fileName).toLowerCase();
  const key = `cut-flow/reference/${Date.now()}-${randomUUID()}${extension}`;
  const policy = base64Url(
    JSON.stringify({
      scope: `${config.bucket}:${key}`,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const signature = base64Url(createHmac('sha1', config.secretKey).update(policy).digest());
  const token = `${config.accessKey}:${signature}:${policy}`;
  const form = new FormData();
  form.append('token', token);
  form.append('key', key);
  form.append(
    'file',
    new Blob([new Uint8Array(content)], {type: contentType}),
    path.basename(fileName),
  );
  const response = await fetch(config.uploadHost || 'https://upload.qiniup.com', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`七牛云上传失败：HTTP ${response.status} ${await response.text()}`);
  }
  const domain = config.cdnDomain.trim().replace(/\/+$/u, '');
  const normalizedDomain = /^https?:\/\//u.test(domain) ? domain : `https://${domain}`;
  return `${normalizedDomain}/${key.split('/').map(encodeURIComponent).join('/')}`;
};

export const uploadFileToQiniu = async (filePath: string, config: QiniuConfig) =>
  uploadToQiniu(
    await readFile(filePath),
    path.basename(filePath),
    path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg',
    config,
  );

export const uploadBufferToQiniu = (
  content: Buffer,
  fileName: string,
  contentType: string,
  config: QiniuConfig,
) => uploadToQiniu(content, fileName, contentType, config);
