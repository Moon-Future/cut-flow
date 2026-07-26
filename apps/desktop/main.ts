import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import Module from 'node:module';
import path from 'node:path';
import {app, BrowserWindow, dialog, shell} from 'electron';
import type {ViteDevServer} from 'vite';

let mainWindow: BrowserWindow | null = null;
let localServer: ViteDevServer | null = null;

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
  process.env.CUT_FLOW_USER_DATA_ROOT = app.getPath('userData');
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
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({url: target}) => {
    if (target.startsWith('http://127.0.0.1:')) return {action: 'allow'};
    void shell.openExternal(target);
    return {action: 'deny'};
  });
  await mainWindow.loadURL(url);
  await log(`Window loaded: ${url}`);
};

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
  void localServer?.close();
});

process.on('uncaughtException', (error) => void log(`Uncaught: ${error.stack ?? error.message}`));
process.on('unhandledRejection', (reason) => void log(`Unhandled: ${String(reason)}`));
