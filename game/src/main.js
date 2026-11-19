// Solmar City — thin orchestrator. This file builds the world, wires every
// system and entity together, and runs the game loop; it holds no gameplay
// logic of its own. Systems own the rules (missions, wanted, combat, shop,
// rep, collectibles, side jobs, pickups, effects, audio, save), entities own
// the actors (player, vehicles, traffic, pedestrians, police, helicopter,
// hostiles), the HUD owns the screen (hud, menus, radar, response), and the
// world owns the city (buildCity, sky, textures, road graph). One shared
// `game` object and one mutable `state` object connect them all, plus a tiny
// event bus for cross-system signals (crime, mission passed, interact).
// The loop clamps dt to 0.05 s, updates systems in a fixed order, renders,
// and calls input.update() at the END of the frame so edge detection is exact.

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
import { Audio as GameAudio } from './systems/audio.js';
import { Save, saveGame, loadGame } from './systems/save.js';
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
import { RoadGraph } from './world/roadgraph.js';
import { CITY_DATA } from './data/city.js';
import { MISSIONS } from './data/missions.js';
import { CONFIG } from './config.js';
import { RNG } from './random.js';
import { Input } from './input.js';
import { setupShots } from './shots.js';

function startGame() {
  // ---- renderer, scene, camera ------------------------------------------
  const container = document.getElementById('game-container') ?? document.body;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    container.textContent = 'WebGL is not available in this browser, so Solmar City cannot start.';
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5d6);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(35, 12, -22);

  // ---- shared state + event bus ------------------------------------------
  const state = createInitialState();
  const events = createEventBus();
  const rng = new RNG(CONFIG.seed);
  const input = new Input(window);

  const game = {
    scene,
    camera,
    renderer,
    clock: new THREE.Clock(),
    rng,
    input,
    state,
    events,
    city: null,
    sky: null,
    roadGraph: null,
    navGraph: null,
    player: null,
    vehicles: null,
    traffic: null,
    pedestrians: null,
    police: null,
    helicopter: null,
    hostiles: null,
    wanted: null,
    missions: null,
    combat: null,
    effects: null,
    audio: null,
    save: null,
    shop: null,
    rep: null,
    collectibles: null,
    sidejobs: null,
    pickups: null,
    hud: null,
    radar: null,
    menus: null,
    response: null,
    shots: null,
    // Screenshot staging: shots.js sets cameraOverride + shotCamera.
    cameraOverride: false,
    shotCamera: null,
    started: false,
  };

  // ---- world ---------------------------------------------------------------
  game.city = buildCity(scene, rng);
  game.sky = new Sky(scene);
  game.sky.setTimeOfDay(state.timeOfDay);
  game.roadGraph = new RoadGraph(CITY_DATA);
  game.navGraph = new NavGraph(CITY_DATA);

  // ---- systems + entities (game is passed to every constructor) ------------
  game.wanted = new Wanted(game);
  game.missions = new MissionManager(game);
  game.combat = new Combat(game);
  game.shop = new Shop(game);
  game.rep = new Rep(game);
  game.collectibles = new Collectibles(game);
  game.sidejobs = new SideJobs(game);
  game.pickups = new Pickups(game);
  game.effects = new Effects(game);
  game.audio = new GameAudio(game);
  game.save = new Save(game);
  game.player = new Player(game);
  game.vehicles = new VehicleManager(game);
  game.traffic = new Traffic(game);
  game.pedestrians = new Pedestrians(game);
  game.police = new Police(game);
  game.helicopter = new Helicopter(game);
  game.hostiles = new Hostiles(game);
  game.hud = new HUD(game);
  game.menus = new Menus(game);
  game.radar = new Radar(game);
  game.response = new ResponsePanel(game);

  // ---- menu hooks + global actions -----------------------------------------
  game.resetState = () => resetState(game);
  game.teleportToSpawn = () => teleportToSpawn(game);
  game.startNewGame = () => {
    resetState(game);
    game.save.clearSave();
    game.menus.hideAll();
    game.started = true;
    state.paused = false;
    teleportToSpawn(game);
    game.hud.showSubtitle('Welcome to Solmar City. Find Marco to start your first job.', 5);
  };
  game.continueGame = () => {
    const loaded = loadGame(game);
    if (!loaded) return false;
    game.menus.hideAll();
    game.started = true;
    state.paused = false;
    teleportToSpawn(game);
    return true;
  };
  game.quitToTitle = () => {
    scheduleBackground(() => saveGame(game));
    game.started = false;
    state.paused = true;
    game.menus.showTitle();
  };
  game.pauseGame = () => {
    if (!game.started) return;
    state.paused = true;
    game.menus.showPause();
  };
  game.resumeGame = () => {
    game.menus.hidePause();
    state.paused = false;
  };

  // Global keys: pause, map, radio, weapons. Gameplay keys live in input.js + systems.
  window.addEventListener('keydown', (e) => handleGlobalKeys(game, e));
  // Interact key: the SINGLE E path. Every system that reacts to E subscribes
  // to this event (see handleInteract below); player.js must NOT also emit it,
  // or one press would fire twice. E works while driving too.
  window.addEventListener('keydown', (e) => {
    if (e.code !== CONFIG.keys.interact || e.repeat) return;
    if (!game.started || state.paused) return;
    game.events.emit('interact', { x: state.playerPos.x, z: state.playerPos.z });
  });
  game.events.on('interact', (data) => handleInteract(game, data));
  // Getting busted: the mission manager already fails the mission silently on
  // this event; here the police let go, the player is dropped at PD HQ, and
  // the BUSTED screen takes over.
  game.events.on('busted', () => {
    if (state.playerInVehicle) game.vehicles.exit();
    game.wanted.clearWanted();
    game.police.clearPursuit();
    game.helicopter.dismiss();
    const pdhq = (CITY_DATA.shops || []).find((s) => s.type === 'police');
    const drop = pdhq ? { x: pdhq.x + 18, z: pdhq.z } : CONFIG.city.spawn;
    game.player.teleport(drop.x, drop.z);
    game.menus.showBusted();
  });
  // Pause the simulation when the tab is hidden (battery + CPU: the guide's
  // efficient-background-processing pattern, via the visibility API).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.started && !state.paused) game.pauseGame();
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- test hooks + screenshots --------------------------------------------
  window.__game = game;
  window.__state = state;
  window.__shotReady = false;
  game.shots = setupShots(game);

  // Title screen first; the loop renders behind it. Screenshot staging
  // (?shot=...) skips the title entirely: the shot owns the screen and the
  // game must already be running when the shot stages its state.
  const shotParam = new URLSearchParams(window.location.search).get('shot');
  if (shotParam) {
    game.menus.hideAll();
    game.started = true;
    state.paused = false;
  } else {
    game.menus.showTitle();
  }

  // ---- adaptive quality: sample FPS over the first seconds of play ---------
  // The sampling window is WALL-CLOCK time (performance.now), not summed
  // dt: dt is clamped to 0.05 s, so on a slow machine a dt-based window
  // would take far longer than five real seconds to fill — exactly when
  // the quality cut is needed most. This only measures speed; it never
  // touches gameplay state, so determinism is unaffected.
  const quality = { frames: 0, startedAt: 0, decided: false };
  function adaptQuality() {
    if (quality.decided || !game.started || state.paused) return;
    if (quality.startedAt === 0) quality.startedAt = performance.now();
    quality.frames++;
    const elapsed = (performance.now() - quality.startedAt) / 1000;
    if (elapsed < CONFIG.quality.sampleSeconds) return;
    quality.decided = true;
    const fps = quality.frames / elapsed;
    if (fps < CONFIG.quality.lowFpsThreshold) {
      renderer.setPixelRatio(CONFIG.quality.lowPixelRatio);
      renderer.shadowMap.enabled = false;
      scene.traverse((obj) => {
        if (obj.material) obj.material.needsUpdate = true;
      });
      game.city.setPalmScale(CONFIG.quality.lowPalmScale);
      state.settings.quality = 'low';
    } else if (fps < CONFIG.quality.mediumFpsThreshold) {
      renderer.setPixelRatio(CONFIG.quality.mediumPixelRatio);
      game.city.setPalmScale(CONFIG.quality.mediumPalmScale);
      state.settings.quality = 'medium';
    }
  }

  // ---- chase camera ----------------------------------------------------------
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(35, 12, -22);
  const lookAt = new THREE.Vector3();
  function updateCamera(dt) {
    // Screenshot staging owns the camera when a shot is active.
    if (game.cameraOverride && game.shotCamera) {
      if (typeof game.shotCamera === 'function') {
        game.shotCamera(game, dt);
      } else {
        if (game.shotCamera.position) camera.position.copy(game.shotCamera.position);
        // lookAt takes a Vector3 or three numbers — NOT a plain {x, y, z}
        // object: three.js reads .isVector3, treats the object as the x
        // number, and produces a NaN quaternion (all four v4 shots came
        // out as empty sky until this was fixed). Pass the numbers.
        if (game.shotCamera.lookAt) {
          const t = game.shotCamera.lookAt;
          camera.lookAt(t.x, t.y, t.z);
        }
      }
      return;
    }
    const mesh = game.player.mesh;
    const px = mesh ? mesh.position.x : state.playerPos.x;
    const pz = mesh ? mesh.position.z : state.playerPos.z;
    const heading = mesh ? mesh.rotation.y : 0;
    const driving = state.playerInVehicle;
    const speed = driving ? Math.abs(state.playerInVehicle.speed || 0) : 0;
    const dist = driving ? 10 + speed * 0.03 : 8.5;
    const height = driving ? 4.6 : 4.2;
    camTarget.set(px - Math.sin(heading) * dist, height, pz - Math.cos(heading) * dist);
    const k = 1 - Math.exp(-dt * 5);
    camPos.lerp(camTarget, k);
    camera.position.copy(camPos);
    lookAt.set(px, 1.6, pz);
    camera.lookAt(lookAt);
  }

  // ---- main loop -------------------------------------------------------------
  let lastSkyHour = state.timeOfDay;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(game.clock.getDelta(), 0.05);
    if (!state.paused) {
      // Day clock: game hours advance in real time; day rolls at midnight.
      state.timeOfDay += dt * CONFIG.world.hoursPerSecond;
      if (state.timeOfDay >= 24) {
        state.timeOfDay -= 24;
        state.day++;
      }
      if (Math.abs(state.timeOfDay - lastSkyHour) > 0.02) {
        lastSkyHour = state.timeOfDay;
        game.sky.setTimeOfDay(state.timeOfDay);
        game.city.setTimeOfDay(state.timeOfDay);
        game.city.setSunDirection(game.sky.sunPosition);
      }
      game.sky.update(dt, camera.position);
      game.player.update(dt);
      game.vehicles.update(dt);
      game.traffic.update(dt);
      game.pedestrians.update(dt);
      game.police.update(dt);
      game.helicopter.update(dt);
      game.hostiles.update(dt);
      // Wanted.update() already decays heat internally; calling decay()
      // here too would cool heat twice as fast (double-decay bug).
      game.wanted.update?.(dt);
      game.missions.update(dt);
      game.combat.update?.(dt);
      game.pickups.update(dt);
      game.collectibles.update(dt);
      game.sidejobs.update(dt);
      // The camera must be positioned BEFORE effects.update(): screen shake
      // adds an offset on top of the camera position, and a later camera
      // reset would wipe it (and drift the shake bookkeeping).
      updateCamera(dt);
      game.effects.update(dt);
      game.audio.update(dt);
      game.hud.update(dt);
      game.radar.update(dt);
      const units = game.police.units();
      if (game.helicopter.isActive()) {
        const heli = game.helicopter.mesh ? game.helicopter.mesh.position : null;
        const heliDist = heli
          ? Math.round(Math.hypot(heli.x - state.playerPos.x, heli.z - state.playerPos.z))
          : 0;
        units.push({ name: 'SKY EYE', type: 'helicopter', distance: heliDist, status: 'SEARCHLIGHT' });
      }
      game.response.update(units);
      game.city.update(dt);
      game.save.update(dt);
      // Screenshot staging: counts exactly three settle updates, then
      // freezes the frame deterministically (see shots.js).
      game.shots?.update?.(dt);
      // Shared mutable facts, refreshed every frame.
      state.stats.timePlayed += dt;
      const pos = game.player.position();
      state.playerPos.x = pos.x;
      state.playerPos.z = pos.z;
      adaptQuality();
    }
    renderer.render(scene, camera);
    // Edge state clears at the END of the frame (see input.js).
    input.update();
  }
  animate();

  return game;
}

