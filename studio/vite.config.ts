import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createReadStream, readFileSync} from 'node:fs';
import {
  appendFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
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
} from '../src/ai/media-provider';
import {createVolcengineVideoProvider} from '../src/ai/volcengine-video-provider';
import {
  limitVideoPrompt,
  normalizeVideoPromptDuration,
  removeNarrationFromVideoPrompt,
  type VideoTargetDuration,
  videoTargetMaximumSeconds,
  volcengineApiDuration,
} from '../src/ai/video-generation-prompt';
import {assetLibrarySchema, assetMetadataSchema} from '../src/media/asset-library';
import type {
  PixabayMediaKind,
  PixabaySearchResponse,
  PixabaySearchResult,
} from '../src/media/pixabay';
import {loadAiSettings, publicAiSettings, saveAiSettings} from '../src/ai/settings';
import {createEditingPackage} from '../src/export/production-package';

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
const defaultConfigRoot = path.join(workspaceRoot, 'cut-flow-data');
const defaultProjectsRoot = path.join(workspaceRoot, 'projects');
const storageSettingsFile = path.join(defaultConfigRoot, 'storage-settings.json');
type StorageSettings = {
  configRoot: string;
  projectsRoot: string;
};
const savedStorageSettings = (() => {
  try {
    return JSON.parse(readFileSync(storageSettingsFile, 'utf8')) as Partial<StorageSettings>;
  } catch {
    return {};
  }
})();
let storageSettings: StorageSettings = {
  configRoot: path.resolve(savedStorageSettings.configRoot || defaultConfigRoot),
  projectsRoot: path.resolve(savedStorageSettings.projectsRoot || defaultProjectsRoot),
};
let projectsRoot = storageSettings.projectsRoot;
process.env.CUT_FLOW_USER_DATA_ROOT = storageSettings.configRoot;
const storageReady = mkdir(projectsRoot, {recursive: true}).then(() => storageSettings);
const hiddenProjectsFile = () => path.join(storageSettings.configRoot, 'hidden-projects.json');
let activeProjectId = 'demo-project';
const loadHiddenProjects = async (): Promise<string[]> =>
  readFile(hiddenProjectsFile(), 'utf8')
    .then((value) => {
      const parsed = JSON.parse(value) as {ids?: unknown};
      return Array.isArray(parsed.ids) ? parsed.ids.map(String) : [];
    })
    .catch(() => []);
const saveHiddenProjects = async (ids: string[]) => {
  await mkdir(path.dirname(hiddenProjectsFile()), {recursive: true});
  await writeFile(
    hiddenProjectsFile(),
    `${JSON.stringify({ids: [...new Set(ids)]}, null, 2)}\n`,
    'utf8',
  );
};
const directoryIsEmpty = async (directory: string): Promise<boolean> =>
  readdir(directory)
    .then((entries) => entries.length === 0)
    .catch(() => true);
const migrateDirectory = async (source: string, destination: string): Promise<void> => {
  const from = path.resolve(source);
  const to = path.resolve(destination);
  if (from === to) return;
  if (to.startsWith(`${from}${path.sep}`) || from.startsWith(`${to}${path.sep}`)) {
    throw new Error('新旧目录不能互相包含，请选择独立目录');
  }
  if (!(await directoryIsEmpty(to))) {
    throw new Error(`目标目录不是空目录：${to}`);
  }
  await mkdir(from, {recursive: true});
  await mkdir(path.dirname(to), {recursive: true});
  await cp(from, to, {recursive: true, errorOnExist: false, force: false});
};
const saveStorageSettings = async (next: StorageSettings): Promise<void> => {
  await mkdir(defaultConfigRoot, {recursive: true});
  await writeFile(storageSettingsFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  storageSettings = next;
  projectsRoot = next.projectsRoot;
  process.env.CUT_FLOW_USER_DATA_ROOT = next.configRoot;
};
const syncProjectTitleMarker = async (
  projectRoot: string,
  projectId: string,
  title: string,
): Promise<void> => {
  const safeTitle =
    title
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 80) || '未命名项目';
  const markerName = `项目-${safeTitle}.txt`;
  const entries = await readdir(projectRoot, {withFileTypes: true}).catch(() => []);
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() && /^项目-.*\.txt$/u.test(entry.name) && entry.name !== markerName,
      )
      .map((entry) => rm(path.join(projectRoot, entry.name), {force: true})),
  );
  await writeFile(
    path.join(projectRoot, markerName),
    `项目标题：${title}\n项目 ID：${projectId}\n更新时间：${new Date().toLocaleString('zh-CN')}\n`,
    'utf8',
  );
};
const activeProjectPaths = () => {
  const projectRoot = path.join(projectsRoot, activeProjectId);
  return {
    projectRoot,
    projectFile: path.join(projectRoot, 'project.json'),
    assetsRoot: path.join(projectRoot, 'assets'),
    assetLibraryFile: path.join(projectRoot, 'assets.json'),
  };
};
const mediaExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.mp3',
  '.wav',
  '.m4a',
]);
const scanMediaFiles = async (root: string, relative = ''): Promise<string[]> => {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, {withFileTypes: true}).catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => {
      const child = path.join(relative, entry.name);
      return entry.isDirectory()
        ? scanMediaFiles(root, child)
        : Promise.resolve(
            mediaExtensions.has(path.extname(entry.name).toLowerCase()) ? [child] : [],
          );
    }),
  );
  return nested.flat();
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

