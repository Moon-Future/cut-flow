import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type AiProviderId = 'openai' | 'deepseek' | 'doubao';

export type AiProviderSetting = {
  enabled: boolean;
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  model: string;
};

export type AiSettings = {
  activeProvider: AiProviderId;
  providers: Record<AiProviderId, AiProviderSetting>;
};

const defaults: AiSettings = {
  activeProvider: 'openai',
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
      model: 'deepseek-chat',
    },
    doubao: {
      enabled: false,
      apiKey: '',
      secretKey: '',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: '',
    },
  },
};

const settingsRoot = () =>
  process.env.CUT_FLOW_USER_DATA_ROOT
    ? path.resolve(process.env.CUT_FLOW_USER_DATA_ROOT)
    : path.join(os.homedir(), '.cut-flow');

export const aiSettingsFile = () => path.join(settingsRoot(), 'ai-settings.json');

export const loadAiSettings = async (): Promise<AiSettings> => {
  try {
    const saved = JSON.parse(await readFile(aiSettingsFile(), 'utf8')) as Partial<AiSettings>;
    return {
      activeProvider: saved.activeProvider ?? defaults.activeProvider,
      providers: {
        openai: {...defaults.providers.openai, ...saved.providers?.openai},
        deepseek: {...defaults.providers.deepseek, ...saved.providers?.deepseek},
        doubao: {...defaults.providers.doubao, ...saved.providers?.doubao},
      },
    };
  } catch {
    return structuredClone(defaults);
  }
};

export const saveAiSettings = async (
  input: Partial<AiSettings> & {providers?: Partial<Record<AiProviderId, Partial<AiProviderSetting>>>},
): Promise<AiSettings> => {
  const current = await loadAiSettings();
  const next: AiSettings = {
    activeProvider: input.activeProvider ?? current.activeProvider,
    providers: structuredClone(current.providers),
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
  storage: aiSettingsFile(),
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
