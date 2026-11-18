// SOLMAR CITY — open-world crime game set in a sun-soaked coastal city.
// Architecture: this file is a thin orchestrator. It builds the shared `game`
// object (renderer, scene, state, event bus), instantiates every system and
// entity, then runs the fixed-order game loop. All gameplay logic lives in
// the systems/ and entities/ modules; all presentation in hud/. The city,
// sky and ocean come from world/. Everything is seeded and deterministic:
// the same ?seed= value reproduces the same world, traffic and pedestrians.
import * as THREE from 'three';
import { MissionManager } from './systems/missions.js';
import { Wanted } from './systems/wanted.js';
import { Combat } from './systems/combat.js';
import { Shop } from './systems/shop.js';
import { Rep } from './systems/rep.js';
import { Collectibles } from './systems/collectibles.js';
import { SideJobs } from './systems/sidejobs.js';
import { Pickups } from './systems/pickups.js';
import { Effects } from './systems/effects.js';
import { Audio } from './systems/audio.js';
import { Save } from './systems/save.js';
import { Player } from './entities/player.js';
import { VehicleManager } from './entities/vehicles.js';
import { Traffic } from './entities/traffic.js';
import { Pedestrians } from './entities/pedestrians.js';
import { Police } from './entities/police.js';
import { Helicopter } from './entities/helicopter.js';
import { Hostiles } from './entities/hostiles.js';
import { NavGraph } from './entities/graph.js';
import { HUD } from './hud/hud.js';
import { Menus } from './hud/menus.js';
import { Radar } from './hud/radar.js';
import { ResponsePanel } from './hud/response.js';
import { buildCity } from './world/city.js';
import { Sky } from './world/sky.js';
import { makeTextures } from './world/textures.js';
import { RoadGraph } from './world/roadgraph.js';
import { CITY_DATA } from './data/city.js';
import { MISSIONS } from './data/missions.js';
import { VEHICLES } from './data/vehicles.js';
import { CHARACTERS } from './data/people.js';
import { RADIO_STATIONS } from './data/radio.js';
import { CONFIG } from './config.js';
import { RNG } from './random.js';
import { Input } from './input.js';
import { setupShots } from './shots.js';

