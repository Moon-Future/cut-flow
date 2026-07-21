import {describe, expect, it} from 'vitest';
import {assetLibrarySchema, matchAsset, scoreAsset} from '../src/media/asset-library';

const library = assetLibrarySchema.parse({
  version: 1,
  assets: [
    {
      id: 'code',
      name: '深夜开发工作台',
      type: 'image',
      source: 'local',
      path: 'code.png',
      license: 'user-owned',
      commercialUse: true,
      createdAt: '2026-07-22T00:00:00.000Z',
      keywords: ['开发者', '代码', '深夜'],
    },
    {
      id: 'progress',
      name: '发布进度',
      type: 'image',
      source: 'local',
      path: 'progress.png',
      license: 'user-owned',
      commercialUse: true,
      createdAt: '2026-07-22T00:00:00.000Z',
      keywords: ['完成', '发布', '进度条'],
    },
    {
      id: 'unsafe',
      name: '未知来源',
      type: 'image',
      source: 'online',
      path: 'unsafe.png',
      license: 'unknown',
      commercialUse: false,
      createdAt: '2026-07-22T00:00:00.000Z',
      keywords: ['发布'],
    },
  ],
});

describe('asset library', () => {
  it('scores keyword matches', () => {
    expect(scoreAsset(library.assets[0]!, '开发者深夜写代码')).toBeGreaterThan(0);
  });

  it('matches the best commercially usable asset', () => {
    expect(matchAsset(library.assets, '产品完成并发布')?.id).toBe('progress');
  });

  it('does not select assets without usable licensing', () => {
    expect(matchAsset([library.assets[2]!], '发布')).toBeNull();
  });
});
