import type {CaptionWord} from '../core/schema';

export type GenerateInput = {
  topic: string;
  audience: string;
  tone: string;
  targetDuration: number;
};

export type GeneratedScene = {
  narration: string;
  caption: string;
  visualPrompt: string;
  suggestedDuration: number;
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
