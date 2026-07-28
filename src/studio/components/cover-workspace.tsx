import {useMemo, useRef, useState} from 'react';
import type {ProjectFile} from '../../core/schema';
import {useStudioStore} from '../store';

type Props = {
  project: ProjectFile;
  projectId: string;
};

const imagePattern = /\.(?:png|jpe?g|webp|gif|avif)(?:[?#].*)?$/iu;
const mediaUrl = (projectId: string, path: string) => `/${projectId}/${path}`;
type CoverTextLayer = NonNullable<NonNullable<ProjectFile['cover']>['textLayers']>[number];

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
  const defaultTextLayers: CoverTextLayer[] = [
    {
      id: 'cover-title',
      text: project.cover?.title || project.project.title,
      x: project.cover?.textAlign === 'center' ? 50 : 9,
      y: 56,
      fontFamily: 'Microsoft YaHei',
      fontSize: 88,
      color: '#ffffff',
      fontWeight: '800',
      textAlign: project.cover?.textAlign ?? 'left',
    },
    {
      id: 'cover-subtitle',
      text: project.cover?.subtitle ?? '',
      x: project.cover?.textAlign === 'center' ? 50 : 9,
      y: 72,
      fontFamily: 'Microsoft YaHei',
      fontSize: 40,
      color: project.cover?.accentColor ?? '#ffcf4a',
      fontWeight: '700',
      textAlign: project.cover?.textAlign ?? 'left',
    },
  ];
  const cover = {
    sourcePath: project.cover?.sourcePath ?? null,
    outputPath: project.cover?.outputPath ?? null,
    title: project.cover?.title || project.project.title,
    subtitle: project.cover?.subtitle ?? '',
    textAlign: project.cover?.textAlign ?? ('left' as const),
    overlayOpacity: project.cover?.overlayOpacity ?? 0.42,
    accentColor: project.cover?.accentColor ?? '#ffcf4a',
    backgroundScale: project.cover?.backgroundScale ?? 1,
    backgroundX: project.cover?.backgroundX ?? 50,
    backgroundY: project.cover?.backgroundY ?? 50,
    textLayers: project.cover?.textLayers ?? defaultTextLayers,
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
  const updateTextLayer = (id: string, patch: Partial<CoverTextLayer>) =>
    updateCover({
      textLayers: cover.textLayers.map((layer) => (layer.id === id ? {...layer, ...patch} : layer)),
      outputPath: null,
    });

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
      const scale =
        Math.max(canvas.width / image.width, canvas.height / image.height) *
        cover.backgroundScale;
      const width = image.width * scale;
      const height = image.height * scale;
      const movableX = Math.max(0, (width - canvas.width) / 2);
      const movableY = Math.max(0, (height - canvas.height) / 2);
      const offsetX = ((cover.backgroundX - 50) / 50) * movableX;
      const offsetY = ((cover.backgroundY - 50) / 50) * movableY;
      context.drawImage(
        image,
        (canvas.width - width) / 2 - offsetX,
        (canvas.height - height) / 2 - offsetY,
        width,
        height,
      );
      const gradient = context.createLinearGradient(0, 300, 0, 1700);
      gradient.addColorStop(0, `rgba(0,0,0,${cover.overlayOpacity * 0.35})`);
      gradient.addColorStop(0.45, `rgba(0,0,0,${cover.overlayOpacity * 0.15})`);
      gradient.addColorStop(1, `rgba(0,0,0,${cover.overlayOpacity})`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.textBaseline = 'top';
      context.shadowColor = 'rgba(0,0,0,.55)';
      context.shadowBlur = 18;
      for (const layer of cover.textLayers) {
        if (!layer.text.trim()) continue;
        context.textAlign = layer.textAlign;
        context.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}", sans-serif`;
        context.fillStyle = layer.color;
        const maximumWidth =
          layer.textAlign === 'center'
            ? 2 * Math.min(layer.x, 100 - layer.x) * 10.8
            : layer.textAlign === 'left'
              ? (100 - layer.x) * 10.8 - 40
              : layer.x * 10.8 - 40;
        drawCoverText(
          context,
          layer.text,
          (layer.x / 100) * canvas.width,
          (layer.y / 100) * canvas.height,
          Math.max(180, maximumWidth),
          layer.fontSize * 1.25,
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
        <section className="cover-setting-group">
          <header>
            <strong>背景图位置</strong>
            <small>放大后可调整主体在安全区内的位置</small>
          </header>
          <label>
            <span>缩放 {cover.backgroundScale.toFixed(2)}×</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={cover.backgroundScale}
              onChange={(event) =>
                updateCover({backgroundScale: Number(event.target.value), outputPath: null})
              }
            />
          </label>
          <label>
            <span>水平位置 {Math.round(cover.backgroundX)}%</span>
            <input
              type="range"
              min="0"
              max="100"
              value={cover.backgroundX}
              onChange={(event) =>
                updateCover({backgroundX: Number(event.target.value), outputPath: null})
              }
            />
          </label>
          <label>
            <span>垂直位置 {Math.round(cover.backgroundY)}%</span>
            <input
              type="range"
              min="0"
              max="100"
              value={cover.backgroundY}
              onChange={(event) =>
                updateCover({backgroundY: Number(event.target.value), outputPath: null})
              }
            />
          </label>
        </section>
        <section className="cover-setting-group cover-text-settings">
          <header>
            <div>
              <strong>文字图层</strong>
              <small>每条文字可独立设置位置和样式</small>
            </div>
            <button
              type="button"
              disabled={cover.textLayers.length >= 12}
              onClick={() =>
                updateCover({
                  textLayers: [
                    ...cover.textLayers,
                    {
                      id: `cover-text-${Date.now()}`,
                      text: '新文字',
                      x: 50,
                      y: 65,
                      fontFamily: 'Microsoft YaHei',
                      fontSize: 48,
                      color: '#ffffff',
                      fontWeight: '700',
                      textAlign: 'center',
                    },
                  ],
                  outputPath: null,
                })
              }
            >
              ＋ 添加文字
            </button>
          </header>
          {cover.textLayers.map((layer, index) => (
            <article className="cover-text-layer-card" key={layer.id}>
              <header>
                <strong>文字 {index + 1}</strong>
                <button
                  type="button"
                  onClick={() =>
                    updateCover({
                      textLayers: cover.textLayers.filter((item) => item.id !== layer.id),
                      outputPath: null,
                    })
                  }
                >
                  删除
                </button>
              </header>
              <textarea
                rows={2}
                maxLength={60}
                value={layer.text}
                onChange={(event) => updateTextLayer(layer.id, {text: event.target.value})}
              />
              <div className="cover-layer-grid">
                <label>
                  <span>字体</span>
                  <select
                    value={layer.fontFamily}
                    onChange={(event) =>
                      updateTextLayer(layer.id, {fontFamily: event.target.value})
                    }
                  >
                    <option value="Microsoft YaHei">微软雅黑</option>
                    <option value="SimHei">黑体</option>
                    <option value="KaiTi">楷体</option>
                    <option value="FangSong">仿宋</option>
                  </select>
                </label>
                <label>
                  <span>粗细</span>
                  <select
                    value={layer.fontWeight}
                    onChange={(event) =>
                      updateTextLayer(layer.id, {
                        fontWeight: event.target.value as CoverTextLayer['fontWeight'],
                      })
                    }
                  >
                    <option value="400">常规</option>
                    <option value="600">半粗</option>
                    <option value="700">粗体</option>
                    <option value="800">特粗</option>
                    <option value="900">最粗</option>
                  </select>
                </label>
                <label>
                  <span>对齐</span>
                  <select
                    value={layer.textAlign}
                    onChange={(event) =>
                      updateTextLayer(layer.id, {
                        textAlign: event.target.value as CoverTextLayer['textAlign'],
                      })
                    }
                  >
                    <option value="left">左对齐</option>
                    <option value="center">居中</option>
                    <option value="right">右对齐</option>
                  </select>
                </label>
                <label>
                  <span>颜色</span>
                  <input
                    type="color"
                    value={layer.color}
                    onChange={(event) => updateTextLayer(layer.id, {color: event.target.value})}
                  />
                </label>
              </div>
              <label>
                <span>字号 {layer.fontSize}px</span>
                <input
                  type="range"
                  min="20"
                  max="180"
                  step="2"
                  value={layer.fontSize}
                  onChange={(event) =>
                    updateTextLayer(layer.id, {fontSize: Number(event.target.value)})
                  }
                />
              </label>
              <div className="cover-layer-position">
                <label>
                  <span>水平 {Math.round(layer.x)}%</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={layer.x}
                    onChange={(event) =>
                      updateTextLayer(layer.id, {x: Number(event.target.value)})
                    }
                  />
                </label>
                <label>
                  <span>垂直 {Math.round(layer.y)}%</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={layer.y}
                    onChange={(event) =>
                      updateTextLayer(layer.id, {y: Number(event.target.value)})
                    }
                  />
                </label>
              </div>
            </article>
          ))}
        </section>
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
          disabled={
            busy === 'save' ||
            !cover.sourcePath ||
            !cover.textLayers.some((layer) => layer.text.trim())
          }
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
          <div className="douyin-cover">
            {cover.sourcePath ? (
              <img
                className="cover-background-image"
                src={mediaUrl(projectId, cover.sourcePath)}
                alt=""
                style={{
                  transform: `translate(${(50 - cover.backgroundX) * 0.55}%, ${
                    (50 - cover.backgroundY) * 0.55
                  }%) scale(${cover.backgroundScale})`,
                }}
              />
            ) : null}
            <div
              className="cover-dark-layer"
              style={{opacity: cover.overlayOpacity}}
            />
            <div className="douyin-safe-zone">
              <span>3:4 主页封面安全区</span>
            </div>
            {cover.textLayers.map((layer) =>
              layer.text ? (
                <div
                  className="cover-text-preview-layer"
                  key={layer.id}
                  style={{
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
                    color: layer.color,
                    fontFamily: layer.fontFamily,
                    fontSize: `${Math.max(9, layer.fontSize * 0.42)}px`,
                    fontWeight: layer.fontWeight,
                    textAlign: layer.textAlign,
                    transform:
                      layer.textAlign === 'center'
                        ? 'translateX(-50%)'
                        : layer.textAlign === 'right'
                          ? 'translateX(-100%)'
                          : undefined,
                  }}
                >
                  {layer.text}
                </div>
              ) : null,
            )}
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
