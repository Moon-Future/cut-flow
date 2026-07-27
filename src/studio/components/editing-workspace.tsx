import {useEffect, useMemo, useRef, useState} from 'react';
import {Player, type PlayerRef} from '@remotion/player';
import type {AssetLibrary, AssetMetadata} from '../../media/asset-library';
import type {ProjectFile, Scene} from '../../core/schema';
import {buildTimeline} from '../../core/timeline';
import {VideoComposition} from '../../remotion/video-composition';
import {useStudioStore} from '../store';
import {ProjectStage} from './project-stage';
import {WorkspaceSidebar, type WorkspaceSection} from './workspace-sidebar';
import type {AssetSelectionTarget} from '../asset-selection';

type RenderState = {
  status: 'idle' | 'running' | 'success' | 'error';
  progress: number;
  message: string;
};

type Props = {
  project: ProjectFile;
  projectId: string;
  audioAvailable: boolean;
  renderState: RenderState;
  section: WorkspaceSection;
  onNavigate: (section: WorkspaceSection) => void;
  onNewProject: () => void;
  onAssets: (target?: AssetSelectionTarget) => void;
  onRender: () => void;
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
  onOpenProject: (projectId: string) => Promise<void>;
};

const mediaUrl = (projectId: string, path: string) => `/${projectId}/${path}`;

const workspaceTabs: Array<{
  section: Extract<WorkspaceSection, 'content' | 'storyboard' | 'assets' | 'voice' | 'edit'>;
  label: string;
  hint: string;
}> = [
  {section: 'content', label: '文案', hint: '整理口播内容'},
  {section: 'storyboard', label: '脚本与分镜', hint: '拆分镜头'},
  {section: 'assets', label: '素材', hint: '选择画面'},
  {section: 'voice', label: '配音', hint: '生成与校对'},
  {section: 'edit', label: '剪辑效果', hint: '调整画面与字幕'},
];

const MediaThumb = ({
  projectId,
  path,
  type,
}: {
  projectId: string;
  path: string;
  type: Scene['assetType'];
}) =>
  type === 'video' ? (
    <video src={mediaUrl(projectId, path)} muted preload="metadata" />
  ) : (
    <img src={mediaUrl(projectId, path)} alt="" />
  );

