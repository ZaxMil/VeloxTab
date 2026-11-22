// ==========================================================================
// VeloxTab — Multi-Tab Universal Media Player Core Logic (renderer.js)
// Integrated with Audio DSP, Video FX, Subtitle Engine, and Playlist Drawer
// ==========================================================================

class VeloxPlayer {
  constructor() {
    this.tabs = [];
    this.activeTabId = null;
    this.isTakeoverMode = false;
    this.mouseTimer = null;

    // Active media engines
    this.audioDSP = null;
    this.videoFX = null;
    this.subtitles = null;

    // Playlist state
    this.playlist = [];
    this.activePlaylistItemId = null;
    this.playlistRepeatMode = 'off'; // 'off' | 'all' | 'one'
    this.isPlaylistShuffled = false;
    this.shuffledOrder = [];
    this.isPlaylistDocked = false;

    // Filmstrip state
    this.filmstripImages = [];
    this.activeFilmstripIndex = -1;

    // Current theme
    this.currentTheme = localStorage.getItem('veloxtab_theme') || 'theme-potplayer';

    // Image Zoom & Pan State
    this.imageState = {
      zoom: 1,
      panX: 0,
      panY: 0,
      rotation: 0,
      isDragging: false,
      startX: 0,
      startY: 0
    };

    this.speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    this.currentSpeedIndex = 2; // 1.0x

    // Cache DOM Elements
    this.getElements();

    // Expose instance globally for IPC and helper scripts
    window.veloxPlayer = this;

    this.init();
  }

  getElements() {
    // Top App Header
    this.appHeader = document.getElementById('app-header');
    this.btnMenu = document.getElementById('btn-menu');
    this.dropdownMenu = document.getElementById('dropdown-menu');
    this.btnThemeSwitcher = document.getElementById('btn-theme-switcher');
    this.themeDropdown = document.getElementById('theme-dropdown');
    this.tabList = document.getElementById('tab-list');
    this.btnAddTab = document.getElementById('btn-add-tab');
    this.btnHeaderEq = document.getElementById('btn-header-eq');
    this.btnHeaderFx = document.getElementById('btn-header-fx');
    this.btnHeaderPlaylist = document.getElementById('btn-header-playlist');
    this.btnToggleTakeover = document.getElementById('btn-toggle-takeover');

    // Workspace & Viewport
    this.appWorkspace = document.getElementById('app-workspace');
    this.viewport = document.getElementById('viewport');
    this.emptyState = document.getElementById('empty-state');
    this.mediaStage = document.getElementById('media-stage');
    this.videoEl = document.getElementById('video-element');
    this.subtitleOverlay = document.getElementById('subtitle-overlay');
    this.audioContainer = document.getElementById('audio-container');
    this.audioEl = document.getElementById('audio-element');
    this.audioTitle = document.getElementById('audio-title');
    this.visualizerCanvas = document.getElementById('visualizer-canvas');
    this.imageContainer = document.getElementById('image-container');
    this.imageEl = document.getElementById('image-element');
    this.imageZoomLevel = document.getElementById('image-zoom-level');

    // Filmstrip
    this.imageFilmstrip = document.getElementById('image-filmstrip');
    this.filmstripCount = document.getElementById('filmstrip-count');
    this.filmstripThumbnails = document.getElementById('filmstrip-thumbnails');
    this.btnFilmstripPrev = document.getElementById('btn-filmstrip-prev');
    this.btnFilmstripNext = document.getElementById('btn-filmstrip-next');
    this.btnFilmstripClose = document.getElementById('btn-filmstrip-close');
    this.btnToggleFilmstrip = document.getElementById('btn-toggle-filmstrip');

    // Playlist Drawer
    this.playlistDrawer = document.getElementById('playlist-drawer');
    this.playlistBadge = document.getElementById('playlist-badge');
    this.btnPlaylistDock = document.getElementById('btn-playlist-dock');
    this.btnPlaylistClose = document.getElementById('btn-playlist-close');
    this.playlistSearch = document.getElementById('playlist-search');
    this.btnPlaylistSearchClear = document.getElementById('btn-playlist-search-clear');
    this.btnPlaylistShuffle = document.getElementById('btn-playlist-shuffle');
    this.btnPlaylistRepeat = document.getElementById('btn-playlist-repeat');
    this.btnPlaylistAdd = document.getElementById('btn-playlist-add');
    this.btnPlaylistClear = document.getElementById('btn-playlist-clear');
    this.playlistItemsContainer = document.getElementById('playlist-items');
    this.playlistTotalDuration = document.getElementById('playlist-total-duration');
    this.playlistStatusText = document.getElementById('playlist-status-text');

    // Bottom Control Bar
    this.controlBar = document.getElementById('control-bar');
    this.seekbarTrack = document.getElementById('seekbar-track');
    this.seekbarBuffered = document.getElementById('seekbar-buffered');
    this.seekbarProgress = document.getElementById('seekbar-progress');
    this.seekbarThumb = document.getElementById('seekbar-thumb');
    this.seekbarTooltip = document.getElementById('seekbar-tooltip');
    this.seekbarAbMarker = document.getElementById('seekbar-ab-marker');
    this.btnPlayPause = document.getElementById('btn-play-pause');
    this.iconPlay = document.getElementById('icon-play');
    this.iconPause = document.getElementById('icon-pause');
    this.btnStop = document.getElementById('btn-stop');
    this.btnPrev = document.getElementById('btn-prev');
    this.btnNext = document.getElementById('btn-next');
    this.timeCurrent = document.getElementById('time-current');
    this.timeDuration = document.getElementById('time-duration');
    this.btnMute = document.getElementById('btn-mute');
    this.iconVolume = document.getElementById('icon-volume');
    this.iconVolumeMuted = document.getElementById('icon-volume-muted');
    this.volumeSlider = document.getElementById('volume-slider');
    this.btnSpeed = document.getElementById('btn-speed');
    this.btnSubtitlesToggle = document.getElementById('btn-subtitles-toggle');
    this.btnEqToggle = document.getElementById('btn-eq-toggle');
    this.btnFxToggle = document.getElementById('btn-fx-toggle');
    this.btnPlaylistToggle = document.getElementById('btn-playlist-toggle');
    this.btnLoop = document.getElementById('btn-loop');
    this.btnPip = document.getElementById('btn-pip');
    this.btnTakeoverBottom = document.getElementById('btn-takeover-bottom');
    this.btnFullscreen = document.getElementById('btn-fullscreen');

    // Modals & Popovers
    this.equalizerModal = document.getElementById('equalizer-modal');
    this.eqEnableToggle = document.getElementById('eq-enable-toggle');
    this.btnEqClose = document.getElementById('btn-eq-close');
    this.eqPresetSelect = document.getElementById('eq-preset-select');
    this.btnEqReset = document.getElementById('btn-eq-reset');
    this.eqBoostSlider = document.getElementById('eq-boost-slider');
    this.eqBoostVal = document.getElementById('eq-boost-val');
    this.eqSlidersContainer = document.getElementById('eq-sliders-container');
    this.eqPanSlider = document.getElementById('eq-pan-slider');
    this.eqPanVal = document.getElementById('eq-pan-val');

    this.videofxModal = document.getElementById('videofx-modal');
    this.btnFxReset = document.getElementById('btn-fx-reset');
    this.btnFxClose = document.getElementById('btn-fx-close');
    this.fxBrightness = document.getElementById('fx-brightness');
    this.fxBrightnessVal = document.getElementById('fx-brightness-val');
    this.fxContrast = document.getElementById('fx-contrast');
    this.fxContrastVal = document.getElementById('fx-contrast-val');
    this.fxSaturation = document.getElementById('fx-saturation');
    this.fxSaturationVal = document.getElementById('fx-saturation-val');
    this.fxHue = document.getElementById('fx-hue');
    this.fxHueVal = document.getElementById('fx-hue-val');
    this.fxSharpen = document.getElementById('fx-sharpen');
    this.aspectRatioGroup = document.getElementById('aspect-ratio-group');
    this.btnAbA = document.getElementById('btn-ab-a');
    this.abValA = document.getElementById('ab-val-a');
    this.btnAbB = document.getElementById('btn-ab-b');
    this.abValB = document.getElementById('ab-val-b');
    this.btnAbClear = document.getElementById('btn-ab-clear');
    this.btnFramePrev = document.getElementById('btn-frame-prev');
    this.btnFrameNext = document.getElementById('btn-frame-next');

    this.subtitlesPopover = document.getElementById('subtitles-popover');
    this.btnSubtitlesClose = document.getElementById('btn-subtitles-close');
    this.subTrackSelect = document.getElementById('sub-track-select');
    this.subOffsetDisplay = document.getElementById('sub-offset-display');
    this.btnSubAdvance = document.getElementById('btn-sub-advance');
    this.btnSubReset = document.getElementById('btn-sub-reset');
    this.btnSubDelay = document.getElementById('btn-sub-delay');
    this.subSizeSelect = document.getElementById('sub-size-select');
  }

