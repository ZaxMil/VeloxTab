// ==========================================================================
// VeloxTab — Preload Script (Bridge & Native OS Integration)
// ==========================================================================

const { contextBridge, ipcRenderer } = require('electron');

let sessionRestoreListener = null;
let pendingSessionData = null;
let customMediaListeners = {
  keyEvent: [],
  playPause: [],
  next: [],
  prev: [],
  stop: []
};

// Convert a local file path into a high-performance velox:// range streaming URL
function getStreamUrl(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  if (filePath.startsWith('velox://')) return filePath;

  let clean = filePath;
  if (clean.startsWith('file:///')) {
    clean = decodeURIComponent(clean.slice(8));
    // If on Windows and starts with drive letter
    if (/^[a-zA-Z]:/.test(clean)) {
      // Keep as-is
    }
  } else if (clean.startsWith('file://')) {
    clean = decodeURIComponent(clean.slice(7));
  }

  // Normalize slashes to forward slashes and encode cleanly
  const normalized = clean.replace(/\\/g, '/');
  return `velox://stream?path=${encodeURIComponent(normalized)}`;
}

// Listen to session restore notifications from main process
ipcRenderer.on('session-restore-available', (_event, sessionData) => {
  pendingSessionData = sessionData;
  if (sessionRestoreListener) {
    sessionRestoreListener(sessionData);
  } else {
    // Offer restore banner in DOM if UI hasn't explicitly consumed it
    showDefaultSessionRestorePrompt(sessionData);
  }
});

// Setup default Media Key dispatchers with DOM fallback
ipcRenderer.on('media-key-event', (_event, data) => {
  customMediaListeners.keyEvent.forEach(fn => fn(data));
});

ipcRenderer.on('media-play-pause', () => {
  if (customMediaListeners.playPause.length > 0) {
    customMediaListeners.playPause.forEach(fn => fn());
  } else {
    const btn = document.getElementById('btn-play-pause');
    if (btn) btn.click();
  }
});

ipcRenderer.on('media-next', () => {
  if (customMediaListeners.next.length > 0) {
    customMediaListeners.next.forEach(fn => fn());
  } else {
    const btn = document.getElementById('btn-next');
    if (btn) btn.click();
  }
});

ipcRenderer.on('media-next-track', () => {
  if (customMediaListeners.next.length > 0) {
    customMediaListeners.next.forEach(fn => fn());
  } else {
    const btn = document.getElementById('btn-next');
    if (btn) btn.click();
  }
});

ipcRenderer.on('media-prev', () => {
  if (customMediaListeners.prev.length > 0) {
    customMediaListeners.prev.forEach(fn => fn());
  } else {
    const btn = document.getElementById('btn-prev');
    if (btn) btn.click();
  }
});

ipcRenderer.on('media-previous-track', () => {
  if (customMediaListeners.prev.length > 0) {
    customMediaListeners.prev.forEach(fn => fn());
  } else {
    const btn = document.getElementById('btn-prev');
    if (btn) btn.click();
  }
});

ipcRenderer.on('media-stop', () => {
  if (customMediaListeners.stop.length > 0) {
    customMediaListeners.stop.forEach(fn => fn());
  } else {
    const btn = document.getElementById('btn-stop');
    if (btn) btn.click();
  }
});

