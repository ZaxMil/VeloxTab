// ==========================================================================
// VeloxTab — Main Process (Native Streaming & OS Integration)
// ==========================================================================

const { app, BrowserWindow, ipcMain, dialog, protocol, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

let mainWindow = null;
let lastKnownSession = null;

// Register privileged schemes before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'velox',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true
    }
  }
]);

// Enable hardware acceleration & high-performance flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-running-insecure-content');
app.commandLine.appendSwitch('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,PlatformHEVCDecoderSupport');

// MIME types for 4K/8K MKV, MP4, WebM, audio, and image formats
const MIME_TYPES = {
  // Video
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.ts': 'video/mp2t',
  '.mts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.ogv': 'video/ogg',
  '.3gp': 'video/3gpp',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.vob': 'video/dvd',
  // Audio
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/opus',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  '.weba': 'audio/webm',
  '.alac': 'audio/alac',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.ape': 'audio/ape',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  // Subtitles
  '.vtt': 'text/vtt',
  '.srt': 'text/plain',
  '.ass': 'text/plain',
  '.ssa': 'text/plain'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// Parse file path from custom 'velox://' protocol URL
// Supports query params (?path=... or ?file=... or ?b64=...) and direct pathname/hostname
function getPathFromVeloxUrl(requestUrl) {
  try {
    const parsed = new URL(requestUrl);
    // 1. Check query parameters (handles '#', '?', brackets, unicode cleanly)
    const queryPath = parsed.searchParams.get('path') || parsed.searchParams.get('file');
    if (queryPath) {
      let decoded = decodeURIComponent(queryPath);
      if (process.platform === 'win32') {
        decoded = decoded.replace(/^\/([a-zA-Z]:)/, '$1');
      }
      return path.normalize(decoded);
    }

    const b64 = parsed.searchParams.get('b64');
    if (b64) {
      let decoded = Buffer.from(b64, 'base64url').toString('utf8');
      if (process.platform === 'win32') {
        decoded = decoded.replace(/^\/([a-zA-Z]:)/, '$1');
      }
      return path.normalize(decoded);
    }

    // 2. Direct path in URL (velox:///C:/Movies/... or velox://C:/Movies/...)
    let p = parsed.pathname || '';
    if (parsed.hostname && parsed.hostname !== 'stream' && parsed.hostname !== 'local' && parsed.hostname !== 'localhost') {
      p = parsed.hostname + (p.startsWith('/') ? p : '/' + p);
    }
    let decoded = decodeURIComponent(p);
    if (process.platform === 'win32') {
      decoded = decoded.replace(/^\/([a-zA-Z]:)/, '$1');
    }
    return path.normalize(decoded);
  } catch (err) {
    // Fallback if URL parsing throws
    let raw = requestUrl.replace(/^velox:\/\/?/i, '');
    const qIndex = raw.indexOf('?path=');
    if (qIndex !== -1) {
      raw = raw.slice(qIndex + 6);
    }
    let decoded = decodeURIComponent(raw);
    if (process.platform === 'win32') {
      decoded = decoded.replace(/^\/([a-zA-Z]:)/, '$1');
    }
    return path.normalize(decoded);
  }
}

// Session state persistence helpers
const getSessionFilePath = () => path.join(app.getPath('userData'), 'velox-session.json');

async function saveSessionState(sessionData) {
  if (!sessionData) return { success: false, error: 'Empty session data' };
  try {
    const filePath = getSessionFilePath();
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    let bounds = null;
    let isMaximized = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      bounds = mainWindow.getBounds();
      isMaximized = mainWindow.isMaximized();
    }

    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      tabs: Array.isArray(sessionData.tabs) ? sessionData.tabs : [],
      activeTabId: sessionData.activeTabId || null,
      activeTabPath: sessionData.activeTabPath || null,
      windowBounds: bounds,
      isMaximized: isMaximized,
      settings: sessionData.settings || {}
    };

    lastKnownSession = payload;
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Failed to save session state:', err);
    return { success: false, error: err.message };
  }
}

async function loadSessionState() {
  try {
    const filePath = getSessionFilePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.tabs) && data.tabs.length > 0) {
      return data;
    }
    return null;
  } catch (err) {
    console.error('Failed to load session state:', err);
    return null;
  }
}

async function clearSessionState() {
  try {
    const filePath = getSessionFilePath();
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    lastKnownSession = null;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Recursive directory scanning
const MEDIA_EXTENSIONS = {
  video: new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv', '.wmv', '.ts', '.m4v', '.mpg', '.mpeg', '.m2ts', '.vob', '.ogv', '.3gp', '.mts']),
  audio: new Set(['.mp3', '.flac', '.wav', '.aac', '.ogg', '.opus', '.m4a', '.wma', '.alac', '.aiff', '.aif', '.ape', '.mid', '.midi', '.oga', '.weba']),
  image: new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp', '.svg', '.ico', '.tiff', '.tif', '.heic', '.heif']),
  subtitle: new Set(['.srt', '.vtt', '.ass', '.ssa', '.sub'])
};

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '$recycle.bin',
  'system volume information',
  'thumbs.db'
]);

