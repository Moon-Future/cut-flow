import {useState} from 'react';
import type {ProjectFile, VisualShot} from '../../core/schema';
import type {
  PixabayMediaKind,
  PixabaySearchResponse,
  PixabaySearchResult,
} from '../../media/pixabay';
import {useStudioStore} from '../store';

type Props = {project: ProjectFile; projectId: string; onAssets: () => void};
const mediaUrl = (projectId: string, path: string) => `/${projectId}/${path}`;

export const StoryboardWorkspace = ({project, projectId, onAssets}: Props) => {
  const {selectedSceneId, selectScene, updateScene, updateVisualShot} = useStudioStore();
  const [onlineSearch, setOnlineSearch] = useState<{
    shotId: string;
    query: string;
    kind: PixabayMediaKind;
    loading: boolean;
    downloadingId?: string;
    results: PixabaySearchResult[];
    error?: string;
  } | null>(null);
  const selected =
    project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0]!;
  const selectedIndex = project.scenes.findIndex((scene) => scene.id === selected.id);
  const updateShot = (shot: VisualShot, patch: Partial<VisualShot>) =>
    updateVisualShot(selected.id, shot.id, patch);
  const aspectRatio = project.project.width < project.project.height ? '9:16' : '16:9';
  const chineseSceneDescription =
    selected.visualIntent || selected.caption || selected.narration || '与当前旁白对应的具体画面';
  const fallbackImagePromptZh = (shot: VisualShot) =>
    `${aspectRatio} 画面，${shot.visualPurpose || chineseSceneDescription}。主体位置清晰，完整呈现场景环境、关键物体和动作定格；使用稳定构图、层次明确的光线和统一色彩，采用适合内容表达的景别，高细节，为后续动态效果留出空间，不要文字、字幕、标志和水印。`;
  const fallbackVideoPromptZh = (shot: VisualShot) =>
    `${aspectRatio} 画面，约 ${Math.max(3, Math.min(8, shot.duration || 5))} 秒。初始画面展示${shot.visualPurpose || chineseSceneDescription}，主体短暂停顿后完成与旁白对应的自然动作，环境产生轻微动态；镜头先稳定建立场景，再缓慢推近或平滑横移。保持主体、物体、光线、色彩和空间布局一致，不要文字、字幕、标志和水印。`;

  const searchOnline = async (
    shot: VisualShot,
    kind: PixabayMediaKind,
    query = shot.searchQueries[0] || shot.visualPurpose,
  ) => {
    setOnlineSearch({shotId: shot.id, query, kind, loading: true, results: []});
    try {
      const response = await fetch('/api/pixabay/search', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sceneId: selected.id, shotId: shot.id, query, kind}),
      });
      const value = (await response.json()) as PixabaySearchResponse & {error?: string};
      if (!response.ok) throw new Error(value.error ?? '在线素材搜索失败');
      setOnlineSearch({
        shotId: shot.id,
        query: value.query,
        kind: value.kind,
        loading: false,
        results: value.results,
      });
    } catch (error) {
      setOnlineSearch({
        shotId: shot.id,
        query,
        kind,
        loading: false,
        results: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const downloadOnline = async (shot: VisualShot, result: PixabaySearchResult) => {
    if (!onlineSearch) return;
    setOnlineSearch({...onlineSearch, downloadingId: result.id, error: undefined});
    try {
      const response = await fetch('/api/pixabay/download', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sceneId: selected.id,
          shotId: shot.id,
          query: onlineSearch.query,
          result,
        }),
      });
      const value = (await response.json()) as {
        assetPath?: string;
        shot?: VisualShot;
        error?: string;
      };
      if (!response.ok || !value.assetPath || !value.shot) {
        throw new Error(value.error ?? '素材下载失败');
      }
      updateVisualShot(selected.id, shot.id, value.shot);
      updateScene(selected.id, {assetPath: value.assetPath, assetType: result.kind});
      setOnlineSearch({...onlineSearch, downloadingId: undefined});
    } catch (error) {
      setOnlineSearch({
        ...onlineSearch,
        downloadingId: undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

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
                  value={
                    shot.searchQueriesZh?.join('\n') ||
                    [shot.visualPurpose || chineseSceneDescription, chineseSceneDescription].join(
                      '\n',
                    )
                  }
                  placeholder="每行一个搜索词，建议同时提供中文和英文"
                  onChange={(event) =>
                    updateShot(shot, {
                      searchQueriesZh: event.target.value
                        .split('\n')
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .slice(0, 8),
                    })
                  }
                />
              </label>
              <div className="online-material-search">
                <div className="online-material-search-heading">
                  <div>
                    <strong>在线搜索素材</strong>
                    <span>使用上方英文搜索词从 Pixabay 查找图片或视频</span>
                  </div>
                  <div>
                    <button type="button" onClick={() => void searchOnline(shot, 'image')}>
                      搜索图片
                    </button>
                    <button type="button" onClick={() => void searchOnline(shot, 'video')}>
                      搜索视频
                    </button>
                  </div>
                </div>
                {onlineSearch?.shotId === shot.id ? (
                  <div className="online-material-results">
                    <div className="pixabay-search-row">
                      <input
                        aria-label="在线素材搜索词"
                        value={onlineSearch.query}
                        onChange={(event) =>
                          setOnlineSearch({...onlineSearch, query: event.target.value})
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void searchOnline(shot, onlineSearch.kind, onlineSearch.query);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={onlineSearch.loading || !onlineSearch.query.trim()}
                        onClick={() =>
                          void searchOnline(shot, onlineSearch.kind, onlineSearch.query)
                        }
                      >
                        {onlineSearch.loading ? '搜索中…' : '重新搜索'}
                      </button>
                    </div>
                    {onlineSearch.error ? (
                      <p className="candidate-error">{onlineSearch.error}</p>
                    ) : null}
                    {!onlineSearch.loading && onlineSearch.results.length ? (
                      <div className="pixabay-grid">
                        {onlineSearch.results.map((result) => (
                          <article className="pixabay-card" key={`${result.kind}-${result.id}`}>
                            <img src={result.previewUrl} alt={`${result.author} 的素材预览`} />
                            <div>
                              <strong>
                                {result.kind === 'image' ? '图片' : '视频'} · {result.width}×
                                {result.height}
                              </strong>
                              <span>{result.author}</span>
                            </div>
                            <div className="pixabay-card-actions">
                              <a href={result.pageUrl} target="_blank" rel="noreferrer">
                                查看来源
                              </a>
                              <button
                                type="button"
                                disabled={Boolean(onlineSearch.downloadingId)}
                                onClick={() => void downloadOnline(shot, result)}
                              >
                                {onlineSearch.downloadingId === result.id
                                  ? '下载中…'
                                  : '下载并使用'}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : !onlineSearch.loading && !onlineSearch.error ? (
                      <div className="pixabay-empty">没有找到素材，请更换英文搜索词</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <label>
                <span>图片提示词（中文展示）</span>
                <textarea
                  rows={5}
                  value={shot.imagePromptZh?.trim() || fallbackImagePromptZh(shot)}
                  placeholder="描述主体、场景、构图、光线、色彩、景别、风格和画面比例"
                  onChange={(event) => updateShot(shot, {imagePromptZh: event.target.value})}
                />
              </label>
              <label>
                <span>视频提示词（中文展示）</span>
                <textarea
                  rows={7}
                  value={shot.videoPromptZh?.trim() || fallbackVideoPromptZh(shot)}
                  placeholder="描述初始画面、动作顺序、场景变化、运镜、节奏、时长及一致性"
                  onChange={(event) => updateShot(shot, {videoPromptZh: event.target.value})}
                />
              </label>
              <details className="original-prompts">
                <summary>查看英文原始提示词（实际生成使用）</summary>
                <label>
                  <span>英文素材搜索词</span>
                  <textarea
                    rows={2}
                    value={shot.searchQueries.join('\n')}
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
