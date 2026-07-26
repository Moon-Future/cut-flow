export type VideoTargetDuration = '5s' | '10s' | '～15s' | '～30s' | '40～60s';

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

export const normalizeVideoPromptDuration = (
  prompt: string,
  duration: VideoTargetDuration,
): string => {
  const cleaned = prompt
    .replace(/^【(?:目标输出时长|成片使用时长)】[^\n]*\n?/u, '')
    .replace(
      /(?:视频)?(?:总)?时长\s*(?:控制在|设置为|设为|为|约|：|:)?\s*\d+(?:\.\d+)?\s*(?:～|-|至)?\s*\d*(?:\.\d+)?\s*秒[，。；;]?/giu,
      '',
    )
    .replace(/(?:approximately|about)\s+\d+(?:\.\d+)?\s+seconds?[,.]?/giu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const instruction =
    duration === '5s' || duration === '10s'
      ? `【成片使用时长】${videoDurationLabel(duration)}。平台将按约 15 秒生成，请在前 ${videoDurationLabel(duration)}内完成核心动作和完整叙事，之后只保留可安全裁剪的自然延展。`
      : `【目标输出时长】${videoDurationLabel(duration)}。以接口 duration 参数为准，不要采用正文中的其他总时长描述。`;
  return `${instruction}\n${cleaned}`;
};

export const limitVideoPrompt = (prompt: string, maximum = 2000) =>
  Array.from(prompt).slice(0, maximum).join('');

export const countVideoPromptCharacters = (prompt: string) => Array.from(prompt).length;
