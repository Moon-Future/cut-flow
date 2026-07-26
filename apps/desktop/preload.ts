import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('cutFlowDesktop', {
  platform: process.platform,
  versions: {electron: process.versions.electron, chrome: process.versions.chrome},
  selectProjectFolder: () => ipcRenderer.invoke('cut-flow:select-project-folder') as Promise<string | null>,
  selectDirectory: (title?: string) =>
    ipcRenderer.invoke('cut-flow:select-directory', title) as Promise<string | null>,
});
