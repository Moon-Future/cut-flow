import {useMemo, useState} from 'react';
import type {VideoType} from '../../core/schema';

type Props = {
  onOpen: (projectId: string, startInContent: boolean) => Promise<void>;
  onClose: () => void;
};

type CreationMode = 'ai-generate' | 'import-copy' | 'import-script' | 'blank';
type Platform = 'douyin' | 'xiaohongshu' | 'wechat-video' | 'bilibili' | 'youtube' | 'custom';

const creationModes: Array<[CreationMode, string, string, string]> = [
  ['ai-generate', 'AI 智能生成', '输入主题，生成文案、分镜和素材建议', '⌘'],
  ['import-copy', '导入文案', '粘贴已有文案，继续生成脚本和镜头', '▤'],
  ['import-script', '导入脚本', '使用已完成的脚本继续制作', '▥'],
  ['blank', '空白项目', '从空白时间线开始自由创作', '□'],
];

const platforms: Array<[Platform, string, string, string]> = [
  ['douyin', '抖音/快手', '9:16', '♪'],
  ['xiaohongshu', '小红书', '3:4', '红'],
  ['wechat-video', '视频号', '9:16', '◇'],
  ['bilibili', 'B站', '16:9', '▣'],
  ['youtube', 'YouTube', '16:9', '▶'],
  ['custom', '自定义', '尺寸', '⚙'],
];

const ratios = [
  ['9:16', 1080, 1920],
  ['3:4', 1080, 1440],
  ['1:1', 1080, 1080],
  ['16:9', 1920, 1080],
  ['4:3', 1440, 1080],
] as const;

const platformDefaults: Record<Platform, (typeof ratios)[number]> = {
  douyin: ratios[0],
  xiaohongshu: ratios[1],
  'wechat-video': ratios[0],
  bilibili: ratios[3],
  youtube: ratios[3],
  custom: ratios[0],
};

