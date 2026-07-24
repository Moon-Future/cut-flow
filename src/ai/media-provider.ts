import {randomUUID} from 'node:crypto';
import type {GenerationCandidate, VisualShot} from '../core/schema';

export type MediaGenerationInput = {
  shot: VisualShot;
  kind: 'image' | 'video';
  count: number;
  fallbackPaths: string[];
};

export interface ImageProvider {
  id: string;
  model: string;
  generate(input: MediaGenerationInput): Promise<GenerationCandidate[]>;
}

export interface VideoProvider {
  id: string;
  model: string;
  generate(input: MediaGenerationInput): Promise<GenerationCandidate[]>;
}

const mockCandidates = (
  provider: string,
  model: string,
  input: MediaGenerationInput,
): GenerationCandidate[] => {
  if (!input.fallbackPaths.length) throw new Error('Mock Provider 没有可复用的本地素材');
  const prompt =
    input.kind === 'image'
      ? (input.shot.imagePrompt ?? input.shot.visualPurpose)
      : (input.shot.videoPrompt ?? input.shot.visualPurpose);
  return Array.from({length: input.count}, (_, index) => ({
    id: `candidate-${randomUUID()}`,
    kind: input.kind,
    path: input.fallbackPaths[index % input.fallbackPaths.length]!,
    provider,
    model,
    prompt,
    createdAt: new Date().toISOString(),
  }));
};

export const createMockImageProvider = (): ImageProvider => ({
  id: 'mock-image',
  model: 'local-candidate-v1',
  generate: (input) => Promise.resolve(mockCandidates('mock-image', 'local-candidate-v1', input)),
});

export const createMockVideoProvider = (): VideoProvider => ({
  id: 'mock-video',
  model: 'local-candidate-v1',
  generate: (input) => Promise.resolve(mockCandidates('mock-video', 'local-candidate-v1', input)),
});
