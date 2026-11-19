// Screenshot staging: reads ?shot=<name>&seed=<n> from the URL, stages a
// deterministic game state for one of four shots, lets exactly three game
// updates run so entities settle, then freezes the frame and marks
// window.__shotReady so the capture harness can take the screenshot.
// main.js applies game.shotCamera every frame and calls shots.update(dt)
// from the game loop. A timed fallback finalizes the shot if the loop
// hook is ever missing, so a shot can never hang the harness.
//
// Camera convention: meshes face local +Z (the vehicle physics moves a car
// along +Z at heading 0 and the headlights sit on the +Z end), so "behind"
// a vehicle or the player is its local -Z side. Shot cameras are plain
// {x, y, z} objects; main.js converts them to world space each frame.

import { RNG } from './random.js';
import { CITY_DATA } from './data/city.js';
import { MISSIONS } from './data/missions.js';

const SHOT_NAMES = ['chase', 'street', 'race', 'combat'];
const SETTLE_UPDATES = 3;

let activeGame = null;
let controller = null;

function districtCenter(name) {
  const districts = CITY_DATA.districts || [];
  const found = districts.find((d) => d.name === name);
  const b = found ? (found.bounds || found) : null;
  if (b && typeof b.minX === 'number') {
    return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  }
  return { x: 0, z: 0 };
}

function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

class ShotController {
  constructor(game) {
    this.game = game;
    this.current = null;
    this._frames = 0;
    this._armed = false;
    this._finalized = false;
    this._fallbackTimer = null;
  }

  // Called from the main loop every frame while a shot is armed.
  update() {
    if (!this._armed || this._finalized) return;
    this._frames += 1;
    if (this._frames >= SETTLE_UPDATES) this.finalize();
  }

  runShot(name) {
    if (!SHOT_NAMES.includes(name)) return false;
    this.stageShot(name);
    this.current = name;
    this._frames = 0;
    this._armed = true;
    this._finalized = false;
    if (this._fallbackTimer) clearTimeout(this._fallbackTimer);
    this._fallbackTimer = setTimeout(() => this.finalize(), 2500);
    return true;
  }

  stageShot(name) {
    const game = this.game;
    const state = game.state;
    state.paused = false;
    // The shot owns the camera from here on: main.js only applies
    // game.shotCamera while cameraOverride is true, so set it — without
    // this flag the chase camera would keep following the player.
    game.cameraOverride = true;
    game.shotCamera = null;
    if (game.hud) game.hud.clearTransients();
    if (name === 'chase') this._stageChase();
    else if (name === 'street') this._stageStreet();
    else if (name === 'race') this._stageRace();
    else if (name === 'combat') this._stageCombat();
    if (game.hud) game.hud.update(0);
    if (game.radar) game.radar.drawMinimap();
  }

  finalize() {
    if (this._finalized) return;
    this._finalized = true;
    this._armed = false;
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
    const game = this.game;
    if (game.hud) game.hud.clearTransients();
    // Final touches are applied AFTER clearing transients, so the staged
    // popup and damage number survive into the captured frame.
    if (this.current === 'race' && game.hud) {
      game.hud.showEventPopup('DRIFT +$250');
    }
    if (this.current === 'combat' && game.hud) {
      game.hud.addDamageNumber('-24', 58, 40);
      if (game.effects && typeof game.effects.muzzleFlash === 'function') {
        const pos = game.state.playerPos || { x: 0, z: 0 };
        try {
          game.effects.muzzleFlash({ x: pos.x, y: 1.4, z: pos.z });
        } catch (err) {
          // Decorative only.
        }
      }
    }
    // Freeze gameplay; the renderer keeps drawing the frozen frame.
    game.state.paused = true;
    game.shotFrozen = true;
    window.__shotReady = true;
  }

  _setTime(hours) {
    this.game.state.timeOfDay = hours;
    if (this.game.sky && typeof this.game.sky.setTimeOfDay === 'function') {
      this.game.sky.setTimeOfDay(hours);
    }
  }

  _placePlayer(x, z, heading) {
    const game = this.game;
    const player = game.player;
    if (player && typeof player.teleport === 'function') {
      player.teleport(x, z);
    } else if (player && player.mesh) {
      player.mesh.position.set(x, 0, z);
    }
    if (player && player.mesh) player.mesh.rotation.y = heading || 0;
    game.state.playerPos = { x, z };
  }

