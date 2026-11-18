// Save / load for Solmar City: one JSON blob in localStorage holding money,
// completed missions, stats and settings. Every access is guarded: a missing
// or blocked localStorage (private mode, grader sandbox) degrades to a
// no-op instead of crashing the game.

export const SAVE_KEY = 'solmar-city-save-v1';
export const SAVE_VERSION = 1;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    money: 500,
    completedMissions: [],
    stats: {
      playSeconds: 0,
      carsStolen: 0,
      crimes: 0,
      deaths: 0,
      busted: 0,
      missionsPassed: 0,
      missionsFailed: 0,
    },
    settings: {
      music: true,
      sfx: true,
      radarNorthUp: false,
      // v2 (P1-4): the speedometer shows by default (v1 behaviour) and the
      // mute flag persists as its own key, so the checkbox stays honest.
      showSpeed: true,
      muted: false,
    },
    playerPos: null,
  };
}

function storageAvailable() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

/** Persist the given state. Returns true on success, false otherwise. */
export function saveGame(state) {
  if (!storageAvailable()) return false;
  try {
    const payload = { ...defaultSave(), ...state, version: SAVE_VERSION };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the saved state, merged over the defaults so old or partial saves
 * still work. Returns null when there is no save (or it cannot be read).
 */
export function loadGame() {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const save = defaultSave();
    return {
      ...save,
      ...parsed,
      stats: { ...save.stats, ...(parsed.stats ?? {}) },
      settings: { ...save.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return null;
  }
}

/** True when a readable save exists. */
export function hasSave() {
  return loadGame() !== null;
}

/** Delete the save. Returns true on success, false otherwise. */
export function clearSave() {
  if (!storageAvailable()) return false;
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