export const EditingWorkspace = ({
  project,
  projectId,
  audioAvailable,
  renderState,
  section,
  onNavigate,
  onNewProject,
  onAssets,
  onRender,
  onGenerated,
  onAudioReady,
  onOpenProject,
}: Props) => {
  const {
    selectedSceneId,
    saveStatus,
    selectScene,
    updateScene,
    replaceSceneAsset,
    reorderScenes,
    duplicateScene,
    deleteScene,
  } = useStudioStore();
  const [assets, setAssets] = useState<AssetMetadata[]>([]);
  const [assetTab, setAssetTab] = useState<'local' | 'generated' | 'history'>('local');
  const [candidatePath, setCandidatePath] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'properties' | 'captions'>('properties');
  const [timelineHeight, setTimelineHeight] = useState(() => {
    if (typeof window === 'undefined') return 218;
    const saved = Number(window.localStorage.getItem('cut-flow-timeline-height'));
    return Number.isFinite(saved) && saved >= 150 ? saved : 218;
  });
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const timelineResizeStart = useRef<{pointerY: number; height: number} | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const timeline = useMemo(() => buildTimeline(project), [project]);
  const selectedIndex = Math.max(
    0,
    project.scenes.findIndex((scene) => scene.id === selectedSceneId),
  );
  const scene = project.scenes[selectedIndex] ?? project.scenes[0]!;
  const selectedTimelineItem = timeline.scenes[selectedIndex];
  const totalSeconds = timeline.durationInFrames / project.project.fps;
  const showWorkbench = !['overview', 'settings'].includes(section);
  const clampTimelineHeight = (height: number) =>
    Math.round(Math.max(150, Math.min(Math.max(150, window.innerHeight - 320), height)));
  const saveTimelineHeight = (height: number) => {
    const next = clampTimelineHeight(height);
    setTimelineHeight(next);
    window.localStorage.setItem('cut-flow-timeline-height', String(next));
  };

  useEffect(() => {
    fetch('/api/assets/library')
      .then((response) => response.json())
      .then((library: AssetLibrary) =>
        setAssets(library.assets.filter((asset) => asset.type !== 'audio')),
      )
      .catch(() => setAssets([]));
  }, [projectId]);

  useEffect(() => {
    setCandidatePath(null);
    setPreviewPath(null);
  }, [selectedSceneId]);

  useEffect(() => {
    const fitTimelineToWindow = () =>
      setTimelineHeight((current) =>
        Math.round(Math.max(150, Math.min(Math.max(150, window.innerHeight - 320), current))),
      );
    window.addEventListener('resize', fitTimelineToWindow);
    fitTimelineToWindow();
    return () => window.removeEventListener('resize', fitTimelineToWindow);
  }, []);

  const shotCandidates = (scene.shots ?? []).flatMap((shot) => shot.candidates);
  const candidates =
    assetTab === 'history'
      ? (scene.assetHistory ?? []).map((path) => ({
          id: path,
          name: path.split('/').pop() ?? path,
          path,
          type: /\.(mp4|mov|webm)$/i.test(path) ? ('video' as const) : ('image' as const),
        }))
      : assetTab === 'generated'
        ? shotCandidates.map((candidate) => ({
            id: candidate.id,
            name: candidate.prompt,
            path: candidate.path,
            type: candidate.kind,
          }))
        : assets.map((asset) => ({
            id: asset.id,
            name: asset.name,
            path: asset.path,
            type: asset.type as 'image' | 'video',
          }));

  const chooseScene = (id: string, index: number) => {
    selectScene(id);
    playerRef.current?.seekTo(timeline.scenes[index]?.from ?? 0);
  };

  const replace = () => {
    const candidate = candidates.find((item) => item.path === candidatePath);
    if (!candidate) return;
    replaceSceneAsset(scene.id, candidate.path, candidate.type);
    setCandidatePath(null);
    setPreviewPath(null);
  };

  const insert = () => {
    const candidate = candidates.find((item) => item.path === candidatePath);
    if (!candidate) return;
    duplicateScene(scene.id);
    const newSceneId = useStudioStore.getState().selectedSceneId;
    if (newSceneId) replaceSceneAsset(newSceneId, candidate.path, candidate.type);
    setCandidatePath(null);
    setPreviewPath(null);
  };

  const previewCandidate = candidates.find((item) => item.path === previewPath);
  const previewProject = previewCandidate
    ? {
        ...project,
        scenes: project.scenes.map((item) =>
          item.id === scene.id
            ? {...item, assetPath: previewCandidate.path, assetType: previewCandidate.type}
            : item,
        ),
      }
    : project;

  return (
    <div className="edit-app">
      <WorkspaceSidebar
        section={section}
        project={project}
        onNavigate={onNavigate}
        onNewProject={onNewProject}
      />

      <main
        className={`edit-main ${showWorkbench ? 'workbench-mode' : 'stage-mode'} ${
          section === 'overview' ? 'overview-mode' : ''
        }`}
        style={
          showWorkbench
            ? {
                gridTemplateRows: `60px 48px minmax(220px, 1fr) ${
                  timelineCollapsed ? 42 : timelineHeight
                }px`,
              }
            : undefined
        }
      >
        {section !== 'overview' ? (
          <header className="edit-header">
            <div>
              <button onClick={() => onNavigate('overview')}>我的项目</button>
              <span>/</span>
              <strong>{project.project.title}</strong>
            </div>
            <span className={`save-state ${saveStatus}`}>
              {saveStatus === 'saved'
                ? '● 已自动保存'
                : saveStatus === 'saving'
                  ? '● 保存中…'
                  : '● 保存异常'}
            </span>
            <div>
              {showWorkbench ? (
                <button className="header-next" onClick={() => onNavigate('export')}>
                  导出视频
                </button>
              ) : null}
            </div>
          </header>
        ) : null}

        {showWorkbench ? (
          <nav className="workspace-tabs" aria-label="项目编辑模式">
            {workspaceTabs.map((item) => (
              <button
                key={item.section}
                className={section === item.section ? 'active' : ''}
                onClick={() => onNavigate(item.section)}
              >
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </button>
            ))}
          </nav>
        ) : null}

        {showWorkbench ? (
          <>
            {section === 'edit' ? (
              <section className="editing-grid">
                <section className="storyboard-pane edit-panel">
                  <header>
                    <div>
                      <strong>分镜列表</strong>
                      <span>共 {project.scenes.length} 个镜头</span>
                    </div>
                    <button onClick={() => onNavigate('storyboard')}>自动分镜</button>
                  </header>
                  <div className="edit-scene-list">
                    {project.scenes.map((item, index) => (
                      <article
                        key={item.id}
                        className={item.id === scene.id ? 'selected' : ''}
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData('sceneId', item.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) =>
                          reorderScenes(event.dataTransfer.getData('sceneId'), item.id)
                        }
                        onClick={() => chooseScene(item.id, index)}
                      >
                        <span className="drag-handle">⋮⋮</span>
                        <div className="scene-thumb">
                          <MediaThumb
                            projectId={projectId}
                            path={item.assetPath}
                            type={item.assetType}
                          />
                          <b>{String(index + 1).padStart(2, '0')}</b>
                        </div>
                        <div>
                          <strong>{item.caption}</strong>
                          <p>{item.narration}</p>
                          <small>
                            {item.duration.toFixed(1)} 秒 · {item.visualIntent || '待完善画面意图'}
                          </small>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="material-pane edit-panel">
                  <header>
                    <div>
                      <strong>
                        镜头 {String(selectedIndex + 1).padStart(2, '0')} · 当前镜头素材
                      </strong>
                      <span>{scene.visualIntent || '为当前旁白选择匹配画面'}</span>
                    </div>
                    <button onClick={() => onAssets()}>素材库</button>
                  </header>
                  <div className="shot-copy">
                    <label>
                      <span>旁白文案</span>
                      <textarea
                        value={scene.narration}
                        rows={2}
                        onChange={(event) => updateScene(scene.id, {narration: event.target.value})}
                      />
                    </label>
                    <label>
                      <span>画面意图</span>
                      <textarea
                        value={scene.visualIntent ?? ''}
                        rows={2}
                        onChange={(event) =>
                          updateScene(scene.id, {visualIntent: event.target.value})
                        }
                      />
                    </label>
                  </div>
                  <div className="material-tabs">
                    <button
                      className={assetTab === 'local' ? 'active' : ''}
                      onClick={() => setAssetTab('local')}
                    >
                      本地素材
                    </button>
                    <button onClick={() => onAssets()}>素材库</button>
                    <button
                      className={assetTab === 'generated' ? 'active' : ''}
                      onClick={() => setAssetTab('generated')}
                    >
                      AI 生成
                    </button>
                    <button
                      className={assetTab === 'history' ? 'active' : ''}
                      onClick={() => setAssetTab('history')}
                    >
                      历史版本
                    </button>
                  </div>
                  <div className="current-material">
                    <MediaThumb
                      projectId={projectId}
                      path={scene.assetPath}
                      type={scene.assetType}
                    />
                    <div>
                      <strong>当前：{scene.assetPath.split('/').pop()}</strong>
                      <span>
                        {scene.assetType === 'video' ? '视频素材' : '图片素材'} ·{' '}
                        {scene.duration.toFixed(1)} 秒
                      </span>
                    </div>
                    <i>✓</i>
                  </div>
                  <div className="candidate-list">
                    {candidates.slice(0, 4).map((candidate) => (
                      <button
                        key={candidate.id}
                        className={candidate.path === candidatePath ? 'selected' : ''}
                        onClick={() => setCandidatePath(candidate.path)}
                      >
                        <MediaThumb
                          projectId={projectId}
                          path={candidate.path}
                          type={candidate.type}
                        />
                        <span>{candidate.name}</span>
                      </button>
                    ))}
                    {!candidates.length ? (
                      <p>当前分类还没有候选素材，可打开素材库导入或生成。</p>
                    ) : null}
                  </div>
                  <footer className="replacement-actions">
                    <button disabled={!candidatePath} onClick={() => setPreviewPath(candidatePath)}>
                      ◉ 预览替换
                    </button>
                    <button className="primary" disabled={!candidatePath} onClick={replace}>
                      替换当前镜头
                    </button>
                    <button disabled={!candidatePath} onClick={insert}>
                      插入为新镜头
                    </button>
                    <small>替换后保留字幕、配音与时长</small>
                  </footer>
                </section>

                <section className="preview-pane edit-panel">
                  <header>
                    <strong>预览</strong>
                    <span>9:16</span>
                  </header>
                  <div className="edit-player-stage">
                    <Player
                      ref={playerRef}
                      component={VideoComposition}
                      inputProps={{
                        project: previewProject,
                        narrationAvailable: audioAvailable,
                        assetBasePath: projectId,
                      }}
                      durationInFrames={timeline.durationInFrames}
                      compositionWidth={project.project.width}
                      compositionHeight={project.project.height}
                      fps={project.project.fps}
                      controls
                      loop
                      style={{width: '100%', height: '100%'}}
                    />
                  </div>
                  <div className="preview-info">
                    <span>
                      镜头 {selectedIndex + 1} / {project.scenes.length}
                    </span>
                    <span>{totalSeconds.toFixed(1)} 秒</span>
                  </div>
                </section>

                <aside className="properties-pane edit-panel">
                  <div className="property-tabs">
                    <button
                      className={inspectorTab === 'properties' ? 'active' : ''}
                      onClick={() => setInspectorTab('properties')}
                    >
                      属性
                    </button>
                    <button
                      className={inspectorTab === 'captions' ? 'active' : ''}
                      onClick={() => setInspectorTab('captions')}
                    >
                      字幕
                    </button>
                  </div>
                  {inspectorTab === 'properties' ? (
                    <div className="property-form">
                      <h3>基础设置</h3>
                      <label>
                        <span>持续时长</span>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={scene.duration}
                          onChange={(event) =>
                            updateScene(scene.id, {duration: Number(event.target.value)})
                          }
                        />
                      </label>
                      <label>
                        <span>画面布局</span>
                        <select
                          value={scene.layout}
                          onChange={(event) =>
                            updateScene(scene.id, {layout: event.target.value as Scene['layout']})
                          }
                        >
                          <option value="full-screen">全屏填充</option>
                          <option value="center-card">居中卡片</option>
                          <option value="split-top-bottom">上下分屏</option>
                        </select>
                      </label>
                      <label>
                        <span>画面动效</span>
                        <select
                          value={scene.motion}
                          onChange={(event) =>
                            updateScene(scene.id, {motion: event.target.value as Scene['motion']})
                          }
                        >
                          <option value="none">无</option>
                          <option value="slow-zoom-in">缓慢推近</option>
                          <option value="slow-zoom-out">缓慢拉远</option>
                          <option value="pan-left">向左平移</option>
                          <option value="pan-right">向右平移</option>
                          <option value="pan-up">向上平移</option>
                          <option value="pan-down">向下平移</option>
                          <option value="ken-burns-left">推近并向左移动</option>
                          <option value="ken-burns-right">推近并向右移动</option>
                          <option value="gentle-float">轻微漂浮</option>
                        </select>
                      </label>
                      <h3>项目设置</h3>
                      <label>
                        <span>转场</span>
                        <input
                          value={project.style.transition === 'fade' ? '淡入淡出' : '无'}
                          disabled
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="property-form">
                      <h3>字幕设置</h3>
                      <label>
                        <span>字幕文本</span>
                        <textarea
                          rows={5}
                          value={scene.caption}
                          onChange={(event) => updateScene(scene.id, {caption: event.target.value})}
                        />
                      </label>
                      <label>
                        <span>字幕位置</span>
                        <input
                          value={
                            project.style.captionPosition === 'bottom'
                              ? '底部居中'
                              : project.style.captionPosition === 'top'
                                ? '顶部居中'
                                : '画面居中'
                          }
                          disabled
                        />
                      </label>
                    </div>
                  )}
                </aside>
              </section>
            ) : (
              <ProjectStage
                section={section as Exclude<WorkspaceSection, 'edit'>}
                project={project}
                onNavigate={onNavigate}
                onGenerated={onGenerated}
                onAudioReady={onAudioReady}
                onAssets={onAssets}
                onRender={onRender}
                currentProjectId={projectId}
                onNewProject={onNewProject}
                onOpenProject={onOpenProject}
                audioAvailable={audioAvailable}
              />
            )}

            <section
              className={`timeline-panel edit-panel ${timelineCollapsed ? 'collapsed' : ''}`}
            >
              <div
                className="timeline-resize-handle"
                role="separator"
                aria-label="拖动调整时间线高度"
                aria-orientation="horizontal"
                aria-valuemin={150}
                aria-valuemax={Math.max(150, window.innerHeight - 320)}
                aria-valuenow={timelineHeight}
                tabIndex={0}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  timelineResizeStart.current = {
                    pointerY: event.clientY,
                    height: timelineHeight,
                  };
                }}
                onPointerMove={(event) => {
                  const start = timelineResizeStart.current;
                  if (!start) return;
                  setTimelineHeight(
                    clampTimelineHeight(start.height + start.pointerY - event.clientY),
                  );
                }}
                onPointerUp={(event) => {
                  const start = timelineResizeStart.current;
                  if (!start) return;
                  const next = clampTimelineHeight(start.height + start.pointerY - event.clientY);
                  timelineResizeStart.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  saveTimelineHeight(next);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                  event.preventDefault();
                  saveTimelineHeight(timelineHeight + (event.key === 'ArrowUp' ? 20 : -20));
                }}
              >
                <span />
              </div>
              <header className="timeline-toolbar">
                <strong>时间线</strong>
                <button disabled>↶ 撤销</button>
                <button disabled>↷ 重做</button>
                <button disabled>✂ 分割</button>
                <button onClick={() => deleteScene(scene.id)} disabled={project.scenes.length <= 1}>
                  ♜ 删除
                </button>
                <button onClick={() => duplicateScene(scene.id)}>▣ 复制</button>
                <button disabled>◖ 静音</button>
                <button disabled>⌘ 添加转场</button>
                <button
                  className="timeline-collapse"
                  onClick={() => setTimelineCollapsed((current) => !current)}
                  aria-expanded={!timelineCollapsed}
                >
                  {timelineCollapsed ? '展开时间线' : '收起时间线'}
                </button>
              </header>
              <div className="timeline-ruler">
                <span />
                {Array.from({length: 7}, (_, index) => (
                  <i key={index}>{Math.round((totalSeconds / 6) * index)}s</i>
                ))}
              </div>
              <div className="track-row video-track">
                <strong>▣ 视频轨道</strong>
                <div>
                  {timeline.scenes.map(({scene: item, durationInFrames}, index) => (
                    <button
                      key={item.id}
                      className={item.id === scene.id ? 'selected' : ''}
                      style={{flex: durationInFrames}}
                      onClick={() => chooseScene(item.id, index)}
                    >
                      <MediaThumb
                        projectId={projectId}
                        path={item.assetPath}
                        type={item.assetType}
                      />
                      <span>{String(index + 1).padStart(2, '0')}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="track-row caption-track">
                <strong>Ｔ 字幕轨道</strong>
                <div>
                  {timeline.scenes.map(({scene: item, durationInFrames}) => (
                    <button
                      key={item.id}
                      style={{flex: durationInFrames}}
                      onClick={() => selectScene(item.id)}
                    >
                      {item.caption}
                    </button>
                  ))}
                </div>
              </div>
              <div className="track-row audio-track">
                <strong>◉ 配音轨道</strong>
                <div className="waveform">
                  <span>narration.wav</span>
                </div>
              </div>
              <div className="track-row music-track">
                <strong>♫ 背景音乐</strong>
                <div className="waveform">
                  <span>
                    {project.style.backgroundMusicVolume ? '背景音乐' : '尚未添加背景音乐'}
                  </span>
                </div>
              </div>
              {selectedTimelineItem ? (
                <i
                  className="playhead"
                  style={{
                    left: `calc(124px + ${(selectedTimelineItem.from / timeline.durationInFrames) * 100}% * .88)`,
                  }}
                />
              ) : null}
            </section>
          </>
        ) : (
          <ProjectStage
            section={section as Exclude<WorkspaceSection, 'edit'>}
            project={project}
            onNavigate={onNavigate}
            onGenerated={onGenerated}
            onAudioReady={onAudioReady}
            onAssets={onAssets}
            onRender={onRender}
            currentProjectId={projectId}
            onNewProject={onNewProject}
            onOpenProject={onOpenProject}
            audioAvailable={audioAvailable}
          />
        )}
        <div className={`render-toast ${renderState.status}`}>{renderState.message}</div>
      </main>
    </div>
  );
};
