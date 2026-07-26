import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {ProjectFile} from '../core/schema';
import {assetLibrarySchema, matchAsset} from '../media/asset-library';
import {createMockProviders} from './mock-provider';
import {createOpenAIProviders} from './openai-provider';
import {videoScriptSchema} from './script-schema';
import type {GenerateInput, ProviderSet, VideoScript} from './types';
import type {AiProviderId, AiProviderSetting} from './settings';

export type WorkflowInput = GenerateInput & {
  provider: 'mock' | AiProviderId;
  forceRegenerate?: boolean;
};
export type WorkflowResult = {
  project: ProjectFile;
  cacheHit: boolean;
  provider: string;
  debugPrompt?: {system: string; user: string};
};

const cacheKey = (input: WorkflowInput): string =>
  createHash('sha256')
    .update(JSON.stringify({version: 3, input}))
    .digest('hex')
    .slice(0, 20);

const providersFor = (
  input: WorkflowInput,
  providerSetting?: AiProviderSetting,
  onPrompt?: (prompt: {system: string; user: string}) => void,
): ProviderSet => {
  if (input.provider === 'mock') return createMockProviders(Math.max(10, input.targetWordCount / 4));
  const apiKey =
    providerSetting?.apiKey ||
    providerSetting?.secretKey ||
    (input.provider === 'openai' ? process.env.OPENAI_API_KEY : undefined);
  if (!apiKey) throw new Error('请先在“设置 → AI 服务”中配置并启用服务商密钥');
  const remote = createOpenAIProviders({
    apiKey,
    baseUrl: providerSetting?.baseUrl,
    textModel: providerSetting?.model || process.env.OPENAI_TEXT_MODEL,
    ttsModel: process.env.OPENAI_TTS_MODEL,
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL,
    apiMode: input.provider === 'openai' ? 'responses' : 'chat-completions',
    disableThinking: input.provider === 'deepseek',
    onPrompt,
  });
  if (input.provider === 'openai') return remote;
  const localAudio = createMockProviders(Math.max(10, input.targetWordCount / 4));
  return {...localAudio, text: remote.text};
};

const loadOrGenerateScript = async (
  input: WorkflowInput,
  providers: ProviderSet,
  cacheRoot: string,
): Promise<{script: VideoScript; cacheHit: boolean}> => {
  const file = path.join(cacheRoot, `${cacheKey(input)}-script.json`);
  if (!input.forceRegenerate) {
    try {
      return {
        script: videoScriptSchema.parse(JSON.parse(await readFile(file, 'utf8'))),
        cacheHit: true,
      };
    } catch {
      // Continue with a fresh generation when there is no reusable script.
    }
  }
  const script = await providers.text.generateScript(input);
  await writeFile(file, `${JSON.stringify(script, null, 2)}\n`, 'utf8');
  return {script, cacheHit: false};
};

export const runGenerationWorkflow = async (
  input: WorkflowInput,
  currentProject: ProjectFile,
  projectRoot: string,
  providerSetting?: AiProviderSetting,
): Promise<WorkflowResult> => {
  let debugPrompt: {system: string; user: string} | undefined;
  const providers = providersFor(input, providerSetting, (prompt) => {
    debugPrompt = prompt;
  });
  const cacheRoot = path.join(projectRoot, 'cache');
  await mkdir(cacheRoot, {recursive: true});

  const {script, cacheHit} = await loadOrGenerateScript(input, providers, cacheRoot);
  const assetLibrary = await readFile(path.join(projectRoot, 'assets.json'), 'utf8')
    .then((value) => assetLibrarySchema.parse(JSON.parse(value) as unknown).assets)
    .catch(() => []);

  const existingAssets = currentProject.scenes.map((scene) => ({
    assetPath: scene.assetPath,
    assetType: scene.assetType,
    layout: scene.layout,
    motion: scene.motion,
  }));
  const scenes = script.scenes.map((scene, index) => {
    const duration = Math.max(1.5, [...scene.narration].length / 4);
    const matchedAsset = matchAsset(assetLibrary, scene.visualPrompt);
    const fallbackVisual = existingAssets[index % Math.max(1, existingAssets.length)] ?? {
      assetPath: 'assets/scene-01.svg' as const,
      assetType: 'image' as const,
      layout: 'full-screen' as const,
      motion: 'slow-zoom-in' as const,
    };
    const visual = matchedAsset
      ? {
          assetPath: matchedAsset.path,
          assetType: matchedAsset.type === 'video' ? ('video' as const) : ('image' as const),
          layout: fallbackVisual.layout,
          motion: fallbackVisual.motion,
        }
      : fallbackVisual;
    const totalShotWeight = scene.shots.reduce((sum, shot) => sum + shot.durationWeight, 0);
    const shots = scene.shots.map((shot, shotIndex) => {
      const shotDuration = duration * (shot.durationWeight / totalShotWeight);
      return {
        id: `scene-${String(index + 1).padStart(3, '0')}-shot-${String(shotIndex + 1).padStart(2, '0')}`,
        visualPurpose: shot.visualPurpose,
        shotType: shot.shotType,
        assetStrategy: shot.assetStrategy,
        duration: Math.max(0.3, shotDuration),
        searchQueries: shot.searchQueries,
        imagePrompt: shot.imagePrompt,
        videoPrompt: shot.videoPrompt,
        selectedAsset: shotIndex === 0 && matchedAsset ? matchedAsset.path : null,
        sourceStart: 0,
        sourceEnd: shotDuration,
        status: shotIndex === 0 && matchedAsset ? ('ready' as const) : ('missing-asset' as const),
        candidates: [],
        generationTask: null,
      };
    });
    return {
      id: `scene-${String(index + 1).padStart(3, '0')}`,
      copyRole: scene.segmentType,
      narration: scene.narration,
      caption: scene.caption,
      assetQuery: scene.visualPrompt,
      duration: Math.max(0.5, duration),
      visualIntent: scene.visualIntent,
      digitalHumanEmotion: scene.digitalHumanEmotion,
      digitalHumanAction: scene.digitalHumanAction,
      digitalHumanBackground: scene.digitalHumanBackground,
      soundEffect: scene.soundEffect,
      shots,
      ...visual,
    };
  });
  const createdAt = new Date().toISOString();
  const versionId = `copy-${Date.now()}-${cacheKey(input).slice(0, 6)}`;
  const copyVersion = {
    id: versionId,
    createdAt,
    provider: input.provider,
    model: providerSetting?.model,
    title: script.title,
    topic: input.topic,
    targetWordCount: input.targetWordCount,
    hook: script.hook,
    ending: script.ending,
    scenes,
  };

  return {
    project: {
      ...currentProject,
      project: {
        ...currentProject.project,
        title: script.title,
      },
      content: {
        topic: input.topic,
        videoType: input.videoType,
        hook: script.hook,
        ending: script.ending,
      },
      style: {...currentProject.style, captionAnimation: 'fade'},
      narrationAudio: null,
      scenes,
      copyVersions: [...(currentProject.copyVersions ?? []), copyVersion],
      activeCopyVersionId: versionId,
    },
    cacheHit,
    provider: input.provider,
    debugPrompt,
  };
};
