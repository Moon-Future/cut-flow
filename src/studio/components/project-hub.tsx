import {useEffect, useState} from 'react';
import type {VideoType} from '../../core/schema';

export type ProjectSummary = {
  id: string;
  title: string;
  topic: string;
  sceneCount: number;
  duration: number;
  updatedAt: string;
  videoType: VideoType;
};

type Props = {
  onOpen: (projectId: string) => Promise<void>;
  embedded?: boolean;
};

const videoTypeLabels: Record<VideoType, string> = {
  'science-explainer': '科普讲解',
  'knowledge-narration': '知识口播',
  'digital-human': '数字人口播',
  'product-showcase': '产品展示',
  storytelling: '故事叙事',
};

export const ProjectHub = ({onOpen, embedded = false}: Props) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [videoType, setVideoType] = useState<VideoType>('science-explainer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    fetch('/api/projects')
      .then((response) => response.json())
      .then((value: {projects: ProjectSummary[]}) => setProjects(value.projects));

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title, topic, videoType}),
      });
      const value = (await response.json()) as {id?: string; error?: string};
      if (!response.ok || !value.id) throw new Error(value.error ?? '创建项目失败');
      await onOpen(value.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`project-hub ${embedded ? 'embedded' : ''}`}>
      {!embedded ? (
        <header className="hub-header">
          <div className="brand">
            <span className="brand-mark">CF</span>
            <div>
              <strong>Cut Flow</strong>
              <small>AI 视频生产工作台</small>
            </div>
          </div>
          <div>
            <span className="eyebrow">PROJECTS</span>
            <h1>从一个主题，开始一条完整视频</h1>
            <p>选择已有项目继续制作，或创建新项目进入文案、脚本、分镜和素材流程。</p>
          </div>
        </header>
      ) : null}

      <section className="new-project-card">
        <div>
          <span className="eyebrow">NEW PROJECT</span>
          <h2>创建视频项目</h2>
        </div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="项目名称，例如：为什么夕阳是红色？"
        />
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
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="视频主题（可与项目名称不同）"
        />
        <button
          className="primary-button"
          disabled={busy || !(title.trim() || topic.trim())}
          onClick={() => void create()}
        >
          {busy ? '正在创建…' : '创建并开始'}
        </button>
        {error ? <p className="hub-error">{error}</p> : null}
      </section>

      <section className="project-library">
        <div className="section-title">
          <div>
            <span className="eyebrow">YOUR PROJECTS</span>
            <h2>视频项目</h2>
          </div>
          <span>{projects.length} 个项目</span>
        </div>
        <div className="project-grid">
          {projects.map((project) => (
            <button
              className="project-card"
              key={project.id}
              onClick={() => void onOpen(project.id)}
            >
              <div className="project-card-cover">
                <span>{project.title.slice(0, 1)}</span>
                <i>{Math.round(project.duration)}s</i>
              </div>
              <div>
                <strong>{project.title}</strong>
                <p>{project.topic}</p>
                <em className="project-type">{videoTypeLabels[project.videoType]}</em>
                <small>
                  {project.sceneCount} 个段落 ·{' '}
                  {new Date(project.updatedAt).toLocaleString('zh-CN')}
                </small>
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
};
