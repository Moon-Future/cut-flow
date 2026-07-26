import {useEffect, useState} from 'react';
import type {ProjectFile, VideoType} from '../../core/schema';

type Props = {
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
  defaultOpen?: boolean;
  initialTopic?: string;
  prominent?: boolean;
  initialVideoType?: VideoType;
  initialPrompt?: string;
  generationContext?: {
    topic: string;
    videoType: VideoType;
    targetDuration: number;
    tone: string;
    platformLabel?: string;
  };
};

const defaultPrompt =
  '请围绕标题提炼一个鲜明观点：前 3 秒用反常识或问题制造悬念；正文分层解释，每段只讲一个重点；语言口语化、句子简短；结尾总结并给出自然的互动引导。不要虚构数据。';

const videoTypeLabels: Record<VideoType, string> = {
  'science-explainer': '科普讲解',
  'knowledge-narration': '知识口播',
  'digital-human': '数字人口播',
  'product-showcase': '产品展示',
  storytelling: '故事叙事',
};

export const GenerationPanel = ({
  onGenerated,
  onAudioReady,
  defaultOpen = false,
  initialTopic = '',
  prominent = false,
  initialVideoType = 'science-explainer',
  initialPrompt = defaultPrompt,
  generationContext,
}: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  const [topic, setTopic] = useState(initialTopic);
  const [provider, setProvider] = useState<'mock' | 'openai' | 'deepseek' | 'doubao'>('mock');
  const [availableProviders, setAvailableProviders] = useState<
    Array<{id: 'openai' | 'deepseek' | 'doubao'; name: string}>
  >([]);
  const [targetDuration, setTargetDuration] = useState(30);
  const [videoType, setVideoType] = useState<VideoType>(initialVideoType);
  const [customPrompt, setCustomPrompt] = useState(initialPrompt);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings/ai')
      .then((response) => response.json())
      .then(
        (value: {
          activeProvider: 'openai' | 'deepseek' | 'doubao';
          providers: Record<string, {enabled: boolean; configured: boolean; model: string}>;
        }) => {
          const names = {openai: 'OpenAI', deepseek: 'DeepSeek', doubao: '豆包'} as const;
          const configured = (Object.keys(names) as Array<keyof typeof names>)
            .filter((id) => value.providers[id]?.enabled && value.providers[id]?.configured)
            .map((id) => ({id, name: names[id]}));
          setAvailableProviders(configured);
          if (configured.some((item) => item.id === value.activeProvider)) {
            setProvider(value.activeProvider);
          }
        },
      )
      .catch(() => undefined);
  }, []);

  const generate = async () => {
    const effectiveTopic = generationContext?.topic ?? topic;
    const effectiveVideoType = generationContext?.videoType ?? videoType;
    const effectiveDuration = generationContext?.targetDuration ?? targetDuration;
    setStatus('running');
    setMessage('正在生成脚本、配音和词级字幕…');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          topic: effectiveTopic,
          customPrompt,
          provider,
          targetDuration: effectiveDuration,
          videoType: effectiveVideoType,
          audience: '短视频平台的普通观众',
          tone: generationContext?.tone ?? '清晰、有画面感、节奏紧凑',
          forceRegenerate: status === 'success',
        }),
      });
      const value = (await response.json()) as {
        project?: ProjectFile;
        cacheHit?: boolean;
        error?: string;
      };
      if (!response.ok || !value.project) throw new Error(value.error ?? '生成失败');
      onGenerated(value.project);
      onAudioReady();
      setStatus('success');
      setMessage(`${provider === 'mock' ? '本地 Mock' : 'OpenAI'} 生成完成，可继续编辑或再次生成`);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className={`generation-panel ${open ? 'open' : ''} ${prominent ? 'prominent' : ''}`}>
      <button className="generation-toggle" onClick={() => setOpen((value) => !value)}>
        <span>AI</span>
        <div>
          <strong>生成文案与脚本</strong>
          <small>口播文案 · 脚本段落 · 分镜 · 配音</small>
        </div>
        <b>{open ? '−' : '+'}</b>
      </button>
      {open ? (
        <div className="generation-form">
          {generationContext ? (
            <div className="generation-context">
              <span>将按左侧配置生成</span>
              <div>
                <b>{generationContext.topic || '请先填写选题与内容方向'}</b>
                <em>{videoTypeLabels[generationContext.videoType]}</em>
                <em>{generationContext.targetDuration} 秒</em>
                <em>{generationContext.tone}</em>
                {generationContext.platformLabel ? <em>{generationContext.platformLabel}</em> : null}
              </div>
              <small>如需修改主题、类型、时长或语气，请在左侧“内容设定”中调整。</small>
            </div>
          ) : (
            <label>
              <span>视频标题 / 主题</span>
              <textarea rows={3} value={topic} onChange={(event) => setTopic(event.target.value)} />
            </label>
          )}
          <label>
            <span>补充创作要求（可选）</span>
            <textarea
              className="prompt-input"
              rows={6}
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              placeholder="补充文案结构、语气、重点、禁用内容等要求"
            />
          </label>
          {!generationContext ? (
            <div className="field-row">
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
            <label>
              <span>目标时长</span>
              <select
                value={targetDuration}
                onChange={(event) => setTargetDuration(Number(event.target.value))}
              >
                <option value={30}>30 秒</option>
                <option value={45}>45 秒</option>
                <option value={60}>60 秒</option>
              </select>
            </label>
          </div>
          ) : null}
          <label className="provider-field">
            <span>生成方式</span>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as typeof provider)}
            >
              <option value="mock">本地演示（不消耗 Token）</option>
              {availableProviders.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} 正式生成
                </option>
              ))}
            </select>
          </label>
          <button
            className="generate-button"
            disabled={
              status === 'running' ||
              !(generationContext?.topic ?? topic).trim()
            }
            onClick={() => void generate()}
          >
            {status === 'running'
              ? '正在生成文案、脚本与分镜…'
              : status === 'success'
                ? '再次生成'
                : '按提示词生成'}
          </button>
          {message ? <p className={`generation-message ${status}`}>{message}</p> : null}
          <small className="provider-note">
            只有点击按钮才会调用 AI。再次生成会覆盖当前文案，已编辑内容请先确认；Mock 模式不会消耗 Token。
          </small>
        </div>
      ) : null}
    </section>
  );
};
