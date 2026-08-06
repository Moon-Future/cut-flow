import {useEffect, useMemo, useState} from 'react';
import type {ProjectFile} from '../../core/schema';
import type {TopicRecommendation} from '../../ai/topic-recommendations';
import type {FavoriteTopic} from '../../ai/topic-favorites';
import type {ProjectSummary} from './project-hub';
import type {WorkspaceSection} from './workspace-sidebar';

type Props = {
  project: ProjectFile;
  currentProjectId: string;
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

const favoritePageSize = 10;

export const ProjectDashboard = ({
  project,
  currentProjectId,
  onOpenProject,
  onNavigate,
  onAssets,
}: Props) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId);
  const [topicPages, setTopicPages] = useState<TopicRecommendation[][]>([]);
  const [favoriteTopics, setFavoriteTopics] = useState<FavoriteTopic[]>([]);
  const [currentTopicPage, setCurrentTopicPage] = useState(0);
  const [currentFavoritePage, setCurrentFavoritePage] = useState(0);
  const [topicView, setTopicView] = useState<'recommended' | 'favorites'>('recommended');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [topicToInspect, setTopicToInspect] = useState<TopicRecommendation | null>(null);
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

  useEffect(() => {
    fetch('/api/topic-favorites')
      .then((response) => response.json())
      .then((value: {favorites?: FavoriteTopic[]}) => setFavoriteTopics(value.favorites ?? []))
      .catch(() => setFavoriteTopics([]));
  }, []);

  const recommendedTopics = topicPages[currentTopicPage] ?? [];
  const favoritePageCount = Math.ceil(favoriteTopics.length / favoritePageSize);
  const visibleFavoriteTopics = favoriteTopics.slice(
    currentFavoritePage * favoritePageSize,
    (currentFavoritePage + 1) * favoritePageSize,
  );
  const visibleTopics = topicView === 'recommended' ? recommendedTopics : visibleFavoriteTopics;
  const favoriteTitleKeys = useMemo(
    () => new Set(favoriteTopics.map((item) => item.title.trim().toLocaleLowerCase('zh-CN'))),
    [favoriteTopics],
  );
  useEffect(() => {
    setCurrentFavoritePage((page) => Math.min(page, Math.max(0, favoritePageCount - 1)));
  }, [favoritePageCount]);
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
        : {section: 'storyboard' as const, label: '查看分镜与素材', hint: '现有制作资料已准备完成'};
  const selectProject = async (projectId: string) => {
    setSelectedProjectId(projectId);
    setProjectActionMessage('正在切换当前项目…');
    try {
      await onOpenProject(projectId);
      setProjectActionMessage('当前项目已更新');
    } catch (error) {
      setSelectedProjectId(currentProjectId);
      setProjectActionMessage(error instanceof Error ? error.message : String(error));
    }
  };
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
      !window.confirm(
        '将清除当前推荐主题和历史分页，并重新生成第 1 页；已收藏主题会继续保留。是否继续？',
      )
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
  const toggleFavorite = async (item: TopicRecommendation) => {
    const key = item.title.trim().toLocaleLowerCase('zh-CN');
    const favorite = !favoriteTitleKeys.has(key);
    setTopicMessage(favorite ? '正在收藏主题…' : '正在取消收藏…');
    try {
      const response = await fetch('/api/topic-favorites', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({topic: item, favorite}),
      });
      const value = (await response.json()) as {favorites?: FavoriteTopic[]; error?: string};
      if (!response.ok || !value.favorites) throw new Error(value.error ?? '主题收藏失败');
      setFavoriteTopics(value.favorites);
      setTopicStatus('idle');
      setTopicMessage(favorite ? '主题已收藏，重新生成推荐也不会丢失' : '已取消收藏');
    } catch (error) {
      setTopicStatus('error');
      setTopicMessage(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <section className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <h1>{greeting}，来挑一个值得讲的主题吧 👋</h1>
          <p>结合实时热点、临近节日与常青知识，筛选真正适合科普的选题。</p>
        </div>
        <div className="dashboard-heading-actions">
          <button className="secondary-button" onClick={onAssets}>
            打开素材库
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
          </div>
        </header>
        <div>
          {(showAllProjects ? projects : projects.slice(0, 5)).map((item) => (
            <article className="recent-project-entry" key={item.id}>
              <button
                className={`project-open-button ${item.id === selectedProjectId ? 'current' : ''}`}
                onClick={() => void selectProject(item.id)}
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
          <div className="topic-view-heading">
            <div className="topic-view-tabs" role="tablist" aria-label="主题列表">
              <button
                className={topicView === 'recommended' ? 'active' : ''}
                onClick={() => setTopicView('recommended')}
                role="tab"
                aria-selected={topicView === 'recommended'}
              >
                推荐视频主题
              </button>
              <button
                className={topicView === 'favorites' ? 'active' : ''}
                onClick={() => setTopicView('favorites')}
                role="tab"
                aria-selected={topicView === 'favorites'}
              >
                已收藏主题 <b>{favoriteTopics.length}</b>
              </button>
            </div>
            <span>
              {topicView === 'recommended'
                ? `AI 热度判断 · ${topicPages.length ? `共 ${topicPages.length * 10} 条` : '尚未生成'} · 单击选择，双击查看完整推荐详情`
                : `${favoriteTopics.length} 条 · 独立保存，不受重新生成影响 · 双击查看完整详情`}
            </span>
          </div>
          {topicView === 'recommended' ? (
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
          ) : null}
        </header>
        {visibleTopics.length ? (
          <div className="topic-recommendation-list">
            {visibleTopics.map((item, index) => (
              <article
                key={`${item.title}-${index}`}
                className={selectedTopic === item.title ? 'selected' : ''}
                onClick={() => setSelectedTopic(item.title)}
                onDoubleClick={() => setTopicToInspect(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setTopicToInspect(item);
                }}
                role="button"
                tabIndex={0}
                title="单击选择，双击查看详情"
              >
                <b>
                  {String(
                    index +
                      1 +
                      (topicView === 'favorites' ? currentFavoritePage * favoritePageSize : 0),
                  ).padStart(2, '0')}
                </b>
                <span>
                  <strong>{item.title}</strong>
                  {item.trendSource && item.sourceTopic ? (
                    <small className="topic-trend-context">
                      {item.trendSource === 'douyin'
                        ? '抖音热榜'
                        : item.trendSource === 'toutiao'
                          ? '网络热点'
                          : '临近节日节气'}
                      ：{item.sourceTopic}
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
                  ) : item.trendSource === 'festival' ? (
                    <i
                      className="festival-trend"
                      title={`临近节日或节气：${item.sourceTopic ?? ''}`}
                    >
                      节日节气
                    </i>
                  ) : null}
                  <i>{item.category}</i>
                </div>
                <mark>
                  热度 <b>{Math.round(item.heatScore)}</b>
                </mark>
                <button
                  className={`topic-favorite-button ${
                    favoriteTitleKeys.has(item.title.trim().toLocaleLowerCase('zh-CN'))
                      ? 'active'
                      : ''
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggleFavorite(item);
                  }}
                  aria-label={`收藏或取消收藏 ${item.title}`}
                  title="收藏主题"
                >
                  {favoriteTitleKeys.has(item.title.trim().toLocaleLowerCase('zh-CN')) ? '★' : '☆'}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="topic-recommendation-empty">
            <b>{topicView === 'recommended' ? '还没有推荐主题' : '还没有收藏主题'}</b>
            <span>
              {topicView === 'recommended'
                ? '点击“生成 10 条推荐”才会调用默认 AI 服务，不会在进入页面时自动消耗 Token。'
                : '在推荐列表点击星标后，主题会收藏到这里。'}
            </span>
          </div>
        )}
        {(topicView === 'recommended' ? topicPages.length : favoritePageCount) > 1 ? (
          <nav
            className="topic-pagination"
            aria-label={`${topicView === 'recommended' ? '推荐' : '收藏'}主题分页`}
          >
            <button
              disabled={
                (topicView === 'recommended' ? currentTopicPage : currentFavoritePage) === 0
              }
              onClick={() =>
                topicView === 'recommended'
                  ? setCurrentTopicPage((page) => Math.max(0, page - 1))
                  : setCurrentFavoritePage((page) => Math.max(0, page - 1))
              }
            >
              上一页
            </button>
            {Array.from({
              length: topicView === 'recommended' ? topicPages.length : favoritePageCount,
            }).map((_, index) => (
              <button
                className={
                  (topicView === 'recommended' ? currentTopicPage : currentFavoritePage) === index
                    ? 'current'
                    : ''
                }
                key={index}
                onClick={() =>
                  topicView === 'recommended'
                    ? setCurrentTopicPage(index)
                    : setCurrentFavoritePage(index)
                }
                aria-label={`第 ${index + 1} 页`}
              >
                {index + 1}
              </button>
            ))}
            <button
              disabled={
                (topicView === 'recommended' ? currentTopicPage : currentFavoritePage) ===
                (topicView === 'recommended' ? topicPages.length : favoritePageCount) - 1
              }
              onClick={() =>
                topicView === 'recommended'
                  ? setCurrentTopicPage((page) => Math.min(topicPages.length - 1, page + 1))
                  : setCurrentFavoritePage((page) => Math.min(favoritePageCount - 1, page + 1))
              }
            >
              下一页
            </button>
          </nav>
        ) : null}
        {topicMessage ? (
          <p className={topicStatus === 'error' ? 'error' : ''}>{topicMessage}</p>
        ) : null}
        {topicView === 'recommended' ? (
          <footer>
            热度分数为 AI 根据当前日期与内容传播潜力作出的估算，不代表抖音等平台的实时官方榜单。
          </footer>
        ) : null}
      </section>

      {topicToInspect ? (
        <div className="project-delete-backdrop" role="presentation">
          <section
            className="project-delete-dialog topic-detail-dialog"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <strong>推荐主题详情</strong>
              <button onClick={() => setTopicToInspect(null)}>×</button>
            </header>
            <h3>{topicToInspect.title}</h3>
            <div className="topic-detail-meta">
              <span>{topicToInspect.category}</span>
              <span>推荐热度 {Math.round(topicToInspect.heatScore)}</span>
              <span>
                {topicToInspect.trendSource
                  ? topicToInspect.trendSource === 'douyin'
                    ? '抖音热点'
                    : topicToInspect.trendSource === 'toutiao'
                      ? '网络热点'
                      : '节日节气'
                  : '常青选题'}
              </span>
            </div>
            {topicToInspect.sourceTopic ? (
              <article>
                <small>关联热点</small>
                <p>{topicToInspect.sourceTopic}</p>
              </article>
            ) : null}
            <article>
              <small>推荐理由</small>
              <p>{topicToInspect.reason}</p>
            </article>
            <article>
              <small>建议科普角度</small>
              <p>{topicToInspect.angle}</p>
            </article>
            <footer>
              <button onClick={() => setTopicToInspect(null)}>关闭</button>
              <button onClick={() => void toggleFavorite(topicToInspect)}>
                {favoriteTitleKeys.has(topicToInspect.title.trim().toLocaleLowerCase('zh-CN'))
                  ? '取消收藏'
                  : '收藏主题'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

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
