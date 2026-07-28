import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type AiProviderId = 'openai' | 'deepseek' | 'doubao';
export type VideoProviderId = 'volcengine-pippit';

export type AiProviderSetting = {
  enabled: boolean;
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  model: string;
};

export type AiSettings = {
  activeProvider: AiProviderId;
  activeVideoProvider: VideoProviderId;
  providers: Record<AiProviderId, AiProviderSetting>;
  pixabay: {
    apiKey: string;
  };
  volcengineVideo: {
    enabled: boolean;
    accessKey: string;
    secretKey: string;
    enableWatermark: boolean;
    defaultDuration: '5s' | '10s' | '～15s' | '～30s' | '40～60s';
  };
  qiniu: {
    accessKey: string;
    secretKey: string;
    bucket: string;
    cdnDomain: string;
    uploadHost: string;
  };
};

const defaults: AiSettings = {
  activeProvider: 'openai',
  activeVideoProvider: 'volcengine-pippit',
  providers: {
    openai: {
      enabled: false,
      apiKey: '',
      secretKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.6-luna',
    },
    deepseek: {
      enabled: false,
      apiKey: '',
      secretKey: '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
    },
    doubao: {
      enabled: false,
      apiKey: '',
      secretKey: '',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: '',
    },
  },
  pixabay: {
    apiKey: '',
  },
  volcengineVideo: {
    enabled: false,
    accessKey: '',
    secretKey: '',
    enableWatermark: true,
    defaultDuration: '～15s',
  },
  qiniu: {
    accessKey: '',
    secretKey: '',
    bucket: '',
    cdnDomain: '',
    uploadHost: 'https://up-z2.qiniup.com',
  },
};

const settingsRoot = () =>
  process.env.CUT_FLOW_USER_DATA_ROOT
    ? path.resolve(process.env.CUT_FLOW_USER_DATA_ROOT)
    : path.join(process.cwd(), 'cut-flow-data');

export const aiSettingsFile = () => path.join(settingsRoot(), 'ai-settings.json');

const mergeSettings = (saved: Partial<AiSettings>): AiSettings => {
  const settings: AiSettings = {
    activeProvider: saved.activeProvider ?? defaults.activeProvider,
    activeVideoProvider: saved.activeVideoProvider ?? defaults.activeVideoProvider,
    providers: {
      openai: {...defaults.providers.openai, ...saved.providers?.openai},
      deepseek: {...defaults.providers.deepseek, ...saved.providers?.deepseek},
      doubao: {...defaults.providers.doubao, ...saved.providers?.doubao},
    },
    pixabay: {...defaults.pixabay, ...saved.pixabay},
    volcengineVideo: {...defaults.volcengineVideo, ...saved.volcengineVideo},
    qiniu: {...defaults.qiniu, ...saved.qiniu},
  };
  settings.qiniu.uploadHost = defaults.qiniu.uploadHost;
  if (settings.providers.deepseek.model === 'deepseek-chat') {
    settings.providers.deepseek.model = 'deepseek-v4-flash';
  }
  return settings;
};

