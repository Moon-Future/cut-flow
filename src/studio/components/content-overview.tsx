import type {ProjectFile} from '../../core/schema';
import {GenerationPanel} from './generation-panel';

type Props = {
  project: ProjectFile;
  onEdit: () => void;
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
};

export const ContentOverview = ({project, onEdit, onGenerated, onAudioReady}: Props) => {
  const narration = project.scenes.map((scene) => scene.narration).join('\n\n');
  const shotCount = project.scenes.reduce((sum, scene) => sum + (scene.shots?.length ?? 0), 0);
  const generated = shotCount > 0 || Boolean(project.content?.hook || project.content?.ending);

  return (
    <section className="content-overview">
      <nav className="workflow-steps" aria-label="视频制作流程">
        <span className="done">1. 项目主题</span>
        <span className={generated ? 'done' : 'active'}>2. 文案与脚本</span>
        <span className={generated ? 'active' : ''}>3. 分镜与素材</span>
        <span>4. 剪辑与预览</span>
        <span>5. 导出</span>
      </nav>

      <div className="content-hero">
        <div>
          <span className="eyebrow">CONTENT & STORYBOARD</span>
          <h1>{project.project.title}</h1>
          <p>{project.content?.topic || '尚未填写主题'}</p>
        </div>
        {generated ? (
          <button className="primary-button" onClick={onEdit}>
            进入剪辑工作台
          </button>
        ) : null}
      </div>

      {!generated ? (
        <section className="generation-gate">
          <div>
            <span className="eyebrow">READY TO GENERATE</span>
            <h2>主题已保存，下一步由你决定何时生成</h2>
            <p>确认主题、模型和目标时长后，点击按钮生成完整口播文案、脚本段落与视觉分镜。</p>
          </div>
          <GenerationPanel
            defaultOpen
            prominent
            initialTopic={project.content?.topic ?? project.project.title}
            onGenerated={onGenerated}
            onAudioReady={onAudioReady}
          />
        </section>
      ) : (
        <>
          <div className="content-metrics">
            <span>
              <b>{project.scenes.length}</b> 个脚本段落
            </span>
            <span>
              <b>{shotCount}</b> 个视觉镜头
            </span>
            <span>
              <b>
                {project.project.durationTarget ??
                  Math.round(project.scenes.reduce((sum, scene) => sum + scene.duration, 0))}
              </b>{' '}
              秒目标时长
            </span>
          </div>
          <div className="content-columns">
            <article className="content-document">
              <header>
                <span>01</span>
                <div>
                  <b>视频文案</b>
                  <small>完整口播文本</small>
                </div>
              </header>
              {project.content?.hook ? <blockquote>{project.content.hook}</blockquote> : null}
              <pre>{narration}</pre>
              {project.content?.ending ? <footer>{project.content.ending}</footer> : null}
            </article>
            <article className="content-script">
              <header>
                <span>02</span>
                <div>
                  <b>脚本与分镜</b>
                  <small>段落 → 画面 → 素材策略</small>
                </div>
              </header>
              <div className="script-scenes">
                {project.scenes.map((scene, index) => (
                  <section key={scene.id}>
                    <div className="script-scene-title">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <b>{scene.caption}</b>
                        <small>{scene.duration.toFixed(1)} 秒</small>
                      </div>
                    </div>
                    <p>{scene.narration}</p>
                    <div className="shot-summary">
                      {(scene.shots ?? []).map((shot) => (
                        <div key={shot.id}>
                          <i className={`shot-dot ${shot.status}`} />
                          <span>{shot.visualPurpose}</span>
                          <small>
                            {shot.shotType} · {shot.assetStrategy}
                          </small>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </div>
          <div className="regenerate-row">
            <GenerationPanel
              initialTopic={project.content?.topic ?? project.project.title}
              onGenerated={onGenerated}
              onAudioReady={onAudioReady}
            />
          </div>
        </>
      )}
    </section>
  );
};