  init() {
    this.applyTheme(this.currentTheme);
    this.bindWindowControls();
    this.bindMenu();
    this.bindThemeSwitcher();
    this.bindMediaControls();
    this.bindImageControls();
    this.bindPlaylistControls();
    this.bindEqualizerControls();
    this.bindVideoFXControls();
    this.bindSubtitleControls();
    this.bindFilmstripControls();
    this.bindDragAndDrop();
    this.bindShortcuts();
    this.bindInactivityHandlers();

    // Listen to session restore and initial files
    if (window.velox) {
      window.velox.onOpenInitialFiles((files) => {
        if (files && files.length > 0) {
          files.forEach(f => this.addTab(f));
        }
      });

      // Media keys forwarding
      window.velox.onMediaPlayPause?.(() => this.togglePlayPause());
      window.velox.onMediaNextTrack?.(() => this.playNext());
      window.velox.onMediaPreviousTrack?.(() => this.playPrevious());
      window.velox.onMediaStop?.(() => this.stopPlayback());
    }

    // Custom event when session restore is clicked
    window.addEventListener('velox-restore-tabs', (e) => {
      const session = e.detail;
      if (session && Array.isArray(session.tabs)) {
        session.tabs.forEach(t => {
          this.addTab(t.path, { isPinned: !!t.isPinned, isMuted: !!t.isMuted });
        });
      }
    });

    // Empty state click handlers
    document.getElementById('btn-browse-empty')?.addEventListener('click', () => this.requestOpenFiles());
    document.getElementById('btn-browse-folder')?.addEventListener('click', () => this.requestOpenFolder());
    this.btnAddTab.addEventListener('click', () => this.requestOpenFiles());
  }

  // ==========================================================================
  // Themes Management
  // ==========================================================================

  applyTheme(themeName) {
    const validThemes = ['theme-potplayer', 'theme-oled', 'theme-midnight'];
    if (!validThemes.includes(themeName)) themeName = 'theme-potplayer';

    this.currentTheme = themeName;
    document.body.classList.remove(...validThemes);
    document.body.classList.add(themeName);
    localStorage.setItem('veloxtab_theme', themeName);

    // Update checkmarks in theme menu
    document.querySelectorAll('.theme-choice, .theme-option').forEach(el => {
      const t = el.getAttribute('data-theme');
      el.classList.toggle('active', t === themeName);
    });

    if (window.showVeloxOSD) {
      const labels = {
        'theme-potplayer': 'PotPlayer Classic Dark',
        'theme-oled': 'OLED Pure Black',
        'theme-midnight': 'Midnight Navy'
      };
      window.showVeloxOSD(`Theme: ${labels[themeName] || themeName}`);
    }
  }

