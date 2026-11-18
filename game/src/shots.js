// Staged screenshots for Solmar City. Reading ?shot=<name>&seed=<n> from
// the URL, each shot puts the game into a deterministic state (golden-hour
// chase, street life, race, combat), waits a few frames, clears every
// transient HUD element, then sets window.__shotReady so the screenshot
// harness knows the frame is stable. Shots also publish game.shotCamera
// (position + lookAt) for the main loop to honour as a camera override;
// entities are additionally staged so the default follow camera frames
// them well even without the override.

import { mulberry32 } from './random.js';
import { CITY_DATA } from './data/city.js';
import { MISSIONS } from './data/missions.js';

let activeGame = null;
let activeSeed = 1;

// Small seeded RNG with the same interface as the game's RNG class, built
// from mulberry32 so the shot seed always takes effect.
function seededRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (array) => array[Math.floor(next() * array.length)],
    chance: (p) => next() < p,
  };
}

function districtCenter(name) {
  const districts = (CITY_DATA && CITY_DATA.districts) || [];
  const match = districts.find((d) => d.name && d.name.toLowerCase().includes(name.toLowerCase()))
    || districts[0];
  if (match && match.bounds) {
    return {
      x: (match.bounds.minX + match.bounds.maxX) / 2,
      z: (match.bounds.minZ + match.bounds.maxZ) / 2,
    };
  }
  return { x: 0, z: 0 };
}

function nearestRoadAt(axis, near) {
  const roads = (CITY_DATA && CITY_DATA.roads) || {};
  // CITY_DATA.roads is { vertical: [...x], horizontal: [...z] }.
  const values = axis === 'x' ? (roads.vertical || []) : (roads.horizontal || []);
  let best = null;
  let bestDist = Infinity;
  for (const at of values) {
    const dist = Math.abs(at - near);
    if (dist < bestDist) {
      bestDist = dist;
      best = at;
    }
  }
  return best !== null ? best : near;
}

// Forward vector for a mesh rotation.y. Vehicles move along
// (sin(heading), cos(heading)) — forward is local +Z, not -Z.
function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

function setPlayerOnFoot(game, x, z, heading) {
  const state = game.state;
  if (state.playerInVehicle && game.vehicles && typeof game.vehicles.exit === 'function') {
    game.vehicles.exit();
  }
  state.playerInVehicle = null;
  state.playerPos = { x, z };
  const player = game.player;
  if (player && player.mesh) {
    player.mesh.position.set(x, 0, z);
    player.mesh.rotation.y = heading;
  }
  if (player) player.inVehicle = false;
}

function putPlayerInCar(game, type, x, z, heading) {
  const vehicles = game.vehicles;
  if (!vehicles || typeof vehicles.spawn !== 'function') {
    setPlayerOnFoot(game, x, z, heading);
    return null;
  }
  const vehicle = vehicles.spawn(type, x, z);
  if (vehicle && vehicle.mesh) vehicle.mesh.rotation.y = heading;
  if (vehicle && typeof vehicles.enter === 'function') vehicles.enter(vehicle);
  game.state.playerInVehicle = vehicle;
  game.state.playerPos = { x, z };
  const player = game.player;
  // Player.inVehicle must be the Vehicle (or null), never a boolean:
  // Player.update reads this.inVehicle.mesh every frame, and `true` has
  // no mesh — that threw on every frame of the chase/race shots and froze
  // the loop (and the screenshot) on a stale frame. enter() already sets
  // it; this only covers the path where enter() was unavailable.
  if (player && vehicle) player.inVehicle = vehicle;
  if (player && player.mesh) player.mesh.position.set(x, 0, z);
  return vehicle;
}

function setWanted(game, level) {
  if (game.wanted && typeof game.wanted.setWanted === 'function') game.wanted.setWanted(level);
  game.state.wanted = level;
  game.state.heat = level * 20;
  if (game.police && typeof game.police.spawnForWanted === 'function') {
    game.police.spawnForWanted(level);
  }
}