// Default minimal banner offering to restore previous session on launch
function showDefaultSessionRestorePrompt(sessionData) {
  if (!sessionData || !Array.isArray(sessionData.tabs) || sessionData.tabs.length === 0) return;

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      // If user already opened media or dismissed, do nothing
      if (document.getElementById('velox-restore-banner')) return;
      const emptyState = document.getElementById('empty-state');
      if (emptyState && emptyState.classList.contains('hidden')) return;

      const banner = document.createElement('div');
      banner.id = 'velox-restore-banner';
      banner.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: #14171f;
        border: 1px solid #2d3748;
        border-radius: 8px;
        padding: 10px 18px;
        display: flex;
        align-items: center;
        gap: 14px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.6);
        z-index: 9999;
        font-size: 13px;
        color: #e2e8f0;
        animation: fadeIn 0.3s ease;
      `;

      const tabCount = sessionData.tabs.length;
      banner.innerHTML = `
        <span>⚡ Restore previous session (${tabCount} tab${tabCount > 1 ? 's' : ''})?</span>
        <button id="btn-banner-restore" style="
          background: #2563eb;
          color: #fff;
          border: none;
          padding: 5px 12px;
          border-radius: 4px;
          font-weight: 500;
          cursor: pointer;
          font-size: 12px;
        ">Restore</button>
        <button id="btn-banner-dismiss" style="
          background: transparent;
          color: #94a3b8;
          border: none;
          cursor: pointer;
          font-size: 14px;
          padding: 2px 6px;
        " title="Dismiss">✕</button>
      `;

      document.body.appendChild(banner);

      document.getElementById('btn-banner-restore')?.addEventListener('click', () => {
        banner.remove();
        // Restore all tabs
        const filePaths = sessionData.tabs.map(t => t.path).filter(Boolean);
        if (filePaths.length > 0) {
          // If renderer has onOpenInitialFiles hooked up
          const event = new CustomEvent('velox-restore-tabs', { detail: sessionData });
          window.dispatchEvent(event);

          // Also trigger open initial files IPC simulation
          const initialHandlers = window.__veloxInitialFileHandlers || [];
          if (initialHandlers.length > 0) {
            initialHandlers.forEach(h => h(filePaths));
          } else {
            // Emulate drag-drop or file loading
            filePaths.forEach(p => {
              if (window.veloxPlayer && typeof window.veloxPlayer.addTab === 'function') {
                window.veloxPlayer.addTab(p);
              }
            });
          }
        }
      });

      document.getElementById('btn-banner-dismiss')?.addEventListener('click', () => {
        banner.remove();
        ipcRenderer.invoke('clear-saved-session');
      });
    }, 400);
  });
}

// Auto-save session on page unload
window.addEventListener('beforeunload', () => {
  try {
    if (window.veloxPlayer && Array.isArray(window.veloxPlayer.tabs) && window.veloxPlayer.tabs.length > 0) {
      const activeTab = window.veloxPlayer.tabs.find(t => t.id === window.veloxPlayer.activeTabId);
      const videoEl = document.getElementById('video-element');
      const audioEl = document.getElementById('audio-element');
      let curTime = 0;
      if (videoEl && !videoEl.classList.contains('hidden')) {
        curTime = videoEl.currentTime || 0;
      } else if (audioEl && !audioEl.classList.contains('hidden')) {
        curTime = audioEl.currentTime || 0;
      }

      const tabsData = window.veloxPlayer.tabs.map(t => ({
        id: t.id,
        name: t.name,
        path: t.path,
        type: t.type,
        currentTime: t.id === window.veloxPlayer.activeTabId ? curTime : (t.currentTime || 0),
        duration: t.duration || 0,
        isPinned: !!t.isPinned,
        isMuted: !!t.isMuted
      }));

      const sessionData = {
        tabs: tabsData,
        activeTabId: window.veloxPlayer.activeTabId,
        activeTabPath: activeTab ? activeTab.path : null
      };

      ipcRenderer.send('session-update', sessionData);
    }
  } catch (err) {
    // Non-fatal
  }
});

// Expose safe, typed VeloxTab APIs in window.velox
contextBridge.exposeInMainWorld('velox', {
  // Window Controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('is-window-maximized'),
  onWindowStateChanged: (callback) => {
    ipcRenderer.on('window-state-changed', (_event, state) => callback(state));
  },

  // File & Folder Open Dialogs
  openFileDialog: () => ipcRenderer.invoke('show-open-dialog'),
  openFolderDialog: (options) => ipcRenderer.invoke('show-open-folder-dialog', options),

  // Recursive Folder Scanner (Discovers all videos, audios, images, subtitles)
  scanFolder: (folderPath, options) => ipcRenderer.invoke('scan-folder', folderPath, options),
  scanDirectory: (folderPath, options) => ipcRenderer.invoke('scan-directory', folderPath, options),

  // Initial Files from CLI or OS file association
  onOpenInitialFiles: (callback) => {
    if (!window.__veloxInitialFileHandlers) window.__veloxInitialFileHandlers = [];
    window.__veloxInitialFileHandlers.push(callback);
    ipcRenderer.on('open-initial-files', (_event, files) => callback(files));
  },

  // Native Local Streaming Protocol 'velox://' helpers
  getStreamUrl: (filePath) => getStreamUrl(filePath),
  toStreamUrl: (filePath) => getStreamUrl(filePath),
  isStreamUrl: (url) => typeof url === 'string' && url.startsWith('velox://'),

  // Session Persistence
  saveSession: (sessionData) => ipcRenderer.invoke('save-session', sessionData),
  getSavedSession: () => ipcRenderer.invoke('get-saved-session'),
  clearSavedSession: () => ipcRenderer.invoke('clear-saved-session'),
  updateSession: (sessionData) => ipcRenderer.send('session-update', sessionData),
  onSessionRestoreAvailable: (callback) => {
    sessionRestoreListener = callback;
    if (pendingSessionData) {
      callback(pendingSessionData);
    }
  },
  onRequestSessionSave: (callback) => {
    ipcRenderer.on('request-session-save', () => callback());
  },

  // Windows SMTC & Media Keys
  onMediaKeyEvent: (callback) => {
    customMediaListeners.keyEvent.push(callback);
  },
  onMediaPlayPause: (callback) => {
    customMediaListeners.playPause.push(callback);
  },
  onMediaNextTrack: (callback) => {
    customMediaListeners.next.push(callback);
  },
  onMediaPreviousTrack: (callback) => {
    customMediaListeners.prev.push(callback);
  },
  onMediaStop: (callback) => {
    customMediaListeners.stop.push(callback);
  },
  updateMediaStatus: (status) => {
    ipcRenderer.send('media-status-changed', status);
  }
});