const pixabayHostAllowed = (value: string): boolean => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'pixabay.com' || hostname.endsWith('.pixabay.com');
  } catch {
    return false;
  }
};

const pixabayExtension = (url: string, contentType: string | null, kind: PixabayMediaKind) => {
  const pathnameExtension = path.extname(new URL(url).pathname).toLowerCase();
  if (/^\.(jpe?g|png|webp|mp4|webm|mov)$/.test(pathnameExtension)) return pathnameExtension;
  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('webp')) return '.webp';
  if (contentType?.includes('webm')) return '.webm';
  if (contentType?.includes('quicktime')) return '.mov';
  return kind === 'image' ? '.jpg' : '.mp4';
};

const normalizePixabayResults = (value: unknown, kind: PixabayMediaKind): PixabaySearchResult[] => {
  const textValue = (input: unknown, fallback = '') =>
    typeof input === 'string' ? input : fallback;
  const hits = (value as {hits?: unknown[]})?.hits;
  if (!Array.isArray(hits)) return [];
  const results: PixabaySearchResult[] = [];
  for (const raw of hits) {
    const hit = raw as Record<string, unknown>;
    if (kind === 'image') {
      const previewUrl = textValue(hit.webformatURL) || textValue(hit.previewURL);
      const downloadUrl = textValue(hit.largeImageURL) || textValue(hit.webformatURL);
      if (!previewUrl || !downloadUrl || !hit.pageURL) continue;
      results.push({
        id: String(hit.id),
        kind,
        previewUrl,
        downloadUrl,
        pageUrl: textValue(hit.pageURL),
        author: textValue(hit.user, 'Pixabay 创作者'),
        width: Number(hit.imageWidth || hit.webformatWidth || 1),
        height: Number(hit.imageHeight || hit.webformatHeight || 1),
        views: Number(hit.views || 0),
        downloads: Number(hit.downloads || 0),
        likes: Number(hit.likes || 0),
      });
      continue;
    }
    const videos = hit.videos as
      | Record<string, {url?: string; width?: number; height?: number; thumbnail?: string}>
      | undefined;
    const media = videos?.medium ?? videos?.small ?? videos?.large ?? videos?.tiny;
    const previewUrl =
      media?.thumbnail ?? videos?.small?.thumbnail ?? videos?.large?.thumbnail ?? '';
    if (!media?.url || !previewUrl || !hit.pageURL) continue;
    results.push({
      id: String(hit.id),
      kind,
      previewUrl,
      downloadUrl: media.url,
      pageUrl: textValue(hit.pageURL),
      author: textValue(hit.user, 'Pixabay 创作者'),
      width: Number(media.width || 1),
      height: Number(media.height || 1),
      duration: Number(hit.duration || 0) || undefined,
      views: Number(hit.views || 0),
      downloads: Number(hit.downloads || 0),
      likes: Number(hit.likes || 0),
    });
  }
  return results;
};