// Boot the game: renderer, world, systems, entities, HUD, then the loop.
export async function startGame() {
  const params = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(params.get('seed') || String(CONFIG.seed), 10) || CONFIG.seed;
  const shotMode = params.has('shot');

  const container = document.getElementById('game-container') || document.body;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.quality.high.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xff9a3d);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2400);
  camera.position.set(0, 24, 40);

  const game = {
    scene,
    camera,
    renderer,
    clock: new THREE.Clock(),
    rng: new RNG(seed),
    input: new Input(renderer.domElement),
    state: createState(),
    events: new EventBus(),
    roadGraph: new RoadGraph(),
    navGraph: new NavGraph(),
    textures: makeTextures(),
    catalog: { city: CITY_DATA, missions: MISSIONS, vehicles: VEHICLES, characters: CHARACTERS, radio: RADIO_STATIONS },
    shotMode,
    cameraOverride: false,
    quality: 'high',
  };
  game.state.settings.quality = 'high';

  // Heavy world build, yielding to the main thread around it so the title
  // screen stays responsive (performance guide: break up long tasks).
  await yieldToMain();
  game.city = buildCity(scene, game.rng.fork(3));
  game.sky = new Sky(scene);
  await yieldToMain();

  game.missions = new MissionManager(game);
  game.wanted = new Wanted(game);
  game.combat = new Combat(game);
  game.shop = new Shop(game);
  game.rep = new Rep(game);
  game.collectibles = new Collectibles(game);
  game.sidejobs = new SideJobs(game);
  game.pickups = new Pickups(game);
  game.effects = new Effects(game);
  game.audio = new Audio(game);
  game.save = new Save(game);

  game.player = new Player(game);
  game.vehicles = new VehicleManager(game);
  game.traffic = new Traffic(game);
  game.pedestrians = new Pedestrians(game);
  game.police = new Police(game);
  game.helicopter = new Helicopter(game);
  game.hostiles = new Hostiles(game);

  game.hud = new HUD(game);
  game.radar = new Radar(game);
  game.menus = new Menus(game);
  game.response = new ResponsePanel(game);

  // Spawn the player at the authored start (Founders Plaza) instead of
  // the (0, 0) default the Player constructor uses.
  game.player.teleport(CITY_DATA.playerSpawn.x, CITY_DATA.playerSpawn.z);

  wireMenuHooks(game);
  game.events.on('interact', ({ x, z }) => handleInteract(game, x, z));

  // Screenshot freeze: pin quality to 'high' and pause the sim at the
  // exact frame shots.js calls this, so the captured image is
  // byte-identical across runs (cruisers, water, clouds and the adaptive
  // quality flip would otherwise drift it frame to frame).
  game.freezeForShot = () => {
    applyQuality(game, 'high');
    game.state.paused = true;
  };

  game.shots = setupShots(game);

  window.__game = game;
  window.__state = game.state;
  window.__shotReady = false;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Adaptive quality: count real frames over the first seconds, then
  // degrade once if the machine cannot hold the frame-rate threshold.
  // Wall-clock frames-per-second is the honest signal: averaging 1/dt is
  // skewed by a single fast frame (one 14 ms frame among 500 ms frames
  // lifts the mean above the threshold even at ~2 real fps).
  let frameCount = 0;
  let qualityChecked = false;
  const sampleStart = performance.now();
  const checkQuality = () => {
    if (qualityChecked) return;
    // Shot pages pin their own quality at freeze time; never degrade a
    // staged frame mid-capture.
    if (game.shotCamera) return;
    const elapsed = (performance.now() - sampleStart) / 1000;
    if (elapsed < CONFIG.quality.fpsSampleSeconds) return;
    qualityChecked = true;
    const avgFps = frameCount / Math.max(elapsed, 0.001);
    if (avgFps < CONFIG.quality.fpsThreshold) applyQuality(game, 'low');
  };

  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(0, 24, 40);

  const loop = () => {
    requestAnimationFrame(loop);
    // Background tabs get no frames from rAF anyway; skip work if hidden.
    if (document.hidden) return;
    const dt = Math.min(game.clock.getDelta(), 0.05);
    frameCount++;
    checkQuality();

    const { state } = game;
    if (!state.paused) {
      state.stats.timePlayed += dt;
      state.timeOfDay += dt * CONFIG.time.hoursPerSecond;
      if (state.timeOfDay >= 24) {
        state.timeOfDay -= 24;
        state.day += 1;
      }
      game.sky.setTimeOfDay(state.timeOfDay);
      game.sky.update(dt);
      game.city.update(dt);
      game.city.ocean.uniforms.uSunDir.value.copy(game.sky.sunPosition);

      game.player.update(dt);
      game.vehicles.update(dt);
      game.traffic.update(dt);
      game.pedestrians.update(dt);
      game.police.update(dt);
      game.helicopter.update(dt);
      game.hostiles.update(dt);
      game.wanted.decay(dt);
      game.missions.update(dt);
      if (game.combat.update) game.combat.update(dt);
      game.pickups.update(dt);
      game.collectibles.update(dt);
      game.sidejobs.update(dt);
      game.save.update(dt);
      game.effects.update(dt);
      game.audio.update(dt);
      game.hud.update(dt);
      game.radar.update(dt);
      const units = game.police.units();
      // The response panel adds its own helicopter row; main.js used to
      // push a second one (SKYHAWK-1), which duplicated the heli line.
      game.response.update(units.toSorted((a, b) => a.distance - b.distance));

      const pp = game.player.position();
      state.playerPos.x = pp.x;
      state.playerPos.z = pp.z;
      // Screenshot freeze: the loop counts its own updates, so the frozen
      // sim state is identical on every load no matter how rAF callbacks
      // interleave (a frame-count wait in shots.js could land ±1 update
      // off, shifting water/clouds by a few pixels between captures).
      if (game.freezeAfterUpdates !== undefined) {
        game.freezeAfterUpdates -= 1;
        if (game.freezeAfterUpdates <= 0) {
          game.freezeAfterUpdates = undefined;
          game.freezeForShot();
        }
      }
    }

    // Global keys work while paused too (pause toggle, map, radio), so
    // they run outside the gameplay block. Edges clear at the end of the
    // frame, after every system has seen them.
    handleGlobalKeys(game);

    updateCamera(game, camTarget, camPos, dt);
    // Screenshot staging publishes a fixed camera; honour it every frame
    // so nothing (chase cam, shake) can drift the framing afterwards.
    if (game.shotCamera && game.camera) {
      const shot = game.shotCamera;
      game.camera.position.set(shot.position[0], shot.position[1], shot.position[2]);
      game.camera.lookAt(shot.lookAt[0], shot.lookAt[1], shot.lookAt[2]);
    }
    renderer.render(scene, camera);
    // Edges clear at the end of the frame so every system saw this frame's
    // presses. (Input is listed first in the contract's loop order, but
    // clearing before the reads would drop every edge.)
    game.input.update();
  };
  requestAnimationFrame(loop);

  game.menus.showTitle();
  return game;
}