export const loadAiSettings = async (): Promise<AiSettings> => {
  try {
    const saved = JSON.parse(await readFile(aiSettingsFile(), 'utf8')) as Partial<AiSettings>;
    return mergeSettings(saved);
  } catch {
    const legacyFiles = [
      path.join(path.dirname(settingsRoot()), '.cut-flow', 'ai-settings.json'),
      path.join(os.homedir(), '.cut-flow', 'ai-settings.json'),
    ];
    for (const legacyFile of legacyFiles) {
      try {
        if (path.resolve(legacyFile) === path.resolve(aiSettingsFile())) continue;
        const migrated = mergeSettings(
          JSON.parse(await readFile(legacyFile, 'utf8')) as Partial<AiSettings>,
        );
        await mkdir(settingsRoot(), {recursive: true});
        await writeFile(aiSettingsFile(), `${JSON.stringify(migrated, null, 2)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        });
        return migrated;
      } catch {
        // Try the next legacy location.
      }
    }
    return structuredClone(defaults);
  }
};

export const saveAiSettings = async (
  input: Partial<AiSettings> & {
    providers?: Partial<Record<AiProviderId, Partial<AiProviderSetting>>>;
    pixabay?: Partial<AiSettings['pixabay']>;
    volcengineVideo?: Partial<AiSettings['volcengineVideo']>;
    qiniu?: Partial<AiSettings['qiniu']>;
  },
): Promise<AiSettings> => {
  const current = await loadAiSettings();
  const next: AiSettings = {
    activeProvider: input.activeProvider ?? current.activeProvider,
    activeVideoProvider: input.activeVideoProvider ?? current.activeVideoProvider,
    providers: structuredClone(current.providers),
    pixabay: {
      apiKey: input.pixabay?.apiKey?.trim() || current.pixabay.apiKey,
    },
    volcengineVideo: {
      enabled: input.volcengineVideo?.enabled ?? current.volcengineVideo.enabled,
      accessKey: input.volcengineVideo?.accessKey?.trim() || current.volcengineVideo.accessKey,
      secretKey: input.volcengineVideo?.secretKey?.trim() || current.volcengineVideo.secretKey,
      enableWatermark:
        input.volcengineVideo?.enableWatermark ?? current.volcengineVideo.enableWatermark,
      defaultDuration:
        input.volcengineVideo?.defaultDuration ?? current.volcengineVideo.defaultDuration,
    },
    qiniu: {
      accessKey: input.qiniu?.accessKey?.trim() || current.qiniu.accessKey,
      secretKey: input.qiniu?.secretKey?.trim() || current.qiniu.secretKey,
      bucket: (input.qiniu?.bucket ?? current.qiniu.bucket).trim(),
      cdnDomain: (input.qiniu?.cdnDomain ?? current.qiniu.cdnDomain).trim(),
      uploadHost: 'https://up-z2.qiniup.com',
    },
  };
  for (const id of ['openai', 'deepseek', 'doubao'] as const) {
    const update = input.providers?.[id];
    if (!update) continue;
    next.providers[id] = {
      ...current.providers[id],
      ...update,
      apiKey: update.apiKey?.trim() || current.providers[id].apiKey,
      secretKey: update.secretKey?.trim() || current.providers[id].secretKey,
      baseUrl: (update.baseUrl ?? current.providers[id].baseUrl).trim().replace(/\/$/, ''),
      model: (update.model ?? current.providers[id].model).trim(),
    };
  }
  await mkdir(settingsRoot(), {recursive: true});
  await writeFile(aiSettingsFile(), `${JSON.stringify(next, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(aiSettingsFile(), 0o600).catch(() => undefined);
  return next;
};

export const publicAiSettings = (settings: AiSettings) => ({
  activeProvider: settings.activeProvider,
  activeVideoProvider: settings.activeVideoProvider,
  storage: aiSettingsFile(),
  pixabay: {
    configured: Boolean(settings.pixabay.apiKey),
  },
  volcengineVideo: {
    enabled: settings.volcengineVideo.enabled,
    configured: Boolean(settings.volcengineVideo.accessKey && settings.volcengineVideo.secretKey),
    enableWatermark: settings.volcengineVideo.enableWatermark,
    defaultDuration: settings.volcengineVideo.defaultDuration,
    provider: 'volcengine-pippit' as const,
    model: 'pippit_iv2v_cvtob',
  },
  qiniu: {
    configured: Boolean(
      settings.qiniu.accessKey &&
        settings.qiniu.secretKey &&
        settings.qiniu.bucket &&
        settings.qiniu.cdnDomain,
    ),
    bucket: settings.qiniu.bucket,
    cdnDomain: settings.qiniu.cdnDomain,
    uploadHost: settings.qiniu.uploadHost,
  },
  providers: Object.fromEntries(
    Object.entries(settings.providers).map(([id, value]) => [
      id,
      {
        enabled: value.enabled,
        configured: Boolean(value.apiKey || value.secretKey),
        baseUrl: value.baseUrl,
        model: value.model,
      },
    ]),
  ),
});
