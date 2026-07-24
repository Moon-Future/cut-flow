import {describe, expect, it} from 'vitest';
import {createMockImageProvider} from '../src/ai/media-provider';
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
});
