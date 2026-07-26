import {useEffect, useState} from 'react';

type ProviderId = 'openai' | 'deepseek' | 'doubao';
type PublicSettings = {
  activeProvider: ProviderId;
  storage: string;
  providers: Record<
    ProviderId,
    {enabled: boolean; configured: boolean; baseUrl: string; model: string}
  >;
};

const providerMeta: Record<ProviderId, {name: string; description: string}> = {
  openai: {name: 'OpenAI', description: '支持 Responses API，可同时用于文案、配音与字幕。'},
  deepseek: {name: 'DeepSeek', description: '使用兼容接口生成文案，配音暂用本地占位音频。'},
  doubao: {name: '豆包', description: '使用火山方舟兼容接口，模型处填写推理接入点 ID。'},
};

export const SettingsWorkspace = () => {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [draft, setDraft] = useState<Record<ProviderId, {apiKey: string; secretKey: string}>>({
    openai: {apiKey: '', secretKey: ''},
    deepseek: {apiKey: '', secretKey: ''},
    doubao: {apiKey: '', secretKey: ''},
  });
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
        }),
      });
      const value = (await response.json()) as PublicSettings & {error?: string};
      if (!response.ok) throw new Error(value.error ?? '保存失败');
      setSettings(value);
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

  if (!settings) return <div className="settings-loading">正在读取本地配置…</div>;

  return (
    <section className="settings-workspace">
      <header>
        <div>
          <span className="eyebrow">LOCAL SETTINGS</span>
          <h1>AI 服务设置</h1>
          <p>密钥只保存在本机，不会写入项目，也不会显示在页面或接口返回中。</p>
        </div>
        <button className="primary-button" disabled={status === 'saving'} onClick={() => void save()}>
          {status === 'saving' ? '正在保存…' : '保存设置'}
        </button>
      </header>

      <div className="settings-security-note">
        <b>本地安全存储</b>
        <span>{settings.storage}</span>
        <small>输入框留空表示保留已保存的密钥；页面不会回显密钥明文。</small>
      </div>

      <div className="provider-settings-list">
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
                    onChange={(event) => updateProvider(id, {model: event.target.value})}
                  />
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
      </div>
      {message ? <p className={`settings-message ${status}`}>{message}</p> : null}
    </section>
  );
};
