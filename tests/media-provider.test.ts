import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {createMockImageProvider, createOpenAIImageProvider} from '../src/ai/media-provider';
import {visualShotSchema} from '../src/core/schema';

describe('media generation provider', () => {
  it('creates independent traceable candidate versions', async () => {
    const shot = visualShotSchema.parse({
      id: 'shot-1',
      visualPurpose: '展示蓝天和云层',
      shotType: 'generated-image',
      assetStrategy: 'ai-generate',
      duration: 3,
      searchQueries: ['blue sky'],
      imagePrompt: '纪录片风格的蓝天白云',
      selectedAsset: null,
      sourceStart: 0,
      status: 'missing-asset',
    });
    const candidates = await createMockImageProvider().generate({
      shot,
      kind: 'image',
      count: 3,
      fallbackPaths: ['assets/one.png', 'assets/two.png'],
    });
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(3);
    expect(candidates[0]).toMatchObject({
      kind: 'image',
      provider: 'mock-image',
      prompt: '纪录片风格的蓝天白云',
    });
  });

  it('persists OpenAI image responses as project-relative candidates', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'cut-flow-image-'));
    const shot = visualShotSchema.parse({
      id: 'shot-openai',
      visualPurpose: '展示蓝天与云层',
      shotType: 'generated-image',
      assetStrategy: 'ai-generate',
      duration: 3,
      searchQueries: ['blue sky'],
      imagePrompt: '纪录片风格的蓝天白云',
    });
    const requests: Array<{url: string; body: Record<string, unknown>}> = [];
    const provider = createOpenAIImageProvider({
      apiKey: 'test-key',
      outputDirectory,
      fetch: (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = typeof init?.body === 'string' ? init.body : '{}';
        requests.push({
          url,
          body: JSON.parse(body) as Record<string, unknown>,
        });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {b64_json: Buffer.from('first-image').toString('base64')},
                {b64_json: Buffer.from('second-image').toString('base64')},
              ],
            }),
            {status: 200, headers: {'Content-Type': 'application/json'}},
          ),
        );
      },
    });

    try {
      const candidates = await provider.generate({
        shot,
        kind: 'image',
        count: 2,
        fallbackPaths: [],
      });
      expect(requests[0]).toMatchObject({
        url: 'https://api.openai.com/v1/images/generations',
        body: {
          model: 'gpt-image-2',
          n: 2,
          quality: 'low',
          size: '1024x1536',
        },
      });
      expect(candidates).toHaveLength(2);
      expect(candidates[0]?.path).toMatch(/^assets\/generated\/.+\.png$/);
      expect(
        await readFile(path.join(outputDirectory, path.basename(candidates[0]!.path)), 'utf8'),
      ).toBe('first-image');
    } finally {
      await rm(outputDirectory, {recursive: true, force: true});
    }
  });
});
