import {useEffect, useRef, useState} from 'react';
import type {GenerationTask, ProjectFile, VisualShot} from '../../core/schema';
import type {
  PixabayMediaKind,
  PixabaySearchResponse,
  PixabaySearchResult,
} from '../../media/pixabay';
import {
  countVideoPromptCharacters,
  limitVideoPrompt,
  normalizeVideoPromptDuration,
  removeNarrationFromVideoPrompt,
  type VideoTargetDuration,
} from '../../ai/video-generation-prompt';
import {useStudioStore} from '../store';
import type {AssetSelectionTarget} from '../asset-selection';

type Props = {
  project: ProjectFile;
  projectId: string;
  onAssets: (target?: AssetSelectionTarget) => void;
  onGoToAssets: (shotId: string) => void;
};
const mediaUrl = (projectId: string, path: string) => `/${projectId}/${path}`;
const activeGenerationStatuses = new Set<GenerationTask['status']>(['queued', 'running']);
const generationStatusLabel = (status: GenerationTask['status']) =>
  ({
    queued: '已提交，等待处理',
    running: '正在生成',
    'needs-selection': '生成完成，等待选择',
    succeeded: '已选用',
    failed: '生成失败',
    cancelled: '已取消',
  })[status];
const motionPresetLabels: Record<NonNullable<VisualShot['motionPlan']>['preset'], string> = {
  none: '静止画面',
  'slow-zoom-in': '缓慢推近',
  'slow-zoom-out': '缓慢拉远',
  'pan-left': '向左平移',
  'pan-right': '向右平移',
  'pan-up': '向上平移',
  'pan-down': '向下平移',
  'ken-burns-left': '推近并左移',
  'ken-burns-right': '推近并右移',
  'gentle-float': '轻微漂浮',
};
const formatTaskTime = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : '—';
const formatTaskDuration = (startedAt?: string, completedAt?: string, now = Date.now()) => {
  if (!startedAt) return '—';
  const elapsed = Math.max(
    0,
    Math.floor(
      ((completedAt ? new Date(completedAt).getTime() : now) - new Date(startedAt).getTime()) /
        1000,
    ),
  );
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
};
const contentSearchLinks = (query: string) => {
  const encoded = encodeURIComponent(query);
  return [
    ['YouTube', `https://www.youtube.com/results?search_query=${encoded}`],
    ['B站', `https://search.bilibili.com/all?keyword=${encoded}`],
    ['抖音', `https://www.douyin.com/search/${encoded}`],
  ] as const;
};

