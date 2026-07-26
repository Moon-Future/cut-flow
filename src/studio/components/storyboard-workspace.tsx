import type {ProjectFile, VisualShot} from '../../core/schema';
import {useStudioStore} from '../store';

type Props = {project: ProjectFile; projectId: string; onAssets: () => void};
const mediaUrl = (projectId: string, path: string) => `/${projectId}/${path}`;

export const StoryboardWorkspace = ({project, projectId, onAssets}: Props) => {
  const {selectedSceneId, selectScene, updateScene, updateVisualShot} = useStudioStore();
  const selected =
    project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0]!;
  const selectedIndex = project.scenes.findIndex((scene) => scene.id === selected.id);
  const updateShot = (shot: VisualShot, patch: Partial<VisualShot>) =>
    updateVisualShot(selected.id, shot.id, patch);

  return (
    <section className="storyboard-studio">
      <aside className="board-scene-list stage-panel">
        <header>
          <div>
            <strong>分镜列表</strong>
            <span>{project.scenes.length} 个段落</span>
          </div>
          <button disabled title="请在文案页重新生成脚本与分镜">
            在文案页生成
          </button>
        </header>
        <div>
          {project.scenes.map((scene, index) => (
            <button
              key={scene.id}
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
              <em>{scene.shots?.length ?? 0}</em>
            </button>
          ))}
        </div>
      </aside>
      <main className="board-editor stage-panel">
        <header>
          <div>
            <strong>
              段落 {String(selectedIndex + 1).padStart(2, '0')} · {selected.caption}
            </strong>
            <span>编辑旁白、画面意图和镜头计划</span>
          </div>
          <button onClick={onAssets}>打开素材库</button>
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
        </div>
        <div className="shot-editor-list">
          {(selected.shots ?? []).map((shot, index) => (
            <article key={shot.id}>
              <header>
                <b>镜头 {index + 1}</b>
                <span className={shot.status}>
                  {shot.status === 'ready'
                    ? '素材就绪'
                    : shot.status === 'needs-review'
                      ? '待审核'
                      : '缺少素材'}
                </span>
              </header>
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
              <label>
                <span>素材推荐搜索词</span>
                <textarea
                  rows={2}
                  value={shot.searchQueries.join('\n')}
                  placeholder="每行一个搜索词，建议同时提供中文和英文"
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
                <span>图片提示词（中文展示）</span>
                <textarea
                  rows={5}
                  value={shot.imagePromptZh ?? shot.imagePrompt ?? ''}
                  placeholder="描述主体、场景、构图、光线、色彩、景别、风格和画面比例"
                  onChange={(event) => updateShot(shot, {imagePromptZh: event.target.value})}
                />
              </label>
              <label>
                <span>视频提示词（中文展示）</span>
                <textarea
                  rows={7}
                  value={shot.videoPromptZh ?? shot.videoPrompt ?? ''}
                  placeholder="描述初始画面、动作顺序、场景变化、运镜、节奏、时长及一致性"
                  onChange={(event) => updateShot(shot, {videoPromptZh: event.target.value})}
                />
              </label>
              <details className="original-prompts">
                <summary>查看英文原始提示词（实际生成使用）</summary>
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
              <div className="shot-assets">
                {shot.candidates.slice(0, 3).map((candidate) => (
                  <button
                    key={candidate.id}
                    className={candidate.path === shot.selectedAsset ? 'selected' : ''}
                    onClick={() =>
                      updateShot(shot, {selectedAsset: candidate.path, status: 'needs-review'})
                    }
                  >
                    {candidate.kind === 'video' ? (
                      <video src={mediaUrl(projectId, candidate.path)} muted />
                    ) : (
                      <img src={mediaUrl(projectId, candidate.path)} alt="" />
                    )}
                    <span>{candidate.provider}</span>
                  </button>
                ))}
                <button className="add-shot-asset" onClick={onAssets}>
                  ＋ 选择素材
                </button>
              </div>
            </article>
          ))}
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
            <strong>画面预览</strong>
            <span>{project.project.width < project.project.height ? '9:16' : '16:9'}</span>
          </header>
          <div className="board-media-preview">
            {selected.assetType === 'video' ? (
              <video src={mediaUrl(projectId, selected.assetPath)} controls />
            ) : (
              <img src={mediaUrl(projectId, selected.assetPath)} alt="" />
            )}
            <strong>{selected.caption}</strong>
          </div>
        </section>
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
                {selected.shots?.filter((shot) => shot.status === 'ready').length ?? 0} 已就绪
              </dd>
            </div>
            <div>
              <dt>布局</dt>
              <dd>{selected.layout}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </section>
  );
};
