import type {ProjectFile} from '../../core/schema';
import {AssetsWorkspace} from './assets-workspace';
import {ContentWorkspace} from './content-workspace';
import {ProjectDashboard} from './project-dashboard';
import {StoryboardWorkspace} from './storyboard-workspace';
import {VoiceWorkspace} from './voice-workspace';
import type {WorkspaceSection} from './workspace-sidebar';
import {SettingsWorkspace} from './settings-workspace';
import type {AssetSelectionTarget} from '../asset-selection';

type Props = {
  section: Exclude<WorkspaceSection, 'edit'>;
  project: ProjectFile;
  onNavigate: (section: WorkspaceSection) => void;
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
  onAssets: (target?: AssetSelectionTarget) => void;
  onRender: () => void;
  currentProjectId: string;
  onNewProject: () => void;
  onOpenProject: (projectId: string) => Promise<void>;
  audioAvailable: boolean;
};

const sectionTitles: Record<Exclude<WorkspaceSection, 'edit'>, [string, string]> = {
  overview: ['项目概览', '从这里查看项目状态并继续下一阶段'],
  content: ['视频文案', '确认完整口播内容和开场、结尾'],
  storyboard: ['脚本与分镜', '逐段确认旁白、画面意图和素材策略'],
  voice: ['配音', '生成或导入旁白，并检查时间对齐'],
  assets: ['素材', '集中管理本地素材和 AI 生成结果'],
  export: ['导出', '完成最终检查并渲染成片'],
  settings: ['设置', '配置本机 AI 服务与密钥'],
};

const previousSection: Partial<Record<Exclude<WorkspaceSection, 'edit'>, WorkspaceSection>> = {
  content: 'overview',
  storyboard: 'content',
  voice: 'storyboard',
  assets: 'voice',
  export: 'edit',
};

export const ProjectStage = ({
  section,
  project,
  onNavigate,
  onGenerated,
  onAudioReady,
  onAssets,
  onRender,
  currentProjectId,
  onNewProject,
  onOpenProject,
  audioAvailable,
}: Props) => {
  const totalDuration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const [title, description] = sectionTitles[section];

  return (
    <section className="project-stage">
      {section !== 'overview' && section !== 'settings' ? (
        <header className="stage-heading">
          <div>
            <span className="eyebrow">CUT FLOW WORKSPACE</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <div className="stage-heading-actions">
            {previousSection[section] ? (
              <button
                className="secondary-button"
                onClick={() => onNavigate(previousSection[section]!)}
              >
                ← 上一步
              </button>
            ) : null}
            {section !== 'export' ? (
              <button
                className="primary-button"
                onClick={() =>
                  onNavigate(
                    section === 'assets'
                      ? 'edit'
                      : section === 'storyboard'
                        ? 'voice'
                        : section === 'content'
                          ? 'storyboard'
                          : 'assets',
                  )
                }
              >
                下一步 →
              </button>
            ) : null}
          </div>
        </header>
      ) : null}

      {section === 'overview' ? (
        <ProjectDashboard
          project={project}
          currentProjectId={currentProjectId}
          onNewProject={onNewProject}
          onOpenProject={onOpenProject}
          onNavigate={onNavigate}
          onAssets={onAssets}
        />
      ) : null}

      {section === 'content' ? (
        <ContentWorkspace project={project} onGenerated={onGenerated} onAudioReady={onAudioReady} />
      ) : null}
      {section === 'storyboard' ? (
        <StoryboardWorkspace project={project} projectId={currentProjectId} onAssets={onAssets} />
      ) : null}
      {section === 'voice' ? (
        <VoiceWorkspace
          project={project}
          projectId={currentProjectId}
          audioAvailable={audioAvailable}
          onGenerated={onGenerated}
          onAudioReady={onAudioReady}
        />
      ) : null}
      {section === 'assets' ? (
        <AssetsWorkspace
          project={project}
          projectId={currentProjectId}
          onOpenLibrary={() => onAssets()}
        />
      ) : null}
      {section === 'export' ? (
        <div className="stage-empty">
          <b>⇧</b>
          <h2>准备导出视频</h2>
          <p>
            {project.scenes.length} 个镜头 · {Math.round(totalDuration)} 秒 ·{' '}
            {project.project.width} × {project.project.height}
          </p>
          <button className="primary-button" onClick={onRender}>
            导出 MP4
          </button>
        </div>
      ) : null}
      {section === 'settings' ? <SettingsWorkspace /> : null}
    </section>
  );
};