export const StoryboardWorkspace = ({project, projectId, onAssets, onGoToAssets}: Props) => {
  const {selectedSceneId, selectScene, updateScene, updateVisualShot, syncVisualShot} =
    useStudioStore();
  const [onlineSearch, setOnlineSearch] = useState<{
    shotId: string;
    query: string;
    kind: PixabayMediaKind;
    loading: boolean;
    downloadingId?: string;
    results: PixabaySearchResult[];
    error?: string;
  } | null>(null);
  const [generatingVideoShotId, setGeneratingVideoShotId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const generationRequestLock = useRef(new Set<string>());
  const [videoDefaultDuration, setVideoDefaultDuration] = useState<VideoTargetDuration>('～15s');
  const [videoWatermark, setVideoWatermark] = useState(true);
  const [videoDraft, setVideoDraft] = useState<{
    shotId: string;
    provider: 'volcengine-pippit';
    duration: VideoTargetDuration;
    prompt: string;
  } | null>(null);
  const [videoGenerationError, setVideoGenerationError] = useState<{
    shotId: string;
    message: string;
  } | null>(null);
  const [selectedVideoCandidateId, setSelectedVideoCandidateId] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{
    kind: 'image' | 'video';
    src: string;
    title: string;
  } | null>(null);
  const selected =
    project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0]!;
  const selectedIndex = project.scenes.findIndex((scene) => scene.id === selected.id);
  const updateShot = (shot: VisualShot, patch: Partial<VisualShot>) =>
    updateVisualShot(selected.id, shot.id, patch);
  const applyCandidate = (shot: VisualShot, candidate: VisualShot['candidates'][number]) => {
    updateShot(shot, {
      selectedAsset: candidate.path,
      status: 'ready',
      generationTask:
        shot.generationTask?.status === 'needs-selection'
          ? {...shot.generationTask, status: 'succeeded', completedAt: candidate.createdAt}
          : shot.generationTask,
    });
    updateScene(selected.id, {
      assetPath: candidate.path,
      assetType: candidate.kind,
    });
  };
  const aspectRatio = project.project.width < project.project.height ? '9:16' : '16:9';
  const chineseSceneDescription =
    selected.visualIntent || selected.caption || '围绕当前主题设计的具体可见场景';
  const fallbackImagePromptZh = (shot: VisualShot) => {
    const subject = shot.visualPurpose || chineseSceneDescription;
    return `${aspectRatio} 竖屏电影感画面，围绕“${subject}”设计一个有明确叙事重点的关键帧，画面必须让观众不看文字也能理解本镜头要表达的关系、变化或冲突。前景安排与主题直接相关的核心主体或关键物体，占据画面下方至中央的主要视觉区域，清楚表现材质、纹理、颜色和状态细节；中景安排承担叙事作用的人物、动作或变化过程，人物数量、身份和位置符合真实场景，面部表情、视线方向、手势和身体姿态共同指向本镜头的核心信息；背景完整交代地点、时间和环境，并加入与主题相关的道具，避免无关装饰。采用前景特写与中近景结合的稳定构图，核心主体位于视觉中心或三分线交点，人物和环境形成清晰的前、中、后景层次。定格在动作、情绪或结果最有信息量的一瞬间，突出鲜明对比和真实情绪，但不要夸张成卡通表演。使用符合场景的电影级布光，主体清晰明亮，人物面部保留自然明暗层次，背景适度虚化；色彩统一、真实、高细节，并为后续动作延展保留空间。不要抽象符号，不要无法辨认的界面文字，不要文字、字幕、标志、Logo 和水印。`;
  };
  const fallbackVideoPromptZh = (shot: VisualShot) => {
    const subject = shot.visualPurpose || chineseSceneDescription;
    const duration = Math.max(3, Math.min(8, shot.duration || 5));
    return `${aspectRatio} 竖屏电影感视频，时长约 ${duration} 秒，围绕“${subject}”完成一个有起点、变化和结果的微型镜头叙事。以对应图片作为首帧：前景核心主体、中景人物、背景环境、服装、道具位置、光线方向和色彩完全保持一致。开始 0—1 秒，镜头稳定建立场景，让观众看清主体与人物关系；1—${Math.max(2, duration - 2)} 秒，人物依次完成与旁白直接相关的自然动作，清楚表现视线、手部动作、面部情绪和身体反应，关键物体同步产生符合真实物理规律的变化；最后 1—2 秒，动作停留在最能说明观点、差异或结果的状态。镜头先保持稳定，再缓慢推近核心主体或进行小幅平滑横移，必要时轻微跟随人物动作，不大幅旋转、不突然切换场景。节奏由观察到变化再到强调结果，环境中只加入轻微且合理的动态。保持人物外貌、手指数量、服装颜色、物体结构和空间布局稳定，动作自然连贯，不新增无关人物，不让物体凭空出现或消失。使用真实电影摄影质感、清晰光影和统一色调，不要抽象特效，不要生成无法辨认的界面内容，不要文字、字幕、标志、Logo 和水印。`;
  };
  const motionPlanFor = (shot: VisualShot): NonNullable<VisualShot['motionPlan']> =>
    shot.motionPlan ?? {
      preset: 'slow-zoom-in',
      intensity: 0.35,
      focusStart: shot.visualPurpose,
      focusEnd: '核心细节',
      requiresLayering: false,
      requiresAiVideo: false,
    };

  useEffect(() => {
    fetch('/api/settings/ai')
      .then((response) => response.json())
      .then(
        (value: {
          volcengineVideo?: {
            defaultDuration?: typeof videoDefaultDuration;
            enableWatermark?: boolean;
          };
        }) => {
          if (value.volcengineVideo?.defaultDuration) {
            setVideoDefaultDuration(value.volcengineVideo.defaultDuration);
          }
          if (typeof value.volcengineVideo?.enableWatermark === 'boolean') {
            setVideoWatermark(value.volcengineVideo.enableWatermark);
          }
        },
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const activeShots = project.scenes.flatMap((scene) =>
      (scene.shots ?? [])
        .filter(
          (shot) =>
            shot.generationTask?.provider === 'volcengine-pippit-video' &&
            activeGenerationStatuses.has(shot.generationTask.status),
        )
        .map((shot) => ({sceneId: scene.id, shotId: shot.id})),
    );
    if (!activeShots.length) return;
    const clock = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    const refresh = async () => {
      try {
        const response = await fetch('/api/project');
        if (!response.ok) return;
        const latestProject = (await response.json()) as ProjectFile;
        for (const active of activeShots) {
          const latestShot = latestProject.scenes
            .find((scene) => scene.id === active.sceneId)
            ?.shots?.find((shot) => shot.id === active.shotId);
          if (latestShot) syncVisualShot(active.sceneId, active.shotId, latestShot);
        }
      } catch {
        // 临时查询失败时保留当前状态，下一轮继续查询。
      }
    };
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(clock);
    };
  }, [project.scenes, syncVisualShot]);

  const searchOnline = async (
    shot: VisualShot,
    kind: PixabayMediaKind,
    query = shot.searchQueries[0] || shot.visualPurpose,
  ) => {
    setOnlineSearch({shotId: shot.id, query, kind, loading: true, results: []});
    try {
      const response = await fetch('/api/pixabay/search', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sceneId: selected.id, shotId: shot.id, query, kind}),
      });
      const value = (await response.json()) as PixabaySearchResponse & {error?: string};
      if (!response.ok) throw new Error(value.error ?? '在线素材搜索失败');
      setOnlineSearch({
        shotId: shot.id,
        query: value.query,
        kind: value.kind,
        loading: false,
        results: value.results,
      });
    } catch (error) {
      setOnlineSearch({
        shotId: shot.id,
        query,
        kind,
        loading: false,
        results: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const downloadOnline = async (shot: VisualShot, result: PixabaySearchResult) => {
    if (!onlineSearch) return;
    setOnlineSearch({...onlineSearch, downloadingId: result.id, error: undefined});
    try {
      const response = await fetch('/api/pixabay/download', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sceneId: selected.id,
          shotId: shot.id,
          query: onlineSearch.query,
          result,
        }),
      });
      const value = (await response.json()) as {
        assetPath?: string;
        shot?: VisualShot;
        error?: string;
      };
      if (!response.ok || !value.assetPath || !value.shot) {
        throw new Error(value.error ?? '素材下载失败');
      }
      updateVisualShot(selected.id, shot.id, value.shot);
      updateScene(selected.id, {assetPath: value.assetPath, assetType: result.kind});
      setOnlineSearch({...onlineSearch, downloadingId: undefined});
    } catch (error) {
      setOnlineSearch({
        ...onlineSearch,
        downloadingId: undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const generateVideo = async (shot: VisualShot) => {
    if (
      generationRequestLock.current.has(shot.id) ||
      (shot.generationTask && activeGenerationStatuses.has(shot.generationTask.status))
    ) {
      return;
    }
    generationRequestLock.current.add(shot.id);
    const draft =
      videoDraft?.shotId === shot.id
        ? videoDraft
        : {
            provider: 'volcengine-pippit' as const,
            duration: videoDefaultDuration,
            prompt: normalizeVideoPromptDuration(
              shot.videoPromptZh || shot.videoPrompt || shot.visualPurpose,
              videoDefaultDuration,
            ),
          };
    setGeneratingVideoShotId(shot.id);
    setVideoGenerationError(null);
    try {
      const visualPrompt = removeNarrationFromVideoPrompt(
        draft.prompt,
        selected.narration,
        shot.visualPurpose || selected.visualIntent || selected.caption,
      );
      const response = await fetch('/api/shots/image-to-video', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sceneId: selected.id,
          shotId: shot.id,
          provider: draft.provider,
          duration: draft.duration,
          prompt: limitVideoPrompt(normalizeVideoPromptDuration(visualPrompt, draft.duration)),
        }),
      });
      const value = (await response.json()) as {
        task?: VisualShot['generationTask'];
        error?: string;
      };
      if (!response.ok || !value.task) {
        throw new Error(value.error ?? '视频生成任务创建失败');
      }
      syncVisualShot(selected.id, shot.id, {...shot, generationTask: value.task});
      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5_000));
        const projectResponse = await fetch('/api/project');
        const latestProject = (await projectResponse.json()) as ProjectFile;
        const latestShot = latestProject.scenes
          .find((scene) => scene.id === selected.id)
          ?.shots?.find((item) => item.id === shot.id);
        if (!latestShot) continue;
        syncVisualShot(selected.id, shot.id, latestShot);
        if (
          latestShot.generationTask?.status === 'needs-selection' ||
          latestShot.generationTask?.status === 'failed'
        ) {
          if (latestShot.generationTask.status === 'failed') {
            throw new Error(latestShot.generationTask.error || '视频生成失败');
          }
          return;
        }
      }
      throw new Error('视频仍在生成，可稍后返回本页面查看结果');
    } catch (error) {
      setVideoGenerationError({
        shotId: shot.id,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      generationRequestLock.current.delete(shot.id);
      setGeneratingVideoShotId(null);
    }
  };

  return (
    <section className="storyboard-studio">
      <aside className="board-scene-list stage-panel">
        <header>
          <div>
            <strong>分镜列表</strong>
            <span>{project.scenes.length} 个段落</span>
          </div>
          <button disabled title="请在文案页重新生成脚本与分镜">
            在文案页生成
          </button>
        </header>
        <div>
          {project.scenes.map((scene, index) => (
            <button
              key={scene.id}
              data-scene-navigator={scene.id}
              className={scene.id === selected.id ? 'active' : ''}
              onClick={() => selectScene(scene.id)}
            >
              <i>
                {scene.assetType === 'video' ? (
                  <video src={mediaUrl(projectId, scene.assetPath)} muted />
                ) : (
                  <img src={mediaUrl(projectId, scene.assetPath)} alt="" />
                )}
              </i>
              <span>
                <strong>
                  {String(index + 1).padStart(2, '0')} · {scene.caption}
                </strong>
                <small>
                  {scene.duration.toFixed(1)} 秒 · {scene.visualIntent || '待完善画面意图'}
                </small>
              </span>
              <em>{scene.shots?.length ?? 0}</em>
            </button>
          ))}
        </div>
      </aside>
      <main className="board-editor stage-panel">
        <header>
          <div>
            <strong>
              段落 {String(selectedIndex + 1).padStart(2, '0')} · {selected.caption}
            </strong>
            <span>编辑旁白、画面意图和镜头计划</span>
          </div>
          <button onClick={() => onAssets()}>打开素材库</button>
        </header>
        <div className="storyboard-purpose-note">
          <strong>这里负责设计分镜、准备候选并确认镜头素材</strong>
          <span>
            可以在当前页搜索、生成并选用镜头素材；需要批量整理、替换或移除时，再进入素材页面处理。
          </span>
        </div>
        <div className="board-copy">
          <label>
            <span>旁白文案</span>
            <textarea
              rows={4}
              value={selected.narration}
              onChange={(event) => updateScene(selected.id, {narration: event.target.value})}
            />
          </label>
          <label>
            <span>画面意图</span>
            <textarea
              rows={3}
              value={selected.visualIntent ?? ''}
              onChange={(event) => updateScene(selected.id, {visualIntent: event.target.value})}
            />
          </label>
          {selected.assetType === 'image' ? (
            <label className="image-motion-field">
              <span>图片动画效果</span>
              <select
                value={selected.motion}
                onChange={(event) =>
                  updateScene(selected.id, {
                    motion: event.target.value as ProjectFile['scenes'][number]['motion'],
                  })
                }
              >
                <option value="none">保持静态</option>
                <option value="slow-zoom-in">缓慢推近</option>
                <option value="slow-zoom-out">缓慢拉远</option>
                <option value="pan-left">缓慢向左平移</option>
                <option value="pan-right">缓慢向右平移</option>
                <option value="pan-up">缓慢向上平移</option>
                <option value="pan-down">缓慢向下平移</option>
                <option value="ken-burns-left">电影运镜：推近并左移</option>
                <option value="ken-burns-right">电影运镜：推近并右移</option>
                <option value="gentle-float">轻微漂浮</option>
              </select>
              <small>仅改变镜头运动，不会重新生成图片或消耗 AI Token</small>
            </label>
          ) : null}
        </div>
        <div className="shot-editor-list">
          {(selected.shots ?? []).map((shot, index) => (
            <article key={shot.id}>
              <header>
                <b>镜头 {index + 1}</b>
                <span className={shot.status}>
                  {shot.status === 'ready'
                    ? '素材就绪'
                    : shot.status === 'needs-review'
                      ? '待审核'
                      : '缺少素材'}
                </span>
              </header>
              <label>
                <span>画面内容</span>
                <input
                  value={shot.visualPurpose}
                  onChange={(event) => updateShot(shot, {visualPurpose: event.target.value})}
                />
              </label>
              <div className="form-pair">
                <label>
                  <span>镜头类型</span>
                  <select
                    value={shot.shotType}
                    onChange={(event) =>
                      updateShot(shot, {shotType: event.target.value as VisualShot['shotType']})
                    }
                  >
                    <option value="video">视频画面（来源不限）</option>
                    <option value="image">图片画面（来源不限）</option>
                    <option value="science-animation">科普动画</option>
                    <option value="digital-human">数字人</option>
                  </select>
                </label>
                <label>
                  <span>时长</span>
                  <input
                    type="number"
                    value={shot.duration}
                    onChange={(event) => updateShot(shot, {duration: Number(event.target.value)})}
                  />
                </label>
              </div>
              <label>
                <span>中文主题搜索词（用于内容平台）</span>
                <textarea
                  rows={2}
                  value={
                    shot.searchQueriesZh?.join('\n') ||
                    [shot.visualPurpose || chineseSceneDescription, chineseSceneDescription].join(
                      '\n',
                    )
                  }
                  placeholder="每行一个中文主题，例如：为什么有人觉得香菜像肥皂"
                  onChange={(event) =>
                    updateShot(shot, {
                      searchQueriesZh: event.target.value
                        .split('\n')
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .slice(0, 8),
                    })
                  }
                />
              </label>
              <div className="content-platform-search">
                <div>
                  <strong>搜索相关视频内容</strong>
                  <span>使用上面第一条中文主题词打开平台搜索结果，仅作选题和画面参考</span>
                </div>
                <div>
                  {contentSearchLinks(
                    shot.searchQueriesZh?.[0] ||
                      `${project.content?.topic || project.project.title} ${shot.visualPurpose}`,
                  ).map(([name, href]) => (
                    <a key={name} href={href} target="_blank" rel="noreferrer">
                      搜索{name}
                    </a>
                  ))}
                </div>
              </div>
              <div className="online-material-search">
                <div className="online-material-search-heading">
                  <div>
                    <strong>搜索可下载素材</strong>
                    <span>Pixabay 使用英文场景词，适合寻找可用素材，不用于搜索完整主题</span>
                  </div>
                  <div>
                    <button type="button" onClick={() => void searchOnline(shot, 'image')}>
                      搜索图片
                    </button>
                    <button type="button" onClick={() => void searchOnline(shot, 'video')}>
                      搜索视频
                    </button>
                  </div>
                </div>
                {onlineSearch?.shotId === shot.id ? (
                  <div className="online-material-results">
                    <div className="pixabay-search-row">
                      <input
                        aria-label="在线素材搜索词"
                        value={onlineSearch.query}
                        onChange={(event) =>
                          setOnlineSearch({...onlineSearch, query: event.target.value})
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void searchOnline(shot, onlineSearch.kind, onlineSearch.query);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={onlineSearch.loading || !onlineSearch.query.trim()}
                        onClick={() =>
                          void searchOnline(shot, onlineSearch.kind, onlineSearch.query)
                        }
                      >
                        {onlineSearch.loading ? '搜索中…' : '重新搜索'}
                      </button>
                    </div>
                    {onlineSearch.error ? (
                      <p className="candidate-error">{onlineSearch.error}</p>
                    ) : null}
                    {!onlineSearch.loading && onlineSearch.results.length ? (
                      <div className="pixabay-grid">
                        {onlineSearch.results.map((result) => (
                          <article className="pixabay-card" key={`${result.kind}-${result.id}`}>
                            <button
                              type="button"
                              className="online-preview-button"
                              onClick={() =>
                                setMediaPreview({
                                  kind: result.kind,
                                  src:
                                    result.kind === 'video'
                                      ? result.downloadUrl
                                      : result.previewUrl,
                                  title: `${result.author} 的素材`,
                                })
                              }
                            >
                              <img src={result.previewUrl} alt={`${result.author} 的素材预览`} />
                              <span>{result.kind === 'video' ? '▶ 点击播放' : '点击放大'}</span>
                            </button>
                            <div>
                              <strong>
                                {result.kind === 'image' ? '图片' : '视频'} · {result.width}×
                                {result.height}
                              </strong>
                              <span>{result.author}</span>
                            </div>
                            <div className="pixabay-card-actions">
                              <a href={result.pageUrl} target="_blank" rel="noreferrer">
                                查看来源
                              </a>
                              <button
                                type="button"
                                disabled={Boolean(onlineSearch.downloadingId)}
                                onClick={() => void downloadOnline(shot, result)}
                              >
                                {onlineSearch.downloadingId === result.id
                                  ? '下载中…'
                                  : '下载并使用'}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : !onlineSearch.loading && !onlineSearch.error ? (
                      <div className="pixabay-empty">没有找到素材，请更换英文搜索词</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <details className="shot-motion-panel">
                <summary>
                  <span>
                    <strong>图片动态化</strong>
                    <small>
                      {motionPresetLabels[motionPlanFor(shot).preset]} · 强度{' '}
                      {Math.round(motionPlanFor(shot).intensity * 100)}%
                    </small>
                  </span>
                  <b>
                    {motionPlanFor(shot).requiresAiVideo
                      ? '建议视频'
                      : motionPlanFor(shot).requiresLayering
                        ? '建议分层'
                        : '图片可完成'}
                  </b>
                </summary>
                <div className="shot-motion-content">
                  <div className="shot-motion-controls">
                    <label>
                      <span>动画预设</span>
                      <select
                        value={motionPlanFor(shot).preset}
                        onChange={(event) =>
                          updateShot(shot, {
                            motionPlan: {
                              ...motionPlanFor(shot),
                              preset: event.target.value as NonNullable<
                                VisualShot['motionPlan']
                              >['preset'],
                            },
                          })
                        }
                      >
                        {Object.entries(motionPresetLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>动画强度 · {Math.round(motionPlanFor(shot).intensity * 100)}%</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={motionPlanFor(shot).intensity}
                        onChange={(event) =>
                          updateShot(shot, {
                            motionPlan: {
                              ...motionPlanFor(shot),
                              intensity: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="shot-motion-focus">
                    <label>
                      <span>开始关注</span>
                      <input
                        value={motionPlanFor(shot).focusStart}
                        onChange={(event) =>
                          updateShot(shot, {
                            motionPlan: {...motionPlanFor(shot), focusStart: event.target.value},
                          })
                        }
                      />
                    </label>
                    <span>→</span>
                    <label>
                      <span>结束关注</span>
                      <input
                        value={motionPlanFor(shot).focusEnd}
                        onChange={(event) =>
                          updateShot(shot, {
                            motionPlan: {...motionPlanFor(shot), focusEnd: event.target.value},
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="shot-motion-flags">
                    <button
                      type="button"
                      className={motionPlanFor(shot).requiresLayering ? 'active' : ''}
                      onClick={() =>
                        updateShot(shot, {
                          motionPlan: {
                            ...motionPlanFor(shot),
                            requiresLayering: !motionPlanFor(shot).requiresLayering,
                          },
                        })
                      }
                    >
                      需要分层视差
                    </button>
                    <button
                      type="button"
                      className={motionPlanFor(shot).requiresAiVideo ? 'active warning' : ''}
                      onClick={() =>
                        updateShot(shot, {
                          motionPlan: {
                            ...motionPlanFor(shot),
                            requiresAiVideo: !motionPlanFor(shot).requiresAiVideo,
                          },
                        })
                      }
                    >
                      静态图片无法完成
                    </button>
                  </div>
                  <p>
                    普通推拉和平移不会消耗 AI
                    Token；人物表情变化、转头或复杂操作需要多张图片、分层素材或视频。
                  </p>
                </div>
              </details>
              <details className="prompt-editor">
                <summary>
                  <span>图片生成提示词</span>
                  <small>展开查看或编辑</small>
                </summary>
                <textarea
                  rows={9}
                  value={
                    (shot.imagePromptZh?.trim().length ?? 0) >= 220
                      ? shot.imagePromptZh
                      : fallbackImagePromptZh(shot)
                  }
                  placeholder="描述主体、场景、构图、光线、色彩、景别、风格和画面比例"
                  onChange={(event) => updateShot(shot, {imagePromptZh: event.target.value})}
                />
              </details>
              <details className="prompt-editor">
                <summary>
                  <span>视频生成提示词</span>
                  <small>展开查看或编辑</small>
                </summary>
                <textarea
                  rows={11}
                  value={
                    (shot.videoPromptZh?.trim().length ?? 0) >= 260
                      ? shot.videoPromptZh
                      : fallbackVideoPromptZh(shot)
                  }
                  placeholder="描述初始画面、动作顺序、场景变化、运镜、节奏、时长及一致性"
                  onChange={(event) => updateShot(shot, {videoPromptZh: event.target.value})}
                />
              </details>
              <details className="original-prompts">
                <summary>查看英文原始提示词（实际生成使用）</summary>
                <label>
                  <span>英文素材搜索词</span>
                  <textarea
                    rows={2}
                    value={shot.searchQueries.join('\n')}
                    onChange={(event) =>
                      updateShot(shot, {
                        searchQueries: event.target.value
                          .split('\n')
                          .map((item) => item.trim())
                          .filter(Boolean)
                          .slice(0, 8),
                      })
                    }
                  />
                </label>
                <label>
                  <span>英文图片提示词</span>
                  <textarea
                    rows={5}
                    value={shot.imagePrompt ?? ''}
                    onChange={(event) => updateShot(shot, {imagePrompt: event.target.value})}
                  />
                </label>
                <label>
                  <span>英文视频提示词</span>
                  <textarea
                    rows={7}
                    value={shot.videoPrompt ?? ''}
                    onChange={(event) => updateShot(shot, {videoPrompt: event.target.value})}
                  />
                </label>
              </details>
              <details
                className="video-generation-panel"
                onToggle={(event) => {
                  if (!event.currentTarget.open || videoDraft?.shotId === shot.id) return;
                  setVideoDraft({
                    shotId: shot.id,
                    provider: 'volcengine-pippit',
                    duration: videoDefaultDuration,
                    prompt: normalizeVideoPromptDuration(
                      (shot.videoPromptZh?.trim().length ?? 0) >= 260
                        ? shot.videoPromptZh!
                        : fallbackVideoPromptZh(shot),
                      videoDefaultDuration,
                    ),
                  });
                }}
              >
                <summary>
                  <span>
                    <strong>AI 视频生成</strong>
                    <small>确认模型、时长和最终提示词后手动生成</small>
                  </span>
                  <b>
                    {generatingVideoShotId === shot.id ||
                    (shot.generationTask &&
                      activeGenerationStatuses.has(shot.generationTask.status))
                      ? '生成中'
                      : '展开设置'}
                  </b>
                </summary>
                {videoDraft?.shotId === shot.id ? (
                  <div>
                    <div className="video-generation-options">
                      <label>
                        <span>生成服务</span>
                        <select
                          value={videoDraft.provider}
                          onChange={(event) =>
                            setVideoDraft({
                              ...videoDraft,
                              provider: event.target.value as 'volcengine-pippit',
                            })
                          }
                        >
                          <option value="volcengine-pippit">火山引擎 · 小云雀智能生视频</option>
                        </select>
                      </label>
                      <label>
                        <span>目标时长</span>
                        <select
                          value={videoDraft.duration}
                          onChange={(event) =>
                            setVideoDraft({
                              ...videoDraft,
                              duration: event.target.value as VideoTargetDuration,
                              prompt: normalizeVideoPromptDuration(
                                videoDraft.prompt,
                                event.target.value as VideoTargetDuration,
                              ),
                            })
                          }
                        >
                          <option value="5s">5 秒</option>
                          <option value="10s">10 秒</option>
                          <option value="～15s">约 15 秒</option>
                          <option value="～30s">约 30 秒</option>
                          <option value="40～60s">40～60 秒</option>
                        </select>
                      </label>
                      <label>
                        <span>模型</span>
                        <input value="pippit_iv2v_cvtob" disabled />
                      </label>
                    </div>
                    <label className="final-video-prompt">
                      <span>
                        最终发送给视频模型的提示词
                        <em
                          className={
                            countVideoPromptCharacters(videoDraft.prompt) >= 1900
                              ? 'near-limit'
                              : ''
                          }
                        >
                          {countVideoPromptCharacters(videoDraft.prompt)} / 2000，剩余{' '}
                          {Math.max(0, 2000 - countVideoPromptCharacters(videoDraft.prompt))}
                        </em>
                      </span>
                      <textarea
                        rows={12}
                        value={videoDraft.prompt}
                        onChange={(event) =>
                          setVideoDraft({
                            ...videoDraft,
                            prompt: limitVideoPrompt(event.target.value),
                          })
                        }
                      />
                      <small>
                        字数必须不超过 2000；提示词过长可能导致接口异常或部分指令不生效。
                      </small>
                    </label>
                    <div className="video-generation-footer">
                      <p>
                        {videoWatermark ? '已开启平台明水印' : '未开启平台明水印'}；目标时长仅供
                        Agent
                        匹配；若源视频超长，项目会严格按所选时长截断使用。生成视频不含音乐、配音或人声。
                      </p>
                      <button
                        type="button"
                        disabled={
                          generatingVideoShotId === shot.id ||
                          Boolean(
                            shot.generationTask &&
                            activeGenerationStatuses.has(shot.generationTask.status),
                          ) ||
                          !videoDraft.prompt.trim()
                        }
                        onClick={() => void generateVideo(shot)}
                      >
                        {generatingVideoShotId === shot.id ||
                        (shot.generationTask &&
                          activeGenerationStatuses.has(shot.generationTask.status))
                          ? '正在生成，请勿关闭应用…'
                          : '确认并生成视频'}
                      </button>
                    </div>
                  </div>
                ) : null}
                <section className="generated-video-library">
                  <header>
                    <div>
                      <strong>已生成视频</strong>
                      <span>
                        {shot.candidates.filter((candidate) => candidate.kind === 'video').length}{' '}
                        个结果
                      </span>
                    </div>
                    <small>点击结果查看生成时间、模型和任务状态</small>
                  </header>
                  <div className="generated-video-grid">
                    {[...shot.candidates]
                      .filter((candidate) => candidate.kind === 'video')
                      .reverse()
                      .map((candidate) => (
                        <button
                          type="button"
                          key={candidate.id}
                          className={selectedVideoCandidateId === candidate.id ? 'active' : ''}
                          onClick={() => setSelectedVideoCandidateId(candidate.id)}
                        >
                          <video
                            src={mediaUrl(projectId, candidate.path)}
                            muted
                            preload="metadata"
                          />
                          <span>
                            <strong>{candidate.model}</strong>
                            <small>{formatTaskTime(candidate.createdAt)}</small>
                          </span>
                          {candidate.path === shot.selectedAsset ? <b>已选用</b> : null}
                        </button>
                      ))}
                  </div>
                  {shot.candidates.some(
                    (candidate) =>
                      candidate.kind === 'video' && candidate.id === selectedVideoCandidateId,
                  ) ? (
                    <article className="generated-video-detail">
                      {(() => {
                        const candidate = shot.candidates.find(
                          (item) => item.kind === 'video' && item.id === selectedVideoCandidateId,
                        );
                        if (!candidate) return null;
                        return (
                          <>
                            <video src={mediaUrl(projectId, candidate.path)} controls autoPlay />
                            <dl>
                              <div>
                                <dt>生成时间</dt>
                                <dd>{formatTaskTime(candidate.createdAt)}</dd>
                              </div>
                              <div>
                                <dt>任务状态</dt>
                                <dd>
                                  {candidate.path === shot.selectedAsset ? '已选用' : '生成完成'}
                                </dd>
                              </div>
                              <div>
                                <dt>服务 / 模型</dt>
                                <dd>
                                  {candidate.provider} / {candidate.model}
                                </dd>
                              </div>
                              <div>
                                <dt>视频时长</dt>
                                <dd>{candidate.duration ? `${candidate.duration} 秒` : '—'}</dd>
                              </div>
                            </dl>
                            <p>{candidate.prompt}</p>
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => applyCandidate(shot, candidate)}
                            >
                              {candidate.path === shot.selectedAsset
                                ? '当前已选用'
                                : '选用为当前镜头素材'}
                            </button>
                          </>
                        );
                      })()}
                    </article>
                  ) : shot.candidates.some((candidate) => candidate.kind === 'video') ? (
                    <p className="shot-generation-empty">请选择一个视频查看生成详情</p>
                  ) : (
                    <p className="shot-generation-empty">当前还没有 AI 视频生成结果</p>
                  )}
                </section>
              </details>
              {shot.generationTask?.provider === 'volcengine-pippit-video' ? (
                <details
                  className={`video-generation-status ${activeGenerationStatuses.has(shot.generationTask.status) ? 'active' : ''}`}
                  open={activeGenerationStatuses.has(shot.generationTask.status) ? true : undefined}
                >
                  <summary>
                    <span>
                      <strong>AI 视频生成任务</strong>
                      <small>
                        第 {shot.generationTask.attempt} 次 ·{' '}
                        {generationStatusLabel(shot.generationTask.status)}
                      </small>
                    </span>
                    <b>查看任务状态</b>
                  </summary>
                  {activeGenerationStatuses.has(shot.generationTask.status) ? (
                    <>
                      <i aria-label="视频生成处理中" />
                      <small>生成服务暂不返回精确百分比，页面会每 5 秒自动更新状态。</small>
                    </>
                  ) : null}
                  <dl>
                    <div>
                      <dt>开始时间</dt>
                      <dd>{formatTaskTime(shot.generationTask.startedAt)}</dd>
                    </div>
                    <div>
                      <dt>预计完成</dt>
                      <dd>
                        {formatTaskTime(shot.generationTask.estimatedCompletedAt)}
                        {shot.generationTask.estimatedCompletedAt ? '（估算）' : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>完成时间</dt>
                      <dd>{formatTaskTime(shot.generationTask.completedAt)}</dd>
                    </div>
                    <div>
                      <dt>
                        {activeGenerationStatuses.has(shot.generationTask.status)
                          ? '已用时间'
                          : '总用时'}
                      </dt>
                      <dd>
                        {formatTaskDuration(
                          shot.generationTask.startedAt,
                          shot.generationTask.completedAt,
                          currentTime,
                        )}
                      </dd>
                    </div>
                  </dl>
                  {shot.generationTask.error ? (
                    <p className="candidate-error">{shot.generationTask.error}</p>
                  ) : null}
                </details>
              ) : null}
              <div className="shot-assets">
                <div className="shot-assets-heading">
                  <strong>镜头素材</strong>
                  <span>
                    {shot.selectedAsset
                      ? '当前镜头已有选用素材，可继续更换'
                      : '可以在上方选用生成结果，或前往素材页面查找更多素材'}
                  </span>
                </div>
                <button className="add-shot-asset" onClick={() => onGoToAssets(shot.id)}>
                  打开素材页面选择更多
                </button>
              </div>
              {videoGenerationError?.shotId === shot.id ? (
                <p className="candidate-error">{videoGenerationError.message}</p>
              ) : null}
            </article>
          ))}
          {!selected.shots?.length ? (
            <div className="empty-stage-state">
              <b>▦</b>
              <h3>这个段落还没有视觉镜头</h3>
              <p>重新生成脚本或使用 AI 自动分镜创建镜头计划。</p>
            </div>
          ) : null}
        </div>
      </main>
      <aside className="board-preview">
        <section className="stage-panel">
          <header>
            <strong>段落兜底画面</strong>
            <span>{project.project.width < project.project.height ? '9:16' : '16:9'}</span>
          </header>
          <div className="board-media-preview">
            {selected.assetType === 'video' ? (
              <video src={mediaUrl(projectId, selected.assetPath)} controls />
            ) : (
              <img src={mediaUrl(projectId, selected.assetPath)} alt="" />
            )}
            <strong>{selected.caption}</strong>
          </div>
          <p className="board-preview-note">
            这里显示段落级兜底画面，不代表每个分镜都已选素材；分镜是否就绪请以中间镜头卡片为准。
          </p>
        </section>
        <section className="stage-panel board-stats">
          <header>
            <strong>段落信息</strong>
          </header>
          <dl>
            <div>
              <dt>时长</dt>
              <dd>{selected.duration.toFixed(1)} 秒</dd>
            </div>
            <div>
              <dt>镜头数</dt>
              <dd>{selected.shots?.length ?? 0}</dd>
            </div>
            <div>
              <dt>素材状态</dt>
              <dd>
                {selected.shots?.filter((shot) => shot.status === 'ready').length ?? 0} 已就绪
              </dd>
            </div>
            <div>
              <dt>布局</dt>
              <dd>{selected.layout}</dd>
            </div>
          </dl>
        </section>
      </aside>
      {mediaPreview ? (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={mediaPreview.title}
        >
          <button
            className="media-lightbox-backdrop"
            onClick={() => setMediaPreview(null)}
            aria-label="关闭素材预览"
          />
          <section>
            <header>
              <strong>{mediaPreview.title}</strong>
              <button onClick={() => setMediaPreview(null)} aria-label="关闭素材预览">
                ×
              </button>
            </header>
            {mediaPreview.kind === 'video' ? (
              <video src={mediaPreview.src} controls autoPlay />
            ) : (
              <img src={mediaPreview.src} alt={mediaPreview.title} />
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
};