// The single mutable state object (see the interface contract §2 for the
// full field list). Systems read and write these fields, never copies.
function createInitialState() {
  return {
    money: CONFIG.economy.startMoney,
    health: 100,
    armour: 0,
    ammo: { ...CONFIG.combat.startAmmo },
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
    timeOfDay: CONFIG.world.startTimeOfDay,
    day: 1,
    playerInVehicle: null,
    playerPos: { x: CONFIG.city.spawn.x, z: CONFIG.city.spawn.z },
    paused: true,
    muted: false,
    radioOn: true,
    radioStation: 0,
    settings: { radarNorthUp: false, showSpeed: true, quality: 'high' },
    unlocks: { nitro: false, shotgun: false, supercar: false, m7: false },
    flags: {},
  };
}

// Minimal event bus: on/emit over a Map of listener lists.
function createEventBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    off(name, fn) {
      const list = handlers.get(name);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(name, data) {
      const list = handlers.get(name);
      if (!list) return;
      for (const fn of list.slice()) fn(data);
    },
  };
}

// Reset in-memory state for a new game (mutates the shared object in place so
// every system keeps its reference), then resets the resettable systems.
function resetState(game) {
  const fresh = createInitialState();
  const state = game.state;
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
  state.paused = false;
  if (game.missions && state.mission) game.missions.abandonMission();
  game.collectibles?.reset?.();
  game.pickups?.reset?.();
  game.vehicles?.reset?.();
  game.police?.clearPursuit?.();
  game.helicopter?.dismiss?.();
  game.hostiles?.clear?.();
  game.wanted?.clearWanted?.();
  game.rng.reset();
}

