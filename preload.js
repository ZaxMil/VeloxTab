const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('velox', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('is-window-maximized'),
  openFileDialog: () => ipcRenderer.invoke('show-open-dialog'),
  onWindowStateChanged: (callback) => {
    ipcRenderer.on('window-state-changed', (_event, state) => callback(state));
  },
  onOpenInitialFiles: (callback) => {
    ipcRenderer.on('open-initial-files', (_event, files) => callback(files));
  }
});
