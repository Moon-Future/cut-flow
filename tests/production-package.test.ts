import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {projectFileSchema} from '../src/core/schema';
import {createEditingPackage} from '../src/export/production-package';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {recursive: true, force: true})),
  );
});

describe('editing production package', () => {
  it('exports ordered assets, script, storyboard, narration and SRT', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'cut-flow-package-'));
    temporaryDirectories.push(projectRoot);
    await mkdir(path.join(projectRoot, 'assets'), {recursive: true});
    await mkdir(path.join(projectRoot, 'audio'), {recursive: true});
    await writeFile(path.join(projectRoot, 'assets', 'coriander.png'), 'image');
    await writeFile(path.join(projectRoot, 'audio', 'narration.wav'), 'audio');
    const project = projectFileSchema.parse({
      version: 1,
      project: {
        title: '香菜测试',
        width: 1080,
        height: 1920,
        fps: 30,
        platform: 'douyin',
      },
      content: {topic: '为什么有人讨厌香菜', hook: '两极分化', ending: '基因影响感受'},
      style: {
        template: 'game-dev-log',
        fontFamily: 'sans-serif',
        captionPosition: 'bottom',
        captionAnimation: 'fade',
        transition: 'fade',
      },
      narrationAudio: 'audio/narration.wav',
      scenes: [
        {
          id: 'scene-1',
          narration: '有人喜欢香菜，有人非常讨厌。',
          caption: '爱恨分明',
          assetType: 'image',
          assetPath: 'assets/coriander.png',
          duration: 2.5,
          layout: 'full-screen',
          motion: 'slow-zoom-in',
        },
      ],
    });

    const result = await createEditingPackage(project, projectRoot, {
      packageName: 'test-package',
      now: new Date('2026-07-28T00:00:00.000Z'),
    });
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8')) as {
      kind: string;
      files: {narration: string};
      shots: Array<{assetFiles: string[]}>;
    };
    const srt = await readFile(
      path.join(result.outputDirectory, '02-captions', 'captions.srt'),
      'utf8',
    );
    const storyboard = await readFile(
      path.join(result.outputDirectory, '00-project', 'storyboard.csv'),
      'utf8',
    );

    expect(result.copiedAssets).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(manifest.kind).toBe('cut-flow-editing-package');
    expect(manifest.files.narration).toBe('01-voice/narration.wav');
    expect(manifest.shots[0]?.assetFiles[0]).toMatch(/^03-assets\/shot-001-/u);
    expect(srt).toContain('00:00:00,000 --> 00:00:02,500');
    expect(storyboard).toContain('有人喜欢香菜，有人非常讨厌。');
  });

  it('exports with warnings when narration or a visual asset is missing', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'cut-flow-package-warning-'));
    temporaryDirectories.push(projectRoot);
    const project = projectFileSchema.parse({
      version: 1,
      project: {title: 'Missing', width: 1080, height: 1920, fps: 30},
      style: {
        template: 'game-dev-log',
        fontFamily: 'sans-serif',
        captionPosition: 'bottom',
        captionAnimation: 'fade',
        transition: 'fade',
      },
      scenes: [
        {
          id: 'scene-1',
          narration: 'Missing files',
          caption: 'Missing',
          assetType: 'image',
          assetPath: 'assets/missing.png',
          duration: 1,
          layout: 'full-screen',
          motion: 'none',
        },
      ],
    });
    const result = await createEditingPackage(project, projectRoot, {
      packageName: 'warning-package',
    });
    expect(result.warnings.map((warning) => warning.code).sort()).toEqual([
      'MISSING_ASSET',
      'MISSING_NARRATION',
    ]);
  });
});
