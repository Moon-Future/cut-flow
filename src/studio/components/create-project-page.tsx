import {useMemo, useState} from 'react';
import type {VideoType} from '../../core/schema';

type Props = {
  onOpen: (projectId: string, startInContent: boolean) => Promise<void>;
  onClose: () => void;
};
type CreationMode = 'ai-generate' | 'import-copy' | 'import-script' | 'blank';
type Platform = 'douyin' | 'xiaohongshu' | 'wechat-video' | 'bilibili' | 'youtube' | 'custom';

const steps = [
  ['选择创作方式', '选择如何开始项目'],
  ['基本信息', '设置标题与描述'],
  ['内容输入', '提供主题、文案或脚本'],
  ['视频风格', '选择类型、平台与比例'],
  ['进阶设置', '设置时长、语言与帧率'],
  ['确认创建', '检查信息并创建项目'],
] as const;
const creationModes: Array<[CreationMode, string, string, string]> = [
  ['ai-generate', 'AI 智能生成', '输入主题，由 AI 生成文案、分镜和素材建议', '⌘'],
  ['import-copy', '导入文案', '粘贴已有口播文案，继续生成镜头', '▤'],
  ['import-script', '导入脚本', '粘贴专业脚本，按结构拆分分镜', '▥'],
  ['blank', '空白项目', '创建空白时间线，从零自由制作', '□'],
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
  const [step, setStep] = useState(0);
  const [creationMode, setCreationMode] = useState<CreationMode>('ai-generate');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [keywords, setKeywords] = useState('');
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [ratio, setRatio] = useState<(typeof ratios)[number]>(ratios[0]);
  const [durationTarget, setDurationTarget] = useState(60);
  const [fps, setFps] = useState(30);
  const [videoType, setVideoType] = useState<VideoType>('science-explainer');
  const [tone, setTone] = useState('自然清晰');
  const [captionStyle, setCaptionStyle] = useState('粗体描边');
  const [autoContinue, setAutoContinue] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previewStyle = useMemo(
    () => ({aspectRatio: `${ratio[1]} / ${ratio[2]}`, maxHeight: ratio[1] < ratio[2] ? 360 : 230}),
    [ratio],
  );
  const canContinue = step === 1 ? Boolean(title.trim()) : true;
  const inputTitle =
    creationMode === 'ai-generate'
      ? '输入视频主题'
      : creationMode === 'import-copy'
        ? '粘贴完整文案'
        : creationMode === 'import-script'
          ? '粘贴脚本内容'
          : '空白项目说明';

  const choosePlatform = (value: Platform) => {
    setPlatform(value);
    if (value !== 'custom') setRatio(platformDefaults[value]);
  };
  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const topic = sourceText.trim().split('\n')[0]?.slice(0, 120) || title;
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          title,
          topic,
          description,
          sourceText,
          keywords,
          creationMode,
          platform,
          width: ratio[1],
          height: ratio[2],
          fps,
          durationTarget,
          videoType,
          tone,
          captionStyle,
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
        <div className="create-heading-actions">
          <button className="back" onClick={onClose}>
            ← 返回项目概览
          </button>
          <button className="close" onClick={onClose} aria-label="关闭新建项目页面">
            ×
          </button>
        </div>
      </header>
      <div className="create-layout">
        <nav className="create-steps">
          {steps.map(([label, hint], index) => (
            <button
              key={label}
              className={`${step === index ? 'active' : ''} ${index < step ? 'done' : ''}`}
              onClick={() => setStep(index)}
            >
              <b>{index < step ? '✓' : index + 1}</b>
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
            </button>
          ))}
        </nav>

        <main className="create-form-panel create-wizard-panel">
          {step === 0 ? (
            <section>
              <header>
                <h2>1. 选择创作方式</h2>
                <p>选择最适合你的起点，之后仍可自由修改。</p>
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
          ) : null}

          {step === 1 ? (
            <section className="basic-section">
              <header>
                <h2>2. 基本信息</h2>
                <p>项目标题用于本地管理，描述帮助 AI 理解视频目标。</p>
              </header>
              <label>
                <span>
                  项目标题 <em>*</em>
                </span>
                <input
                  autoFocus
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
                  maxLength={300}
                  rows={6}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="视频内容、目标受众、核心观点或制作要求（选填）"
                />
                <small>{description.length}/300</small>
              </label>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="content-input-section">
              <header>
                <h2>3. {inputTitle}</h2>
                <p>
                  {creationMode === 'ai-generate'
                    ? '写清主题和你想回答的问题，AI 会据此生成文案与分镜。'
                    : creationMode === 'blank'
                      ? '空白项目可以跳过内容输入，也可留下制作备注。'
                      : '保留段落结构粘贴内容，后续会按段落拆分。'}
                </p>
              </header>
              <label>
                <span>{creationMode === 'ai-generate' ? '主题与核心问题' : '内容正文'}</span>
                <textarea
                  autoFocus
                  rows={12}
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  placeholder={
                    creationMode === 'ai-generate'
                      ? '例如：为什么天空是蓝色的？希望用通俗易懂的方式解释瑞利散射。'
                      : '在这里粘贴文案或脚本…'
                  }
                />
              </label>
              <label>
                <span>关键词与限制</span>
                <input
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="例如：科普、真实素材、避免专业术语、60 秒以内"
                />
              </label>
              <div className="content-hints">
                <span>建议包含</span>
                <b>目标受众</b>
                <b>核心观点</b>
                <b>期望节奏</b>
                <b>必须出现的内容</b>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="video-settings-section">
              <header>
                <h2>4. 视频风格</h2>
                <p>选择内容表达方式、发布平台和画面比例。</p>
              </header>
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
              <div className="style-row">
                <label>
                  <span>叙事语气</span>
                  <select value={tone} onChange={(event) => setTone(event.target.value)}>
                    <option>自然清晰</option>
                    <option>轻松幽默</option>
                    <option>专业严谨</option>
                    <option>情绪故事感</option>
                  </select>
                </label>
                <label>
                  <span>字幕风格</span>
                  <select
                    value={captionStyle}
                    onChange={(event) => setCaptionStyle(event.target.value)}
                  >
                    <option>粗体描边</option>
                    <option>简洁白字</option>
                    <option>关键词高亮</option>
                    <option>卡片字幕</option>
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="advanced-settings-step">
              <header>
                <h2>5. 进阶设置</h2>
                <p>这些参数会影响脚本长度、画面流畅度和最终渲染。</p>
              </header>
              <div className="advanced-cards">
                <label>
                  <span>预计视频时长</span>
                  <select
                    value={durationTarget}
                    onChange={(event) => setDurationTarget(Number(event.target.value))}
                  >
                    <option value={30}>30 秒左右</option>
                    <option value={60}>60 秒左右</option>
                    <option value={90}>90 秒左右</option>
                    <option value={180}>3 分钟左右</option>
                    <option value={300}>5 分钟左右</option>
                  </select>
                  <small>AI 会根据时长控制文案字数和镜头数量。</small>
                </label>
                <label>
                  <span>视频语言</span>
                  <select disabled>
                    <option>中文（简体）</option>
                  </select>
                  <small>用于文案、字幕和配音生成。</small>
                </label>
                <label>
                  <span>每秒帧数</span>
                  <select value={fps} onChange={(event) => setFps(Number(event.target.value))}>
                    <option value={24}>24 FPS（电影感）</option>
                    <option value={30}>30 FPS（推荐）</option>
                    <option value={60}>60 FPS（高流畅）</option>
                  </select>
                  <small>短视频默认推荐 30 FPS。</small>
                </label>
              </div>
              <div className="advanced-options">
                <label>
                  <input type="checkbox" defaultChecked /> 自动生成逐词字幕
                </label>
                <label>
                  <input type="checkbox" defaultChecked /> 为每个镜头生成素材建议
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={autoContinue}
                    onChange={(event) => setAutoContinue(event.target.checked)}
                  />{' '}
                  创建后进入内容编辑
                </label>
              </div>
            </section>
          ) : null}

          {step === 5 ? (
            <section className="confirm-create-step">
              <header>
                <h2>6. 确认创建</h2>
                <p>检查下面的信息，创建后仍可以在项目内修改。</p>
              </header>
              <div className="confirm-grid">
                <article>
                  <span>项目标题</span>
                  <strong>{title || '尚未填写'}</strong>
                </article>
                <article>
                  <span>创作方式</span>
                  <strong>{creationModes.find((item) => item[0] === creationMode)?.[1]}</strong>
                </article>
                <article>
                  <span>内容输入</span>
                  <strong>{sourceText ? `${sourceText.length} 个字符` : '未填写'}</strong>
                </article>
                <article>
                  <span>视频风格</span>
                  <strong>
                    {videoType} · {tone}
                  </strong>
                </article>
                <article>
                  <span>画面规格</span>
                  <strong>
                    {ratio[0]} · {ratio[1]}×{ratio[2]} · {fps} FPS
                  </strong>
                </article>
                <article>
                  <span>目标时长</span>
                  <strong>{durationTarget} 秒左右</strong>
                </article>
              </div>
              {error ? <p className="create-error">{error}</p> : null}
            </section>
          ) : null}

          <footer className="wizard-actions">
            <button
              disabled={step === 0}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              ← 上一步
            </button>
            <span>
              第 {step + 1} / {steps.length} 步
            </span>
            {step < 5 ? (
              <button
                className="next"
                disabled={!canContinue}
                onClick={() => setStep((value) => Math.min(5, value + 1))}
              >
                下一步 →
              </button>
            ) : (
              <button
                className="next"
                disabled={busy || !title.trim()}
                onClick={() => void create()}
              >
                {busy ? '正在创建…' : '确认创建项目'}
              </button>
            )}
          </footer>
        </main>

        <aside className="create-summary">
          <section>
            <h3>预览效果</h3>
            <div className="project-preview" style={previewStyle}>
              <div>
                <span>{platforms.find((item) => item[0] === platform)?.[1]}</span>
                <strong>{title || '你的新视频标题'}</strong>
                <small>{description || sourceText.slice(0, 50) || '从一个好点子开始创作'}</small>
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
                <dt>视频类型</dt>
                <dd>{videoType}</dd>
              </div>
              <div>
                <dt>视频比例</dt>
                <dd>
                  {ratio[0]}（{ratio[1]} × {ratio[2]}）
                </dd>
              </div>
              <div>
                <dt>预计时长</dt>
                <dd>{durationTarget} 秒</dd>
              </div>
              <div>
                <dt>叙事语气</dt>
                <dd>{tone}</dd>
              </div>
              <div>
                <dt>帧率</dt>
                <dd>{fps} FPS</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </section>
  );
};