// Menu hooks the Menus class calls (game.startNewGame / continueGame /
// quitToTitle). Systems keep a reference to the state object itself, so a
// reset mutates that object in place instead of replacing it.
function wireMenuHooks(game) {
  game.startNewGame = () => {
    resetState(game);
    game.save.clearSave();
    game.collectibles?.reset?.();
    game.pickups?.reset?.();
    game.sidejobs?.cancel?.();
    if (game.state.playerInVehicle) game.vehicles.exit();
    game.wanted?.clearWanted?.();
    game.police?.clearPursuit?.();
    game.helicopter?.dismiss?.();
    game.hostiles?.clear?.();
    if (game.missions) {
      game.missions._lastMissionId = null;
      game.missions._chaseTarget = null;
    }
    game.player.health = 100;
    game.player.inVehicle = null;
    if (game.player.mesh) game.player.mesh.visible = true;
    game.player.teleport(CONFIG.player.spawn.x, CONFIG.player.spawn.z);
    game.menus.hideAll();
    game.state.paused = false;
  };

  game.continueGame = () => {
    game.save.load();
    // A loaded save has no active mission, so clear anything the previous
    // session left behind in the world.
    game.hostiles?.clear?.();
    game.sidejobs?.cancel?.();
    game.menus.hideAll();
    game.state.paused = false;
  };

  game.quitToTitle = () => {
    try {
      game.save.save();
    } catch (err) {
      // A failed save must never block quitting to the title screen.
    }
    game.menus.showTitle();
  };
}

// Fresh state, written into the existing shared object field by field.
function resetState(game) {
  const fresh = createState();
  const state = game.state;
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
  if (game.rep) game.rep.sync();
}

// Keys handled at the orchestrator level: pause (P / Esc), full map (M),
// radio station (R). Runs every frame, paused or not; dialogs own their
// own Esc handling via cancel guards (see menus.js), which consume the
// edge so this handler never reopens a menu the guard just closed.
function handleGlobalKeys(game) {
  const { input, state } = game;
  if (!input) return;
  const anyDialogOpen = () => Boolean(document.querySelector('dialog[open]'));
  const mapOpen = Boolean(game.radar?.mapOpen);
  if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
    if (mapOpen) {
      game.radar.closeMap();
    } else if (document.getElementById('pause-menu')?.open) {
      game.menus.hidePause();
    } else if (!anyDialogOpen()) {
      game.menus.showPause();
    }
  }
  if (input.wasPressed('KeyM')) {
    if (!state.paused || mapOpen) game.radar?.toggleMap?.();
  }
  if (input.wasPressed('KeyR') && !state.paused) {
    const next = (state.radioStation + 1) % RADIO_STATIONS.length;
    game.audio?.setStation?.(next);
  }
}

