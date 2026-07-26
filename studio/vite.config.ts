import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createReadStream} from 'node:fs';
import {appendFile, mkdir, readFile, readdir, rename, stat, writeFile} from 'node:fs/promises';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'node:path';
import type {Plugin, UserConfig} from 'vite';
import {projectFileSchema, videoTypeSchema} from '../src/core/schema';
import {runGenerationWorkflow, type WorkflowInput} from '../src/ai/workflow';
import {
  generateTopicRecommendations,
  loadTopicRecommendations,
  saveTopicRecommendations,
} from '../src/ai/topic-recommendations';
import {
  createMockImageProvider,
  createMockVideoProvider,
  createOpenAIImageProvider,
  createOpenAIVideoProvider,
} from '../src/ai/media-provider';
import {assetLibrarySchema, assetMetadataSchema} from '../src/media/asset-library';
import {
  loadAiSettings,
  publicAiSettings,
  saveAiSettings,
  type AiProviderId,
} from '../src/ai/settings';

const repositoryRoot = process.env.CUT_FLOW_APP_ROOT
  ? path.resolve(process.env.CUT_FLOW_APP_ROOT)
  : path.resolve(import.meta.dirname, '..');
const workspaceRoot = process.env.CUT_FLOW_WORKSPACE_ROOT
  ? path.resolve(process.env.CUT_FLOW_WORKSPACE_ROOT)
  : repositoryRoot;
const runtimeRoot = process.env.CUT_FLOW_RUNTIME_ROOT
  ? path.resolve(process.env.CUT_FLOW_RUNTIME_ROOT)
  : repositoryRoot;
const requireFromApp = createRequire(
  path.join(process.env.CUT_FLOW_APP_ROOT ?? repositoryRoot, 'package.json'),
);
const react = (requireFromApp('@vitejs/plugin-react') as {default: () => Plugin}).default;
const projectsRoot = path.join(workspaceRoot, 'projects');
let activeProjectId = 'demo-project';
const activeProjectPaths = () => {
  const projectRoot = path.join(projectsRoot, activeProjectId);
  return {
    projectRoot,
    projectFile: path.join(projectRoot, 'project.json'),
    assetsRoot: path.join(projectRoot, 'assets'),
    assetLibraryFile: path.join(projectRoot, 'assets.json'),
  };
};

type RenderState = {
  status: 'idle' | 'running' | 'success' | 'error';
  progress: number;
  message: string;
  output?: string;
};

let renderState: RenderState = {status: 'idle', progress: 0, message: '尚未开始导出'};
let renderProcess: ChildProcessWithoutNullStreams | null = null;

const sendJson = (response: ServerResponse, status: number, value: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
};

