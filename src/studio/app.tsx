import {useCallback, useEffect, useState} from 'react';
import {AssetLibraryPanel} from './components/asset-library-panel';
import {EditingWorkspace} from './components/editing-workspace';
import {ProjectWorkspace} from './components/project-workspace';
import type {WorkspaceSection} from './components/workspace-sidebar';
import {useStudioStore} from './store';

type RenderState = {
  status: 'idle' | 'running' | 'success' | 'error';
  progress: number;
  message: string;
  output?: string;
};

export const App = () => {
  const {project, saveStatus, error, setProject, setSaveStatus} = useStudioStore();
  const [renderState, setRenderState] = useState<RenderState>({
    status: 'idle',
    progress: 0,
    message: '尚未开始导出',
  });
  const [audioAvailable, setAudioAvailable] = useState(false);
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [showProjects, setShowProjects] = useState(false);
  const [booting, setBooting] = useState(true);
  const [section, setSection] = useState<WorkspaceSection>('overview');

  const openProject = useCallback(
    async (id: string) => {
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
      window.localStorage.setItem('cutflow.activeProjectId', id);
      setShowProjects(false);
      setSection('overview');
      setAudioAvailable(false);
      void fetch(`/${id}/audio/narration.wav`, {method: 'HEAD'})
        .then((audio) => setAudioAvailable(audio.ok))
        .catch(() => setAudioAvailable(false));
    },
    [setProject],
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/projects')
      .then((response) => response.json())
      .then(
        async (value: {
          activeProjectId?: string;
          projects?: Array<{id: string; updatedAt: string}>;
        }) => {
          if (cancelled) return;
          const projects = value.projects ?? [];
          const remembered = window.localStorage.getItem('cutflow.activeProjectId');
          const startupId =
            (remembered && projects.some((item) => item.id === remembered) ? remembered : null) ??
            (value.activeProjectId && projects.some((item) => item.id === value.activeProjectId)
              ? value.activeProjectId
              : null) ??
            projects[0]?.id;
          if (startupId) await openProject(startupId);
          else setShowProjects(true);
        },
      )
      .catch(() => {
        if (!cancelled) setShowProjects(true);
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openProject]);

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

  const startRender = async () => {
    const response = await fetch('/api/render', {method: 'POST'});
    const value = (await response.json()) as RenderState & {error?: string};
    if (!response.ok)
      setRenderState({status: 'error', progress: 0, message: value.error ?? '无法开始导出'});
    else setRenderState(value);
  };

  if (booting) {
    return (
      <main className="loading">
        <div className="loading-mark">CF</div>
        <p>正在恢复上次项目…</p>
      </main>
    );
  }

  if (showProjects)
    return (
      <ProjectWorkspace
        onOpen={async (id, startInContent) => {
          await openProject(id);
          if (startInContent) setSection('content');
        }}
        onClose={() => {
          if (project) {
            setSection('overview');
            setShowProjects(false);
          }
        }}
        onNavigate={(value) => {
          if (value === 'overview') setShowProjects(true);
          if (value === 'settings' && project) {
            setSection('settings');
            setShowProjects(false);
          }
        }}
      />
    );

  if (!project) {
    return (
      <main className="loading">
        <div className="loading-mark">CF</div>
        <p>{error ?? '正在打开项目…'}</p>
      </main>
    );
  }

  return (
    <>
      <EditingWorkspace
        project={project}
        projectId={projectId}
        audioAvailable={audioAvailable}
        renderState={renderState}
        section={section}
        onNavigate={setSection}
        onNewProject={() => setShowProjects(true)}
        onAssets={() => setAssetLibraryOpen(true)}
        onRender={() => void startRender()}
        onGenerated={(generatedProject) => {
          setProject(generatedProject);
          setAudioAvailable(Boolean(generatedProject.narrationAudio));
        }}
        onAudioReady={() => setAudioAvailable(true)}
        onOpenProject={openProject}
      />
      <AssetLibraryPanel
        open={assetLibraryOpen}
        projectId={projectId}
        canApply={section !== 'overview'}
        onClose={() => setAssetLibraryOpen(false)}
      />
    </>
  );
};
