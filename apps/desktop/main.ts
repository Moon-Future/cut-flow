import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createServer as createHttpServer, type Server as HttpServer} from 'node:http';
import Module from 'node:module';
import path from 'node:path';
import {app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions} from 'electron';
import type {ViteDevServer} from 'vite';

let mainWindow: BrowserWindow | null = null;
let localServer: ViteDevServer | null = null;
let localHttpServer: HttpServer | null = null;

const log = async (message: string) => {
  const line = `${new Date().toISOString()} ${message}\n`;
  const logDirectory = path.join(app.getPath('userData'), 'logs');
  await mkdir(logDirectory, {recursive: true});
  await writeFile(path.join(logDirectory, 'desktop.log'), line, {flag: 'a'});
};

const ensureWorkspace = async (appRoot: string): Promise<string> => {
  if (!app.isPackaged) return appRoot;
  const workspaceRoot = path.join(app.getPath('userData'), 'workspace');
  const marker = path.join(workspaceRoot, '.initialized');
  try {
    await readFile(marker, 'utf8');
  } catch {
    await mkdir(workspaceRoot, {recursive: true});
    await cp(
      path.join(process.resourcesPath, 'seed-projects'),
      path.join(workspaceRoot, 'projects'),
      {
        recursive: true,
      },
    );
    await writeFile(marker, new Date().toISOString(), 'utf8');
  }
  return workspaceRoot;
};

const startLocalServer = async (appRoot: string, workspaceRoot: string): Promise<string> => {
  const runtimeRoot = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : appRoot;
  process.env.CUT_FLOW_APP_ROOT = appRoot;
  process.env.CUT_FLOW_WORKSPACE_ROOT = workspaceRoot;
  process.env.CUT_FLOW_RUNTIME_ROOT = runtimeRoot;
  // 开发服务器、桌面开发版和安装版统一使用同一目录，避免切换启动方式后配置“消失”。
  process.env.CUT_FLOW_USER_DATA_ROOT = path.join(workspaceRoot, 'cut-flow-data');
  if (app.isPackaged) {
    process.env.NODE_PATH = path.join(appRoot, 'node_modules');
    (Module as typeof Module & {_initPaths: () => void})._initPaths();
  }
  if (app.isPackaged && process.platform === 'win32') {
    process.env.ESBUILD_BINARY_PATH = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'vite',
      'node_modules',
      '@esbuild',
      'win32-x64',
      'esbuild.exe',
    );
    process.env.CUT_FLOW_RENDER_ESBUILD_BINARY_PATH = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@esbuild',
      'win32-x64',
      'esbuild.exe',
    );
    process.env.CUT_FLOW_REMOTION_BINARIES = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@remotion',
      'compositor-win32-x64-msvc',
    );
  }
  const {createServer} = await import('vite');
  if (app.isPackaged) {
    localServer = await createServer({
      configFile: path.join(runtimeRoot, 'studio', 'vite.config.ts'),
      appType: 'custom',
      server: {middlewareMode: true, hmr: false, watch: null},
      clearScreen: false,
    });
    const studioRoot = path.join(appRoot, 'dist', 'studio');
    const contentTypes: Record<string, string> = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.map': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    };
    localHttpServer = createHttpServer((request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const isStudioAsset = pathname === '/' || pathname === '/index.html' || pathname.startsWith('/assets/');
      if (!isStudioAsset) {
        localServer!.middlewares(request, response, () => {
          response.statusCode = 404;
          response.end('Not found');
        });
        return;
      }
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = path.resolve(studioRoot, relativePath);
      if (!file.startsWith(path.resolve(studioRoot) + path.sep) && file !== path.join(studioRoot, 'index.html')) {
        response.statusCode = 403;
        response.end('Forbidden');
        return;
      }
      void readFile(file)
        .then((content) => {
          response.statusCode = 200;
          response.setHeader('Content-Type', contentTypes[path.extname(file)] ?? 'application/octet-stream');
          response.end(content);
        })
        .catch(() => {
          response.statusCode = 404;
          response.end('Not found');
        });
    });
    await new Promise<void>((resolve, reject) => {
      localHttpServer!.once('error', reject);
      localHttpServer!.listen(0, '127.0.0.1', resolve);
    });
    const address = localHttpServer.address();
    if (!address || typeof address === 'string') throw new Error('桌面本地服务端口获取失败');
    return `http://127.0.0.1:${address.port}/`;
  }
  localServer = await createServer({
    configFile: path.join(runtimeRoot, 'studio', 'vite.config.ts'),
    server: {host: '127.0.0.1', port: 0, strictPort: false},
    clearScreen: false,
  });
  await localServer.listen();
  const url = localServer.resolvedUrls?.local[0];
  if (!url) throw new Error('本地工作台服务启动失败');
  return url;
};

const createWindow = async () => {
  const appRoot = app.getAppPath();
  const workspaceRoot = await ensureWorkspace(appRoot);
  const url = await startLocalServer(appRoot, workspaceRoot);
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#070910',
    show: false,
    webPreferences: {
      preload: path.join(appRoot, 'dist', 'desktop', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.removeMenu();
  mainWindow.webContents.on('did-fail-load', (_event, code, description, targetUrl) => {
    void log(`Renderer load failed (${code}) ${description}: ${targetUrl}`);
  });
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) void log(`Renderer console level ${level}: ${message}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    void log(`Renderer gone: ${details.reason} (${details.exitCode})`);
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isDevToolsShortcut =
      input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i');
    if (!isDevToolsShortcut) return;
    event.preventDefault();
    mainWindow?.webContents.toggleDevTools();
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({url: target}) => {
    if (target.startsWith('http://127.0.0.1:')) return {action: 'allow'};
    void shell.openExternal(target);
    return {action: 'deny'};
  });
  await mainWindow.loadURL(url);
  await log(`Window loaded: ${url}`);
};

ipcMain.handle('cut-flow:select-project-folder', async () => {
  const options: OpenDialogOptions = {
    title: '选择要导入的 Cut Flow 项目文件夹',
    properties: ['openDirectory'],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
});
ipcMain.handle('cut-flow:select-directory', async (_event, title?: string) => {
  const options: OpenDialogOptions = {
    title: title || '选择目录',
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(createWindow)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      await log(`Startup error: ${message}`);
      dialog.showErrorBox('Cut Flow 启动失败', message);
      app.quit();
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void new Promise<void>((resolve) => localHttpServer?.close(() => resolve()) ?? resolve());
  void localServer?.close();
});

process.on('uncaughtException', (error) => void log(`Uncaught: ${error.stack ?? error.message}`));
process.on('unhandledRejection', (reason) => void log(`Unhandled: ${String(reason)}`));