function startMission(game, id, objectiveIndex) {
  const missions = game.missions;
  if (missions && typeof missions.startMission === 'function') {
    missions.startMission(id);
  } else {
    const fresh = { id, status: 'active', objectiveIndex: objectiveIndex || 0, timer: null };
    fresh.data = {};
    game.state.mission = fresh;
  }
  if (game.state.mission) {
    game.state.mission.objectiveIndex = objectiveIndex || 0;
    game.state.mission.status = 'active';
  }
}

function setCamera(game, px, py, pz, lx, ly, lz) {
  game.shotCamera = { position: [px, py, pz], lookAt: [lx, ly, lz] };
  if (game.camera) {
    game.camera.position.set(px, py, pz);
    game.camera.lookAt(lx, ly, lz);
  }
}

function cruiserMeshes(game) {
  const police = game.police;
  if (!police) return [];
  const list = police.cruisers || police.unitsList || [];
  // Cruiser entries carry the Vehicle under .vehicle (no .mesh of their own).
  return list
    .map((unit) => (unit && unit.vehicle ? unit.vehicle.mesh : unit && unit.mesh))
    .filter((mesh) => Boolean(mesh));
}

function stageChase(game, rng) {
  const state = game.state;
  const downtown = districtCenter('Downtown');
  const roadX = nearestRoadAt('x', downtown.x);
  const roadZ = nearestRoadAt('z', downtown.z);
  const heading = 0; // facing +Z along the avenue
  const fwd = forwardOf(heading);
  const px = roadX;
  const pz = roadZ + 30;
  state.timeOfDay = 13; // midday: high sun, front-lit helicopter, bright street
  state.day = 1;
  state.money = 2450;
  state.health = 100;
  state.armour = 50;
  state.rep = 320;
  state.repTier = 3;
  state.shells = 7;
  state.completion = 18;
  state.unlocks.nitro = true;
  state.weapon = 'pistol';
  const car = putPlayerInCar(game, 'Vento GT', px, pz, heading);
  if (car) {
    car.speed = 22; // ~79 km/h, mid-chase
    car.nos = 80;
  }
  startMission(game, 'M1', 1);
  setWanted(game, 3);
  // Three cruisers in frame: a two-car roadblock ahead (facing the
  // player) and one alongside in pursuit. All ahead of the camera, which
  // looks down the road — cruisers staged behind the player would sit
  // behind the camera and never be seen.
  const cruisers = cruiserMeshes(game);
  const spots = [
    { x: px - 4, z: pz + 22, rot: Math.PI },
    { x: px + 5, z: pz + 24, rot: Math.PI + 0.4 },
    { x: px + 7, z: pz + 6, rot: heading },
  ];
  cruisers.slice(0, 3).forEach((mesh, i) => {
    const spot = spots[i] || spots[0];
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = spot.rot;
  });
  // Helicopter big, bright and FULLY in frame: high enough to sit
  // against the sky gap above the far buildings (not against a dark
  // facade), far enough that the tail fin clears the top edge, with the
  // midday sun lighting the side that faces the camera. (Two earlier
  // framings clipped the rotor or the tail; this one keeps the whole
  // aircraft inside the frame with sky behind it.) Spawn it explicitly
  // — the update loop has not run yet, so heli.mesh is still null at
  // staging time — then hold its position so the orbit drift cannot
  // carry it out of frame before the screenshot.
  const heli = game.helicopter;
  const heliPos = { x: px + 2, y: 15, z: pz + 14 };
  if (heli && typeof heli.spawn === 'function' && !heli.isActive()) heli.spawn();
  if (heli && heli.mesh) {
    heli.mesh.position.set(heliPos.x, heliPos.y, heliPos.z);
    heli.holdPosition = true;
  }
  // Camera behind and above the car, looking level down the street: the
  // player car sits bottom-centre, the roadblock ahead of it, and the
  // helicopter large in the upper third. (The old low camera looked up
  // steeply into the sunset: the helicopter was a backlit silhouette and
  // every cruiser fell below the frame.)
  setCamera(
    game,
    px, 7, pz - 14,
    px, 6, pz + 25,
  );
  void rng;
}

