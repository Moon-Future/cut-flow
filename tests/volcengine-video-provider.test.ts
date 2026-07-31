import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {createVolcengineSignedHeaders} from '../src/ai/volcengine-video-provider';
import {
  countVideoPromptCharacters,
  limitVideoPrompt,
  normalizeVideoPromptDuration,
  removeNarrationFromVideoPrompt,
  removeReferenceImageInstructions,
  videoTargetMaximumSeconds,
  volcengineApiDuration,
} from '../src/ai/video-generation-prompt';
import {buildFallbackVideoPromptZh} from '../src/ai/video-prompt-fallback';

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
  it('没有参考图片时移除依赖图片和首帧的描述', () => {
    const prompt = removeReferenceImageInstructions(
      '开场展示厨房，以对应图片作为首帧，保持人物服装一致。随后人物拿起杯子。Open on a kitchen, use the reference image as the first frame. End on the result.',
    );
    expect(prompt).toContain('开场展示厨房');
    expect(prompt).toContain('随后人物拿起杯子');
    expect(prompt).not.toMatch(/对应图片|参考图片|reference image/iu);
  });

  it('兜底提示词直接描绘可见主体和环境，不依赖对应图片', () => {
    const prompt = buildFallbackVideoPromptZh({
      aspectRatio: '9:16',
      subject: '水滴落进热油后快速汽化并推动油滴飞溅',
      duration: 5,
    });
    expect(prompt).toMatch(/核心物体|材质|表面纹理|真实发生地点/u);
    expect(prompt).not.toMatch(/对应图片|参考图片/u);
  });

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

  it('5 秒和 10 秒使用平台支持的约 15 秒参数，提示词保留所选时长', () => {
    expect(volcengineApiDuration('5s')).toBe('～15s');
    expect(volcengineApiDuration('10s')).toBe('～15s');
    const prompt = normalizeVideoPromptDuration('人物完成动作。', '5s');
    expect(prompt).toContain('【目标输出时长】5 秒');
    expect(prompt).not.toContain('约 15 秒');
    expect(prompt).toContain('成片总时长不得超过 5 秒');
    expect(prompt).toContain('禁止背景音乐');
    expect(prompt).toContain('配音');
    expect(prompt).toContain('人声');
  });

  it('为所有时长档位设置项目使用上限', () => {
    expect(videoTargetMaximumSeconds('5s')).toBe(5);
    expect(videoTargetMaximumSeconds('10s')).toBe(10);
    expect(videoTargetMaximumSeconds('～15s')).toBe(15);
    expect(videoTargetMaximumSeconds('～30s')).toBe(30);
    expect(videoTargetMaximumSeconds('40～60s')).toBe(60);
  });

  it('重复切换时长时只保留一份硬性要求', () => {
    const first = normalizeVideoPromptDuration('人物完成动作。', '5s');
    const second = normalizeVideoPromptDuration(first, '10s');
    const third = normalizeVideoPromptDuration(second, '～15s');
    expect(third.match(/【最高优先级硬性要求】/gu)).toHaveLength(1);
    expect(third.match(/【音频要求】/gu)).toHaveLength(1);
    expect(third.match(/【目标输出时长】/gu)).toHaveLength(1);
    expect(third).toContain('成片总时长不得超过 15 秒');
    expect(third).not.toContain('成片总时长不得超过 5 秒');
    expect(third).not.toContain('成片总时长不得超过 10 秒');
  });

  it('发送视频模型前移除完整旁白并保留画面描述', () => {
    const narration = '有人喜欢香菜，也有人觉得它像肥皂，这可能与基因有关。';
    const prompt = `餐桌上的人物产生不同反应。本段旁白重点：${narration}`;
    const result = removeNarrationFromVideoPrompt(prompt, narration, '三个人品尝香菜后的表情对比');
    expect(result).not.toContain(narration);
    expect(result).toContain('三个人品尝香菜后的表情对比');
    expect(result).toContain('画面叙事重点');
  });
});