// Put the player back at the downtown spawn, on foot, camera behind.
function teleportToSpawn(game) {
  const { x, z } = CONFIG.city.spawn;
  if (game.state.playerInVehicle) game.vehicles.exit();
  if (typeof game.player.teleport === 'function') {
    game.player.teleport(x, z);
  } else if (game.player.mesh) {
    game.player.mesh.position.set(x, 0, z);
    game.player.mesh.rotation.y = Math.PI;
  }
  game.state.playerPos.x = x;
  game.state.playerPos.z = z;
  game.camera.position.set(x, 12, z + 12);
  game.camera.lookAt(x, 1.6, z);
}

// Pause / map / radio keys. Ignored on the title screen and inside menus.
function handleGlobalKeys(game, e) {
  if (e.repeat) return;
  const state = game.state;
  if (e.code === CONFIG.keys.pause || e.code === CONFIG.keys.pauseAlt) {
    if (!game.started) return;
    if (state.paused) game.resumeGame();
    else game.pauseGame();
    return;
  }
  if (!game.started || state.paused) return;
  if (e.code === CONFIG.keys.map) {
    game.radar.toggleMap();
  } else if (e.code === CONFIG.keys.radio) {
    state.radioStation = (state.radioStation + 1) % 2;
    game.audio.setStation(state.radioStation);
  } else if (e.code === CONFIG.keys.weapon1) {
    game.combat.setWeapon('pistol');
  } else if (e.code === CONFIG.keys.weapon2) {
    game.combat.setWeapon('carbine');
  } else if (e.code === CONFIG.keys.weapon3) {
    game.combat.setWeapon('shotgun');
  }
}

