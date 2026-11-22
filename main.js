const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const url = require('url');

let mainWindow = null;

// Enable hardware acceleration flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 500,
    minHeight: 350,
    frame: false,
    backgroundColor: '#0c0d10',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false // Allow loading local media files directly
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: false });
  });

  // Handle files passed via command line arguments
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  const filesToOpen = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
  if (filesToOpen.length > 0) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('open-initial-files', filesToOpen);
    });
  }
}

// Window control IPC
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('is-window-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// File dialog IPC
ipcMain.handle('show-open-dialog', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Media (Video, Audio, Image)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'All Supported Media',
        extensions: [
          'mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv', 'ts', 'm4v',
          'mp3', 'flac', 'wav', 'aac', 'ogg', 'opus', 'm4a', 'wma',
          'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'svg'
        ]
      },
      {
        name: 'Video Files',
        extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv', 'ts', 'm4v']
      },
      {
        name: 'Audio Files',
        extensions: ['mp3', 'flac', 'wav', 'aac', 'ogg', 'opus', 'm4a', 'wma']
      },
      {
        name: 'Image Files',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'svg']
      },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) return [];
  return result.filePaths;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
