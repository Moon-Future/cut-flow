import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
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

type OpenAIImageProviderConfig = {
  apiKey: string;
  outputDirectory: string;
  projectRelativeDirectory?: string;
  model?: string;
  quality?: 'low' | 'medium' | 'high';
  fetch?: typeof globalThis.fetch;
};

type OpenAIImageResponse = {
  data?: Array<{b64_json?: string}>;
  error?: {message?: string; code?: string};
};

const imagePromptFor = (shot: VisualShot): string => shot.imagePrompt ?? shot.visualPurpose;

const mockCandidates = (
  provider: string,
  model: string,
  input: MediaGenerationInput,
): GenerationCandidate[] => {
  if (!input.fallbackPaths.length) throw new Error('Mock Provider 没有可复用的本地素材');
  const prompt =
    input.kind === 'image'
      ? imagePromptFor(input.shot)
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

export const createOpenAIImageProvider = (config: OpenAIImageProviderConfig): ImageProvider => {
  const model = config.model ?? 'gpt-image-2';
  const request = config.fetch ?? globalThis.fetch;
  const relativeDirectory = config.projectRelativeDirectory ?? 'assets/generated';

  return {
    id: 'openai-image',
    model,
    generate: async (input) => {
      if (input.kind !== 'image') throw new Error('OpenAI Image Provider 只支持图片生成');
      const count = Math.min(4, Math.max(1, input.count));
      const prompt = imagePromptFor(input.shot);
      const response = await request('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          n: count,
          size: '1024x1536',
          quality: config.quality ?? 'low',
          output_format: 'png',
        }),
      });
      const value = (await response.json()) as OpenAIImageResponse;
      if (!response.ok) {
        const detail = value.error?.code ?? value.error?.message ?? `HTTP ${response.status}`;
        throw new Error(`OpenAI 图片生成失败：${detail}`);
      }
      const images = value.data?.map((item) => item.b64_json).filter(Boolean) ?? [];
      if (images.length !== count) {
        throw new Error(`OpenAI 返回了 ${images.length} 张图片，预期 ${count} 张`);
      }

      await mkdir(config.outputDirectory, {recursive: true});
      return Promise.all(
        images.map(async (base64, index) => {
          const id = `candidate-${randomUUID()}`;
          const filename = `${Date.now()}-${input.shot.id}-${index + 1}-${id.slice(-8)}.png`;
          await writeFile(
            path.join(config.outputDirectory, filename),
            Buffer.from(base64!, 'base64'),
          );
          return {
            id,
            kind: 'image' as const,
            path: path.posix.join(relativeDirectory, filename),
            provider: 'openai-image',
            model,
            prompt,
            createdAt: new Date().toISOString(),
          };
        }),
      );
    },
  };
};