function stageStreet(game, rng) {
  const state = game.state;
  const downtown = districtCenter('Downtown');
  const roadX = nearestRoadAt('x', downtown.x);
  const roadZ = nearestRoadAt('z', downtown.z);
  const heading = Math.PI / 2; // walking along the street
  const fwd = forwardOf(heading);
  // On the sidewalk: a few metres off the road centre line.
  const px = roadX + 5.5;
  const pz = roadZ + 12;
  state.timeOfDay = 12;
  state.day = 1;
  state.money = 1250;
  state.health = 100;
  state.armour = 0;
  state.rep = 150;
  state.repTier = 2;
  state.shells = 4;
  state.completion = 9;
  state.mission = null;
  state.weapon = 'pistol';
  setWanted(game, 0);
  setPlayerOnFoot(game, px, pz, heading);
  setCamera(
    game,
    px - fwd.x * 7, 3.4, pz - fwd.z * 7,
    px + fwd.x * 18, 1.4, pz + fwd.z * 18,
  );
  void rng;
}

function stageRace(game, rng) {
  const state = game.state;
  const start = (CITY_DATA && (CITY_DATA.raceStart || CITY_DATA.streetRaceStart))
    || districtCenter('Harbor');
  const heading = 0;
  const fwd = forwardOf(heading);
  const px = start.x;
  const pz = start.z;
  state.timeOfDay = 15; // bright afternoon: the road, car and gate read clearly
  state.day = 1;
  state.money = 1800;
  state.health = 100;
  state.armour = 0;
  state.rep = 240;
  state.repTier = 2;
  state.shells = 5;
  state.completion = 14;
  state.unlocks.nitro = true;
  state.weapon = 'pistol';
  const car = putPlayerInCar(game, 'Vento GT', px, pz, heading);
  if (car) {
    car.speed = 26;
    car.nos = 65;
  }
  // Clear wanted AFTER entering the car: enter() logs a 'steal' crime,
  // so a setWanted(0) before it would be undone immediately.
  setWanted(game, 0);
  startMission(game, 'M2', 0);
  if (state.mission) {
    state.mission.timer = 78;
    state.mission.data = state.mission.data || {};
    state.mission.data.gateIndex = 2;
  }
  // High camera, above the palm canopies (which top out near y=9): the
  // old low camera sat inside the fronds and two canopies filled the
  // frame. From up here the road, the car and the gate read clearly.
  setCamera(
    game,
    px - fwd.x * 13, 11, pz - fwd.z * 13,
    px + fwd.x * 35, 1, pz + fwd.z * 35,
  );
  void rng;
}

function stageCombat(game, rng) {
  const state = game.state;
  const def = MISSIONS.find((m) => m.id === 'M3');
  const warehouse = (def && def.startPos) || districtCenter('Harbor');
  const heading = 0;
  const fwd = forwardOf(heading);
  const px = warehouse.x;
  const pz = warehouse.z;
  state.timeOfDay = 15;
  state.day = 1;
  state.money = 2100;
  state.health = 62; // visibly hurt: the health bar tells the story
  state.armour = 25;
  state.rep = 280;
  state.repTier = 2;
  state.shells = 6;
  state.completion = 16;
  state.weapon = 'carbine';
  if (state.ammo) state.ammo.carbine = 96;
  setWanted(game, 0);
  setPlayerOnFoot(game, px, pz, heading);
  startMission(game, 'M3', 1);
  if (state.mission) {
    state.mission.data = state.mission.data || {};
    state.mission.data.remaining = 3;
  }
  // Three guards ahead of the player, spread across the frame.
  const spots = [
    { x: px + fwd.x * 14 - 5, z: pz + fwd.z * 14 },
    { x: px + fwd.x * 17, z: pz + fwd.z * 17 },
    { x: px + fwd.x * 13 + 6, z: pz + fwd.z * 13 },
  ];
  if (game.hostiles && typeof game.hostiles.spawn === 'function') {
    if (typeof game.hostiles.clear === 'function') game.hostiles.clear();
    game.hostiles.spawn(3, spots, { hp: 100 });
  }
  setCamera(
    game,
    px - fwd.x * 6, 2.6, pz - fwd.z * 6,
    px + fwd.x * 16, 1.4, pz + fwd.z * 16,
  );
  void rng;
}

