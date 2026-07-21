import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {runGenerationWorkflow} from '../src/ai/workflow';
import {projectFileSchema} from '../src/core/schema';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {recursive: true, force: true})),
  );
});

const baseProject = projectFileSchema.parse({
  version: 1,
  project: {title: 'Before generation', width: 1080, height: 1920, fps: 30},
  style: {
    template: 'game-dev-log',
    fontFamily: 'sans-serif',
    captionPosition: 'bottom',
    captionAnimation: 'fade',
    transition: 'fade',
  },
  scenes: [
    {
      id: 'old',
      narration: 'old',
      caption: 'old',
      assetType: 'image',
      assetPath: 'assets/scene.svg',
      duration: 3,
      layout: 'full-screen',
      motion: 'slow-zoom-in',
    },
  ],
});

describe('generation workflow', () => {
  it('generates narration audio, aligned words and reusable script cache', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'cut-flow-ai-'));
    temporaryDirectories.push(projectRoot);
    const input = {
      provider: 'mock' as const,
      topic: '如何完成独立项目',
      audience: '开发者',
      tone: '真诚',
      targetDuration: 30,
    };

    const first = await runGenerationWorkflow(input, baseProject, projectRoot);
    const second = await runGenerationWorkflow(input, baseProject, projectRoot);

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(first.project.scenes).toHaveLength(3);
    expect(first.project.scenes.every((scene) => (scene.words?.length ?? 0) > 0)).toBe(true);
    expect(first.project.scenes.reduce((sum, scene) => sum + scene.duration, 0)).toBeCloseTo(30);
    expect(
      (await readFile(path.join(projectRoot, 'audio', 'narration.wav'))).subarray(0, 4).toString(),
    ).toBe('RIFF');
  });
});