export const CreateProjectPage = ({onOpen, onClose}: Props) => {
  const [creationMode, setCreationMode] = useState<CreationMode>('ai-generate');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [ratio, setRatio] = useState<(typeof ratios)[number]>(ratios[0]);
  const [durationTarget, setDurationTarget] = useState(60);
  const [fps, setFps] = useState(30);
  const [videoType, setVideoType] = useState<VideoType>('science-explainer');
  const [autoContinue, setAutoContinue] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const previewStyle = useMemo(
    () => ({
      aspectRatio: `${ratio[1]} / ${ratio[2]}`,
      maxHeight: ratio[1] < ratio[2] ? 360 : 230,
    }),
    [ratio],
  );

  const choosePlatform = (value: Platform) => {
    setPlatform(value);
    if (value !== 'custom') setRatio(platformDefaults[value]);
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          title,
          topic: title,
          description,
          creationMode,
          platform,
          width: ratio[1],
          height: ratio[2],
          fps,
          durationTarget,
          videoType,
        }),
      });
      const value = (await response.json()) as {id?: string; error?: string};
      if (!response.ok || !value.id) throw new Error(value.error ?? '创建项目失败');
      await onOpen(value.id, autoContinue);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="create-project-page">
      <header className="create-heading">
        <div>
          <h1>新建项目</h1>
          <p>从一个好点子开始，快速生成你的第一条视频</p>
        </div>
        <button onClick={onClose} aria-label="关闭">
          ×
        </button>
      </header>

      <div className="create-layout">
        <nav className="create-steps">
          {[
            ['1', '选择创作方式', '选择如何开始你的项目'],
            ['2', '基本信息', '设置项目标题与描述'],
            ['3', '内容输入', '提供文案或主题'],
            ['4', '视频风格', '选择平台与画面比例'],
            ['5', '进阶设置', '时长、语言与帧率'],
            ['6', '确认创建', '检查信息并创建项目'],
          ].map(([number, label, hint], index) => (
            <div key={number} className={index < 2 ? 'active' : ''}>
              <b>{number}</b>
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
            </div>
          ))}
        </nav>

        <main className="create-form-panel">
          <section>
            <header>
              <h2>1. 选择创作方式</h2>
              <p>选择最适合你的起点，后续流程仍可自由调整。</p>
            </header>
            <div className="creation-mode-grid">
              {creationModes.map(([value, label, hint, icon]) => (
                <button
                  key={value}
                  className={creationMode === value ? 'selected' : ''}
                  onClick={() => setCreationMode(value)}
                >
                  <i>{icon}</i>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                  {creationMode === value ? <em>✓</em> : null}
                </button>
              ))}
            </div>
          </section>

          <section className="basic-section">
            <header>
              <h2>2. 基本信息</h2>
            </header>
            <label>
              <span>
                项目标题 <em>*</em>
              </span>
              <input
                maxLength={50}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：为什么天空是蓝色的？"
              />
              <small>{title.length}/50</small>
            </label>
            <label>
              <span>项目描述</span>
              <textarea
                maxLength={200}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="简单描述视频内容、目标受众或核心观点（选填）"
              />
              <small>{description.length}/200</small>
            </label>
          </section>

          <section className="video-settings-section">
            <label>
              <span>视频类型</span>
              <select
                value={videoType}
                onChange={(event) => setVideoType(event.target.value as VideoType)}
              >
                <option value="science-explainer">科普讲解</option>
                <option value="knowledge-narration">知识口播</option>
                <option value="digital-human">数字人口播</option>
                <option value="product-showcase">产品展示</option>
                <option value="storytelling">故事叙事</option>
              </select>
            </label>
            <div>
              <span>视频平台</span>
              <div className="platform-grid">
                {platforms.map(([value, label, format, icon]) => (
                  <button
                    key={value}
                    className={platform === value ? 'selected' : ''}
                    onClick={() => choosePlatform(value)}
                  >
                    <i>{icon}</i>
                    <strong>{label}</strong>
                    <small>{format}</small>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span>视频比例</span>
              <div className="ratio-grid">
                {ratios.map((item) => (
                  <button
                    key={item[0]}
                    className={ratio[0] === item[0] ? 'selected' : ''}
                    onClick={() => {
                      setRatio(item);
                      setPlatform('custom');
                    }}
                  >
                    <i style={{aspectRatio: `${item[1]}/${item[2]}`}} />
                    <strong>{item[0]}</strong>
                    <small>
                      {item[1]} × {item[2]}
                    </small>
                  </button>
                ))}
              </div>
            </div>
            <div className="advanced-row">
              <label>
                <span>预计时长</span>
                <select
                  value={durationTarget}
                  onChange={(event) => setDurationTarget(Number(event.target.value))}
                >
                  <option value={30}>30 秒左右</option>
                  <option value={60}>60 秒左右</option>
                  <option value={90}>90 秒左右</option>
                  <option value={180}>3 分钟左右</option>
                </select>
              </label>
              <label>
                <span>视频语言</span>
                <select disabled>
                  <option>中文（简体）</option>
                </select>
              </label>
              <label>
                <span>每秒帧数</span>
                <select value={fps} onChange={(event) => setFps(Number(event.target.value))}>
                  <option value={24}>24 FPS</option>
                  <option value={30}>30 FPS（推荐）</option>
                  <option value={60}>60 FPS</option>
                </select>
              </label>
            </div>
            <label className="auto-continue">
              <input
                type="checkbox"
                checked={autoContinue}
                onChange={(event) => setAutoContinue(event.target.checked)}
              />{' '}
              创建后自动进入内容编辑流程
            </label>
          </section>
        </main>

        <aside className="create-summary">
          <section>
            <h3>预览效果</h3>
            <div className="project-preview" style={previewStyle}>
              <div>
                <span>CutFlow</span>
                <strong>{title || '你的新视频标题'}</strong>
                <small>{description || '从一个好点子开始创作'}</small>
              </div>
            </div>
          </section>
          <section>
            <h3>项目概览</h3>
            <dl>
              <div>
                <dt>创作方式</dt>
                <dd>{creationModes.find((item) => item[0] === creationMode)?.[1]}</dd>
              </div>
              <div>
                <dt>视频比例</dt>
                <dd>
                  {ratio[0]}（{ratio[1]} × {ratio[2]}）
                </dd>
              </div>
              <div>
                <dt>预计时长</dt>
                <dd>{durationTarget} 秒左右</dd>
              </div>
              <div>
                <dt>语言</dt>
                <dd>中文（简体）</dd>
              </div>
              <div>
                <dt>帧率</dt>
                <dd>{fps} FPS</dd>
              </div>
              <div>
                <dt>平台</dt>
                <dd>{platforms.find((item) => item[0] === platform)?.[1]}</dd>
              </div>
            </dl>
          </section>
          {error ? <p className="create-error">{error}</p> : null}
          <button
            className="create-submit"
            disabled={busy || !title.trim()}
            onClick={() => void create()}
          >
            {busy ? '正在创建…' : autoContinue ? '创建并进入内容 →' : '创建项目'}
          </button>
        </aside>
      </div>
    </section>
  );
};
