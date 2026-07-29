import {copyFile, mkdir, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {ProjectFile, VisualShot} from '../core/schema';

export type EditingPackageWarning = {
  code: 'MISSING_ASSET' | 'MISSING_NARRATION';
  message: string;
  sourcePath?: string;
};

export type EditingPackageResult = {
  outputDirectory: string;
  manifestPath: string;
  copiedAssets: number;
  warnings: EditingPackageWarning[];
};

type PackageOptions = {
  outputRoot?: string;
  packageName?: string;
  now?: Date;
};

type StoryboardRow = {
  number: number;
  sceneId: string;
  shotId: string;
  start: number;
  end: number;
  narration: string;
  caption: string;
  visualPurpose: string;
  assetFiles: string[];
  motion: string;
  editingNote: string;
};

const safeName = (value: string, fallback: string) =>
  Array.from(value, (character) => (character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
    .replace(/[<>:"/\\|?*]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[. ]+$/gu, '')
    .trim()
    .slice(0, 80) || fallback;

const exists = async (file: string) =>
  stat(file)
    .then((value) => value.isFile())
    .catch(() => false);

const resolveInside = (root: string, relativePath: string) => {
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`项目路径越界：${relativePath}`);
  }
  return resolved;
};

const srtTimestamp = (seconds: number) => {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

const csvCell = (value: string | number) => `"${String(value).replace(/"/gu, '""')}"`;

const shotAssets = (shot: VisualShot | undefined, fallback?: string) => {
  const assets: Array<{path: string; role: string}> = [];
  if (shot?.selectedAsset) assets.push({path: shot.selectedAsset, role: 'selected'});
  for (const layer of shot?.layers ?? []) {
    if (layer.assetPath) assets.push({path: layer.assetPath, role: layer.role});
  }
  if (!assets.length && fallback) assets.push({path: fallback, role: 'scene'});
  return assets.filter(
    (asset, index, all) =>
      all.findIndex((candidate) => candidate.path === asset.path && candidate.role === asset.role) ===
      index,
  );
};

const buildRows = (project: ProjectFile): StoryboardRow[] => {
  const rows: StoryboardRow[] = [];
  let sceneStart = 0;
  let number = 1;
  for (const scene of project.scenes) {
    const shots = scene.shots?.length ? scene.shots : [undefined];
    const declaredDuration = scene.shots?.reduce((sum, shot) => sum + shot.duration, 0) ?? 0;
    let shotStart = sceneStart;
    for (const shot of shots) {
      const duration = shot
        ? declaredDuration > 0
          ? (shot.duration / declaredDuration) * scene.duration
          : scene.duration / shots.length
        : scene.duration;
      rows.push({
        number,
        sceneId: scene.id,
        shotId: shot?.id ?? scene.id,
        start: shotStart,
        end: shotStart + duration,
        narration: scene.narration,
        caption: scene.caption,
        visualPurpose: shot?.visualPurpose ?? scene.visualIntent ?? scene.caption,
        assetFiles: [],
        motion: shot?.composition
          ? `${shot.composition} / ${shot.motionPlan?.preset ?? scene.motion}`
          : shot?.motionPlan?.preset ?? scene.motion,
        editingNote: shot?.motionPlan?.requiresAiVideo
          ? '建议使用真实或生成视频'
          : shot?.motionPlan?.requiresLayering
            ? '建议使用分层动效'
            : '可使用静态素材或简单动效',
      });
      shotStart += duration;
      number += 1;
    }
    sceneStart += scene.duration;
  }
  return rows;
};

export const createEditingPackage = async (
  project: ProjectFile,
  projectRoot: string,
  options: PackageOptions = {},
): Promise<EditingPackageResult> => {
  const now = options.now ?? new Date();
  const timestamp = now.toISOString().replace(/[:.]/gu, '-');
  const packageName =
    options.packageName ?? `${safeName(project.project.title, 'cut-flow-project')}-editing-package-${timestamp}`;
  const outputDirectory = path.join(
    options.outputRoot ?? path.join(projectRoot, 'exports'),
    safeName(packageName, `editing-package-${timestamp}`),
  );
  const directories = {
    project: path.join(outputDirectory, '00-project'),
    voice: path.join(outputDirectory, '01-voice'),
    captions: path.join(outputDirectory, '02-captions'),
    assets: path.join(outputDirectory, '03-assets'),
    motion: path.join(outputDirectory, '04-motion-clips'),
    covers: path.join(outputDirectory, '05-covers'),
    preview: path.join(outputDirectory, '06-preview'),
  };
  await Promise.all(Object.values(directories).map((directory) => mkdir(directory, {recursive: true})));

  const warnings: EditingPackageWarning[] = [];
  const rows = buildRows(project);
  let copiedAssets = 0;
  let rowIndex = 0;
  for (const scene of project.scenes) {
    const shots = scene.shots?.length ? scene.shots : [undefined];
    for (const shot of shots) {
      const row = rows[rowIndex]!;
      const assets = shotAssets(shot, scene.assetPath);
      let assetIndex = 1;
      for (const asset of assets) {
        const source = resolveInside(projectRoot, asset.path);
        if (!(await exists(source))) {
          warnings.push({
            code: 'MISSING_ASSET',
            message: `镜头 ${row.number} 的素材不存在：${asset.path}`,
            sourcePath: asset.path,
          });
          continue;
        }
        const extension = path.extname(source).toLowerCase();
        const role = safeName(asset.role, 'asset').replace(/\s+/gu, '-');
        const fileName = `shot-${String(row.number).padStart(3, '0')}-${role}-${assetIndex}${extension}`;
        await copyFile(source, path.join(directories.assets, fileName));
        row.assetFiles.push(`03-assets/${fileName}`);
        copiedAssets += 1;
        assetIndex += 1;
      }
      rowIndex += 1;
    }
  }

  let narrationFile: string | null = null;
  if (
    (project.narrationMode ?? (project.narrationAudio ? 'full' : 'segments')) === 'segments'
  ) {
    const segmentDirectory = path.join(directories.voice, 'segments');
    await mkdir(segmentDirectory, {recursive: true});
    for (const [index, scene] of project.scenes.entries()) {
      if (!scene.narrationAudio) {
        warnings.push({
          code: 'MISSING_NARRATION',
          message: `段落 ${index + 1} 尚未选择配音`,
        });
        continue;
      }
      const source = resolveInside(projectRoot, scene.narrationAudio);
      if (!(await exists(source))) {
        warnings.push({
          code: 'MISSING_NARRATION',
          message: `段落 ${index + 1} 配音文件不存在：${scene.narrationAudio}`,
          sourcePath: scene.narrationAudio,
        });
        continue;
      }
      const extension = path.extname(source).toLowerCase() || '.wav';
      await copyFile(
        source,
        path.join(segmentDirectory, `${String(index + 1).padStart(2, '0')}-${scene.id}${extension}`),
      );
    }
    narrationFile = '01-voice/segments/';
  } else if (project.narrationAudio) {
    const source = resolveInside(projectRoot, project.narrationAudio);
    if (await exists(source)) {
      const fileName = `narration${path.extname(source).toLowerCase() || '.wav'}`;
      await copyFile(source, path.join(directories.voice, fileName));
      narrationFile = `01-voice/${fileName}`;
    } else {
      warnings.push({
        code: 'MISSING_NARRATION',
        message: `旁白文件不存在：${project.narrationAudio}`,
        sourcePath: project.narrationAudio,
      });
    }
  } else {
    warnings.push({code: 'MISSING_NARRATION', message: '项目尚未设置旁白文件'});
  }

  let coverFile: string | null = null;
  if (project.cover?.outputPath) {
    const source = resolveInside(projectRoot, project.cover.outputPath);
    if (await exists(source)) {
      const extension = path.extname(source).toLowerCase() || '.png';
      const fileName = `douyin-cover${extension}`;
      await copyFile(source, path.join(directories.covers, fileName));
      coverFile = `05-covers/${fileName}`;
    }
  }

  const script = [
    `# ${project.project.title}`,
    '',
    `- 主题：${project.content?.topic || project.project.title}`,
    `- 平台：${project.project.platform ?? '未指定'}`,
    `- 目标时长：${project.project.durationTarget ?? '未指定'} 秒`,
    '',
    '## 开场',
    '',
    project.content?.hook || '（未单独设置开场）',
    '',
    '## 正文',
    '',
    ...project.scenes.flatMap((scene, index) => [
      `### ${index + 1}. ${scene.caption}`,
      '',
      scene.narration || '（无旁白）',
      '',
    ]),
    '## 结尾',
    '',
    project.content?.ending || '（未单独设置结尾）',
    '',
  ].join('\n');

  const csvHeader = [
    '编号',
    '开始时间',
    '结束时间',
    '场景ID',
    '镜头ID',
    '旁白',
    '字幕',
    '画面说明',
    '素材文件',
    '动效',
    '剪辑建议',
  ];
  const storyboardCsv = [
    csvHeader.map(csvCell).join(','),
    ...rows.map((row) =>
      [
        row.number,
        srtTimestamp(row.start).replace(',', '.'),
        srtTimestamp(row.end).replace(',', '.'),
        row.sceneId,
        row.shotId,
        row.narration,
        row.caption,
        row.visualPurpose,
        row.assetFiles.join('; '),
        row.motion,
        row.editingNote,
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');

  let captionStart = 0;
  const captionsSrt = project.scenes
    .map((scene, index) => {
      const start = captionStart;
      captionStart += scene.duration;
      return `${index + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(captionStart)}\n${scene.caption}\n`;
    })
    .join('\n');

  const editingNotes = [
    `# ${project.project.title} 剪辑说明`,
    '',
    `画面：${project.project.width} × ${project.project.height}，${project.project.fps} FPS`,
    `镜头数：${rows.length}`,
    `配音：${narrationFile ?? '缺失'}`,
    `封面：${coverFile ?? '缺失'}`,
    '',
    '## 建议流程',
    '',
    '1. 先导入旁白并锁定音频时间。',
    '2. 导入 `captions.srt`。',
    '3. 按 `storyboard.csv` 的编号和时间放置素材。',
    '4. 将 `04-motion-clips` 中的程序化动效放到对应镜头。',
    '5. 在专业剪辑软件中完成节奏、转场、音效、调色和最终包装。',
    '',
    '## 导出警告',
    '',
    ...(warnings.length ? warnings.map((warning) => `- ${warning.message}`) : ['- 无']),
    '',
  ].join('\n');

  const manifest = {
    version: 1,
    kind: 'cut-flow-editing-package',
    createdAt: now.toISOString(),
    project: {
      title: project.project.title,
      width: project.project.width,
      height: project.project.height,
      fps: project.project.fps,
      platform: project.project.platform ?? null,
    },
    files: {
      script: '00-project/script.md',
      storyboard: '00-project/storyboard.csv',
      editingNotes: '00-project/editing-notes.md',
      captions: '02-captions/captions.srt',
      narration: narrationFile,
      cover: coverFile,
    },
    shots: rows,
    warnings,
  };

  const manifestPath = path.join(directories.project, 'manifest.json');
  await Promise.all([
    writeFile(path.join(directories.project, 'script.md'), `${script}\n`, 'utf8'),
    writeFile(path.join(directories.project, 'storyboard.csv'), `\uFEFF${storyboardCsv}\n`, 'utf8'),
    writeFile(path.join(directories.project, 'editing-notes.md'), `${editingNotes}\n`, 'utf8'),
    writeFile(path.join(directories.captions, 'captions.srt'), captionsSrt, 'utf8'),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
  ]);

  return {outputDirectory, manifestPath, copiedAssets, warnings};
};
