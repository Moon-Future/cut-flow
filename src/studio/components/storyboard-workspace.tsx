import {useEffect, useMemo, useRef, useState} from 'react';
import {Player} from '@remotion/player';
import type {GenerationTask, ProjectFile, VisualLayer, VisualShot} from '../../core/schema';
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
import {buildFallbackVideoPromptZh} from '../../ai/video-prompt-fallback';
import {useStudioStore} from '../store';
import {applyVersusComposition} from '../../templates/shot-compositions';
import {VideoComposition} from '../../remotion/video-composition';

type Props = {
  project: ProjectFile;
  projectId: string;
  onGoToAssets: (shotId: string) => void;
};
type AcquisitionMode = 'reference' | 'download' | 'ai-image' | 'ai-video';
const mediaUrl = (projectId: string, path: string) => `/${projectId}/${path}`;
const videoFilePattern = /\.(mp4|mov|webm|mkv)(?:[?#].*)?$/i;
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

const getShotProgress = (shot: VisualShot) => {
  const selectedCount = new Set(
    [...(shot.selectedAssets ?? []), ...(shot.selectedAsset ? [shot.selectedAsset] : [])],
  ).size;
  const complete = selectedCount > 0;
  return {
    ready: complete ? 1 : 0,
    total: 1,
    complete,
    selectedCount,
    label: complete ? `已选 ${selectedCount} 个素材` : '待选择素材',
  };
};

const getSceneProgress = (scene: ProjectFile['scenes'][number]) => {
  const shots = scene.shots ?? [];
  const ready = shots.filter((shot) => getShotProgress(shot).complete).length;
  return {ready, total: shots.length, complete: shots.length > 0 && ready === shots.length};
};

export const StoryboardWorkspace = ({project, projectId, onGoToAssets}: Props) => {
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
  const [downloadedAssets, setDownloadedAssets] = useState<
    Array<{originalUrl: string; path: string}>
  >([]);
  const [generatingVideoShotId, setGeneratingVideoShotId] = useState<string | null>(null);
  const [videoRequestStartedAt, setVideoRequestStartedAt] = useState<Record<string, string>>({});
  const [generatingImageShotId, setGeneratingImageShotId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const generationRequestLock = useRef(new Set<string>());
  const [videoDefaultDuration, setVideoDefaultDuration] = useState<VideoTargetDuration>('～15s');
  const [videoWatermark, setVideoWatermark] = useState(true);
  const [videoDraft, setVideoDraft] = useState<{
    shotId: string;
    provider: 'volcengine-pippit';
    duration: VideoTargetDuration;
    prompt: string;
    referenceImagePaths: string[];
    referenceImageUrls: Record<string, string>;
  } | null>(null);
  const [videoGenerationError, setVideoGenerationError] = useState<{
    shotId: string;
    message: string;
  } | null>(null);
  const [referenceUploadError, setReferenceUploadError] = useState<{
    shotId: string;
    message: string;
  } | null>(null);
  const [selectedVideoCandidateId, setSelectedVideoCandidateId] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{
    kind: 'image' | 'video';
    src: string;
    title: string;
  } | null>(null);
  const [previewShotId, setPreviewShotId] = useState<string | null>(null);
  const [shotPreviewOpen, setShotPreviewOpen] = useState(false);
  const [acquisitionMode, setAcquisitionMode] = useState<AcquisitionMode>('ai-video');
  const selected =
    project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0]!;
  const selectedIndex = project.scenes.findIndex((scene) => scene.id === selected.id);
  const firstShotId = selected.shots?.[0]?.id ?? null;
  const previewShot =
    selected.shots?.find((shot) => shot.id === previewShotId) ?? selected.shots?.[0];
  const previewDuration = previewShot?.duration ?? selected.duration;
  const previewAssets = previewShot
    ? [
        ...(previewShot.selectedAsset
          ? [{path: previewShot.selectedAsset, role: '主素材'}]
          : []),
        ...(previewShot.selectedAssets ?? []).map((path) => ({path, role: '候选素材'})),
        ...(previewShot.layers ?? [])
          .filter((layer) => Boolean(layer.assetPath))
          .map((layer) => ({
            path: layer.assetPath!,
            role:
              layer.role === 'background'
                ? '背景'
                : layer.position.x < 0.5
                  ? '左侧图层'
                  : '右侧图层',
          })),
      ].filter(
        (asset, index, assets) => assets.findIndex((item) => item.path === asset.path) === index,
      )
    : [];
  const selectedProgress = getSceneProgress(selected);
  const projectProgress = project.scenes.reduce(
    (progress, scene) => {
      const sceneProgress = getSceneProgress(scene);
      return {
        ready: progress.ready + sceneProgress.ready,
        total: progress.total + sceneProgress.total,
      };
    },
    {ready: 0, total: 0},
  );
  const previewProject = useMemo<ProjectFile>(
    () => ({
      ...project,
      narrationAudio: null,
      scenes: [
        {
          ...selected,
          duration: previewDuration,
          shots: previewShot ? [{...previewShot, duration: previewDuration}] : selected.shots,
        },
      ],
    }),
    [previewDuration, previewShot, project, selected],
  );
  const updateShot = (shot: VisualShot, patch: Partial<VisualShot>) =>
    updateVisualShot(selected.id, shot.id, patch);
  const updateLayer = (shot: VisualShot, layerId: string, patch: Partial<VisualLayer>) =>
    updateShot(shot, {
      layers: (shot.layers ?? []).map((layer) =>
        layer.id === layerId ? {...layer, ...patch} : layer,
      ),
    });
  const applyCandidate = (shot: VisualShot, candidate: VisualShot['candidates'][number]) => {
    updateShot(shot, {
      selectedAsset: candidate.path,
      selectedAssets: [...new Set([...(shot.selectedAssets ?? []), candidate.path])],
      layers:
        shot.composition === 'versus'
          ? (shot.layers ?? []).map((layer) =>
              layer.role === 'background' ? {...layer, assetPath: candidate.path} : layer,
            )
          : shot.layers,
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
  const shotHasAsset = (shot: VisualShot, path: string) =>
    shot.selectedAsset === path || Boolean(shot.selectedAssets?.includes(path));
  const removePreviewAsset = (path: string) => {
    if (!previewShot) return;
    const selectedAssets = (previewShot.selectedAssets ?? []).filter((item) => item !== path);
    const selectedAsset =
      previewShot.selectedAsset === path ? (selectedAssets[0] ?? null) : previewShot.selectedAsset;
    updateShot(previewShot, {
      selectedAssets,
      selectedAsset,
      layers: (previewShot.layers ?? []).map((layer) =>
        layer.assetPath === path ? {...layer, assetPath: null} : layer,
      ),
      status: selectedAsset || selectedAssets.length ? 'ready' : 'missing-asset',
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
    return buildFallbackVideoPromptZh({
      aspectRatio,
      subject,
      duration: shot.duration || 5,
    });
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
    setPreviewShotId(firstShotId);
  }, [firstShotId, selected.id]);

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
    if (!activeShots.length && !generatingVideoShotId) return;
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
  }, [generatingVideoShotId, project.scenes, syncVisualShot]);

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
      const downloaded = await fetch('/api/assets/library')
        .then((libraryResponse) => libraryResponse.json())
        .then((library: {assets?: Array<{originalUrl?: string | null; path: string}>}) =>
          (library.assets ?? [])
            .filter(
              (asset): asset is {originalUrl: string; path: string} =>
                Boolean(asset.originalUrl),
            )
            .map((asset) => ({originalUrl: asset.originalUrl, path: asset.path})),
        )
        .catch(() => []);
      setDownloadedAssets(downloaded);
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
        asset?: {originalUrl?: string | null; path: string};
        shot?: VisualShot;
        error?: string;
      };
      if (!response.ok || !value.assetPath || !value.asset || !value.shot) {
        throw new Error(value.error ?? '素材下载失败');
      }
      const assetPath = value.assetPath;
      const downloadedAssetPath = value.asset.path;
      updateVisualShot(selected.id, shot.id, {
        ...value.shot,
        selectedAssets: [...new Set([...(shot.selectedAssets ?? []), assetPath])],
      });
      setDownloadedAssets((current) => [
        ...current.filter((asset) => asset.originalUrl !== result.pageUrl),
        {originalUrl: result.pageUrl, path: downloadedAssetPath},
      ]);
      updateScene(selected.id, {assetPath, assetType: result.kind});
      setOnlineSearch({...onlineSearch, downloadingId: undefined});
    } catch (error) {
      setOnlineSearch({
        ...onlineSearch,
        downloadingId: undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const generateImages = async (shot: VisualShot) => {
    if (generatingImageShotId) return;
    setGeneratingImageShotId(shot.id);
    setVideoGenerationError(null);
    try {
      const response = await fetch('/api/shots/generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sceneId: selected.id,
          shotId: shot.id,
          kind: 'image',
          provider: 'mock',
          count: 3,
        }),
      });
      const value = (await response.json()) as {shot?: VisualShot; error?: string};
      if (!response.ok || !value.shot) {
        throw new Error(value.error ?? '图片生成失败');
      }
      syncVisualShot(selected.id, shot.id, value.shot);
    } catch (error) {
      setVideoGenerationError({
        shotId: shot.id,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setGeneratingImageShotId(null);
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
    setVideoRequestStartedAt((current) => ({
      ...current,
      [shot.id]: new Date().toISOString(),
    }));
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
            referenceImagePaths: [],
            referenceImageUrls: {} as Record<string, string>,
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
          referenceImageUrls: draft.referenceImagePaths.map(
            (path) => draft.referenceImageUrls[path],
          ).filter((url): url is string => Boolean(url)),
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
            <span>
              {project.scenes.length} 个段落 · {projectProgress.ready}/{projectProgress.total}{' '}
              个镜头完成
            </span>
          </div>
          <em className={projectProgress.ready === projectProgress.total ? 'complete' : ''}>
            {projectProgress.total
              ? `${Math.round((projectProgress.ready / projectProgress.total) * 100)}%`
              : '待生成'}
          </em>
        </header>
        <div>
          {project.scenes.map((scene, index) => {
            const progress = getSceneProgress(scene);
            return (
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
                <em className={progress.complete ? 'complete' : progress.ready ? 'partial' : ''}>
                  {!progress.total
                    ? '未生成'
                    : progress.complete
                      ? '已备素材'
                      : progress.ready
                        ? `${progress.ready} 个已备`
                        : '待选素材'}
                </em>
              </button>
            );
          })}
        </div>
      </aside>
      <main className="board-editor stage-panel">
        <header>
          <div>
            <strong>
              素材获取 · 段落 {String(selectedIndex + 1).padStart(2, '0')}
            </strong>
            <span>搜索、下载或生成素材，再添加到当前镜头</span>
          </div>
        </header>
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
          {(selected.shots ?? []).map((shot, index) => {
            const progress = getShotProgress(shot);
            return (
              <article
                key={shot.id}
                className={`${previewShot?.id === shot.id ? 'previewing' : ''} acquisition-mode-${acquisitionMode}`}
              >
                <header>
                  <b>镜头 {index + 1}</b>
                  <span className={progress.complete ? 'ready' : 'missing'}>{progress.label}</span>
                  {previewShot?.id === shot.id ? (
                    <span className="current-shot-indicator">● 当前镜头</span>
                  ) : (
                    <button type="button" onClick={() => setPreviewShotId(shot.id)}>
                      切换到此镜头
                    </button>
                  )}
                </header>
                <div className="shot-primary-actions">
                  <span>
                    <b>{progress.selectedCount}</b>
                    个已选素材
                  </span>
                  <button type="button" onClick={() => onGoToAssets(shot.id)}>
                    {progress.complete ? '更换素材' : '选择缺少的素材'}
                  </button>
                </div>
                <nav className="acquisition-tabs" aria-label="素材获取方式">
                  {(
                    [
                      ['reference', '全网参考'],
                      ['download', '可下载素材'],
                      ['ai-image', 'AI 图片'],
                      ['ai-video', 'AI 视频'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      type="button"
                      key={mode}
                      className={acquisitionMode === mode ? 'active' : ''}
                      onClick={() => setAcquisitionMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <details className="shot-settings-panel">
                  <summary>
                    <span>
                      <strong>镜头基础设置</strong>
                      <small>
                        {shot.shotType === 'image' ? '图片' : '视频'} · {shot.duration} 秒 ·{' '}
                        {shot.composition === 'versus' ? '左右对立' : '单素材'}
                      </small>
                    </span>
                  </summary>
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
                  <details className="layer-composition-panel" open={shot.composition === 'versus'}>
                    <summary>
                      <span>
                        <strong>画面编排</strong>
                        <small>
                          {shot.composition === 'versus'
                            ? `左右对立 · ${shot.layers?.filter((layer) => layer.assetPath).length ?? 0}/3 个素材已就绪`
                            : '单素材镜头'}
                        </small>
                      </span>
                      <b>{shot.composition === 'versus' ? '多图层' : '未启用'}</b>
                    </summary>
                    <div className="layer-composition-content">
                    {shot.composition !== 'versus' ? (
                      <div className="composition-template-card">
                        <div>
                          <strong>左右对立模板</strong>
                          <span>背景 + 左人物 + 右人物，适合观点、喜恶和前后对比。</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateShot(shot, applyVersusComposition(shot))}
                        >
                          应用模板
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="composition-template-card active">
                          <div>
                            <strong>左右对立模板</strong>
                            <span>人物素材建议使用透明背景 PNG。</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateShot(shot, applyVersusComposition(shot))}
                          >
                            重置布局
                          </button>
                        </div>
                        <div className="layer-slot-list">
                          {(shot.layers ?? []).map((layer) => (
                            <label key={layer.id} className="layer-slot">
                              <span>
                                {layer.role === 'background'
                                  ? '背景'
                                  : layer.position.x < 0.5
                                    ? '左侧人物'
                                    : '右侧人物'}
                              </span>
                              <input
                                value={layer.assetPath ?? ''}
                                placeholder="assets/example.png"
                                onChange={(event) =>
                                  updateLayer(shot, layer.id, {
                                    assetPath: event.target.value.trim() || null,
                                  })
                                }
                              />
                              {layer.role === 'background' && shot.selectedAsset ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateLayer(shot, layer.id, {assetPath: shot.selectedAsset})
                                  }
                                >
                                  使用当前素材
                                </button>
                              ) : null}
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="remove-composition-button"
                          onClick={() =>
                            updateShot(shot, {
                              composition: 'single',
                              layers: [],
                              motionPlan: {...motionPlanFor(shot), requiresLayering: false},
                            })
                          }
                        >
                          恢复为单素材镜头
                        </button>
                      </>
                    )}
                    </div>
                  </details>
                </details>
                <label className="acquisition-reference">
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
                <div className="content-platform-search acquisition-reference">
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
                <details className="online-material-search acquisition-download" open>
                  <summary className="online-material-search-heading">
                    <div>
                      <strong>搜索可下载素材</strong>
                      <span>Pixabay 使用英文场景词，适合寻找可用素材，不用于搜索完整主题</span>
                    </div>
                    <div className="online-material-search-actions">
                      <button
                        type="button"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const panel = event.currentTarget.closest('details');
                          if (panel && !panel.open) panel.open = true;
                          void searchOnline(shot, 'image');
                        }}
                      >
                        搜索图片
                      </button>
                      <button
                        type="button"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const panel = event.currentTarget.closest('details');
                          if (panel && !panel.open) panel.open = true;
                          void searchOnline(shot, 'video');
                        }}
                      >
                        搜索视频
                      </button>
                    </div>
                  </summary>
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
                          {onlineSearch.results.map((result) => {
                            const downloadedAsset = downloadedAssets.find(
                              (asset) => asset.originalUrl === result.pageUrl,
                            );
                            const selectedForShot = downloadedAsset
                              ? shotHasAsset(shot, downloadedAsset.path)
                              : false;
                            return (
                              <article
                                className={`pixabay-card ${
                                  downloadedAsset ? 'downloaded' : ''
                                } ${selectedForShot ? 'selected' : ''}`}
                                key={`${result.kind}-${result.id}`}
                              >
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
                                  disabled={Boolean(onlineSearch.downloadingId) || selectedForShot}
                                  onClick={() => void downloadOnline(shot, result)}
                                >
                                  {onlineSearch.downloadingId === result.id
                                    ? '下载中…'
                                    : selectedForShot
                                      ? '已加入当前镜头'
                                      : downloadedAsset
                                      ? '已下载 · 添加到镜头'
                                      : '下载并添加到镜头'}
                                </button>
                              </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : !onlineSearch.loading && !onlineSearch.error ? (
                        <div className="pixabay-empty">没有找到素材，请更换英文搜索词</div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="pixabay-empty">
                      选择“搜索图片”或“搜索视频”，结果会显示在这里。
                    </div>
                  )}
                </details>
                <details className="acquisition-download acquisition-advanced-prompt">
                  <summary>高级：英文素材搜索词</summary>
                  <textarea
                    rows={3}
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
                </details>
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
                <details className="prompt-editor acquisition-ai-image" open>
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
                  <div className="ai-image-actions">
                    <span>生成结果会先进入候选区，确认后才会成为当前镜头素材。</span>
                    <button
                      type="button"
                      disabled={Boolean(generatingImageShotId)}
                      onClick={() => void generateImages(shot)}
                    >
                      {generatingImageShotId === shot.id ? '正在生成…' : '生成 3 张候选图片'}
                    </button>
                  </div>
                  <div className="ai-image-candidates">
                    {shot.candidates
                      .filter((candidate) => candidate.kind === 'image')
                      .map((candidate) => (
                        <article
                          key={candidate.id}
                          className={shotHasAsset(shot, candidate.path) ? 'selected' : ''}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setMediaPreview({
                                kind: 'image',
                                src: mediaUrl(projectId, candidate.path),
                                title: candidate.prompt,
                              })
                            }
                          >
                            <img src={mediaUrl(projectId, candidate.path)} alt="" />
                          </button>
                          <span>{candidate.model}</span>
                          <button
                            type="button"
                            disabled={shotHasAsset(shot, candidate.path)}
                            onClick={() => applyCandidate(shot, candidate)}
                          >
                            {shotHasAsset(shot, candidate.path)
                              ? '已加入当前镜头'
                              : '添加到当前镜头'}
                          </button>
                        </article>
                      ))}
                    {!shot.candidates.some((candidate) => candidate.kind === 'image') ? (
                      <p>还没有图片候选，确认提示词后开始生成。</p>
                    ) : null}
                  </div>
                  <details className="acquisition-advanced-prompt">
                    <summary>高级：英文图片提示词</summary>
                    <textarea
                      rows={5}
                      value={shot.imagePrompt ?? ''}
                      onChange={(event) => updateShot(shot, {imagePrompt: event.target.value})}
                    />
                  </details>
                </details>
                <details className="prompt-editor acquisition-ai-video video-prompt-editor">
                  <summary>
                    <span>视频生成提示词</span>
                    <small>展开查看或编辑</small>
                  </summary>
                  <textarea
                    rows={11}
                    value={
                      Boolean(shot.videoPromptZh?.trim())
                        ? shot.videoPromptZh
                        : fallbackVideoPromptZh(shot)
                    }
                    placeholder="描述初始画面、动作顺序、场景变化、运镜、节奏、时长及一致性"
                    onChange={(event) => updateShot(shot, {videoPromptZh: event.target.value})}
                  />
                </details>
                <details className="original-prompts acquisition-ai-video">
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
                  className="video-generation-panel acquisition-ai-video"
                  open
                  onToggle={(event) => {
                    if (!event.currentTarget.open || videoDraft?.shotId === shot.id) return;
                    setVideoDraft({
                      shotId: shot.id,
                      provider: 'volcengine-pippit',
                      duration: videoDefaultDuration,
                      prompt: normalizeVideoPromptDuration(
                        Boolean(shot.videoPromptZh?.trim())
                          ? shot.videoPromptZh!
                          : fallbackVideoPromptZh(shot),
                        videoDefaultDuration,
                      ),
                      referenceImagePaths: [],
                      referenceImageUrls: {} as Record<string, string>,
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
                      <section className="video-reference-images">
                        <header>
                          <span>参考图片</span>
                          <small>从电脑选择图片，上传七牛云后将 CDN URL 传给小云雀</small>
                        </header>
                        <label className="reference-image-upload">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(event) => {
                              const files = Array.from(event.target.files ?? []);
                              setReferenceUploadError(null);
                              for (const file of files) {
                                const referenceId = `${file.name}-${file.size}-${file.lastModified}`;
                                setVideoDraft((current) =>
                                  current?.shotId === shot.id
                                    ? {
                                        ...current,
                                        referenceImagePaths: [
                                          ...new Set([...current.referenceImagePaths, referenceId]),
                                        ],
                                      }
                                    : current,
                                );
                                void fetch('/api/assets/qiniu-reference', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': file.type,
                                    'X-File-Name': encodeURIComponent(file.name),
                                  },
                                  body: file,
                                })
                                  .then(async (response) => {
                                    const value = (await response.json()) as {
                                      url?: string;
                                      error?: string;
                                    };
                                    if (!response.ok || !value.url) {
                                      throw new Error(value.error ?? '参考图片上传失败');
                                    }
                                    setVideoDraft((current) =>
                                      current?.shotId === shot.id
                                        ? {
                                            ...current,
                                            referenceImageUrls: {
                                              ...current.referenceImageUrls,
                                              [referenceId]: value.url!,
                                            },
                                          }
                                        : current,
                                    );
                                  })
                                  .catch((error: unknown) => {
                                    setVideoDraft((current) =>
                                      current?.shotId === shot.id
                                        ? {
                                            ...current,
                                            referenceImagePaths:
                                              current.referenceImagePaths.filter(
                                                (item) => item !== referenceId,
                                              ),
                                          }
                                        : current,
                                    );
                                    setReferenceUploadError({
                                      shotId: shot.id,
                                      message:
                                        error instanceof Error ? error.message : String(error),
                                    });
                                  });
                              }
                              event.target.value = '';
                            }}
                          />
                          <span>选择并上传图片</span>
                        </label>
                        {videoDraft.referenceImagePaths.map((referenceId) => (
                          <div className="reference-image-result" key={referenceId}>
                            {videoDraft.referenceImageUrls[referenceId] ? (
                              <button
                                type="button"
                                className="reference-image-preview"
                                title="查看大图"
                                onClick={() =>
                                  setMediaPreview({
                                    kind: 'image',
                                    src: videoDraft.referenceImageUrls[referenceId]!,
                                    title: referenceId.split('-').slice(0, -2).join('-'),
                                  })
                                }
                              >
                                <img
                                  src={videoDraft.referenceImageUrls[referenceId]}
                                  alt={referenceId.split('-').slice(0, -2).join('-')}
                                />
                              </button>
                            ) : (
                              <span className="reference-image-loading">上传中</span>
                            )}
                            <span>{referenceId.split('-').slice(0, -2).join('-')}</span>
                            <small>
                              {videoDraft.referenceImageUrls[referenceId]
                                ? `已上传 · ${videoDraft.referenceImageUrls[referenceId]}`
                                : '正在上传七牛云…'}
                            </small>
                            <button
                              type="button"
                              onClick={() => {
                                const nextUrls = {...videoDraft.referenceImageUrls};
                                delete nextUrls[referenceId];
                                setVideoDraft({
                                  ...videoDraft,
                                  referenceImagePaths: videoDraft.referenceImagePaths.filter(
                                    (item) => item !== referenceId,
                                  ),
                                  referenceImageUrls: nextUrls,
                                });
                              }}
                            >
                              移除
                            </button>
                          </div>
                        ))}
                        {referenceUploadError?.shotId === shot.id ? (
                          <p className="reference-upload-error">
                            {referenceUploadError.message}
                          </p>
                        ) : null}
                      </section>
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
                      {generatingVideoShotId === shot.id || shot.generationTask ? (
                        <section
                          className={`current-video-task ${
                            shot.generationTask &&
                            activeGenerationStatuses.has(shot.generationTask.status)
                              ? 'active'
                              : ''
                          }`}
                        >
                          <header>
                            <strong>当前任务</strong>
                            <span>
                              {generatingVideoShotId === shot.id && !shot.generationTask
                                ? '正在提交'
                                : shot.generationTask
                                  ? generationStatusLabel(shot.generationTask.status)
                                  : '等待任务状态'}
                            </span>
                          </header>
                          <dl>
                            <div>
                              <dt>开始时间</dt>
                              <dd>
                                {formatTaskTime(
                                  shot.generationTask?.startedAt ??
                                    videoRequestStartedAt[shot.id],
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>已经用时</dt>
                              <dd>
                                {formatTaskDuration(
                                  shot.generationTask?.startedAt ??
                                    videoRequestStartedAt[shot.id],
                                  shot.generationTask?.completedAt,
                                  currentTime,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>任务编号</dt>
                              <dd>{shot.generationTask?.id ?? '提交后生成'}</dd>
                            </div>
                            <div>
                              <dt>模型</dt>
                              <dd>{shot.generationTask?.model ?? 'pippit_iv2v_cvtob'}</dd>
                            </div>
                          </dl>
                          {shot.generationTask?.status === 'failed' &&
                          shot.generationTask.error ? (
                            <div className="current-video-task-error">
                              <strong>失败详情</strong>
                              <pre>{shot.generationTask.error}</pre>
                              {shot.generationTask.error.match(
                                /Request\s*ID[：:]\s*([A-Za-z0-9_-]+)/iu,
                              )?.[1] ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void navigator.clipboard.writeText(
                                      shot.generationTask!.error!.match(
                                        /Request\s*ID[：:]\s*([A-Za-z0-9_-]+)/iu,
                                      )?.[1] ?? '',
                                    )
                                  }
                                >
                                  复制 Request ID
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </section>
                      ) : null}
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
                            || videoDraft.referenceImagePaths.some(
                              (path) => !videoDraft.referenceImageUrls[path],
                            )
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
                            className={`${selectedVideoCandidateId === candidate.id ? 'active' : ''} ${
                              shotHasAsset(shot, candidate.path) ? 'selected' : ''
                            }`}
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
                            {shotHasAsset(shot, candidate.path) ? <b>已加入镜头</b> : null}
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
                          const latestVideoCandidate = [...shot.candidates]
                            .filter((item) => item.kind === 'video')
                            .sort(
                              (left, right) =>
                                new Date(right.createdAt).getTime() -
                                new Date(left.createdAt).getTime(),
                            )[0];
                          const fallbackTask =
                            candidate.id === latestVideoCandidate?.id ? shot.generationTask : null;
                          const taskStatus = candidate.taskStatus ?? fallbackTask?.status;
                          const taskStartedAt = candidate.taskStartedAt ?? fallbackTask?.startedAt;
                          const taskCompletedAt =
                            candidate.taskCompletedAt ?? fallbackTask?.completedAt;
                          return (
                            <>
                              <video src={mediaUrl(projectId, candidate.path)} controls />
                              <dl>
                                <div>
                                  <dt>开始时间</dt>
                                  <dd>{formatTaskTime(taskStartedAt ?? candidate.createdAt)}</dd>
                                </div>
                                <div>
                                  <dt>完成时间</dt>
                                  <dd>{formatTaskTime(taskCompletedAt ?? candidate.createdAt)}</dd>
                                </div>
                                <div>
                                  <dt>生成用时</dt>
                                  <dd>
                                    {formatTaskDuration(
                                      taskStartedAt ?? candidate.createdAt,
                                      taskCompletedAt ?? candidate.createdAt,
                                      currentTime,
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt>状态</dt>
                                  <dd>
                                    {shotHasAsset(shot, candidate.path)
                                      ? '已加入当前镜头'
                                      : taskStatus
                                        ? generationStatusLabel(taskStatus)
                                        : '生成完成'}
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
                              <div className="generated-video-actions">
                                <button
                                  type="button"
                                  className="directory-action-button"
                                  onClick={() =>
                                    void fetch('/api/files/open-location', {
                                      method: 'POST',
                                      headers: {'Content-Type': 'application/json'},
                                      body: JSON.stringify({filePath: candidate.path}),
                                    })
                                  }
                                >
                                  打开所在目录
                                </button>
                                <button
                                  type="button"
                                  className="primary-button"
                                  disabled={shotHasAsset(shot, candidate.path)}
                                  onClick={() => applyCandidate(shot, candidate)}
                                >
                                  {shotHasAsset(shot, candidate.path)
                                    ? '已加入当前镜头'
                                    : '选用为当前镜头素材'}
                                </button>
                              </div>
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
                {videoGenerationError?.shotId === shot.id ? (
                  <p className="candidate-error">{videoGenerationError.message}</p>
                ) : null}
              </article>
            );
          })}
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
            <div>
              <strong>当前镜头素材</strong>
              <span>{previewAssets.length} 个已选素材</span>
            </div>
            <button
              type="button"
              disabled={!previewShot}
              onClick={() => setShotPreviewOpen(true)}
            >
              预览镜头
            </button>
          </header>
          <div className="current-shot-assets">
            {previewAssets.map((asset, index) => (
              <article key={`${asset.path}-${asset.role}`}>
                <button
                  type="button"
                  onClick={() =>
                    setMediaPreview({
                      kind: videoFilePattern.test(asset.path) ? 'video' : 'image',
                      src: mediaUrl(projectId, asset.path),
                      title: `${asset.role} · ${asset.path.split('/').at(-1)}`,
                    })
                  }
                >
                  <i>
                    {videoFilePattern.test(asset.path) ? (
                      <video src={mediaUrl(projectId, asset.path)} muted preload="metadata" />
                    ) : (
                      <img src={mediaUrl(projectId, asset.path)} alt="" />
                    )}
                  </i>
                  <span>
                    <strong>{asset.role}</strong>
                    <small>{asset.path.split('/').at(-1)}</small>
                  </span>
                  <em>{index + 1}</em>
                </button>
                <button type="button" onClick={() => removePreviewAsset(asset.path)}>
                  移除
                </button>
              </article>
            ))}
            {!previewAssets.length ? (
              <div className="current-shot-assets-empty">
                <strong>当前镜头还没有素材</strong>
                <span>从中间的搜索或生成结果中选择素材</span>
              </div>
            ) : null}
            {previewShot ? (
              <button
                type="button"
                className="add-current-shot-asset"
                onClick={() => onGoToAssets(previewShot.id)}
              >
                ＋ 从项目素材库添加
              </button>
            ) : null}
          </div>
        </section>
        {previewShot ? (
          <details className="stage-panel shot-effect-panel">
            <summary>
              <div>
                <strong>Remotion 预览效果（可选）</strong>
                <span>用于快速预览或直接渲染；后续在 Premiere Pro 剪辑可忽略</span>
              </div>
            </summary>
            <label>
              <span>镜头运动</span>
              <select
                value={motionPlanFor(previewShot).preset}
                onChange={(event) =>
                  updateShot(previewShot, {
                    motionPlan: {
                      ...motionPlanFor(previewShot),
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
              <span>运动强度 · {Math.round(motionPlanFor(previewShot).intensity * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={motionPlanFor(previewShot).intensity}
                onChange={(event) =>
                  updateShot(previewShot, {
                    motionPlan: {
                      ...motionPlanFor(previewShot),
                      intensity: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
            <button type="button" onClick={() => setShotPreviewOpen(true)}>
              查看 Remotion 效果
            </button>
          </details>
        ) : null}
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
                {selectedProgress.ready}/{selectedProgress.total} 个镜头完整
              </dd>
            </div>
            <div>
              <dt>当前布局</dt>
              <dd>{previewShot?.composition === 'versus' ? '左右对立' : '单素材'}</dd>
            </div>
          </dl>
        </section>
      </aside>
      {shotPreviewOpen && previewShot ? (
        <div
          className="shot-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="当前镜头 Remotion 预览"
        >
          <button
            type="button"
            className="shot-preview-backdrop"
            aria-label="关闭镜头预览"
            onClick={() => setShotPreviewOpen(false)}
          />
          <section>
            <header>
              <div>
                <strong>当前镜头 Remotion 预览</strong>
                <span>{previewShot?.visualPurpose}</span>
              </div>
              <button type="button" onClick={() => setShotPreviewOpen(false)}>
                ×
              </button>
            </header>
            <Player
              key={`${selected.id}-${previewShot.id}-${motionPlanFor(previewShot).preset}`}
              component={VideoComposition}
              inputProps={{
                project: previewProject,
                narrationAvailable: false,
                assetBasePath: projectId,
              }}
              durationInFrames={Math.max(1, Math.round(previewDuration * project.project.fps))}
              compositionWidth={project.project.width}
              compositionHeight={project.project.height}
              fps={project.project.fps}
              controls
              autoPlay
              loop
              style={{
                width: '100%',
                maxHeight: 'calc(100vh - 150px)',
                aspectRatio: `${project.project.width} / ${project.project.height}`,
                margin: '0 auto',
              }}
            />
          </section>
        </div>
      ) : null}
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