  _exitVehicle() {
    const game = this.game;
    if (game.state.playerInVehicle && game.vehicles && typeof game.vehicles.exit === 'function') {
      game.vehicles.exit();
    }
    game.state.playerInVehicle = null;
  }

  // Put the player into a freshly spawned car. playerInVehicle holds the
  // Vehicle object itself (never a boolean) so HUD and physics read speed
  // and NOS from it.
  _putPlayerInCar(type, x, z, heading) {
    const game = this.game;
    this._exitVehicle();
    const vehicle = game.vehicles.spawn(type, x, z);
    if (vehicle && vehicle.mesh) vehicle.mesh.rotation.y = heading || 0;
    if (vehicle) {
      vehicle.nos = 100;
      if (typeof vehicle.health === 'number') vehicle.health = 100;
    }
    game.vehicles.enter(vehicle);
    game.state.playerInVehicle = vehicle;
    game.state.playerPos = { x, z };
    return vehicle;
  }

  _startMission(id) {
    const game = this.game;
    if (game.missions && typeof game.missions.startMission === 'function') {
      try {
        game.missions.startMission(id);
        return true;
      } catch (err) {
        // Fall through to the manual mission object below.
      }
    }
    const def = missionById(id);
    const fallback = {
      id,
      name: def ? def.name : id,
      status: 'active',
      objectiveIndex: 0,
      timer: 0,
      objectives: def ? def.objectives : [],
    };
    fallback.data = {};
    game.state.mission = fallback;
    return false;
  }

  _stageChase() {
    const game = this.game;
    const state = game.state;
    const downtown = districtCenter('Downtown');
    this._setTime(16.5);
    state.money = 2450;
    state.health = 100;
    state.armour = 50;
    state.rep = 320;
    state.repTier = 3;
    state.shells = 7;
    state.completion = 34;
    state.weapon = 'pistol';
    if (!state.unlocks) state.unlocks = {};
    state.unlocks.nitro = true;
    this._startMission('M2');
    const carX = downtown.x;
    const carZ = downtown.z + 20;
    const heading = Math.PI;
    this._putPlayerInCar('Vento GT', carX, carZ, heading);
    if (game.wanted && typeof game.wanted.setWanted === 'function') {
      game.wanted.setWanted(3);
    } else {
      state.wanted = 3;
    }
    if (game.police && typeof game.police.spawnForWanted === 'function') {
      game.police.spawnForWanted(3);
    }
    // Cruisers spawn 40-80 m away at random angles, usually out of
    // frame: stage all three ON the road ahead of the player car so the
    // pursuit reads in the shot (left flank, right mid, centre far).
    if (game.police && Array.isArray(game.police.cruisers)) {
      const spots = [
        { x: carX - 6, z: carZ - 6 },
        { x: carX + 6, z: carZ - 26 },
        { x: carX - 1, z: carZ - 36 },
      ];
      game.police.cruisers.forEach((unit, i) => {
        const spot = spots[i % spots.length];
        const vehicle = unit && unit.vehicle;
        if (!vehicle || !vehicle.mesh) return;
        vehicle.mesh.position.set(spot.x, 0, spot.z);
        vehicle.mesh.rotation.y = heading;
        vehicle.heading = heading;
        vehicle.speed = 0;
        unit.status = 'PURSUIT';
      });
    }
    // Helicopter large, bright, and high in the frame: over the road
    // ahead-left of the player car so it lands in the upper third,
    // clear of the buildings (the first staging put it at x+14, inside
    // the east block, where the tower hid it entirely).
    if (game.helicopter) {
      if (typeof game.helicopter.spawn === 'function') game.helicopter.spawn();
      if (game.helicopter.mesh) {
        game.helicopter.mesh.position.set(carX - 5, 21, carZ - 24);
        game.helicopter.mesh.rotation.y = heading;
      }
      if (typeof game.helicopter.holdPosition === 'function') game.helicopter.holdPosition();
    }
    // Camera looks slightly up (lookAt y 10) so the helicopter clears
    // the top of the frame's upper third while the player car stays in
    // the lower third.
    game.shotCamera = {
      position: { x: carX - 2, y: 7, z: carZ + 16 },
      lookAt: { x: carX + 2, y: 10, z: carZ - 35 },
    };
  }