// E key dispatch (the only interact path — see the keydown listener in
// startGame). Proximity order: shop, then the nearest available mission
// start, then the street-race start, then taxi stands. Nothing nearby
// means nothing happens; a locked mission nearby explains itself.
function handleInteract(game, data) {
  const state = game.state;
  if (!game.started || state.paused) return;
  const x = typeof data?.x === 'number' ? data.x : state.playerPos.x;
  const z = typeof data?.z === 'number' ? data.z : state.playerPos.z;
  const near = (px, pz, radius) => Math.hypot(px - x, pz - z) <= radius;

  const shop = (CITY_DATA.shops || []).find((s) => s.type === 'respray');
  if (shop && near(shop.x, shop.z, 20)) {
    game.menus.showShop();
    return;
  }

  if (!state.mission) {
    const available = game.missions?.availableMissions?.() || [];
    let best = null;
    let bestDist = 14;
    for (const mission of available) {
      const dist = Math.hypot(mission.startPos.x - x, mission.startPos.z - z);
      if (dist <= bestDist) {
        best = mission;
        bestDist = dist;
      }
    }
    if (best) {
      game.missions.startMission(best.id);
      return;
    }
    const locked = MISSIONS.find(
      (m) => !game.missions.isPassed(m.id) && near(m.startPos.x, m.startPos.z, 14),
    );
    if (locked) {
      game.hud?.showToast?.(`${locked.name} requires REP tier ${locked.unlockTier}.`);
      return;
    }
  }

  const race = CITY_DATA.raceStart;
  if (race && near(race.x, race.z, 14) && game.sidejobs?.canStart?.()) {
    game.sidejobs.startRace();
    return;
  }

  const stands = game.sidejobs?.stands?.() || [];
  for (const stand of stands) {
    if (near(stand.x, stand.z, 10) && game.sidejobs?.canStart?.()) {
      game.sidejobs.startFare(stand.id);
      return;
    }
  }
}

// Yield to the main thread (scheduler.yield with a setTimeout fallback) so
// long startup work never blocks input — the break-up-long-tasks pattern.
async function yieldToMain() {
  if (typeof window !== 'undefined' && window.scheduler && typeof window.scheduler.yield === 'function') {
    await window.scheduler.yield();
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// Run non-urgent work at background priority (scheduler.postTask with a
// setTimeout fallback) — the schedule-tasks-by-priority pattern.
function scheduleBackground(fn) {
  if (typeof window !== 'undefined' && window.scheduler && typeof window.scheduler.postTask === 'function') {
    window.scheduler.postTask(fn, { priority: 'background' }).catch(() => {});
  } else {
    setTimeout(fn, 0);
  }
}

// Boot: module scripts are deferred, so the DOM is ready. Yield once before
// the heavy world build so the title screen can paint first.
yieldToMain().then(() => startGame());
