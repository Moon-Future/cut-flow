import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {createVolcengineSignedHeaders} from '../src/ai/volcengine-video-provider';
import {
  countVideoPromptCharacters,
  limitVideoPrompt,
  normalizeVideoPromptDuration,
  volcengineApiDuration,
} from '../src/ai/video-generation-prompt';

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

describe('视频生成提示词', () => {
  it('使用外层目标时长替换提示词中的旧总时长', () => {
    const result = normalizeVideoPromptDuration(
      '9:16 竖屏视频，时长约 8 秒。开始 0—1 秒建立场景，最后 2 秒定格。',
      '～15s',
    );
    expect(result).toContain('【目标输出时长】约 15 秒');
    expect(result).not.toContain('时长约 8 秒');
    expect(result).toContain('开始 0—1 秒');
    expect(result).toContain('最后 2 秒');
  });

  it('按用户可见字符限制为 2000 字', () => {
    const result = limitVideoPrompt('香'.repeat(2001));
    expect(countVideoPromptCharacters(result)).toBe(2000);
  });

  it('5 秒和 10 秒使用平台支持的约 15 秒参数并标明自动裁剪', () => {
    expect(volcengineApiDuration('5s')).toBe('～15s');
    expect(volcengineApiDuration('10s')).toBe('～15s');
    expect(normalizeVideoPromptDuration('人物完成动作。', '5s')).toContain('前 5 秒内完成核心动作');
  });
});
