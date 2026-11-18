// Audio system for Solmar City: pure WebAudio synthesis, no audio files.
// Sound effects, two synthesized radio stations, police siren loop and a
// beach ambience (filtered-noise waves plus gull chirps) are all generated
// live with oscillators and a seeded noise buffer. Everything honours
// state.muted, and the AudioContext is only created after a user gesture
// (browsers block autoplay otherwise).

import { RADIO_STATIONS } from '../data/radio.js';

export class Audio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.ambienceGain = null;
    this.noiseBuffer = null;
    this.songIndex = 0;
    this.songElapsed = 0;
    this.songLength = 96; // seconds per track before the DJ moves on
    this.nextNoteTime = 0;
    this.step = 0;
    this.sirenNodes = null;
    this.ambienceNodes = null;
    this.nextChirpIn = 12;
    this.unlocked = false;
    this._boundUnlock = () => this.unlock();
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this._boundUnlock, { once: true });
      window.addEventListener('keydown', this._boundUnlock, { once: true });
    }
  }

  get state() {
    return this.game.state;
  }

  get station() {
    return RADIO_STATIONS[this.state.radioStation] || RADIO_STATIONS[0];
  }

  // Create (or resume) the AudioContext. Safe to call repeatedly; does
  // nothing until the page has seen a user gesture.
  unlock() {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch (err) {
      return;
    }
    this.unlocked = true;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.state.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.16;
    this.ambienceGain.connect(this.master);
    this._buildNoiseBuffer();
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this._startAmbience();
  }

  _buildNoiseBuffer() {
    const length = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    const rng = this.game.rng;
    for (let i = 0; i < length; i++) data[i] = rng.next() * 2 - 1;
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    return src;
  }

  _tone({ type = 'sine', freq = 440, freqEnd = null, at = 0, dur = 0.2, vol = 0.5, dest = null }) {
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(dest || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return osc;
  }

  _noiseBurst({ at = 0, dur = 0.2, vol = 0.5, filterFreq = 1200, type = 'lowpass', dest = null }) {
    const t0 = this.ctx.currentTime + at;
    const src = this._noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest || this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // Play a named sound effect. Unknown names are ignored.
  sfx(name) {
    if (!this.unlocked || !this.ctx || this.state.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    switch (name) {
      case 'shoot':
      case 'shot': // combat/police/hostiles call it 'shot'
        this._noiseBurst({ dur: 0.09, vol: 0.5, filterFreq: 2600, type: 'highpass' });
        this._tone({ type: 'square', freq: 220, freqEnd: 60, dur: 0.08, vol: 0.25 });
        break;
      case 'shotgun':
        this._noiseBurst({ dur: 0.22, vol: 0.7, filterFreq: 1400 });
        this._tone({ type: 'sawtooth', freq: 140, freqEnd: 40, dur: 0.2, vol: 0.35 });
        break;
      case 'explosion':
        this._noiseBurst({ dur: 0.9, vol: 0.9, filterFreq: 500 });
        this._tone({ type: 'sine', freq: 90, freqEnd: 28, dur: 0.8, vol: 0.8 });
        break;
      case 'checkpoint':
        this._tone({ freq: 660, dur: 0.1, vol: 0.35 });
        this._tone({ freq: 990, at: 0.09, dur: 0.16, vol: 0.35 });
        break;
      case 'horn':
        this._tone({ type: 'sawtooth', freq: 370, dur: 0.35, vol: 0.3 });
        this._tone({ type: 'sawtooth', freq: 466, dur: 0.35, vol: 0.25 });
        break;
      case 'pickup':
        this._tone({ freq: 520, dur: 0.08, vol: 0.3 });
        this._tone({ freq: 780, at: 0.07, dur: 0.12, vol: 0.3 });
        break;
      case 'cash':
      case 'money': // shop, drift, near-miss and side jobs call it 'money'
        this._tone({ freq: 880, dur: 0.07, vol: 0.3 });
        this._tone({ freq: 1174, at: 0.06, dur: 0.07, vol: 0.3 });
        this._tone({ freq: 1568, at: 0.12, dur: 0.14, vol: 0.3 });
        break;
      case 'rank-up':
        [392, 523, 659, 784].forEach((f, i) => this._tone({ freq: f, at: i * 0.09, dur: 0.18, vol: 0.32 }));
        break;
      case 'empty':
        this._tone({ freq: 1100, dur: 0.04, vol: 0.25 });
        this._tone({ freq: 900, at: 0.06, dur: 0.04, vol: 0.2 });
        break;
      case 'crash':
        this._noiseBurst({ dur: 0.25, vol: 0.7, filterFreq: 900 });
        this._tone({ type: 'sawtooth', freq: 130, freqEnd: 45, dur: 0.22, vol: 0.35 });
        break;
      case 'mission-passed':
        [523, 659, 784, 1047].forEach((f, i) => this._tone({ freq: f, at: i * 0.11, dur: 0.22, vol: 0.35 }));
        break;
      case 'mission-failed':
        [392, 330, 262, 196].forEach((f, i) => this._tone({ type: 'triangle', freq: f, at: i * 0.14, dur: 0.24, vol: 0.35 }));
        break;
      case 'siren-blip':
      case 'sirenBlip': // police.js calls it 'sirenBlip'
        this._tone({ type: 'square', freq: 700, freqEnd: 950, dur: 0.16, vol: 0.18 });
        this._tone({ type: 'square', freq: 950, freqEnd: 700, at: 0.16, dur: 0.16, vol: 0.18 });
        break;
      case 'click':
        this._tone({ freq: 1200, dur: 0.04, vol: 0.2 });
        break;
      case 'drift':
        this._noiseBurst({ dur: 0.5, vol: 0.28, filterFreq: 900, type: 'bandpass' });
        break;
      case 'nearmiss':
        this._tone({ freq: 440, freqEnd: 880, dur: 0.18, vol: 0.25 });
        break;
      case 'buy':
        this._tone({ freq: 740, dur: 0.09, vol: 0.3 });
        this._tone({ freq: 1108, at: 0.08, dur: 0.15, vol: 0.3 });
        break;
      case 'denied':
        this._tone({ type: 'square', freq: 160, dur: 0.18, vol: 0.25 });
        break;
      case 'heal':
        this._tone({ freq: 600, freqEnd: 900, dur: 0.25, vol: 0.25 });
        break;
      case 'reload':
        this._tone({ freq: 300, dur: 0.05, vol: 0.25 });
        this._tone({ freq: 420, at: 0.09, dur: 0.05, vol: 0.25 });
        break;
      case 'door':
        this._noiseBurst({ dur: 0.12, vol: 0.4, filterFreq: 700 });
        break;
      case 'skid':
        this._noiseBurst({ dur: 0.35, vol: 0.22, filterFreq: 1100, type: 'bandpass' });
        break;
      default:
        break;
    }
  }

  setStation(i) {
    const next = ((i % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length;
    if (next === this.state.radioStation) return;
    this.state.radioStation = next;
    this.songIndex = 0;
    this.songElapsed = 0;
    this.step = 0;
    if (this.unlocked) this.nextNoteTime = this.ctx.currentTime + 0.05;
  }

  toggleRadio() {
    this.state.radioOn = !this.state.radioOn;
  }

  setMuted(muted) {
    this.state.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.9;
    if (muted) this._stopSiren();
  }

  currentTrack() {
    const station = this.station;
    const song = station.songs[this.songIndex % station.songs.length];
    return { station: station.name + ' · ' + station.tagline, title: song.title, artist: song.artist };
  }

  // Beach ambience: looped noise through a lowpass filter whose cutoff and
  // gain breathe with slow LFOs (waves), plus occasional gull chirps.
  _startAmbience() {
    const src = this._noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.5;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    const swell = this.ctx.createOscillator();
    swell.frequency.value = 0.06;
    const swellGain = this.ctx.createGain();
    swellGain.gain.value = 0.22;
    swell.connect(swellGain);
    swellGain.connect(gain.gain);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambienceGain);
    src.start();
    lfo.start();
    swell.start();
    this.ambienceNodes = { src, lfo, swell };
  }

  _gullChirp() {
    if (!this.unlocked || this.state.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, t0);
    osc.frequency.exponentialRampToValueAtTime(2100, t0 + 0.09);
    osc.frequency.exponentialRampToValueAtTime(1200, t0 + 0.22);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    osc.connect(gain);
    gain.connect(this.ambienceGain);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  }

  _startSiren() {
    if (this.sirenNodes || !this.unlocked) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 750;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    lfo.start();
    this.sirenNodes = { osc, lfo, gain };
  }

  _stopSiren() {
    if (!this.sirenNodes) return;
    try {
      this.sirenNodes.osc.stop();
      this.sirenNodes.lfo.stop();
    } catch (err) { /* already stopped */ }
    this.sirenNodes = null;
  }

  // One step of the radio sequencer: bass on the beat, a sparse pentatonic
  // lead, and a soft noise hat. Notes are picked from the station scale
  // with the seeded game RNG so a seeded run sounds identical.
  _scheduleStep(step, time) {
    const station = this.station;
    const scale = station.scale;
    const rng = this.game.rng;
    const beat = step % 8;
    const root = station.rootHz;
    const freqOf = (degree) => root * Math.pow(2, scale[degree % scale.length] / 12);
    if (beat === 0 || beat === 4) {
      const osc = this.ctx.createOscillator();
      osc.type = station.bassWaveform;
      osc.frequency.value = root / 2;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.22, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.42);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.45);
    }
    if (beat === 2 || beat === 6) {
      const src = this._noiseSource();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.06, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      src.start(time);
      src.stop(time + 0.06);
    }
    if (rng.chance(0.55)) {
      const degree = rng.int(4, scale.length + 3);
      const osc = this.ctx.createOscillator();
      osc.type = station.waveform;
      osc.frequency.value = freqOf(degree);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.11, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.34);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.36);
    }
  }

  update(dt) {
    if (!this.unlocked || !this.ctx) return;
    if (this.ctx.state === 'suspended') return;
    // Siren follows the wanted level (independent of the radio).
    if (!this.state.muted && this.state.wanted > 0) {
      this._startSiren();
    } else {
      this._stopSiren();
    }
    // Radio sequencer with a short lookahead window.
    if (this.state.radioOn && !this.state.muted && !this.state.paused) {
      const stepDur = 60 / this.station.tempo / 2; // eighth notes
      while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
        this._scheduleStep(this.step, this.nextNoteTime);
        this.nextNoteTime += stepDur;
        this.step++;
      }
      this.songElapsed += dt;
      if (this.songElapsed >= this.songLength) {
        this.songElapsed = 0;
        this.songIndex = (this.songIndex + 1) % this.station.songs.length;
      }
    }
    // Occasional gull chirp on the beach ambience.
    this.nextChirpIn -= dt;
    if (this.nextChirpIn <= 0) {
      this._gullChirp();
      this.nextChirpIn = 14 + this.game.rng.range(0, 26);
    }
  }
}
