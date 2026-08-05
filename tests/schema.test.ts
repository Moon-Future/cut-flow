import {describe, expect, it} from 'vitest';
import {projectFileSchema} from '../src/core/schema';

const valid = {
  version: 1,
  project: {title: 'Test', width: 1080, height: 1920, fps: 30},
  style: {
    template: 'dark-tech',
    fontFamily: 'sans-serif',
    captionPosition: 'bottom',
    captionAnimation: 'fade',
    transition: 'fade',
  },
  scenes: [
    {
      id: 'one',
      narration: '',
      caption: 'Hello',
      assetType: 'image',
      assetPath: 'assets/one.svg',
      duration: 2,
      layout: 'full-screen',
      motion: 'none',
    },
  ],
};

describe('projectFileSchema', () => {
  it('accepts a valid project and supplies transition duration', () => {
    expect(projectFileSchema.parse(valid).style.transitionDuration).toBe(0.35);
  });
  it('supplies a default video type for older project content', () => {
    expect(projectFileSchema.parse({...valid, content: {topic: '旧项目'}}).content?.videoType).toBe(
      'science-explainer',
    );
  });
  it('rejects duplicate scene ids', () => {
    expect(
      projectFileSchema.safeParse({...valid, scenes: [valid.scenes[0], valid.scenes[0]]}).success,
    ).toBe(false);
  });
  it('rejects unsupported motion values', () => {
    const scenes = [{...valid.scenes[0], motion: 'spin'}];
    expect(projectFileSchema.safeParse({...valid, scenes}).success).toBe(false);
  });
  it('accepts long-form visual shots longer than thirty seconds', () => {
    const longShot = {
      id: 'long-shot',
      visualPurpose: '长视频讲解镜头',
      shotType: 'image',
      assetStrategy: 'source-agnostic',
      duration: 45,
    };
    const scenes = [{...valid.scenes[0], duration: 45, shots: [longShot]}];
    const copyVersions = [
      {
        id: 'copy-long',
        createdAt: new Date().toISOString(),
        provider: 'mock',
        title: '长视频',
        topic: '长视频',
        hook: '',
        ending: '',
        scenes,
      },
    ];
    expect(projectFileSchema.safeParse({...valid, scenes, copyVersions}).success).toBe(true);
  });
  it('accepts Edge TTS narration candidates', () => {
    const scenes = [
      {
        ...valid.scenes[0],
        narrationAudio: 'assets/audio/edge-tts-one.mp3',
        narrationAudioCandidates: [
          {
            id: 'edge-voice-one',
            path: 'assets/audio/edge-tts-one.mp3',
            label: 'Edge TTS · zh-CN-XiaoxiaoNeural',
            source: 'edge-tts',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ];
    expect(projectFileSchema.safeParse({...valid, scenes}).success).toBe(true);
  });
  it('upgrades legacy visual shots with generation defaults', () => {
    const scenes = [
      {
        ...valid.scenes[0],
        shots: [
          {
            id: 'legacy-shot',
            visualPurpose: '旧项目镜头',
            shotType: 'generated-image',
            assetStrategy: 'ai-generate',
            duration: 2,
          },
        ],
      },
    ];
    const shot = projectFileSchema.parse({...valid, scenes}).scenes[0]?.shots?.[0];
    expect(shot).toMatchObject({
      candidates: [],
      generationTask: null,
      selectedAsset: null,
      status: 'missing-asset',
    });
  });
  it('accepts a layered versus shot while keeping legacy shots optional', () => {
    const scenes = [
      {
        ...valid.scenes[0],
        shots: [
          {
            id: 'versus-shot',
            visualPurpose: 'Opposing reactions',
            shotType: 'generated-image',
            assetStrategy: 'ai-generate',
            duration: 2,
            composition: 'versus',
            layers: [
              {
                id: 'background',
                type: 'image',
                role: 'background',
                assetPath: 'assets/background.png',
                position: {x: 0.5, y: 0.5, width: 1, height: 1, zIndex: 0},
                fit: 'cover',
                idle: {preset: 'slow-zoom', duration: 2},
              },
            ],
          },
        ],
      },
    ];
    const shot = projectFileSchema.parse({...valid, scenes}).scenes[0]?.shots?.[0];
    expect(shot?.composition).toBe('versus');
    expect(shot?.layers?.[0]).toMatchObject({
      role: 'background',
      opacity: 1,
      start: 0,
      position: {rotation: 0, zIndex: 0},
    });
  });
});
