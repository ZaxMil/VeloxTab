/**
 * VeloxTab — Subtitle Engine & Custom Overlay Renderer (subtitles.js)
 * 
 * Features:
 * - Robust WebVTT (.vtt) and SubRip (.srt) parser with formatting support:
 *   - Bold (<b>), Italic (<i>), Underline (<u>), Colors (<font color="...">, <c.color>).
 *   - Strips or normalizes ASS/SSA tags ({\an8}, etc.) found in SRT files.
 *   - High-tolerance parsing for malformed timestamps, BOM markers, non-standard line breaks.
 * - Real-time Subtitle Timing Offset Adjuster:
 *   - Advance or delay in 50ms increments (or arbitrary offset).
 *   - Instant real-time recalculation without re-parsing.
 * - Custom Subtitle Overlay Renderer:
 *   - High-DPI crisp typography with customizable font size, outline, shadow, position.
 *   - Anti-flicker diff rendering (only touches DOM when cue content changes).
 *   - Smooth multi-cue simultaneous rendering.
 *   - rAF + timeupdate sync engine.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VeloxSubtitles = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /**
   * Parse timestamp string to seconds
   * Supports:
   * - 00:01:23,456 (SRT standard)
   * - 00:01:23.456 (WebVTT standard)
   * - 01:23.456 (WebVTT short)
   * - 1:23,456
   * @param {string} str
   * @returns {number|null} Time in seconds
   */
  function parseTimestamp(str) {
    if (!str) return null;
    const clean = str.trim().replace(',', '.');
    // Match optional hours:minutes:seconds.millis
    const regex = /^(?:(?:(\d{1,2}):)?(\d{1,2}):)?(\d{1,2})(?:\.(\d+))?$/;
    const match = clean.match(regex);
    if (!match) return null;

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (match[1] !== undefined && match[2] !== undefined) {
      hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10);
      seconds = parseInt(match[3], 10);
    } else if (match[2] !== undefined) {
      minutes = parseInt(match[2], 10);
      seconds = parseInt(match[3], 10);
    } else {
      seconds = parseInt(match[3], 10);
    }

    let millis = 0;
    if (match[4]) {
      let mStr = match[4];
      if (mStr.length === 1) mStr += '00';
      else if (mStr.length === 2) mStr += '0';
      else if (mStr.length > 3) mStr = mStr.substring(0, 3);
      millis = parseInt(mStr, 10);
    }

    return (hours * 3600) + (minutes * 60) + seconds + (millis / 1000);
  }

  /**
   * Escape unsafe HTML characters
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Sanitize subtitle text and convert allowed tags to safe HTML
   * Allowed tags: <b>, <i>, <u>, <font color="...">, <c.color>, <ruby>
   * Strips ASS tags like {\an8}, {\pos(1,2)}
   * @param {string} rawText
   * @returns {string}
   */
  function formatSubtitleText(rawText) {
    if (!rawText) return '';

    // 1. Strip ASS / SSA style override tags e.g. {\an8}, {\b1}, {\c&H...&}
    let text = rawText.replace(/\{[^\}]+\}/g, '');

    // 2. Normalize WebVTT voice tags <v Speaker>Text</v> -> Text
    text = text.replace(/<v(?:\s+[^>]+)?>([\s\S]*?)<\/v>/gi, '$1');

    // 3. Process color tags: <c.yellow> -> <font color="yellow">
    const vttColors = ['white', 'lime', 'cyan', 'red', 'yellow', 'magenta', 'blue', 'black'];
    vttColors.forEach(col => {
      const regOpen = new RegExp(`<c\\.${col}>`, 'gi');
      text = text.replace(regOpen, `<font color="${col}">`);
    });
    text = text.replace(/<\/c>/gi, '</font>');

    // 4. Tokenize safe tags vs text to prevent arbitrary HTML injection
    // Whitelist: <b>, </b>, <i>, </i>, <u>, </u>, <font color="...">, </font>, <br>, <ruby>, </ruby>, <rt>, </rt>
    const tokens = [];
    const tagRegex = /<(\/?)(b|i|u|br|ruby|rt|font)(?:\s+color=["']?([#a-zA-Z0-9]+)["']?)?\s*\/?>/gi;
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(escapeHtml(text.substring(lastIndex, match.index)));
      }
      const isClosing = match[1] === '/';
      const tagName = match[2].toLowerCase();
      const colorVal = match[3];

      if (tagName === 'br') {
        tokens.push('<br>');
      } else if (tagName === 'font') {
        if (isClosing) {
          tokens.push('</span>');
        } else if (colorVal) {
          tokens.push(`<span style="color: ${escapeHtml(colorVal)};">`);
        } else {
          tokens.push('<span>');
        }
      } else {
        tokens.push(isClosing ? `</${tagName}>` : `<${tagName}>`);
      }
      lastIndex = tagRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      tokens.push(escapeHtml(text.substring(lastIndex)));
    }

    // Convert newlines to <br>
    return tokens.join('').replace(/\r?\n/g, '<br>');
  }

  /**
   * Parse SubRip (.srt) subtitle string into cues array
   * @param {string} content
   * @returns {Array<object>}
   */
  function parseSRT(content) {
    if (!content) return [];
    // Strip UTF-8 BOM
    let clean = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = clean.split(/\n\n+/);
    const cues = [];

    blocks.forEach((block, idx) => {
      const lines = block.trim().split('\n');
      if (lines.length < 2) return;

      let timeLineIdx = 0;
      // Look for the line containing '-->'
      while (timeLineIdx < lines.length && !lines[timeLineIdx].includes('-->')) {
        timeLineIdx++;
      }
      if (timeLineIdx >= lines.length) return;

      const timeLine = lines[timeLineIdx];
      const arrowParts = timeLine.split('-->');
      if (arrowParts.length !== 2) return;

      const start = parseTimestamp(arrowParts[0]);
      // Remove trailing positioning settings from end timestamp if present
      const endClean = arrowParts[1].trim().split(/\s+/)[0];
      const end = parseTimestamp(endClean);

      if (start === null || end === null || end <= start) return;

      const textLines = lines.slice(timeLineIdx + 1);
      const rawText = textLines.join('\n').trim();
      if (!rawText) return;

      cues.push({
        id: lines[0].trim() || `cue-${idx + 1}`,
        startTime: start,
        endTime: end,
        rawText,
        html: formatSubtitleText(rawText)
      });
    });

    return cues.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Parse WebVTT (.vtt) subtitle string into cues array
   * @param {string} content
   * @returns {Array<object>}
   */
  function parseWebVTT(content) {
    if (!content) return [];
    let clean = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove WebVTT comments / NOTE blocks
    clean = clean.replace(/^NOTE(?:\s+[\s\S]*?)?(?=\n\n|\n*$)/gm, '');

    // Remove STYLE blocks
    clean = clean.replace(/^STYLE[\s\S]*?(?=\n\n|\n*$)/gm, '');

    // Remove REGION blocks
    clean = clean.replace(/^REGION[\s\S]*?(?=\n\n|\n*$)/gm, '');

    const blocks = clean.split(/\n\n+/);
    const cues = [];

    blocks.forEach((block, idx) => {
      const trimmed = block.trim();
      if (!trimmed || trimmed.startsWith('WEBVTT')) return;

      const lines = trimmed.split('\n');
      let timeLineIdx = 0;
      let cueId = `vtt-${idx}`;

      // Check if first line is cue ID
      if (!lines[0].includes('-->') && lines.length > 1 && lines[1].includes('-->')) {
        cueId = lines[0].trim();
        timeLineIdx = 1;
      } else if (!lines[0].includes('-->')) {
        // Skip metadata/header lines without arrow
        while (timeLineIdx < lines.length && !lines[timeLineIdx].includes('-->')) {
          timeLineIdx++;
        }
        if (timeLineIdx >= lines.length) return;
      }

      const timeLine = lines[timeLineIdx];
      const arrowParts = timeLine.split('-->');
      if (arrowParts.length !== 2) return;

      const start = parseTimestamp(arrowParts[0]);
      const endSettingParts = arrowParts[1].trim().split(/\s+/);
      const end = parseTimestamp(endSettingParts[0]);

      if (start === null || end === null || end <= start) return;

      // Extract settings e.g. line:90% position:50% align:middle
      const settings = {};
      endSettingParts.slice(1).forEach(s => {
        const [k, v] = s.split(':');
        if (k && v) settings[k] = v;
      });

      const textLines = lines.slice(timeLineIdx + 1);
      const rawText = textLines.join('\n').trim();
      if (!rawText) return;

      cues.push({
        id: cueId,
        startTime: start,
        endTime: end,
        settings,
        rawText,
        html: formatSubtitleText(rawText)
      });
    });

    return cues.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Auto-detect and parse subtitle string (.srt or .vtt)
   * @param {string} content
   * @param {string} [hint] 'srt' | 'vtt' | 'auto'
   * @returns {Array<object>}
   */
  function parseSubtitles(content, hint = 'auto') {
    if (!content || typeof content !== 'string') return [];
    const trimmed = content.trim();

    if (hint === 'vtt' || trimmed.startsWith('WEBVTT') || trimmed.includes('-->') && !trimmed.match(/^\d+\s*\n/)) {
      if (trimmed.startsWith('WEBVTT')) {
        return parseWebVTT(content);
      }
    }
    if (hint === 'srt') {
      return parseSRT(content);
    }
    // Auto detection
    if (trimmed.startsWith('WEBVTT')) {
      return parseWebVTT(content);
    }
    return parseSRT(content);
  }

  // ==========================================================================
  // Custom Subtitle Overlay Renderer
  // ==========================================================================

  const DEFAULT_STYLES = {
    fontSize: '26px',
    fontFamily: '"Segoe UI", "PingFang SC", "Noto Sans", Roboto, Helvetica, Arial, sans-serif',
    fontWeight: '600',
    color: '#FFFFFF',
    textStroke: '1.5px #000000',
    textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.85)',
    backgroundColor: 'transparent', // or 'rgba(0,0,0,0.5)'
    borderRadius: '4px',
    padding: '2px 8px',
    position: 'bottom', // 'bottom', 'top', 'center'
    bottomOffset: '42px',
    topOffset: '24px',
    lineHeight: '1.35',
    letterSpacing: '0.4px',
    textAlign: 'center',
    maxWidth: '85%'
  };

  class VeloxSubtitles {
    constructor(options = {}) {
      this.cues = [];
      this.offsetMs = 0; // In milliseconds (+: delay, -: advance)
      this.visible = true;

      // Overlay rendering elements
      this.overlayContainer = null;
      this.cuesContainer = null;
      this.videoElement = null;
      this.parentContainer = null;

      // Style options
      this.styles = { ...DEFAULT_STYLES, ...(options.styles || {}) };

      // Current active cue state (for anti-flicker diff rendering)
      this._lastRenderedHtml = '';
      this._rafId = null;
      this._boundUpdate = this._onTimeUpdate.bind(this);
      this._boundRafLoop = this._rafLoop.bind(this);

      // Event listeners
      this._listeners = new Map();

      // Track metadata
      this.trackInfo = {
        label: 'Default',
        language: 'en',
        format: 'auto'
      };
    }

    // ========================================================================
    // Track Loading & Parsing
    // ========================================================================

    /**
     * Load subtitle track from text (SRT or WebVTT)
     * @param {string} content
     * @param {object} [metadata] { format, label, language }
     * @returns {number} Loaded cues count
     */
    loadText(content, metadata = {}) {
      this.trackInfo = { ...this.trackInfo, ...metadata };
      this.cues = parseSubtitles(content, this.trackInfo.format || 'auto');
      this.render();
      this._emit('loaded', { count: this.cues.length, track: this.trackInfo });
      return this.cues.length;
    }

    /**
     * Load subtitle file from URL or path
     * @param {string} url
     * @param {object} [metadata]
     * @returns {Promise<number>}
     */
    async loadUrl(url, metadata = {}) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const text = await response.text();
        const format = url.endsWith('.vtt') ? 'vtt' : url.endsWith('.srt') ? 'srt' : 'auto';
        return this.loadText(text, { format, ...metadata });
      } catch (err) {
        console.error('[VeloxSubtitles] Failed to load subtitle from URL:', err);
        this._emit('error', err);
        throw err;
      }
    }

    /**
     * Clear all cues and remove displayed subtitles
     */
    clear() {
      this.cues = [];
      this.trackInfo = { label: '', language: '', format: 'auto' };
      this._lastRenderedHtml = '';
      if (this.cuesContainer) {
        this.cuesContainer.innerHTML = '';
      }
      this._emit('cleared');
    }

    /**
     * Returns whether any subtitles are loaded
     * @returns {boolean}
     */
    hasSubtitles() {
      return this.cues.length > 0;
    }

    // ========================================================================
    // Real-time Timing Offset Adjuster
    // ========================================================================

    /**
     * Set subtitle timing offset in milliseconds
     * Positive = Delay (subtitles show later)
     * Negative = Advance (subtitles show earlier)
     * @param {number} ms Offset in milliseconds
     */
    setOffset(ms) {
      this.offsetMs = Math.round(Number(ms) || 0);
      this.render();
      this._emit('offsetChange', { offsetMs: this.offsetMs, offsetSec: (this.offsetMs / 1000).toFixed(2) });
    }

    /**
     * Adjust timing offset by a delta in milliseconds (e.g. +50ms, -50ms)
     * @param {number} [deltaMs=50]
     */
    adjustOffset(deltaMs = 50) {
      this.setOffset(this.offsetMs + deltaMs);
    }

    /**
     * Advance subtitles earlier by delta (default: 50ms)
     * @param {number} [ms=50]
     */
    advance(ms = 50) {
      this.adjustOffset(-Math.abs(ms));
    }

    /**
     * Delay subtitles later by delta (default: 50ms)
     * @param {number} [ms=50]
     */
    delay(ms = 50) {
      this.adjustOffset(Math.abs(ms));
    }

    /**
     * Reset subtitle timing offset to 0ms
     */
    resetOffset() {
      this.setOffset(0);
    }

    /**
     * Get current timing offset in milliseconds
     * @returns {number}
     */
    getOffset() {
      return this.offsetMs;
    }

    // ========================================================================
    // Active Cue Lookup & Query
    // ========================================================================

    /**
     * Query currently active cues at a specific media time
     * Applies offsetMs in real-time
     * @param {number} mediaTimeInSeconds
     * @returns {Array<object>}
     */
    getActiveCues(mediaTimeInSeconds) {
      if (!this.cues.length || typeof mediaTimeInSeconds !== 'number') return [];

      // Effective subtitle time accounting for offset:
      // When offset is +1000ms (delay), video at 11s displays subtitle from 10s
      const effectiveTime = mediaTimeInSeconds - (this.offsetMs / 1000);

      // Fast filter for active cues (sorted cues)
      const active = [];
      for (let i = 0; i < this.cues.length; i++) {
        const cue = this.cues[i];
        if (cue.startTime <= effectiveTime && cue.endTime >= effectiveTime) {
          active.push(cue);
        } else if (cue.startTime > effectiveTime) {
          // If past current effective time and cues are ordered, stop early
          // (allowing small tolerance for out-of-order cues)
          if (cue.startTime > effectiveTime + 5.0) break;
        }
      }
      return active;
    }

    // ========================================================================
    // DOM Overlay Lifecycle & Custom Styling
    // ========================================================================

    /**
     * Attach subtitle overlay to a video element and container
     * @param {HTMLVideoElement} videoElement
     * @param {HTMLElement} [parentContainer]
     */
    attach(videoElement, parentContainer = null) {
      if (!videoElement) return this;
      this.detach();

      this.videoElement = videoElement;
      this.parentContainer = parentContainer || videoElement.parentElement || document.body;

      // Ensure parent container has relative/absolute positioning
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        const pos = window.getComputedStyle(this.parentContainer).position;
        if (!pos || pos === 'static') {
          this.parentContainer.style.position = 'relative';
        }
      }

      this._createOverlayDOM();

      // Bind media events
      videoElement.addEventListener('timeupdate', this._boundUpdate);
      videoElement.addEventListener('seeked', this._boundUpdate);
      videoElement.addEventListener('play', this._boundRafLoop);

      // If video is already playing, start rAF loop
      if (!videoElement.paused) {
        this._rafLoop();
      }

      this.render();
      this._emit('attached', { video: videoElement });
      return this;
    }

    /**
     * Detach subtitle overlay from video element
     */
    detach() {
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }

      if (this.videoElement) {
        this.videoElement.removeEventListener('timeupdate', this._boundUpdate);
        this.videoElement.removeEventListener('seeked', this._boundUpdate);
        this.videoElement.removeEventListener('play', this._boundRafLoop);
        this.videoElement = null;
      }

      if (this.overlayContainer && this.overlayContainer.parentElement) {
        this.overlayContainer.parentElement.removeChild(this.overlayContainer);
      }

      this.overlayContainer = null;
      this.cuesContainer = null;
      this._emit('detached');
      return this;
    }

    /**
     * Create overlay DOM structure
     */
    _createOverlayDOM() {
      if (!this.parentContainer) return;

      this.overlayContainer = document.createElement('div');
      this.overlayContainer.className = 'velox-subtitles-overlay';
      Object.assign(this.overlayContainer.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: this._getJustifyContent(),
        alignItems: 'center',
        zIndex: '15',
        overflow: 'hidden'
      });

      this.cuesContainer = document.createElement('div');
      this.cuesContainer.className = 'velox-subtitles-cue-wrapper';
      this._applyCuesContainerStyles();

      this.overlayContainer.appendChild(this.cuesContainer);
      this.parentContainer.appendChild(this.overlayContainer);
    }

    _getJustifyContent() {
      if (this.styles.position === 'top') return 'flex-start';
      if (this.styles.position === 'center') return 'center';
      return 'flex-end'; // Default 'bottom'
    }

    _applyCuesContainerStyles() {
      if (!this.cuesContainer) return;
      const s = this.styles;
      Object.assign(this.cuesContainer.style, {
        display: this.visible ? 'flex' : 'none',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: s.textAlign,
        maxWidth: s.maxWidth,
        margin: '0 auto',
        marginTop: s.position === 'top' ? s.topOffset : '0',
        marginBottom: s.position === 'bottom' ? s.bottomOffset : '0',
        pointerEvents: 'none',
        transition: 'margin 0.15s ease'
      });
    }

    /**
     * Update custom subtitle styles
     * @param {object} newStyles
     */
    setStyle(newStyles) {
      if (!newStyles || typeof newStyles !== 'object') return;
      this.styles = { ...this.styles, ...newStyles };

      if (this.overlayContainer) {
        this.overlayContainer.style.justifyContent = this._getJustifyContent();
      }
      this._applyCuesContainerStyles();

      // Force re-render with updated styles
      this._lastRenderedHtml = '';
      this.render();
      this._emit('styleChange', { styles: { ...this.styles } });
    }

    /**
     * Toggle subtitle visibility
     * @param {boolean} [visible]
     */
    setVisible(visible) {
      this.visible = visible !== undefined ? !!visible : !this.visible;
      if (this.cuesContainer) {
        this.cuesContainer.style.display = this.visible ? 'flex' : 'none';
      }
      this._emit('visibilityChange', { visible: this.visible });
    }

    toggleVisibility() {
      this.setVisible(!this.visible);
    }

    isVisible() {
      return this.visible;
    }

    // ========================================================================
    // Synchronized Render Loop
    // ========================================================================

    _onTimeUpdate() {
      this.render();
    }

    _rafLoop() {
      if (!this.videoElement || this.videoElement.paused) {
        this._rafId = null;
        return;
      }
      this.render();
      this._rafId = requestAnimationFrame(this._boundRafLoop);
    }

    /**
     * Render active cues to the DOM
     */
    render() {
      if (!this.cuesContainer || !this.visible) return;
      if (!this.videoElement) {
        if (this._lastRenderedHtml !== '') {
          this.cuesContainer.innerHTML = '';
          this._lastRenderedHtml = '';
        }
        return;
      }

      const activeCues = this.getActiveCues(this.videoElement.currentTime);
      if (!activeCues.length) {
        if (this._lastRenderedHtml !== '') {
          this.cuesContainer.innerHTML = '';
          this._lastRenderedHtml = '';
          this._emit('cuesChange', { activeCues: [] });
        }
        return;
      }

      // Generate HTML signature for anti-flicker diff
      const htmlSignature = activeCues.map(c => c.html).join('|||');
      if (htmlSignature === this._lastRenderedHtml) {
        return; // No DOM change needed
      }
      this._lastRenderedHtml = htmlSignature;

      // Build cue DOM nodes with configured styling
      const s = this.styles;
      const frag = document.createDocumentFragment();

      activeCues.forEach(cue => {
        const cueDiv = document.createElement('div');
        cueDiv.className = 'velox-subtitle-line';
        Object.assign(cueDiv.style, {
          fontSize: s.fontSize,
          fontFamily: s.fontFamily,
          fontWeight: s.fontWeight,
          color: s.color,
          lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing,
          textAlign: s.textAlign,
          padding: s.padding,
          borderRadius: s.borderRadius,
          backgroundColor: s.backgroundColor,
          margin: '2px 0',
          WebkitTextStroke: s.textStroke,
          textShadow: s.textShadow,
          wordWrap: 'break-word',
          whiteSpace: 'pre-wrap'
        });
        cueDiv.innerHTML = cue.html;
        frag.appendChild(cueDiv);
      });

      this.cuesContainer.innerHTML = '';
      this.cuesContainer.appendChild(frag);
      this._emit('cuesChange', { activeCues });
    }

    // ========================================================================
    // Event System
    // ========================================================================

    on(event, handler) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, new Set());
      }
      this._listeners.get(event).add(handler);
      return () => this.off(event, handler);
    }

    off(event, handler) {
      if (this._listeners.has(event)) {
        this._listeners.get(event).delete(handler);
      }
    }

    _emit(event, data) {
      if (this._listeners.has(event)) {
        this._listeners.get(event).forEach(fn => {
          try {
            fn(data);
          } catch (err) {
            console.error(`[VeloxSubtitles] Error in '${event}' listener:`, err);
          }
        });
      }
    }

    /**
     * Clean up and dispose subtitle engine
     */
    dispose() {
      this.detach();
      this.clear();
      this._listeners.clear();
    }
  }

  // Export parser functions as static methods
  VeloxSubtitles.parseSRT = parseSRT;
  VeloxSubtitles.parseWebVTT = parseWebVTT;
  VeloxSubtitles.parseSubtitles = parseSubtitles;
  VeloxSubtitles.parseTimestamp = parseTimestamp;
  VeloxSubtitles.formatSubtitleText = formatSubtitleText;
  VeloxSubtitles.DEFAULT_STYLES = DEFAULT_STYLES;

  return VeloxSubtitles;
});
