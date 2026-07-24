import {useRef, useState} from 'react';
import type {Scene, VisualShot} from '../../core/schema';
import type {AssetMetadata} from '../../media/asset-library';
import {useStudioStore} from '../store';

const layouts: Scene['layout'][] = ['full-screen', 'center-card', 'split-top-bottom'];
const motions: Scene['motion'][] = [
  'none',
  'slow-zoom-in',
  'slow-zoom-out',
  'pan-left',
  'pan-right',
];

export const SceneEditor = () => {
  const {project, selectedSceneId, lockedSceneIds, updateScene, updateVisualShot} =
    useStudioStore();
  const [uploading, setUploading] = useState(false);
  const [generatingShotId, setGeneratingShotId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scene = project?.scenes.find((item) => item.id === selectedSceneId);
  if (!scene) return <div className="empty-inspector">选择一个镜头开始编辑</div>;
  const locked = lockedSceneIds.includes(scene.id);
  const change = <K extends keyof Scene>(key: K, value: Scene[K]) =>
    updateScene(scene.id, {[key]: value});

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: {'X-File-Name': encodeURIComponent(file.name)},
        body: file,
      });
      const value = (await response.json()) as {assetPath?: string; error?: string};
      if (!response.ok || !value.assetPath) throw new Error(value.error ?? '上传失败');
      const metadata: AssetMetadata = {
        id: `asset-${crypto.randomUUID()}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        type: file.type.startsWith('video/') ? 'video' : 'image',
        source: 'local',
        path: value.assetPath,
        license: 'user-owned',
        commercialUse: true,
        originalUrl: null,
        createdAt: new Date().toISOString(),
        keywords: file.name
          .replace(/\.[^.]+$/, '')
          .split(/[\s_-]+/)
          .filter(Boolean),
      };
      const metadataResponse = await fetch('/api/assets/library', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(metadata),
      });
      if (!metadataResponse.ok) throw new Error('素材元数据保存失败');
      change('assetPath', value.assetPath);
      change('assetType', file.type.startsWith('video/') ? 'video' : 'image');
    } finally {
      setUploading(false);
    }
  };

  const generateCandidates = async (shotId: string, kind: 'image' | 'video') => {
    setGeneratingShotId(shotId);
    try {
      const response = await fetch('/api/shots/generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sceneId: scene.id, shotId, kind, count: 3}),
      });
      const value = (await response.json()) as {shot?: VisualShot; error?: string};
      if (!response.ok || !value.shot) throw new Error(value.error ?? '候选生成失败');
      updateVisualShot(scene.id, shotId, value.shot);
    } finally {
      setGeneratingShotId(null);
    }
  };

  const selectCandidate = async (shotId: string, candidateId: string) => {
    const response = await fetch('/api/shots/select', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({sceneId: scene.id, shotId, candidateId}),
    });
    const value = (await response.json()) as {shot?: VisualShot; error?: string};
    if (!response.ok || !value.shot) throw new Error(value.error ?? '选择候选失败');
    updateVisualShot(scene.id, shotId, value.shot);
  };

  return (
    <div className="inspector-content">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">INSPECTOR</span>
          <h2>镜头属性</h2>
        </div>
        <span className={locked ? 'lock-badge locked' : 'lock-badge'}>
          {locked ? '已锁定' : '可编辑'}
        </span>
      </div>
      <fieldset disabled={locked}>
        <label>
          <span>字幕文本</span>
          <textarea
            value={scene.caption}
            rows={3}
            onChange={(event) => change('caption', event.target.value)}
          />
        </label>
        <label>
          <span>旁白内容</span>
          <textarea
            value={scene.narration}
            rows={4}
            onChange={(event) => change('narration', event.target.value)}
          />
        </label>
        <label>
          <span>画面表达目的</span>
          <textarea
            value={scene.visualIntent ?? ''}
            rows={2}
            placeholder="这个旁白段需要让观众看到什么？"
            onChange={(event) => change('visualIntent', event.target.value)}
          />
        </label>
        <div className="field-row">
          <label>
            <span>持续时间</span>
            <div className="number-field">
              <input
                type="number"
                min="0.1"
                max="300"
                step="0.1"
                value={scene.duration}
                onChange={(event) => change('duration', Number(event.target.value))}
              />
              <em>秒</em>
            </div>
          </label>
          <label>
            <span>素材类型</span>
            <select
              value={scene.assetType}
              onChange={(event) => change('assetType', event.target.value as Scene['assetType'])}
            >
              <option value="image">图片</option>
              <option value="video">视频</option>
            </select>
          </label>
        </div>
        <label>
          <span>画面布局</span>
          <select
            value={scene.layout}
            onChange={(event) => change('layout', event.target.value as Scene['layout'])}
          >
            {layouts.map((layout) => (
              <option key={layout} value={layout}>
                {layout}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>画面动效</span>
          <select
            value={scene.motion}
            onChange={(event) => change('motion', event.target.value as Scene['motion'])}
          >
            {motions.map((motion) => (
              <option key={motion} value={motion}>
                {motion}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>素材路径</span>
          <input
            value={scene.assetPath}
            onChange={(event) => change('assetPath', event.target.value)}
          />
        </label>
        <input
          ref={inputRef}
          className="file-input"
          type="file"
          accept="image/*,video/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button
          type="button"
          className="upload-button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '正在导入素材…' : '替换本地素材'}
        </button>
        {scene.shots?.length ? (
          <section className="shot-plan">
            <div className="shot-plan-heading">
              <strong>视觉镜头计划</strong>
              <span>{scene.shots.length} 个镜头</span>
            </div>
            {scene.shots.map((shot, index) => (
              <article className="shot-plan-card" key={shot.id}>
                <div className="shot-plan-meta">
                  <b>
                    #{index + 1} · {shot.shotType}
                  </b>
                  <span className={`shot-status ${shot.status}`}>
                    {shot.status === 'ready'
                      ? '素材就绪'
                      : shot.status === 'needs-review'
                        ? '待审核'
                        : '缺少素材'}
                  </span>
                </div>
                <p>{shot.visualPurpose}</p>
                <small>
                  {shot.duration.toFixed(1)} 秒 · {shot.assetStrategy}
                </small>
                <label>
                  <span>选用素材路径</span>
                  <input
                    value={shot.selectedAsset ?? ''}
                    placeholder="assets/sky.mp4"
                    onChange={(event) =>
                      updateVisualShot(scene.id, shot.id, {
                        selectedAsset: event.target.value || null,
                        status: event.target.value ? 'needs-review' : 'missing-asset',
                      })
                    }
                  />
                </label>
                <div className="field-row">
                  <label>
                    <span>源片段开始</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={shot.sourceStart}
                      onChange={(event) =>
                        updateVisualShot(scene.id, shot.id, {
                          sourceStart: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>源片段结束</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={shot.sourceEnd ?? ''}
                      onChange={(event) =>
                        updateVisualShot(scene.id, shot.id, {
                          sourceEnd: event.target.value ? Number(event.target.value) : undefined,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="candidate-actions">
                  <button
                    type="button"
                    onClick={() => void generateCandidates(shot.id, 'image')}
                    disabled={generatingShotId === shot.id}
                  >
                    {generatingShotId === shot.id ? '生成中…' : '生成 3 张图片'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateCandidates(shot.id, 'video')}
                    disabled={generatingShotId === shot.id}
                  >
                    生成视频候选
                  </button>
                  {shot.generationTask ? (
                    <span>
                      {shot.generationTask.status} · 第 {shot.generationTask.attempt} 次
                    </span>
                  ) : null}
                </div>
                {shot.candidates.length ? (
                  <div className="candidate-grid">
                    {shot.candidates.map((candidate) => (
                      <button
                        type="button"
                        className={
                          shot.selectedAsset === candidate.path ? 'candidate selected' : 'candidate'
                        }
                        key={candidate.id}
                        onClick={() => void selectCandidate(shot.id, candidate.id)}
                      >
                        {candidate.kind === 'video' ? (
                          <video src={`/demo-project/${candidate.path}`} muted />
                        ) : (
                          <img src={`/demo-project/${candidate.path}`} alt={candidate.prompt} />
                        )}
                        <span>
                          {candidate.provider} · {candidate.model}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {shot.searchQueries.length ? (
                  <div className="query-chips">
                    {shot.searchQueries.map((query) => (
                      <span key={query}>{query}</span>
                    ))}
                  </div>
                ) : null}
                {shot.imagePrompt ? (
                  <details>
                    <summary>图片生成提示词</summary>
                    <p>{shot.imagePrompt}</p>
                  </details>
                ) : null}
                {shot.videoPrompt ? (
                  <details>
                    <summary>视频生成提示词</summary>
                    <p>{shot.videoPrompt}</p>
                  </details>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}
      </fieldset>
      <div className="inspector-note">
        <strong>自动保存</strong>
        <p>修改会在 500ms 后校验并保存到项目文件。锁定镜头可避免误操作。</p>
      </div>
    </div>
  );
};
