import {useEffect, useState} from 'react';

type ProviderId = 'openai' | 'deepseek' | 'doubao';
type PublicSettings = {
  activeProvider: ProviderId;
  activeVideoProvider: 'volcengine-pippit';
  storage: string;
  providers: Record<
    ProviderId,
    {enabled: boolean; configured: boolean; baseUrl: string; model: string}
  >;
  pixabay: {configured: boolean};
  volcengineVideo: {
    enabled: boolean;
    configured: boolean;
    enableWatermark: boolean;
    defaultDuration: '5s' | '10s' | '～15s' | '～30s' | '40～60s';
    provider: 'volcengine-pippit';
    model: string;
  };
};
type StorageSettings = {
  configRoot: string;
  projectsRoot: string;
  defaults: {configRoot: string; projectsRoot: string};
  restartRecommended?: boolean;
};

const providerMeta: Record<ProviderId, {name: string; description: string}> = {
  openai: {name: 'OpenAI', description: '支持 Responses API，可同时用于文案、配音与字幕。'},
  deepseek: {name: 'DeepSeek', description: '使用兼容接口生成文案，配音暂用本地占位音频。'},
  doubao: {name: '豆包', description: '使用火山方舟兼容接口，模型处填写推理接入点 ID。'},
};

export const SettingsWorkspace = () => {
  const hasDesktopDirectoryPicker = Boolean(
    (
      window as typeof window & {
        cutFlowDesktop?: {selectDirectory?: (dialogTitle?: string) => Promise<string | null>};
      }
    ).cutFlowDesktop?.selectDirectory,
  );
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [draft, setDraft] = useState<Record<ProviderId, {apiKey: string; secretKey: string}>>({
    openai: {apiKey: '', secretKey: ''},
    deepseek: {apiKey: '', secretKey: ''},
    doubao: {apiKey: '', secretKey: ''},
  });
  const [pixabayApiKey, setPixabayApiKey] = useState('');
  const [volcengineVideoKeys, setVolcengineVideoKeys] = useState({
    accessKey: '',
    secretKey: '',
  });
  const [storage, setStorage] = useState<StorageSettings | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings/ai')
      .then((response) => response.json())
      .then((value: PublicSettings) => setSettings(value))
      .catch(() => {
        setStatus('error');
        setMessage('无法读取本地 AI 配置');
      });
  }, []);
  useEffect(() => {
    fetch('/api/settings/storage')
      .then((response) => response.json())
      .then((value: StorageSettings) => setStorage(value))
      .catch(() => undefined);
  }, []);

  const updateProvider = (
    id: ProviderId,
    patch: Partial<PublicSettings['providers'][ProviderId]>,
  ) => {
    if (!settings) return;
    setSettings({
      ...settings,
      providers: {...settings.providers, [id]: {...settings.providers[id], ...patch}},
    });
  };

  const save = async () => {
    if (!settings) return;
    setStatus('saving');
    setMessage('');
    try {
      const response = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          activeProvider: settings.activeProvider,
          activeVideoProvider: settings.activeVideoProvider,
          providers: Object.fromEntries(
            (Object.keys(settings.providers) as ProviderId[]).map((id) => [
              id,
              {
                enabled: settings.providers[id].enabled,
                baseUrl: settings.providers[id].baseUrl,
                model: settings.providers[id].model,
                apiKey: draft[id].apiKey,
                secretKey: draft[id].secretKey,
              },
            ]),
          ),
          pixabay: {apiKey: pixabayApiKey},
          volcengineVideo: {
            ...settings.volcengineVideo,
            ...volcengineVideoKeys,
          },
        }),
      });
      const value = (await response.json()) as PublicSettings & {error?: string};
      if (!response.ok) throw new Error(value.error ?? '保存失败');
      setSettings(value);
      setPixabayApiKey('');
      setVolcengineVideoKeys({accessKey: '', secretKey: ''});
      setDraft({
        openai: {apiKey: '', secretKey: ''},
        deepseek: {apiKey: '', secretKey: ''},
        doubao: {apiKey: '', secretKey: ''},
      });
      setStatus('success');
      setMessage('AI 配置已安全保存到本机');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const saveStorage = async () => {
    if (!storage) return;
    const confirmed = window.confirm(
      `确认迁移本地数据？\n\n配置目录：\n${storage.configRoot}\n\n项目目录：\n${storage.projectsRoot}\n\n系统会复制并校验数据，原目录会保留作为备份。`,
    );
    if (!confirmed) return;
    setStatus('saving');
    setMessage('正在迁移本地数据，请勿关闭应用…');
    try {
      const response = await fetch('/api/settings/storage', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...storage, confirmMigration: true}),
      });
      const value = (await response.json()) as StorageSettings & {error?: string};
      if (!response.ok) throw new Error(value.error ?? '目录迁移失败');
      setStorage(value);
      setStatus('success');
      setMessage(
        value.restartRecommended
          ? '数据迁移完成，原目录已保留。建议重启应用后继续使用'
          : '数据目录未发生变化',
      );
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const chooseDirectory = async (field: 'configRoot' | 'projectsRoot', title: string) => {
    if (!storage) return;
    const desktop = (
      window as typeof window & {
        cutFlowDesktop?: {selectDirectory?: (dialogTitle?: string) => Promise<string | null>};
      }
    ).cutFlowDesktop;
    if (!desktop?.selectDirectory) return;
    const selected = await desktop.selectDirectory(title);
    if (selected) setStorage({...storage, [field]: selected});
  };

  if (!settings) return <div className="settings-loading">正在读取本地配置…</div>;

  return (
    <section className="settings-workspace">
      <header>
        <div>
          <span className="eyebrow">LOCAL SETTINGS</span>
          <h1>AI 服务设置</h1>
          <p>密钥只保存在本机，不会写入项目，也不会显示在页面或接口返回中。</p>
        </div>
        <button
          className="primary-button"
          disabled={status === 'saving'}
          onClick={() => void save()}
        >
          {status === 'saving' ? '正在保存…' : '保存设置'}
        </button>
      </header>

      <div className="settings-security-note">
        <b>本地安全存储</b>
        <span>{settings.storage}</span>
        <small>输入框留空表示保留已保存的密钥；页面不会回显密钥明文。</small>
      </div>

      <div className="provider-settings-list">
        <div className="settings-group-heading">
          <div>
            <strong>文案生成服务</strong>
            <p>选择默认大语言模型，用于文案、脚本和分镜内容生成。</p>
          </div>
        </div>
        {(Object.keys(providerMeta) as ProviderId[]).map((id) => {
          const provider = settings.providers[id];
          return (
            <article key={id} className={provider.enabled ? 'enabled' : ''}>
              <header>
                <div>
                  <strong>{providerMeta[id].name}</strong>
                  <p>{providerMeta[id].description}</p>
                </div>
                <label className="provider-switch">
                  <input
                    type="checkbox"
                    checked={provider.enabled}
                    onChange={(event) => updateProvider(id, {enabled: event.target.checked})}
                  />
                  <span>{provider.enabled ? '已启用' : '未启用'}</span>
                </label>
              </header>
              <div className="provider-form">
                <label>
                  <span>API 地址</span>
                  <input
                    value={provider.baseUrl}
                    onChange={(event) => updateProvider(id, {baseUrl: event.target.value})}
                  />
                </label>
                <label>
                  <span>{id === 'doubao' ? '模型 / 推理接入点 ID' : '模型'}</span>
                  <input
                    value={provider.model}
                    list={id === 'deepseek' ? 'deepseek-model-options' : undefined}
                    onChange={(event) => updateProvider(id, {model: event.target.value})}
                  />
                  {id === 'deepseek' ? (
                    <datalist id="deepseek-model-options">
                      <option value="deepseek-v4-flash" />
                      <option value="deepseek-v4-pro" />
                    </datalist>
                  ) : null}
                </label>
                <label>
                  <span>API Key / AK</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={draft[id].apiKey}
                    placeholder={provider.configured ? '已保存，留空则不修改' : '请输入密钥'}
                    onChange={(event) =>
                      setDraft({...draft, [id]: {...draft[id], apiKey: event.target.value}})
                    }
                  />
                </label>
                <label>
                  <span>Secret Key / SK（服务商需要时填写）</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={draft[id].secretKey}
                    placeholder={provider.configured ? '已保存，留空则不修改' : '选填'}
                    onChange={(event) =>
                      setDraft({...draft, [id]: {...draft[id], secretKey: event.target.value}})
                    }
                  />
                </label>
              </div>
              <label className="default-provider">
                <input
                  type="radio"
                  name="active-provider"
                  checked={settings.activeProvider === id}
                  onChange={() => setSettings({...settings, activeProvider: id})}
                />
                设为默认文案服务
              </label>
            </article>
          );
        })}
        <div className="settings-group-heading">
          <div>
            <strong>在线素材服务</strong>
            <p>配置图片和视频素材库，仅在用户主动搜索时调用。</p>
          </div>
        </div>
        <article className={settings.pixabay.configured ? 'enabled' : ''}>
          <header>
            <div>
              <strong>Pixabay 素材搜索</strong>
              <p>用于按分镜搜索词查找可预览、可下载的图片和视频素材。</p>
            </div>
            <span>{settings.pixabay.configured ? '已配置' : '未配置'}</span>
          </header>
          <div className="provider-form">
            <label>
              <span>Pixabay API Key</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pixabayApiKey}
                placeholder={
                  settings.pixabay.configured ? '已保存，留空则不修改' : '请输入 API Key'
                }
                onChange={(event) => setPixabayApiKey(event.target.value)}
              />
            </label>
          </div>
        </article>
        <div className="settings-group-heading">
          <div>
            <strong>视频生成服务</strong>
            <p>独立选择视频模型；以后新增其他服务时可在这里切换默认模型。</p>
          </div>
        </div>
        <article
          className={
            settings.volcengineVideo.enabled && settings.volcengineVideo.configured ? 'enabled' : ''
          }
        >
          <header>
            <div>
              <strong>火山引擎 · 小云雀智能生视频</strong>
              <p>根据分镜提示词生成约 15 秒视频，完成后自动下载到当前项目。</p>
            </div>
            <span>
              {settings.volcengineVideo.configured
                ? settings.volcengineVideo.enabled
                  ? '已启用'
                  : '未启用'
                : '未配置'}
            </span>
          </header>
          <div className="provider-form">
            <label>
              <span>服务 / 模型</span>
              <input value="小云雀 · pippit_iv2v_cvtob" disabled />
            </label>
            <label>
              <span>默认生成时长</span>
              <select
                value={settings.volcengineVideo.defaultDuration}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    volcengineVideo: {
                      ...settings.volcengineVideo,
                      defaultDuration: event.target.value as
                        '5s' | '10s' | '～15s' | '～30s' | '40～60s',
                    },
                  })
                }
              >
                <option value="5s">5 秒（生成约 15 秒后自动截取）</option>
                <option value="10s">10 秒（生成约 15 秒后自动截取）</option>
                <option value="～15s">约 15 秒</option>
                <option value="～30s">约 30 秒</option>
                <option value="40～60s">40～60 秒</option>
              </select>
            </label>
            <label>
              <span>Access Key（AK）</span>
              <input
                type="password"
                autoComplete="new-password"
                value={volcengineVideoKeys.accessKey}
                placeholder={
                  settings.volcengineVideo.configured ? '已保存，留空则不修改' : '请输入 AK'
                }
                onChange={(event) =>
                  setVolcengineVideoKeys({
                    ...volcengineVideoKeys,
                    accessKey: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>Secret Key（SK）</span>
              <input
                type="password"
                autoComplete="new-password"
                value={volcengineVideoKeys.secretKey}
                placeholder={
                  settings.volcengineVideo.configured ? '已保存，留空则不修改' : '请输入 SK'
                }
                onChange={(event) =>
                  setVolcengineVideoKeys({
                    ...volcengineVideoKeys,
                    secretKey: event.target.value,
                  })
                }
              />
            </label>
          </div>
          <label className="default-provider">
            <input
              type="radio"
              name="active-video-provider"
              checked={settings.activeVideoProvider === 'volcengine-pippit'}
              onChange={() => setSettings({...settings, activeVideoProvider: 'volcengine-pippit'})}
            />
            设为默认视频生成服务
          </label>
          <label className="default-provider">
            <input
              type="checkbox"
              checked={settings.volcengineVideo.enabled}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  volcengineVideo: {
                    ...settings.volcengineVideo,
                    enabled: event.target.checked,
                  },
                })
              }
            />
            启用小云雀视频生成
          </label>
          <label className="default-provider">
            <input
              type="checkbox"
              checked={settings.volcengineVideo.enableWatermark}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  volcengineVideo: {
                    ...settings.volcengineVideo,
                    enableWatermark: event.target.checked,
                  },
                })
              }
            />
            显示“AI 生成 / 小云雀 AI 生成”明水印
          </label>
        </article>
      </div>
      {storage ? (
        <section className="storage-settings-card">
          <header>
            <div>
              <strong>本地目录设置</strong>
              <p>更改目录会复制全部数据，校验成功后切换；原目录不会自动删除。</p>
            </div>
            <button disabled={status === 'saving'} onClick={() => void saveStorage()}>
              迁移并应用
            </button>
          </header>
          <label>
            <span>配置目录</span>
            <div className="storage-path-input">
              <input
                value={storage.configRoot}
                onChange={(event) => setStorage({...storage, configRoot: event.target.value})}
              />
              <button
                disabled={!hasDesktopDirectoryPicker}
                title={hasDesktopDirectoryPicker ? '打开文件夹选择器' : 'Web 版请直接输入绝对路径'}
                onClick={() => void chooseDirectory('configRoot', '选择配置目录')}
              >
                选择
              </button>
            </div>
            <small>默认：{storage.defaults.configRoot}</small>
          </label>
          <label>
            <span>项目数据目录（projects）</span>
            <div className="storage-path-input">
              <input
                value={storage.projectsRoot}
                onChange={(event) => setStorage({...storage, projectsRoot: event.target.value})}
              />
              <button
                disabled={!hasDesktopDirectoryPicker}
                title={hasDesktopDirectoryPicker ? '打开文件夹选择器' : 'Web 版请直接输入绝对路径'}
                onClick={() => void chooseDirectory('projectsRoot', '选择项目数据目录')}
              >
                选择
              </button>
            </div>
            <small>默认：{storage.defaults.projectsRoot}</small>
          </label>
          <aside>
            更改前请确保目标目录为空并有足够磁盘空间。迁移完成后建议重启应用；确认新目录数据无误后，再手动处理原目录备份。
          </aside>
        </section>
      ) : null}
      {message ? <p className={`settings-message ${status}`}>{message}</p> : null}
    </section>
  );
};
