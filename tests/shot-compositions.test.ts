import {describe, expect, it} from 'vitest';
import {visualShotSchema} from '../src/core/schema';
import {applyVersusComposition} from '../src/templates/shot-compositions';

const shot = visualShotSchema.parse({
  id: 'shot-1',
  visualPurpose: 'Two reactions',
  shotType: 'generated-image',
  assetStrategy: 'ai-generate',
  duration: 5,
  selectedAsset: 'assets/background.png',
});

describe('shot composition templates', () => {
  it('creates a valid three-layer versus composition', () => {
    const result = visualShotSchema.parse({...shot, ...applyVersusComposition(shot)});
    expect(result.composition).toBe('versus');
    expect(result.layers).toHaveLength(3);
    expect(result.layers?.map((layer) => layer.role)).toEqual([
      'background',
      'subject',
      'subject',
    ]);
    expect(result.layers?.[0]?.assetPath).toBe('assets/background.png');
    expect(result.motionPlan?.requiresLayering).toBe(true);
  });
});