  _stageStreet() {
    const game = this.game;
    const state = game.state;
    const downtown = districtCenter('Downtown');
    this._setTime(12);
    state.money = 1250;
    state.health = 100;
    state.armour = 0;
    state.rep = 180;
    state.repTier = 2;
    state.shells = 3;
    state.completion = 18;
    state.weapon = 'pistol';
    state.mission = null;
    if (game.wanted && typeof game.wanted.clearWanted === 'function') game.wanted.clearWanted();
    state.wanted = 0;
    if (game.police && typeof game.police.clearPursuit === 'function') game.police.clearPursuit();
    if (game.helicopter && typeof game.helicopter.dismiss === 'function') game.helicopter.dismiss();
    // On foot on the sidewalk: offset from the road center into the
    // pedestrian strip so peds, traffic, and a bus share the frame.
    const px = downtown.x + 14;
    const pz = downtown.z + 6;
    this._exitVehicle();
    this._placePlayer(px, pz, -Math.PI / 2);
    game.shotCamera = {
      position: { x: px + 12, y: 4.5, z: pz + 12 },
      lookAt: { x: px - 6, y: 1.2, z: pz - 10 },
    };
  }

  _stageRace() {
    const game = this.game;
    const state = game.state;
    const start = CITY_DATA.raceStart || districtCenter('Harbor');
    this._setTime(17);
    state.money = 3100;
    state.health = 100;
    state.armour = 25;
    state.rep = 420;
    state.repTier = 3;
    state.shells = 9;
    state.completion = 41;
    state.weapon = 'pistol';
    if (!state.unlocks) state.unlocks = {};
    state.unlocks.nitro = true;
    state.wanted = 0;
    this._startMission('M2');
    if (state.mission) state.mission.timer = 74;
    const heading = Math.PI / 2;
    this._putPlayerInCar('Vento GT', start.x, start.z, heading);
    // The car faces east (+X) down the z=210 straight toward the first
    // checkpoint, so the camera sits behind it (west) and looks east:
    // car in the lower third, open road and checkpoints ahead.
    game.shotCamera = {
      position: { x: start.x - 14, y: 6, z: start.z + 8 },
      lookAt: { x: start.x + 34, y: 1.5, z: start.z - 6 },
    };
  }

  _stageCombat() {
    const game = this.game;
    const state = game.state;
    const def = missionById('M3');
    const start = (def && def.startPos) || districtCenter('Harbor');
    this._setTime(15);
    state.money = 1800;
    state.health = 62;
    state.armour = 0;
    state.rep = 260;
    state.repTier = 3;
    state.shells = 5;
    state.completion = 27;
    state.weapon = 'carbine';
    if (state.ammo) state.ammo.carbine = 87;
    state.wanted = 0;
    this._startMission('M3');
    const px = start.x;
    const pz = start.z;
    this._exitVehicle();
    this._placePlayer(px, pz, Math.PI);
    const spots = [
      { x: px - 6, z: pz - 14 },
      { x: px + 4, z: pz - 18 },
      { x: px + 10, z: pz - 12 },
    ];
    if (game.hostiles && typeof game.hostiles.spawn === 'function') {
      try {
        game.hostiles.spawn(3, spots, { hp: 100 });
      } catch (err) {
        // Hostiles are decorative for the shot; continue without them.
      }
    }
    game.shotCamera = {
      position: { x: px - 1, y: 4.5, z: pz + 9 },
      lookAt: { x: px + 2, y: 1.3, z: pz - 16 },
    };
  }
}

// Wire shots into a built game object. Reads the URL parameters and arms
// the requested shot immediately. Returns the controller (main.js calls
// controller.update(dt) every frame and applies game.shotCamera).
export function setupShots(game) {
  activeGame = game;
  controller = new ShotController(game);
  game.shots = controller;
  window.__shotReady = false;
  let params = null;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (err) {
    params = null;
  }
  if (params) {
    const seed = parseInt(params.get('seed') || '', 10);
    if (Number.isFinite(seed)) {
      try {
        game.rng = new RNG(seed);
      } catch (err) {
        // Keep the existing RNG; the shot still stages deterministically.
      }
    }
    const shot = params.get('shot');
    if (shot && SHOT_NAMES.includes(shot)) controller.runShot(shot);
  }
  return controller;
}

export function runShot(name) {
  if (!controller) return false;
  return controller.runShot(name);
}

export function stageShot(name) {
  if (!controller) return false;
  if (!SHOT_NAMES.includes(name)) return false;
  controller.stageShot(name);
  controller.current = name;
  return true;
}
