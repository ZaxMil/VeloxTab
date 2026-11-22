/**
 * VeloxTab — Audio Processing & DSP Engine (audio-dsp.js)
 * 
 * Features:
 * - 10-Band Graphic Equalizer (32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz)
 *   implemented with Web Audio API BiquadFilterNode peaking filters.
 * - Sound Presets: Flat, Rock, Pop, Bass Boost, Treble Boost, Vocal/Dialogue, Cinema, Classical,
 *   plus custom user presets.
 * - Volume Booster up to 200%+ with dynamic compressor limiter to eliminate audio distortion & clipping.
 * - Stereo Panning and Balance controls.
 * - Seamless MediaElementSource attachment for <video> and <audio> elements.
 * - Integrated AnalyserNode for high-FPS visualizers.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VeloxAudioDSP = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Standard 10-Band Graphic Equalizer Frequencies (ISO standard center frequencies)
  const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  // Frequency display labels
  const EQ_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

  // Built-in Equalizer Presets (gains in dB, range: -12dB to +12dB)
  const EQ_PRESETS = {
    'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'Rock': [4.5, 3.0, 1.5, 0.0, -1.0, -0.5, 1.5, 3.0, 4.0, 4.5],
    'Pop': [-1.5, 1.0, 2.5, 3.5, 3.0, 1.5, 0.5, 1.5, 3.0, 3.5],
    'Bass Boost': [7.0, 6.0, 5.0, 3.5, 1.5, 0.0, 0.0, 0.0, 0.0, 0.0],
    'Treble Boost': [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 2.5, 4.5, 6.0, 7.5],
    'Vocal/Dialogue': [-3.5, -2.5, -1.0, 1.0, 3.5, 4.0, 3.0, 1.0, -0.5, -2.0],
    'Cinema': [4.0, 3.0, 1.5, -0.5, -1.0, 1.0, 2.5, 3.0, 4.0, 4.5],
    'Classical': [4.0, 3.0, 2.0, 1.5, -1.0, -1.0, 0.5, 2.0, 3.0, 3.5]
  };

  // WeakMap to prevent duplicate createMediaElementSource calls on the same element
  const mediaSourceCache = new WeakMap();

  class VeloxAudioDSP {
    /**
     * @param {AudioContext} [audioCtx] Optional existing AudioContext
     */
    constructor(audioCtx = null) {
      this.audioCtx = audioCtx;
      this.isExternalCtx = !!audioCtx;

      // Audio nodes
      this.inputNode = null;
      this.preGainNode = null;
      this.eqFilters = [];
      this.pannerNode = null;
      this.boostGainNode = null;
      this.limiterNode = null;
      this.analyserNode = null;
      this.outputNode = null;

      // Current settings state
      this.activePreset = 'Flat';
      this.currentGains = [...EQ_PRESETS['Flat']];
      this.customPresets = {};
      this.volumeBoost = 1.0; // 1.0 = 100%, 2.0 = 200%
      this.pan = 0.0; // -1.0 (left) to +1.0 (right)
      this.eqEnabled = true;
      this.limiterEnabled = true;

      // Attached media element
      this.attachedElement = null;

      // Event listeners
      this._listeners = new Map();

      // Initialize graph if AudioContext is available
      if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
        this._initAudioGraph();
      }
    }

    /**
     * Ensure AudioContext is initialized and in running state
     */
    _ensureContext() {
      if (!this.audioCtx && typeof window !== 'undefined') {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (typeof window !== 'undefined' && !window.__veloxAudioResumed) {
        window.__veloxAudioResumed = true;
        const unlock = () => {
          if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
          }
        };
        window.addEventListener('click', unlock, { passive: true });
        window.addEventListener('keydown', unlock, { passive: true });
        window.addEventListener('pointerdown', unlock, { passive: true });
      }
      return this.audioCtx;
    }

    /**
     * Build the audio DSP processing pipeline graph
     */
    _initAudioGraph() {
      const ctx = this._ensureContext();
      if (!ctx) return;

      // 1. Input routing gain node
      this.inputNode = ctx.createGain();
      this.inputNode.gain.value = 1.0;

      // 2. Pre-gain node (headroom adjustment when EQ bands are boosted)
      this.preGainNode = ctx.createGain();
      this.preGainNode.gain.value = 1.0;
      this.inputNode.connect(this.preGainNode);

      // 3. 10-Band Graphic Equalizer (peaking biquad filters in series)
      this.eqFilters = [];
      let lastNode = this.preGainNode;

      for (let i = 0; i < EQ_FREQUENCIES.length; i++) {
        const freq = EQ_FREQUENCIES[i];
        const filter = ctx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        // Q = 1.414 yields an octave bandwidth matching the 10-band ISO spacing
        filter.Q.value = 1.414;
        filter.gain.value = this.currentGains[i] || 0;

        lastNode.connect(filter);
        this.eqFilters.push(filter);
        lastNode = filter;
      }

      // 4. Stereo Panner / Balance
      if (ctx.createStereoPanner) {
        this.pannerNode = ctx.createStereoPanner();
        this.pannerNode.pan.value = this.pan;
      } else {
        // Fallback for environments lacking createStereoPanner
        this.pannerNode = ctx.createGain();
      }
      lastNode.connect(this.pannerNode);
      lastNode = this.pannerNode;

      // 5. Volume Boost Gain Node (supports up to 200%+ amplification)
      this.boostGainNode = ctx.createGain();
      this.boostGainNode.gain.value = this.volumeBoost;
      lastNode.connect(this.boostGainNode);
      lastNode = this.boostGainNode;

      // 6. Dynamic Compressor / Brickwall Limiter to eliminate clipping & distortion
      this.limiterNode = ctx.createDynamicsCompressor();
      this._applyLimiterParams();
      lastNode.connect(this.limiterNode);
      lastNode = this.limiterNode;

      // 7. Analyser Node for Visualizers (post-EQ & post-limiting for accurate waveform)
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      lastNode.connect(this.analyserNode);

      // 8. Output to Audio Destination
      this.outputNode = ctx.destination;
      this.analyserNode.connect(this.outputNode);
    }

    /**
     * Configure limiter parameters for anti-clipping protection
     */
    _applyLimiterParams() {
      if (!this.limiterNode || !this.audioCtx) return;
      const now = this.audioCtx.currentTime;

      if (this.limiterEnabled) {
        // Transparent brickwall limiter profile
        this.limiterNode.threshold.setValueAtTime(-1.0, now); // -1.0 dB threshold
        this.limiterNode.knee.setValueAtTime(2.0, now);      // Smooth 2dB knee
        this.limiterNode.ratio.setValueAtTime(20.0, now);    // Hard 20:1 compression ratio
        this.limiterNode.attack.setValueAtTime(0.003, now);  // 3ms ultra-fast attack
        this.limiterNode.release.setValueAtTime(0.15, now);  // 150ms smooth release
      } else {
        // Disabled limiter: 1:1 ratio (uncompressed pass-through)
        this.limiterNode.threshold.setValueAtTime(0.0, now);
        this.limiterNode.ratio.setValueAtTime(1.0, now);
      }
    }

    /**
     * Connect an HTMLMediaElement (<video> or <audio>) to the DSP engine
     * @param {HTMLMediaElement} mediaElement
     * @returns {VeloxAudioDSP} this
     */
    attach(mediaElement) {
      if (!mediaElement) return this;
      const ctx = this._ensureContext();
      if (!ctx) return this;

      if (!this.inputNode) {
        this._initAudioGraph();
      }

      // Resume context if suspended
      if (ctx.state === 'suspended') {
        const resumeOnPlay = () => {
          ctx.resume().catch(() => {});
          mediaElement.removeEventListener('play', resumeOnPlay);
        };
        mediaElement.addEventListener('play', resumeOnPlay);
      }

      // Retrieve or create MediaElementAudioSourceNode
      let sourceNode = mediaSourceCache.get(mediaElement);
      if (!sourceNode) {
        try {
          sourceNode = ctx.createMediaElementSource(mediaElement);
          mediaSourceCache.set(mediaElement, sourceNode);
        } catch (err) {
          // If already connected elsewhere, log warning and return
          console.warn('[VeloxAudioDSP] createMediaElementSource warning:', err.message);
          return this;
        }
      }

      // Disconnect from previous destination and pipe into inputNode
      try {
        sourceNode.disconnect();
      } catch (_) {}

      sourceNode.connect(this.inputNode);
      this.attachedElement = mediaElement;
      this._emit('attached', { mediaElement });
      return this;
    }

    /**
     * Detach media element from DSP input
     * @param {HTMLMediaElement} [mediaElement]
     */
    detach(mediaElement = null) {
      const el = mediaElement || this.attachedElement;
      if (!el) return this;

      const sourceNode = mediaSourceCache.get(el);
      if (sourceNode) {
        try {
          sourceNode.disconnect();
          // Connect directly to destination when detached
          if (this.audioCtx) {
            sourceNode.connect(this.audioCtx.destination);
          }
        } catch (_) {}
      }

      if (this.attachedElement === el) {
        this.attachedElement = null;
      }
      this._emit('detached', { mediaElement: el });
      return this;
    }

    // ========================================================================
    // Equalizer Controls
    // ========================================================================

    /**
     * Get list of frequencies (in Hz)
     * @returns {number[]}
     */
    getFrequencies() {
      return [...EQ_FREQUENCIES];
    }

    /**
     * Get list of frequency labels (e.g. '32Hz', '1kHz')
     * @returns {string[]}
     */
    getLabels() {
      return [...EQ_LABELS];
    }

    /**
     * Set gain for a specific equalizer band
     * @param {number} bandIndex Index (0..9) or frequency (e.g. 1000)
     * @param {number} gainDb Gain in dB (-15 to +15)
     */
    setBandGain(bandIndex, gainDb) {
      let index = bandIndex;
      if (typeof bandIndex === 'number' && bandIndex >= 32) {
        index = EQ_FREQUENCIES.indexOf(bandIndex);
      }
      if (index < 0 || index >= EQ_FREQUENCIES.length) return;

      const clampedGain = Math.max(-15, Math.min(15, Number(gainDb) || 0));
      this.currentGains[index] = clampedGain;

      if (this.eqEnabled && this.eqFilters[index] && this.audioCtx) {
        const param = this.eqFilters[index].gain;
        param.setTargetAtTime(clampedGain, this.audioCtx.currentTime, 0.02);
      }

      this.activePreset = 'Custom';
      this._emit('eqChange', { band: index, gain: clampedGain, gains: [...this.currentGains] });
    }

    /**
     * Get gain of a band by index or frequency
     * @param {number} bandIndex
     * @returns {number}
     */
    getBandGain(bandIndex) {
      let index = bandIndex;
      if (typeof bandIndex === 'number' && bandIndex >= 32) {
        index = EQ_FREQUENCIES.indexOf(bandIndex);
      }
      return this.currentGains[index] || 0;
    }

    /**
     * Get current gains for all 10 bands
     * @returns {number[]}
     */
    getBandGains() {
      return [...this.currentGains];
    }

    /**
     * Set all 10 equalizer bands at once
     * @param {number[]} gains Array of 10 dB values
     */
    setBands(gains) {
      if (!Array.isArray(gains)) return;
      gains.forEach((g, i) => {
        if (i < 10) this.setBandGain(i, g);
      });
    }

    /**
     * Reset equalizer to Flat (0dB across all bands)
     */
    resetBands() {
      this.applyPreset('Flat');
    }

    /**
     * Toggle Equalizer ON / OFF
     * @param {boolean} enabled
     */
    setEqEnabled(enabled) {
      this.eqEnabled = !!enabled;
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.eqFilters.forEach((filter, i) => {
        const targetGain = this.eqEnabled ? this.currentGains[i] : 0;
        filter.gain.setTargetAtTime(targetGain, now, 0.02);
      });
      this._emit('eqToggle', { enabled: this.eqEnabled });
    }

    isEqEnabled() {
      return this.eqEnabled;
    }

    // ========================================================================
    // Presets Management
    // ========================================================================

    /**
     * Get all available preset names (built-in and custom)
     * @returns {string[]}
     */
    getPresets() {
      return [...Object.keys(EQ_PRESETS), ...Object.keys(this.customPresets)];
    }

    /**
     * Get preset values by name
     * @param {string} name
     * @returns {number[]|null}
     */
    getPresetValues(name) {
      return EQ_PRESETS[name] || this.customPresets[name] || null;
    }

    /**
     * Apply a preset by name
     * @param {string} name (Flat, Rock, Pop, Bass Boost, Treble Boost, Vocal/Dialogue, Cinema, Classical)
     * @returns {boolean}
     */
    applyPreset(name) {
      const preset = EQ_PRESETS[name] || this.customPresets[name];
      if (!preset) return false;

      this.activePreset = name;
      preset.forEach((gain, i) => {
        this.setBandGain(i, gain);
      });
      this.activePreset = name;
      this._emit('presetChange', { name, gains: [...preset] });
      return true;
    }

    /**
     * Save a user-defined custom preset
     * @param {string} name
     * @param {number[]} gains
     */
    saveCustomPreset(name, gains) {
      if (!name || !Array.isArray(gains) || gains.length !== 10) return false;
      this.customPresets[name] = [...gains];
      this._emit('presetSaved', { name, gains: this.customPresets[name] });
      return true;
    }

    /**
     * Delete a custom preset
     * @param {string} name
     */
    deleteCustomPreset(name) {
      if (this.customPresets[name]) {
        delete this.customPresets[name];
        this._emit('presetDeleted', { name });
        return true;
      }
      return false;
    }

    /**
     * Get currently active preset name
     * @returns {string}
     */
    getActivePreset() {
      return this.activePreset;
    }

    // ========================================================================
    // Volume Boost (Up to 200%+) & Limiter Controls
    // ========================================================================

    /**
     * Set volume boost multiplier
     * @param {number} level Boost factor: 1.0 = 100%, 2.0 = 200% (Range: 0.0 to 3.0)
     */
    setVolumeBoost(level) {
      const clamped = Math.max(0.0, Math.min(3.0, Number(level) || 1.0));
      this.volumeBoost = clamped;

      if (this.boostGainNode && this.audioCtx) {
        this.boostGainNode.gain.setTargetAtTime(this.volumeBoost, this.audioCtx.currentTime, 0.02);
      }
      this._emit('volumeBoostChange', { boost: this.volumeBoost, percentage: Math.round(this.volumeBoost * 100) });
    }

    /**
     * Get current volume boost factor
     * @returns {number}
     */
    getVolumeBoost() {
      return this.volumeBoost;
    }

    /**
     * Toggle Dynamic Compressor Limiter ON / OFF
     * When ON, eliminates clipping and distortion under heavy volume boost.
     * @param {boolean} enabled
     */
    setLimiterEnabled(enabled) {
      this.limiterEnabled = !!enabled;
      this._applyLimiterParams();
      this._emit('limiterToggle', { enabled: this.limiterEnabled });
    }

    isLimiterEnabled() {
      return this.limiterEnabled;
    }

    // ========================================================================
    // Panning & Stereo Balance Controls
    // ========================================================================

    /**
     * Set stereo panning / balance
     * @param {number} value -1.0 (Full Left) to +1.0 (Full Right), 0.0 = Center
     */
    setPan(value) {
      const clamped = Math.max(-1.0, Math.min(1.0, Number(value) || 0.0));
      this.pan = clamped;

      if (this.pannerNode && this.audioCtx) {
        if (this.pannerNode.pan) {
          this.pannerNode.pan.setTargetAtTime(this.pan, this.audioCtx.currentTime, 0.02);
        }
      }
      this._emit('panChange', { pan: this.pan });
    }

    /**
     * Get current stereo pan value
     * @returns {number}
     */
    getPan() {
      return this.pan;
    }

    /**
     * Reset stereo pan to center (0.0)
     */
    resetPan() {
      this.setPan(0.0);
    }

    // ========================================================================
    // Analyser / Visualizer Integration
    // ========================================================================

    /**
     * Get the post-DSP AnalyserNode (ready to connect to canvas visualizers)
     * @returns {AnalyserNode|null}
     */
    getAnalyser() {
      return this.analyserNode;
    }

    /**
     * Configure AnalyserNode FFT parameters
     * @param {number} [fftSize=256]
     * @param {number} [smoothing=0.8]
     */
    configureAnalyser(fftSize = 256, smoothing = 0.8) {
      if (!this.analyserNode) return;
      this.analyserNode.fftSize = fftSize;
      this.analyserNode.smoothingTimeConstant = smoothing;
    }

    /**
     * Get frequency data array helper for visualizers
     * @param {Uint8Array} [outputArray]
     * @returns {Uint8Array}
     */
    getByteFrequencyData(outputArray = null) {
      if (!this.analyserNode) return new Uint8Array(0);
      const array = outputArray || new Uint8Array(this.analyserNode.frequencyBinCount);
      this.analyserNode.getByteFrequencyData(array);
      return array;
    }

    // ========================================================================
    // State Persistence & Import / Export
    // ========================================================================

    /**
     * Export full DSP configuration
     * @returns {object}
     */
    exportSettings() {
      return {
        activePreset: this.activePreset,
        currentGains: [...this.currentGains],
        customPresets: { ...this.customPresets },
        volumeBoost: this.volumeBoost,
        pan: this.pan,
        eqEnabled: this.eqEnabled,
        limiterEnabled: this.limiterEnabled
      };
    }

    /**
     * Import configuration state
     * @param {object} settings
     */
    importSettings(settings) {
      if (!settings || typeof settings !== 'object') return;
      if (settings.customPresets) {
        this.customPresets = { ...settings.customPresets };
      }
      if (Array.isArray(settings.currentGains)) {
        this.setBands(settings.currentGains);
      }
      if (typeof settings.activePreset === 'string') {
        this.activePreset = settings.activePreset;
      }
      if (typeof settings.volumeBoost === 'number') {
        this.setVolumeBoost(settings.volumeBoost);
      }
      if (typeof settings.pan === 'number') {
        this.setPan(settings.pan);
      }
      if (typeof settings.eqEnabled === 'boolean') {
        this.setEqEnabled(settings.eqEnabled);
      }
      if (typeof settings.limiterEnabled === 'boolean') {
        this.setLimiterEnabled(settings.limiterEnabled);
      }
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
            console.error(`[VeloxAudioDSP] Error in '${event}' listener:`, err);
          }
        });
      }
    }

    /**
     * Clean up and dispose audio DSP nodes
     */
    dispose() {
      this.detach();
      if (!this.isExternalCtx && this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
      }
      this._listeners.clear();
      this.eqFilters = [];
      this.inputNode = null;
      this.preGainNode = null;
      this.pannerNode = null;
      this.boostGainNode = null;
      this.limiterNode = null;
      this.analyserNode = null;
    }
  }

  // Attach static presets & constants to class
  VeloxAudioDSP.FREQUENCIES = EQ_FREQUENCIES;
  VeloxAudioDSP.LABELS = EQ_LABELS;
  VeloxAudioDSP.PRESETS = EQ_PRESETS;

  return VeloxAudioDSP;
});
