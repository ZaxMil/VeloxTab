// ==========================================================================
// VeloxTab — Multi-Tab Universal Media Player Core Logic
// ==========================================================================

class VeloxPlayer {
  constructor() {
    this.tabs = [];
    this.activeTabId = null;
    this.isTakeoverMode = false;
    this.mouseTimer = null;

    // Elements
    this.appHeader = document.getElementById('app-header');
    this.tabList = document.getElementById('tab-list');
    this.emptyState = document.getElementById('empty-state');
    this.mediaStage = document.getElementById('media-stage');
    this.videoEl = document.getElementById('video-element');
    this.audioContainer = document.getElementById('audio-container');
    this.audioEl = document.getElementById('audio-element');
    this.audioTitle = document.getElementById('audio-title');
    this.visualizerCanvas = document.getElementById('visualizer-canvas');
    this.imageContainer = document.getElementById('image-container');
    this.imageEl = document.getElementById('image-element');
    this.imageZoomLevel = document.getElementById('image-zoom-level');
    this.controlBar = document.getElementById('control-bar');

    // Control Elements
    this.btnPlayPause = document.getElementById('btn-play-pause');
    this.iconPlay = document.getElementById('icon-play');
    this.iconPause = document.getElementById('icon-pause');
    this.btnStop = document.getElementById('btn-stop');
    this.btnPrev = document.getElementById('btn-prev');
    this.btnNext = document.getElementById('btn-next');
    this.timeCurrent = document.getElementById('time-current');
    this.timeDuration = document.getElementById('time-duration');
    this.seekbarTrack = document.getElementById('seekbar-track');
    this.seekbarProgress = document.getElementById('seekbar-progress');
    this.seekbarBuffered = document.getElementById('seekbar-buffered');
    this.seekbarThumb = document.getElementById('seekbar-thumb');
    this.seekbarTooltip = document.getElementById('seekbar-tooltip');
    this.btnMute = document.getElementById('btn-mute');
    this.iconVolume = document.getElementById('icon-volume');
    this.iconVolumeMuted = document.getElementById('icon-volume-muted');
    this.volumeSlider = document.getElementById('volume-slider');
    this.btnSpeed = document.getElementById('btn-speed');
    this.btnLoop = document.getElementById('btn-loop');
    this.btnPip = document.getElementById('btn-pip');
    this.btnFullscreen = document.getElementById('btn-fullscreen');
    this.btnToggleTakeover = document.getElementById('btn-toggle-takeover');
    this.btnTakeoverBottom = document.getElementById('btn-takeover-bottom');

    // Menu Elements
    this.btnMenu = document.getElementById('btn-menu');
    this.dropdownMenu = document.getElementById('dropdown-menu');

    // Audio Context & Visualizer
    this.audioCtx = null;
    this.analyser = null;
    this.audioSource = null;
    this.visualizerAnimationId = null;

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

    this.init();
  }

  init() {
    this.bindWindowControls();
    this.bindMenu();
    this.bindMediaControls();
    this.bindImageControls();
    this.bindDragAndDrop();
    this.bindShortcuts();
    this.bindInactivityHandlers();

    // Listen to files opened from CLI or initial launch
    if (window.velox) {
      window.velox.onOpenInitialFiles((files) => {
        if (files && files.length > 0) {
          files.forEach(f => this.addTab(f));
        }
      });
    }

    // Open file from empty dropzone
    document.getElementById('btn-browse-empty').addEventListener('click', () => this.requestOpenFiles());
    document.getElementById('btn-add-tab').addEventListener('click', () => this.requestOpenFiles());
  }

  // Window Controls
  bindWindowControls() {
    document.getElementById('win-min').addEventListener('click', () => window.velox?.minimize());
    document.getElementById('win-max').addEventListener('click', () => window.velox?.maximize());
    document.getElementById('win-close').addEventListener('click', () => window.velox?.close());

    if (window.velox) {
      window.velox.onWindowStateChanged(({ isMaximized }) => {
        document.getElementById('win-max').innerText = isMaximized ? '❐' : '□';
      });
    }
  }

  // Menu Dropdown
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

    document.getElementById('menu-open-file').addEventListener('click', () => this.requestOpenFiles());
    document.getElementById('menu-new-tab').addEventListener('click', () => this.requestOpenFiles());
    document.getElementById('menu-takeover').addEventListener('click', () => this.toggleTakeoverMode());
    document.getElementById('menu-close-tab').addEventListener('click', () => {
      if (this.activeTabId) this.closeTab(this.activeTabId);
    });
    document.getElementById('menu-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    document.getElementById('menu-fit-window').addEventListener('click', () => this.resetImageState());
    document.getElementById('menu-about').addEventListener('click', () => {
      alert('VeloxTab v1.0.0\nUltra-fast Multi-Tab Universal Media Player\nCreated by ZAX Mil');
    });
  }

  // Open Native File Dialog
  async requestOpenFiles() {
    if (!window.velox) return;
    const files = await window.velox.openFileDialog();
    if (files && files.length > 0) {
      files.forEach(f => this.addTab(f));
    }
  }

