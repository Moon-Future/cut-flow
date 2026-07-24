import type {ProjectFile} from '../../core/schema';

type Props = {
  project: ProjectFile;
  onEdit: () => void;
};

export const ContentOverview = ({project, onEdit}: Props) => {
  const narration = project.scenes.map((scene) => scene.narration).join('\n\n');
  const shotCount = project.scenes.reduce((sum, scene) => sum + (scene.shots?.length ?? 0), 0);
  return (
    <section className="content-overview">
      <div className="content-hero">
        <div>
          <span className="eyebrow">CONTENT & STORYBOARD</span>
          <h1>{project.project.title}</h1>
          <p>{project.content?.topic || '尚未填写主题'}</p>
        </div>
        <button className="primary-button" onClick={onEdit}>
          进入剪辑工作台
        </button>
      </div>
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
    </section>
  );
};
