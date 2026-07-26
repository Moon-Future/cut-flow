import {useEffect, useMemo, useState} from 'react';
import type {ProjectFile} from '../../core/schema';
import type {ProjectSummary} from './project-hub';
import type {WorkspaceSection} from './workspace-sidebar';

type Props = {
  project: ProjectFile;
  currentProjectId: string;
  onNewProject: () => void;
  onOpenProject: (projectId: string) => Promise<void>;
  onNavigate: (section: WorkspaceSection) => void;
};

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${Math.round(seconds % 60)}s`;
};

export const ProjectDashboard = ({
  project,
  currentProjectId,
  onNewProject,
  onOpenProject,
  onNavigate,
}: Props) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId);

  useEffect(() => {
    fetch('/api/projects')
      .then((response) => response.json())
      .then((value: {projects: ProjectSummary[]}) => setProjects(value.projects))
      .catch(() => setProjects([]));
  }, [project]);

  const stats = useMemo(
    () => ({
      projects: projects.length,
      scenes: projects.reduce((sum, item) => sum + item.sceneCount, 0),
      duration: projects.reduce((sum, item) => sum + item.duration, 0),
      assets: projects.reduce((sum, item) => sum + item.assetCount, 0),
    }),
    [projects],
  );
  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';
  const enterProject = async (projectId: string) => {
    await onOpenProject(projectId);
    onNavigate('content');
  };

  return (
    <section className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <h1>{greeting}，继续创作吧 👋</h1>
          <p>所有项目与素材都保存在你的本地工作区。</p>
        </div>
        <button onClick={onNewProject}>＋ 新建项目</button>
      </header>

      <div className="dashboard-stats">
        <article>
          <span>项目总数</span>
          <strong>{stats.projects}</strong>
          <i className="purple">▣</i>
          <small>本地视频项目</small>
        </article>
        <article>
          <span>镜头总数</span>
          <strong>{stats.scenes}</strong>
          <i className="green">▶</i>
          <small>全部脚本段落</small>
        </article>
        <article>
          <span>累计时长</span>
          <strong>{formatDuration(stats.duration)}</strong>
          <i className="orange">◷</i>
          <small>所有项目成片时长</small>
        </article>
        <article>
          <span>素材总数</span>
          <strong>{stats.assets}</strong>
          <i className="blue">▧</i>
          <small>图片与视频素材</small>
        </article>
      </div>

      <section className="recent-projects">
        <header>
          <div>
            <strong>最近项目</strong>
            <span>{projects.length} 个本地项目 · 单击选择，双击进入</span>
          </div>
          <button onClick={onNewProject}>管理项目 →</button>
        </header>
        <div>
          {projects.slice(0, 5).map((item) => (
            <button
              key={item.id}
              className={item.id === selectedProjectId ? 'current' : ''}
              onClick={() => setSelectedProjectId(item.id)}
              onDoubleClick={() => void enterProject(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void enterProject(item.id);
              }}
              title="单击选择项目，双击进入制作空间"
            >
              <div className="recent-cover">
                {item.coverPath ? (
                  <img src={`/${item.id}/${item.coverPath}`} alt="" />
                ) : (
                  <b>{item.title.slice(0, 1)}</b>
                )}
                <span>{formatDuration(item.duration)}</span>
              </div>
              <strong>{item.title}</strong>
              <small>
                {item.width < item.height ? '9:16 竖屏' : '16:9 横屏'} · {item.width}×{item.height}
              </small>
              <em>
                {item.sceneCount} 个镜头 · {new Date(item.updatedAt).toLocaleString('zh-CN')}
              </em>
              <span className="enter-project-tip">双击进入 →</span>
            </button>
          ))}
        </div>
      </section>

      <div className="dashboard-lower">
        <section className="current-project-card">
          <header>
            <div>
              <strong>当前项目</strong>
              <span>继续上次的制作进度</span>
            </div>
            <button onClick={() => onNavigate('edit')}>进入剪辑 →</button>
          </header>
          <h2>{project.project.title}</h2>
          <p>{project.content?.topic || project.project.title}</p>
          <div>
            <button onClick={() => onNavigate('content')}>
              <b>01</b>
              <span>
                视频文案<small>审核口播内容</small>
              </span>
            </button>
            <button onClick={() => onNavigate('storyboard')}>
              <b>02</b>
              <span>
                脚本与分镜<small>完善镜头画面</small>
              </span>
            </button>
            <button onClick={() => onNavigate('edit')}>
              <b>03</b>
              <span>
                剪辑工作台<small>素材与时间线</small>
              </span>
            </button>
          </div>
        </section>
        <section className="quick-start">
          <header>
            <strong>快速开始</strong>
            <span>当前项目</span>
          </header>
          <div>
            <button onClick={() => onNavigate('content')}>
              <i>AI</i>
              <span>生成文案</span>
            </button>
            <button onClick={() => onNavigate('assets')}>
              <i>＋</i>
              <span>导入素材</span>
            </button>
            <button onClick={() => onNavigate('voice')}>
              <i>◉</i>
              <span>生成配音</span>
            </button>
            <button onClick={() => onNavigate('edit')}>
              <i>✂</i>
              <span>继续剪辑</span>
            </button>
          </div>
        </section>
      </div>
    </section>
  );
};
