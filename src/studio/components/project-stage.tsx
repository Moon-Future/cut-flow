import type {ProjectFile} from '../../core/schema';
import {GenerationPanel} from './generation-panel';
import {ProjectDashboard} from './project-dashboard';
import type {WorkspaceSection} from './workspace-sidebar';

type Props = {
  section: Exclude<WorkspaceSection, 'edit'>;
  project: ProjectFile;
  onNavigate: (section: WorkspaceSection) => void;
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
  onAssets: () => void;
  onRender: () => void;
  currentProjectId: string;
  onNewProject: () => void;
  onOpenProject: (projectId: string) => Promise<void>;
};

const sectionTitles: Record<Exclude<WorkspaceSection, 'edit'>, [string, string]> = {
  overview: ['项目概览', '从这里查看项目状态并继续下一阶段'],
  content: ['视频文案', '确认完整口播内容和开场、结尾'],
  storyboard: ['脚本与分镜', '逐段确认旁白、画面意图和素材策略'],
  voice: ['配音', '生成或导入旁白，并检查时间对齐'],
  assets: ['素材', '集中管理本地素材和 AI 生成结果'],
  export: ['导出', '完成最终检查并渲染成片'],
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
}: Props) => {
  const narration = project.scenes.map((scene) => scene.narration).join('\n\n');
  const shotCount = project.scenes.reduce((sum, scene) => sum + (scene.shots?.length ?? 0), 0);
  const generated = shotCount > 0 || Boolean(project.content?.hook || project.content?.ending);
  const totalDuration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const [title, description] = sectionTitles[section];

  return (
    <section className="project-stage">
      {section !== 'overview' ? (
        <header className="stage-heading">
          <div>
            <span className="eyebrow">CUT FLOW WORKSPACE</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
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
        </header>
      ) : null}

      {section === 'overview' ? (
        <ProjectDashboard
          project={project}
          currentProjectId={currentProjectId}
          onNewProject={onNewProject}
          onOpenProject={onOpenProject}
          onNavigate={onNavigate}
        />
      ) : null}

      {section === 'content' ? (
        !generated ? (
          <section className="generation-gate stage-generation">
            <div>
              <span className="eyebrow">READY TO GENERATE</span>
              <h2>生成视频文案与脚本</h2>
              <p>确认主题、视频类型和目标时长后，由 AI 生成完整口播文案及分镜基础。</p>
            </div>
            <GenerationPanel
              defaultOpen
              prominent
              initialTopic={project.content?.topic ?? project.project.title}
              initialVideoType={project.content?.videoType}
              onGenerated={onGenerated}
              onAudioReady={onAudioReady}
            />
          </section>
        ) : (
          <article className="stage-document">
            {project.content?.hook ? <blockquote>{project.content.hook}</blockquote> : null}
            <pre>{narration}</pre>
            {project.content?.ending ? <footer>{project.content.ending}</footer> : null}
            <GenerationPanel
              initialTopic={project.content?.topic ?? project.project.title}
              initialVideoType={project.content?.videoType}
              onGenerated={onGenerated}
              onAudioReady={onAudioReady}
            />
          </article>
        )
      ) : null}

      {section === 'storyboard' ? (
        <div className="stage-storyboard">
          {project.scenes.map((scene, index) => (
            <article key={scene.id}>
              <header>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <div>
                  <strong>{scene.caption}</strong>
                  <span>{scene.duration.toFixed(1)} 秒</span>
                </div>
              </header>
              <p>{scene.narration}</p>
              <blockquote>{scene.visualIntent || '待补充画面意图'}</blockquote>
              <div>
                {(scene.shots ?? []).map((shot) => (
                  <span key={shot.id} className={shot.status}>
                    {shot.visualPurpose}
                    <small>{shot.assetStrategy}</small>
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {section === 'voice' ? (
        <div className="stage-empty">
          <b>◉</b>
          <h2>旁白与时间对齐</h2>
          <p>
            {project.narrationAudio ? `当前旁白：${project.narrationAudio}` : '尚未生成旁白音频'}
          </p>
          <GenerationPanel
            initialTopic={project.content?.topic ?? project.project.title}
            initialVideoType={project.content?.videoType}
            onGenerated={onGenerated}
            onAudioReady={onAudioReady}
          />
        </div>
      ) : null}
      {section === 'assets' ? (
        <div className="stage-empty">
          <b>□</b>
          <h2>项目素材库</h2>
          <p>管理上传视频、图片、AI 生成候选和素材授权信息。</p>
          <button className="primary-button" onClick={onAssets}>
            打开素材库
          </button>
        </div>
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
    </section>
  );
};
