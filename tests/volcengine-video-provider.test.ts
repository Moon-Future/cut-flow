import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {createVolcengineSignedHeaders} from '../src/ai/volcengine-video-provider';

describe('火山引擎视频接口签名', () => {
  it('生成固定日期、载荷哈希和授权范围', () => {
    const body = JSON.stringify({req_key: 'pippit_iv2v_cvtob', prompt: '测试'});
    const headers = createVolcengineSignedHeaders(
      'CVSync2AsyncSubmitTask',
      body,
      'test-ak',
      'test-sk',
      new Date('2026-07-26T12:34:56.000Z'),
    );

    expect(headers['X-Date']).toBe('20260726T123456Z');
    expect(headers['X-Content-Sha256']).toBe(createHash('sha256').update(body).digest('hex'));
    expect(headers.Authorization).toContain('Credential=test-ak/20260726/cn-north-1/cv/request');
    expect(headers.Authorization).toContain(
      'SignedHeaders=content-type;host;x-content-sha256;x-date',
    );
    expect(headers.Authorization).toMatch(/Signature=[a-f0-9]{64}$/);
  });
});