// The E key (emitted by Player as 'interact'): the nearest usable thing
// within range wins — shop, mission giver, taxi stand, or race start.
// Story missions block side jobs, so taxi/race/mission starts are refused
// while one is active; the shop stays usable.
function handleInteract(game, x, z) {
  const state = game.state;
  if (state.paused) return;
  let best = null;
  const consider = (dist, action) => {
    if (dist < 9 && (!best || dist < best.dist)) best = { dist, action };
  };
  for (const shop of CITY_DATA.shops || []) {
    consider(Math.hypot(shop.x - x, shop.z - z), () => {
      game.menus.showShop(game.shop.items());
    });
  }
  if (!state.mission) {
    for (const def of MISSIONS) {
      if (game.missions.isPassed(def.id) || game.missions.isLocked(def)) continue;
      consider(
        Math.hypot(def.startPos.x - x, def.startPos.z - z),
        () => game.missions.startMission(def.id),
      );
    }
    for (const stand of CITY_DATA.taxiStands || []) {
      consider(
        Math.hypot(stand.x - x, stand.z - z),
        () => game.sidejobs.startFare(stand.id),
      );
    }
    const race = CITY_DATA.raceStart;
    if (race) {
      consider(
        Math.hypot(race.x - x, race.z - z),
        () => game.sidejobs.startRace(),
      );
    }
  }
  if (best) best.action();
}

// The single mutable state object shared by every system (contract section 2).
function createState() {
  return {
    money: CONFIG.economy.startMoney,
    health: 100,
    armour: 0,
    ammo: { pistol: 48, carbine: 120, shotgun: 24 },
    weapon: 'pistol',
    wanted: 0,
    heat: 0,
    rep: 0,
    repTier: 1,
    shells: 0,
    shellsCollected: [],
    completion: 0,
    stats: { carsStolen: 0, copsLost: 0, timePlayed: 0, missionsPassed: 0, shotsFired: 0, nearMiss: 0, drifts: 0 },
    mission: null,
    timeOfDay: CONFIG.time.startHour,
    day: 1,
    playerInVehicle: null,
    playerPos: { x: 0, z: 0 },
    paused: false,
    muted: false,
    radioOn: true,
    radioStation: 0,
    settings: { radarNorthUp: false, showSpeed: true, quality: 'high' },
    unlocks: { nitro: false, shotgun: false, supercar: false, m7: false },
    flags: {},
  };
}

// Minimal event bus for cross-system communication (crime, missionPassed...).
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }

  off(name, fn) {
    this.listeners.get(name)?.delete(fn);
  }

  emit(name, data) {
    for (const fn of this.listeners.get(name) || []) fn(data);
  }
}

// Yield to the main thread with the modern API and a setTimeout fallback.
async function yieldToMain() {
  if (typeof window !== 'undefined' && 'scheduler' in window && 'yield' in window.scheduler) {
    await window.scheduler.yield();
    return;
  }
  await new Promise((resolve) => { setTimeout(resolve, 0); });
}

// Apply a quality preset: pixel ratio, shadows, palm density, fog distance.
function applyQuality(game, level) {
  const preset = CONFIG.quality[level];
  if (!preset) return;
  game.quality = level;
  game.state.settings.quality = level;
  game.renderer.setPixelRatio(preset.pixelRatio);
  game.renderer.shadowMap.enabled = preset.shadows;
  game.sky.sun.castShadow = preset.shadows;
  game.scene.traverse((obj) => {
    if (obj.material) obj.material.needsUpdate = true;
  });
  game.city.setPalmScale(preset.palmScale);
  game.sky.fogDensityOverride = level === 'low' ? preset.fogDensity : null;
}

// Third-person chase camera. Screenshots set game.cameraOverride (or run in
// ?shot= mode) and drive the camera themselves.
function updateCamera(game, camTarget, camPos, dt) {
  if (game.cameraOverride || game.shotMode) return;
  const focus = game.state.playerInVehicle?.mesh || game.player.mesh;
  if (!focus) return;
  camTarget.copy(focus.position);
  const yaw = focus.rotation.y;
  const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const desired = camTarget.clone()
    .addScaledVector(back, CONFIG.player.cameraDistance)
    .add(new THREE.Vector3(0, CONFIG.player.cameraHeight, 0));
  const k = 1 - Math.exp(-CONFIG.player.cameraLerp * dt);
  camPos.lerp(desired, k);
  game.camera.position.copy(camPos);
  game.camera.lookAt(camTarget.x, camTarget.y + 2, camTarget.z);
}

startGame().catch((err) => {
  console.error('Solmar City failed to start', err);
});
