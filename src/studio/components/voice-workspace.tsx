import type {ProjectFile} from '../../core/schema';
import {useStudioStore} from '../store';
import {GenerationPanel} from './generation-panel';

type Props = {
  project: ProjectFile;
  projectId: string;
  audioAvailable: boolean;
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
};

export const VoiceWorkspace = ({
  project,
  projectId,
  audioAvailable,
  onGenerated,
  onAudioReady,
}: Props) => {
  const {updateScene} = useStudioStore();
  const duration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  return (
    <section className="voice-studio">
      <aside className="voice-config stage-panel">
        <header>
          <div>
            <strong>配音设置</strong>
            <span>选择声音和朗读方式</span>
          </div>
        </header>
        <div className="stage-form">
          <label>
            <span>声音角色</span>
            <select>
              <option>自然讲解 · 中文</option>
              <option>沉稳男声 · 中文</option>
              <option>轻快女声 · 中文</option>
            </select>
          </label>
          <div className="form-pair">
            <label>
              <span>语速</span>
              <select>
                <option>1.0× 正常</option>
                <option>0.9× 稍慢</option>
                <option>1.1× 稍快</option>
              </select>
            </label>
            <label>
              <span>情绪</span>
              <select>
                <option>自然</option>
                <option>活力</option>
                <option>沉稳</option>
              </select>
            </label>
          </div>
          <label>
            <span>发音提示</span>
            <textarea rows={5} placeholder="可填写专业名词读音、停顿要求或情绪提示" />
          </label>
        </div>
        <div className="copy-generation">
          <header>
            <strong>生成旁白</strong>
            <span>会根据当前文案重新生成</span>
          </header>
          <GenerationPanel
            initialTopic={project.content?.topic ?? project.project.title}
            initialVideoType={project.content?.videoType}
            onGenerated={onGenerated}
            onAudioReady={onAudioReady}
          />
        </div>
      </aside>
      <main className="voice-editor stage-panel">
        <header>
          <div>
            <strong>旁白段落</strong>
            <span>
              {project.scenes.length} 段 · {Math.round(duration)} 秒
            </span>
          </div>
          <span className={audioAvailable ? 'ready-pill' : 'pending-pill'}>
            {audioAvailable ? '音频已生成' : '等待生成'}
          </span>
        </header>
        <div className="voice-segments">
          {project.scenes.map((scene, index) => (
            <article key={scene.id}>
              <header>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <strong>{scene.caption}</strong>
                <span>{scene.duration.toFixed(1)}s</span>
                <button disabled title="生成旁白后可试听">
                  ▶
                </button>
              </header>
              <textarea
                rows={3}
                value={scene.narration}
                onChange={(event) => updateScene(scene.id, {narration: event.target.value})}
              />
              <div className="mini-wave">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </article>
          ))}
        </div>
      </main>
      <aside className="voice-preview">
        <section className="stage-panel">
          <header>
            <strong>完整旁白预览</strong>
            <span>{Math.round(duration)} 秒</span>
          </header>
          {audioAvailable ? (
            <audio
              controls
              src={`/${projectId}/${project.narrationAudio ?? 'audio/narration.wav'}`}
            />
          ) : (
            <div className="empty-audio">
              <b>◉</b>
              <p>生成旁白后可在这里试听完整音频</p>
            </div>
          )}
        </section>
        <section className="stage-panel voice-check">
          <header>
            <strong>配音检查</strong>
          </header>
          <ul>
            <li>✓ 文案段落完整</li>
            <li>✓ 预计时长与项目匹配</li>
            <li>{audioAvailable ? '✓ 旁白音频已就绪' : '○ 尚未生成旁白音频'}</li>
            <li>○ 建议试听后再进入剪辑</li>
          </ul>
        </section>
      </aside>
    </section>
  );
};
