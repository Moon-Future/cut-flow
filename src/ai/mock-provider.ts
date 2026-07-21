import {distributeWords} from './text-utils';
import type {GenerateInput, ProviderSet, VideoScript} from './types';

const createSilentWav = (durationSeconds: number, sampleRate = 24000): Buffer => {
  const samples = Math.ceil(durationSeconds * sampleRate);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
};

const mockScript = (input: GenerateInput): VideoScript => {
  const duration = Math.max(3, input.targetDuration / 3);
  return {
    title: input.topic,
    hook: `你可能没有意识到，${input.topic}真正困难的地方并不是技术。`,
    scenes: [
      {
        narration: `你可能没有意识到，${input.topic}真正困难的地方并不是技术。`,
        caption: `${input.topic}，难点不只是技术`,
        visualPrompt: '开发者面对复杂项目界面，深色科技感',
        suggestedDuration: duration,
      },
      {
        narration: '问题往往来自目标过多、反馈太晚，以及每一次修改都牵动整个系统。',
        caption: '目标过多，反馈太晚',
        visualPrompt: '复杂流程图逐渐简化为三个清晰步骤',
        suggestedDuration: duration,
      },
      {
        narration: '先做出最小闭环，用真实结果决定下一步，项目才会持续向前。',
        caption: '先完成闭环，再持续迭代',
        visualPrompt: '进度条完成，产品成功发布',
        suggestedDuration: duration,
      },
    ],
    ending: '关注我，一起记录独立开发的真实过程。',
  };
};

export const createMockProviders = (targetDuration: number): ProviderSet => ({
  text: {generateScript: (input) => Promise.resolve(mockScript(input))},
  tts: {
    synthesize: () => Promise.resolve({audio: createSilentWav(targetDuration), format: 'wav'}),
  },
  transcription: {
    transcribe: (_audio, expectedText) =>
      Promise.resolve(distributeWords(expectedText, targetDuration)),
  },
});
