import {useEffect, useMemo, useRef, useState} from 'react';
import type {InputHTMLAttributes} from 'react';
import type {AssetLibrary, AssetMetadata} from '../../media/asset-library';
import {useStudioStore} from '../store';
import type {AssetSelectionTarget} from '../asset-selection';

type Props = {
  open: boolean;
  projectId: string;
  canApply: boolean;
  selectionTarget: AssetSelectionTarget | null;
  onClose: () => void;
};

const sourceLabels: Record<AssetMetadata['source'], string> = {
  local: '本地素材',
  generated: 'AI 生成',
  online: '外部素材',
};

export const AssetLibraryPanel = ({open, projectId, canApply, selectionTarget, onClose}: Props) => {
  const {selectedSceneId, replaceSceneAsset, updateVisualShot} = useStudioStore();
  const [assets, setAssets] = useState<AssetMetadata[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [targetDirectory, setTargetDirectory] = useState('imported');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch('/api/assets/library?scope=all')
      .then((response) => response.json())
      .then((library: AssetLibrary) => setAssets(library.assets));

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return assets.filter((asset) => {
      if (filter !== 'all' && asset.type !== filter) return false;
      if (projectFilter !== 'all' && asset.projectId !== projectFilter) return false;
      if (!term) return true;
      return [asset.name, ...asset.keywords].join(' ').toLocaleLowerCase().includes(term);
    });
  }, [assets, filter, projectFilter, query]);
  const projects = useMemo(
    () =>
      [...new Map(assets.map((asset) => [asset.projectId, asset.projectTitle])).entries()].filter(
        (entry): entry is [string, string] => Boolean(entry[0] && entry[1]),
      ),
    [assets],
  );

  const apply = async (asset: AssetMetadata) => {
    if (!canApply || (!selectedSceneId && !selectionTarget) || asset.type === 'audio') return;
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
    if (selectedAsset.type === 'audio') return;
    if (selectionTarget) {
      updateVisualShot(selectionTarget.sceneId, selectionTarget.shotId, {
        selectedAsset: selectedAsset.path,
        selectionCleared: false,
        sourceStart: 0,
        sourceEnd: selectedAsset.duration,
        status: 'ready',
      });
    } else if (selectedSceneId) {
      replaceSceneAsset(selectedSceneId, selectedAsset.path, selectedAsset.type);
    }
    onClose();
  };

  const upload = async (file: File, reload = true) => {
    setUploading(true);
    try {
      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: {
          'X-File-Name': encodeURIComponent(file.name),
          'X-Target-Directory': encodeURIComponent(targetDirectory),
        },
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
      if (reload) await load();
    } finally {
      setUploading(false);
    }
  };
  const uploadFolder = async (files: FileList) => {
    setUploading(true);
    setMessage(`正在导入 ${files.length} 个文件…`);
    try {
      for (const file of Array.from(files)) await upload(file, false);
      await load();
      setMessage(`已导入 ${files.length} 个文件`);
    } finally {
      setUploading(false);
    }
  };
  const scan = async () => {
    const response = await fetch('/api/assets/scan', {method: 'POST'});
    const value = (await response.json()) as {added?: number; error?: string};
    setMessage(
      response.ok ? `扫描完成，识别到 ${value.added ?? 0} 个新素材` : (value.error ?? '扫描失败'),
    );
    if (response.ok) await load();
  };
  const openLocation = async (asset: AssetMetadata) => {
    const response = await fetch('/api/assets/open-location', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({projectId: asset.projectId, assetId: asset.id}),
    });
    if (!response.ok) setMessage('无法打开素材所在目录');
  };
  const remove = async (asset: AssetMetadata) => {
    if (!window.confirm(`确定删除素材“${asset.name}”及其磁盘文件吗？此操作无法撤销。`)) return;
    const response = await fetch('/api/assets/delete', {
      method: 'DELETE',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({projectId: asset.projectId, assetId: asset.id, deleteFile: true}),
    });
    const value = (await response.json()) as {error?: string};
    setMessage(response.ok ? `已删除“${asset.name}”` : (value.error ?? '删除失败'));
    if (response.ok) await load();
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
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">全部项目</option>
            {projects.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
          <input
            className="asset-target-directory"
            value={targetDirectory}
            onChange={(event) => setTargetDirectory(event.target.value)}
            placeholder="导入到子目录，如 imported"
            title="文件将保存到当前项目 assets 下的这个子目录"
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
          <input
            ref={folderInputRef}
            className="file-input"
            type="file"
            multiple
            {...({webkitdirectory: ''} as InputHTMLAttributes<HTMLInputElement>)}
            onChange={(event) => {
              if (event.target.files?.length) void uploadFolder(event.target.files);
            }}
          />
          <button className="primary-button" onClick={() => inputRef.current?.click()}>
            {uploading ? '导入中…' : '导入素材'}
          </button>
          <button
            className="asset-tool-button folder"
            disabled={uploading}
            onClick={() => folderInputRef.current?.click()}
          >
            <span>▣</span> 导入文件夹
          </button>
          <button className="asset-tool-button scan" onClick={() => void scan()}>
            <span>↻</span> 扫描目录
          </button>
        </div>
        {!canApply ? (
          <p className="asset-library-mode-tip">
            当前为素材管理模式；请进入脚本与分镜或素材页面后，再将素材应用到具体镜头。
          </p>
        ) : selectionTarget ? (
          <p className="asset-library-mode-tip">
            当前选择的素材将应用到指定分镜，不会替换整个段落的兜底画面。
          </p>
        ) : null}
        {message ? <p className="asset-management-message">{message}</p> : null}
        <div className="asset-grid">
          {visible.map((asset) => (
            <article key={asset.id} className="asset-card">
              <div
                className="asset-preview"
                style={{
                  aspectRatio:
                    asset.width && asset.height ? `${asset.width} / ${asset.height}` : undefined,
                }}
              >
                {asset.type === 'image' ? (
                  <img src={`/${asset.projectId ?? projectId}/${asset.path}`} alt={asset.name} />
                ) : (
                  <video src={`/${asset.projectId ?? projectId}/${asset.path}`} muted />
                )}
                <span>{asset.type === 'image' ? 'IMG' : 'VIDEO'}</span>
              </div>
              <div className="asset-info">
                <strong>{asset.name}</strong>
                <p>{asset.keywords.slice(0, 3).join(' · ') || '暂无关键词'}</p>
                <div>
                  <span className={`asset-source ${asset.source}`}>
                    {sourceLabels[asset.source]}
                  </span>
                  <span>
                    来源项目：{asset.originProjectTitle ?? asset.projectTitle ?? '当前项目'}
                  </span>
                  <span className={asset.commercialUse ? 'license-ok' : 'license-warn'}>
                    {asset.commercialUse ? '可商用' : '不可商用'}
                  </span>
                  <span>{asset.license}</span>
                </div>
                {canApply ? (
                  <button
                    disabled={!asset.commercialUse || (!selectedSceneId && !selectionTarget)}
                    onClick={() => void apply(asset)}
                  >
                    {selectionTarget ? '应用到当前分镜' : '应用到当前段落'}
                  </button>
                ) : null}
                <div className="asset-management-actions">
                  <button onClick={() => void openLocation(asset)}>打开目录</button>
                  <button className="danger" onClick={() => void remove(asset)}>
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