  bindThemeSwitcher() {
    this.btnThemeSwitcher?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.themeDropdown?.classList.toggle('hidden');
    });

    document.querySelectorAll('.theme-choice, .theme-option').forEach(item => {
      item.addEventListener('click', (e) => {
        const theme = e.currentTarget.getAttribute('data-theme');
        if (theme) {
          this.applyTheme(theme);
          this.themeDropdown?.classList.add('hidden');
          this.dropdownMenu?.classList.add('hidden');
        }
      });
    });

    document.addEventListener('click', () => {
      this.themeDropdown?.classList.add('hidden');
    });
  }

  // ==========================================================================
  // Window Controls & Menu
  // ==========================================================================

  bindWindowControls() {
    document.getElementById('win-min')?.addEventListener('click', () => window.velox?.minimize());
    document.getElementById('win-max')?.addEventListener('click', () => window.velox?.maximize());
    document.getElementById('win-close')?.addEventListener('click', () => window.velox?.close());

    if (window.velox) {
      window.velox.onWindowStateChanged((state) => {
        const btn = document.getElementById('win-max');
        if (btn) btn.innerText = state.isMaximized ? '❐' : '□';
      });
    }
  }

  bindMenu() {
    this.btnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dropdownMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      if (!this.dropdownMenu.classList.contains('hidden')) {
        this.dropdownMenu.classList.add('hidden');
      }
    });

    document.getElementById('menu-open-file')?.addEventListener('click', () => this.requestOpenFiles());
    document.getElementById('menu-open-folder')?.addEventListener('click', () => this.requestOpenFolder());
    document.getElementById('menu-new-tab')?.addEventListener('click', () => this.requestOpenFiles());
    document.getElementById('menu-takeover')?.addEventListener('click', () => this.toggleTakeoverMode());
    document.getElementById('menu-close-tab')?.addEventListener('click', () => {
      if (this.activeTabId) this.closeTab(this.activeTabId);
    });
    document.getElementById('menu-eq')?.addEventListener('click', () => this.toggleEqualizerModal());
    document.getElementById('menu-videofx')?.addEventListener('click', () => this.toggleVideoFXModal());
    document.getElementById('menu-subtitles')?.addEventListener('click', () => this.toggleSubtitlesPopover());
    document.getElementById('menu-playlist')?.addEventListener('click', () => this.togglePlaylistDrawer());
    document.getElementById('menu-filmstrip')?.addEventListener('click', () => this.toggleFilmstrip());
    document.getElementById('menu-fullscreen')?.addEventListener('click', () => this.toggleFullscreen());
    document.getElementById('menu-fit-window')?.addEventListener('click', () => this.resetImageState());
    document.getElementById('menu-about')?.addEventListener('click', () => {
      alert('VeloxTab v1.0.0\nUltra-fast Multi-Tab Universal Media Player\nCreated by ZAX Mil');
    });

    // Header Quick Buttons
    this.btnHeaderEq?.addEventListener('click', () => this.toggleEqualizerModal());
    this.btnHeaderFx?.addEventListener('click', () => this.toggleVideoFXModal());
    this.btnHeaderPlaylist?.addEventListener('click', () => this.togglePlaylistDrawer());
    this.btnToggleTakeover?.addEventListener('click', () => this.toggleTakeoverMode());
  }

  // ==========================================================================
  // File & Folder Open Requests
  // ==========================================================================

  async requestOpenFiles() {
    if (!window.velox) return;
    const files = await window.velox.openFileDialog();
    if (files && files.length > 0) {
      files.forEach(f => this.addTab(f));
    }
  }

  async requestOpenFolder() {
    if (!window.velox) return;
    const folderRes = await window.velox.openFolderDialog?.();
    const folderPath = Array.isArray(folderRes) ? folderRes[0] : folderRes;
    if (!folderPath) return;

    if (window.velox.scanFolder) {
      const results = await window.velox.scanFolder(folderPath);
      if (results && results.files && results.files.length > 0) {
        // Add all media files to playlist and open first item
        results.files.forEach(item => {
          this.addToPlaylist(item.path, item.name, item.type);
        });
        this.addTab(results.files[0].path);
        this.showPlaylistDrawer();
      }
    }
  }

  detectMediaType(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const videoExts = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv', 'ts', 'm4v', 'mpg', 'mpeg', 'm2ts', 'vob', 'ogv', '3gp', 'mts'];
    const audioExts = ['mp3', 'flac', 'wav', 'aac', 'ogg', 'opus', 'm4a', 'wma', 'alac', 'aiff', 'aif', 'ape', 'mid', 'midi', 'oga', 'weba'];
    const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];

    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (imageExts.includes(ext)) return 'image';
    return 'video';
  }

  // ==========================================================================
  // Multi-Tab Management (with Pinning & Tab Audio Muting)
  // ==========================================================================

  addTab(filePath, options = {}) {
    const fileName = filePath.replace(/^.*[\\\/]/, '');
    const mediaType = this.detectMediaType(filePath);
    const tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const newTab = {
      id: tabId,
      name: fileName,
      path: filePath,
      type: mediaType,
      currentTime: 0,
      duration: 0,
      isPinned: !!options.isPinned,
      isMuted: !!options.isMuted
    };

    this.tabs.push(newTab);
    this.addToPlaylist(filePath, fileName, mediaType);
    this.sortAndRenderTabs();
    this.activateTab(tabId);
  }

  togglePinTab(tabId, e) {
    if (e) e.stopPropagation();
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    tab.isPinned = !tab.isPinned;
    this.sortAndRenderTabs();
    if (window.showVeloxOSD) {
      window.showVeloxOSD(tab.isPinned ? `Tab Pinned: ${tab.name}` : `Tab Unpinned: ${tab.name}`);
    }
  }

  toggleMuteTab(tabId, e) {
    if (e) e.stopPropagation();
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    tab.isMuted = !tab.isMuted;

    if (this.activeTabId === tabId) {
      this.videoEl.muted = tab.isMuted;
      this.audioEl.muted = tab.isMuted;
      this.updateVolumeUI(tab.isMuted ? 0 : this.volumeSlider.value);
    }
    this.renderTabs();
    if (window.showVeloxOSD) {
      window.showVeloxOSD(tab.isMuted ? `Tab Muted: ${tab.name}` : `Tab Audio Restored: ${tab.name}`);
    }
  }

  closeTab(tabId) {
    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    const tab = this.tabs[index];
    if (tab.isPinned) {
      if (window.showVeloxOSD) window.showVeloxOSD('Pinned tabs cannot be closed. Unpin first.');
      return;
    }

    if (this.activeTabId === tabId) {
      this.videoEl.pause();
      this.audioEl.pause();
    }

    this.tabs.splice(index, 1);

    if (this.tabs.length === 0) {
      this.activeTabId = null;
      this.renderTabs();
      this.showEmptyState();
      return;
    }

    const nextIndex = Math.min(index, this.tabs.length - 1);
    this.sortAndRenderTabs();
    this.activateTab(this.tabs[nextIndex].id);
  }

  sortAndRenderTabs() {
    // Keep pinned tabs at the beginning
    this.tabs.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });
    this.renderTabs();
  }

  renderTabs() {
    this.tabList.innerHTML = '';
    this.tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `media-tab ${tab.id === this.activeTabId ? 'active' : ''} ${tab.isPinned ? 'pinned' : ''}`;
      tabEl.setAttribute('data-tab-id', tab.id);

      const icon = tab.type === 'video' ? '🎬' : (tab.type === 'audio' ? '🎵' : '🖼️');
      const hasAudio = tab.type === 'video' || tab.type === 'audio';

      tabEl.innerHTML = `
        <button class="tab-pin-btn ${tab.isPinned ? 'pinned' : ''}" title="${tab.isPinned ? 'Unpin tab' : 'Pin tab'}">📌</button>
        <span class="tab-icon">${icon}</span>
        <span class="tab-title" title="${tab.name}">${tab.name}</span>
        ${hasAudio ? `<button class="tab-mute-btn ${tab.isMuted ? 'muted' : ''}" title="${tab.isMuted ? 'Unmute Tab' : 'Mute Tab'}">${tab.isMuted ? '🔇' : '🔊'}</button>` : ''}
        <span class="tab-close" title="Close Tab">✕</span>
      `;

      tabEl.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-close') && !e.target.closest('.tab-pin-btn') && !e.target.closest('.tab-mute-btn')) {
          this.activateTab(tab.id);
        }
      });

      tabEl.querySelector('.tab-pin-btn')?.addEventListener('click', (e) => this.togglePinTab(tab.id, e));
      tabEl.querySelector('.tab-mute-btn')?.addEventListener('click', (e) => this.toggleMuteTab(tab.id, e));
      tabEl.querySelector('.tab-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });

      this.tabList.appendChild(tabEl);
    });

    const activeEl = this.tabList.querySelector('.media-tab.active');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  activateTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    this.activeTabId = tabId;
    this.renderTabs();

    this.emptyState.classList.add('hidden');
    this.mediaStage.classList.remove('hidden');

    // Reset player elements
    this.videoEl.classList.add('hidden');
    this.audioContainer.classList.add('hidden');
    this.imageContainer.classList.add('hidden');
    this.videoEl.pause();
    this.audioEl.pause();

    // Use direct file:/// URL so media is strictly same-origin with file:/// index.html.
    // This allows MediaElementAudioSource (Equalizer, 200% Volume Boost, Visualizer) and native audio to play without CORS blocks.
    const fileUrl = tab.path.startsWith('file://') ? tab.path : `file:///${tab.path.replace(/\\/g, '/')}`;
    const streamUrl = fileUrl;

    const currentVol = this.volumeSlider ? parseFloat(this.volumeSlider.value || 1) : 1;

    if (tab.type === 'video') {
      this.controlBar.classList.remove('hidden');
      this.videoEl.classList.remove('hidden');
      this.imageFilmstrip.classList.add('hidden');

      this.videoEl.src = streamUrl;
      this.videoEl.volume = currentVol;
      this.videoEl.playbackRate = this.speeds[this.currentSpeedIndex];
      this.videoEl.muted = !!tab.isMuted;

      // Attach VideoFX & DSP
      this.attachVideoFX();
      this.attachAudioDSP(this.videoEl);
      this.attachSubtitles();

      this.videoEl.play().catch(() => {});
    } else if (tab.type === 'audio') {
      this.controlBar.classList.remove('hidden');
      this.audioContainer.classList.remove('hidden');
      this.imageFilmstrip.classList.add('hidden');
      this.audioTitle.innerText = tab.name;

      this.audioEl.src = streamUrl;
      this.audioEl.volume = currentVol;
      this.audioEl.playbackRate = this.speeds[this.currentSpeedIndex];
      this.audioEl.muted = !!tab.isMuted;

      // Attach AudioDSP & visualizer
      this.attachAudioDSP(this.audioEl);
      this.setupVisualizer();

      this.audioEl.play().catch(() => {});
    } else if (tab.type === 'image') {
      this.controlBar.classList.add('hidden');
      this.imageContainer.classList.remove('hidden');
      this.resetImageState();

      // Images can use direct file:/// url
      const imgUrl = tab.path.startsWith('file://') ? tab.path : `file:///${tab.path.replace(/\\/g, '/')}`;
      this.imageEl.src = imgUrl;

      // Load folder images for filmstrip
      this.loadFilmstripForImage(tab.path);
    }

    // Highlight in playlist
    this.highlightPlaylistItemByPath(tab.path);
  }

  showEmptyState() {
    this.emptyState.classList.remove('hidden');
    this.mediaStage.classList.add('hidden');
    this.controlBar.classList.add('hidden');
    this.imageFilmstrip.classList.add('hidden');
    this.videoEl.src = '';
    this.audioEl.src = '';
    this.imageEl.src = '';
  }

  toggleTakeoverMode() {
    this.isTakeoverMode = !this.isTakeoverMode;
    document.body.classList.toggle('takeover-mode', this.isTakeoverMode);
    this.btnToggleTakeover?.classList.toggle('active', this.isTakeoverMode);
    this.btnTakeoverBottom?.classList.toggle('active', this.isTakeoverMode);
    if (window.showVeloxOSD) {
      window.showVeloxOSD(`Takeover Mode: ${this.isTakeoverMode ? 'ENABLED (Borderless)' : 'DISABLED'}`);
    }
  }

  // ==========================================================================
  // Media Controls (Playback, Seek, Volume)
  // ==========================================================================

  getActiveMedia() {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return null;
    return activeTab.type === 'video' ? this.videoEl : (activeTab.type === 'audio' ? this.audioEl : null);
  }

  togglePlayPause() {
    const m = this.getActiveMedia();
    if (!m) return;
    if (m.paused) {
      m.play().catch(() => {});
    } else {
      m.pause();
    }
  }

  stopPlayback() {
    const m = this.getActiveMedia();
    if (!m) return;
    m.pause();
    m.currentTime = 0;
  }

  bindMediaControls() {
    this.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
    this.videoEl.addEventListener('click', () => this.togglePlayPause());
    this.btnStop.addEventListener('click', () => this.stopPlayback());

    this.btnPrev.addEventListener('click', () => this.playPrevious());
    this.btnNext.addEventListener('click', () => this.playNext());

    const updatePlayState = (isPlaying) => {
      if (isPlaying) {
        this.iconPlay.classList.add('hidden');
        this.iconPause.classList.remove('hidden');
        document.body.classList.add('controls-autohidden');
      } else {
        this.iconPlay.classList.remove('hidden');
        this.iconPause.classList.add('hidden');
        document.body.classList.remove('controls-autohidden');
      }
    };

    [this.videoEl, this.audioEl].forEach(media => {
      media.addEventListener('play', () => updatePlayState(true));
      media.addEventListener('pause', () => updatePlayState(false));

      media.addEventListener('timeupdate', () => {
        if (!media.duration) return;
        this.timeCurrent.innerText = this.formatTime(media.currentTime);
        this.timeDuration.innerText = this.formatTime(media.duration);

        const pct = (media.currentTime / media.duration) * 100;
        this.seekbarProgress.style.width = pct + '%';
        this.seekbarThumb.style.left = pct + '%';
      });

      media.addEventListener('progress', () => {
        if (media.buffered.length > 0 && media.duration) {
          const bufferedEnd = media.buffered.end(media.buffered.length - 1);
          const bufPct = (bufferedEnd / media.duration) * 100;
          this.seekbarBuffered.style.width = bufPct + '%';
        }
      });

      // Handle media ended according to repeat & playlist rules
      media.addEventListener('ended', () => {
        if (this.playlistRepeatMode === 'one') {
          media.currentTime = 0;
          media.play().catch(() => {});
        } else {
          this.playNext();
        }
      });
    });

    // Seekbar Interaction
    this.seekbarTrack.parentElement.addEventListener('click', (e) => {
      const m = this.getActiveMedia();
      if (!m || !m.duration) return;
      const rect = this.seekbarTrack.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      m.currentTime = pos * m.duration;
    });

    this.seekbarTrack.parentElement.addEventListener('mousemove', (e) => {
      const m = this.getActiveMedia();
      if (!m || !m.duration) return;
      const rect = this.seekbarTrack.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const hoverTime = pos * m.duration;

      this.seekbarTooltip.innerText = this.formatTime(hoverTime);
      this.seekbarTooltip.style.left = `${e.clientX}px`;
      this.seekbarTooltip.classList.remove('hidden');
    });

    this.seekbarTrack.parentElement.addEventListener('mouseleave', () => {
      this.seekbarTooltip.classList.add('hidden');
    });

    // Volume & Mute
    this.volumeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.videoEl.volume = val;
      this.audioEl.volume = val;
      this.videoEl.muted = false;
      this.audioEl.muted = false;
      this.updateVolumeUI(val);
    });

    this.btnMute.addEventListener('click', () => {
      const isMuted = !this.videoEl.muted;
      this.videoEl.muted = isMuted;
      this.audioEl.muted = isMuted;
      this.updateVolumeUI(isMuted ? 0 : this.volumeSlider.value);
    });

    // Playback Speed
    this.btnSpeed.addEventListener('click', () => {
      this.currentSpeedIndex = (this.currentSpeedIndex + 1) % this.speeds.length;
      const rate = this.speeds[this.currentSpeedIndex];
      this.videoEl.playbackRate = rate;
      this.audioEl.playbackRate = rate;
      this.btnSpeed.innerText = rate + 'x';
      if (window.showVeloxOSD) window.showVeloxOSD(`Speed: ${rate}x`);
    });

    // Loop
    this.btnLoop.addEventListener('click', () => {
      this.videoEl.loop = !this.videoEl.loop;
      this.audioEl.loop = !this.audioEl.loop;
      this.btnLoop.classList.toggle('active', this.videoEl.loop);
      if (window.showVeloxOSD) window.showVeloxOSD(`Loop: ${this.videoEl.loop ? 'ON' : 'OFF'}`);
    });

    // PiP
    this.btnPip.addEventListener('click', async () => {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && !this.videoEl.classList.contains('hidden')) {
        await this.videoEl.requestPictureInPicture();
      }
    });

    // Fullscreen
    this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    this.videoEl.addEventListener('dblclick', () => this.toggleFullscreen());

    // Takeover Button Bottom
    this.btnTakeoverBottom.addEventListener('click', () => this.toggleTakeoverMode());
  }

  updateVolumeUI(val) {
    const isMuted = val === 0 || this.videoEl.muted;
    this.iconVolume.classList.toggle('hidden', isMuted);
    this.iconVolumeMuted.classList.toggle('hidden', !isMuted);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  playNext() {
    if (this.playlist.length > 0) {
      this.playPlaylistRelative(1);
    } else {
      this.switchTabRelative(1);
    }
  }

  playPrevious() {
    if (this.playlist.length > 0) {
      this.playPlaylistRelative(-1);
    } else {
      this.switchTabRelative(-1);
    }
  }

  switchTabRelative(offset) {
    if (this.tabs.length <= 1) return;
    const currentIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
    let newIndex = (currentIndex + offset) % this.tabs.length;
    if (newIndex < 0) newIndex += this.tabs.length;
    this.activateTab(this.tabs[newIndex].id);
  }

  // ==========================================================================
  // Audio DSP Engine & Visualizer Integration
  // ==========================================================================

  attachAudioDSP(mediaElement) {
    const AudioDSPClass = window.VeloxAudioDSP || window.AudioDSP;
    if (!AudioDSPClass) return;

    if (!this.audioDSP) {
      this.audioDSP = new AudioDSPClass();
    }

    try {
      this.audioDSP.attach(mediaElement);
    } catch (err) {
      console.warn('[VeloxPlayer] Failed to attach AudioDSP:', err);
    }
  }

  setupVisualizer() {
    const canvas = this.visualizerCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Use AnalyserNode from DSP if attached
    const analyser = this.audioDSP?.analyserNode;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = 160;
    };
    resize();

    const draw = () => {
      if (this.audioContainer.classList.contains('hidden')) return;
      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        gradient.addColorStop(0, '#1d4ed8');
        gradient.addColorStop(1, '#60a5fa');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    };
    draw();
  }

  bindEqualizerControls() {
    const FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

    // Dynamically render 10 sliders
    this.eqSlidersContainer.innerHTML = '';
    FREQS.forEach((freq, idx) => {
      const col = document.createElement('div');
      col.className = 'eq-slider-col';
      col.innerHTML = `
        <span class="eq-band-gain" id="eq-gain-${idx}">0dB</span>
        <input type="range" class="eq-v-slider" id="eq-band-${idx}" min="-12" max="12" step="0.5" value="0" orient="vertical" />
        <span class="eq-band-label">${LABELS[idx]}</span>
      `;

      const slider = col.querySelector('input');
      const gainLabel = col.querySelector('.eq-band-gain');

      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        gainLabel.innerText = `${val > 0 ? '+' : ''}${val}dB`;
        if (this.audioDSP) {
          this.audioDSP.setBandGain(idx, val);
          this.eqPresetSelect.value = 'Custom';
        }
      });

      this.eqSlidersContainer.appendChild(col);
    });

    // Preset selector
    this.eqPresetSelect.addEventListener('change', (e) => {
      const preset = e.target.value;
      if (preset === 'Custom') return;
      if (this.audioDSP) {
        this.audioDSP.applyPreset(preset);
        const gains = this.audioDSP.getBandGains();
        gains.forEach((g, idx) => {
          const s = document.getElementById(`eq-band-${idx}`);
          const l = document.getElementById(`eq-gain-${idx}`);
          if (s) s.value = g;
          if (l) l.innerText = `${g > 0 ? '+' : ''}${g}dB`;
        });
      }
    });

    // Enable / Bypass switch
    this.eqEnableToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      this.audioDSP?.setEqualizerEnabled(enabled);
      if (window.showVeloxOSD) window.showVeloxOSD(`Equalizer: ${enabled ? 'ENABLED' : 'BYPASSED'}`);
    });

    // Volume boost slider
    this.eqBoostSlider.addEventListener('input', (e) => {
      const boostVal = parseInt(e.target.value, 10);
      this.eqBoostVal.innerText = `${boostVal}%`;
      this.audioDSP?.setVolumeBoost(boostVal / 100);
    });

    // Stereo pan slider
    this.eqPanSlider.addEventListener('input', (e) => {
      const pan = parseFloat(e.target.value);
      this.audioDSP?.setPan(pan);
      let panText = 'Center';
      if (pan < -0.05) panText = `${Math.round(Math.abs(pan) * 100)}% Left`;
      else if (pan > 0.05) panText = `${Math.round(pan * 100)}% Right`;
      this.eqPanVal.innerText = panText;
    });

    // Flat reset button
    this.btnEqReset.addEventListener('click', () => {
      this.eqPresetSelect.value = 'Flat';
      this.eqPresetSelect.dispatchEvent(new Event('change'));
    });

    // Modal Close
    this.btnEqClose.addEventListener('click', () => this.toggleEqualizerModal(false));
    this.btnEqToggle.addEventListener('click', () => this.toggleEqualizerModal());
  }

  toggleEqualizerModal(forceState) {
    const isHidden = this.equalizerModal.classList.contains('hidden');
    const newState = typeof forceState === 'boolean' ? !forceState : isHidden;
    this.equalizerModal.classList.toggle('hidden', !newState);
  }

  // ==========================================================================
  // Video Filters & FX Integration
  // ==========================================================================

  attachVideoFX() {
    const VideoFXClass = window.VeloxVideoFX || window.VideoFX;
    if (!VideoFXClass) return;

    if (!this.videoFX) {
      this.videoFX = new VideoFXClass(this.videoEl, this.mediaStage);
    } else {
      this.videoFX.attach(this.videoEl, this.mediaStage);
    }

    // Sync A-B markers with seekbar
    window.addEventListener('velox:ab-repeat-change', (e) => {
      const { pointA, pointB, active } = e.detail;
      this.abValA.innerText = pointA !== null ? this.formatTime(pointA) : '--:--:--';
      this.abValB.innerText = pointB !== null ? this.formatTime(pointB) : '--:--:--';

      if (active && pointA !== null && pointB !== null && this.videoEl.duration) {
        const startPct = (pointA / this.videoEl.duration) * 100;
        const widthPct = ((pointB - pointA) / this.videoEl.duration) * 100;
        this.seekbarAbMarker.style.left = `${startPct}%`;
        this.seekbarAbMarker.style.width = `${widthPct}%`;
        this.seekbarAbMarker.classList.remove('hidden');
      } else {
        this.seekbarAbMarker.classList.add('hidden');
      }
    });
  }

  bindVideoFXControls() {
    // Sliders
    this.fxBrightness.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.fxBrightnessVal.innerText = `${val > 0 ? '+' : ''}${val}%`;
      this.videoFX?.setBrightness(val);
    });

    this.fxContrast.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.fxContrastVal.innerText = `${val > 0 ? '+' : ''}${val}%`;
      this.videoFX?.setContrast(val);
    });

    this.fxSaturation.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.fxSaturationVal.innerText = `${val}%`;
      this.videoFX?.setSaturation(val);
    });

    this.fxHue.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.fxHueVal.innerText = `${val}°`;
      this.videoFX?.setHue(val);
    });

    this.fxSharpen.addEventListener('change', (e) => {
      this.videoFX?.toggleSharpen(e.target.checked);
    });

    // Preset chips
    document.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = e.target.getAttribute('data-preset');
        if (this.videoFX && preset) {
          this.videoFX.applyPreset(preset);
          const f = this.videoFX.getFilters();
          this.fxBrightness.value = f.brightness;
          this.fxBrightnessVal.innerText = `${f.brightness}%`;
          this.fxContrast.value = f.contrast;
          this.fxContrastVal.innerText = `${f.contrast}%`;
          this.fxSaturation.value = f.saturation;
          this.fxSaturationVal.innerText = `${f.saturation}%`;
          this.fxHue.value = f.hue;
          this.fxHueVal.innerText = `${f.hue}°`;
          this.fxSharpen.checked = !!f.sharpen;
        }
      });
    });

    // Aspect Ratio Buttons
    this.aspectRatioGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.aspect-btn');
      if (!btn) return;
      const aspect = btn.getAttribute('data-aspect');
      this.videoFX?.setAspectRatio(aspect);
      this.aspectRatioGroup.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    // A-B Repeat Loop
    this.btnAbA.addEventListener('click', () => this.videoFX?.setPointA());
    this.btnAbB.addEventListener('click', () => this.videoFX?.setPointB());
    this.btnAbClear.addEventListener('click', () => this.videoFX?.clearABRepeat());

    // Frame stepping
    this.btnFramePrev.addEventListener('click', () => this.videoFX?.stepBackward(1));
    this.btnFrameNext.addEventListener('click', () => this.videoFX?.stepForward(1));

    // Reset All
    this.btnFxReset.addEventListener('click', () => {
      this.videoFX?.resetFilters();
      this.fxBrightness.value = 0;
      this.fxBrightnessVal.innerText = '0%';
      this.fxContrast.value = 0;
      this.fxContrastVal.innerText = '0%';
      this.fxSaturation.value = 100;
      this.fxSaturationVal.innerText = '100%';
      this.fxHue.value = 0;
      this.fxHueVal.innerText = '0°';
      this.fxSharpen.checked = false;
    });

    // Close & Toggle
    this.btnFxClose.addEventListener('click', () => this.toggleVideoFXModal(false));
    this.btnFxToggle.addEventListener('click', () => this.toggleVideoFXModal());
  }

  toggleVideoFXModal(forceState) {
    const isHidden = this.videofxModal.classList.contains('hidden');
    const newState = typeof forceState === 'boolean' ? !forceState : isHidden;
    this.videofxModal.classList.toggle('hidden', !newState);
  }

  // ==========================================================================
  // Subtitles & Overlay Integration
  // ==========================================================================

  attachSubtitles() {
    const SubtitleClass = window.VeloxSubtitles || window.Subtitles;
    if (!SubtitleClass) return;

    if (!this.subtitles) {
      this.subtitles = new SubtitleClass();
    }
    this.subtitles.attach(this.videoEl, this.subtitleOverlay);
  }

  bindSubtitleControls() {
    this.btnSubtitlesToggle.addEventListener('click', () => this.toggleSubtitlesPopover());
    this.btnSubtitlesClose.addEventListener('click', () => this.toggleSubtitlesPopover(false));

    // Track selection
    this.subTrackSelect.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (val === 'none') {
        this.subtitles?.hide();
      } else if (val === 'load') {
        const files = await window.velox?.openFileDialog();
        if (files && files.length > 0) {
          const subFile = files[0];
          try {
            await this.subtitles?.loadUrl(subFile);
            this.subtitles?.show();

            // Add track to select options
            const opt = document.createElement('option');
            opt.value = subFile;
            opt.innerText = subFile.replace(/^.*[\\\/]/, '');
            opt.selected = true;
            this.subTrackSelect.insertBefore(opt, this.subTrackSelect.lastElementChild);
            if (window.showVeloxOSD) window.showVeloxOSD(`Subtitle Loaded: ${opt.innerText}`);
          } catch (err) {
            console.warn('[VeloxPlayer] Failed to load subtitle file:', err);
          }
        }
      } else {
        this.subtitles?.show();
      }
    });

    // Timing Offset
    this.btnSubAdvance.addEventListener('click', () => {
      this.subtitles?.advance(50);
      this.updateSubOffsetBadge();
    });

    this.btnSubDelay.addEventListener('click', () => {
      this.subtitles?.delay(50);
      this.updateSubOffsetBadge();
    });

    this.btnSubReset.addEventListener('click', () => {
      this.subtitles?.resetOffset();
      this.updateSubOffsetBadge();
    });

    // Font size
    this.subSizeSelect.addEventListener('change', (e) => {
      this.subtitles?.setFontSize(e.target.value);
    });
  }

  updateSubOffsetBadge() {
    const offsetMs = this.subtitles ? this.subtitles.getOffset() : 0;
    const sign = offsetMs > 0 ? '+' : '';
    this.subOffsetDisplay.innerText = `${sign}${offsetMs} ms`;
    if (window.showVeloxOSD) {
      window.showVeloxOSD(`Subtitle Offset: ${sign}${offsetMs} ms`);
    }
  }

  toggleSubtitlesPopover(forceState) {
    const isHidden = this.subtitlesPopover.classList.contains('hidden');
    const newState = typeof forceState === 'boolean' ? !forceState : isHidden;
    this.subtitlesPopover.classList.toggle('hidden', !newState);
  }

  // ==========================================================================
  // Slide-out Right Playlist Drawer Management
  // ==========================================================================

  addToPlaylist(filePath, fileName, mediaType) {
    const exists = this.playlist.find(item => item.path === filePath);
    if (exists) return;

    const item = {
      id: 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: fileName || filePath.replace(/^.*[\\\/]/, ''),
      path: filePath,
      type: mediaType || this.detectMediaType(filePath),
      duration: 0
    };

    this.playlist.push(item);
    this.renderPlaylist();
  }

  removeFromPlaylist(itemId, e) {
    if (e) e.stopPropagation();
    this.playlist = this.playlist.filter(i => i.id !== itemId);
    this.renderPlaylist();
  }

  clearPlaylist() {
    this.playlist = [];
    this.renderPlaylist();
    if (window.showVeloxOSD) window.showVeloxOSD('Playlist Cleared');
  }

  highlightPlaylistItemByPath(path) {
    const item = this.playlist.find(i => i.path === path);
    this.activePlaylistItemId = item ? item.id : null;
    this.renderPlaylist();
  }

  renderPlaylist() {
    const filterQuery = (this.playlistSearch.value || '').trim().toLowerCase();
    const filtered = filterQuery
      ? this.playlist.filter(i => i.name.toLowerCase().includes(filterQuery))
      : this.playlist;

    this.playlistBadge.innerText = this.playlist.length;
    this.playlistStatusText.innerText = `${this.playlist.length} items`;

    if (filtered.length === 0) {
      this.playlistItemsContainer.innerHTML = `
        <div class="playlist-empty-state">
          <span>${this.playlist.length === 0 ? 'Playlist is empty.' : 'No matching files found.'}</span>
          <span class="subtext">Drop media files here or click ➕</span>
        </div>
      `;
      return;
    }

    this.playlistItemsContainer.innerHTML = '';
    filtered.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = `playlist-item ${item.id === this.activePlaylistItemId ? 'active' : ''}`;
      el.setAttribute('data-pl-id', item.id);

      const icon = item.type === 'video' ? '🎬' : (item.type === 'audio' ? '🎵' : '🖼️');

      el.innerHTML = `
        <span class="playlist-item-idx">${idx + 1}</span>
        <span class="playlist-item-icon">${icon}</span>
        <span class="playlist-item-title" title="${item.name}">${item.name}</span>
        <span class="playlist-item-duration">${item.duration ? this.formatTime(item.duration) : '--:--'}</span>
        <button class="playlist-item-remove" title="Remove from playlist">✕</button>
      `;

      el.addEventListener('click', (e) => {
        if (!e.target.classList.contains('playlist-item-remove')) {
          this.playPlaylistItem(item);
        }
      });

      el.querySelector('.playlist-item-remove').addEventListener('click', (e) => {
        this.removeFromPlaylist(item.id, e);
      });

      this.playlistItemsContainer.appendChild(el);
    });
  }

  playPlaylistItem(item) {
    this.activePlaylistItemId = item.id;
    // Check if an existing tab is open for this path
    const existingTab = this.tabs.find(t => t.path === item.path);
    if (existingTab) {
      this.activateTab(existingTab.id);
    } else {
      this.addTab(item.path);
    }
  }

  playPlaylistRelative(offset) {
    if (this.playlist.length === 0) return;

    if (this.isPlaylistShuffled) {
      const randIdx = Math.floor(Math.random() * this.playlist.length);
      this.playPlaylistItem(this.playlist[randIdx]);
      return;
    }

    const curIdx = this.playlist.findIndex(i => i.id === this.activePlaylistItemId);
    let nextIdx = (curIdx + offset) % this.playlist.length;
    if (nextIdx < 0) nextIdx += this.playlist.length;
    this.playPlaylistItem(this.playlist[nextIdx]);
  }

  bindPlaylistControls() {
    this.btnPlaylistToggle.addEventListener('click', () => this.togglePlaylistDrawer());
    this.btnPlaylistClose.addEventListener('click', () => this.hidePlaylistDrawer());

    // Dock toggle
    this.btnPlaylistDock.addEventListener('click', () => {
      this.isPlaylistDocked = !this.isPlaylistDocked;
      this.playlistDrawer.classList.toggle('docked', this.isPlaylistDocked);
      this.btnPlaylistDock.classList.toggle('active', this.isPlaylistDocked);
      if (window.showVeloxOSD) {
        window.showVeloxOSD(`Playlist: ${this.isPlaylistDocked ? 'DOCKED' : 'FLOATING'}`);
      }
    });

    // Search filter
    this.playlistSearch.addEventListener('input', () => {
      this.btnPlaylistSearchClear.classList.toggle('hidden', !this.playlistSearch.value);
      this.renderPlaylist();
    });

    this.btnPlaylistSearchClear.addEventListener('click', () => {
      this.playlistSearch.value = '';
      this.btnPlaylistSearchClear.classList.add('hidden');
      this.renderPlaylist();
    });

    // Shuffle toggle
    this.btnPlaylistShuffle.addEventListener('click', () => {
      this.isPlaylistShuffled = !this.isPlaylistShuffled;
      this.btnPlaylistShuffle.classList.toggle('active', this.isPlaylistShuffled);
      if (window.showVeloxOSD) window.showVeloxOSD(`Shuffle: ${this.isPlaylistShuffled ? 'ON' : 'OFF'}`);
    });

    // Repeat Mode cycle: off -> all -> one -> off
    this.btnPlaylistRepeat.addEventListener('click', () => {
      const modes = ['off', 'all', 'one'];
      const nextIdx = (modes.indexOf(this.playlistRepeatMode) + 1) % modes.length;
      this.playlistRepeatMode = modes[nextIdx];
      this.btnPlaylistRepeat.setAttribute('data-mode', this.playlistRepeatMode);

      const labels = { off: '🔁 Off', all: '🔁 All', one: '🔂 One' };
      this.btnPlaylistRepeat.innerText = labels[this.playlistRepeatMode];
      this.btnPlaylistRepeat.classList.toggle('active', this.playlistRepeatMode !== 'off');
      if (window.showVeloxOSD) window.showVeloxOSD(`Repeat: ${this.playlistRepeatMode.toUpperCase()}`);
    });

    // Add & Clear buttons
    this.btnPlaylistAdd.addEventListener('click', () => this.requestOpenFiles());
    this.btnPlaylistClear.addEventListener('click', () => this.clearPlaylist());
  }

  showPlaylistDrawer() {
    this.playlistDrawer.classList.remove('collapsed');
    this.btnPlaylistToggle.classList.add('active');
  }

  hidePlaylistDrawer() {
    this.playlistDrawer.classList.add('collapsed');
    this.btnPlaylistToggle.classList.remove('active');
  }

  togglePlaylistDrawer() {
    if (this.playlistDrawer.classList.contains('collapsed')) {
      this.showPlaylistDrawer();
    } else {
      this.hidePlaylistDrawer();
    }
  }

  // ==========================================================================
  // Image Viewer & Filmstrip Thumbnail Bar
  // ==========================================================================

  async loadFilmstripForImage(imagePath) {
    if (!window.velox?.scanFolder) return;
    const folderPath = imagePath.replace(/[\\\/][^\\\/]+$/, '');

    try {
      const res = await window.velox.scanFolder(folderPath, { types: ['image'], maxFiles: 100 });
      if (res && Array.isArray(res.files) && res.files.length > 0) {
        this.filmstripImages = res.files;
        this.renderFilmstrip(imagePath);
      }
    } catch (err) {
      console.warn('[VeloxPlayer] Failed to load filmstrip images:', err);
    }
  }

  renderFilmstrip(activePath) {
    this.filmstripThumbnails.innerHTML = '';
    this.filmstripCount.innerText = `${this.filmstripImages.length} images`;

    this.filmstripImages.forEach((img, idx) => {
      const isCurrent = img.path === activePath;
      if (isCurrent) this.activeFilmstripIndex = idx;

      const thumb = document.createElement('div');
      thumb.className = `filmstrip-thumb ${isCurrent ? 'active' : ''}`;
      thumb.setAttribute('data-idx', idx);

      const fileUrl = img.path.startsWith('file://') ? img.path : `file:///${img.path.replace(/\\/g, '/')}`;

      thumb.innerHTML = `
        <img src="${fileUrl}" alt="${img.name}" loading="lazy" />
        <span class="thumb-label">${img.name}</span>
      `;

      thumb.addEventListener('click', () => {
        this.activeFilmstripIndex = idx;
        this.addTab(img.path);
      });

      this.filmstripThumbnails.appendChild(thumb);
    });

    const activeEl = this.filmstripThumbnails.querySelector('.filmstrip-thumb.active');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  toggleFilmstrip(forceState) {
    const isHidden = this.imageFilmstrip.classList.contains('hidden');
    const newState = typeof forceState === 'boolean' ? !forceState : isHidden;
    this.imageFilmstrip.classList.toggle('hidden', !newState);
  }

  bindFilmstripControls() {
    this.btnFilmstripClose?.addEventListener('click', () => this.toggleFilmstrip(false));
    this.btnToggleFilmstrip?.addEventListener('click', () => this.toggleFilmstrip());

    this.btnFilmstripPrev?.addEventListener('click', () => {
      if (this.filmstripImages.length === 0) return;
      let nextIdx = this.activeFilmstripIndex - 1;
      if (nextIdx < 0) nextIdx = this.filmstripImages.length - 1;
      this.activeFilmstripIndex = nextIdx;
      this.addTab(this.filmstripImages[nextIdx].path);
    });

    this.btnFilmstripNext?.addEventListener('click', () => {
      if (this.filmstripImages.length === 0) return;
      const nextIdx = (this.activeFilmstripIndex + 1) % this.filmstripImages.length;
      this.activeFilmstripIndex = nextIdx;
      this.addTab(this.filmstripImages[nextIdx].path);
    });
  }

  bindImageControls() {
    this.imageContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 1.15 : 0.85;
      this.imageState.zoom = Math.max(0.1, Math.min(25, this.imageState.zoom * zoomDelta));
      this.applyImageTransform();
    });

    this.imageContainer.addEventListener('mousedown', (e) => {
      this.imageState.isDragging = true;
      this.imageState.startX = e.clientX - this.imageState.panX;
      this.imageState.startY = e.clientY - this.imageState.panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.imageState.isDragging) return;
      this.imageState.panX = e.clientX - this.imageState.startX;
      this.imageState.panY = e.clientY - this.imageState.startY;
      this.applyImageTransform();
    });

    window.addEventListener('mouseup', () => {
      this.imageState.isDragging = false;
    });

    document.getElementById('btn-rotate-img')?.addEventListener('click', () => {
      this.imageState.rotation = (this.imageState.rotation + 90) % 360;
      this.applyImageTransform();
    });

    document.getElementById('btn-reset-img')?.addEventListener('click', () => this.resetImageState());
    this.imageContainer.addEventListener('dblclick', () => this.resetImageState());
  }

  resetImageState() {
    this.imageState.zoom = 1;
    this.imageState.panX = 0;
    this.imageState.panY = 0;
    this.imageState.rotation = 0;
    this.applyImageTransform();
  }

  applyImageTransform() {
    this.imageEl.style.transform = `translate(${this.imageState.panX}px, ${this.imageState.panY}px) scale(${this.imageState.zoom}) rotate(${this.imageState.rotation}deg)`;
    this.imageZoomLevel.innerText = Math.round(this.imageState.zoom * 100) + '%';
  }

  // ==========================================================================
  // Drag and Drop & Inactivity
  // ==========================================================================

  bindDragAndDrop() {
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        files.forEach(f => this.addTab(f.path));
      }
    });
  }

  bindInactivityHandlers() {
    const resetTimer = () => {
      document.body.classList.add('mouse-active');
      clearTimeout(this.mouseTimer);

      this.mouseTimer = setTimeout(() => {
        document.body.classList.remove('mouse-active');
      }, 2500);
    };

    window.addEventListener('mousemove', (e) => {
      resetTimer();
      if (this.isTakeoverMode) {
        if (e.clientY <= 25) {
          document.body.classList.add('header-peeking');
        } else if (e.clientY > 50) {
          document.body.classList.remove('header-peeking');
        }
      }
    });
  }

  // ==========================================================================
  // Global Keyboard Shortcuts
  // ==========================================================================

  bindShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Toggle File Takeover
      if (e.key === 'Tab' || e.key === 'F10') {
        e.preventDefault();
        this.toggleTakeoverMode();
      }
      // Play / Pause
      else if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlayPause();
      }
      // Equalizer modal (E)
      else if (e.key.toLowerCase() === 'e') {
        e.preventDefault();
        this.toggleEqualizerModal();
      }
      // Video FX modal (V)
      else if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        this.toggleVideoFXModal();
      }
      // Subtitles popover (C)
      else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        this.toggleSubtitlesPopover();
      }
      // Playlist Drawer (F8)
      else if (e.key === 'F8') {
        e.preventDefault();
        this.togglePlaylistDrawer();
      }
      // Filmstrip (I)
      else if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        this.toggleFilmstrip();
      }
      // Subtitle offset shortcuts: [ (advance 50ms), ] (delay 50ms)
      else if (e.key === '[') {
        e.preventDefault();
        this.subtitles?.advance(50);
        this.updateSubOffsetBadge();
      }
      else if (e.key === ']') {
        e.preventDefault();
        this.subtitles?.delay(50);
        this.updateSubOffsetBadge();
      }
      // Fullscreen
      else if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
        e.preventDefault();
        this.toggleFullscreen();
      }
      // Open files (Ctrl+O)
      else if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.requestOpenFiles();
      }
      // New tab (Ctrl+T)
      else if (e.ctrlKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        this.requestOpenFiles();
      }
      // Close tab (Ctrl+W)
      else if (e.ctrlKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (this.activeTabId) this.closeTab(this.activeTabId);
      }
      // Switch tabs (Ctrl+Tab)
      else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        this.switchTabRelative(e.shiftKey ? -1 : 1);
      }
      // Arrow Right: Seek forward 5s
      else if (e.key === 'ArrowRight') {
        const m = this.getActiveMedia();
        if (m && m.duration) m.currentTime = Math.min(m.duration, m.currentTime + 5);
      }
      // Arrow Left: Seek backward 5s
      else if (e.key === 'ArrowLeft') {
        const m = this.getActiveMedia();
        if (m && m.duration) m.currentTime = Math.max(0, m.currentTime - 5);
      }
      // Arrow Up: Volume Up
      else if (e.key === 'ArrowUp') {
        const v = Math.min(1, this.videoEl.volume + 0.05);
        this.volumeSlider.value = v;
        this.videoEl.volume = v;
        this.audioEl.volume = v;
        this.updateVolumeUI(v);
      }
      // Arrow Down: Volume Down
      else if (e.key === 'ArrowDown') {
        const v = Math.max(0, this.videoEl.volume - 0.05);
        this.volumeSlider.value = v;
        this.videoEl.volume = v;
        this.audioEl.volume = v;
        this.updateVolumeUI(v);
      }
      // Mute (M)
      else if (e.key.toLowerCase() === 'm') {
        this.btnMute.click();
      }
      // Rotate image (R)
      else if (e.key.toLowerCase() === 'r') {
        if (!this.imageContainer.classList.contains('hidden')) {
          this.imageState.rotation = (this.imageState.rotation + 90) % 360;
          this.applyImageTransform();
        }
      }
      // Reset image zoom (0)
      else if (e.key === '0') {
        if (!this.imageContainer.classList.contains('hidden')) {
          this.resetImageState();
        }
      }
    });
  }

  // Format Time (HH:MM:SS)
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
}

// Instantiate player on DOM readiness
window.addEventListener('DOMContentLoaded', () => {
  new VeloxPlayer();
});
