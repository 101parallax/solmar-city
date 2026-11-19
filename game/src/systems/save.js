// Save and load: game progress in localStorage, nothing else.
// The snapshot holds only gameplay values (money, reputation, shells,
// mission progress, settings, position, clock). No personal information,
// tokens or credentials are ever stored. Autosaves run after every passed
// mission and every 60 seconds of play.

export const SAVE_KEY = 'solmar-city-save-v4';
export const SAVE_VERSION = 4;

const AUTOSAVE_INTERVAL = 60;

// Completion: missions 8% each, shells 1.5% each, street race 7%,
// taxi fares 1.4% each (first five). Rounded, clamped to 0..100.
export function computeCompletion(progress) {
  const flags = progress?.flags ?? {};
  const passed = Array.isArray(flags.missionsPassed) ? flags.missionsPassed.length : 0;
  const shells = Math.min(20, progress?.shells ?? 0);
  const fares = Math.min(5, flags.faresDone ?? 0);
  const total = passed * 8 + shells * 1.5 + (flags.raceWon ? 7 : 0) + fares * 1.4;
  return Math.max(0, Math.min(100, Math.round(total)));
}

// Deep-copy plain values with structuredClone, falling back to a JSON
// round trip when the platform lacks it or the value cannot clone.
function clonePlain(value, fallback) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (err) {
      // Fall through to the JSON copy below.
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return fallback;
  }
}

// Peek at the stored snapshot without applying it: the title screen
// uses this to show progress (story count, money, completion, day)
// before the player chooses Continue. Null when absent or unreadable.
export function peekSave() {
  const snap = readSnapshot();
  if (!snap || snap.version !== SAVE_VERSION) return null;
  return snap;
}

// Read the stored snapshot without applying it (null when absent).
function readSnapshot() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

// Persist the current game state. Returns true on success.
export function saveGame(game) {
  const s = game.state;
  const snapshot = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    money: s.money,
    rep: s.rep,
    repTier: s.repTier,
    health: s.health,
    armour: s.armour,
    ammo: clonePlain(s.ammo, { pistol: 48, carbine: 120, shotgun: 24 }),
    weapon: s.weapon,
    shells: s.shells,
    shellsCollected: [...(s.shellsCollected ?? [])],
    completion: computeCompletion(s),
    stats: clonePlain(s.stats, {}),
    flags: clonePlain(s.flags, {}),
    settings: clonePlain(s.settings, {}),
    unlocks: clonePlain(s.unlocks, {}),
    muted: s.muted,
    radioOn: s.radioOn,
    radioStation: s.radioStation,
    timeOfDay: s.timeOfDay,
    day: s.day,
    playerPos: { x: s.playerPos?.x ?? 0, z: s.playerPos?.z ?? 0 },
  };
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (err) {
    return false;
  }
}

// Restore a saved game into the live state. Returns the snapshot on
// success, or null when there is no save, the save is corrupt, or its
// version does not match. The player always loads clean: no wanted
// level, no active mission, standing at the saved position.
export function loadGame(game) {
  const snap = readSnapshot();
  if (!snap || snap.version !== SAVE_VERSION) return null;
  const s = game.state;

  s.money = snap.money ?? 500;
  s.rep = snap.rep ?? 0;
  s.health = snap.health ?? 100;
  s.armour = snap.armour ?? 0;
  if (snap.ammo) Object.assign(s.ammo, snap.ammo);
  if (snap.weapon) s.weapon = snap.weapon;
  s.shells = snap.shells ?? 0;
  s.shellsCollected = Array.isArray(snap.shellsCollected) ? [...snap.shellsCollected] : [];
  s.stats = { ...s.stats, ...(snap.stats ?? {}) };
  s.flags = { ...(snap.flags ?? {}) };

  // Restore the dual mission flags so the map and the HUD agree.
  const passed = Array.isArray(s.flags.missionsPassed) ? s.flags.missionsPassed : [];
  s.flags.missionsPassed = [...passed];
  for (const id of passed) s.flags[`passed_${id}`] = true;

  if (snap.settings) s.settings = { ...s.settings, ...snap.settings };
  if (snap.unlocks) s.unlocks = { ...s.unlocks, ...snap.unlocks };
  s.muted = snap.muted ?? false;
  s.radioOn = snap.radioOn ?? true;
  s.radioStation = snap.radioStation ?? 0;
  s.timeOfDay = snap.timeOfDay ?? 16.5;
  s.day = snap.day ?? 1;
  s.playerPos = { x: snap.playerPos?.x ?? 0, z: snap.playerPos?.z ?? 0 };
  s.wanted = 0;
  s.heat = 0;
  s.mission = null;

  const player = game.player;
  if (player?.mesh?.position) {
    player.mesh.position.x = s.playerPos.x;
    player.mesh.position.z = s.playerPos.z;
  }
  if (typeof player?.teleport === 'function') {
    try {
      player.teleport(s.playerPos.x, s.playerPos.z);
    } catch (err) {
      // Teleport is optional; the mesh position above already moved.
    }
  }
  if (player) player.health = s.health;

  // Sync the reputation tier from the restored points.
  if (typeof game.rep?.syncTier === 'function') game.rep.syncTier();
  else s.repTier = snap.repTier ?? 1;

  s.completion = computeCompletion(s);
  return snap;
}

export class Save {
  constructor(game) {
    this.game = game;
    this.timer = 0;
  }

  // Called every frame by main.js; autosaves once a minute.
  update(dt) {
    this.timer += dt;
    if (this.timer >= AUTOSAVE_INTERVAL) {
      this.timer = 0;
      this.saveNow();
    }
  }

  // Save right now (mission pass, menu action, shutdown).
  saveNow() {
    return saveGame(this.game);
  }

  // True when a save exists in localStorage.
  hasSave() {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(SAVE_KEY) !== null;
    } catch (err) {
      return false;
    }
  }

  // Short progress summary for the title screen (story count, money,
  // completion, day). Null when no readable save exists.
  summary() {
    const snap = peekSave();
    if (!snap) return null;
    const passed = Array.isArray(snap.flags?.missionsPassed)
      ? snap.flags.missionsPassed.length
      : (snap.stats?.missionsPassed ?? 0);
    return {
      missionsPassed: passed,
      money: snap.money ?? 0,
      completion: snap.completion ?? 0,
      day: snap.day ?? 1,
    };
  }

  // Delete the save. Returns true when the key is gone afterwards.
  clearSave() {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.removeItem(SAVE_KEY);
      return true;
    } catch (err) {
      return false;
    }
  }
}