const STAGERS = { chase: stageChase, street: stageStreet, race: stageRace, combat: stageCombat };

// Stage one shot synchronously (also used by the playtest harness).
export function stageShot(name) {
  const game = activeGame;
  if (!game) return false;
  const stage = STAGERS[name];
  if (!stage) return false;
  const rng = seededRng(activeSeed);
  game.state.paused = false;
  stage(game, rng);
  return true;
}

// Wait until the loop has frozen the sim (or the timeout elapses, in
// which case the caller freezes directly as a fallback).
function waitForFreeze(game, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (game.state.paused || Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}

// Full shot run: close menus, stage, wait for the render to settle, clear
// transients, add the shot's own staged flourishes, then signal ready.
export async function runShot(name) {
  const game = activeGame;
  if (!game) return false;
  if (typeof window !== 'undefined') window.__shotReady = false;
  if (game.menus && typeof game.menus.hideAll === 'function') game.menus.hideAll();
  if (game.radar && typeof game.radar.closeMap === 'function' && game.radar.mapOpen) {
    game.radar.closeMap();
  }
  game.state.paused = false;
  if (!stageShot(name)) return false;
  // Freeze after exactly 3 loop updates, counted by the loop itself (see
  // main.js): the frozen sim state is then identical on every load.
  game.freezeAfterUpdates = 3;
  await waitForFreeze(game);
  if (!game.state.paused && typeof game.freezeForShot === 'function') {
    game.freezeForShot();
  }
  if (game.hud && typeof game.hud.clearTransients === 'function') game.hud.clearTransients();
  // Shot-specific flourishes, added AFTER the clear so they are staged
  // content, not stale toasts.
  if (name === 'race' && game.hud && typeof game.hud.showEventPopup === 'function') {
    game.hud.showEventPopup('DRIFT +$150');
  }
  if (name === 'combat') {
    const pos = game.state.playerPos || { x: 0, z: 0 };
    if (game.effects && typeof game.effects.damageNumber === 'function') {
      game.effects.damageNumber({ x: pos.x, y: 2, z: pos.z - 14 }, 42);
    }
    if (game.combat && typeof game.combat.tryShoot === 'function') {
      try { game.combat.tryShoot(); } catch (err) { /* tracer is best-effort */ }
    }
  }
  // Re-apply the camera override one last time before the frame is read.
  // The sim is already frozen by the loop (see above); the frame the
  // harness reads is the frozen one, identical on every load.
  const override = game.shotCamera;
  if (override && game.camera) {
    game.camera.position.set(override.position[0], override.position[1], override.position[2]);
    game.camera.lookAt(override.lookAt[0], override.lookAt[1], override.lookAt[2]);
  }
  if (typeof window !== 'undefined') window.__shotReady = true;
  return true;
}

// Read ?shot=<name>&seed=<n> and run the requested shot once the game is
// up. Call once from main.js after the world and all systems exist.
export function setupShots(game) {
  activeGame = game;
  if (typeof window !== 'undefined') window.__shotReady = false;
  if (typeof window === 'undefined' || !window.location) return;
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return;
  const seedParam = parseInt(params.get('seed') || '1', 10);
  activeSeed = Number.isFinite(seedParam) ? seedParam : 1;
  if (typeof window !== 'undefined') window.__shotSeed = activeSeed;
  // Defer one frame so the first render has happened before staging.
  // Fail open: if staging throws, still signal ready (after clearing
  // transients) so the screenshot harness never hangs on a dead frame.
  requestAnimationFrame(() => {
    runShot(shot).catch(() => {
      if (game.hud && typeof game.hud.clearTransients === 'function') game.hud.clearTransients();
      if (typeof window !== 'undefined') window.__shotReady = true;
    });
  });
}
