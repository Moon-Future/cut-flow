import {useState} from 'react';
import type {ProjectFile} from '../../core/schema';

type Props = {
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
  defaultOpen?: boolean;
  initialTopic?: string;
  prominent?: boolean;
};

export const GenerationPanel = ({
  onGenerated,
  onAudioReady,
  defaultOpen = false,
  initialTopic = '',
  prominent = false,
}: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  const [topic, setTopic] = useState(initialTopic);
  const [provider, setProvider] = useState<'mock' | 'openai'>('mock');
  const [targetDuration, setTargetDuration] = useState(30);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const generate = async () => {
    setStatus('running');
    setMessage('正在生成脚本、配音和词级字幕…');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          topic,
          provider,
          targetDuration,
          audience: '短视频平台的普通观众',
          tone: '清晰、有画面感、节奏紧凑',
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
      setMessage(
        `${provider === 'mock' ? '本地 Mock' : 'OpenAI'} 生成完成${value.cacheHit ? ' · 已复用脚本缓存' : ''}`,
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
          <strong>生成文案与脚本</strong>
          <small>口播文案 · 脚本段落 · 分镜 · 配音</small>
        </div>
        <b>{open ? '−' : '+'}</b>
      </button>
      {open ? (
        <div className="generation-form">
          <label>
            <span>视频主题</span>
            <textarea rows={3} value={topic} onChange={(event) => setTopic(event.target.value)} />
          </label>
          <div className="field-row">
            <label>
              <span>Provider</span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as typeof provider)}
              >
                <option value="mock">本地 Mock</option>
                <option value="openai">OpenAI</option>
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
          <button
            className="generate-button"
            disabled={status === 'running' || !topic.trim()}
            onClick={() => void generate()}
          >
            {status === 'running' ? '正在生成文案、脚本与分镜…' : '生成文案与脚本'}
          </button>
          {message ? <p className={`generation-message ${status}`}>{message}</p> : null}
          <small className="provider-note">
            Mock 模式生成静音占位配音，用于零成本验证完整流程。OpenAI 模式需要本地环境变量。
          </small>
        </div>
      ) : null}
    </section>
  );
};
