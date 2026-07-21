import {useEffect, useMemo, useRef, useState} from 'react';
import type {AssetLibrary, AssetMetadata} from '../../media/asset-library';
import {useStudioStore} from '../store';

type Props = {open: boolean; onClose: () => void};

export const AssetLibraryPanel = ({open, onClose}: Props) => {
  const {selectedSceneId, updateScene} = useStudioStore();
  const [assets, setAssets] = useState<AssetMetadata[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch('/api/assets/library')
      .then((response) => response.json())
      .then((library: AssetLibrary) => setAssets(library.assets));

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return assets.filter((asset) => {
      if (filter !== 'all' && asset.type !== filter) return false;
      if (!term) return true;
      return [asset.name, ...asset.keywords].join(' ').toLocaleLowerCase().includes(term);
    });
  }, [assets, filter, query]);

  const apply = (asset: AssetMetadata) => {
    if (!selectedSceneId || asset.type === 'audio') return;
    updateScene(selectedSceneId, {
      assetPath: asset.path,
      assetType: asset.type,
    });
    onClose();
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: {'X-File-Name': encodeURIComponent(file.name)},
        body: file,
      });
      const uploaded = (await response.json()) as {assetPath?: string; error?: string};
      if (!response.ok || !uploaded.assetPath) throw new Error(uploaded.error ?? '上传失败');
      const asset: AssetMetadata = {
        id: `asset-${crypto.randomUUID()}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        type: file.type.startsWith('video/') ? 'video' : 'image',
        source: 'local',
        path: uploaded.assetPath,
        license: 'user-owned',
        commercialUse: true,
        originalUrl: null,
        createdAt: new Date().toISOString(),
        keywords: file.name
          .replace(/\.[^.]+$/, '')
          .split(/[\s_-]+/)
          .filter(Boolean),
      };
      const saved = await fetch('/api/assets/library', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(asset),
      });
      if (!saved.ok) throw new Error('素材元数据保存失败');
      await load();
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="asset-library-backdrop" onMouseDown={onClose}>
      <section className="asset-library-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">ASSET LIBRARY</span>
            <h2>本地素材库</h2>
          </div>
          <button onClick={onClose}>×</button>
        </header>
        <div className="asset-toolbar">
          <input
            placeholder="搜索名称或关键词…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="asset-filters">
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
          <button className="primary-button" onClick={() => inputRef.current?.click()}>
            {uploading ? '导入中…' : '导入素材'}
          </button>
        </div>
        <div className="asset-grid">
          {visible.map((asset) => (
            <article key={asset.id} className="asset-card">
              <div className="asset-preview">
                {asset.type === 'image' ? (
                  <img src={`/demo-project/${asset.path}`} alt={asset.name} />
                ) : (
                  <video src={`/demo-project/${asset.path}`} muted />
                )}
                <span>{asset.type === 'image' ? 'IMG' : 'VIDEO'}</span>
              </div>
              <div className="asset-info">
                <strong>{asset.name}</strong>
                <p>{asset.keywords.slice(0, 3).join(' · ') || '暂无关键词'}</p>
                <div>
                  <span className={asset.commercialUse ? 'license-ok' : 'license-warn'}>
                    {asset.commercialUse ? '可商用' : '不可商用'}
                  </span>
                  <span>{asset.license}</span>
                </div>
                <button disabled={!asset.commercialUse} onClick={() => apply(asset)}>
                  应用到当前镜头
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
