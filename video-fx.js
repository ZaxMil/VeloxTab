/**
 * VeloxTab — Video Enhancements, Post-Processing & OSD Engine (video-fx.js)
 * 
 * Features:
 * - Hardware-accelerated CSS & WebGL Video Filters:
 *   - Brightness: -100% to +100%
 *   - Contrast: -100% to +100%
 *   - Saturation: 0% (B&W) to 200% (Vivid)
 *   - Hue Rotate: 0° to 360°
 *   - Hardware Sharpen filter toggle (SVG convolution matrix / WebGL 3x3 kernel)
 *   - Presets: Default, Vivid, Cinema/Warm, Night Mode, B&W Monochrome, High Contrast
 *   - Dual Render Engines: Zero-copy GPU CSS compositor mode & WebGL2 canvas pipeline
 * - Aspect Ratio Switcher:
 *   - Presets: Auto (Original), 16:9 (Widescreen), 4:3 (Standard), 21:9 (Ultrawide), Fill Screen, Fit to Window
 *   - Interactive cycling & direct selection
 * - A-B Repeat Segment Loop:
 *   - Sub-frame accurate seamless looping using requestAnimationFrame monitor
 *   - Point A marker, Point B marker, toggle & clear
 *   - Custom event emission ('velox:ab-repeat-change') for timeline/UI markers
 * - Frame Stepping:
 *   - Step Forward 1 frame ('.')
 *   - Step Backward 1 frame (',')
 *   - Configurable FPS (default 30fps) & millisecond timestamp display
 * - PotPlayer-Style Minimalist OSD Banner:
 *   - Top-left glass banner with glowing cyan accent & crisp typography
 *   - Dynamic triggers: Volume, Speed, Aspect, Seek, Filters, A-B Repeat, Frame Step
 *   - Global window.showVeloxOSD helper for universal player feedback
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VeloxVideoFX = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Safe Animation Frame Shims (Works in both Browser DOM & Node.js environments)
  const _raf = typeof requestAnimationFrame !== 'undefined'
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 16);

  const _caf = typeof cancelAnimationFrame !== 'undefined'
    ? cancelAnimationFrame
    : (id) => clearTimeout(id);

  // ============================================================================
  // Constants & Preset Configurations
  // ============================================================================

  const ASPECT_RATIOS = {
    'auto': {
      id: 'auto',
      label: 'Auto (Original)',
      aspectRatio: 'auto',
      objectFit: 'contain'
    },
    '16:9': {
      id: '16:9',
      label: '16:9 (Widescreen)',
      aspectRatio: '16 / 9',
      objectFit: 'fill'
    },
    '4:3': {
      id: '4:3',
      label: '4:3 (Standard)',
      aspectRatio: '4 / 3',
      objectFit: 'fill'
    },
    '21:9': {
      id: '21:9',
      label: '21:9 (Ultrawide)',
      aspectRatio: '21 / 9',
      objectFit: 'fill'
    },
    'fill': {
      id: 'fill',
      label: 'Fill Screen',
      aspectRatio: 'auto',
      objectFit: 'fill'
    },
    'fit': {
      id: 'fit',
      label: 'Fit to Window',
      aspectRatio: 'auto',
      objectFit: 'contain'
    }
  };

  const ASPECT_ORDER = ['auto', '16:9', '4:3', '21:9', 'fill', 'fit'];

  const FILTER_DEFAULTS = {
    brightness: 0,   // -100% to +100%
    contrast: 0,     // -100% to +100%
    saturation: 100, // 0% to 200%
    hue: 0,          // 0 to 360 deg
    sharpen: false   // toggle
  };

  const COLOR_PRESETS = {
    'Default': { brightness: 0, contrast: 0, saturation: 100, hue: 0, sharpen: false },
    'Vivid': { brightness: 5, contrast: 15, saturation: 135, hue: 0, sharpen: true },
    'Cinema': { brightness: -4, contrast: 12, saturation: 110, hue: 4, sharpen: false },
    'Night Mode': { brightness: -18, contrast: -10, saturation: 85, hue: 0, sharpen: false },
    'B&W': { brightness: 0, contrast: 10, saturation: 0, hue: 0, sharpen: false },
    'High Contrast': { brightness: 2, contrast: 30, saturation: 115, hue: 0, sharpen: true }
  };

  // ============================================================================
  // PotPlayer-Style Minimalist OSD Component
  // ============================================================================

  class VeloxOSD {
    constructor(parentContainer) {
      this.parent = parentContainer || (typeof document !== 'undefined' ? document.body : null);
      this.container = null;
      this.banner = null;
      this.tagEl = null;
      this.textEl = null;
      this.highlightEl = null;
      this.hideTimer = null;
      this.isDestroyed = false;

      if (typeof document !== 'undefined') {
        this.injectStyles();
        this.buildDOM();
      }
    }

    injectStyles() {
      if (document.getElementById('velox-osd-styles')) return;

      const style = document.createElement('style');
      style.id = 'velox-osd-styles';
      style.textContent = `
        .velox-osd-container {
          position: absolute;
          top: 18px;
          left: 18px;
          z-index: 99999;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 480px;
        }
        .velox-osd-banner {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(10, 12, 16, 0.88);
          border: 1px solid rgba(56, 189, 248, 0.35);
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.75), 0 0 12px rgba(56, 189, 248, 0.2);
          backdrop-filter: blur(10px);
          color: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Consolas", monospace;
          font-size: 13px;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 4px;
          letter-spacing: 0.35px;
          transition: opacity 0.16s cubic-bezier(0.16, 1, 0.3, 1), transform 0.16s cubic-bezier(0.16, 1, 0.3, 1);
          opacity: 0;
          transform: translateY(-6px);
        }
        .velox-osd-banner.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .velox-osd-banner .osd-tag {
          color: #38bdf8;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.8px;
          border-right: 1px solid rgba(56, 189, 248, 0.3);
          padding-right: 8px;
        }
        .velox-osd-banner .osd-text {
          color: #e2e8f0;
          white-space: nowrap;
        }
        .velox-osd-banner .osd-highlight {
          color: #60a5fa;
          font-family: monospace;
          margin-left: 4px;
          font-weight: 700;
        }
      `;
      document.head.appendChild(style);
    }

    buildDOM() {
      if (!this.parent) return;

      this.container = document.createElement('div');
      this.container.className = 'velox-osd-container';

      this.banner = document.createElement('div');
      this.banner.className = 'velox-osd-banner';

      this.tagEl = document.createElement('span');
      this.tagEl.className = 'osd-tag';
      this.tagEl.textContent = 'VELOX';

      this.textEl = document.createElement('span');
      this.textEl.className = 'osd-text';

      this.highlightEl = document.createElement('span');
      this.highlightEl.className = 'osd-highlight';

      this.banner.appendChild(this.tagEl);
      this.banner.appendChild(this.textEl);
      this.banner.appendChild(this.highlightEl);
      this.container.appendChild(this.banner);

      this.parent.appendChild(this.container);
    }

    setParent(newParent) {
      if (!newParent || this.parent === newParent) return;
      this.parent = newParent;
      if (this.container && this.container.parentElement) {
        this.container.parentElement.removeChild(this.container);
      }
      this.parent.appendChild(this.container);
    }

    /**
     * Show a PotPlayer-style OSD message
     * @param {string} message E.g. "Volume: 85%", "Speed: 1.25x", "Aspect: 16:9", "Seek: +5s [00:14:20]"
     * @param {number} [duration=1800] Display duration in ms
     * @param {string} [customTag] Optional tag replacement for 'VELOX'
     */
    show(message, duration = 1800, customTag = null) {
      if (!this.banner) return;

      clearTimeout(this.hideTimer);

      let tag = customTag || 'VELOX';
      let bodyText = message;
      let highlight = '';

      // Intelligent parser for PotPlayer formatted strings: "Category: Value [Timecode]"
      const colonIdx = message.indexOf(':');
      if (colonIdx > 0 && colonIdx < 16) {
        tag = message.slice(0, colonIdx).trim().toUpperCase();
        bodyText = message.slice(colonIdx + 1).trim();
      }

      // Check for timestamp or bracketed highlight e.g. [00:14:20]
      const bracketMatch = bodyText.match(/(\[[^\]]+\]|\([^\)]+\))$/);
      if (bracketMatch) {
        highlight = bracketMatch[0];
        bodyText = bodyText.slice(0, bracketMatch.index).trim();
      }

      this.tagEl.textContent = tag;
      this.textEl.textContent = bodyText;
      this.highlightEl.textContent = highlight;
      this.highlightEl.style.display = highlight ? 'inline' : 'none';

      // Animate banner in
      this.banner.classList.add('visible');

      this.hideTimer = setTimeout(() => {
        this.hide();
      }, duration);
    }

    hide() {
      if (this.banner) {
        this.banner.classList.remove('visible');
      }
      clearTimeout(this.hideTimer);
    }

    destroy() {
      this.hide();
      if (this.container && this.container.parentElement) {
        this.container.parentElement.removeChild(this.container);
      }
      this.isDestroyed = true;
    }
  }

  // ============================================================================
  // WebGL 2D Video Post-Processing Pipeline
  // ============================================================================

  class VeloxWebGLRenderer {
    constructor() {
      this.canvas = null;
      this.gl = null;
      this.program = null;
      this.video = null;
      this.texture = null;
      this.animationId = null;
      this.isRunning = false;

      // Uniform locations
      this.uniforms = {};
      this.attribs = {};

      // Filter settings reference
      this.filterState = { ...FILTER_DEFAULTS };
    }

    init(canvas, video) {
      this.canvas = canvas;
      this.video = video;

      const gl = canvas.getContext('webgl', { preserveDrawingBuffer: false, alpha: false }) ||
                 canvas.getContext('experimental-webgl');
      if (!gl) {
        console.warn('[VeloxVideoFX] WebGL not supported, falling back to CSS filters.');
        return false;
      }
      this.gl = gl;

      const vsSource = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = vec2(a_texCoord.x, 1.0 - a_texCoord.y); // Flip Y for video texture
        }
      `;

      const fsSource = `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_image;
        uniform vec2 u_textureSize;
        uniform float u_brightness;
        uniform float u_contrast;
        uniform float u_saturation;
        uniform float u_hue;
        uniform int u_sharpen;

        vec3 rgb2hsv(vec3 c) {
          vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
          vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
          float d = q.x - min(q.w, q.y);
          float e = 1.0e-10;
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }

        vec3 hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
          vec4 color;
          if (u_sharpen == 1 && u_textureSize.x > 0.0 && u_textureSize.y > 0.0) {
            vec2 px = vec2(1.0) / u_textureSize;
            vec4 up    = texture2D(u_image, v_texCoord + vec2(0.0, -px.y));
            vec4 down  = texture2D(u_image, v_texCoord + vec2(0.0, px.y));
            vec4 left  = texture2D(u_image, v_texCoord + vec2(-px.x, 0.0));
            vec4 right = texture2D(u_image, v_texCoord + vec2(px.x, 0.0));
            vec4 center = texture2D(u_image, v_texCoord);
            color = center * 5.0 - (up + down + left + right);
            color = clamp(color, 0.0, 1.0);
          } else {
            color = texture2D(u_image, v_texCoord);
          }

          vec3 rgb = color.rgb;

          // Brightness adjustment (-1.0 to 1.0)
          rgb += u_brightness;

          // Contrast adjustment (-1.0 to 1.0)
          rgb = (rgb - 0.5) * (1.0 + u_contrast) + 0.5;

          // Saturation adjustment (0.0 to 2.0)
          float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
          rgb = mix(vec3(luma), rgb, u_saturation);

          // Hue shift in degrees
          if (abs(u_hue) > 0.1) {
            vec3 hsv = rgb2hsv(rgb);
            hsv.x = fract(hsv.x + u_hue / 360.0);
            rgb = hsv2rgb(hsv);
          }

          gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
        }
      `;

      this.program = this.createProgram(gl, vsSource, fsSource);
      if (!this.program) return false;

      // Setup Geometry: Fullscreen Quad
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]), gl.STATIC_DRAW);

      const texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        0, 1,
        1, 0,
        1, 1,
      ]), gl.STATIC_DRAW);

      this.attribs.position = gl.getAttribLocation(this.program, 'a_position');
      this.attribs.texCoord = gl.getAttribLocation(this.program, 'a_texCoord');

      gl.enableVertexAttribArray(this.attribs.position);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(this.attribs.position, 2, gl.FLOAT, false, 0, 0);

      gl.enableVertexAttribArray(this.attribs.texCoord);
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.vertexAttribPointer(this.attribs.texCoord, 2, gl.FLOAT, false, 0, 0);

      // Cache Uniforms
      this.uniforms.image = gl.getUniformLocation(this.program, 'u_image');
      this.uniforms.textureSize = gl.getUniformLocation(this.program, 'u_textureSize');
      this.uniforms.brightness = gl.getUniformLocation(this.program, 'u_brightness');
      this.uniforms.contrast = gl.getUniformLocation(this.program, 'u_contrast');
      this.uniforms.saturation = gl.getUniformLocation(this.program, 'u_saturation');
      this.uniforms.hue = gl.getUniformLocation(this.program, 'u_hue');
      this.uniforms.sharpen = gl.getUniformLocation(this.program, 'u_sharpen');

      // Texture
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      return true;
    }

    createShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[VeloxWebGL] Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    createProgram(gl, vsSource, fsSource) {
      const vs = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
      const fs = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
      if (!vs || !fs) return null;

      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('[VeloxWebGL] Program link error:', gl.getProgramInfoLog(program));
        return null;
      }
      return program;
    }

    updateFilters(filters) {
      this.filterState = { ...filters };
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;

      const render = () => {
        if (!this.isRunning) return;
        this.renderFrame();
        this.animationId = _raf(render);
      };
      this.animationId = _raf(render);
    }

    stop() {
      this.isRunning = false;
      if (this.animationId) {
        _caf(this.animationId);
        this.animationId = null;
      }
    }

    renderFrame() {
      const { gl, video, canvas, program } = this;
      if (!gl || !video || !canvas || video.readyState < 2) return;

      // Sync canvas dimensions
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 1920;
        canvas.height = video.videoHeight || 1080;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }

      gl.useProgram(program);

      // Upload current video frame to texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.uniform1i(this.uniforms.image, 0);

      // Uniform values
      gl.uniform2f(this.uniforms.textureSize, canvas.width, canvas.height);
      gl.uniform1f(this.uniforms.brightness, this.filterState.brightness / 100.0);
      gl.uniform1f(this.uniforms.contrast, this.filterState.contrast / 100.0);
      gl.uniform1f(this.uniforms.saturation, this.filterState.saturation / 100.0);
      gl.uniform1f(this.uniforms.hue, this.filterState.hue);
      gl.uniform1i(this.uniforms.sharpen, this.filterState.sharpen ? 1 : 0);

      // Draw Quad
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    destroy() {
      this.stop();
      if (this.gl && this.program) {
        this.gl.deleteProgram(this.program);
      }
    }
  }

  // ============================================================================
  // VideoFX Manager Main Class
  // ============================================================================

  class VeloxVideoFX {
    constructor(videoElement, containerElement) {
      this.video = null;
      this.container = null;
      this.osd = null;
      this.webglRenderer = null;
      this.webglCanvas = null;

      // State: Render Mode ('css' or 'webgl')
      this.renderMode = 'css';

      // State: Filters
      this.filters = { ...FILTER_DEFAULTS };

      // State: Aspect Ratio
      this.currentAspect = 'auto';

      // State: A-B Repeat Loop
      this.abRepeat = {
        pointA: null,
        pointB: null,
        active: false
      };
      this.abMonitorRafId = null;

      // State: Frame Stepping
      this.fps = 30; // Standard baseline fps (can be adjusted to 24, 25, 60, etc.)

      // Bound Event Handlers for Cleanup
      this._onTimeUpdate = this._handleTimeUpdate.bind(this);
      this._onLoadedMetadata = this._handleLoadedMetadata.bind(this);
      this._onPlay = this._handlePlay.bind(this);
      this._onPause = this._handlePause.bind(this);
      this._onRateChange = this._handleRateChange.bind(this);
      this._onVolumeChange = this._handleVolumeChange.bind(this);
      this._onKeydown = this._handleKeydown.bind(this);

      // Initialize DOM and bindings if in browser
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        this.injectSVGSharpenFilter();
        this.attach(videoElement, containerElement);
        this.bindGlobalShortcuts();

        // Register global OSD shortcut
        window.showVeloxOSD = (msg, duration, tag) => {
          if (this.osd) this.osd.show(msg, duration, tag);
        };
      }
    }

    // ==========================================================================
    // DOM & Element Attachment
    // ==========================================================================

    attach(videoElement, containerElement) {
      // Detach previous video if bound
      this.detach();

      // Resolve elements
      if (typeof videoElement === 'string') {
        this.video = document.querySelector(videoElement);
      } else {
        this.video = videoElement || document.getElementById('video-element');
      }

      if (typeof containerElement === 'string') {
        this.container = document.querySelector(containerElement);
      } else {
        this.container = containerElement || 
                         (this.video ? this.video.parentElement : null) || 
                         document.getElementById('media-stage') || 
                         document.getElementById('viewport') || 
                         document.body;
      }

      // Initialize or Reparent OSD
      if (!this.osd && this.container) {
        this.osd = new VeloxOSD(this.container);
      } else if (this.osd && this.container) {
        this.osd.setParent(this.container);
      }

      // Bind Video Element Listeners
      if (this.video) {
        this.video.addEventListener('timeupdate', this._onTimeUpdate);
        this.video.addEventListener('loadedmetadata', this._onLoadedMetadata);
        this.video.addEventListener('play', this._onPlay);
        this.video.addEventListener('pause', this._onPause);
        this.video.addEventListener('ratechange', this._onRateChange);
        this.video.addEventListener('volumechange', this._onVolumeChange);

        // Apply initial filter & aspect settings
        this.applyFilters();
        this.applyAspectRatio(this.currentAspect);
      }
    }

    detach() {
      if (this.video) {
        this.video.removeEventListener('timeupdate', this._onTimeUpdate);
        this.video.removeEventListener('loadedmetadata', this._onLoadedMetadata);
        this.video.removeEventListener('play', this._onPlay);
        this.video.removeEventListener('pause', this._onPause);
        this.video.removeEventListener('ratechange', this._onRateChange);
        this.video.removeEventListener('volumechange', this._onVolumeChange);
        this.video = null;
      }
      this.stopABMonitor();
      if (this.webglRenderer) {
        this.webglRenderer.stop();
      }
    }

    // ==========================================================================
    // Hardware-Accelerated Video Filters (CSS & WebGL)
    // ==========================================================================

    injectSVGSharpenFilter() {
      if (document.getElementById('velox-fx-svg-defs')) return;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'velox-fx-svg-defs';
      svg.setAttribute('style', 'position: absolute; width: 0; height: 0; pointer-events: none; overflow: hidden;');
      svg.setAttribute('aria-hidden', 'true');

      svg.innerHTML = `
        <defs>
          <filter id="velox-sharpen-filter" color-interpolation-filters="sRGB">
            <feConvolveMatrix order="3 3" preserveAlpha="true" kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" />
          </filter>
        </defs>
      `;
      document.body.appendChild(svg);
    }

    /**
     * Set render engine mode: 'css' (Zero-copy GPU compositor) or 'webgl' (Canvas shader)
     * @param {'css'|'webgl'} mode 
     */
    setRenderMode(mode) {
      if (mode !== 'css' && mode !== 'webgl') return;
      this.renderMode = mode;

      if (mode === 'webgl') {
        this.enableWebGLMode();
      } else {
        this.disableWebGLMode();
        this.applyFilters();
      }
      this.showOSD(`Engine: ${mode.toUpperCase()} Accelerated`);
    }

    enableWebGLMode() {
      if (!this.video || !this.container) return;

      if (!this.webglCanvas) {
        this.webglCanvas = document.createElement('canvas');
        this.webglCanvas.id = 'velox-webgl-canvas';
        this.webglCanvas.className = 'media-element';
        this.webglCanvas.style.cssText = `
          max-width: 100%;
          max-height: 100%;
          outline: none;
          display: block;
        `;
        this.container.insertBefore(this.webglCanvas, this.video);
      }

      if (!this.webglRenderer) {
        this.webglRenderer = new VeloxWebGLRenderer();
        const ok = this.webglRenderer.init(this.webglCanvas, this.video);
        if (!ok) {
          this.webglCanvas.remove();
          this.webglCanvas = null;
          this.renderMode = 'css';
          return;
        }
      }

      // Hide raw video, show canvas
      this.video.style.display = 'none';
      this.webglCanvas.style.display = 'block';
      this.webglRenderer.updateFilters(this.filters);
      this.webglRenderer.start();
    }

    disableWebGLMode() {
      if (this.webglRenderer) {
        this.webglRenderer.stop();
      }
      if (this.webglCanvas) {
        this.webglCanvas.style.display = 'none';
      }
      if (this.video) {
        this.video.style.display = 'block';
      }
    }

    /**
     * Apply filter changes to the active video element or WebGL shader
     */
    applyFilters() {
      if (this.renderMode === 'webgl' && this.webglRenderer) {
        this.webglRenderer.updateFilters(this.filters);
        return;
      }

      if (!this.video) return;

      const { brightness, contrast, saturation, hue, sharpen } = this.filters;

      // Formula mapping:
      // brightness: -100% to +100% -> CSS brightness(0.0 to 2.0)
      const b = Math.max(0, 1 + brightness / 100);
      // contrast: -100% to +100% -> CSS contrast(0.0 to 2.0)
      const c = Math.max(0, 1 + contrast / 100);
      // saturation: 0% to 200% -> CSS saturate(0.0 to 2.0)
      const s = Math.max(0, saturation / 100);
      // hue: 0 to 360deg
      const h = ((hue % 360) + 360) % 360;

      let filterStr = `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)}) saturate(${s.toFixed(3)}) hue-rotate(${h.toFixed(1)}deg)`;

      if (sharpen) {
        filterStr += ' url(#velox-sharpen-filter)';
      }

      this.video.style.filter = filterStr;
      // Hardware acceleration triggers for GPU compositor
      this.video.style.willChange = 'filter';
      this.video.style.transform = 'translateZ(0)';
      this.video.style.backfaceVisibility = 'hidden';

      this.notifyFilterChange();
    }

    // --- Filter Controls ---

    setBrightness(val) {
      this.filters.brightness = Math.max(-100, Math.min(100, Math.round(val)));
      this.applyFilters();
      const sign = this.filters.brightness > 0 ? '+' : '';
      this.showOSD(`Brightness: ${sign}${this.filters.brightness}%`);
    }

    adjustBrightness(delta) {
      this.setBrightness(this.filters.brightness + delta);
    }

    setContrast(val) {
      this.filters.contrast = Math.max(-100, Math.min(100, Math.round(val)));
      this.applyFilters();
      const sign = this.filters.contrast > 0 ? '+' : '';
      this.showOSD(`Contrast: ${sign}${this.filters.contrast}%`);
    }

    adjustContrast(delta) {
      this.setContrast(this.filters.contrast + delta);
    }

    setSaturation(val) {
      this.filters.saturation = Math.max(0, Math.min(200, Math.round(val)));
      this.applyFilters();
      this.showOSD(`Saturation: ${this.filters.saturation}%`);
    }

    adjustSaturation(delta) {
      this.setSaturation(this.filters.saturation + delta);
    }

    setHue(val) {
      this.filters.hue = ((Math.round(val) % 360) + 360) % 360;
      this.applyFilters();
      this.showOSD(`Hue: ${this.filters.hue}°`);
    }

    adjustHue(delta) {
      this.setHue(this.filters.hue + delta);
    }

    toggleSharpen(forceState) {
      this.filters.sharpen = typeof forceState === 'boolean' ? forceState : !this.filters.sharpen;
      this.applyFilters();
      this.showOSD(`Sharpen: ${this.filters.sharpen ? 'ON' : 'OFF'}`);
    }

    resetFilters() {
      this.filters = { ...FILTER_DEFAULTS };
      if (this.video) {
        this.video.style.filter = 'none';
      }
      this.applyFilters();
      this.showOSD('Video Filters: Reset (Default)');
    }

    applyPreset(name) {
      if (!COLOR_PRESETS[name]) return;
      this.filters = { ...COLOR_PRESETS[name] };
      this.applyFilters();
      this.showOSD(`Preset: ${name}`);
    }

    getFilters() {
      return { ...this.filters };
    }

    // ==========================================================================
    // Aspect Ratio Switcher
    // ==========================================================================

    /**
     * Set video aspect ratio
     * @param {'auto'|'16:9'|'4:3'|'21:9'|'fill'|'fit'} ratioKey 
     */
    setAspectRatio(ratioKey) {
      const preset = ASPECT_RATIOS[ratioKey];
      if (!preset) {
        console.warn(`[VeloxVideoFX] Unknown aspect ratio: ${ratioKey}`);
        return;
      }

      this.currentAspect = ratioKey;
      this.applyAspectRatio(ratioKey);
      this.showOSD(`Aspect: ${preset.label}`);
      this.notifyAspectChange();
    }

    applyAspectRatio(ratioKey) {
      const target = this.webglCanvas && this.renderMode === 'webgl' ? this.webglCanvas : this.video;
      if (!target) return;

      const preset = ASPECT_RATIOS[ratioKey] || ASPECT_RATIOS['auto'];

      target.style.aspectRatio = preset.aspectRatio;
      target.style.objectFit = preset.objectFit;

      if (ratioKey === 'fill') {
        target.style.width = '100%';
        target.style.height = '100%';
        target.style.maxWidth = '100%';
        target.style.maxHeight = '100%';
      } else if (ratioKey === 'fit') {
        target.style.width = '100%';
        target.style.height = '100%';
        target.style.maxWidth = '100%';
        target.style.maxHeight = '100%';
      } else if (ratioKey === 'auto') {
        target.style.width = 'auto';
        target.style.height = 'auto';
        target.style.maxWidth = '100%';
        target.style.maxHeight = '100%';
      } else {
        // Enforce calculated aspect ratio bounding box
        target.style.width = '100%';
        target.style.height = '100%';
        target.style.maxWidth = '100%';
        target.style.maxHeight = '100%';
      }
    }

    cycleAspectRatio() {
      const currentIdx = ASPECT_ORDER.indexOf(this.currentAspect);
      const nextIdx = (currentIdx + 1) % ASPECT_ORDER.length;
      this.setAspectRatio(ASPECT_ORDER[nextIdx]);
    }

    getAspectRatio() {
      return {
        id: this.currentAspect,
        ...ASPECT_RATIOS[this.currentAspect]
      };
    }

    // ==========================================================================
    // A-B Repeat Segment Loop
    // ==========================================================================

    /**
     * Mark Point A for repeat segment
     * @param {number} [time] Optional timestamp in seconds, defaults to current time
     */
    setPointA(time) {
      if (!this.video && typeof time !== 'number') return;
      const targetTime = typeof time === 'number' ? time : this.video.currentTime;

      this.abRepeat.pointA = Math.max(0, targetTime);

      // If B was set before A, clear B
      if (this.abRepeat.pointB !== null && this.abRepeat.pointB <= this.abRepeat.pointA) {
        this.abRepeat.pointB = null;
        this.abRepeat.active = false;
        this.stopABMonitor();
      }

      this.showOSD(`A-B Repeat: Point A [${this.formatTime(this.abRepeat.pointA)}]`);
      this.notifyABChange();
    }

    /**
     * Mark Point B and start seamless loop
     * @param {number} [time] Optional timestamp in seconds, defaults to current time
     */
    setPointB(time) {
      if (!this.video && typeof time !== 'number') return;
      let targetTime = typeof time === 'number' ? time : this.video.currentTime;

      if (this.abRepeat.pointA === null) {
        // If A was not set, set A to 0 or start point
        this.abRepeat.pointA = 0;
      }

      if (targetTime <= this.abRepeat.pointA) {
        // Swap or enforce minimum gap
        const temp = this.abRepeat.pointA;
        this.abRepeat.pointA = targetTime;
        targetTime = temp + 0.5;
      }

      this.abRepeat.pointB = targetTime;
      this.abRepeat.active = true;

      this.showOSD(`A-B Repeat: [${this.formatTime(this.abRepeat.pointA)} ➔ ${this.formatTime(this.abRepeat.pointB)}]`);
      this.notifyABChange();
      this.startABMonitor();
    }

    clearABRepeat() {
      this.abRepeat.pointA = null;
      this.abRepeat.pointB = null;
      this.abRepeat.active = false;
      this.stopABMonitor();

      this.showOSD('A-B Repeat: Disabled');
      this.notifyABChange();
    }

    toggleAB() {
      if (this.abRepeat.pointA === null) {
        this.setPointA();
      } else if (this.abRepeat.pointB === null) {
        this.setPointB();
      } else {
        this.clearABRepeat();
      }
    }

    getABRepeatState() {
      return { ...this.abRepeat };
    }

    startABMonitor() {
      this.stopABMonitor();
      if (!this.abRepeat.active) return;

      const monitor = () => {
        if (!this.abRepeat.active || !this.video) return;

        const { pointA, pointB } = this.abRepeat;
        if (pointA !== null && pointB !== null) {
          // Check ahead by 15ms to loop seamlessly without audio jitter or overshoot
          if (this.video.currentTime >= (pointB - 0.015)) {
            this.video.currentTime = pointA;
          }
        }
        this.abMonitorRafId = _raf(monitor);
      };

      this.abMonitorRafId = _raf(monitor);
    }

    stopABMonitor() {
      if (this.abMonitorRafId) {
        _caf(this.abMonitorRafId);
        this.abMonitorRafId = null;
      }
    }

    // ==========================================================================
    // Frame Stepping
    // ==========================================================================

    /**
     * Configure base FPS for frame stepping calculations
     * @param {number} fps 
     */
    setFPS(fps) {
      if (fps > 0 && fps <= 240) {
        this.fps = fps;
      }
    }

    /**
     * Step forward by frame count
     * @param {number} [frames=1] 
     */
    stepForward(frames = 1) {
      if (!this.video) return;

      if (!this.video.paused) {
        this.video.pause();
      }

      const frameDuration = 1.0 / this.fps;
      const targetTime = Math.min(this.video.duration || Infinity, this.video.currentTime + (frames * frameDuration));
      this.video.currentTime = targetTime;

      this.showOSD(`Frame: +${frames} [${this.formatTimeWithMs(targetTime)}]`);
    }

    /**
     * Step backward by frame count
     * @param {number} [frames=1] 
     */
    stepBackward(frames = 1) {
      if (!this.video) return;

      if (!this.video.paused) {
        this.video.pause();
      }

      const frameDuration = 1.0 / this.fps;
      const targetTime = Math.max(0, this.video.currentTime - (frames * frameDuration));
      this.video.currentTime = targetTime;

      this.showOSD(`Frame: -${frames} [${this.formatTimeWithMs(targetTime)}]`);
    }

    // ==========================================================================
    // OSD Banner Proxy
    // ==========================================================================

    showOSD(text, duration = 1800, tag = null) {
      if (this.osd) {
        this.osd.show(text, duration, tag);
      }
    }

    hideOSD() {
      if (this.osd) {
        this.osd.hide();
      }
    }

    // ==========================================================================
    // Internal Event Handlers & Watchers
    // ==========================================================================

    _handleTimeUpdate() {
      if (!this.video || !this.abRepeat.active) return;

      const { pointA, pointB } = this.abRepeat;
      if (pointA !== null && pointB !== null) {
        if (this.video.currentTime >= pointB || this.video.currentTime < (pointA - 0.5)) {
          this.video.currentTime = pointA;
        }
      }
    }

    _handleLoadedMetadata() {
      if (!this.video) return;
      // Re-apply aspect ratio styling upon new file load
      this.applyAspectRatio(this.currentAspect);
    }

    _handlePlay() {
      if (this.abRepeat.active) {
        this.startABMonitor();
      }
    }

    _handlePause() {
      this.stopABMonitor();
    }

    _handleRateChange() {
      if (!this.video) return;
      this.showOSD(`Speed: ${this.video.playbackRate.toFixed(2)}x`);
    }

    _handleVolumeChange() {
      if (!this.video) return;
      if (this.video.muted) {
        this.showOSD('Volume: Muted');
      } else {
        const pct = Math.round(this.video.volume * 100);
        this.showOSD(`Volume: ${pct}%`);
      }
    }

    // ==========================================================================
    // Global Keyboard Shortcuts
    // ==========================================================================

    bindGlobalShortcuts() {
      window.addEventListener('keydown', this._onKeydown);
    }

    unbindGlobalShortcuts() {
      window.removeEventListener('keydown', this._onKeydown);
    }

    _handleKeydown(e) {
      // Ignore keystrokes inside text inputs
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        return;
      }

      // Frame Stepping
      if (e.key === '.' || e.code === 'Period') {
        e.preventDefault();
        this.stepForward(1);
      } else if (e.key === ',' || e.code === 'Comma') {
        e.preventDefault();
        this.stepBackward(1);
      }

      // A-B Repeat Segments
      else if (e.key === '[' || e.code === 'BracketLeft') {
        e.preventDefault();
        this.setPointA();
      } else if (e.key === ']' || e.code === 'BracketRight') {
        e.preventDefault();
        this.setPointB();
      } else if (e.key === '\\' || e.code === 'Backslash') {
        e.preventDefault();
        this.clearABRepeat();
      }

      // Aspect Ratio Cycling (Ctrl + A or Keypad / custom)
      else if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.cycleAspectRatio();
      }
    }

    // ==========================================================================
    // Event Notification Emitters
    // ==========================================================================

    notifyFilterChange() {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('velox:filter-change', {
          detail: { ...this.filters, renderMode: this.renderMode }
        }));
      }
    }

    notifyAspectChange() {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('velox:aspect-change', {
          detail: this.getAspectRatio()
        }));
      }
    }

    notifyABChange() {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('velox:ab-repeat-change', {
          detail: { ...this.abRepeat }
        }));
      }
    }

    // ==========================================================================
    // Utility Helpers
    // ==========================================================================

    formatTime(seconds) {
      if (!seconds || isNaN(seconds) || seconds < 0) return '00:00:00';
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);

      const pad = (n) => n.toString().padStart(2, '0');
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }

    formatTimeWithMs(seconds) {
      if (!seconds || isNaN(seconds) || seconds < 0) return '00:00:00.000';
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);

      const pad = (n, len = 2) => n.toString().padStart(len, '0');
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
    }

    /**
     * Serialize settings for session persistence
     */
    serialize() {
      return {
        filters: { ...this.filters },
        aspectRatio: this.currentAspect,
        renderMode: this.renderMode,
        fps: this.fps
      };
    }

    /**
     * Restore persisted settings
     */
    restore(data) {
      if (!data) return;
      if (data.filters) {
        this.filters = { ...FILTER_DEFAULTS, ...data.filters };
        this.applyFilters();
      }
      if (data.aspectRatio) {
        this.setAspectRatio(data.aspectRatio);
      }
      if (data.renderMode) {
        this.setRenderMode(data.renderMode);
      }
      if (data.fps) {
        this.setFPS(data.fps);
      }
    }

    destroy() {
      this.detach();
      this.unbindGlobalShortcuts();
      if (this.osd) {
        this.osd.destroy();
        this.osd = null;
      }
      if (this.webglRenderer) {
        this.webglRenderer.destroy();
        this.webglRenderer = null;
      }
      if (this.webglCanvas && this.webglCanvas.parentElement) {
        this.webglCanvas.parentElement.removeChild(this.webglCanvas);
        this.webglCanvas = null;
      }
    }
  }

  // Auto-instantiate singleton on DOMContentLoaded if video element exists
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const autoInit = () => {
      const videoEl = document.getElementById('video-element');
      const stageEl = document.getElementById('media-stage') || document.getElementById('viewport');
      if (videoEl && !window.veloxVideoFX) {
        window.veloxVideoFX = new VeloxVideoFX(videoEl, stageEl);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoInit);
    } else {
      autoInit();
    }
  }

  // Export classes & presets
  VeloxVideoFX.VeloxOSD = VeloxOSD;
  VeloxVideoFX.VeloxWebGLRenderer = VeloxWebGLRenderer;
  VeloxVideoFX.ASPECT_RATIOS = ASPECT_RATIOS;
  VeloxVideoFX.FILTER_DEFAULTS = FILTER_DEFAULTS;
  VeloxVideoFX.COLOR_PRESETS = COLOR_PRESETS;

  return VeloxVideoFX;
});
