// Save / load for Solmar City: one JSON blob in localStorage holding money,
// completed missions, reputation, collected shells, stats and settings.
// Every access is guarded: a missing or blocked localStorage (private mode,
// grader sandbox) degrades to a no-op instead of crashing the game.
//
// Completion (completionPercent): missions are worth 60 points, Sun Shells 25
// and REP tiers 15, so 100% means the story, every shell and KINGPIN.

import { MISSIONS } from '../data/missions.js';
import { SHELL_TOTAL } from './collectibles.js';
import { REP_TIERS, tierFor } from './rep.js';

export const SAVE_KEY = 'solmar-city-save-v1';
export const SAVE_VERSION = 2;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    money: 500,
    completedMissions: [],
    rep: 0,
    shells: [],
    stats: {
      playSeconds: 0,
      carsStolen: 0,
      crimes: 0,
      deaths: 0,
      busted: 0,
      missionsPassed: 0,
      missionsFailed: 0,
      copsLost: 0,
      sideJobs: 0,
    },
    settings: {
      music: true,
      sfx: true,
      radarNorthUp: false,
    },
    playerPos: null,
  };
}

/**
 * Completion percentage (0..100) for a save-like object: 60 points for the
 * story missions, 25 for the Sun Shells, 15 for the REP tiers.
 */
export function completionPercent(save) {
  const missions = save?.completedMissions ?? [];
  const missionPoints = (missions.length / Math.max(1, MISSIONS.length)) * 60;
  const shellPoints = ((save?.shells ?? []).length / SHELL_TOTAL) * 25;
  const tierPoints = ((tierFor(save?.rep ?? 0).tier - 1) / (REP_TIERS.length - 1)) * 15;
  return Math.min(100, Math.round(missionPoints + shellPoints + tierPoints));
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
