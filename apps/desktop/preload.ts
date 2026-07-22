import {contextBridge} from 'electron';

contextBridge.exposeInMainWorld('cutFlowDesktop', {
  platform: process.platform,
  versions: {electron: process.versions.electron, chrome: process.versions.chrome},
});
