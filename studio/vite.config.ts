import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';
import {projectFileSchema} from '../src/core/schema';
import {runGenerationWorkflow, type WorkflowInput} from '../src/ai/workflow';
import {assetLibrarySchema, assetMetadataSchema} from '../src/media/asset-library';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = process.env.CUT_FLOW_WORKSPACE_ROOT
  ? path.resolve(process.env.CUT_FLOW_WORKSPACE_ROOT)
  : repositoryRoot;
const runtimeRoot = process.env.CUT_FLOW_RUNTIME_ROOT
  ? path.resolve(process.env.CUT_FLOW_RUNTIME_ROOT)
  : repositoryRoot;
const projectRoot = path.join(workspaceRoot, 'projects', 'demo-project');
const projectFile = path.join(projectRoot, 'project.json');
const assetsRoot = path.join(projectRoot, 'assets');
const assetLibraryFile = path.join(projectRoot, 'assets.json');

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
          if (url === '/api/project' && request.method === 'GET') {
            sendJson(response, 200, JSON.parse(await readFile(projectFile, 'utf8')) as unknown);
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
              !['mock', 'openai'].includes(input.provider) ||
              !Number.isFinite(input.targetDuration)
            ) {
              sendJson(response, 400, {error: '生成参数不完整'});
              return;
            }
            const currentProject = projectFileSchema.parse(
              JSON.parse(await readFile(projectFile, 'utf8')) as unknown,
            );
            const result = await runGenerationWorkflow(input, currentProject, projectRoot);
            const temporary = `${projectFile}.tmp`;
            await writeFile(temporary, `${JSON.stringify(result.project, null, 2)}\n`, 'utf8');
            await rename(temporary, projectFile);
            sendJson(response, 200, result);
            return;
          }
          if (url === '/api/render' && request.method === 'POST') {
            if (renderProcess) {
              sendJson(response, 409, {error: '已有导出任务正在运行'});
              return;
            }
            renderState = {status: 'running', progress: 0, message: '正在准备视频…'};
            const tsxCli = path.join(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
            renderProcess = spawn(
              process.execPath,
              [
                tsxCli,
                path.join(runtimeRoot, 'scripts', 'render-video.ts'),
                '--project',
                projectFile,
                '--public-dir',
                path.join(workspaceRoot, 'projects'),
                '--runtime-root',
                runtimeRoot,
                '--output',
                path.join(workspaceRoot, 'out', 'demo.mp4'),
              ],
              {
                cwd: workspaceRoot,
                env: {
                  ...process.env,
                  ...(process.versions.electron ? {ELECTRON_RUN_AS_NODE: '1'} : {}),
                },
              },
            );
            const update = (chunk: Buffer) => {
              const text = chunk.toString('utf8');
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

export default defineConfig({
  root: repositoryRoot,
  publicDir: path.resolve(workspaceRoot, 'projects'),
  plugins: [react(), localApi()],
  build: {outDir: path.resolve(repositoryRoot, 'dist/studio'), emptyOutDir: true},
  server: {host: '127.0.0.1', port: 4173},
});
