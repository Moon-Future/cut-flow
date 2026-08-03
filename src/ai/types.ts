import type {CaptionWord, VideoType} from '../core/schema';

export type GenerateInput = {
  topic: string;
  referenceText?: string;
  customPrompt?: string;
  storyboardOnly?: boolean;
  fullScript?: string;
  audience: string;
  purpose: string;
  coreViewpoint: string;
  sourceMaterial: string;
  visualStyle: string;
  aspectRatio: string;
  tone: string;
  targetWordCount: number;
  durationTarget?: number;
  videoType: VideoType;
};

export type GeneratedScene = {
  segmentType: 'digital-human' | 'voiceover' | 'visual-explanation';
  narration: string;
  caption: string;
  visualPrompt: string;
  suggestedDuration: number;
  visualIntent: string;
  digitalHumanEmotion: string;
  digitalHumanAction: string;
  digitalHumanBackground: string;
  soundEffect: string;
  shots: Array<{
    visualPurpose: string;
    shotType:
      | 'image'
      | 'video'
      | 'real-footage'
      | 'stock-video'
      | 'generated-video'
      | 'generated-image'
      | 'science-animation'
      | 'digital-human';
    assetStrategy:
      | 'source-agnostic'
      | 'local-first'
      | 'stock-search'
      | 'ai-generate'
      | 'programmatic'
      | 'digital-human';
    durationWeight: number;
    searchQueries: string[];
    searchQueriesZh?: string[];
    imagePrompt?: string;
    videoPrompt?: string;
    imagePromptZh?: string;
    videoPromptZh?: string;
    motionPlan?: {
      preset:
        | 'none'
        | 'slow-zoom-in'
        | 'slow-zoom-out'
        | 'pan-left'
        | 'pan-right'
        | 'pan-up'
        | 'pan-down'
        | 'ken-burns-left'
        | 'ken-burns-right'
        | 'gentle-float';
      intensity: number;
      focusStart: string;
      focusEnd: string;
      requiresLayering: boolean;
      requiresAiVideo: boolean;
    };
  }>;
};

export type VideoScript = {
  title: string;
  hook: string;
  scenes: GeneratedScene[];
  ending: string;
};

export type AudioResult = {audio: Buffer; format: 'wav'};
export type TranscriptWord = CaptionWord;

export interface TextProvider {
  generateScript(input: GenerateInput): Promise<VideoScript>;
}

export interface TTSProvider {
  synthesize(text: string): Promise<AudioResult>;
}

export interface TranscriptionProvider {
  transcribe(audio: Buffer, expectedText: string): Promise<TranscriptWord[]>;
}

export type ProviderSet = {
  text: TextProvider;
  tts: TTSProvider;
  transcription: TranscriptionProvider;
};
