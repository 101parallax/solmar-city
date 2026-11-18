// Save: persists game progress to localStorage under one versioned key.
// Privacy by design (Modern Web Guidance "privacy"): the save holds only
// gameplay progress — money, REP, shells, stats, settings — never personal
// data, tokens, or identifiers ("If you don't have the data, you can't lose
// it"). clearSave() gives the player one-step erasure, and every storage
// access is feature-detected and wrapped so private mode or a full quota
// degrades to "no save" instead of crashing the game.

export class Save {
  static KEY = 'solmar-city-save-v3';
  static VERSION = 3;
  static AUTOSAVE_INTERVAL = 60;

  constructor(game) {
    this.game = game;
    this._timer = 0;
  }

  // Called every frame by the game loop; autosaves once a minute. Missions
  // also trigger an immediate autosave when they are passed.
  update(dt) {
    this._timer += dt;
    if (this._timer >= Save.AUTOSAVE_INTERVAL) {
      this._timer = 0;
      this.save();
    }
  }

  save() {
    return saveGame(this.game);
  }

  load() {
    return loadGame(this.game);
  }

  autosave() {
    return this.save();
  }

  hasSave() {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(Save.KEY) !== null;
    } catch (err) {
      return false;
    }
  }

  clearSave() {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.removeItem(Save.KEY);
      return true;
    } catch (err) {
      return false;
    }
  }
}

export function saveGame(game) {
  try {
    if (typeof localStorage === 'undefined') return false;
    const s = game.state;
    const snapshot = {
      version: Save.VERSION,
      savedAt: Date.now(),
      money: s.money,
      rep: s.rep,
      repTier: s.repTier,
      shells: s.shells,
      shellsCollected: [...(s.shellsCollected || [])],
      completion: s.completion,
      stats: { ...(s.stats || {}) },
      missionsPassed: [...(s.flags.missionsPassed || [])],
      settings: { ...(s.settings || {}) },
      playerPos: { ...(s.playerPos || { x: 0, z: 0 }) },
      timeOfDay: s.timeOfDay,
      day: s.day,
      unlocks: { ...(s.unlocks || {}) },
      weapon: s.weapon,
      ammo: { ...(s.ammo || {}) },
      health: s.health,
      armour: s.armour,
      muted: !!s.muted,
      radioOn: s.radioOn !== false,
      radioStation: s.radioStation || 0,
      raceWon: !!s.flags.raceWon,
      faresDone: s.flags.faresDone || 0,
    };
    localStorage.setItem(Save.KEY, JSON.stringify(snapshot));
    return true;
  } catch (err) {
    // Quota exceeded, private mode, or unavailable storage: saving fails
    // silently and the game keeps running without a save file.
    return false;
  }
}

export function loadGame(game) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(Save.KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (!snapshot || snapshot.version !== Save.VERSION) return null;
    const s = game.state;
    const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
    s.money = num(snapshot.money, s.money);
    s.rep = num(snapshot.rep, s.rep);
    s.shells = num(snapshot.shells, s.shells);
    if (Array.isArray(snapshot.shellsCollected)) s.shellsCollected = [...snapshot.shellsCollected];
    s.completion = num(snapshot.completion, s.completion);
    if (snapshot.stats && typeof snapshot.stats === 'object') Object.assign(s.stats, snapshot.stats);
    if (Array.isArray(snapshot.missionsPassed)) {
      s.flags.missionsPassed = [...snapshot.missionsPassed];
      // Keep the per-mission flags the full map reads in sync with the list.
      for (const id of snapshot.missionsPassed) s.flags[`passed_${id}`] = true;
    }
    if (snapshot.settings && typeof snapshot.settings === 'object') Object.assign(s.settings, snapshot.settings);
    if (snapshot.playerPos && typeof snapshot.playerPos.x === 'number') {
      s.playerPos = { x: snapshot.playerPos.x, z: snapshot.playerPos.z };
      if (game.player && game.player.mesh) {
        game.player.mesh.position.x = snapshot.playerPos.x;
        game.player.mesh.position.z = snapshot.playerPos.z;
      }
    }
    s.timeOfDay = num(snapshot.timeOfDay, s.timeOfDay);
    s.day = num(snapshot.day, s.day);
    if (snapshot.unlocks && typeof snapshot.unlocks === 'object') Object.assign(s.unlocks, snapshot.unlocks);
    if (typeof snapshot.weapon === 'string') s.weapon = snapshot.weapon;
    if (snapshot.ammo && typeof snapshot.ammo === 'object') Object.assign(s.ammo, snapshot.ammo);
    s.health = num(snapshot.health, s.health);
    s.armour = num(snapshot.armour, s.armour);
    if (typeof snapshot.muted === 'boolean') s.muted = snapshot.muted;
    if (typeof snapshot.radioOn === 'boolean') s.radioOn = snapshot.radioOn;
    if (typeof snapshot.radioStation === 'number') s.radioStation = snapshot.radioStation;
    s.flags.raceWon = !!snapshot.raceWon;
    s.flags.faresDone = num(snapshot.faresDone, 0);
    s.mission = null;
    s.wanted = 0;
    s.heat = 0;
    if (game.rep) game.rep.sync();
    return snapshot;
  } catch (err) {
    return null;
  }
}

// Completion: 7 missions x 8% (56) + 20 shells x 1.5% (30) + street race
// win (7) + taxi fares, 1.4% each up to 5 (7) = 100.
export function computeCompletion(state) {
  const passed = (state.flags.missionsPassed || []).length;
  const missions = passed * 8;
  const shells = Math.min(state.shells || 0, 20) * 1.5;
  const race = state.flags.raceWon ? 7 : 0;
  const fares = Math.min(state.flags.faresDone || 0, 5) * 1.4;
  return Math.min(100, Math.round(missions + shells + race + fares));
}
