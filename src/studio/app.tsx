import {useEffect, useMemo, useRef, useState} from 'react';
import {Player, type PlayerRef} from '@remotion/player';
import {buildTimeline} from '../core/timeline';
import {VideoComposition} from '../remotion/video-composition';
import {SceneEditor} from './components/scene-editor';
import {GenerationPanel} from './components/generation-panel';
import {AssetLibraryPanel} from './components/asset-library-panel';
import {SceneList} from './components/scene-list';
import {ProjectHub} from './components/project-hub';
import {ContentOverview} from './components/content-overview';
import {useStudioStore} from './store';

type RenderState = {
  status: 'idle' | 'running' | 'success' | 'error';
  progress: number;
  message: string;
  output?: string;
};

export const App = () => {
  const {project, selectedSceneId, saveStatus, error, setProject, setSaveStatus} = useStudioStore();
  const [renderState, setRenderState] = useState<RenderState>({
    status: 'idle',
    progress: 0,
    message: '尚未开始导出',
  });
  const [audioAvailable, setAudioAvailable] = useState(false);
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [showProjects, setShowProjects] = useState(true);
  const [view, setView] = useState<'content' | 'editor'>('content');
  const playerRef = useRef<PlayerRef>(null);

  const openProject = async (id: string) => {
    const selected = await fetch('/api/projects/select', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id}),
    });
    if (!selected.ok) throw new Error('项目切换失败');
    const response = await fetch('/api/project');
    if (!response.ok) throw new Error('项目加载失败');
    setProject((await response.json()) as Parameters<typeof setProject>[0]);
    setProjectId(id);
    setShowProjects(false);
    setView('content');
    setAudioAvailable(false);
    void fetch(`/${id}/audio/narration.wav`, {method: 'HEAD'})
      .then((audio) => setAudioAvailable(audio.ok))
      .catch(() => setAudioAvailable(false));
  };

  useEffect(() => {
    if (!project || saveStatus !== 'saving') return;
    const timer = window.setTimeout(() => {
      fetch('/api/project', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(project),
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(((await response.json()) as {error?: string}).error ?? '保存失败');
          setSaveStatus('saved');
        })
        .catch((reason: unknown) =>
          setSaveStatus('error', reason instanceof Error ? reason.message : String(reason)),
        );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project, saveStatus, setSaveStatus]);

  useEffect(() => {
    if (renderState.status !== 'running') return;
    const timer = window.setInterval(() => {
      fetch('/api/render/status')
        .then((response) => response.json())
        .then((value: RenderState) => setRenderState(value))
        .catch(() => undefined);
    }, 900);
    return () => window.clearInterval(timer);
  }, [renderState.status]);

  const timeline = useMemo(() => (project ? buildTimeline(project) : null), [project]);
  const selectedIndex = project?.scenes.findIndex((scene) => scene.id === selectedSceneId) ?? -1;

  const startRender = async () => {
    const response = await fetch('/api/render', {method: 'POST'});
    const value = (await response.json()) as RenderState & {error?: string};
    if (!response.ok)
      setRenderState({status: 'error', progress: 0, message: value.error ?? '无法开始导出'});
    else setRenderState(value);
  };

  if (showProjects) return <ProjectHub onOpen={openProject} />;

  if (!project || !timeline) {
    return (
      <main className="loading">
        <div className="loading-mark">CF</div>
        <p>{error ?? '正在打开项目…'}</p>
      </main>
    );
  }

  if (view === 'content') {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">CF</span>
            <div>
              <strong>Cut Flow</strong>
              <small>AI 视频生产工作台</small>
            </div>
          </div>
          <div className="project-title">
            <span>当前项目</span>
            <strong>{project.project.title}</strong>
          </div>
          <div className="top-actions">
            <button className="ghost-button" onClick={() => setShowProjects(true)}>
              全部项目
            </button>
            <button className="primary-button" onClick={() => setView('editor')}>
              剪辑与素材
            </button>
          </div>
        </header>
        <ContentOverview project={project} onEdit={() => setView('editor')} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CF</span>
          <div>
            <strong>Cut Flow</strong>
            <small>开发者视频工作台</small>
          </div>
        </div>
        <div className="project-title">
          <span>当前项目</span>
          <strong>{project.project.title}</strong>
        </div>
        <div className="top-actions">
          <button className="ghost-button" onClick={() => setShowProjects(true)}>
            全部项目
          </button>
          <button className="ghost-button" onClick={() => setView('content')}>
            文案与分镜
          </button>
          <span className={`save-state ${saveStatus}`}>
            {saveStatus === 'saved'
              ? '● 已保存'
              : saveStatus === 'saving'
                ? '● 保存中'
                : saveStatus === 'error'
                  ? `保存失败：${error}`
                  : '正在加载'}
          </span>
          <button className="ghost-button" onClick={() => setAssetLibraryOpen(true)}>
            素材库
          </button>
          <button
            className="ghost-button"
            onClick={() => window.open('/api/render/file', '_blank')}
            disabled={renderState.status !== 'success'}
          >
            下载视频
          </button>
          <button
            className="primary-button"
            onClick={() => void startRender()}
            disabled={renderState.status === 'running'}
          >
            {renderState.status === 'running' ? `导出 ${renderState.progress}%` : '导出 MP4'}
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="scene-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">STORYBOARD</span>
              <h2>镜头编排</h2>
            </div>
            <span className="scene-count">{project.scenes.length} 镜头</span>
          </div>
          <GenerationPanel onGenerated={setProject} onAudioReady={() => setAudioAvailable(true)} />
          <SceneList />
        </aside>

        <section className="preview-panel">
          <div className="preview-meta">
            <div>
              <span className="live-dot" />
              实时预览
            </div>
            <span>
              {project.project.width} × {project.project.height} · {project.project.fps} FPS ·{' '}
              {(timeline.durationInFrames / project.project.fps).toFixed(1)}s
            </span>
          </div>
          <div className="player-stage">
            <Player
              ref={playerRef}
              component={VideoComposition}
              inputProps={{
                project,
                narrationAvailable: audioAvailable,
                assetBasePath: 'demo-project',
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
          <div className="timeline-strip">
            {timeline.scenes.map(({scene, durationInFrames}, index) => (
              <button
                key={scene.id}
                className={scene.id === selectedSceneId ? 'active' : ''}
                style={{flex: durationInFrames}}
                onClick={() => {
                  useStudioStore.getState().selectScene(scene.id);
                  playerRef.current?.seekTo(timeline.scenes[index]?.from ?? 0);
                }}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
          <div className={`render-status ${renderState.status}`}>
            <div className="render-progress">
              <i style={{width: `${renderState.progress}%`}} />
            </div>
            <span>{renderState.message}</span>
            {selectedIndex >= 0 ? (
              <small>正在编辑镜头 {String(selectedIndex + 1).padStart(2, '0')}</small>
            ) : null}
          </div>
        </section>

        <aside className="inspector-panel">
          <SceneEditor projectId={projectId} />
        </aside>
      </section>
      <AssetLibraryPanel
        open={assetLibraryOpen}
        projectId={projectId}
        onClose={() => setAssetLibraryOpen(false)}
      />
    </main>
  );
};
