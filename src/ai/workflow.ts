import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {ProjectFile} from '../core/schema';
import {assetLibrarySchema, matchAsset} from '../media/asset-library';
import {createMockProviders} from './mock-provider';
import {createOpenAIProviders} from './openai-provider';
import {videoScriptSchema} from './script-schema';
import type {GenerateInput, ProviderSet, VideoScript} from './types';

export type WorkflowInput = GenerateInput & {provider: 'mock' | 'openai'};
export type WorkflowResult = {project: ProjectFile; cacheHit: boolean; provider: string};

const cacheKey = (input: WorkflowInput): string =>
  createHash('sha256')
    .update(JSON.stringify({version: 1, input}))
    .digest('hex')
    .slice(0, 20);

const providersFor = (input: WorkflowInput): ProviderSet => {
  if (input.provider === 'mock') return createMockProviders(input.targetDuration);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('使用 OpenAI Provider 前请设置 OPENAI_API_KEY');
  return createOpenAIProviders({
    apiKey,
    textModel: process.env.OPENAI_TEXT_MODEL,
    ttsModel: process.env.OPENAI_TTS_MODEL,
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL,
  });
};

const loadOrGenerateScript = async (
  input: WorkflowInput,
  providers: ProviderSet,
  cacheRoot: string,
): Promise<{script: VideoScript; cacheHit: boolean}> => {
  const file = path.join(cacheRoot, `${cacheKey(input)}-script.json`);
  try {
    return {
      script: videoScriptSchema.parse(JSON.parse(await readFile(file, 'utf8'))),
      cacheHit: true,
    };
  } catch {
    const script = await providers.text.generateScript(input);
    await writeFile(file, `${JSON.stringify(script, null, 2)}\n`, 'utf8');
    return {script, cacheHit: false};
  }
};

export const runGenerationWorkflow = async (
  input: WorkflowInput,
  currentProject: ProjectFile,
  projectRoot: string,
): Promise<WorkflowResult> => {
  const providers = providersFor(input);
  const cacheRoot = path.join(projectRoot, 'cache');
  const audioRoot = path.join(projectRoot, 'audio');
  await mkdir(cacheRoot, {recursive: true});
  await mkdir(audioRoot, {recursive: true});

  const {script, cacheHit} = await loadOrGenerateScript(input, providers, cacheRoot);
  const narration = script.scenes.map((scene) => scene.narration).join(' ');
  const audio = await providers.tts.synthesize(narration);
  const audioPath = path.join(audioRoot, 'narration.wav');
  await writeFile(audioPath, audio.audio);
  const transcript = await providers.transcription.transcribe(audio.audio, narration);
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
    return {
      id: `scene-${String(index + 1).padStart(3, '0')}`,
      narration: scene.narration,
      caption: scene.caption,
      assetQuery: scene.visualPrompt,
      duration: Math.max(0.5, duration),
      words,
      ...visual,
    };
  });

  return {
    project: {
      ...currentProject,
      project: {
        ...currentProject.project,
        title: script.title,
        durationTarget: input.targetDuration,
      },
      style: {...currentProject.style, captionAnimation: 'fade'},
      narrationAudio: 'audio/narration.wav',
      scenes,
    },
    cacheHit,
    provider: input.provider,
  };
};