async function scanFolderRecursive(folderPath, options = {}) {
  const maxDepth = typeof options.maxDepth === 'number' ? options.maxDepth : 15;
  const maxFiles = typeof options.maxFiles === 'number' ? options.maxFiles : 10000;
  const targetTypes = options.types || ['video', 'audio', 'image', 'subtitle'];

  const results = {
    folderPath,
    files: [],
    paths: [],
    counts: { video: 0, audio: 0, image: 0, subtitle: 0, total: 0 }
  };

  async function walk(currentDir, currentDepth) {
    if (currentDepth > maxDepth || results.files.length >= maxFiles) return;

    let entries;
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch (err) {
      return; // Skip folders that cannot be accessed
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    for (const entry of entries) {
      if (results.files.length >= maxFiles) break;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        const lowerName = entry.name.toLowerCase();
        if (IGNORED_DIRECTORIES.has(lowerName) || lowerName.startsWith('.')) {
          continue;
        }
        await walk(fullPath, currentDepth + 1);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        const ext = path.extname(entry.name).toLowerCase();
        let detectedType = null;

        for (const type of targetTypes) {
          if (MEDIA_EXTENSIONS[type] && MEDIA_EXTENSIONS[type].has(ext)) {
            detectedType = type;
            break;
          }
        }

        if (detectedType) {
          let size = 0;
          let mtime = 0;
          try {
            const stat = await fs.promises.stat(fullPath);
            size = stat.size;
            mtime = stat.mtimeMs;
          } catch (e) {
            // If stat fails, still keep basic entry
          }

          const fileItem = {
            name: entry.name,
            path: fullPath,
            ext: ext.replace(/^\./, ''),
            type: detectedType,
            size,
            mtime
          };

          results.files.push(fileItem);
          results.paths.push(fullPath);
          results.counts[detectedType] = (results.counts[detectedType] || 0) + 1;
          results.counts.total++;
        }
      }
    }
  }

  await walk(folderPath, 0);
  return results;
}

// Windows Media Keys & Global Shortcuts integration
function registerMediaShortcuts() {
  const shortcuts = [
    { key: 'MediaPlayPause', action: 'play-pause' },
    { key: 'MediaNextTrack', action: 'next' },
    { key: 'MediaPreviousTrack', action: 'prev' },
    { key: 'MediaStop', action: 'stop' }
  ];

  for (const { key, action } of shortcuts) {
    try {
      if (globalShortcut.isRegistered(key)) {
        globalShortcut.unregister(key);
      }
      globalShortcut.register(key, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('media-key-event', { key, action });
          mainWindow.webContents.send(`media-${action}`);
          // Aliases for compatibility
          if (action === 'next') mainWindow.webContents.send('media-next-track');
          if (action === 'prev') mainWindow.webContents.send('media-previous-track');
          if (action === 'play-pause') mainWindow.webContents.send('media-play-pause');
        }
      });
    } catch (err) {
      console.warn(`Failed to register global media shortcut ${key}:`, err);
    }
  }
}

// Create Main Window
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
      webSecurity: false, // Allow loading local media files and cross-origin streams directly
      allowRunningInsecureContent: true
    }
  });

  // Enable CORS header bypass for IPTV / HLS live stream requests
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    callback({ responseHeaders });
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: false });
  });

  mainWindow.on('close', () => {
    // Flush last known session to disk if available
    if (lastKnownSession) {
      try {
        const filePath = getSessionFilePath();
        fs.writeFileSync(filePath, JSON.stringify(lastKnownSession, null, 2), 'utf8');
      } catch (err) {
        console.error('Failed to flush session on close:', err);
      }
    }
  });

  // Handle files passed via command line arguments OR offer session restoration
  mainWindow.webContents.once('did-finish-load', async () => {
    const args = process.argv.slice(app.isPackaged ? 1 : 2);
    const filesToOpen = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));

    if (filesToOpen.length > 0) {
      mainWindow.webContents.send('open-initial-files', filesToOpen);
    } else {
      // Check if there is a saved session to offer restoration
      const savedSession = await loadSessionState();
      if (savedSession && Array.isArray(savedSession.tabs) && savedSession.tabs.length > 0) {
        mainWindow.webContents.send('session-restore-available', savedSession);
      }
    }
  });
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

