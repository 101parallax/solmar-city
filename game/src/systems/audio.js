// Sound for Solmar City: 100% synthesised Web Audio — oscillators plus one
// shared noise buffer. No audio files, no network.
//
// The AudioContext is created lazily on the first user gesture (browser
// autoplay policy): main.js calls `unlock()` from a click/key handler, and
// every play() call is a safe no-op until then. In a non-browser environment
// (logic tests in Node) the whole module degrades to no-ops.

import { createRandom } from '../random.js';

// Seeded noise for the shared noise buffer: the game stays deterministic
// even in its sound synthesis.
const noiseRandom = createRandom(20261118);

const NOTE = {
  c4: 261.63, d4: 293.66, e4: 329.63, f4: 349.23,
  g4: 392.0, a4: 440.0, b4: 493.88, c5: 523.25, e5: 659.25, g5: 783.99,
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._noiseBuffer = null;
    this._engineOsc = null;
    this._engineGain = null;
    this._engineFilter = null;
    this._sirenOsc = null;
    this._sirenGain = null;
    this._sirenLfo = null;
    this.enabled = true;
  }

  /** Create the context. Call from a user gesture (click / keypress). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      if (typeof window === 'undefined') return false;
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const length = this.ctx.sampleRate;
      this._noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this._noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = noiseRandom() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  get ready() {
    return Boolean(this.ctx && this.enabled);
  }

  /** Play a named one-shot effect. Unknown names are ignored. */
  play(name) {
    if (!this.ready) return false;
    switch (name) {
      case 'shoot': return this._shoot();
      case 'punch': return this._punch();
      case 'explosion': return this._explosion();
      case 'click': return this._click();
      case 'siren-blip': return this._sirenBlip();
      case 'passed': return this._jingle([NOTE.c4, NOTE.e4, NOTE.g4, NOTE.c5]);
      case 'failed': return this._jingle([NOTE.g4, NOTE.e4, NOTE.c4]);
      case 'checkpoint': return this._jingle([NOTE.e5, NOTE.g5]);
      case 'pickup': return this._jingle([NOTE.c5, NOTE.e5]);
      default: return false;
    }
  }

  /**
   * Engine loop: `rpm` is 0..1 (0 = off). A sawtooth through a low-pass
   * filter, pitched by rpm. Call every frame or when rpm changes.
   */
  setEngine(rpm) {
    if (!this.ready) return;
    if (rpm <= 0) {
      this._stopEngine();
      return;
    }
    if (!this._engineOsc) {
      this._engineOsc = this.ctx.createOscillator();
      this._engineOsc.type = 'sawtooth';
      this._engineFilter = this.ctx.createBiquadFilter();
      this._engineFilter.type = 'lowpass';
      this._engineFilter.frequency.value = 400;
      this._engineGain = this.ctx.createGain();
      this._engineGain.gain.value = 0.06;
      this._engineOsc.connect(this._engineFilter);
      this._engineFilter.connect(this._engineGain);
      this._engineGain.connect(this.master);
      this._engineOsc.start();
    }
    const now = this.ctx.currentTime;
    this._engineOsc.frequency.setTargetAtTime(50 + rpm * 140, now, 0.05);
    this._engineFilter.frequency.setTargetAtTime(300 + rpm * 900, now, 0.05);
    this._engineGain.gain.setTargetAtTime(0.04 + rpm * 0.05, now, 0.05);
  }

  /** Police siren loop on/off: a two-tone wail from an LFO'd triangle wave. */
  siren(on) {
    if (!this.ready) {
      if (!on) this._stopSiren();
      return;
    }
    if (!on) {
      this._stopSiren();
      return;
    }
    if (this._sirenOsc) return;
    this._sirenOsc = this.ctx.createOscillator();
    this._sirenOsc.type = 'triangle';
    this._sirenOsc.frequency.value = 700;
    this._sirenLfo = this.ctx.createOscillator();
    this._sirenLfo.type = 'square';
    this._sirenLfo.frequency.value = 0.6;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    this._sirenLfo.connect(lfoGain);
    lfoGain.connect(this._sirenOsc.frequency);
    this._sirenGain = this.ctx.createGain();
    this._sirenGain.gain.value = 0.05;
    this._sirenOsc.connect(this._sirenGain);
    this._sirenGain.connect(this.master);
    this._sirenOsc.start();
    this._sirenLfo.start();
  }

  _stopEngine() {
    if (!this._engineOsc) return;
    try { this._engineOsc.stop(); } catch { /* already stopped */ }
    this._engineOsc.disconnect();
    this._engineOsc = null;
    this._engineGain = null;
    this._engineFilter = null;
  }

  _stopSiren() {
    if (!this._sirenOsc) return;
    try { this._sirenOsc.stop(); this._sirenLfo.stop(); } catch { /* already stopped */ }
    this._sirenOsc.disconnect();
    this._sirenLfo.disconnect();
    this._sirenOsc = null;
    this._sirenGain = null;
    this._sirenLfo = null;
  }

  _noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + duration);
    return true;
  }

  _tone(freq, duration, type, gainValue, when = 0) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    const start = this.ctx.currentTime + when;
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration);
    return true;
  }

  _shoot() {
    this._noiseBurst(0.12, 1800, 0.5, 'bandpass');
    this._tone(120, 0.1, 'sine', 0.4);
    return true;
  }

  _punch() {
    this._noiseBurst(0.08, 400, 0.4);
    return true;
  }

  _explosion() {
    this._noiseBurst(0.8, 300, 0.8);
    this._tone(55, 0.7, 'sine', 0.7);
    return true;
  }

  _click() {
    return this._tone(880, 0.05, 'square', 0.12);
  }

  _sirenBlip() {
    this._tone(900, 0.12, 'triangle', 0.2);
    this._tone(700, 0.12, 'triangle', 0.2, 0.12);
    return true;
  }

  _jingle(notes) {
    notes.forEach((freq, i) => this._tone(freq, 0.22, 'triangle', 0.25, i * 0.13));
    return true;
  }
}
