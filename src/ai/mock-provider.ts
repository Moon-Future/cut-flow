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
  const duration = Math.min(30, Math.max(3, input.targetWordCount / 12));
  const isSky = input.topic.includes('天空') && input.topic.includes('蓝');
  const speakerType = input.videoType === 'digital-human' ? 'digital-human' : 'voiceover';
  const shot = (visualPurpose: string, searchQueries: string[], animation = false) => ({
    visualPurpose,
    shotType: animation ? ('science-animation' as const) : ('video' as const),
    assetStrategy: 'source-agnostic' as const,
    durationWeight: 1,
    searchQueries,
    imagePrompt: `竖屏 9:16，${visualPurpose}，主体位于画面视觉中心，环境信息清晰，构图稳定，光线层次明确，色彩统一，中近景，${animation ? '简洁准确的科普动画风格' : '真实电影摄影风格'}，高细节，为后续动态效果预留空间，不要文字，不要字幕，不要标志，不要水印。`,
    videoPrompt: `竖屏 9:16，约 5 秒视频。初始画面展示${visualPurpose}，主体先保持稳定，随后完成自然动作，镜头缓慢推近并轻微横移，环境元素产生细微动态变化，节奏清晰，光线和色彩保持一致。以对应图片作为首帧，保持主体、场景布局和物体位置一致，不改变主体结构，不要文字、字幕、标志和水印。`,
  });
  if (isSky)
    return {
      title: '为什么天空是蓝色的？',
      hook: '天空并不是因为倒映海洋才变蓝，真正的原因藏在阳光和空气分子里。',
      scenes: [
        {
          segmentType: speakerType,
          narration: '天空并不是因为倒映海洋才变蓝，真正的原因藏在阳光和空气分子里。',
          caption: '天空为什么是蓝色？',
          visualPrompt: '蓝天白云延时摄影',
          visualIntent: '用真实天空建立问题并制造反常识',
          digitalHumanEmotion: '疑惑',
          digitalHumanAction: '正视镜头，轻微前倾',
          digitalHumanBackground: '简洁科技感演播室',
          soundEffect: '无',
          suggestedDuration: duration,
          shots: [
            shot('仰拍蓝天白云快速移动', ['blue sky clouds timelapse', '蓝天白云 延时摄影']),
            shot('海洋与天空同框后突出天空', ['ocean horizon blue sky']),
          ],
        },
        {
          segmentType: 'visual-explanation',
          narration:
            '太阳光看起来是白色，其实包含从红到紫的各种颜色。光进入大气层后，会不断撞上微小的空气分子。',
          caption: '白光包含多种颜色',
          visualPrompt: '白光通过棱镜分解为光谱',
          visualIntent: '解释白光组成和光进入大气层',
          digitalHumanEmotion: '',
          digitalHumanAction: '',
          digitalHumanBackground: '',
          soundEffect: '轻微转场音',
          suggestedDuration: duration,
          shots: [
            shot('白光穿过棱镜展开彩虹光谱', ['white light prism spectrum animation'], true),
            shot('太阳光进入地球大气层', ['sunlight earth atmosphere animation'], true),
          ],
        },
        {
          segmentType: speakerType,
          narration:
            '波长较短的蓝光比红光更容易被向四面八方散射，所以无论看向天空哪个方向，我们都会接收到更多蓝光。',
          caption: '蓝光更容易被散射',
          visualPrompt: '空气分子散射蓝色短波光线',
          visualIntent: '用动态粒子解释瑞利散射',
          digitalHumanEmotion: '坚定',
          digitalHumanAction: '点头确认',
          digitalHumanBackground: '简洁科技感演播室',
          soundEffect: '无',
          suggestedDuration: duration,
          shots: [
            shot('红蓝光波长对比，蓝光波长更短', ['red blue wavelength comparison'], true),
            shot(
              '蓝色光线被空气分子向四周散射',
              ['Rayleigh scattering blue light animation'],
              true,
            ),
            shot('真实蓝天与散射示意叠化', ['deep blue sky atmosphere']),
          ],
        },
      ],
      ending: '这就是天空呈蓝色的原因。那么，云为什么通常是白色的呢？',
    };
  return {
    title: input.topic,
    hook: `你可能没有意识到，${input.topic}真正困难的地方并不是技术。`,
    scenes: [
      {
        segmentType: speakerType,
        narration: `你可能没有意识到，${input.topic}真正困难的地方并不是技术。`,
        caption: `${input.topic}，难点不只是技术`,
        visualPrompt: '开发者面对复杂项目界面，深色科技感',
        suggestedDuration: duration,
        visualIntent: '展示开发者面对复杂项目的压力',
        digitalHumanEmotion: '认真',
        digitalHumanAction: '正视镜头',
        digitalHumanBackground: '现代工作室',
        soundEffect: '无',
        shots: [shot('开发者面对复杂项目界面', ['developer complex project screen'])],
      },
      {
        segmentType: 'visual-explanation',
        narration: '问题往往来自目标过多、反馈太晚，以及每一次修改都牵动整个系统。',
        caption: '目标过多，反馈太晚',
        visualPrompt: '复杂流程图逐渐简化为三个清晰步骤',
        suggestedDuration: duration,
        visualIntent: '展示复杂流程被逐步简化',
        digitalHumanEmotion: '',
        digitalHumanAction: '',
        digitalHumanBackground: '',
        soundEffect: '界面切换音',
        shots: [shot('复杂流程图逐渐简化', ['complex workflow simplification'], true)],
      },
      {
        segmentType: speakerType,
        narration: '先做出最小闭环，用真实结果决定下一步，项目才会持续向前。',
        caption: '先完成闭环，再持续迭代',
        visualPrompt: '进度条完成，产品成功发布',
        suggestedDuration: duration,
        visualIntent: '展示最小闭环完成并获得反馈',
        digitalHumanEmotion: '坚定',
        digitalHumanAction: '点头确认',
        digitalHumanBackground: '现代工作室',
        soundEffect: '无',
        shots: [shot('产品完成发布并收到反馈', ['product launch success'])],
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
