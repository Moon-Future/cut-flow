import {useMemo, useRef, useState} from 'react';
import type {ProjectFile} from '../../core/schema';
import {useStudioStore} from '../store';

type Props = {
  project: ProjectFile;
  projectId: string;
};

const imagePattern = /\.(?:png|jpe?g|webp|gif|avif)(?:[?#].*)?$/iu;
const mediaUrl = (projectId: string, path: string) => `/${projectId}/${path}`;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('封面图片加载失败'));
    image.src = src;
  });

const drawCoverText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maximumWidth: number,
  lineHeight: number,
  align: CanvasTextAlign,
) => {
  const characters = Array.from(text.trim());
  const lines: string[] = [];
  let line = '';
  for (const character of characters) {
    const next = `${line}${character}`;
    if (line && context.measureText(next).width > maximumWidth) {
      lines.push(line);
      line = character;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((value, index) => {
    context.fillText(value, x, y + index * lineHeight, maximumWidth);
  });
  return Math.min(lines.length, 3) * lineHeight;
};

export const CoverWorkspace = ({project, projectId}: Props) => {
  const updateProjectCover = useStudioStore((state) => state.updateCover);
  const cover = {
    sourcePath: project.cover?.sourcePath ?? null,
    outputPath: project.cover?.outputPath ?? null,
    title: project.cover?.title || project.project.title,
    subtitle: project.cover?.subtitle ?? '',
    textAlign: project.cover?.textAlign ?? ('left' as const),
    overlayOpacity: project.cover?.overlayOpacity ?? 0.42,
    accentColor: project.cover?.accentColor ?? '#ffcf4a',
  };
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const imageOptions = useMemo(
    () =>
      [
        ...project.scenes.flatMap((scene) => [
          scene.assetPath,
          ...(scene.shots ?? []).flatMap((shot) => [
            shot.selectedAsset,
            ...(shot.selectedAssets ?? []),
            ...shot.candidates
              .filter((candidate) => candidate.kind === 'image')
              .map((candidate) => candidate.path),
          ]),
        ]),
      ].filter(
        (path, index, values): path is string =>
          Boolean(path && imagePattern.test(path)) && values.indexOf(path) === index,
      ),
    [project.scenes],
  );

  const updateCover = (patch: Partial<typeof cover>) => updateProjectCover(patch);

  const uploadSource = async (file: File) => {
    setBusy('upload');
    setMessage('');
    try {
      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
          'X-Target-Directory': encodeURIComponent('covers'),
        },
        body: file,
      });
      const value = (await response.json()) as {assetPath?: string; error?: string};
      if (!response.ok || !value.assetPath) throw new Error(value.error ?? '封面图片上传失败');
      updateCover({sourcePath: value.assetPath, outputPath: null});
      setMessage('封面底图已上传。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const saveCover = async () => {
    if (!cover.sourcePath) {
      setMessage('请先选择一张封面底图。');
      return;
    }
    setBusy('save');
    setMessage('正在生成 1080 × 1920 封面…');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法创建封面画布');
      const image = await loadImage(mediaUrl(projectId, cover.sourcePath));
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      const gradient = context.createLinearGradient(0, 300, 0, 1700);
      gradient.addColorStop(0, `rgba(0,0,0,${cover.overlayOpacity * 0.35})`);
      gradient.addColorStop(0.45, `rgba(0,0,0,${cover.overlayOpacity * 0.15})`);
      gradient.addColorStop(1, `rgba(0,0,0,${cover.overlayOpacity})`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const centered = cover.textAlign === 'center';
      const x = centered ? 540 : 92;
      const maximumWidth = centered ? 900 : 850;
      context.textAlign = centered ? 'center' : 'left';
      context.textBaseline = 'top';
      context.font = '700 88px "Microsoft YaHei", sans-serif';
      context.fillStyle = '#ffffff';
      context.shadowColor = 'rgba(0,0,0,.55)';
      context.shadowBlur = 18;
      const titleHeight = drawCoverText(
        context,
        cover.title,
        x,
        1080,
        maximumWidth,
        112,
        context.textAlign,
      );
      if (cover.subtitle.trim()) {
        context.font = '600 40px "Microsoft YaHei", sans-serif';
        context.fillStyle = cover.accentColor;
        context.shadowBlur = 10;
        drawCoverText(
          context,
          cover.subtitle,
          x,
          1080 + titleHeight + 28,
          maximumWidth,
          56,
          context.textAlign,
        );
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('封面图片生成失败'))),
          'image/png',
        ),
      );
      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
          'X-File-Name': encodeURIComponent(`douyin-cover-${Date.now()}.png`),
          'X-Target-Directory': encodeURIComponent('covers'),
        },
        body: blob,
      });
      const value = (await response.json()) as {assetPath?: string; error?: string};
      if (!response.ok || !value.assetPath) throw new Error(value.error ?? '封面保存失败');
      updateCover({outputPath: value.assetPath});
      setMessage('封面已生成并保存到项目，可随生产包导出。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="cover-maker">
      <aside className="cover-controls stage-panel">
        <header>
          <div>
            <strong>封面设置</strong>
            <span>抖音竖屏 · 1080 × 1920</span>
          </div>
        </header>
        <label>
          <span>封面底图</span>
          <select
            value={cover.sourcePath ?? ''}
            onChange={(event) =>
              updateCover({sourcePath: event.target.value || null, outputPath: null})
            }
          >
            <option value="">请选择项目图片</option>
            {imageOptions.map((path) => (
              <option value={path} key={path}>
                {path.split('/').at(-1)}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadSource(file);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="cover-upload-button"
          disabled={busy === 'upload'}
          onClick={() => fileInput.current?.click()}
        >
          {busy === 'upload' ? '正在上传…' : '从电脑上传底图'}
        </button>
        <label>
          <span>主标题</span>
          <textarea
            rows={3}
            maxLength={36}
            value={cover.title}
            onChange={(event) => updateCover({title: event.target.value, outputPath: null})}
          />
          <small>{cover.title.length} / 36，建议 8～16 字</small>
        </label>
        <label>
          <span>强调文字</span>
          <input
            maxLength={24}
            value={cover.subtitle}
            placeholder="可选，例如：3分钟讲清楚"
            onChange={(event) => updateCover({subtitle: event.target.value, outputPath: null})}
          />
        </label>
        <div className="cover-form-pair">
          <label>
            <span>文字对齐</span>
            <select
              value={cover.textAlign}
              onChange={(event) =>
                updateCover({
                  textAlign: event.target.value as 'left' | 'center',
                  outputPath: null,
                })
              }
            >
              <option value="left">左对齐</option>
              <option value="center">居中</option>
            </select>
          </label>
          <label>
            <span>强调色</span>
            <input
              type="color"
              value={cover.accentColor}
              onChange={(event) => updateCover({accentColor: event.target.value, outputPath: null})}
            />
          </label>
        </div>
        <label>
          <span>背景压暗 {Math.round(cover.overlayOpacity * 100)}%</span>
          <input
            type="range"
            min="0"
            max="0.85"
            step="0.05"
            value={cover.overlayOpacity}
            onChange={(event) =>
              updateCover({overlayOpacity: Number(event.target.value), outputPath: null})
            }
          />
        </label>
        <button
          type="button"
          className="primary-button cover-save-button"
          disabled={busy === 'save' || !cover.sourcePath || !cover.title.trim()}
          onClick={() => void saveCover()}
        >
          {busy === 'save' ? '正在生成封面…' : '生成并保存封面'}
        </button>
        {message ? <p className="cover-message">{message}</p> : null}
        {cover.outputPath ? (
          <small className="cover-output">已保存：{cover.outputPath}</small>
        ) : null}
      </aside>
      <main className="cover-canvas-panel stage-panel">
        <header>
          <div>
            <strong>抖音封面预览</strong>
            <span>白色虚线内为个人主页 3:4 主要显示区域</span>
          </div>
        </header>
        <div className="douyin-cover-shell">
          <div
            className={`douyin-cover ${cover.textAlign}`}
            style={
              cover.sourcePath
                ? {backgroundImage: `url("${mediaUrl(projectId, cover.sourcePath)}")`}
                : undefined
            }
          >
            <div
              className="cover-dark-layer"
              style={{opacity: cover.overlayOpacity}}
            />
            <div className="douyin-safe-zone">
              <span>3:4 主页封面安全区</span>
            </div>
            <div className="cover-copy">
              <strong>{cover.title || '输入封面标题'}</strong>
              {cover.subtitle ? (
                <small style={{color: cover.accentColor}}>{cover.subtitle}</small>
              ) : null}
            </div>
            {!cover.sourcePath ? <p>选择项目图片或从电脑上传底图</p> : null}
          </div>
        </div>
        <div className="cover-safe-notes">
          <span><b>9:16</b> 视频发布封面完整尺寸</span>
          <span><b>3:4</b> 个人主页列表主要展示区域</span>
          <span><b>建议</b> 标题与主体保持在白色虚线内</span>
        </div>
      </main>
    </section>
  );
};
