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
  const [topicPages, setTopicPages] = useState<TopicRecommendation[][]>([]);
  const [currentTopicPage, setCurrentTopicPage] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [topicStatus, setTopicStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [topicMessage, setTopicMessage] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);
  const [projectActionMessage, setProjectActionMessage] = useState('');
  const [showAllProjects, setShowAllProjects] = useState(false);

  useEffect(() => {
    fetch('/api/projects')
      .then((response) => response.json())
      .then((value: {projects: ProjectSummary[]}) => setProjects(value.projects))
      .catch(() => setProjects([]));
  }, [project]);

  useEffect(() => {
    fetch('/api/topic-recommendations')
      .then((response) => response.json())
      .then((value: {pages?: TopicRecommendation[][]}) => {
        const pages = value.pages ?? [];
        setTopicPages(pages);
        setCurrentTopicPage(Math.max(0, pages.length - 1));
      })
      .catch(() => setTopicPages([]));
  }, []);

  const recommendedTopics = topicPages[currentTopicPage] ?? [];
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
  const scriptReady =
    Boolean(project.copyVersions?.length) ||
    project.scenes.some(
      (scene) => scene.narration.trim() && !scene.narration.includes('生成视频脚本'),
    );
  const narrationMode = project.narrationMode ?? (project.narrationAudio ? 'full' : 'segments');
  const voiceReady =
    narrationMode === 'segments'
      ? project.scenes.every((scene) => Boolean(scene.narrationAudio))
      : Boolean(project.narrationAudio);
  const plannedShots = project.scenes.flatMap((scene) => scene.shots ?? []);
  const readyShots = plannedShots.filter(
    (shot) =>
      Boolean(shot.selectedAsset) || (shot.layers?.some((layer) => layer.assetPath) ?? false),
  ).length;
  const visualsReady =
    plannedShots.length > 0
      ? readyShots === plannedShots.length
      : project.scenes.every((scene) => !scene.assetPath.includes('placeholder'));
  const nextAction = !scriptReady
    ? {section: 'content' as const, label: '开始准备主题与脚本', hint: '先确认视频要讲什么'}
    : !voiceReady
      ? {section: 'voice' as const, label: '继续生成配音与字幕', hint: '脚本已经准备好'}
      : !visualsReady
        ? {
            section: 'storyboard' as const,
            label: '继续准备分镜素材',
            hint: plannedShots.length
              ? `还有 ${plannedShots.length - readyShots} 个镜头需要画面`
              : '为每段旁白准备画面',
          }
        : {section: 'export' as const, label: '导出剪辑生产包', hint: '内容已经可以交付'};
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
  const refreshTopics = async (mode: 'append' | 'reset') => {
    if (
      mode === 'reset' &&
      topicPages.length > 0 &&
      !window.confirm('将清除当前所有推荐主题和历史分页，并重新生成第 1 页。是否继续？')
    ) {
      return;
    }
    setTopicStatus('loading');
    setTopicMessage(mode === 'reset' ? '正在重新生成全部推荐…' : '正在生成不重复的新一批…');
    try {
      const response = await fetch('/api/topic-recommendations', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({mode}),
      });
      const value = (await response.json()) as {
        pages?: TopicRecommendation[][];
        currentPage?: number;
        error?: string;
      };
      if (!response.ok || !value.pages) throw new Error(value.error ?? '选题推荐失败');
      setTopicPages(value.pages);
      setCurrentTopicPage(value.currentPage ?? Math.max(0, value.pages.length - 1));
      setSelectedTopic('');
      setTopicStatus('idle');
      setTopicMessage(
        mode === 'reset'
          ? '已清除旧推荐并重新生成第 1 页'
          : `已去重生成第 ${value.pages.length} 页`,
      );
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
        <div className="dashboard-heading-actions">
          <button className="secondary-button" onClick={onAssets}>
            打开素材库
          </button>
          <button className="primary-button" onClick={onNewProject}>
            ＋ 新建项目
          </button>
        </div>
      </header>

      <section className="production-next-card">
        <div>
          <small>当前项目</small>
          <h2>{project.project.title}</h2>
          <p>{nextAction.hint}</p>
        </div>
        <ol>
          <li className={scriptReady ? 'done' : 'current'}>
            <b>{scriptReady ? '✓' : '1'}</b>
            <span>主题与脚本</span>
          </li>
          <li className={voiceReady ? 'done' : scriptReady ? 'current' : ''}>
            <b>{voiceReady ? '✓' : '2'}</b>
            <span>配音与字幕</span>
          </li>
          <li className={visualsReady ? 'done' : voiceReady ? 'current' : ''}>
            <b>{visualsReady ? '✓' : '3'}</b>
            <span>
              分镜与素材
              {plannedShots.length ? ` ${readyShots}/${plannedShots.length}` : ''}
            </span>
          </li>
          <li className={scriptReady && voiceReady && visualsReady ? 'current' : ''}>
            <b>4</b>
            <span>导出交付</span>
          </li>
        </ol>
        <button className="primary-button" onClick={() => onNavigate(nextAction.section)}>
          {nextAction.label} →
        </button>
      </section>

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
            {projects.length > 5 ? (
              <button onClick={() => setShowAllProjects((value) => !value)}>
                {showAllProjects ? '收起项目' : `查看全部 ${projects.length} 个`}
              </button>
            ) : null}
            <button onClick={() => void importProject()}>导入项目</button>
            <button onClick={onNewProject}>新建项目</button>
          </div>
        </header>
        <div>
          {(showAllProjects ? projects : projects.slice(0, 5)).map((item) => (
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
            <span>
              AI 热度判断 · {topicPages.length ? `共 ${topicPages.length * 10} 条` : '尚未生成'} ·
              单击选择，双击创建项目并进入
            </span>
          </div>
          <div className="topic-recommendation-actions">
            {topicPages.length ? (
              <button
                className="secondary"
                disabled={topicStatus === 'loading'}
                onClick={() => void refreshTopics('reset')}
              >
                全部重新生成
              </button>
            ) : null}
            <button
              disabled={topicStatus === 'loading'}
              onClick={() => void refreshTopics(topicPages.length ? 'append' : 'reset')}
            >
              {topicStatus === 'loading'
                ? '正在分析…'
                : topicPages.length
                  ? '＋ 生成下一批'
                  : '生成 10 条推荐'}
            </button>
          </div>
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
                  {item.trendSource && item.sourceTopic ? (
                    <small className="topic-trend-context">
                      {item.trendSource === 'douyin' ? '抖音热榜' : '网络热点'}：
                      {item.sourceTopic}
                    </small>
                  ) : null}
                  <small>{item.angle}</small>
                  <em>{item.reason}</em>
                </span>
                <div className="topic-recommendation-tags">
                  {item.trendSource === 'douyin' ? (
                    <i className="douyin-trend" title={`来源热点：${item.sourceTopic ?? ''}`}>
                      抖音热点
                    </i>
                  ) : item.trendSource === 'toutiao' ? (
                    <i className="toutiao-trend" title={`来源热点：${item.sourceTopic ?? ''}`}>
                      网络热点
                    </i>
                  ) : null}
                  <i>{item.category}</i>
                </div>
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
        {topicPages.length > 1 ? (
          <nav className="topic-pagination" aria-label="推荐主题分页">
            <button
              disabled={currentTopicPage === 0}
              onClick={() => setCurrentTopicPage((page) => Math.max(0, page - 1))}
            >
              上一页
            </button>
            {topicPages.map((_, index) => (
              <button
                className={currentTopicPage === index ? 'current' : ''}
                key={index}
                onClick={() => setCurrentTopicPage(index)}
                aria-label={`第 ${index + 1} 页`}
              >
                {index + 1}
              </button>
            ))}
            <button
              disabled={currentTopicPage === topicPages.length - 1}
              onClick={() =>
                setCurrentTopicPage((page) => Math.min(topicPages.length - 1, page + 1))
              }
            >
              下一页
            </button>
          </nav>
        ) : null}
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