  // Detect Media Type
  detectMediaType(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const videoExts = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv', 'ts', 'm4v'];
    const audioExts = ['mp3', 'flac', 'wav', 'aac', 'ogg', 'opus', 'm4a', 'wma'];
    const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'svg'];

    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (imageExts.includes(ext)) return 'image';
    return 'video'; // fallback
  }

  // Add a new Tab
  addTab(filePath) {
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
      isPaused: false
    };

    this.tabs.push(newTab);
    this.renderTabs();
    this.activateTab(tabId);
  }

  // Close Tab
  closeTab(tabId) {
    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    // If closing active tab, pause playback
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

    // Switch to next or previous tab
    const nextIndex = Math.min(index, this.tabs.length - 1);
    this.renderTabs();
    this.activateTab(this.tabs[nextIndex].id);
  }

  // Render Tab List DOM
  renderTabs() {
    this.tabList.innerHTML = '';
    this.tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `media-tab ${tab.id === this.activeTabId ? 'active' : ''}`;
      tabEl.setAttribute('data-tab-id', tab.id);

      const icon = tab.type === 'video' ? '🎬' : (tab.type === 'audio' ? '🎵' : '🖼️');

      tabEl.innerHTML = `
        <span class="tab-icon">${icon}</span>
        <span class="tab-title" title="${tab.name}">${tab.name}</span>
        <span class="tab-close" title="Close Tab">✕</span>
      `;

      tabEl.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
          this.activateTab(tab.id);
        }
      });

      tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });

      this.tabList.appendChild(tabEl);
    });

    // Auto-scroll to active tab
    const activeEl = this.tabList.querySelector('.media-tab.active');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Activate Tab
  activateTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    this.activeTabId = tabId;
    this.renderTabs();

    this.emptyState.classList.add('hidden');
    this.mediaStage.classList.remove('hidden');

    // Reset elements
    this.videoEl.classList.add('hidden');
    this.audioContainer.classList.add('hidden');
    this.imageContainer.classList.add('hidden');
    this.videoEl.pause();
    this.audioEl.pause();

    const fileUrl = tab.path.startsWith('file://') ? tab.path : `file:///${tab.path.replace(/\\/g, '/')}`;

    if (tab.type === 'video') {
      this.controlBar.classList.remove('hidden');
      this.videoEl.classList.remove('hidden');
      this.videoEl.src = fileUrl;
      this.videoEl.playbackRate = this.speeds[this.currentSpeedIndex];
      this.videoEl.play().catch(() => {});
    } else if (tab.type === 'audio') {
      this.controlBar.classList.remove('hidden');
      this.audioContainer.classList.remove('hidden');
      this.audioTitle.innerText = tab.name;
      this.audioEl.src = fileUrl;
      this.audioEl.playbackRate = this.speeds[this.currentSpeedIndex];
      this.setupVisualizer();
      this.audioEl.play().catch(() => {});
    } else if (tab.type === 'image') {
      // Hide control bar for static images
      this.controlBar.classList.add('hidden');
      this.imageContainer.classList.remove('hidden');
      this.resetImageState();
      this.imageEl.src = fileUrl;
    }
  }

  showEmptyState() {
    this.emptyState.classList.remove('hidden');
    this.mediaStage.classList.add('hidden');
    this.controlBar.classList.add('hidden');
    this.videoEl.src = '';
    this.audioEl.src = '';
    this.imageEl.src = '';
  }

  // Toggle File Takeover Mode
  toggleTakeoverMode() {
    this.isTakeoverMode = !this.isTakeoverMode;
    document.body.classList.toggle('takeover-mode', this.isTakeoverMode);
    this.btnToggleTakeover.classList.toggle('active', this.isTakeoverMode);
    this.btnTakeoverBottom.classList.toggle('active', this.isTakeoverMode);
  }

  // Media Controls (Playback, Seek, Volume)
  bindMediaControls() {
    const getActiveMedia = () => {
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      if (!activeTab) return null;
      return activeTab.type === 'video' ? this.videoEl : (activeTab.type === 'audio' ? this.audioEl : null);
    };

    // Play/Pause
    const togglePlay = () => {
      const m = getActiveMedia();
      if (!m) return;
      if (m.paused) {
        m.play();
      } else {
        m.pause();
      }
    };

    this.btnPlayPause.addEventListener('click', togglePlay);
    this.videoEl.addEventListener('click', togglePlay);

    // Stop
    this.btnStop.addEventListener('click', () => {
      const m = getActiveMedia();
      if (!m) return;
      m.pause();
      m.currentTime = 0;
    });

    // Prev / Next Tab
    this.btnPrev.addEventListener('click', () => this.switchTabRelative(-1));
    this.btnNext.addEventListener('click', () => this.switchTabRelative(1));

    // Update play/pause icon
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
    });

    // Seekbar Interaction
    this.seekbarTrack.parentElement.addEventListener('click', (e) => {
      const m = getActiveMedia();
      if (!m || !m.duration) return;
      const rect = this.seekbarTrack.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      m.currentTime = pos * m.duration;
    });

    this.seekbarTrack.parentElement.addEventListener('mousemove', (e) => {
      const m = getActiveMedia();
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
      this.updateVolumeUI(val);
    });

    this.btnMute.addEventListener('click', () => {
      const isMuted = !this.videoEl.muted;
      this.videoEl.muted = isMuted;
      this.audioEl.muted = isMuted;
      this.iconVolume.classList.toggle('hidden', isMuted);
      this.iconVolumeMuted.classList.toggle('hidden', !isMuted);
    });

    // Playback Speed
    this.btnSpeed.addEventListener('click', () => {
      this.currentSpeedIndex = (this.currentSpeedIndex + 1) % this.speeds.length;
      const rate = this.speeds[this.currentSpeedIndex];
      this.videoEl.playbackRate = rate;
      this.audioEl.playbackRate = rate;
      this.btnSpeed.innerText = rate + 'x';
    });

    // Loop
    this.btnLoop.addEventListener('click', () => {
      this.videoEl.loop = !this.videoEl.loop;
      this.audioEl.loop = !this.audioEl.loop;
      this.btnLoop.classList.toggle('active', this.videoEl.loop);
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
    this.btnToggleTakeover.addEventListener('click', () => this.toggleTakeoverMode());
  }

  updateVolumeUI(val) {
    const isMuted = val === 0;
    this.iconVolume.classList.toggle('hidden', isMuted);
    this.iconVolumeMuted.classList.toggle('hidden', !isMuted);
  }

  switchTabRelative(offset) {
    if (this.tabs.length <= 1) return;
    const currentIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
    let newIndex = (currentIndex + offset) % this.tabs.length;
    if (newIndex < 0) newIndex += this.tabs.length;
    this.activateTab(this.tabs[newIndex].id);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  // Setup High-FPS Audio Visualizer
  setupVisualizer() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.audioSource = this.audioCtx.createMediaElementSource(this.audioEl);
      this.audioSource.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const canvas = this.visualizerCanvas;
    const ctx = canvas.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = 160;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      this.visualizerAnimationId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;

        // Gradient bar
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        gradient.addColorStop(0, '#1d4ed8');
        gradient.addColorStop(1, '#60a5fa');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);

        x += barWidth;
      }
    };

    if (this.visualizerAnimationId) cancelAnimationFrame(this.visualizerAnimationId);
    draw();
  }

  // Image Controls (Zoom & Pan)
  bindImageControls() {
    // Zoom via mouse wheel
    this.imageContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 1.15 : 0.85;
      this.imageState.zoom = Math.max(0.1, Math.min(25, this.imageState.zoom * zoomDelta));
      this.applyImageTransform();
    });

    // Pan via drag
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

    // Rotate & Reset Buttons
    document.getElementById('btn-rotate-img').addEventListener('click', () => {
      this.imageState.rotation = (this.imageState.rotation + 90) % 360;
      this.applyImageTransform();
    });

    document.getElementById('btn-reset-img').addEventListener('click', () => this.resetImageState());
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

  // Drag and Drop Files
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

  // Inactivity Auto-Hide Controls & Peeking
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

      // Peeking header in Takeover Mode when mouse is within top 25px
      if (this.isTakeoverMode) {
        if (e.clientY <= 25) {
          document.body.classList.add('header-peeking');
        } else if (e.clientY > 50) {
          document.body.classList.remove('header-peeking');
        }
      }
    });
  }

  // Keyboard Shortcuts
  bindShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Toggle File Takeover Mode
      if (e.key === 'Tab' || e.key === 'F10') {
        e.preventDefault();
        this.toggleTakeoverMode();
      }
      // Play / Pause
      else if (e.code === 'Space') {
        e.preventDefault();
        this.btnPlayPause.click();
      }
      // Fullscreen
      else if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
        e.preventDefault();
        this.toggleFullscreen();
      }
      // Open files
      else if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.requestOpenFiles();
      }
      // New tab
      else if (e.ctrlKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        this.requestOpenFiles();
      }
      // Close tab
      else if (e.ctrlKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (this.activeTabId) this.closeTab(this.activeTabId);
      }
      // Switch tabs
      else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        this.switchTabRelative(e.shiftKey ? -1 : 1);
      }
      // Arrow Right: Seek forward 5s
      else if (e.key === 'ArrowRight') {
        const m = this.videoEl.classList.contains('hidden') ? this.audioEl : this.videoEl;
        if (m && m.duration) m.currentTime = Math.min(m.duration, m.currentTime + 5);
      }
      // Arrow Left: Seek backward 5s
      else if (e.key === 'ArrowLeft') {
        const m = this.videoEl.classList.contains('hidden') ? this.audioEl : this.videoEl;
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
      // Mute
      else if (e.key.toLowerCase() === 'm') {
        this.btnMute.click();
      }
      // Rotate image
      else if (e.key.toLowerCase() === 'r') {
        if (!this.imageContainer.classList.contains('hidden')) {
          this.imageState.rotation = (this.imageState.rotation + 90) % 360;
          this.applyImageTransform();
        }
      }
      // Reset image zoom
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

// Instantiate player when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new VeloxPlayer();
});
