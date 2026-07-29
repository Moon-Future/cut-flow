import {useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent} from 'react';
import type {ProjectFile} from '../../core/schema';
import {useStudioStore} from '../store';

type Props = {
  project: ProjectFile;
  projectId: string;
};

const imagePattern = /\.(?:png|jpe?g|webp|gif|avif)(?:[?#].*)?$/iu;
const mediaUrl = (projectId: string, path: string) => `/${projectId}/${path}`;
type CoverTextLayer = NonNullable<NonNullable<ProjectFile['cover']>['textLayers']>[number];
type CoverTemplate = {
  id: string;
  name: string;
  createdAt: string;
  settings: Pick<
    NonNullable<ProjectFile['cover']>,
    | 'overlayOpacity'
    | 'backgroundScale'
    | 'backgroundScaleX'
    | 'backgroundScaleY'
    | 'backgroundX'
    | 'backgroundY'
    | 'textLayers'
  >;
};

const coverTemplatesKey = 'cutflow.coverTemplates.v1';
const characterStyle = (layer: CoverTextLayer, index: number) => {
  const matches = (layer.styles ?? []).filter((style) => index >= style.start && index < style.end);
  return matches.reduce(
    (result, style) => ({
      fontSize: style.fontSize ?? result.fontSize,
      color: style.color ?? result.color,
    }),
    {fontSize: layer.fontSize, color: layer.color},
  );
};

const createCoverDraft = (project: ProjectFile) => {
  const legacyAlign = project.cover?.textAlign ?? ('left' as const);
  const textLayers: CoverTextLayer[] = project.cover?.textLayers ?? [
    {
      id: 'cover-title',
      text: project.cover?.title || project.project.title,
      x: legacyAlign === 'center' ? 50 : 9,
      y: 56,
      fontFamily: 'Microsoft YaHei',
      fontSize: 88,
      color: '#ffffff',
      fontWeight: '800',
      textAlign: legacyAlign,
      canvasAlign: legacyAlign === 'center' ? 'center' : 'left',
    },
    {
      id: 'cover-subtitle',
      text: project.cover?.subtitle ?? '',
      x: legacyAlign === 'center' ? 50 : 9,
      y: 72,
      fontFamily: 'Microsoft YaHei',
      fontSize: 40,
      color: project.cover?.accentColor ?? '#ffcf4a',
      fontWeight: '700',
      textAlign: legacyAlign,
      canvasAlign: legacyAlign === 'center' ? 'center' : 'left',
    },
  ];
  return {
    sourcePath: project.cover?.sourcePath ?? null,
    outputPath: project.cover?.outputPath ?? null,
    title: project.cover?.title || project.project.title,
    subtitle: project.cover?.subtitle ?? '',
    textAlign: legacyAlign,
    overlayOpacity: project.cover?.overlayOpacity ?? 0.42,
    accentColor: project.cover?.accentColor ?? '#ffcf4a',
    backgroundScale: project.cover?.backgroundScale ?? 1,
    backgroundScaleX:
      project.cover?.backgroundScaleX ?? project.cover?.backgroundScale ?? 1,
    backgroundScaleY:
      project.cover?.backgroundScaleY ?? project.cover?.backgroundScale ?? 1,
    backgroundX: project.cover?.backgroundX ?? 50,
    backgroundY: project.cover?.backgroundY ?? 50,
    textLayers,
  };
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('封面图片加载失败'));
    image.src = src;
  });

const drawStyledCoverText = (
  context: CanvasRenderingContext2D,
  layer: CoverTextLayer,
  x: number,
  y: number,
  maximumWidth: number,
) => {
  const lines: Array<Array<{character: string; index: number; width: number; size: number; color: string}>> = [[]];
  let lineWidth = 0;
  Array.from(layer.text).forEach((character, index) => {
    const style = characterStyle(layer, index);
    context.font = `${layer.fontWeight} ${style.fontSize}px "${layer.fontFamily}", sans-serif`;
    const width = context.measureText(character).width;
    if (character === '\n' || (lines.at(-1)!.length && lineWidth + width > maximumWidth)) {
      lines.push([]);
      lineWidth = 0;
    }
    if (character !== '\n') {
      lines.at(-1)!.push({character, index, width, size: style.fontSize, color: style.color});
      lineWidth += width;
    }
  });
  let top = y;
  for (const line of lines.slice(0, 5)) {
    const width = line.reduce((sum, item) => sum + item.width, 0);
    const lineHeight = Math.max(layer.fontSize, ...line.map((item) => item.size)) * 1.25;
    let cursor =
      layer.textAlign === 'center' ? x - width / 2 : layer.textAlign === 'right' ? x - width : x;
    for (const item of line) {
      context.font = `${layer.fontWeight} ${item.size}px "${layer.fontFamily}", sans-serif`;
      context.fillStyle = item.color;
      context.textAlign = 'left';
      context.fillText(item.character, cursor, top);
      cursor += item.width;
    }
    top += lineHeight;
  }
};

