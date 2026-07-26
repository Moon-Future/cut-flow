import {useEffect, useMemo, useState} from 'react';
import type {ProjectFile} from '../../core/schema';
import type {TopicRecommendation} from '../../ai/topic-recommendations';
import {useStudioStore} from '../store';
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
  const [recommendedTopics, setRecommendedTopics] = useState<TopicRecommendation[]>([]);
  const [topicStatus, setTopicStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [topicMessage, setTopicMessage] = useState('');
  const {updateContent} = useStudioStore();

  useEffect(() => {
    fetch('/api/projects')
      .then((response) => response.json())
      .then((value: {projects: ProjectSummary[]}) => setProjects(value.projects))
      .catch(() => setProjects([]));
  }, [project]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`cut-flow:topic-recommendations:${currentProjectId}`);
      setRecommendedTopics(saved ? (JSON.parse(saved) as TopicRecommendation[]) : []);
    } catch {
      setRecommendedTopics([]);
    }
  }, [currentProjectId]);

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
      localStorage.setItem(
        `cut-flow:topic-recommendations:${currentProjectId}`,
        JSON.stringify(value.topics),
      );
      setTopicStatus('idle');
      setTopicMessage('已根据当前项目重新生成 10 条推荐');
    } catch (error) {
      setTopicStatus('error');
      setTopicMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const useRecommendedTopic = (item: TopicRecommendation) => {
    updateContent({topic: item.title, description: item.angle});
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

      <section className="topic-recommendations">
        <header>
          <div>
            <strong>推荐视频主题</strong>
            <span>AI 热度判断 · 点击主题即可带入文案配置</span>
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
              <button key={`${item.title}-${index}`} onClick={() => useRecommendedTopic(item)}>
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

    </section>
  );
};
