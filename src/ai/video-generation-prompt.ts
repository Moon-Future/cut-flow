export type VideoTargetDuration = '5s' | '10s' | '～15s' | '～30s' | '40～60s';
export type VideoAspectRatio = '16:9' | '9:16' | '4:3' | '3:4';

export const normalizeVideoPromptAspectRatio = (
  prompt: string,
  ratio: VideoAspectRatio,
): string => {
  const orientation = ratio === '16:9' || ratio === '4:3' ? '横屏' : '竖屏';
  const cleaned = prompt
    .replace(/【画面比例】[^\n]*\n?/gu, '')
    .replace(/(?:16\s*:\s*9|9\s*:\s*16|4\s*:\s*3|3\s*:\s*4)/gu, ratio)
    .replace(/(?:横屏|竖屏)/gu, orientation)
    .trim();
  return `【画面比例】${ratio} ${orientation}，所有构图、主体位置和镜头运动均以此比例为准。\n${cleaned}`;
};

export const videoDurationLabel = (duration: VideoTargetDuration) =>
  duration === '5s'
    ? '5 秒'
    : duration === '10s'
      ? '10 秒'
      : duration === '～15s'
        ? '约 15 秒'
        : duration === '～30s'
          ? '约 30 秒'
          : '40～60 秒';

export const volcengineApiDuration = (
  duration: VideoTargetDuration,
): '～15s' | '～30s' | '40～60s' => (duration === '5s' || duration === '10s' ? '～15s' : duration);

export const videoTargetMaximumSeconds = (duration: VideoTargetDuration) =>
  duration === '5s'
    ? 5
    : duration === '10s'
      ? 10
      : duration === '～15s'
        ? 15
        : duration === '～30s'
          ? 30
          : 60;

export const removeNarrationFromVideoPrompt = (
  prompt: string,
  narration: string,
  visualDescription: string,
) => {
  const narrationText = narration.trim();
  if (!narrationText) return prompt;
  return prompt
    .split(narrationText)
    .join(visualDescription.trim() || '当前镜头的具体视觉场景')
    .replace(/本段旁白(?:内容|重点)?[：:]\s*/gu, '画面叙事重点：');
};

export const removeReferenceImageInstructions = (prompt: string) =>
  prompt
    .replace(
      /[^，,；;。！？\n]*(?:对应图片|对应的图片|对应 AI 图片|参考图片|参考图像|上传图片|所附图片)[^，,；;。！？\n]*[，,；;。！？]?/giu,
      '',
    )
    .replace(
      /[^,;.!?，；。！？\n]*(?:corresponding|reference|provided|uploaded) image[^,;.!?，；。！？\n]*[,;.!?]?/giu,
      '',
    )
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

export const normalizeVideoPromptDuration = (
  prompt: string,
  duration: VideoTargetDuration,
): string => {
  const cleaned = prompt
    .replace(/【最高优先级硬性要求】.*?不要追加片尾、空镜、黑场或延长画面。\s*/gu, '')
    .replace(
      /【音频要求】只生成无声视频画面，禁止背景音乐、配乐、歌曲、配音、旁白、对白、人声和任何声音。\s*/gu,
      '',
    )
    .replace(/【(?:目标输出时长|成片使用时长)】[^\n【]*\n?/gu, '')
    .replace(
      /(?:视频)?(?:总)?时长\s*(?:控制在|设置为|设为|为|约|：|:)?\s*\d+(?:\.\d+)?\s*(?:～|-|至)?\s*\d*(?:\.\d+)?\s*秒[，。；;]?/giu,
      '',
    )
    .replace(/(?:approximately|about)\s+\d+(?:\.\d+)?\s+seconds?[,.]?/giu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const maximumSeconds = videoTargetMaximumSeconds(duration);
  const instruction =
    `【最高优先级硬性要求】成片总时长不得超过 ${maximumSeconds} 秒，所有主体动作、镜头运动和叙事必须在第 ${maximumSeconds} 秒前完整结束，最后自然定格，不要追加片尾、空镜、黑场或延长画面。\n` +
    `【音频要求】只生成无声视频画面，禁止背景音乐、配乐、歌曲、配音、旁白、对白、人声和任何声音。\n` +
    `【目标输出时长】${videoDurationLabel(duration)}。以本段时长要求为准，忽略正文中的其他总时长描述。`;
  return `${instruction}\n${cleaned}`;
};

export const limitVideoPrompt = (prompt: string, maximum = 2000) =>
  Array.from(prompt).slice(0, maximum).join('');

export const countVideoPromptCharacters = (prompt: string) => Array.from(prompt).length;
