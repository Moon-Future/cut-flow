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
const contentSearchLinks = (query: string) => {
  const encoded = encodeURIComponent(query);
  return [
    ['YouTube', `https://www.youtube.com/results?search_query=${encoded}`],
    ['B站', `https://search.bilibili.com/all?keyword=${encoded}`],
    ['抖音', `https://www.douyin.com/search/${encoded}`],
  ] as const;
};

export const StoryboardWorkspace = ({project, projectId, onAssets}: Props) => {
  const {selectedSceneId, selectScene, updateScene, updateVisualShot, syncVisualShot} =
    useStudioStore();
  const [onlineSearch, setOnlineSearch] = useState<{
    shotId: string;
    query: string;
    kind: PixabayMediaKind;
    loading: boolean;
    downloadingId?: string;
    results: PixabaySearchResult[];
    error?: string;
  } | null>(null);
  const [generatingVideoShotId, setGeneratingVideoShotId] = useState<string | null>(null);
  const [videoGenerationError, setVideoGenerationError] = useState<{
    shotId: string;
    message: string;
  } | null>(null);
  const selected =
    project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0]!;
  const selectedIndex = project.scenes.findIndex((scene) => scene.id === selected.id);
  const updateShot = (shot: VisualShot, patch: Partial<VisualShot>) =>
    updateVisualShot(selected.id, shot.id, patch);
  const aspectRatio = project.project.width < project.project.height ? '9:16' : '16:9';
  const chineseSceneDescription =
    selected.visualIntent || selected.caption || selected.narration || '与当前旁白对应的具体画面';
  const fallbackImagePromptZh = (shot: VisualShot) => {
    const subject = `${shot.visualPurpose || chineseSceneDescription}；本段旁白重点：${selected.narration}`;
    return `${aspectRatio} 竖屏电影感画面，围绕“${subject}”设计一个有明确叙事重点的关键帧，画面必须让观众不看文字也能理解本镜头要表达的关系、变化或冲突。前景安排与主题直接相关的核心主体或关键物体，占据画面下方至中央的主要视觉区域，清楚表现材质、纹理、颜色和状态细节；中景安排承担叙事作用的人物、动作或变化过程，人物数量、身份和位置符合真实场景，面部表情、视线方向、手势和身体姿态共同指向本镜头的核心信息；背景完整交代地点、时间和环境，并加入与主题相关的道具，避免无关装饰。采用前景特写与中近景结合的稳定构图，核心主体位于视觉中心或三分线交点，人物和环境形成清晰的前、中、后景层次。定格在动作、情绪或结果最有信息量的一瞬间，突出鲜明对比和真实情绪，但不要夸张成卡通表演。使用符合场景的电影级布光，主体清晰明亮，人物面部保留自然明暗层次，背景适度虚化；色彩统一、真实、高细节，并为后续动作延展保留空间。不要抽象符号，不要无法辨认的界面文字，不要文字、字幕、标志、Logo 和水印。`;
  };
  const fallbackVideoPromptZh = (shot: VisualShot) => {
    const subject = `${shot.visualPurpose || chineseSceneDescription}；本段旁白重点：${selected.narration}`;
    const duration = Math.max(3, Math.min(8, shot.duration || 5));
    return `${aspectRatio} 竖屏电影感视频，时长约 ${duration} 秒，围绕“${subject}”完成一个有起点、变化和结果的微型镜头叙事。以对应图片作为首帧：前景核心主体、中景人物、背景环境、服装、道具位置、光线方向和色彩完全保持一致。开始 0—1 秒，镜头稳定建立场景，让观众看清主体与人物关系；1—${Math.max(2, duration - 2)} 秒，人物依次完成与旁白直接相关的自然动作，清楚表现视线、手部动作、面部情绪和身体反应，关键物体同步产生符合真实物理规律的变化；最后 1—2 秒，动作停留在最能说明观点、差异或结果的状态。镜头先保持稳定，再缓慢推近核心主体或进行小幅平滑横移，必要时轻微跟随人物动作，不大幅旋转、不突然切换场景。节奏由观察到变化再到强调结果，环境中只加入轻微且合理的动态。保持人物外貌、手指数量、服装颜色、物体结构和空间布局稳定，动作自然连贯，不新增无关人物，不让物体凭空出现或消失。使用真实电影摄影质感、清晰光影和统一色调，不要抽象特效，不要生成无法辨认的界面内容，不要文字、字幕、标志、Logo 和水印。`;
  };

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

  const generateVideo = async (shot: VisualShot) => {
    setGeneratingVideoShotId(shot.id);
    setVideoGenerationError(null);
    try {
      const response = await fetch('/api/shots/image-to-video', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sceneId: selected.id, shotId: shot.id}),
      });
      const value = (await response.json()) as {
        task?: VisualShot['generationTask'];
        error?: string;
      };
      if (!response.ok || !value.task) {
        throw new Error(value.error ?? '视频生成任务创建失败');
      }
      syncVisualShot(selected.id, shot.id, {...shot, generationTask: value.task});
      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5_000));
        const projectResponse = await fetch('/api/project');
        const latestProject = (await projectResponse.json()) as ProjectFile;
        const latestShot = latestProject.scenes
          .find((scene) => scene.id === selected.id)
          ?.shots?.find((item) => item.id === shot.id);
        if (!latestShot) continue;
        syncVisualShot(selected.id, shot.id, latestShot);
        if (
          latestShot.generationTask?.status === 'needs-selection' ||
          latestShot.generationTask?.status === 'failed'
        ) {
          if (latestShot.generationTask.status === 'failed') {
            throw new Error(latestShot.generationTask.error || '视频生成失败');
          }
          return;
        }
      }
      throw new Error('视频仍在生成，可稍后返回本页面查看结果');
    } catch (error) {
      setVideoGenerationError({
        shotId: shot.id,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setGeneratingVideoShotId(null);
    }
  };

  const selectCandidate = async (shot: VisualShot, candidateId: string) => {
    const response = await fetch('/api/shots/select', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({sceneId: selected.id, shotId: shot.id, candidateId}),
    });
    const value = (await response.json()) as {shot?: VisualShot; error?: string};
    if (!response.ok || !value.shot) {
      setVideoGenerationError({
        shotId: shot.id,
        message: value.error ?? '选择生成视频失败',
      });
      return;
    }
    syncVisualShot(selected.id, shot.id, value.shot);
    const candidate = value.shot.candidates.find((item) => item.id === candidateId);
    if (candidate?.kind === 'video') {
      updateScene(selected.id, {assetPath: candidate.path, assetType: 'video'});
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
          {selected.assetType === 'image' ? (
            <label className="image-motion-field">
              <span>图片动画效果</span>
              <select
                value={selected.motion}
                onChange={(event) =>
                  updateScene(selected.id, {
                    motion: event.target.value as ProjectFile['scenes'][number]['motion'],
                  })
                }
              >
                <option value="none">保持静态</option>
                <option value="slow-zoom-in">缓慢推近</option>
                <option value="slow-zoom-out">缓慢拉远</option>
                <option value="pan-left">缓慢向左平移</option>
                <option value="pan-right">缓慢向右平移</option>
                <option value="pan-up">缓慢向上平移</option>
                <option value="pan-down">缓慢向下平移</option>
                <option value="ken-burns-left">电影运镜：推近并左移</option>
                <option value="ken-burns-right">电影运镜：推近并右移</option>
                <option value="gentle-float">轻微漂浮</option>
              </select>
              <small>仅改变镜头运动，不会重新生成图片或消耗 AI Token</small>
            </label>
          ) : null}
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
                <span>中文主题搜索词（用于内容平台）</span>
                <textarea
                  rows={2}
                  value={
                    shot.searchQueriesZh?.join('\n') ||
                    [shot.visualPurpose || chineseSceneDescription, chineseSceneDescription].join(
                      '\n',
                    )
                  }
                  placeholder="每行一个中文主题，例如：为什么有人觉得香菜像肥皂"
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
              <div className="content-platform-search">
                <div>
                  <strong>搜索相关视频内容</strong>
                  <span>使用上面第一条中文主题词打开平台搜索结果，仅作选题和画面参考</span>
                </div>
                <div>
                  {contentSearchLinks(
                    shot.searchQueriesZh?.[0] ||
                      `${project.content?.topic || project.project.title} ${shot.visualPurpose}`,
                  ).map(([name, href]) => (
                    <a key={name} href={href} target="_blank" rel="noreferrer">
                      搜索{name}
                    </a>
                  ))}
                </div>
              </div>
              <div className="online-material-search">
                <div className="online-material-search-heading">
                  <div>
                    <strong>搜索可下载素材</strong>
                    <span>Pixabay 使用英文场景词，适合寻找可用素材，不用于搜索完整主题</span>
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
                  value={
                    (shot.imagePromptZh?.trim().length ?? 0) >= 220
                      ? shot.imagePromptZh
                      : fallbackImagePromptZh(shot)
                  }
                  placeholder="描述主体、场景、构图、光线、色彩、景别、风格和画面比例"
                  onChange={(event) => updateShot(shot, {imagePromptZh: event.target.value})}
                />
              </label>
              <label>
                <span>视频提示词（中文展示）</span>
                <textarea
                  rows={7}
                  value={
                    (shot.videoPromptZh?.trim().length ?? 0) >= 260
                      ? shot.videoPromptZh
                      : fallbackVideoPromptZh(shot)
                  }
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
                {[...shot.candidates]
                  .reverse()
                  .slice(0, 3)
                  .map((candidate) => (
                    <button
                      key={candidate.id}
                      className={candidate.path === shot.selectedAsset ? 'selected' : ''}
                      onClick={() => void selectCandidate(shot, candidate.id)}
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
                <button
                  className="generate-shot-video"
                  disabled={generatingVideoShotId === shot.id}
                  onClick={() => void generateVideo(shot)}
                >
                  {generatingVideoShotId === shot.id ? '小云雀生成中…' : '小云雀生成视频'}
                </button>
              </div>
              {shot.generationTask?.provider === 'volcengine-pippit-video' ? (
                <p className="video-generation-status">
                  任务状态：{shot.generationTask.status}
                  {shot.generationTask.status === 'needs-selection'
                    ? '，请在上方候选素材中选择生成结果'
                    : ''}
                </p>
              ) : null}
              {videoGenerationError?.shotId === shot.id ? (
                <p className="candidate-error">{videoGenerationError.message}</p>
              ) : null}
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