const localApi = (): Plugin => ({
  name: 'cut-flow-local-api',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      void (async () => {
        const url = request.url?.split('?')[0];
        try {
          await storageReady;
          if (url === '/api/settings/storage' && request.method === 'GET') {
            sendJson(response, 200, {
              ...storageSettings,
              defaults: {
                configRoot: defaultConfigRoot,
                projectsRoot: defaultProjectsRoot,
              },
            });
            return;
          }
          if (url === '/api/settings/storage' && request.method === 'PUT') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              configRoot?: string;
              projectsRoot?: string;
              confirmMigration?: boolean;
            };
            const next = {
              configRoot: path.resolve(input.configRoot || storageSettings.configRoot),
              projectsRoot: path.resolve(input.projectsRoot || storageSettings.projectsRoot),
            };
            const changes = {
              configRoot: next.configRoot !== storageSettings.configRoot,
              projectsRoot: next.projectsRoot !== storageSettings.projectsRoot,
            };
            if ((changes.configRoot || changes.projectsRoot) && !input.confirmMigration) {
              sendJson(response, 409, {
                error: '更改目录需要确认迁移',
                migrationRequired: true,
                from: storageSettings,
                to: next,
              });
              return;
            }
            if (changes.configRoot) {
              await migrateDirectory(storageSettings.configRoot, next.configRoot);
            }
            if (changes.projectsRoot) {
              await migrateDirectory(storageSettings.projectsRoot, next.projectsRoot);
            }
            await saveStorageSettings(next);
            sendJson(response, 200, {
              ...next,
              defaults: {
                configRoot: defaultConfigRoot,
                projectsRoot: defaultProjectsRoot,
              },
              migrated: changes,
              restartRecommended: changes.configRoot || changes.projectsRoot,
            });
            return;
          }
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
            const topics = await generateTopicRecommendations(provider, providerSetting, project);
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
            const hiddenProjects = new Set(await loadHiddenProjects());
            const directories = await readdir(projectsRoot, {withFileTypes: true});
            const projects = (
              await Promise.all(
                directories
                  .filter((entry) => entry.isDirectory() && !hiddenProjects.has(entry.name))
                  .map(async (entry) => {
                    try {
                      const file = path.join(projectsRoot, entry.name, 'project.json');
                      const project = projectFileSchema.parse(
                        JSON.parse(await readFile(file, 'utf8')) as unknown,
                      );
                      await syncProjectTitleMarker(
                        path.join(projectsRoot, entry.name),
                        entry.name,
                        project.project.title,
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
          if (url === '/api/projects/import' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              sourcePath?: string;
            };
            const sourcePath = input.sourcePath ? path.resolve(input.sourcePath) : '';
            if (!sourcePath) {
              sendJson(response, 400, {error: '请选择要导入的项目文件夹'});
              return;
            }
            const sourceProject = projectFileSchema.parse(
              JSON.parse(await readFile(path.join(sourcePath, 'project.json'), 'utf8')) as unknown,
            );
            const safeName =
              path
                .basename(sourcePath)
                .replace(/[^a-zA-Z0-9_-]/g, '-')
                .slice(0, 40) || 'imported';
            const id = `${safeName}-${Date.now()}-${randomUUID().slice(0, 6)}`;
            const destination = path.resolve(projectsRoot, id);
            if (!destination.startsWith(`${path.resolve(projectsRoot)}${path.sep}`)) {
              sendJson(response, 400, {error: '导入目标路径无效'});
              return;
            }
            await mkdir(projectsRoot, {recursive: true});
            await cp(sourcePath, destination, {recursive: true, errorOnExist: true});
            await writeFile(
              path.join(destination, 'project.json'),
              `${JSON.stringify(sourceProject, null, 2)}\n`,
              'utf8',
            );
            await syncProjectTitleMarker(destination, id, sourceProject.project.title);
            sendJson(response, 200, {id, title: sourceProject.project.title});
            return;
          }
          const deleteProjectMatch = url?.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/);
          if (deleteProjectMatch && request.method === 'DELETE') {
            const id = deleteProjectMatch[1];
            if (!id) {
              sendJson(response, 400, {error: '项目标识无效'});
              return;
            }
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              mode?: 'hide' | 'delete';
            };
            if (input.mode === 'hide') {
              await saveHiddenProjects([...(await loadHiddenProjects()), id]);
            } else if (input.mode === 'delete') {
              const target = path.resolve(projectsRoot, id);
              if (!target.startsWith(`${path.resolve(projectsRoot)}${path.sep}`)) {
                sendJson(response, 400, {error: '项目路径无效'});
                return;
              }
              await stat(path.join(target, 'project.json'));
              await rm(target, {recursive: true, force: false});
            } else {
              sendJson(response, 400, {error: '请选择删除方式'});
              return;
            }
            sendJson(response, 200, {id, mode: input.mode});
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
            await syncProjectTitleMarker(projectRoot, id, project.project.title);
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
          if (url === '/api/export/editing-package' && request.method === 'POST') {
            const project = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            const result = await createEditingPackage(project, projectRoot);
            sendJson(response, 201, {
              status: 'success',
              message:
                result.warnings.length > 0
                  ? `剪辑生产包已生成，包含 ${result.warnings.length} 项警告`
                  : '剪辑生产包已生成',
              output: result.outputDirectory,
              copiedAssets: result.copiedAssets,
              warnings: result.warnings,
            });
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
            await syncProjectTitleMarker(projectRoot, activeProjectId, parsed.data.project.title);
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
            const rawTarget = request.headers['x-target-directory'];
            const targetHeader = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;
            const targetDirectory = (targetHeader ? decodeURIComponent(targetHeader) : '')
              .split(/[\\/]+/u)
              .map((part) => part.replace(/[^\p{L}\p{N}._-]/gu, '-'))
              .filter((part) => part && part !== '.' && part !== '..')
              .join(path.sep);
            const outputDirectory = path.join(assetsRoot, targetDirectory);
            await mkdir(outputDirectory, {recursive: true});
            await writeFile(path.join(outputDirectory, storedName), await readBody(request));
            sendJson(response, 200, {
              assetPath: path.posix.join(
                'assets',
                targetDirectory.split(path.sep).join('/'),
                storedName,
              ),
            });
            return;
          }
          if (url === '/api/assets/library' && request.method === 'GET') {
            const scopeAll =
              new URL(request.url ?? '', 'http://localhost').searchParams.get('scope') === 'all';
            if (scopeAll) {
              const directories = await readdir(projectsRoot, {withFileTypes: true});
              const assets = (
                await Promise.all(
                  directories
                    .filter((entry) => entry.isDirectory())
                    .map(async (entry) => {
                      try {
                        const sourceProject = projectFileSchema.parse(
                          JSON.parse(
                            await readFile(
                              path.join(projectsRoot, entry.name, 'project.json'),
                              'utf8',
                            ),
                          ) as unknown,
                        );
                        const sourceLibrary = assetLibrarySchema.parse(
                          JSON.parse(
                            await readFile(
                              path.join(projectsRoot, entry.name, 'assets.json'),
                              'utf8',
                            ),
                          ) as unknown,
                        );
                        return sourceLibrary.assets.map((asset) => ({
                          ...asset,
                          width: asset.width ?? sourceProject.project.width,
                          height: asset.height ?? sourceProject.project.height,
                          projectId: entry.name,
                          projectTitle: sourceProject.project.title,
                        }));
                      } catch {
                        return [];
                      }
                    }),
                )
              ).flat();
              sendJson(response, 200, {version: 1, assets});
              return;
            }
            sendJson(
              response,
              200,
              assetLibrarySchema.parse(
                JSON.parse(await readFile(assetLibraryFile, 'utf8')) as unknown,
              ),
            );
            return;
          }
          if (url === '/api/assets/import-from-project' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              projectId?: string;
              assetId?: string;
            };
            if (
              !input.projectId ||
              path.basename(input.projectId) !== input.projectId ||
              !input.assetId
            ) {
              sendJson(response, 400, {error: '素材来源参数不完整'});
              return;
            }
            const sourceLibrary = assetLibrarySchema.parse(
              JSON.parse(
                await readFile(path.join(projectsRoot, input.projectId, 'assets.json'), 'utf8'),
              ) as unknown,
            );
            const sourceProject = projectFileSchema.parse(
              JSON.parse(
                await readFile(path.join(projectsRoot, input.projectId, 'project.json'), 'utf8'),
              ) as unknown,
            );
            const sourceAsset = sourceLibrary.assets.find((asset) => asset.id === input.assetId);
            if (!sourceAsset) {
              sendJson(response, 404, {error: '找不到来源素材'});
              return;
            }
            const sourceFile = path.resolve(projectsRoot, input.projectId, sourceAsset.path);
            const sourceRoot = path.resolve(projectsRoot, input.projectId);
            if (!sourceFile.startsWith(`${sourceRoot}${path.sep}`)) {
              sendJson(response, 400, {error: '素材路径无效'});
              return;
            }
            const storedName = `${Date.now()}-${path.basename(sourceAsset.path)}`;
            await mkdir(assetsRoot, {recursive: true});
            await cp(sourceFile, path.join(assetsRoot, storedName));
            const imported = assetMetadataSchema.parse({
              ...sourceAsset,
              id: `asset-${randomUUID()}`,
              path: `assets/${storedName}`,
              createdAt: new Date().toISOString(),
              projectId: activeProjectId,
              originProjectId: sourceAsset.originProjectId ?? input.projectId,
              originProjectTitle: sourceAsset.originProjectTitle ?? sourceProject.project.title,
            });
            const library = assetLibrarySchema.parse(
              JSON.parse(await readFile(assetLibraryFile, 'utf8')) as unknown,
            );
            library.assets.push(imported);
            await writeFile(assetLibraryFile, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
            sendJson(response, 201, {asset: imported});
            return;
          }
          if (url === '/api/assets/scan' && request.method === 'POST') {
            const library = await readFile(assetLibraryFile, 'utf8')
              .then((value) => assetLibrarySchema.parse(JSON.parse(value) as unknown))
              .catch(() => assetLibrarySchema.parse({version: 1, assets: []}));
            const knownPaths = new Set(library.assets.map((asset) => asset.path));
            const files = await scanMediaFiles(assetsRoot);
            const discovered = files
              .map((file) => {
                const assetPath = path.posix.join('assets', file.split(path.sep).join('/'));
                if (knownPaths.has(assetPath)) return null;
                const extension = path.extname(file).toLowerCase();
                const type = ['.mp4', '.mov', '.webm', '.mkv'].includes(extension)
                  ? 'video'
                  : ['.mp3', '.wav', '.m4a'].includes(extension)
                    ? 'audio'
                    : 'image';
                return assetMetadataSchema.parse({
                  id: `asset-${randomUUID()}`,
                  name: path.basename(file, extension),
                  type,
                  source: 'local',
                  path: assetPath,
                  license: 'user-owned',
                  commercialUse: true,
                  originalUrl: null,
                  createdAt: new Date().toISOString(),
                  keywords: path
                    .basename(file, extension)
                    .split(/[\s_-]+/u)
                    .filter(Boolean),
                });
              })
              .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
            library.assets.push(...discovered);
            await writeFile(assetLibraryFile, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
            sendJson(response, 200, {added: discovered.length});
            return;
          }
          if (url === '/api/assets/open-location' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              projectId?: string;
              assetId?: string;
            };
            const sourceProjectId = input.projectId ?? activeProjectId;
            if (path.basename(sourceProjectId) !== sourceProjectId) {
              sendJson(response, 400, {error: '项目标识无效'});
              return;
            }
            const library = assetLibrarySchema.parse(
              JSON.parse(
                await readFile(path.join(projectsRoot, sourceProjectId, 'assets.json'), 'utf8'),
              ) as unknown,
            );
            const asset = library.assets.find((item) => item.id === input.assetId);
            if (!asset) {
              sendJson(response, 404, {error: '找不到素材'});
              return;
            }
            const file = path.resolve(projectsRoot, sourceProjectId, asset.path);
            spawn('explorer.exe', ['/select,', file], {detached: true, stdio: 'ignore'}).unref();
            sendJson(response, 200, {opened: true});
            return;
          }
          if (url === '/api/assets/delete' && request.method === 'DELETE') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              projectId?: string;
              assetId?: string;
              deleteFile?: boolean;
            };
            const sourceProjectId = input.projectId ?? activeProjectId;
            if (path.basename(sourceProjectId) !== sourceProjectId) {
              sendJson(response, 400, {error: '项目标识无效'});
              return;
            }
            const sourceRoot = path.resolve(projectsRoot, sourceProjectId);
            const libraryFile = path.join(sourceRoot, 'assets.json');
            const library = assetLibrarySchema.parse(
              JSON.parse(await readFile(libraryFile, 'utf8')) as unknown,
            );
            const asset = library.assets.find((item) => item.id === input.assetId);
            if (!asset) {
              sendJson(response, 404, {error: '找不到素材'});
              return;
            }
            if (input.deleteFile) {
              const file = path.resolve(sourceRoot, asset.path);
              if (!file.startsWith(`${sourceRoot}${path.sep}`)) {
                sendJson(response, 400, {error: '素材路径无效'});
                return;
              }
              await rm(file, {force: true});
            }
            library.assets = library.assets.filter((item) => item.id !== input.assetId);
            await writeFile(libraryFile, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
            sendJson(response, 200, {deleted: true});
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
          if (url === '/api/pixabay/search' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              sceneId?: string;
              shotId?: string;
              query?: string;
              kind?: PixabayMediaKind;
            };
            if (!input.sceneId || !input.shotId || !['image', 'video'].includes(input.kind ?? '')) {
              sendJson(response, 400, {error: '请选择要搜索的分镜和素材类型'});
              return;
            }
            const settings = await loadAiSettings();
            if (!settings.pixabay.apiKey) {
              sendJson(response, 400, {error: '请先在设置中填写 Pixabay API Key'});
              return;
            }
            const project = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            const scene = project.scenes.find((item) => item.id === input.sceneId);
            const shot = scene?.shots?.find((item) => item.id === input.shotId);
            if (!scene || !shot) {
              sendJson(response, 404, {error: '找不到指定的分镜'});
              return;
            }
            const query =
              input.query?.trim() ||
              shot.searchQueries.find((item) => item.trim()) ||
              shot.visualPurpose.trim();
            if (!query) {
              sendJson(response, 400, {error: '该分镜没有可用的素材搜索词'});
              return;
            }
            const kind: PixabayMediaKind = input.kind === 'image' ? 'image' : 'video';
            const orientation =
              project.project.width < project.project.height ? 'vertical' : 'horizontal';
            const cacheKey = createHash('sha256')
              .update(`${kind}\n${orientation}\n${query.toLocaleLowerCase()}`)
              .digest('hex');
            const cacheRoot = path.join(storageSettings.configRoot, 'pixabay-cache');
            const cacheFile = path.join(cacheRoot, `${cacheKey}.json`);
            const cacheAge = await stat(cacheFile)
              .then((value) => Date.now() - value.mtimeMs)
              .catch(() => Number.POSITIVE_INFINITY);
            if (cacheAge < 24 * 60 * 60 * 1000) {
              const cached = JSON.parse(await readFile(cacheFile, 'utf8')) as PixabaySearchResponse;
              sendJson(response, 200, {...cached, cached: true});
              return;
            }
            const endpoint =
              kind === 'image' ? 'https://pixabay.com/api/' : 'https://pixabay.com/api/videos/';
            const parameters = new URLSearchParams({
              key: settings.pixabay.apiKey,
              q: query,
              orientation,
              safesearch: 'true',
              per_page: '12',
            });
            const pixabayResponse = await fetch(`${endpoint}?${parameters.toString()}`);
            if (!pixabayResponse.ok) {
              const detail = await pixabayResponse.text();
              throw new Error(
                `Pixabay 搜索失败（${pixabayResponse.status}）：${detail.slice(0, 180)}`,
              );
            }
            const results = normalizePixabayResults(await pixabayResponse.json(), kind);
            const payload: PixabaySearchResponse = {query, kind, cached: false, results};
            await mkdir(cacheRoot, {recursive: true});
            await writeFile(cacheFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
            sendJson(response, 200, payload);
            return;
          }
          if (url === '/api/pixabay/download' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              sceneId?: string;
              shotId?: string;
              query?: string;
              result?: PixabaySearchResult;
            };
            const result = input.result;
            if (
              !input.sceneId ||
              !input.shotId ||
              !result ||
              !['image', 'video'].includes(result.kind) ||
              !pixabayHostAllowed(result.downloadUrl) ||
              !pixabayHostAllowed(result.pageUrl)
            ) {
              sendJson(response, 400, {error: '素材信息无效，请重新搜索后再下载'});
              return;
            }
            const project = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            const scene = project.scenes.find((item) => item.id === input.sceneId);
            const shot = scene?.shots?.find((item) => item.id === input.shotId);
            if (!scene || !shot) {
              sendJson(response, 404, {error: '找不到指定的分镜'});
              return;
            }
            const library = await readFile(assetLibraryFile, 'utf8')
              .then((value) => assetLibrarySchema.parse(JSON.parse(value) as unknown))
              .catch(() => assetLibrarySchema.parse({version: 1, assets: []}));
            const existingAsset = library.assets.find(
              (asset) => asset.type === result.kind && asset.originalUrl === result.pageUrl,
            );
            if (existingAsset) {
              shot.selectedAsset = existingAsset.path;
              shot.selectedAssets = [
                ...new Set([...(shot.selectedAssets ?? []), existingAsset.path]),
              ];
              shot.status = 'ready';
              scene.assetPath = existingAsset.path;
              scene.assetType = result.kind;
              const temporaryProject = `${projectFile}.tmp`;
              await writeFile(temporaryProject, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
              await rename(temporaryProject, projectFile);
              sendJson(response, 200, {
                assetPath: existingAsset.path,
                asset: existingAsset,
                shot,
                alreadyDownloaded: true,
              });
              return;
            }
            const mediaResponse = await fetch(result.downloadUrl);
            if (!mediaResponse.ok) {
              throw new Error(`Pixabay 素材下载失败（${mediaResponse.status}）`);
            }
            const contentLength = Number(mediaResponse.headers.get('content-length') || 0);
            if (contentLength > 500 * 1024 * 1024) {
              sendJson(response, 413, {error: '该素材超过 500 MB，请在来源页面手动下载'});
              return;
            }
            const bytes = Buffer.from(await mediaResponse.arrayBuffer());
            if (bytes.byteLength > 500 * 1024 * 1024) {
              sendJson(response, 413, {error: '该素材超过 500 MB，请在来源页面手动下载'});
              return;
            }
            const extension = pixabayExtension(
              result.downloadUrl,
              mediaResponse.headers.get('content-type'),
              result.kind,
            );
            const storedName = `${Date.now()}-pixabay-${result.id}${extension}`;
            const assetPath = `assets/${storedName}`;
            await mkdir(assetsRoot, {recursive: true});
            await writeFile(path.join(assetsRoot, storedName), bytes);
            const metadata = assetMetadataSchema.parse({
              id: `pixabay-${result.kind}-${result.id}-${randomUUID()}`,
              name: `Pixabay ${result.kind === 'image' ? '图片' : '视频'} ${result.id}`,
              type: result.kind,
              source: 'online',
              path: assetPath,
              license: 'licensed',
              commercialUse: true,
              originalUrl: result.pageUrl,
              createdAt: new Date().toISOString(),
              keywords: [input.query?.trim(), 'Pixabay', result.author].filter(Boolean),
              width: result.width,
              height: result.height,
              duration: result.duration,
              author: result.author,
              sourceName: 'Pixabay',
              licenseUrl: 'https://pixabay.com/service/license-summary/',
            });
            const nextLibrary = assetLibrarySchema.parse({
              version: 1,
              assets: [...library.assets, metadata],
            });
            shot.selectedAsset = assetPath;
            shot.selectedAssets = [...new Set([...(shot.selectedAssets ?? []), assetPath])];
            shot.status = 'ready';
            scene.assetPath = assetPath;
            scene.assetType = result.kind;
            const temporaryLibrary = `${assetLibraryFile}.tmp`;
            const temporaryProject = `${projectFile}.tmp`;
            await writeFile(temporaryLibrary, `${JSON.stringify(nextLibrary, null, 2)}\n`, 'utf8');
            await writeFile(temporaryProject, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
            await rename(temporaryLibrary, assetLibraryFile);
            await rename(temporaryProject, projectFile);
            sendJson(response, 200, {assetPath, asset: metadata, shot});
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
              input.provider === 'mock' ? undefined : aiSettings.providers[input.provider];
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
            await syncProjectTitleMarker(
              projectRoot,
              activeProjectId,
              result.project.project.title,
            );
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
              provider?: 'volcengine-pippit';
              duration?: VideoTargetDuration;
              prompt?: string;
            };
            if (!input.sceneId || !input.shotId) {
              sendJson(response, 400, {error: '缺少场景或镜头标识'});
              return;
            }
            const aiSettings = await loadAiSettings();
            const providerChoice = input.provider ?? aiSettings.activeVideoProvider;
            if (providerChoice !== 'volcengine-pippit') {
              sendJson(response, 400, {error: '暂不支持所选的视频生成服务'});
              return;
            }
            if (
              !aiSettings.volcengineVideo.enabled ||
              !aiSettings.volcengineVideo.accessKey ||
              !aiSettings.volcengineVideo.secretKey
            ) {
              sendJson(response, 400, {
                error: '请先在设置中配置并启用“火山引擎 · 小云雀智能生视频”',
              });
              return;
            }
            const project = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            const shot = project.scenes
              .find((scene) => scene.id === input.sceneId)
              ?.shots?.find((item) => item.id === input.shotId);
            if (!shot) {
              sendJson(response, 404, {error: '找不到指定的分镜'});
              return;
            }
            if (
              shot.generationTask?.provider === 'volcengine-pippit-video' &&
              (shot.generationTask.status === 'queued' || shot.generationTask.status === 'running')
            ) {
              sendJson(response, 409, {
                error: '该分镜已有视频生成任务正在处理，请勿重复提交',
                task: shot.generationTask,
              });
              return;
            }
            const provider = createVolcengineVideoProvider({
              accessKey: aiSettings.volcengineVideo.accessKey,
              secretKey: aiSettings.volcengineVideo.secretKey,
              outputDirectory: path.join(assetsRoot, 'generated'),
              projectRelativeDirectory: 'assets/generated',
              ratio: project.project.width < project.project.height ? '9:16' : '16:9',
              duration: volcengineApiDuration(
                input.duration ?? aiSettings.volcengineVideo.defaultDuration,
              ),
              enableWatermark: aiSettings.volcengineVideo.enableWatermark,
            });
            const targetDuration = input.duration ?? aiSettings.volcengineVideo.defaultDuration;
            const finalPrompt = limitVideoPrompt(
              normalizeVideoPromptDuration(
                removeNarrationFromVideoPrompt(
                  input.prompt?.trim() ||
                    shot.videoPromptZh ||
                    shot.videoPrompt ||
                    shot.visualPurpose,
                  project.scenes.find((scene) => scene.id === input.sceneId)?.narration ?? '',
                  shot.visualPurpose,
                ),
                targetDuration,
              ),
            );
            const startedAt = new Date();
            const estimatedMinutes =
              targetDuration === '40～60s' ? 10 : targetDuration === '～30s' ? 7 : 5;
            const task = {
              id: `task-${randomUUID()}`,
              kind: 'image-to-video' as const,
              status: 'queued' as const,
              attempt: (shot.generationTask?.attempt ?? 0) + 1,
              provider: provider.id,
              model: provider.model,
              error: null,
              startedAt: startedAt.toISOString(),
              estimatedCompletedAt: new Date(
                startedAt.getTime() + estimatedMinutes * 60_000,
              ).toISOString(),
              updatedAt: startedAt.toISOString(),
            };
            shot.generationTask = task;
            const temporary = `${projectFile}.tmp`;
            await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
            await rename(temporary, projectFile);
            sendJson(response, 202, {task});

            void provider
              .generate({
                ...shot,
                videoPromptZh: finalPrompt,
              })
              .then(async (candidates) => {
                const latest = projectFileSchema.parse(
                  JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
                );
                const latestShot = latest.scenes
                  .find((scene) => scene.id === input.sceneId)
                  ?.shots?.find((item) => item.id === input.shotId);
                if (!latestShot) return;
                const maximumDuration = videoTargetMaximumSeconds(targetDuration);
                const completedAt = new Date().toISOString();
                candidates = candidates.map((candidate) => ({
                  ...candidate,
                  duration: maximumDuration,
                  taskId: task.id,
                  taskStatus: 'needs-selection' as const,
                  taskAttempt: task.attempt,
                  taskStartedAt: task.startedAt,
                  taskEstimatedCompletedAt: task.estimatedCompletedAt,
                  taskCompletedAt: completedAt,
                }));
                latestShot.candidates = [...latestShot.candidates, ...candidates];
                latestShot.sourceStart = 0;
                latestShot.sourceEnd = maximumDuration;
                latestShot.generationTask = {
                  ...task,
                  status: 'needs-selection',
                  completedAt,
                  updatedAt: completedAt,
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
                    duration: maximumDuration,
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
                  completedAt: new Date().toISOString(),
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
            shot.selectedAssets = [...new Set([...(shot.selectedAssets ?? []), candidate.path])];
            shot.selectionCleared = false;
            if (candidate.kind === 'video') {
              const candidateDuration =
                candidate.duration ??
                (await readFile(assetLibraryFile, 'utf8')
                  .then(
                    (value) =>
                      assetLibrarySchema
                        .parse(JSON.parse(value) as unknown)
                        .assets.find((asset) => asset.path === candidate.path)?.duration,
                  )
                  .catch(() => undefined));
              shot.sourceStart = 0;
              shot.sourceEnd = candidateDuration;
            }
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
          if (url === '/api/shots/clear-selection' && request.method === 'POST') {
            const input = JSON.parse((await readBody(request)).toString('utf8')) as {
              sceneId?: string;
              shotId?: string;
            };
            const project = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            const shot = project.scenes
              .find((scene) => scene.id === input.sceneId)
              ?.shots?.find((item) => item.id === input.shotId);
            if (!shot) {
              sendJson(response, 404, {error: '找不到指定的分镜'});
              return;
            }
            shot.selectedAsset = null;
            shot.selectedAssets = [];
            shot.selectionCleared = true;
            shot.sourceStart = 0;
            shot.sourceEnd = undefined;
            shot.status = 'missing-asset';
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
                projectsRoot,
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
  publicDir: projectsRoot,
  plugins: [react(), localApi()],
  build: {outDir: path.resolve(repositoryRoot, 'dist/studio'), emptyOutDir: true},
  server: {host: '127.0.0.1', port: 4173},
} satisfies UserConfig;