export const CoverWorkspace = ({project, projectId}: Props) => {
  const updateProjectCover = useStudioStore((state) => state.updateCover);
  const [cover, setCover] = useState(() => createCoverDraft(project));
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null);
  const [message, setMessage] = useState('');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    cover.textLayers[0]?.id ?? null,
  );
  const [textSelection, setTextSelection] = useState({start: 0, end: 0});
  const [partialFontSize, setPartialFontSize] = useState(48);
  const [partialColor, setPartialColor] = useState('#ffcf4a');
  const [templates, setTemplates] = useState<CoverTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const dragPreviewRef = useRef<{
    kind: 'background' | 'text';
    id?: string;
    x: number;
    y: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const backgroundImageRef = useRef<HTMLImageElement>(null);
  const textElementRefs = useRef(new Map<string, HTMLDivElement>());
  const interaction = useRef<{
    kind: 'background' | 'text';
    id?: string;
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
  } | null>(null);
  useEffect(() => {
    try {
      setTemplates(
        JSON.parse(window.localStorage.getItem(coverTemplatesKey) ?? '[]') as CoverTemplate[],
      );
    } catch {
      setTemplates([]);
    }
  }, []);
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

  const updateCover = (patch: Partial<typeof cover>) =>
    setCover((current) => ({...current, ...patch}));
  const updateTextLayer = (id: string, patch: Partial<CoverTextLayer>) =>
    updateCover({
      textLayers: cover.textLayers.map((layer) => (layer.id === id ? {...layer, ...patch} : layer)),
      outputPath: null,
    });
  const persistTemplates = (next: CoverTemplate[]) => {
    setTemplates(next);
    window.localStorage.setItem(coverTemplatesKey, JSON.stringify(next));
  };
  const pointerPosition = (event: ReactPointerEvent) => {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };
  };
  const applyBackgroundTransform = (x: number, y: number) => {
    if (!backgroundImageRef.current) return;
    backgroundImageRef.current.style.transform =
      `translate(${(50 - x) * 0.55}%, ${(50 - y) * 0.55}%) ` +
      `scale(${cover.backgroundScaleX}, ${cover.backgroundScaleY})`;
  };
  const applyTextPosition = (id: string, x: number, y: number) => {
    const element = textElementRefs.current.get(id);
    if (!element) return;
    const layer = cover.textLayers.find((item) => item.id === id);
    element.style.left = `${x}%`;
    element.style.top = `${y}%`;
    element.style.transform =
      layer?.textAlign === 'center'
        ? 'translateX(-50%)'
        : layer?.textAlign === 'right'
          ? 'translateX(-100%)'
          : '';
  };
  const handlePointerMove = (event: ReactPointerEvent) => {
    const active = interaction.current;
    if (!active) return;
    const position = pointerPosition(event);
    const deltaX = position.x - active.startX;
    const deltaY = position.y - active.startY;
    if (active.kind === 'background') {
      const preview = {
        kind: 'background',
        x: Math.max(0, Math.min(100, active.originalX - deltaX)),
        y: Math.max(0, Math.min(100, active.originalY - deltaY)),
      } as const;
      dragPreviewRef.current = preview;
      applyBackgroundTransform(preview.x, preview.y);
    } else if (active.kind === 'text' && active.id) {
      const preview = {
        kind: 'text',
        id: active.id,
        x: Math.max(0, Math.min(100, active.originalX + deltaX)),
        y: Math.max(0, Math.min(100, active.originalY + deltaY)),
      } as const;
      dragPreviewRef.current = preview;
      applyTextPosition(preview.id, preview.x, preview.y);
    }
  };
  const endInteraction = () => {
    const preview = dragPreviewRef.current;
    if (preview?.kind === 'background') {
      updateCover({backgroundX: preview.x, backgroundY: preview.y, outputPath: null});
    } else if (preview?.kind === 'text' && preview.id) {
      updateTextLayer(preview.id, {
        x: preview.x,
        y: preview.y,
        canvasAlign: 'custom',
      });
    }
    dragPreviewRef.current = null;
    interaction.current = null;
  };
  const applyPartialStyle = () => {
    const layer = cover.textLayers.find((item) => item.id === selectedLayerId);
    if (!layer || textSelection.end <= textSelection.start) {
      setMessage('请先在左侧文字输入框中选中要单独设置的文字。');
      return;
    }
    updateTextLayer(layer.id, {
      styles: [
        ...(layer.styles ?? []),
        {
          start: textSelection.start,
          end: textSelection.end,
          fontSize: partialFontSize,
          color: partialColor,
        },
      ],
    });
    setMessage(`已为选中的 ${textSelection.end - textSelection.start} 个字符应用局部样式。`);
  };

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
    setMessage('正在生成 1080 × 1440 封面…');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1440;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法创建封面画布');
      const image = await loadImage(mediaUrl(projectId, cover.sourcePath));
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const width = image.width * scale * cover.backgroundScaleX;
      const height = image.height * scale * cover.backgroundScaleY;
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
      const gradient = context.createLinearGradient(0, 180, 0, 1300);
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
        const maximumWidth =
          layer.textAlign === 'center'
            ? 2 * Math.min(layer.x, 100 - layer.x) * 10.8
            : layer.textAlign === 'left'
              ? (100 - layer.x) * 10.8 - 40
              : layer.x * 10.8 - 40;
        drawStyledCoverText(
          context,
          layer,
          (layer.x / 100) * canvas.width,
          (layer.y / 100) * canvas.height,
          Math.max(180, maximumWidth),
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
      const savedCover = {...cover, outputPath: value.assetPath};
      setCover(savedCover);
      updateProjectCover(savedCover);
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
            <span>抖音封面 · 3:4 · 1080 × 1440</span>
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
            <small>放大后可调整主体在封面中的位置</small>
          </header>
          <label>
            <span>横向缩放 {cover.backgroundScaleX.toFixed(2)}×</span>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value={cover.backgroundScaleX}
              onChange={(event) =>
                updateCover({backgroundScaleX: Number(event.target.value), outputPath: null})
              }
            />
          </label>
          <label>
            <span>纵向缩放 {cover.backgroundScaleY.toFixed(2)}×</span>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value={cover.backgroundScaleY}
              onChange={(event) =>
                updateCover({backgroundScaleY: Number(event.target.value), outputPath: null})
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
                      canvasAlign: 'center',
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
            <article
              className={`cover-text-layer-card ${
                selectedLayerId === layer.id ? 'selected' : ''
              }`}
              key={layer.id}
              onClick={() => setSelectedLayerId(layer.id)}
            >
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
                onSelect={(event) => {
                  setSelectedLayerId(layer.id);
                  setTextSelection({
                    start: event.currentTarget.selectionStart,
                    end: event.currentTarget.selectionEnd,
                  });
                }}
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
                  <span>框内对齐</span>
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
                  <span>画布对齐</span>
                  <select
                    value={layer.canvasAlign ?? 'custom'}
                    onChange={(event) => {
                      const canvasAlign = event.target
                        .value as NonNullable<CoverTextLayer['canvasAlign']>;
                      updateTextLayer(layer.id, {
                        canvasAlign,
                        x:
                          canvasAlign === 'left'
                            ? 8
                            : canvasAlign === 'center'
                              ? 50
                              : canvasAlign === 'right'
                                ? 92
                                : layer.x,
                      });
                    }}
                  >
                    <option value="left">画布左侧</option>
                    <option value="center">画布居中</option>
                    <option value="right">画布右侧</option>
                    <option value="custom">自定义位置</option>
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
              {selectedLayerId === layer.id ? (
                <div className="cover-partial-style">
                  <header>
                    <strong>选中文字局部样式</strong>
                    <small>
                      当前选中 {Math.max(0, textSelection.end - textSelection.start)} 个字
                    </small>
                  </header>
                  <label>
                    <span>局部字号 {partialFontSize}px</span>
                    <input
                      type="range"
                      min="20"
                      max="180"
                      step="2"
                      value={partialFontSize}
                      onChange={(event) => setPartialFontSize(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>局部颜色</span>
                    <input
                      type="color"
                      value={partialColor}
                      onChange={(event) => setPartialColor(event.target.value)}
                    />
                  </label>
                  <button type="button" onClick={applyPartialStyle}>
                    应用到选中文字
                  </button>
                </div>
              ) : null}
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
        <section className="cover-setting-group cover-template-settings">
          <header>
            <div>
              <strong>封面模板</strong>
              <small>保存布局和样式，其他项目可直接复用</small>
            </div>
          </header>
          <div className="cover-template-save">
            <input
              value={templateName}
              maxLength={30}
              placeholder="输入模板名称"
              onChange={(event) => setTemplateName(event.target.value)}
            />
            <button
              type="button"
              disabled={!templateName.trim()}
              onClick={() => {
                const template: CoverTemplate = {
                  id: `cover-template-${Date.now()}`,
                  name: templateName.trim(),
                  createdAt: new Date().toISOString(),
                  settings: {
                    overlayOpacity: cover.overlayOpacity,
                    backgroundScale: cover.backgroundScale,
                    backgroundScaleX: cover.backgroundScaleX,
                    backgroundScaleY: cover.backgroundScaleY,
                    backgroundX: cover.backgroundX,
                    backgroundY: cover.backgroundY,
                    textLayers: cover.textLayers,
                  },
                };
                persistTemplates([...templates, template]);
                setTemplateName('');
                setMessage(`模板“${template.name}”已保存，可在其他项目使用。`);
              }}
            >
              保存当前模板
            </button>
          </div>
          {templates.length ? (
            <div className="cover-template-list">
              {templates.map((template) => (
                <article key={template.id}>
                  <span>
                    <strong>{template.name}</strong>
                    <small>{template.settings.textLayers?.length ?? 0} 个文字图层</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      updateCover({
                        ...template.settings,
                        outputPath: null,
                      });
                      setSelectedLayerId(template.settings.textLayers?.[0]?.id ?? null);
                      setMessage(`已应用模板“${template.name}”，可以更换背景和文字。`);
                    }}
                  >
                    应用
                  </button>
                  <button
                    type="button"
                    className="delete"
                    onClick={() =>
                      persistTemplates(templates.filter((item) => item.id !== template.id))
                    }
                  >
                    删除
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <small className="cover-template-empty">还没有保存封面模板</small>
          )}
        </section>
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
            <span>3:4 · 1080 × 1440</span>
          </div>
        </header>
        <div className="douyin-cover-shell">
          <div
            ref={canvasRef}
            className={`douyin-cover ${interaction.current ? 'interacting' : ''}`}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget &&
                  (event.target as HTMLElement).closest('.cover-text-preview-layer')) return;
              const position = pointerPosition(event);
              interaction.current = {
                kind: 'background',
                startX: position.x,
                startY: position.y,
                originalX: cover.backgroundX,
                originalY: cover.backgroundY,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
            onWheel={(event) => {
              event.preventDefault();
              const delta = event.deltaY < 0 ? 0.05 : -0.05;
              updateCover({
                backgroundScaleX: Math.max(0.5, Math.min(3, cover.backgroundScaleX + delta)),
                backgroundScaleY: Math.max(0.5, Math.min(3, cover.backgroundScaleY + delta)),
                outputPath: null,
              });
            }}
          >
            {cover.sourcePath ? (
              <img
                ref={backgroundImageRef}
                className="cover-background-image"
                src={mediaUrl(projectId, cover.sourcePath)}
                alt=""
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                style={{
                  transform:
                    `translate(${(50 - cover.backgroundX) * 0.55}%, ${
                      (50 - cover.backgroundY) * 0.55
                    }%) scale(${cover.backgroundScaleX}, ${cover.backgroundScaleY})`,
                }}
              />
            ) : null}
            <div
              className="cover-dark-layer"
              style={{opacity: cover.overlayOpacity}}
            />
            {cover.textLayers.map((layer) =>
              layer.text ? (
                <div
                  ref={(element) => {
                    if (element) textElementRefs.current.set(layer.id, element);
                    else textElementRefs.current.delete(layer.id);
                  }}
                  className={`cover-text-preview-layer ${
                    selectedLayerId === layer.id ? 'selected' : ''
                  }`}
                  key={layer.id}
                  style={{
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
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
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedLayerId(layer.id);
                    const position = pointerPosition(event);
                    interaction.current = {
                      kind: 'text',
                      id: layer.id,
                      startX: position.x,
                      startY: position.y,
                      originalX: layer.x,
                      originalY: layer.y,
                    };
                    canvasRef.current?.setPointerCapture(event.pointerId);
                  }}
                >
                  {Array.from(layer.text).map((character, index) => {
                    const style = characterStyle(layer, index);
                    return (
                      <span
                        key={`${layer.id}-${index}`}
                        style={{
                          color: style.color,
                          fontSize: `${Math.max(9, style.fontSize * 0.42)}px`,
                        }}
                      >
                        {character}
                      </span>
                    );
                  })}
                </div>
              ) : null,
            )}
            {!cover.sourcePath ? <p>选择项目图片或从电脑上传底图</p> : null}
          </div>
        </div>
      </main>
    </section>
  );
};