const readBody = (request: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    request.on('data', (chunk: unknown) => {
      if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
      else if (chunk instanceof Uint8Array) chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });

const localApi = (): Plugin => ({
  name: 'cut-flow-local-api',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      void (async () => {
        const url = request.url?.split('?')[0];
        try {
          if (url === '/api/settings/ai' && request.method === 'GET') {
            sendJson(response, 200, publicAiSettings(await loadAiSettings()));
            return;
          }
          if (url === '/api/settings/ai' && request.method === 'PUT') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as Parameters<
              typeof saveAiSettings
            >[0];
            const saved = await saveAiSettings(input);
            sendJson(response, 200, publicAiSettings(saved));
            return;
          }
          if (url === '/api/topic-recommendations' && request.method === 'POST') {
            const {projectFile} = activeProjectPaths();
            const project = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            const settings = await loadAiSettings();
            const provider = settings.activeProvider;
            const providerSetting = settings.providers[provider];
            if (
              !providerSetting.enabled ||
              !(providerSetting.apiKey || providerSetting.secretKey) ||
              !providerSetting.model
            ) {
              sendJson(response, 400, {
                error: '默认 AI 服务尚未配置或启用，请先到设置页面完成配置',
              });
              return;
            }
            const topics = await generateTopicRecommendations(
              provider,
              providerSetting,
              project,
            );
            const result = {
              topics,
              provider,
              generatedAt: new Date().toISOString(),
            };
            await saveTopicRecommendations(result);
            sendJson(response, 200, {...result, heatBasis: 'ai-estimate'});
            return;
          }
          if (url === '/api/topic-recommendations' && request.method === 'GET') {
            sendJson(response, 200, {
              ...(await loadTopicRecommendations()),
              heatBasis: 'ai-estimate',
            });
            return;
          }
          if (url === '/api/projects' && request.method === 'GET') {
            const directories = await readdir(projectsRoot, {withFileTypes: true});
            const projects = (
              await Promise.all(
                directories
                  .filter((entry) => entry.isDirectory())
                  .map(async (entry) => {
                    try {
                      const file = path.join(projectsRoot, entry.name, 'project.json');
                      const project = projectFileSchema.parse(
                        JSON.parse(await readFile(file, 'utf8')) as unknown,
                      );
                      const assetLibraryPath = path.join(projectsRoot, entry.name, 'assets.json');
                      const assetCount = await readFile(assetLibraryPath, 'utf8')
                        .then(
                          (content) => assetLibrarySchema.parse(JSON.parse(content)).assets.length,
                        )
                        .catch(() => 0);
                      return {
                        id: entry.name,
                        title: project.project.title,
                        sceneCount: project.scenes.length,
                        duration: project.scenes.reduce((sum, scene) => sum + scene.duration, 0),
                        topic: project.content?.topic ?? project.project.title,
                        videoType: project.content?.videoType ?? 'science-explainer',
                        width: project.project.width,
                        height: project.project.height,
                        coverPath: project.scenes[0]?.assetPath ?? null,
                        assetCount,
                        updatedAt: (await stat(file)).mtime.toISOString(),
                      };
                    } catch {
                      return null;
                    }
                  }),
              )
            )
              .filter((project) => project !== null)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            sendJson(response, 200, {activeProjectId, projects});
            return;
          }
          if (url === '/api/projects/select' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {id?: string};
            if (!input.id || !/^[a-zA-Z0-9_-]+$/.test(input.id)) {
              sendJson(response, 400, {error: '项目标识无效'});
              return;
            }
            await stat(path.join(projectsRoot, input.id, 'project.json'));
            activeProjectId = input.id;
            sendJson(response, 200, {activeProjectId});
            return;
          }
          if (url === '/api/projects' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              title?: string;
              topic?: string;
              videoType?: string;
              description?: string;
              sourceText?: string;
              keywords?: string;
              creationMode?: string;
              platform?: string;
              width?: number;
              height?: number;
              fps?: number;
              durationTarget?: number;
              tone?: string;
              captionStyle?: string;
            };
            const title = input.title?.trim() || input.topic?.trim();
            if (!title) {
              sendJson(response, 400, {error: '请输入项目名称或主题'});
              return;
            }
            const videoType = videoTypeSchema.catch('science-explainer').parse(input.videoType);
            const creationMode = ['ai-generate', 'import-copy', 'import-script', 'blank'].includes(
              input.creationMode ?? '',
            )
              ? input.creationMode
              : 'ai-generate';
            const platform = [
              'douyin',
              'xiaohongshu',
              'wechat-video',
              'bilibili',
              'youtube',
              'custom',
            ].includes(input.platform ?? '')
              ? input.platform
              : 'douyin';
            const width = Math.max(320, Math.min(7680, Math.round(input.width ?? 1080)));
            const height = Math.max(320, Math.min(7680, Math.round(input.height ?? 1920)));
            const fps = Math.max(1, Math.min(120, Math.round(input.fps ?? 30)));
            const durationTarget = Math.max(5, Math.min(3600, input.durationTarget ?? 60));
            const id = `project-${Date.now()}-${randomUUID().slice(0, 6)}`;
            const projectRoot = path.join(projectsRoot, id);
            await mkdir(path.join(projectRoot, 'assets'), {recursive: true});
            const placeholder = 'assets/placeholder.svg';
            await writeFile(
              path.join(projectRoot, placeholder),
              `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="100%" height="100%" fill="#111827"/><text x="50%" y="50%" fill="#6de8c5" font-size="54" text-anchor="middle">CUT FLOW</text></svg>`,
              'utf8',
            );
            const project = projectFileSchema.parse({
              version: 1,
              project: {
                title,
                width,
                height,
                fps,
                durationTarget,
                creationMode,
                platform,
              },
              content: {
                topic: input.topic?.trim() ?? title,
                videoType,
                description: input.description?.trim() ?? '',
                sourceText: input.sourceText?.trim() ?? '',
                keywords: input.keywords?.trim() ?? '',
                hook: '',
                ending: '',
              },
              style: {
                template: 'game-dev-log',
                fontFamily: 'Noto Sans SC',
                captionPosition: 'bottom',
                captionAnimation: 'fade',
                transition: 'fade',
                tone: input.tone?.trim() ?? '自然清晰',
                captionStyle: input.captionStyle?.trim() ?? '粗体描边',
              },
              narrationAudio: null,
              scenes: [
                {
                  id: 'scene-001',
                  narration: '在左侧生成视频脚本，AI 会在这里创建完整文案。',
                  caption: title,
                  assetType: 'image',
                  assetPath: placeholder,
                  duration: 5,
                  layout: 'full-screen',
                  motion: 'slow-zoom-in',
                  visualIntent: '等待生成脚本和分镜',
                },
              ],
            });
            await writeFile(
              path.join(projectRoot, 'project.json'),
              `${JSON.stringify(project, null, 2)}\n`,
              'utf8',
            );
            await writeFile(
              path.join(projectRoot, 'assets.json'),
              `${JSON.stringify({version: 1, assets: []}, null, 2)}\n`,
              'utf8',
            );
            activeProjectId = id;
            sendJson(response, 201, {id, project});
            return;
          }
          const {projectRoot, projectFile, assetsRoot, assetLibraryFile} = activeProjectPaths();
          if (url === '/api/project' && request.method === 'GET') {
            sendJson(
              response,
              200,
              projectFileSchema.parse(JSON.parse(await readFile(projectFile, 'utf8')) as unknown),
            );
            return;
          }
          if (url === '/api/project' && request.method === 'PUT') {
            const parsed = projectFileSchema.safeParse(
              JSON.parse((await readBody(request)).toString('utf8')) as unknown,
            );
            if (!parsed.success) {
              sendJson(response, 400, {
                error: parsed.error.issues
                  .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                  .join('\n'),
              });
              return;
            }
            const temporary = `${projectFile}.tmp`;
            await writeFile(temporary, `${JSON.stringify(parsed.data, null, 2)}\n`, 'utf8');
            await rename(temporary, projectFile);
            sendJson(response, 200, {savedAt: new Date().toISOString()});
            return;
          }
          if (url === '/api/assets' && request.method === 'POST') {
            const contentLength = Number(request.headers['content-length'] ?? 0);
            if (contentLength > 500 * 1024 * 1024) {
              sendJson(response, 413, {error: '单个素材不能超过 500 MB'});
              return;
            }
            const rawName = request.headers['x-file-name'];
            const encodedName = Array.isArray(rawName) ? rawName.at(0) : rawName;
            let headerName = encodedName;
            try {
              headerName = encodedName ? decodeURIComponent(encodedName) : undefined;
            } catch {
              headerName = encodedName;
            }
            const fileName = path
              .basename(headerName ?? 'asset.bin')
              .replace(/[^\p{L}\p{N}._-]/gu, '-');
            if (!fileName || fileName.startsWith('.')) {
              sendJson(response, 400, {error: '无效的素材文件名'});
              return;
            }
            const storedName = `${Date.now()}-${fileName}`;
            await mkdir(assetsRoot, {recursive: true});
            await writeFile(path.join(assetsRoot, storedName), await readBody(request));
            sendJson(response, 200, {assetPath: `assets/${storedName}`});
            return;
          }
          if (url === '/api/assets/library' && request.method === 'GET') {
            sendJson(
              response,
              200,
              assetLibrarySchema.parse(
                JSON.parse(await readFile(assetLibraryFile, 'utf8')) as unknown,
              ),
            );
            return;
          }
          if (url === '/api/assets/library' && request.method === 'POST') {
            const asset = assetMetadataSchema.parse(
              JSON.parse((await readBody(request)).toString('utf8')) as unknown,
            );
            const library = assetLibrarySchema.parse(
              JSON.parse(await readFile(assetLibraryFile, 'utf8')) as unknown,
            );
            const assets = [...library.assets.filter((item) => item.id !== asset.id), asset];
            const temporary = `${assetLibraryFile}.tmp`;
            await writeFile(
              temporary,
              `${JSON.stringify({version: 1, assets}, null, 2)}\n`,
              'utf8',
            );
            await rename(temporary, assetLibraryFile);
            sendJson(response, 200, {version: 1, assets});
            return;
          }
          if (url === '/api/generate' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as WorkflowInput;
            if (
              !input.topic?.trim() ||
              !['mock', 'openai', 'deepseek', 'doubao'].includes(input.provider) ||
              !Number.isFinite(input.targetWordCount) ||
              input.targetWordCount < 100 ||
              input.targetWordCount > 5000
            ) {
              sendJson(response, 400, {error: '生成参数不完整'});
              return;
            }
            const currentProject = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            input.videoType = videoTypeSchema
              .catch(currentProject.content?.videoType ?? 'science-explainer')
              .parse(input.videoType);
            const aiSettings = await loadAiSettings();
            const selectedSetting =
              input.provider === 'mock'
                ? undefined
                : aiSettings.providers[input.provider as AiProviderId];
            if (
              input.provider !== 'mock' &&
              (!selectedSetting?.enabled ||
                !(selectedSetting.apiKey || selectedSetting.secretKey) ||
                !selectedSetting.model)
            ) {
              sendJson(response, 400, {
                error: '该 AI 服务尚未完整配置，请在设置中启用并填写密钥和模型',
              });
              return;
            }
            const result = await runGenerationWorkflow(
              input,
              currentProject,
              projectRoot,
              selectedSetting,
            );
            const temporary = `${projectFile}.tmp`;
            await writeFile(temporary, `${JSON.stringify(result.project, null, 2)}\n`, 'utf8');
            await rename(temporary, projectFile);
            sendJson(response, 200, result);
            return;
          }
          if (url === '/api/shots/generate' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              sceneId?: string;
              shotId?: string;
              kind?: 'image' | 'video';
              provider?: 'mock' | 'openai';
              count?: number;
            };
            if (
              !input.sceneId ||
              !input.shotId ||
              !['image', 'video'].includes(input.kind ?? '') ||
              !['mock', 'openai'].includes(input.provider ?? 'mock')
            ) {
              sendJson(response, 400, {error: '镜头生成参数不完整'});
              return;
            }
            const kind = input.kind as 'image' | 'video';
            const providerChoice = input.provider ?? 'mock';
            if (kind === 'video' && providerChoice === 'openai') {
              sendJson(response, 400, {error: '当前尚未配置真实视频生成 Provider'});
              return;
            }
            if (providerChoice === 'openai' && !process.env.OPENAI_API_KEY) {
              sendJson(response, 400, {error: '使用 OpenAI 图片生成前请设置 OPENAI_API_KEY'});
              return;
            }
            const project = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            const scene = project.scenes.find((item) => item.id === input.sceneId);
            const shot = scene?.shots?.find((item) => item.id === input.shotId);
            if (!scene || !shot) {
              sendJson(response, 404, {error: '找不到指定视觉镜头'});
              return;
            }
            const library = await readFile(assetLibraryFile, 'utf8')
              .then((value) => assetLibrarySchema.parse(JSON.parse(value) as unknown).assets)
              .catch(() => []);
            const preferred = library
              .filter((asset) => asset.type === kind)
              .map((asset) => asset.path);
            const sceneAssetMatchesKind =
              kind === 'video'
                ? /\.(mp4|mov|webm|mkv)$/i.test(scene.assetPath)
                : /\.(png|jpe?g|webp|gif|svg)$/i.test(scene.assetPath);
            const fallbackPaths = [
              ...new Set([...preferred, ...(sceneAssetMatchesKind ? [scene.assetPath] : [])]),
            ];
            const provider =
              providerChoice === 'openai'
                ? createOpenAIImageProvider({
                    apiKey: process.env.OPENAI_API_KEY!,
                    outputDirectory: path.join(assetsRoot, 'generated'),
                    projectRelativeDirectory: 'assets/generated',
                    model: process.env.OPENAI_IMAGE_MODEL,
                    quality:
                      process.env.OPENAI_IMAGE_QUALITY === 'medium' ||
                      process.env.OPENAI_IMAGE_QUALITY === 'high'
                        ? process.env.OPENAI_IMAGE_QUALITY
                        : 'low',
                  })
                : kind === 'video'
                  ? createMockVideoProvider()
                  : createMockImageProvider();
            const previousAttempt = shot.generationTask?.attempt ?? 0;
            const generationTask = {
              id: `task-${randomUUID()}`,
              kind,
              status: 'running' as const,
              attempt: previousAttempt + 1,
              provider: provider.id,
              model: provider.model,
              error: null,
              updatedAt: new Date().toISOString(),
            };
            shot.generationTask = generationTask;
            try {
              const candidates = await provider.generate({
                shot,
                kind,
                count: Math.min(4, Math.max(1, input.count ?? 3)),
                fallbackPaths,
              });
              shot.candidates = [...shot.candidates, ...candidates];
              const generatedAssets = candidates
                .filter((candidate) => candidate.provider === 'openai-image')
                .map((candidate) => ({
                  id: `asset-${candidate.id}`,
                  name: `${shot.visualPurpose}-${candidate.id.slice(-8)}`,
                  type: 'image' as const,
                  source: 'generated' as const,
                  path: candidate.path,
                  license: 'licensed' as const,
                  commercialUse: true,
                  originalUrl: null,
                  createdAt: candidate.createdAt,
                  keywords: [...new Set([...shot.searchQueries, shot.visualPurpose])],
                  width: 1024,
                  height: 1792,
                }));
              if (generatedAssets.length) {
                const assets = [...library, ...generatedAssets];
                const temporaryLibrary = `${assetLibraryFile}.tmp`;
                await writeFile(
                  temporaryLibrary,
                  `${JSON.stringify({version: 1, assets}, null, 2)}\n`,
                  'utf8',
                );
                await rename(temporaryLibrary, assetLibraryFile);
              }
              shot.generationTask = {
                ...generationTask,
                status: 'needs-selection',
                updatedAt: new Date().toISOString(),
              };
              shot.status = 'needs-review';
            } catch (error) {
              shot.generationTask = {
                ...generationTask,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                updatedAt: new Date().toISOString(),
              };
            }
            const temporary = `${projectFile}.tmp`;
            await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
            await rename(temporary, projectFile);
            sendJson(response, 200, {shot, task: shot.generationTask});
            return;
          }
          if (url === '/api/shots/image-to-video' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              sceneId?: string;
              shotId?: string;
            };
            if (!input.sceneId || !input.shotId) {
              sendJson(response, 400, {error: '缺少场景或镜头标识'});
              return;
            }
            if (!process.env.OPENAI_API_KEY) {
              sendJson(response, 400, {error: '使用 Sora 图生视频前请设置 OPENAI_API_KEY'});
              return;
            }
            const project = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            const shot = project.scenes
              .find((scene) => scene.id === input.sceneId)
              ?.shots?.find((item) => item.id === input.shotId);
            if (!shot?.selectedAsset || !/\.(png|jpe?g|webp)$/i.test(shot.selectedAsset)) {
              sendJson(response, 400, {error: '请先选中一张 PNG、JPEG 或 WebP 图片候选'});
              return;
            }
            const provider = createOpenAIVideoProvider({
              apiKey: process.env.OPENAI_API_KEY,
              projectRoot,
              outputDirectory: path.join(assetsRoot, 'generated'),
              projectRelativeDirectory: 'assets/generated',
              model: process.env.OPENAI_VIDEO_MODEL,
            });
            const task = {
              id: `task-${randomUUID()}`,
              kind: 'image-to-video' as const,
              status: 'queued' as const,
              attempt: (shot.generationTask?.attempt ?? 0) + 1,
              provider: provider.id,
              model: provider.model,
              error: null,
              updatedAt: new Date().toISOString(),
            };
            shot.generationTask = task;
            const temporary = `${projectFile}.tmp`;
            await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
            await rename(temporary, projectFile);
            sendJson(response, 202, {task});

            void provider
              .generate({shot, kind: 'video', count: 1, fallbackPaths: []})
              .then(async (candidates) => {
                const latest = projectFileSchema.parse(
                  JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
                );
                const latestShot = latest.scenes
                  .find((scene) => scene.id === input.sceneId)
                  ?.shots?.find((item) => item.id === input.shotId);
                if (!latestShot) return;
                latestShot.candidates = [...latestShot.candidates, ...candidates];
                latestShot.generationTask = {
                  ...task,
                  status: 'needs-selection',
                  updatedAt: new Date().toISOString(),
                };
                latestShot.status = 'needs-review';
                const library = await readFile(assetLibraryFile, 'utf8')
                  .then((value) => assetLibrarySchema.parse(JSON.parse(value) as unknown))
                  .catch(() => assetLibrarySchema.parse({version: 1, assets: []}));
                library.assets.push(
                  ...candidates.map((candidate) => ({
                    id: `asset-${candidate.id}`,
                    name: `${latestShot.visualPurpose}-视频`,
                    type: 'video' as const,
                    source: 'generated' as const,
                    path: candidate.path,
                    license: 'licensed' as const,
                    commercialUse: true,
                    originalUrl: null,
                    createdAt: candidate.createdAt,
                    keywords: latestShot.searchQueries,
                    duration: 8,
                  })),
                );
                await writeFile(assetLibraryFile, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
                await writeFile(projectFile, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
              })
              .catch(async (error: unknown) => {
                const latest = projectFileSchema.parse(
                  JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
                );
                const latestShot = latest.scenes
                  .find((scene) => scene.id === input.sceneId)
                  ?.shots?.find((item) => item.id === input.shotId);
                if (!latestShot) return;
                latestShot.generationTask = {
                  ...task,
                  status: 'failed',
                  error: error instanceof Error ? error.message : String(error),
                  updatedAt: new Date().toISOString(),
                };
                await writeFile(projectFile, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
              });
            return;
          }
          if (url === '/api/shots/select' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              sceneId?: string;
              shotId?: string;
              candidateId?: string;
            };
            const project = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            const shot = project.scenes
              .find((item) => item.id === input.sceneId)
              ?.shots?.find((item) => item.id === input.shotId);
            const candidate = shot?.candidates.find((item) => item.id === input.candidateId);
            if (!shot || !candidate) {
              sendJson(response, 404, {error: '找不到候选素材'});
              return;
            }
            shot.selectedAsset = candidate.path;
            shot.status = 'ready';
            const scene = project.scenes.find((item) => item.id === input.sceneId);
            if (candidate.kind === 'video' && scene) {
              scene.assetPath = candidate.path;
              scene.assetType = 'video';
            }
            if (shot.generationTask) {
              shot.generationTask = {
                ...shot.generationTask,
                status: 'succeeded',
                updatedAt: new Date().toISOString(),
              };
            }
            const temporary = `${projectFile}.tmp`;
            await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
            await rename(temporary, projectFile);
            sendJson(response, 200, {shot});
            return;
          }
          if (url === '/api/render' && request.method === 'POST') {
            if (renderProcess) {
              sendJson(response, 409, {error: '已有导出任务正在运行'});
              return;
            }
            renderState = {status: 'running', progress: 0, message: '正在准备视频…'};
            const renderLog = path.join(workspaceRoot, 'logs', 'render.log');
            await mkdir(path.dirname(renderLog), {recursive: true});
            await writeFile(renderLog, `${new Date().toISOString()} render started\n`, 'utf8');
            const tsxCli = path.join(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
            renderProcess = spawn(
              process.execPath,
              [
                tsxCli,
                path.join(repositoryRoot, 'scripts', 'render-video.ts'),
                '--project',
                projectFile,
                '--public-dir',
                path.join(workspaceRoot, 'projects'),
                '--runtime-root',
                runtimeRoot,
                ...(process.env.CUT_FLOW_REMOTION_BINARIES
                  ? ['--binaries-dir', process.env.CUT_FLOW_REMOTION_BINARIES]
                  : []),
                '--output',
                path.join(workspaceRoot, 'out', 'demo.mp4'),
              ],
              {
                cwd: workspaceRoot,
                env: {
                  ...process.env,
                  ...(process.versions.electron ? {ELECTRON_RUN_AS_NODE: '1'} : {}),
                  ESBUILD_BINARY_PATH:
                    process.env.CUT_FLOW_RENDER_ESBUILD_BINARY_PATH ??
                    process.env.ESBUILD_BINARY_PATH,
                },
              },
            );
            const update = (chunk: Buffer) => {
              const text = chunk.toString('utf8');
              void appendFile(renderLog, text, 'utf8');
              const matches = [...text.matchAll(/(\d{1,3})%/g)];
              const latest = matches.at(-1)?.[1];
              if (latest) renderState.progress = Math.min(100, Number(latest));
              renderState.message =
                renderState.progress > 0 ? `正在渲染 ${renderState.progress}%` : '正在打包渲染器…';
            };
            renderProcess.stdout.on('data', update);
            renderProcess.stderr.on('data', update);
            renderProcess.on('close', (code) => {
              renderState =
                code === 0
                  ? {
                      status: 'success',
                      progress: 100,
                      message: '视频导出完成',
                      output: 'out/demo.mp4',
                    }
                  : {
                      status: 'error',
                      progress: renderState.progress,
                      message: `导出失败（退出码 ${code ?? 'unknown'}）`,
                    };
              renderProcess = null;
            });
            sendJson(response, 202, renderState);
            return;
          }
          if (url === '/api/render/status' && request.method === 'GET') {
            sendJson(response, 200, renderState);
            return;
          }
          if (url === '/api/render/file' && request.method === 'GET') {
            const output = path.join(workspaceRoot, 'out', 'demo.mp4');
            response.setHeader('Content-Type', 'video/mp4');
            response.setHeader('Content-Disposition', 'attachment; filename="cut-flow-demo.mp4"');
            createReadStream(output)
              .on('error', () => sendJson(response, 404, {error: '尚无导出视频'}))
              .pipe(response);
            return;
          }
          next();
        } catch (error) {
          sendJson(response, 500, {error: error instanceof Error ? error.message : String(error)});
        }
      })();
    });
  },
});

export default {
  root: repositoryRoot,
  publicDir: path.resolve(workspaceRoot, 'projects'),
  plugins: [react(), localApi()],
  build: {outDir: path.resolve(repositoryRoot, 'dist/studio'), emptyOutDir: true},
  server: {host: '127.0.0.1', port: 4173},
} satisfies UserConfig;
