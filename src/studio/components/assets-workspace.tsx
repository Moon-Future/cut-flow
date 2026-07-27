import {useEffect, useMemo, useState} from 'react';
import type {AssetLibrary, AssetMetadata} from '../../media/asset-library';
import type {ProjectFile} from '../../core/schema';
import {useStudioStore} from '../store';

type Props = {
  project: ProjectFile;
  projectId: string;
  initialShotId?: string | null;
  onOpenLibrary: () => void;
};
const sourceLabels: Record<AssetMetadata['source'], string> = {
  local: '本地导入',
  generated: 'AI 生成',
  online: '在线素材',
};
export const AssetsWorkspace = ({project, projectId, initialShotId, onOpenLibrary}: Props) => {
  const {selectedSceneId, selectScene, updateVisualShot, syncVisualShot} = useStudioStore();
  const [assets, setAssets] = useState<AssetMetadata[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(initialShotId ?? null);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const [projectFilter, setProjectFilter] = useState('all');
  useEffect(() => {
    fetch('/api/assets/library?scope=all')
      .then((response) => response.json())
      .then((library: AssetLibrary) => setAssets(library.assets))
      .catch(() => setAssets([]));
  }, [projectId]);
  const visible = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.type !== 'audio' &&
          (projectFilter === 'all' || asset.projectId === projectFilter) &&
          (filter === 'all' || asset.type === filter) &&
          (!query ||
            `${asset.name} ${asset.keywords.join(' ')}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [assets, filter, projectFilter, query],
  );
  const projects = useMemo(
    () =>
      [...new Map(assets.map((asset) => [asset.projectId, asset.projectTitle])).entries()].filter(
        (entry): entry is [string, string] => Boolean(entry[0] && entry[1]),
      ),
    [assets],
  );
  const selected =
    project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0]!;
  const selectedShot =
    selected.shots?.find((shot) => shot.id === selectedShotId) ?? selected.shots?.[0] ?? null;
  useEffect(() => {
    const targetShot = selected.shots?.find((shot) => shot.id === initialShotId);
    setSelectedShotId(targetShot?.id ?? selected.shots?.[0]?.id ?? null);
  }, [initialShotId, selected.id, selected.shots]);
  const selectedAssetMetadata = selectedShot?.selectedAsset
    ? (assets.find(
        (asset) => asset.projectId === projectId && asset.path === selectedShot.selectedAsset,
      ) ?? assets.find((asset) => asset.path === selectedShot.selectedAsset))
    : undefined;
  const applyAsset = async (asset: AssetMetadata) => {
    if (!selectedShot) {
      setMessage('请先选择一个分镜');
      return;
    }
    let selectedAsset = asset;
    if (asset.projectId && asset.projectId !== projectId) {
      const response = await fetch('/api/assets/import-from-project', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({projectId: asset.projectId, assetId: asset.id}),
      });
      const value = (await response.json()) as {asset?: AssetMetadata; error?: string};
      if (!response.ok || !value.asset) throw new Error(value.error ?? '跨项目复制素材失败');
      selectedAsset = value.asset;
    }
    updateVisualShot(selected.id, selectedShot.id, {
      selectedAsset: selectedAsset.path,
      selectionCleared: false,
      sourceStart: 0,
      sourceEnd: selectedAsset.duration,
      status: 'ready',
    });
    setMessage(`已将“${selectedAsset.name}”应用到当前分镜`);
  };
  const clearShotAsset = async () => {
    if (!selectedShot) return;
    const response = await fetch('/api/shots/clear-selection', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({sceneId: selected.id, shotId: selectedShot.id}),
    });
    const value = (await response.json()) as {
      shot?: NonNullable<ProjectFile['scenes'][number]['shots']>[number];
      error?: string;
    };
    if (!response.ok || !value.shot) {
      setMessage(value.error ?? '取消素材选用失败');
      return;
    }
    syncVisualShot(selected.id, selectedShot.id, value.shot);
    setMessage('已取消当前分镜的素材选用，素材库文件仍然保留');
  };
  return (
    <section className="assets-studio">
      <aside className="asset-scene-map stage-panel">
        <header>
          <div>
            <strong>项目镜头</strong>
            <span>选择需要匹配素材的段落</span>
          </div>
        </header>
        <div>
          {project.scenes.map((scene, index) => (
            <button
              key={scene.id}
              className={scene.id === selected.id ? 'active' : ''}
              onClick={() => {
                selectScene(scene.id);
                setSelectedShotId(scene.shots?.[0]?.id ?? null);
              }}
            >
              <b>{String(index + 1).padStart(2, '0')}</b>
              <span>
                <strong>{scene.caption}</strong>
                <small>{scene.assetPath.split('/').pop()}</small>
              </span>
              <em>{scene.assetType === 'video' ? '视频' : '图片'}</em>
            </button>
          ))}
        </div>
        <section className="asset-shot-targets">
          <header>
            <strong>当前段落分镜</strong>
            <span>选择要分配素材的具体分镜</span>
          </header>
          <div>
            {(selected.shots ?? []).map((shot, index) => (
              <button
                key={shot.id}
                className={shot.id === selectedShot?.id ? 'active' : ''}
                onClick={() => setSelectedShotId(shot.id)}
              >
                <b>{index + 1}</b>
                <span>
                  <strong>{shot.visualPurpose}</strong>
                  <small>{shot.selectedAsset ? '已选素材' : '缺少素材'}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>
      <main className="asset-browser stage-panel">
        <header>
          <div>
            <strong>素材库</strong>
            <span>{assets.length} 个本地素材</span>
          </div>
          <button onClick={onOpenLibrary}>＋ 导入素材</button>
        </header>
        <div className="asset-browser-toolbar">
          <input
            placeholder="搜索素材名称或关键词…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">全部项目</option>
            {projects.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
          <div>
            {(['all', 'image', 'video'] as const).map((value) => (
              <button
                key={value}
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {value === 'all' ? '全部' : value === 'image' ? '图片' : '视频'}
              </button>
            ))}
          </div>
        </div>
        {message ? <p className="asset-workspace-message">{message}</p> : null}
        <div className="embedded-assets-grid">
          {visible.map((asset) => (
            <article key={asset.id}>
              <div
                style={{
                  aspectRatio:
                    asset.width && asset.height ? `${asset.width} / ${asset.height}` : undefined,
                }}
              >
                {asset.type === 'video' ? (
                  <video src={`/${asset.projectId ?? projectId}/${asset.path}`} muted />
                ) : (
                  <img src={`/${asset.projectId ?? projectId}/${asset.path}`} alt="" />
                )}
                <span>{asset.type === 'video' ? 'VIDEO' : 'IMG'}</span>
              </div>
              <strong>{asset.name}</strong>
              <small>{asset.keywords.slice(0, 3).join(' · ') || '本地素材'}</small>
              <small>
                {sourceLabels[asset.source]} · 来源项目：
                {asset.originProjectTitle ?? asset.projectTitle ?? project.project.title}
              </small>
              <button disabled={!selectedShot} onClick={() => void applyAsset(asset)}>
                {selectedShot ? '应用到当前分镜' : '请先选择分镜'}
              </button>
            </article>
          ))}
        </div>
        {!visible.length ? (
          <div className="empty-stage-state">
            <b>□</b>
            <h3>还没有匹配的素材</h3>
            <p>导入本地图片或视频，也可以在分镜页生成 AI 候选。</p>
            <button onClick={onOpenLibrary}>导入素材</button>
          </div>
        ) : null}
      </main>
      <aside className="asset-detail">
        <section className="stage-panel">
          <header>
            <strong>当前分镜素材</strong>
            <span>{selectedShot?.selectedAsset ? '已选择' : '未选择'}</span>
          </header>
          <div className="current-asset-preview">
            {selectedShot?.selectedAsset ? (
              selectedAssetMetadata?.type === 'video' ||
              /\.(mp4|mov|webm|mkv)$/i.test(selectedShot.selectedAsset) ? (
                <video src={`/${projectId}/${selectedShot.selectedAsset}`} controls />
              ) : (
                <img src={`/${projectId}/${selectedShot.selectedAsset}`} alt="" />
              )
            ) : (
              <div className="asset-empty-preview">尚未给这个分镜选择素材</div>
            )}
          </div>
          <h3>{selectedShot?.visualPurpose ?? selected.caption}</h3>
          <p>{selected.visualIntent || '待完善画面意图'}</p>
          <dl>
            <div>
              <dt>时长</dt>
              <dd>{selectedShot?.duration.toFixed(1) ?? '—'} 秒</dd>
            </div>
            <div>
              <dt>素材状态</dt>
              <dd>{selectedShot?.selectedAsset ? '已就绪' : '待选择'}</dd>
            </div>
          </dl>
          {selectedShot?.selectedAsset ? (
            <button className="remove-shot-asset-button" onClick={() => void clearShotAsset()}>
              取消当前分镜选用
            </button>
          ) : null}
        </section>
      </aside>
    </section>
  );
};
