// Procedural audio engine: every sound in Solmar City is synthesized live
// with the Web Audio API. There are no audio files. The engine covers one
// shot sound effects, a step-sequenced synth radio per station, and a
// coastal ambience bed (filtered-noise waves plus gull chirps).

import { RADIO_STATIONS } from '../data/radio.js';

// Short aliases used across the codebase map onto canonical effect names.
const SFX_ALIASES = {
  shot: 'shoot',
  money: 'cash',
  'rank-up': 'rankup',
  empty: 'emptyClick',
  sirenBlip: 'siren',
  crash: 'impact',
  'mission-passed': 'missionPassed',
  'mission-failed': 'missionFailed',
  checkpoint: 'checkpoint',
  pickup: 'pickup',
  reload: 'reload',
  explosion: 'explosion',
};

export class Audio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.ambienceGain = null;
    this.muted = false;
    this.station = 0;
    this.radioOn = true;
    this._nextNoteTime = 0;
    this._step = 0;
    this._ambienceStarted = false;
    this._gullTimer = 6;
    this._noiseBuffer = null;
    // Unlock audio on the first user gesture so the context is running
    // before any sound is requested (browsers start it suspended).
    this._unlock = () => this._ensureCtx();
    window.addEventListener('pointerdown', this._unlock, { once: true });
    window.addEventListener('keydown', this._unlock, { once: true });
  }

  // Lazily create the audio context on first use (browsers require a user
  // gesture before audio can start; resume() is a no-op until then).
  _ensureCtx() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.32;
      this.musicGain.connect(this.master);
      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.value = 0.16;
      this.ambienceGain.connect(this.master);
      this._nextNoteTime = this.ctx.currentTime + 0.1;
      return true;
    } catch (err) {
      return false;
    }
  }

  _noise(seconds) {
    if (!this._noiseBuffer || this._noiseBuffer.duration < seconds) {
      const len = Math.floor(this.ctx.sampleRate * seconds);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      const rng = this.game.rng;
      for (let i = 0; i < len; i += 1) {
        data[i] = rng ? rng.next() * 2 - 1 : Math.sin(i * 0.7) * 0.5;
      }
      this._noiseBuffer = buffer;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    return source;
  }

  _tone({ type, freq, freqEnd, time, duration, gain, dest }) {
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, time);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), time + duration);
    amp.gain.setValueAtTime(gain || 0.2, time);
    amp.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(amp);
    amp.connect(dest || this.master);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  _burst({ time, duration, gain, filterFreq, filterEnd, type }) {
    const src = this._noise(duration + 0.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.setValueAtTime(filterFreq || 1200, time);
    if (filterEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), time + duration);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain || 0.3, time);
    amp.gain.exponentialRampToValueAtTime(0.001, time + duration);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    src.start(time);
    src.stop(time + duration + 0.05);
  }

  // Play a named one-shot effect. Unknown names are ignored silently so a
  // typo in a caller can never break gameplay.
  sfx(name) {
    if (this.muted || (this.game.state && this.game.state.muted)) return;
    if (!this._ensureCtx()) return;
    const canonical = SFX_ALIASES[name] || name;
    const t = this.ctx.currentTime + 0.01;
    try {
      switch (canonical) {
        case 'shoot':
          this._burst({ time: t, duration: 0.12, gain: 0.35, filterFreq: 3000, filterEnd: 300 });
          this._tone({ type: 'square', freq: 220, freqEnd: 60, time: t, duration: 0.1, gain: 0.18 });
          break;
        case 'explosion':
          this._burst({ time: t, duration: 0.9, gain: 0.6, filterFreq: 900, filterEnd: 60 });
          this._tone({ type: 'sine', freq: 90, freqEnd: 30, time: t, duration: 0.8, gain: 0.5 });
          break;
        case 'checkpoint':
          this._tone({ type: 'sine', freq: 660, time: t, duration: 0.14, gain: 0.25 });
          this._tone({ type: 'sine', freq: 990, time: t + 0.12, duration: 0.22, gain: 0.25 });
          break;
        case 'siren':
          this._tone({ type: 'triangle', freq: 750, freqEnd: 1050, time: t, duration: 0.22, gain: 0.16 });
          this._tone({ type: 'triangle', freq: 1050, freqEnd: 750, time: t + 0.22, duration: 0.22, gain: 0.16 });
          break;
        case 'horn':
          this._tone({ type: 'sawtooth', freq: 370, time: t, duration: 0.3, gain: 0.14 });
          this._tone({ type: 'sawtooth', freq: 466, time: t, duration: 0.3, gain: 0.12 });
          break;
        case 'pickup':
          this._tone({ type: 'sine', freq: 520, time: t, duration: 0.1, gain: 0.22 });
          this._tone({ type: 'sine', freq: 780, time: t + 0.09, duration: 0.16, gain: 0.22 });
          break;
        case 'cash':
          this._tone({ type: 'sine', freq: 1320, time: t, duration: 0.1, gain: 0.2 });
          this._tone({ type: 'sine', freq: 1760, time: t + 0.09, duration: 0.2, gain: 0.2 });
          break;
        case 'missionPassed': {
          const notes = [523, 659, 784, 1047];
          notes.forEach((freq, i) => {
            this._tone({ type: 'triangle', freq, time: t + i * 0.13, duration: 0.3, gain: 0.22 });
          });
          break;
        }
        case 'missionFailed': {
          const notes = [392, 330, 262, 196];
          notes.forEach((freq, i) => {
            this._tone({ type: 'triangle', freq, time: t + i * 0.16, duration: 0.32, gain: 0.2 });
          });
          break;
        }
        case 'reload':
          this._tone({ type: 'square', freq: 900, freqEnd: 500, time: t, duration: 0.06, gain: 0.12 });
          this._tone({ type: 'square', freq: 700, freqEnd: 400, time: t + 0.14, duration: 0.06, gain: 0.12 });
          break;
        case 'emptyClick':
          this._tone({ type: 'square', freq: 1200, freqEnd: 800, time: t, duration: 0.05, gain: 0.14 });
          break;
        case 'impact':
          this._burst({ time: t, duration: 0.25, gain: 0.45, filterFreq: 700, filterEnd: 120 });
          this._tone({ type: 'sine', freq: 120, freqEnd: 45, time: t, duration: 0.25, gain: 0.4 });
          break;
        case 'rankup': {
          const notes = [440, 554, 659, 880];
          notes.forEach((freq, i) => {
            this._tone({ type: 'sine', freq, time: t + i * 0.09, duration: 0.22, gain: 0.2 });
          });
          break;
        }
        default:
          break;
      }
    } catch (err) {
      // Audio must never break the game loop.
    }
  }

  setStation(index) {
    const count = RADIO_STATIONS.length;
    this.station = ((index % count) + count) % count;
    if (this.game.state) this.game.state.radioStation = this.station;
    this._step = 0;
    if (this.ctx) this._nextNoteTime = this.ctx.currentTime + 0.05;
  }

  toggleRadio() {
    this.radioOn = !this.radioOn;
    if (this.game.state) this.game.state.radioOn = this.radioOn;
    if (this.musicGain) this.musicGain.gain.value = this.radioOn ? 0.32 : 0;
    return this.radioOn;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.game.state) this.game.state.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  // Coastal ambience: looped filtered noise swells like waves (slow LFO on
  // the filter and gain) plus occasional gull chirps.
  _startAmbience() {
    if (this._ambienceStarted) return;
    this._ambienceStarted = true;
    try {
      const src = this._noise(2);
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.5;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.28;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ambienceGain);
      src.start();
      lfo.start();
    } catch (err) {
      // Ambience is decorative; ignore failures.
    }
  }

  _gullChirp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    const base = 1400 + (this.game.rng ? this.game.rng.range(0, 600) : 300);
    this._tone({ type: 'sine', freq: base, freqEnd: base * 1.4, time: t, duration: 0.16, gain: 0.05, dest: this.ambienceGain });
    this._tone({ type: 'sine', freq: base * 1.2, freqEnd: base * 0.9, time: t + 0.2, duration: 0.14, gain: 0.04, dest: this.ambienceGain });
  }

  // Step-sequenced radio: bass on every beat, a sparse lead melody picked
  // from the station scale with the seeded game RNG.
  _scheduleRadio() {
    if (!this.ctx || !this.radioOn || this.muted) return;
    const station = RADIO_STATIONS[this.station] || RADIO_STATIONS[0];
    const beat = 60 / station.tempo / 2;
    while (this._nextNoteTime < this.ctx.currentTime + 0.25) {
      const step = this._step;
      const t = this._nextNoteTime;
      const rng = this.game.rng;
      if (step % 2 === 0) {
        const root = station.root / 2;
        this._tone({ type: station.bassWaveform, freq: root, time: t, duration: beat * 1.8, gain: 0.22, dest: this.musicGain });
      }
      if (step % 4 === 2) {
        this._burst({ time: t, duration: 0.05, gain: 0.05, filterFreq: 6000, type: 'highpass' });
      }
      const playLead = rng ? rng.chance(0.55) : step % 4 === 0;
      if (playLead) {
        const degree = rng ? rng.pick(station.scale) : station.scale[step % station.scale.length];
        const octave = rng && rng.chance(0.25) ? 2 : 1;
        const freq = station.root * Math.pow(2, degree / 12) * octave;
        this._tone({ type: station.waveform, freq, time: t, duration: beat * 0.9, gain: 0.12 * station.brightness + 0.05, dest: this.musicGain });
      }
      this._nextNoteTime += beat;
      this._step += 1;
    }
  }

  update(dt) {
    const state = this.game.state;
    if (state) {
      if (state.muted !== this.muted) this.setMuted(state.muted);
      if (typeof state.radioStation === 'number' && state.radioStation !== this.station) {
        this.station = state.radioStation;
      }
      if (typeof state.radioOn === 'boolean') this.radioOn = state.radioOn;
    }
    if (this.muted || (state && state.muted)) return;
    if (!this._ensureCtx()) return;
    this._startAmbience();
    this._scheduleRadio();
    this._gullTimer -= dt;
    if (this._gullTimer <= 0) {
      this._gullChirp();
      const rng = this.game.rng;
      this._gullTimer = rng ? rng.range(7, 18) : 12;
    }
  }
}
