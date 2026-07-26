import {useEffect, useMemo, useState} from 'react';
import type {ProjectFile} from '../../core/schema';
import type {TopicRecommendation} from '../../ai/topic-recommendations';
import type {ProjectSummary} from './project-hub';
import type {WorkspaceSection} from './workspace-sidebar';

type Props = {
  project: ProjectFile;
  currentProjectId: string;
  onNewProject: () => void;
  onOpenProject: (projectId: string) => Promise<void>;
  onNavigate: (section: WorkspaceSection) => void;
  onAssets: () => void;
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
  onAssets,
}: Props) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId);
  const [recommendedTopics, setRecommendedTopics] = useState<TopicRecommendation[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [topicStatus, setTopicStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [topicMessage, setTopicMessage] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);
  const [projectActionMessage, setProjectActionMessage] = useState('');

  useEffect(() => {
    fetch('/api/projects')
      .then((response) => response.json())
      .then((value: {projects: ProjectSummary[]}) => setProjects(value.projects))
      .catch(() => setProjects([]));
  }, [project]);

  useEffect(() => {
    fetch('/api/topic-recommendations')
      .then((response) => response.json())
      .then((value: {topics?: TopicRecommendation[]}) => setRecommendedTopics(value.topics ?? []))
      .catch(() => setRecommendedTopics([]));
  }, []);

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
  const reloadProjects = () =>
    fetch('/api/projects')
      .then((response) => response.json())
      .then((value: {projects: ProjectSummary[]}) => setProjects(value.projects));
  const importProject = async () => {
    const desktop = (
      window as typeof window & {
        cutFlowDesktop?: {selectProjectFolder?: () => Promise<string | null>};
      }
    ).cutFlowDesktop;
    const sourcePath = desktop?.selectProjectFolder
      ? await desktop.selectProjectFolder()
      : window.prompt('请输入包含 project.json 的项目文件夹绝对路径：');
    if (!sourcePath) return;
    setProjectActionMessage('正在导入项目…');
    const response = await fetch('/api/projects/import', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({sourcePath}),
    });
    const value = (await response.json()) as {id?: string; title?: string; error?: string};
    if (!response.ok || !value.id) {
      setProjectActionMessage(value.error ?? '项目导入失败');
      return;
    }
    await reloadProjects();
    setSelectedProjectId(value.id);
    setProjectActionMessage(`“${value.title}”已导入，可双击进入`);
  };
  const deleteProject = async (mode: 'hide' | 'delete') => {
    if (!projectToDelete) return;
    const response = await fetch(`/api/projects/${projectToDelete.id}`, {
      method: 'DELETE',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mode}),
    });
    const value = (await response.json()) as {error?: string};
    if (!response.ok) {
      setProjectActionMessage(value.error ?? '删除项目失败');
      return;
    }
    const deletedTitle = projectToDelete.title;
    setProjectToDelete(null);
    await reloadProjects();
    setProjectActionMessage(
      mode === 'hide'
        ? `“${deletedTitle}”已从项目列表移除，磁盘内容仍然保留`
        : `“${deletedTitle}”及其文案、素材和缓存已永久删除`,
    );
  };
  const refreshTopics = async () => {
    setTopicStatus('loading');
    setTopicMessage('正在分析选题热度…');
    try {
      const response = await fetch('/api/topic-recommendations', {method: 'POST'});
      const value = (await response.json()) as {
        topics?: TopicRecommendation[];
        error?: string;
      };
      if (!response.ok || !value.topics) throw new Error(value.error ?? '选题推荐失败');
      setRecommendedTopics(value.topics);
      setTopicStatus('idle');
      setTopicMessage('已生成并保存最新的 10 条本地推荐');
    } catch (error) {
      setTopicStatus('error');
      setTopicMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const createFromRecommendedTopic = async (item: TopicRecommendation) => {
    setTopicStatus('loading');
    setTopicMessage('正在创建新项目…');
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        title: item.title,
        topic: item.title,
        description: item.angle,
        creationMode: 'ai-generate',
        videoType: 'science-explainer',
      }),
    });
    const value = (await response.json()) as {id?: string; error?: string};
    if (!response.ok || !value.id) {
      setTopicStatus('error');
      setTopicMessage(value.error ?? '创建项目失败');
      return;
    }
    await onOpenProject(value.id);
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
        <button className="secondary-button" onClick={onAssets}>
          打开素材库
        </button>
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
          <div className="project-management-actions">
            <button onClick={() => void importProject()}>导入项目</button>
            <button onClick={onNewProject}>新建项目</button>
          </div>
        </header>
        <div>
          {projects.slice(0, 5).map((item) => (
            <article className="recent-project-entry" key={item.id}>
              <button
                className={`project-open-button ${item.id === selectedProjectId ? 'current' : ''}`}
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
                  {item.width < item.height ? '9:16 竖屏' : '16:9 横屏'} · {item.width}×
                  {item.height}
                </small>
                <em>
                  {item.sceneCount} 个镜头 · {new Date(item.updatedAt).toLocaleString('zh-CN')}
                </em>
                <span className="enter-project-tip">双击进入 →</span>
              </button>
              <button
                className="delete-project-button"
                onClick={() => setProjectToDelete(item)}
                aria-label={`删除项目 ${item.title}`}
              >
                删除
              </button>
            </article>
          ))}
        </div>
        {projectActionMessage ? (
          <p className="project-action-message">{projectActionMessage}</p>
        ) : null}
      </section>

      <section className="topic-recommendations">
        <header>
          <div>
            <strong>推荐视频主题</strong>
            <span>AI 热度判断 · 单击选择，双击创建项目并进入</span>
          </div>
          <button disabled={topicStatus === 'loading'} onClick={() => void refreshTopics()}>
            {topicStatus === 'loading'
              ? '正在分析…'
              : recommendedTopics.length
                ? '↻ 刷新推荐'
                : '生成 10 条推荐'}
          </button>
        </header>
        {recommendedTopics.length ? (
          <div className="topic-recommendation-list">
            {recommendedTopics.map((item, index) => (
              <button
                key={`${item.title}-${index}`}
                className={selectedTopic === item.title ? 'selected' : ''}
                onClick={() => setSelectedTopic(item.title)}
                onDoubleClick={() => void createFromRecommendedTopic(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createFromRecommendedTopic(item);
                }}
                title="单击选择，双击创建新项目"
              >
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.angle}</small>
                  <em>{item.reason}</em>
                </span>
                <i>{item.category}</i>
                <mark>
                  热度 <b>{Math.round(item.heatScore)}</b>
                </mark>
              </button>
            ))}
          </div>
        ) : (
          <div className="topic-recommendation-empty">
            <b>还没有推荐主题</b>
            <span>点击“生成 10 条推荐”才会调用默认 AI 服务，不会在进入页面时自动消耗 Token。</span>
          </div>
        )}
        {topicMessage ? (
          <p className={topicStatus === 'error' ? 'error' : ''}>{topicMessage}</p>
        ) : null}
        <footer>
          热度分数为 AI 根据当前日期与内容传播潜力作出的估算，不代表抖音等平台的实时官方榜单。
        </footer>
      </section>

      {projectToDelete ? (
        <div className="project-delete-backdrop" role="presentation">
          <section className="project-delete-dialog" role="dialog" aria-modal="true">
            <header>
              <strong>删除项目</strong>
              <button onClick={() => setProjectToDelete(null)}>×</button>
            </header>
            <h3>{projectToDelete.title}</h3>
            <p>请选择删除范围。永久删除后，文案、分镜、素材、音频和缓存都无法恢复。</p>
            <div>
              <button onClick={() => void deleteProject('hide')}>
                <strong>仅从列表移除</strong>
                <small>项目文件夹和全部内容仍保留在磁盘中</small>
              </button>
              <button className="danger" onClick={() => void deleteProject('delete')}>
                <strong>永久删除全部内容</strong>
                <small>删除项目文件夹、文案、素材、音频和缓存</small>
              </button>
            </div>
            <button className="cancel" onClick={() => setProjectToDelete(null)}>
              取消
            </button>
          </section>
        </div>
      ) : null}
    </section>
  );
};
