import {useEffect, useMemo, useState} from 'react';
import type {AssetLibrary, AssetMetadata} from '../../media/asset-library';
import type {ProjectFile} from '../../core/schema';
import {useStudioStore} from '../store';

type Props = {project: ProjectFile; projectId: string; onOpenLibrary: () => void};
export const AssetsWorkspace = ({project, projectId, onOpenLibrary}: Props) => {
  const {selectedSceneId, selectScene, replaceSceneAsset} = useStudioStore();
  const [assets, setAssets] = useState<AssetMetadata[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  useEffect(() => {
    fetch('/api/assets/library')
      .then((response) => response.json())
      .then((library: AssetLibrary) => setAssets(library.assets))
      .catch(() => setAssets([]));
  }, [projectId]);
  const visible = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.type !== 'audio' &&
          (filter === 'all' || asset.type === filter) &&
          (!query ||
            `${asset.name} ${asset.keywords.join(' ')}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [assets, filter, query],
  );
  const selected =
    project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0]!;
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
              onClick={() => selectScene(scene.id)}
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
        <div className="embedded-assets-grid">
          {visible.map((asset) => (
            <article key={asset.id}>
              <div>
                {asset.type === 'video' ? (
                  <video src={`/${projectId}/${asset.path}`} muted />
                ) : (
                  <img src={`/${projectId}/${asset.path}`} alt="" />
                )}
                <span>{asset.type === 'video' ? 'VIDEO' : 'IMG'}</span>
              </div>
              <strong>{asset.name}</strong>
              <small>{asset.keywords.slice(0, 3).join(' · ') || '本地素材'}</small>
              <button
                onClick={() =>
                  replaceSceneAsset(
                    selected.id,
                    asset.path,
                    asset.type === 'video' ? 'video' : 'image',
                  )
                }
              >
                应用到当前镜头
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
            <strong>当前镜头</strong>
            <span>{selected.assetType === 'video' ? '视频' : '图片'}</span>
          </header>
          <div className="current-asset-preview">
            {selected.assetType === 'video' ? (
              <video src={`/${projectId}/${selected.assetPath}`} controls />
            ) : (
              <img src={`/${projectId}/${selected.assetPath}`} alt="" />
            )}
          </div>
          <h3>{selected.caption}</h3>
          <p>{selected.visualIntent || '待完善画面意图'}</p>
          <dl>
            <div>
              <dt>时长</dt>
              <dd>{selected.duration.toFixed(1)} 秒</dd>
            </div>
            <div>
              <dt>历史版本</dt>
              <dd>{selected.assetHistory?.length ?? 0}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </section>
  );
};