// Folder dialog and recursive scanning IPC
ipcMain.handle('show-open-folder-dialog', async (_e, options = {}) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Folder to Discover Media',
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const folderPath = result.filePaths[0];
  if (options && options.scan === false) {
    return { folderPath };
  }
  return await scanFolderRecursive(folderPath, options);
});

// Aliases for folder dialog
ipcMain.handle('show-folder-dialog', async (_e, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Folder to Discover Media',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
  const folderPath = result.filePaths[0];
  if (options && options.scan === false) return { folderPath };
  return await scanFolderRecursive(folderPath, options);
});

ipcMain.handle('open-folder-dialog', async (_e, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Folder to Discover Media',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
  const folderPath = result.filePaths[0];
  if (options && options.scan === false) return { folderPath };
  return await scanFolderRecursive(folderPath, options);
});

ipcMain.handle('scan-folder', async (_e, folderPath, options) => {
  if (!folderPath || typeof folderPath !== 'string') {
    return { error: 'Invalid folder path', files: [], paths: [] };
  }
  return await scanFolderRecursive(folderPath, options);
});

ipcMain.handle('scan-directory', async (_e, folderPath, options) => {
  if (!folderPath || typeof folderPath !== 'string') {
    return { error: 'Invalid folder path', files: [], paths: [] };
  }
  return await scanFolderRecursive(folderPath, options);
});

// Session persistence IPC
ipcMain.handle('save-session', async (_e, sessionData) => {
  return await saveSessionState(sessionData);
});

ipcMain.handle('get-saved-session', async () => {
  return await loadSessionState();
});

ipcMain.handle('clear-saved-session', async () => {
  return await clearSessionState();
});

ipcMain.on('session-update', (_e, sessionData) => {
  lastKnownSession = sessionData;
  saveSessionState(sessionData);
});

// Windows SMTC & Media Status IPC
ipcMain.on('media-status-changed', (_e, status) => {
  if (mainWindow && !mainWindow.isDestroyed() && status && status.title) {
    mainWindow.setTitle(`${status.title} — VeloxTab`);
  }
});

// App Lifecycle & Protocol Registration
app.whenReady().then(() => {
  // 1. Custom High-Performance Streaming Protocol 'velox://' with HTTP 206 Partial Content
  protocol.handle('velox', async (request) => {
    const resolvedPath = getPathFromVeloxUrl(request.url);
    if (!resolvedPath) {
      return new Response('Invalid media file path in velox URL', { status: 400 });
    }

    let stat;
    try {
      stat = await fs.promises.stat(resolvedPath);
    } catch (err) {
      return new Response(`File not found: ${err.message}`, {
        status: 404,
        statusText: 'Not Found',
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (!stat.isFile()) {
      return new Response('Requested path is not a file', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const fileSize = stat.size;
    const mimeType = getMimeType(resolvedPath);

    // Handle HEAD request
    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Handle empty file
    if (fileSize === 0) {
      return new Response('', {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': '0',
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Handle HTTP Range Requests (HTTP 206 Partial Content for instant seeking/scrubbing)
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (rangeMatch) {
        const startStr = rangeMatch[1];
        const endStr = rangeMatch[2];
        let start = 0;
        let end = fileSize - 1;

        if (startStr === '' && endStr !== '') {
          // Suffix byte range: bytes=-500 (last 500 bytes)
          const suffix = parseInt(endStr, 10);
          start = Math.max(0, fileSize - suffix);
          end = fileSize - 1;
        } else {
          start = parseInt(startStr, 10);
          if (endStr !== '') {
            end = parseInt(endStr, 10);
          }
        }

        if (isNaN(start) || start < 0) start = 0;
        if (isNaN(end) || end >= fileSize) end = fileSize - 1;

        if (start > end || start >= fileSize) {
          return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: {
              'Content-Range': `bytes */${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }

        const chunkSize = (end - start) + 1;
        // Optimized highWaterMark for large 4K/8K MKV, MP4, WebM streaming
        const fileStream = fs.createReadStream(resolvedPath, {
          start,
          end,
          highWaterMark: Math.min(chunkSize, 2 * 1024 * 1024)
        });

        if (request.signal) {
          request.signal.addEventListener('abort', () => {
            fileStream.destroy();
          });
        }

        const webStream = Readable.toWeb(fileStream);

        return new Response(webStream, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': mimeType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      }
    }

    // Default full file stream (Status 200)
    const fileStream = fs.createReadStream(resolvedPath, {
      highWaterMark: Math.min(fileSize, 2 * 1024 * 1024)
    });

    if (request.signal) {
      request.signal.addEventListener('abort', () => {
        fileStream.destroy();
      });
    }

    const webStream = Readable.toWeb(fileStream);

    return new Response(webStream, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Length': String(fileSize),
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  });

  // 2. Register media keys
  registerMediaShortcuts();

  // 3. Create window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  // Unregister all global shortcuts cleanly
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
