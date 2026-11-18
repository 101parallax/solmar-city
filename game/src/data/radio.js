// Car radio for Solmar City: two fictional stations with fictional artists,
// played by a tiny WebAudio synth (no audio files, no network). The HUD owns
// the Radio instance; R cycles stations while driving (on foot R is reload).
// Music only ever starts from a user gesture, so the autoplay policy is never
// fought: the AudioContext is created lazily on the first station change.
//
// Station sound is a fixed 8-step loop per station — a soft bass on the beat
// and a plucked melody from a fixed scale-degree pattern, so both stations
// sound different and the music stays deterministic (no Math.random anywhere).

/** The two stations. `pattern` is scale degrees (semitones from the root). */
export const STATIONS = [
  {
    id: 'solmar-fm',
    name: 'SOLMAR FM 88.5',
    tagline: 'Sunset Drive',
    tempo: 112,
    root: 220.0, // A3
    scale: [0, 2, 4, 5, 7, 9, 11], // major
    pattern: [0, 4, 7, 4, 9, 7, 4, 2],
    tracks: [
      { title: 'Sunset Drive', artist: 'The Palms' },
      { title: 'Neon Boardwalk', artist: 'Marina Vale' },
      { title: 'Gold Coast Run', artist: 'The Palms' },
      { title: 'Halcyon Nights', artist: 'Cassia Blue' },
    ],
  },
  {
    id: 'coast',
    name: 'COAST 92.1',
    tagline: 'Night Tide',
    tempo: 84,
    root: 196.0, // G3
    scale: [0, 2, 3, 5, 7, 8, 10], // natural minor
    pattern: [0, 3, 7, 10, 7, 3, 0, 5],
    tracks: [
      { title: 'Night Tide', artist: 'Low Harbor' },
      { title: 'Fog Over Vista', artist: 'Cassia Blue' },
      { title: 'Slow Current', artist: 'Low Harbor' },
    ],
  },
];

/** Seconds a track plays before the next one starts. */
const TRACK_SECONDS = 90;

function semitoneToFreq(root, semitones) {
  return root * 2 ** (semitones / 12);
}

export class Radio {
  constructor() {
    /** -1 = off, otherwise an index into STATIONS. */
    this.stationIndex = -1;
    this.trackIndex = 0;
    this.ctx = null;
    this.master = null;
    this.timer = null;
    this.nextNoteTime = 0;
    this.step = 0;
    this.trackStartedAt = 0;
    /** Called when the station or the track changes: () => void. */
    this.onTrackChange = null;
  }

  /** The station + track now playing, or null when the radio is off. */
  current() {
    if (this.stationIndex < 0) return null;
    const station = STATIONS[this.stationIndex];
    return { station, track: station.tracks[this.trackIndex] ?? station.tracks[0] };
  }

  get playing() {
    return this.stationIndex >= 0 && this.timer !== null;
  }

  /** Cycle OFF -> station 1 -> station 2 -> OFF. Starts audio (a gesture). */
  next() {
    const nextIndex = this.stationIndex + 1 >= STATIONS.length ? -1 : this.stationIndex + 1;
    this.setStation(nextIndex, true);
    return this.current();
  }

  /**
   * Switch to a station (-1 = off). With `audible` the synth starts (call
   * only from a user gesture); without it only the state changes, which is
   * what screenshot staging uses.
   */
  setStation(index, audible = false) {
    this.stationIndex = index;
    this.trackIndex = 0;
    this.trackStartedAt = Date.now();
    this._stopScheduler();
    if (index >= 0 && audible) this._startScheduler();
    this.onTrackChange?.();
    return this.current();
  }

  /** Pause the sound (leaving the car); the station is kept. */
  pause() {
    this._stopScheduler();
  }

  /** Resume the sound (getting back in); a no-op if never started. */
  resume() {
    if (this.stationIndex >= 0 && this.ctx) this._startScheduler();
  }

  _ensureContext() {
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
      this.master.gain.value = 0.14;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  _startScheduler() {
    if (!this._ensureContext()) return;
    if (this.timer !== null) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this._tick(), 90);
  }

  _stopScheduler() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _tick() {
    if (!this.ctx || this.stationIndex < 0) return;
    // A track ends: move on, and tell the HUD to refresh the widget.
    if (Date.now() - this.trackStartedAt > TRACK_SECONDS * 1000) {
      const station = STATIONS[this.stationIndex];
      this.trackIndex = (this.trackIndex + 1) % station.tracks.length;
      this.trackStartedAt = Date.now();
      this.onTrackChange?.();
    }
    const station = STATIONS[this.stationIndex];
    const stepDur = 60 / station.tempo / 2; // eighth notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      this._scheduleStep(station, this.step, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 8;
    }
  }

  _scheduleStep(station, step, when, stepDur) {
    // Bass on the beat (steps 0 and 4): root, then the fifth.
    if (step === 0 || step === 4) {
      const freq = semitoneToFreq(station.root / 2, step === 0 ? 0 : 7);
      this._pluck(freq, when, stepDur * 1.8, 'triangle', 0.5);
    }
    // Plucked melody on every step.
    const degree = station.pattern[step % station.pattern.length];
    this._pluck(semitoneToFreq(station.root, degree), when, stepDur * 0.9, 'sine', 0.28);
  }

  _pluck(freq, when, duration, type, volume) {
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(when);
      osc.stop(when + duration + 0.02);
    } catch {
      // Audio is decoration: a failed note must never break the game.
    }
  }
}
