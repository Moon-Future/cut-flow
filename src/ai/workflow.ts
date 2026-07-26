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
import {distributeWords} from './text-utils';

export type WorkflowInput = GenerateInput & {
  provider: 'mock' | AiProviderId;
  forceRegenerate?: boolean;
};
export type WorkflowResult = {
  project: ProjectFile;
  cacheHit: boolean;
  provider: string;
  audioGenerated: boolean;
};

const cacheKey = (input: WorkflowInput): string =>
  createHash('sha256')
    .update(JSON.stringify({version: 1, input}))
    .digest('hex')
    .slice(0, 20);

const providersFor = (
  input: WorkflowInput,
  providerSetting?: AiProviderSetting,
): ProviderSet => {
  if (input.provider === 'mock') return createMockProviders(input.targetDuration);
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
  });
  if (input.provider === 'openai') return remote;
  const localAudio = createMockProviders(input.targetDuration);
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
  const providers = providersFor(input, providerSetting);
  const cacheRoot = path.join(projectRoot, 'cache');
  const audioRoot = path.join(projectRoot, 'audio');
  await mkdir(cacheRoot, {recursive: true});
  await mkdir(audioRoot, {recursive: true});

  const {script, cacheHit} = await loadOrGenerateScript(input, providers, cacheRoot);
  const narration = script.scenes.map((scene) => scene.narration).join(' ');
  const audioGenerated = input.provider === 'openai' || input.provider === 'mock';
  const transcript = audioGenerated
    ? await providers.tts.synthesize(narration).then(async (audio) => {
        const audioPath = path.join(audioRoot, 'narration.wav');
        await writeFile(audioPath, audio.audio);
        return providers.transcription.transcribe(audio.audio, narration);
      })
    : distributeWords(narration, input.targetDuration);
  const assetLibrary = await readFile(path.join(projectRoot, 'assets.json'), 'utf8')
    .then((value) => assetLibrarySchema.parse(JSON.parse(value) as unknown).assets)
    .catch(() => []);

  const suggestedTotal = script.scenes.reduce((sum, scene) => sum + scene.suggestedDuration, 0);
  let cursor = 0;
  const existingAssets = currentProject.scenes.map((scene) => ({
    assetPath: scene.assetPath,
    assetType: scene.assetType,
    layout: scene.layout,
    motion: scene.motion,
  }));
  const scenes = script.scenes.map((scene, index) => {
    const duration = input.targetDuration * (scene.suggestedDuration / suggestedTotal);
    const start = cursor;
    const end = cursor + duration;
    const words = transcript
      .filter((word) => (word.start + word.end) / 2 >= start && (word.start + word.end) / 2 < end)
      .map((word) => ({
        text: word.text,
        start: Math.max(0, word.start - start),
        end: Math.min(duration, word.end - start),
      }))
      .filter((word) => word.end > word.start);
    cursor = end;
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
      narration: scene.narration,
      caption: scene.caption,
      assetQuery: scene.visualPrompt,
      duration: Math.max(0.5, duration),
      words,
      visualIntent: scene.visualIntent,
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
        durationTarget: input.targetDuration,
      },
      content: {
        topic: input.topic,
        videoType: input.videoType,
        hook: script.hook,
        ending: script.ending,
      },
      style: {...currentProject.style, captionAnimation: 'fade'},
      narrationAudio: audioGenerated ? 'audio/narration.wav' : null,
      scenes,
      copyVersions: [...(currentProject.copyVersions ?? []), copyVersion],
      activeCopyVersionId: versionId,
    },
    cacheHit,
    provider: input.provider,
    audioGenerated,
  };
};
