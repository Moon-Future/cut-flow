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
    tone: string;
    platformLabel?: string;
    audience: string;
    purpose: string;
    coreViewpoint: string;
    sourceMaterial: string;
    visualStyle: string;
    aspectRatio: string;
    durationTarget?: number;
  };
};

const defaultPrompt = '';
const recommendedWordsForDuration = (seconds = 60) =>
  Math.max(100, Math.min(5000, Math.round(seconds * 5)));

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
    Array<{
      id: 'openai' | 'deepseek' | 'doubao';
      name: string;
      enabled: boolean;
      configured: boolean;
    }>
  >([
    {id: 'openai', name: 'OpenAI', enabled: false, configured: false},
    {id: 'deepseek', name: 'DeepSeek', enabled: false, configured: false},
    {id: 'doubao', name: '豆包', enabled: false, configured: false},
  ]);
  const [targetWordCount, setTargetWordCount] = useState(() =>
    String(recommendedWordsForDuration(generationContext?.durationTarget)),
  );
  const [videoType, setVideoType] = useState<VideoType>(initialVideoType);
  const [referenceText, setReferenceText] = useState('');
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
          const providers = (Object.keys(names) as Array<keyof typeof names>).map((id) => ({
            id,
            name: names[id],
            enabled: Boolean(value.providers[id]?.enabled),
            configured: Boolean(value.providers[id]?.configured),
          }));
          setAvailableProviders(providers);
          if (
            providers.some(
              (item) =>
                item.id === value.activeProvider && item.enabled && item.configured,
            )
          ) {
            setProvider(value.activeProvider);
          }
        },
      )
      .catch(() => undefined);
  }, []);

  const generate = async () => {
    const effectiveTopic = generationContext?.topic ?? topic;
    const effectiveVideoType = generationContext?.videoType ?? videoType;
    const effectiveWordCount = Math.max(
      100,
      Math.min(
        5000,
        Number(targetWordCount) ||
          recommendedWordsForDuration(generationContext?.durationTarget),
      ),
    );
    setTargetWordCount(String(effectiveWordCount));
    setStatus('running');
    setMessage('正在生成文案…');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          topic: effectiveTopic,
          referenceText,
          customPrompt,
          provider,
          targetWordCount: effectiveWordCount,
          durationTarget: generationContext?.durationTarget,
          videoType: effectiveVideoType,
          audience: generationContext?.audience ?? '短视频平台的普通观众',
          purpose: generationContext?.purpose ?? '科普与引发讨论',
          coreViewpoint: generationContext?.coreViewpoint ?? effectiveTopic,
          sourceMaterial: generationContext?.sourceMaterial ?? '',
          visualStyle: generationContext?.visualStyle ?? '电影级写实',
          aspectRatio: generationContext?.aspectRatio ?? '9:16',
          tone: generationContext?.tone ?? '清晰、有画面感、节奏紧凑',
          forceRegenerate: status === 'success',
        }),
      });
      const value = (await response.json()) as {
        project?: ProjectFile;
        cacheHit?: boolean;
        debugPrompt?: {system: string; user: string};
        error?: string;
      };
      if (value.debugPrompt) {
        console.groupCollapsed(`[CutFlow AI] 最终 Prompt · ${provider}`);
        console.log('System Prompt:\n', value.debugPrompt.system);
        console.log('User Prompt:\n', value.debugPrompt.user);
        console.groupEnd();
      }
      if (!response.ok || !value.project) throw new Error(value.error ?? '生成失败');
      onGenerated(value.project);
      setStatus('success');
      const providerName =
        provider === 'mock'
          ? '本地演示'
          : provider === 'openai'
            ? 'OpenAI'
            : provider === 'deepseek'
              ? 'DeepSeek'
              : '豆包';
      const actualWordCount = value.project.scenes.reduce(
        (sum, scene) => sum + scene.narration.length,
        0,
      );
      setMessage(
        `${providerName} 文案生成完成：目标 ${effectiveWordCount} 字，实际 ${actualWordCount} 字${
          value.cacheHit ? '（使用本地缓存）' : ''
        }。可继续编辑或再次生成；字幕和音频将在后续步骤单独生成`,
      );
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
          <strong>生成视频文案</strong>
          <small>仅生成可编辑文案，不生成字幕和音频</small>
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
                <em>{generationContext.tone}</em>
                <em>{generationContext.purpose}</em>
                {generationContext.platformLabel ? <em>{generationContext.platformLabel}</em> : null}
              </div>
              <small>如需修改主题、类型或语气，请在左侧“内容设定”中调整。</small>
            </div>
          ) : (
            <label>
              <span>视频标题 / 主题</span>
              <textarea rows={3} value={topic} onChange={(event) => setTopic(event.target.value)} />
            </label>
          )}
          <label>
            <span>参考原文（可选）</span>
            <textarea
              className="prompt-input"
              rows={8}
              value={referenceText}
              onChange={(event) => setReferenceText(event.target.value)}
              placeholder="粘贴已有文案、文章或口播稿。填写后，AI 会保留原文事实与核心观点，重点优化钩子、结构、节奏和口语表达。"
            />
            <small className="word-count-help">留空则从主题开始创作；有内容时按原文优化改写。</small>
          </label>
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
          <label>
            <span>目标字数</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={targetWordCount}
              onChange={(event) => setTargetWordCount(event.target.value.replace(/[^\d]/g, ''))}
              onBlur={() =>
                setTargetWordCount(
                  String(
                    Math.max(
                      100,
                      Math.min(
                        5000,
                        Number(targetWordCount) ||
                          recommendedWordsForDuration(generationContext?.durationTarget),
                      ),
                    ),
                  ),
                )
              }
            />
            <small className="word-count-help">
              按 {generationContext?.durationTarget ?? 60} 秒推荐约{' '}
              {recommendedWordsForDuration(generationContext?.durationTarget)} 字，可自行调整
            </small>
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
                <option
                  value={item.id}
                  key={item.id}
                  disabled={!item.enabled || !item.configured}
                >
                  {item.name}
                  {!item.configured ? '（未配置）' : !item.enabled ? '（未启用）' : ' 正式生成'}
                </option>
              ))}
            </select>
          </label>
          {availableProviders.every((item) => !item.enabled || !item.configured) ? (
            <p className="ai-config-hint">尚无可用 AI，请先到左下角“设置”中配置并启用服务。</p>
          ) : null}
          <button
            className="generate-button"
            disabled={
              status === 'running' ||
              !(generationContext?.topic ?? topic).trim() ||
              !targetWordCount ||
              Number(targetWordCount) < 100 ||
              Number(targetWordCount) > 5000
            }
            onClick={() => void generate()}
          >
            {status === 'running'
              ? '正在生成文案…'
              : status === 'success'
                ? '再次生成'
                : '按提示词生成'}
          </button>
          {message ? <p className={`generation-message ${status}`}>{message}</p> : null}
          <small className="provider-note">
            只有点击按钮才会调用 AI。每次结果都会保留为历史版本；本地演示模式不会消耗 Token。
          </small>
        </div>
      ) : null}
    </section>
  );
};
