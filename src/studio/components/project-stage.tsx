import type {ProjectFile} from '../../core/schema';
import {GenerationPanel} from './generation-panel';
import type {WorkspaceSection} from './workspace-sidebar';

type Props = {
  section: Exclude<WorkspaceSection, 'edit'>;
  project: ProjectFile;
  onNavigate: (section: WorkspaceSection) => void;
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
  onAssets: () => void;
  onRender: () => void;
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
}: Props) => {
  const narration = project.scenes.map((scene) => scene.narration).join('\n\n');
  const shotCount = project.scenes.reduce((sum, scene) => sum + (scene.shots?.length ?? 0), 0);
  const generated = shotCount > 0 || Boolean(project.content?.hook || project.content?.ending);
  const totalDuration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const [title, description] = sectionTitles[section];

  return (
    <section className="project-stage">
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
                      : section === 'overview'
                        ? 'content'
                        : 'assets',
              )
            }
          >
            下一步 →
          </button>
        ) : null}
      </header>

      {section === 'overview' ? (
        <>
          <div className="stage-metrics">
            <article>
              <span>视频主题</span>
              <strong>{project.content?.topic || project.project.title}</strong>
            </article>
            <article>
              <span>脚本段落</span>
              <strong>{project.scenes.length}</strong>
            </article>
            <article>
              <span>视觉镜头</span>
              <strong>{shotCount}</strong>
            </article>
            <article>
              <span>预计时长</span>
              <strong>{Math.round(totalDuration)} 秒</strong>
            </article>
          </div>
          <div className="overview-grid">
            <article className="stage-card">
              <span className="eyebrow">PROJECT</span>
              <h2>{project.project.title}</h2>
              <p>{project.content?.hook || '主题已创建，可继续生成和完善视频文案。'}</p>
              <dl>
                <div>
                  <dt>视频类型</dt>
                  <dd>{project.content?.videoType || 'science-explainer'}</dd>
                </div>
                <div>
                  <dt>画面尺寸</dt>
                  <dd>
                    {project.project.width} × {project.project.height}
                  </dd>
                </div>
                <div>
                  <dt>帧率</dt>
                  <dd>{project.project.fps} FPS</dd>
                </div>
              </dl>
            </article>
            <article className="stage-card progress-card">
              <span className="eyebrow">PROGRESS</span>
              <h2>制作进度</h2>
              {['主题与类型', '视频文案', '脚本与分镜', '配音与素材', '剪辑与导出'].map(
                (item, index) => (
                  <button
                    key={item}
                    onClick={() =>
                      onNavigate(
                        (
                          [
                            'overview',
                            'content',
                            'storyboard',
                            'voice',
                            'edit',
                          ] as WorkspaceSection[]
                        )[index]!,
                      )
                    }
                  >
                    <b>{index < 3 ? '✓' : index + 1}</b>
                    <span>{item}</span>
                    <i>→</i>
                  </button>
                ),
              )}
            </article>
          </div>
        </>
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
