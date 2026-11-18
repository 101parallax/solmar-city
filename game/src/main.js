// Solmar City — boot, the fixed-step loop, and the binder that wires every module
// together: city + sky (Worker A), player, traffic, pedestrians, police (Worker B),
// wanted, missions, combat, save, audio (Worker C), HUD, radar, menus (this worker).
// The sim runs at a fixed 60 Hz, the render as fast as the display allows; the two
// are independent, so playtests and screenshot scenes stay deterministic.
//
// ?seed=N fixes the city seed (default 1). ?shot=chase|street|race|map stages that
// scene, runs it forward a fixed number of steps with an autopilot, paints twice and
// sets window.__shotReady. ?demo=1 plays an attract mode: the autopilot drives.
//
// Contract (verified against the landed modules, 18 Nov): buildCity(seed) returns
// { graph, buildings (AABBs), districts, landmarks, group, setNight(f), bounds };
// main.js builds collideCircle from the building AABBs. Player(scene, {x, z,
// heading}) reads world.input + world.actions (it handles ENTER itself) and owns
// the camera; TrafficManager owns the mission cars (get/activateMissionVehicle);
// Police exposes .cruisers (wrappers with .vehicle) + .cruiserVehicles; missions
// get { player: {pos, vehicleId}, defeatedCount, targetVehicle, playerDead }.

import * as THREE from 'three';
import { STEP, CITY_SEED, CITY, DAY, PLAYER as PLAYER_CFG, WANTED as WANTED_CFG } from './config.js';
import { createRandom, forkRandom } from './random.js';
import { buildCity } from './world/city.js';
import { RoadGraph } from './world/roadgraph.js';
import { Sky } from './world/sky.js';
import { adaptGraph, clamp } from './entities/graph.js';
import { Player } from './entities/player.js';
import { TrafficManager } from './entities/traffic.js';
import { PedestrianManager } from './entities/pedestrians.js';
import { Hostile } from './entities/hostiles.js';
import { Police } from './entities/police.js';
import { Vehicle, resolveVehicleCollisions } from './entities/vehicles.js';
import { Wanted } from './systems/wanted.js';
import { MissionManager } from './systems/missions.js';
import { Combat, WEAPONS, findLockOn, meleeAttack, damage } from './systems/combat.js';
import { Rep, REP_TIERS } from './systems/rep.js';
import { Shop, SHOPS, SHOP_ITEMS, shopNear } from './systems/shop.js';
import { Collectibles, SHELL_POSITIONS } from './systems/collectibles.js';
import { SideJobs, RACE_START, FARE_STANDS } from './systems/sidejobs.js';
import { AudioSys } from './systems/audio.js';
import { saveGame, loadGame, hasSave, defaultSave, completionPercent } from './systems/save.js';
import { MISSIONS } from './data/missions.js';
import {
  DISTRICTS, LANDMARKS, landmarkPos, districtAtPos, streetNameAt, districtBounds,
  blockX, blockZ,
} from './data/city.js';
import {
  createInput, ACTION_INTERACT, ACTION_RELOAD, ACTION_PAUSE,
  ACTION_CONFIRM, ACTION_MISSIONS, ACTION_MAP, ACTION_WEAPON_1, ACTION_WEAPON_2,
  ACTION_WEAPON_3,
} from './input.js';
import { drawRadar } from './hud/radar.js';
import { HUD } from './hud/hud.js';
import { Menus } from './hud/menus.js';
import { stageShot, AutoDriver } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How often the GPS route is re-planned, in sim steps. */
const ROUTE_REPLAN_STEPS = 45;
/** The player starts here: a Downtown intersection, facing north up Solmar Blvd. */
const SPAWN = { x: 0, z: 70, heading: Math.PI };
/** No input at all: the autopilot idles (used when a shot has no driver). */
const IDLE_INPUT = { move: { x: 0, y: 0 }, run: false, brake: false, shooting: false };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const demo = params.get('demo') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CITY_SEED;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const radarCanvas = document.getElementById('radar');

function formatClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * Mission text de-duplicated: checkpoint labels already say "Checkpoint 4 of 9",
 * so the engine's appended " (4/9)" is dropped. Other counters (defeat 1/3)
 * stay, because their labels carry no count.
 */
function cleanObjectiveText(text) {
  return /\bof \d+\s*\(\d+\/\d+\)$/.test(text) ? text.replace(/\s*\(\d+\/\d+\)$/, '') : text;
}

/**
 * Wrap an autopilot's plain { move, run, brake, shooting } frame into the input
 * object Player.update expects (move/run/brake/shooting/lookDelta/takeActions).
 */
function virtualInput(state) {
  const s = state ?? IDLE_INPUT;
  return {
    move: () => ({ x: s.move.x, y: s.move.y }),
    run: () => Boolean(s.run),
    brake: () => Boolean(s.brake),
    shooting: () => Boolean(s.shooting),
    lookDelta: () => ({ x: 0, y: 0 }),
    takeActions: () => 0,
    pointer: () => ({ x: 0, y: 0 }),
  };
}

/** The city as the radar and the pause map see it, built from data/city.js. */
function buildRadarCity() {
  const bounds = districtBounds();
  const districts = Object.values(DISTRICTS).map((d) => ({
    name: d.name,
    kind: d.id === 'palmbeach' ? 'beach' : 'district',
    bounds: bounds[d.id],
  }));
  // Plaza del Sol is one park block inside Mercado: draw it green.
  const park = LANDMARKS.find((l) => l.id === 'park');
  if (park) {
    districts.push({
      name: 'Plaza del Sol',
      kind: 'park',
      bounds: {
        minX: blockX(park.col) - CITY.pitch / 2,
        maxX: blockX(park.col) + CITY.pitch / 2,
        minZ: blockZ(park.row) - CITY.pitch / 2,
        maxZ: blockZ(park.row) + CITY.pitch / 2,
      },
    });
  }
  return {
    bounds: {
      minX: -CITY.halfExtent, maxX: CITY.halfExtent,
      minZ: -CITY.halfExtent, maxZ: CITY.halfExtent,
    },
    districts,
    // The sea lies east of the last street.
    water: [{ minX: CITY.halfExtent, maxX: CITY.halfExtent + 320, minZ: -CITY.halfExtent, maxZ: CITY.halfExtent }],
  };
}

function createGame(seedValue) {
  const rng = createRandom(seedValue);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2600);
  camera.position.set(0, 60, 120);

  const sky = new Sky(scene);
  const city = buildCity(seedValue);
  const graph = city.graph ?? new RoadGraph();
  const adapted = adaptGraph(graph);
  if (city.group) scene.add(city.group);
  if (Array.isArray(city.meshes)) for (const mesh of city.meshes) scene.add(mesh);

  // Collision: building AABBs from the city (minX/maxX/minZ/maxZ are computed
  // by buildCity) plus a bounds clamp so nothing leaves the map.
  const buildingBoxes = Array.isArray(city.buildings) ? city.buildings : null;
  function collideCircle(x, z, r) {
    let fx = x;
    let fz = z;
    if (buildingBoxes) {
      for (const b of buildingBoxes) {
        const minX = b.minX ?? b.x - (b.w ?? 0) / 2;
        const maxX = b.maxX ?? b.x + (b.w ?? 0) / 2;
        const minZ = b.minZ ?? b.z - (b.d ?? 0) / 2;
        const maxZ = b.maxZ ?? b.z + (b.d ?? 0) / 2;
        if (fx > minX - r && fx < maxX + r && fz > minZ - r && fz < maxZ + r) {
          const pushL = fx - (minX - r);
          const pushR = maxX + r - fx;
          const pushU = fz - (minZ - r);
          const pushD = maxZ + r - fz;
          const min = Math.min(pushL, pushR, pushU, pushD);
          if (min === pushL) fx = minX - r;
          else if (min === pushR) fx = maxX + r;
          else if (min === pushU) fz = minZ - r;
          else fz = maxZ + r;
        }
      }
    }
    const edge = CITY.halfExtent + 6;
    fx = clamp(fx, -edge, edge);
    fz = clamp(fz, -edge, edge);
    if (fx === x && fz === z) return null;
    return { x: fx, z: fz };
  }

  const player = new Player(scene, { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading });
  const traffic = new TrafficManager(scene, graph, forkRandom(rng));
  const peds = new PedestrianManager(scene, adapted, forkRandom(rng));
  const police = new Police(scene, graph, forkRandom(rng));
  const wanted = new Wanted(police);
  const missions = new MissionManager();
  const combat = new Combat();
  const audio = new AudioSys();
  // v2 (Worker A): reputation, shops, Sun Shells, side jobs.
  const rep = new Rep();
  const collectibles = new Collectibles();
  const sideJobs = new SideJobs();

  // Mission cars already carry their ids (Vehicle honours opts.id).

  const hud = new HUD();
  const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
  const radarCity = buildRadarCity();

  const game = {
    seed: seedValue, rng, renderer, scene, camera, sky, city, graph, adapted,
    player, traffic, peds, police, wanted, missions, combat, audio, hud,
    rep, collectibles, sideJobs,
    radarCity, collideCircle,
    time: 0,
    stepCount: 0,
    money: defaultSave().money,
    stats: { ...defaultSave().stats, distanceDriven: 0 },
    settings: { ...defaultSave().settings, showSpeed: false },
    waypoint: null,
    route: null,
    waypointRoute: null,
    defeatedCount: 0,
    hostiles: [],
    guardsSpawned: false,
    chaseArmed: false,
    extraVehicles: [],
    alerts: [],
    tracers: [],
    markerGroup: null,
    markerKey: '',
    giverMarkers: [],
    shellMeshes: {},
    jobMarkers: [],
    shotgunOwned: false,
    supercarSpawned: false,
    subtitleQueue: [],
    subtitleTimer: 0,
    prevWantedLevel: 0,
    resprayUsed: false,
    lastMissionStatus: 'idle',
    deadKind: null,
    savedAt: 0,
  };

  // The shop dialog (native <dialog>); buys run through game.buyShopItem.
  game.shop = new Shop((itemId, shopDef) => game.buyShopItem(itemId, shopDef), () => {});

  // Floating diamonds over mission givers that still have a job to offer.
  const giverMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x8a6d00 });
  for (const m of MISSIONS) {
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), giverMat);
    marker.position.set(m.giverPos.x, 7, m.giverPos.z);
    scene.add(marker);
    game.giverMarkers.push({ missionId: m.id, mesh: marker });
  }

  // Sun Shells: small golden markers bobbing over their spots.
  const shellMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x8a6d00 });
  SHELL_POSITIONS.forEach((shell, id) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55), shellMat);
    mesh.position.set(shell.x, 1.2, shell.z);
    scene.add(mesh);
    game.shellMeshes[id] = mesh;
  });

  // Side-job markers: a cyan diamond over the race start, small gold ones
  // over the taxi fare stands.
  const raceMat = new THREE.MeshLambertMaterial({ color: 0x33d5e8, emissive: 0x0a4a55 });
  const raceMarker = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), raceMat);
  raceMarker.position.set(RACE_START.x, 7, RACE_START.z);
  raceMarker.userData.baseY = 7;
  scene.add(raceMarker);
  game.jobMarkers.push(raceMarker);
  for (const stand of FARE_STANDS) {
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), giverMat);
    marker.position.set(stand.x, 5, stand.z);
    marker.userData.baseY = 5;
    scene.add(marker);
    game.jobMarkers.push(marker);
  }

  // --- helpers ---------------------------------------------------------------
  game.allVehicles = function allVehicles() {
    const out = new Set();
    for (const v of game.traffic?.vehicles ?? []) out.add(v);
    for (const v of game.police?.cruiserVehicles ?? []) out.add(v);
    for (const v of game.extraVehicles) out.add(v);
    if (game.player.vehicle) out.add(game.player.vehicle);
    return [...out];
  };

  game.nearestVehicle = function nearestVehicle(x, z, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const v of game.allVehicles()) {
      if (v.wrecked) continue;
      const d = dist2(x, z, v.x, v.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  };

  game.routeTo = function routeTo(target) {
    return game.routeFrom({ x: game.player.x, z: game.player.z }, target);
  };

  /** Shortest road route between two world points, as [{x, z}] node positions. */
  game.routeFrom = function routeFrom(from, target) {
    const a = graph.nearestNode(from.x, from.z);
    const b = graph.nearestNode(target.x, target.z);
    const path = graph.findPath(a, b);
    if (!path || path.length === 0) return [from, target];
    const route = path.map((i) => graph.nodePos(i));
    // The target itself is usually off the grid (a building, a waypoint): add
    // the final leg from its nearest intersection so the line ends on it.
    const end = route[route.length - 1];
    if (Math.hypot(end.x - target.x, end.z - target.z) > 1) {
      route.push({ x: target.x, z: target.z });
    }
    return route;
  };

  game.objectiveMarker = function objectiveMarker() {
    const objective = game.missions.currentObjective();
    if (objective) {
      if (objective.type === 'chase') {
        const target = game.traffic.getMissionVehicle(objective.vehicleId);
        if (target) return { x: target.x, z: target.z };
      }
      return game.missions.getObjectiveMarker();
    }
    // Free roam: a running side job owns the GPS target instead.
    return game.sideJobs.getObjectiveMarker();
  };

  game.setTimeOfDay = function setTimeOfDay(hour) {
    game.sky.setTimeOfDay(hour);
  };

  game.setWaypoint = function setWaypoint(pos) {
    game.waypoint = pos;
    game.waypointRoute = pos ? game.routeTo(pos) : null;
  };

  game.addWantedStars = function addWantedStars(n) {
    for (let i = 0; i < n; i += 1) {
      game.wanted.addCrime('shooting', { x: game.player.x, z: game.player.z }, true);
    }
  };

  game.startMission = function startMission(id) {
    if (game.missions.status === 'active') return false;
    const def = MISSIONS.find((m) => m.id === id);
    if (!def) return false;
    // Tier-gated missions (M7 needs KINGPIN) refuse to start until the
    // player's REP is high enough.
    const requiredTier = def.requiresTier ?? 1;
    if (!game.rep.meetsTier(requiredTier)) {
      const tierName = REP_TIERS.find((t) => t.tier === requiredTier)?.name ?? '';
      game.hud.toast(`${def.name} requires REP tier ${requiredTier} — ${tierName}`, 3);
      return false;
    }
    if (!game.missions.start(id)) return false;
    game.sideJobs.cancel();
    game.defeatedCount = 0;
    game.guardsSpawned = false;
    game.chaseArmed = false;
    // The Escape starts hot: three stars the moment Lena's job begins.
    if (id === 'm6') game.addWantedStars(3);
    game.hud.toast(def.name, 3);
    // Intro dialog as sequential subtitles on sim time (~4.5 s per line).
    // Shots stage scenes, they do not play the story, so they skip them.
    if (!shot) {
      game.subtitleQueue = game.missions.getDialog().map((l) => `${l.speaker}: ${l.text}`);
      game.subtitleTimer = 0;
      game.hud.hideSubtitle?.();
    }
    game.audio.play('click');
    return true;
  };

  /** Hide collected shells' meshes (pickup, load, new game). */
  game.refreshShellMeshes = function refreshShellMeshes() {
    for (const [id, mesh] of Object.entries(game.shellMeshes)) {
      mesh.visible = !game.collectibles.collected.has(Number(id));
    }
  };

  /** Apply the lasting effects of a REP tier (shotgun, supercar). */
  game.applyTierUnlocks = function applyTierUnlocks(tier) {
    if (tier >= 3) game.shotgunOwned = true;
    if (tier >= 4) game.spawnSupercar();
  };

  /** The tier-4 reward: an Apex Stradale parked at the Salas garage. */
  game.spawnSupercar = function spawnSupercar() {
    if (game.supercarSpawned) return;
    game.supercarSpawned = true;
    const v = new Vehicle(scene, 'supercar', 0xffd400, { x: -210, z: 140, heading: Math.PI, driver: false });
    v.id = 'rep-supercar';
    v.stolen = true; // a gift, not a theft
    game.extraVehicles.push(v);
  };

  /** The context the shop renders its items against (money, car, REP). */
  game.shopCtx = function shopCtx() {
    return {
      money: game.money,
      wantedLevel: game.wanted.level,
      vehicle: game.player.vehicle,
      armour: game.player.armour ?? 0,
      ammoLow: (game.combat.ammo.pistol ?? 0) < 48
        || (game.combat.ammo.carbine ?? 0) < 90
        || (game.shotgunOwned && (game.combat.ammo.shotgun ?? 0) < 24),
      repTier: game.rep.tier,
    };
  };

  /** Buy a shop item: re-checks the rules, then applies the effect. */
  game.buyShopItem = function buyShopItem(itemId) {
    const item = SHOP_ITEMS[itemId];
    if (!item) return { ok: false, message: '' };
    const check = item.canBuy(game.shopCtx());
    if (!check.ok) return { ok: false, message: check.reason };
    if (game.money < item.price) return { ok: false, message: 'Not enough cash' };
    game.money -= item.price;
    let message = '';
    if (itemId === 'respray') {
      game.wanted.clearWanted();
      game.resprayUsed = true;
      message = 'Respray done — wanted level cleared';
    } else if (itemId === 'repair') {
      const v = game.player.vehicle;
      v.damage = 0;
      v.smoking = false;
      // The body colour is only re-darkened on damage, so restore it here.
      if (v.parts?.bodyMat) v.parts.bodyMat.color.set(v.color);
      message = 'Vehicle repaired';
    } else if (itemId === 'nitro') {
      // The kit is what the NOS switch reads (Worker B's P1-10).
      game.player.vehicle.hasNitro = true;
      message = 'Nitro installed — hold Shift while driving';
    } else if (itemId === 'armor') {
      game.player.armour = 100;
      message = 'Armor vest equipped';
    } else if (itemId === 'ammo') {
      game.combat.ammo.pistol = 48;
      game.combat.ammo.carbine = 90;
      if (game.shotgunOwned) game.combat.ammo.shotgun = 24;
      message = 'Ammo restocked';
    }
    game.audio.play('pickup');
    game.save();
    return { ok: true, message };
  };

  game.placePlayerOnFoot = function placePlayerOnFoot(x, z, heading) {
    if (game.player.vehicle) game.player.exitVehicle(game.worldCtx(virtualInput()));
    game.player.x = x;
    game.player.z = z;
    game.player.heading = heading;
    game.player.speed = 0;
    // The orbit camera yaw is the player's own; keep it behind the new heading.
    game.player._camYaw = heading;
    game.player.mesh.visible = true;
    game.player.mesh.position.set(x, 0, z);
    game.player.mesh.rotation.y = heading;
  };

  game.putPlayerInCar = function putPlayerInCar(typeId, color, x, z, heading) {
    const v = new Vehicle(scene, typeId, color, { x, z, heading, driver: false });
    v.id = `game-car-${game.extraVehicles.length}`;
    v.stolen = true; // staged car: entering it is not a new theft
    game.extraVehicles.push(v);
    game.player.enterVehicle(v, game.worldCtx(virtualInput()));
    return v;
  };

  /** Register a crime with the wanted system; witnesses make it count in full. */
  game.handleCrime = function handleCrime(type, pos) {
    // Shot staging drives an autopilot through the city: the peds it clips
    // on the way are staging artefacts, not player crimes.
    if (game.suppressCrimes) return;
    const crimeType = type === 'hit_ped' ? 'runover' : type;
    if (crimeType === 'runover') {
      // Peds report every vehicle that hits them, AI traffic included — only
      // the player's own car counts as the player's crime.
      const v = game.player.vehicle;
      if (!v || dist2(pos.x, pos.z, v.x, v.z) > 8 * 8) return;
    }
    let witnessed = false;
    for (const p of game.peds?.peds ?? []) {
      if (dist2(pos.x, pos.z, p.x, p.z) < 40 * 40) {
        witnessed = true;
        break;
      }
    }
    if (!witnessed) {
      for (const c of game.police?.cruiserVehicles ?? []) {
        if (dist2(pos.x, pos.z, c.x, c.z) < 80 * 80) {
          witnessed = true;
          break;
        }
      }
    }
    game.wanted.addCrime(crimeType, pos, witnessed);
    game.stats.crimes += 1;
  };

  game.spawnGuards = function spawnGuards() {
    // Guards for the current mission's defeat objective, from its data
    // (M3 Eddie's house, M5 the turf, M7 Hale's penthouse). A boss entry
    // carries extra health / damage / shirt colour; fire is staggered so
    // the guards do not all shoot at once.
    const def = game.missions.mission;
    const spots = def?.hostiles ?? [
      { x: 206, z: 206 },
      { x: 214, z: 208 },
      { x: 210, z: 216 },
    ];
    game.hostiles.push(...spots.map((spot, i) => new Hostile(scene, spot.x, spot.z, {
      health: spot.health,
      shootDamage: spot.shootDamage,
      shirt: spot.shirt,
      shootDelay: 1 + i * 0.5,
    })));
    game.guardsSpawned = true;
  };

  game.clearHostiles = function clearHostiles() {
    for (const h of game.hostiles) h.destroy(scene);
    game.hostiles = [];
    game.guardsSpawned = false;
    game.defeatedCount = 0;
  };

  game.clearExtraVehicles = function clearExtraVehicles() {
    for (const v of game.extraVehicles) v.destroy();
    game.extraVehicles = [];
  };

  /** Park the mission cars back where the missions expect them (New Game). */
  game.restoreMissionVehicles = function restoreMissionVehicles() {
    // Spawn spots derive from the mission data (objective pos + 4.5 m),
    // the same rule traffic.js uses to place them.
    const spots = {};
    for (const m of MISSIONS) {
      for (const o of m.objectives) {
        if ((o.type === 'steal' || o.type === 'chase') && o.vehicleId && o.pos) {
          spots[o.vehicleId] = { x: o.pos.x + 4.5, z: o.pos.z, heading: Math.PI };
        }
      }
    }
    for (const [id, spot] of Object.entries(spots)) {
      const v = game.traffic.getMissionVehicle(id);
      if (!v) continue;
      // If the flee AI owns it, take it back to the parked list.
      const carIdx = game.traffic.cars.findIndex((c) => c.vehicle === v);
      if (carIdx >= 0) {
        game.traffic.cars.splice(carIdx, 1);
        game.traffic.parked.push(v);
      }
      const entry = game.traffic.mission.get(id);
      if (entry) entry.armed = false;
      v.setControl({ throttle: 0, brake: 0, steer: 0, handbrake: false });
      v.x = spot.x;
      v.z = spot.z;
      v.heading = spot.heading;
      v.speed = 0;
      v.slide = 0;
      v.damage = 0;
      v.smoking = false;
      v.wrecked = false;
      v.stolen = false;
      v.parked = true;
      v.driver = false;
      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = v.heading;
    }
  };

  /** Fresh dynamic state: a new game, a shot stage, or a Continue from a save. */
  game.reset = function reset() {
    game.clearHostiles();
    game.clearExtraVehicles();
    for (const t of game.tracers) scene.remove(t.line);
    game.tracers = [];
    game.alerts = [];
    game.waypoint = null;
    game.route = null;
    game.waypointRoute = null;
    game.time = 0;
    game.stepCount = 0;
    game.chaseArmed = false;
    game.lastMissionStatus = 'idle';
    game.deadKind = null;
    game.money = defaultSave().money;
    game.stats = { ...defaultSave().stats, distanceDriven: 0 };
    game.wanted.reset();
    game.missions.completedIds = [];
    game.missions.status = 'idle';
    game.missions.mission = null;
    game.missions.objectiveIndex = 0;
    game.combat.weaponId = 'fists';
    game.combat.mag = {
      pistol: WEAPONS.pistol.magSize,
      carbine: WEAPONS.carbine.magSize,
    };
    // The scattergun entry ships with the merged combat.js; until then the
    // mag stays unset and key 3 stays on the carbine.
    if (WEAPONS.shotgun) game.combat.mag.shotgun = WEAPONS.shotgun.magSize;
    game.combat.ammo = { pistol: 48, carbine: 90, shotgun: 24 };
    game.combat.cooldownLeft = 0;
    // v2 (Worker A): reputation, shells and side jobs reset with the game.
    game.rep.points = 0;
    game.collectibles = new Collectibles();
    game.sideJobs = new SideJobs();
    game.shotgunOwned = false;
    game.supercarSpawned = false;
    game.subtitleQueue = [];
    game.subtitleTimer = 0;
    game.hud.hideSubtitle?.();
    game.shop?.close();
    game.prevWantedLevel = 0;
    game.resprayUsed = false;
    game.refreshShellMeshes();
    game.restoreMissionVehicles();
    game.placePlayerOnFoot(SPAWN.x, SPAWN.z, SPAWN.heading);
    game.player.health = PLAYER_CFG.maxHealth;
    game.player.armour = 0;
    game.setTimeOfDay(DAY.startHour);
    game.updateMarker(true);
  };

  /** The 3D beacon over the current objective (checkpoint cylinder + ring). */
  game.updateMarker = function updateMarker(force = false) {
    const objective = game.missions.currentObjective();
    const key = objective ? `${game.missions.mission.id}:${game.missions.objectiveIndex}` : '';
    if (!force && key === game.markerKey) return;
    game.markerKey = key;
    if (game.markerGroup) {
      scene.remove(game.markerGroup);
      game.markerGroup = null;
    }
    if (!objective || !objective.pos) return;
    const radius = objective.radius ?? 12;
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 26, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 13;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.8, radius, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(beam, ring);
    scene.add(group);
    game.markerGroup = group;
  };

  game.addTracer = function addTracer(from, to) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, 1.4, from.z),
      new THREE.Vector3(to.x, 1.2, to.z),
    ]);
    const material = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 1 });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    game.tracers.push({ line, ttl: 0.09 });
  };

  game.save = function save() {
    return saveGame({
      money: game.money,
      completedMissions: [...game.missions.completedIds],
      rep: game.rep.points,
      shells: game.collectibles.serialize(),
      stats: game.stats,
      settings: game.settings,
      playerPos: { x: game.player.x, z: game.player.z },
    });
  };

  game.applySave = function applySave(save) {
    if (!save) return;
    game.money = save.money ?? game.money;
    game.stats = { ...game.stats, ...(save.stats ?? {}) };
    game.settings = { ...game.settings, ...(save.settings ?? {}) };
    game.missions.completedIds = [...(save.completedMissions ?? [])];
    game.rep = new Rep(save.rep ?? 0);
    game.collectibles = new Collectibles(save.shells ?? []);
    game.applyTierUnlocks(game.rep.tier);
    game.refreshShellMeshes();
    if (save.playerPos) game.placePlayerOnFoot(save.playerPos.x, save.playerPos.z, SPAWN.heading);
    game.audio.enabled = game.settings.sfx !== false && game.settings.music !== false;
  };

  // The world context entities read. `alerts` is a live getter: peds read the
  // previous step's alerts, then step() swaps in a fresh array for the police.
  game.worldCtx = function worldCtx(inputObj, actions = 0) {
    return {
      player: game.player,
      vehicles: game.allVehicles(),
      pedestrians: game.peds,
      get alerts() {
        return game.alerts;
      },
      collideCircle: game.collideCircle,
      onCrime: (type, pos) => game.handleCrime(type, pos),
      graph: game.adapted,
      city: game.city,
      wanted: game.wanted.level,
      time: game.time,
      input: inputObj ?? null,
      actions,
    };
  };

  /**
   * One fixed step. `inputObj` is the live input device or a virtual input
   * (shots / demo); `actions` are the one-shot ACTION_* flags for this step —
   * the player consumes ENTER from them, main.js the weapon/reload flags.
   */
  /** (Re-)plan the GPS routes to the objective and the waypoint. */
  game.planRoutes = function planRoutes() {
    const marker = game.objectiveMarker();
    game.route = marker ? game.routeTo(marker) : null;
    game.waypointRoute = game.waypoint ? game.routeTo(game.waypoint) : null;
  };

  game.step = function step(dt, inputObj, actions = 0) {
    game.time += dt;
    game.stepCount += 1;
    const player = game.player;
    const wasInVehicle = Boolean(player.vehicle);
    const ctx = game.worldCtx(inputObj, actions);

    player.update(dt, ctx);
    if (!wasInVehicle && player.vehicle) game.stats.carsStolen += 1;
    if (player.vehicle) {
      game.stats.distanceDriven += Math.abs(player.vehicle.speed ?? 0) * dt;
    }

    game.traffic?.update(dt, ctx);
    game.peds?.update(dt, ctx);
    // Fresh alerts for the police + shooting below; peds already read the old ones.
    game.alerts = [];
    game.police?.update(dt, ctx);
    for (const s of ctx.policeShots ?? []) game.addTracer(s.from, s.to);
    resolveVehicleCollisions(game.allVehicles(), dt);
    // The collision pass moves the car after Player.update ran: re-sync.
    player.syncToVehicle();
    game.sky.update(dt);
    game.combat.update(dt);

    // Shooting (on foot only; the car is the weapon while driving).
    if (inputObj && typeof inputObj.shooting === 'function' && inputObj.shooting() && !player.vehicle) {
      game.tryShoot();
    }
    if (actions & ACTION_RELOAD) game.combat.reload();
    if (actions & ACTION_WEAPON_1) game.combat.switchWeapon('fists');
    if (actions & ACTION_WEAPON_2) game.combat.switchWeapon('pistol');
    if (actions & ACTION_WEAPON_3) {
      // Key 3 toggles carbine / scattergun once the scattergun is unlocked
      // (REP tier 3); before that it is just the carbine.
      if (game.shotgunOwned && WEAPONS.shotgun && game.combat.weaponId === 'carbine') game.combat.switchWeapon('shotgun');
      else game.combat.switchWeapon('carbine');
    }

    // Mission edges, for any mission: guards spawn on a defeat objective,
    // the flee AI arms when a chase objective begins, and a wrecked
    // steal/deliver car fails the mission (a wrecked chase target is a
    // catch, so chase objectives are exempt).
    const objective = game.missions.currentObjective();
    if (game.missions.status === 'active') {
      if (objective?.type === 'defeat' && !game.guardsSpawned) game.spawnGuards();
      if (objective?.type === 'chase' && !game.chaseArmed) {
        game.chaseArmed = true;
        game.traffic.activateMissionVehicle(objective.vehicleId);
      }
      // A wrecked mission car fails the mission, whichever objective is
      // current — the job cannot be finished without it. Every steal /
      // deliver vehicle of the active mission counts, not just the current
      // objective's: a car wrecked during the opening drive is already a
      // failed job. (Chase targets are exempt — a wrecked chase target is
      // a catch, not a failure.)
      const missionDef = game.missions.mission;
      if (missionDef) {
        for (const o of missionDef.objectives) {
          const neededId = o.type === 'steal' ? o.vehicleId
            : o.type === 'deliver' ? o.requiresVehicle : null;
          if (!neededId) continue;
          const needed = game.traffic.getMissionVehicle(neededId);
          if (needed?.wrecked) {
            game.missions.failMission('The mission car was wrecked.');
            break;
          }
        }
      }
    }
    game.updateHostiles(dt);

    // Wanted visibility comes from the police manager itself.
    const playerPos = { x: player.x, z: player.z };
    game.wanted.update(dt, playerPos, game.police.canSeePlayer(playerPos), {
      onFoot: player.onFoot,
      officerClose: game.police.officerCloseTo(playerPos),
    });
    // Losing the cops (heat decaying to zero on its own) counts as an escape.
    if (game.prevWantedLevel > 0 && game.wanted.level === 0 && !game.resprayUsed) {
      game.stats.copsLost += 1;
    }
    game.resprayUsed = false;
    game.prevWantedLevel = game.wanted.level;

    // Mission engine state, exactly as systems/missions.js documents it.
    const chaseId = objective?.type === 'chase' ? objective.vehicleId : null;
    const chaseCar = chaseId ? game.traffic.getMissionVehicle(chaseId) : null;
    const targetVehicle = chaseCar
      ? { pos: { x: chaseCar.x, z: chaseCar.z }, speed: Math.abs(chaseCar.speed), wrecked: chaseCar.wrecked }
      : null;
    game.missions.update(dt, {
      player: {
        pos: { x: player.x, z: player.z },
        vehicleId: player.vehicleId ?? null,
      },
      defeatedCount: game.defeatedCount,
      targetVehicle,
      playerDead: player.dead,
      wantedLevel: game.wanted.level,
    });

    // Mission dialog subtitles, on sim time so they pause with the game.
    if (game.subtitleQueue.length > 0) {
      game.subtitleTimer -= dt;
      if (game.subtitleTimer <= 0) {
        // Shift first, then show: the line must leave the queue even when
        // the HUD has no showSubtitle (v1 hud.js), because `?.()` would
        // skip evaluating its argument and the queue would never advance.
        const line = game.subtitleQueue.shift();
        game.hud.showSubtitle?.(line);
        game.subtitleTimer = 4.5;
      }
    } else if (game.subtitleTimer > 0) {
      game.subtitleTimer -= dt;
      if (game.subtitleTimer <= 0) game.hud.hideSubtitle?.();
    }

    // Sun Shell pickup.
    const shellId = game.collectibles.pickup(playerPos, 3);
    if (shellId !== null) {
      game.refreshShellMeshes();
      game.audio.play('pickup');
      game.hud.toast(`Sun Shell ${game.collectibles.count}/${game.collectibles.total}`, 2);
      game.save();
    }

    // The shop closes itself when the player walks away from the counter.
    if (game.shop?.isOpen && game.shop.shop) {
      const s = game.shop.shop.pos;
      if (dist2(player.x, player.z, s.x, s.z) > 15 * 15) game.shop.close();
    }

    // Side jobs run only in free roam (a mission cancels them on start).
    if (game.missions.status !== 'active') {
      const result = game.sideJobs.update(dt, { playerPos });
      if (result) {
        if (result.passed) {
          game.money += result.reward;
          game.stats.sideJobs += 1;
          const repResult = game.rep.add(result.rep);
          game.applyTierUnlocks(repResult.newTier.tier);
          let toastText = result.kind === 'race' ? `Race won! +$${result.reward}` : `Fare complete! +$${result.reward}`;
          if (repResult.tierUp) {
            toastText += ` — REP ${repResult.newTier.tier} · ${repResult.newTier.name}`;
          }
          game.hud.toast(toastText, 3);
          game.audio.play('passed');
          game.save();
        } else {
          game.hud.toast('Race failed — out of time.', 3);
          game.audio.play('failed');
        }
      }
    }

    // GPS routes, re-planned regularly and whenever the target moves.
    if (game.stepCount % ROUTE_REPLAN_STEPS === 0 || !game.route) game.planRoutes();

    game.updateMarker();
    if (game.markerGroup) {
      const marker = game.objectiveMarker();
      if (marker) game.markerGroup.position.set(marker.x, 0, marker.z);
    }
    // Giver diamonds bob; completed givers' diamonds hide.
    for (const giver of game.giverMarkers) {
      const done = game.missions.completedIds.includes(giver.missionId);
      giver.mesh.visible = !done && game.missions.status !== 'active';
      giver.mesh.position.y = 7 + Math.sin(game.time * 1.5) * 0.5;
      giver.mesh.rotation.y += dt;
    }
    // Shells and side-job markers bob and spin with the same rhythm.
    for (const mesh of Object.values(game.shellMeshes)) {
      if (!mesh.visible) continue;
      mesh.rotation.y += dt * 2;
      mesh.position.y = 1.2 + Math.sin(game.time * 2 + mesh.position.x) * 0.25;
    }
    for (const marker of game.jobMarkers) {
      marker.rotation.y += dt;
      marker.position.y = (marker.userData.baseY ?? 7) + Math.sin(game.time * 1.5) * 0.5;
    }

    // Audio beds: engine pitch from speed, siren while wanted.
    game.audio.setEngine(player.vehicle ? clamp(Math.abs(player.vehicle.speed ?? 0) / 40, 0, 1) : 0);
    game.audio.siren(game.wanted.level > 0 && game.police.cruisers.length > 0);

    // Mission pass/fail edges are picked up by runGame via lastMissionStatus.
  };

  game.updateHostiles = function updateHostiles(dt) {
    for (const h of game.hostiles) {
      if (!h.update(dt, game.player, game.rng)) continue;
      game.audio.play('shoot');
      // Guards miss ~45% of shots (dangerous but survivable); a miss still
      // draws a tracer past the player, so the firefight looks busy.
      if (game.rng() < 0.55) {
        game.addTracer({ x: h.x, z: h.z }, { x: game.player.x, z: game.player.z });
        game.player.takeDamage(h.shootDamage);
      } else {
        const ox = (game.rng() - 0.5) * 4;
        const oz = (game.rng() - 0.5) * 4;
        game.addTracer({ x: h.x, z: h.z }, { x: game.player.x + ox, z: game.player.z + oz });
      }
    }
  };

  /** One shot (or punch) from the player, on foot. */
  game.tryShoot = function tryShoot() {
    const player = game.player;
    const weapon = game.combat.weapon;
    const aim = player.facing; // combat convention (atan2(dz, dx))
    const from = { x: player.x, z: player.z };
    if (weapon.type === 'melee') {
      // Nearest ped or hostile in front, inside punch range.
      let best = null;
      let bestD = PLAYER_CFG.punchRange;
      const consider = (obj, x, z) => {
        const d = Math.hypot(x - player.x, z - player.z);
        if (d < bestD) {
          bestD = d;
          best = obj;
        }
      };
      for (const h of game.hostiles) if (h.alive) consider(h, h.x, h.z);
      for (const p of game.peds?.peds ?? []) consider(p, p.x, p.z);
      if (!best) return;
      const result = meleeAttack({ pos: from }, { pos: { x: best.x, z: best.z }, health: best.health ?? 100, armour: 0 });
      if (!result.hit) return;
      game.audio.play('punch');
      if (best.alive !== undefined) {
        // A hostile: real damage, and it may fall.
        damage(best, WEAPONS.fists.damage);
        if (best.health <= 0 && best.fall()) game.defeatedCount += 1;
      } else {
        // A pedestrian: knocked down, and it counts as a crime.
        best.knockDown();
        game.handleCrime('assault', { x: best.x, z: best.z });
      }
      return;
    }
    if (!game.combat.canFire) return;
    const candidates = [];
    for (const h of game.hostiles) if (h.alive) candidates.push(h);
    for (const p of game.peds?.peds ?? []) {
      candidates.push({
        pos: { x: p.x, z: p.z }, health: 100, armour: 0, _ped: p,
      });
    }
    for (const o of game.police?.officers ?? []) {
      candidates.push({
        pos: { x: o.x, z: o.z }, health: o.health ?? 100, armour: 0, _officer: o,
      });
    }
    const target = findLockOn(from, aim, candidates, weapon.range, 0.6);
    const result = game.combat.shoot(from, aim, target);
    if (!result.fired) return;
    game.audio.play('shoot');
    game.addTracer(result.tracer.from, result.tracer.to);
    game.alerts.push({ x: player.x, z: player.z, radius: 30 });
    // v2 (Worker A, P1-1): shots aimed at mission hostiles are the job, not
    // a crime — without this, M3's firefight alone stars the player to 5.
    // Officers and peds still count, as do shots at nothing.
    const targetIsHostile = Boolean(target) && target.alive !== undefined
      && target.kind !== 'officer' && !target._ped;
    if (!targetIsHostile) game.handleCrime('shooting', { x: player.x, z: player.z });
    if (!result.hit || !target) return;
    if (target._ped) {
      target._ped.knockDown();
      game.handleCrime('assault', { x: target._ped.x, z: target._ped.z });
    } else if (target._officer) {
      const officer = target._officer;
      if (typeof officer.health === 'number') officer.health = Math.max(0, officer.health - weapon.damage);
    } else if (target.alive !== undefined && target.health <= 0 && target.fall()) {
      game.defeatedCount += 1;
    }
  };

  /** The interaction prompt for this frame, or null. */
  game.promptFor = function promptFor() {
    const player = game.player;
    // Shops work on foot and behind the wheel (repair/nitro need the car).
    const shop = shopNear({ x: player.x, z: player.z });
    if (shop) return `Press E to enter ${shop.name}`;
    if (player.vehicle) return null;
    // Mission giver first.
    if (game.missions.status !== 'active') {
      for (const m of MISSIONS) {
        if (game.missions.completedIds.includes(m.id)) continue;
        if (dist2(player.x, player.z, m.giverPos.x, m.giverPos.z) < 8 * 8) {
          if (!game.rep.meetsTier(m.requiresTier ?? 1)) {
            return `${m.name} — requires REP tier ${m.requiresTier}`;
          }
          return `Press E to talk to ${m.giver}`;
        }
      }
    }
    // Street race start + taxi fare stands (free roam only).
    if (game.missions.status !== 'active' && !game.sideJobs.active) {
      if (dist2(player.x, player.z, RACE_START.x, RACE_START.z) < 8 * 8) {
        return 'Press E to start the street race ($600)';
      }
      for (const stand of FARE_STANDS) {
        if (dist2(player.x, player.z, stand.x, stand.z) < 8 * 8) {
          return 'Press E to pick up a taxi fare';
        }
      }
    }
    // Nearest car.
    const v = game.nearestVehicle(player.x, player.z, PLAYER_CFG.stealRange);
    if (v) {
      return v.driver
        ? `Press F to steal the ${v.type.name}`
        : `Press F to enter the ${v.type.name}`;
    }
    return null;
  };

  /** The E key: open a shop, talk to a giver, or start a side job. */
  game.interact = function interact() {
    const player = game.player;
    // E closes an open shop.
    if (game.shop?.isOpen) {
      game.shop.close();
      return;
    }
    const shop = shopNear({ x: player.x, z: player.z });
    if (shop) {
      game.shop.open(shop, game.shopCtx());
      game.audio.play('click');
      return;
    }
    if (player.vehicle) return;
    if (game.missions.status !== 'active') {
      for (const m of MISSIONS) {
        if (game.missions.completedIds.includes(m.id)) continue;
        if (dist2(player.x, player.z, m.giverPos.x, m.giverPos.z) < 8 * 8) {
          game.startMission(m.id);
          return;
        }
      }
    }
    if (game.missions.status !== 'active' && !game.sideJobs.active) {
      if (dist2(player.x, player.z, RACE_START.x, RACE_START.z) < 8 * 8) {
        if (game.sideJobs.startRace()) {
          game.hud.toast('Street Race — 5 gates, 75 seconds', 3);
          game.audio.play('click');
        }
        return;
      }
      for (const stand of FARE_STANDS) {
        if (dist2(player.x, player.z, stand.x, stand.z) < 8 * 8) {
          if (game.sideJobs.startFare({ x: player.x, z: player.z })) {
            game.hud.toast('Passenger aboard — follow the GPS', 3);
            game.audio.play('click');
          }
          return;
        }
      }
    }
  };

  game.radarState = function radarState() {
    const objective = game.objectiveMarker();
    const blips = [];
    for (const m of MISSIONS) {
      if (game.missions.completedIds.includes(m.id)) continue;
      if (game.missions.status === 'active' && game.missions.mission?.id === m.id) continue;
      blips.push({ x: m.giverPos.x, z: m.giverPos.z, kind: 'mission', label: m.giverBlip });
    }
    for (const l of LANDMARKS) {
      if (l.id === 'hospital' || l.id === 'respray') {
        const pos = landmarkPos(l);
        blips.push({ x: pos.x, z: pos.z, kind: l.id, label: l.blip });
      }
    }
    // Sun Shells still out there, the gun shop, the race start, fare stands.
    for (const shell of game.collectibles.remaining()) {
      blips.push({ x: shell.x, z: shell.z, kind: 'shell' });
    }
    for (const s of SHOPS) {
      if (s.id === 'chroma') continue; // already blipped as the Respray
      blips.push({ x: s.pos.x, z: s.pos.z, kind: 'shop' });
    }
    blips.push({ x: RACE_START.x, z: RACE_START.z, kind: 'race' });
    for (const stand of FARE_STANDS) {
      blips.push({ x: stand.x, z: stand.z, kind: 'fare' });
    }
    return {
      city: game.radarCity,
      graph: game.graph,
      playerPos: { x: game.player.x, z: game.player.z },
      playerHeading: game.player.heading,
      objective,
      waypoint: game.waypoint,
      route: game.route,
      waypointRoute: game.waypointRoute,
      blips,
      police: (game.police?.cruisers ?? []).map((c) => ({ x: c.x, z: c.z })),
      northUp: game.settings.radarNorthUp,
      time: game.time,
    };
  };

  game.hudState = function hudState() {
    const player = game.player;
    const vehicle = player.vehicle;
    const district = DISTRICTS[districtAtPos(player.x, player.z)];
    const mission = game.missions;
    const missionActive = mission.status === 'active';
    const sideJobActive = !missionActive && game.sideJobs.active;
    return {
      wanted: game.wanted.level,
      wantedFlashing: game.wanted.flashing,
      money: game.money,
      health: player.health ?? 100,
      armour: player.armour ?? 0,
      weapon: game.combat.weaponId,
      ammo: game.combat.mag[game.combat.weaponId] ?? 0,
      ammoReserve: game.combat.ammo[game.combat.weaponId] ?? 0,
      vehicleName: vehicle?.type.name,
      district: district?.name ?? '',
      street: streetNameAt(player.x, player.z),
      speedKmh: vehicle ? Math.abs(vehicle.speed ?? 0) * 3.6 : 0,
      objective: missionActive
        ? cleanObjectiveText(mission.getObjectiveText())
        : sideJobActive ? game.sideJobs.getObjectiveText() : '',
      objectiveDetail: missionActive
        ? `${mission.mission?.name ?? ''} · ${mission.getChapterLabel()}`
        : sideJobActive ? 'Side job' : '',
      objectiveNext: missionActive
        ? (mission.getObjectiveHint() || mission.getNextObjectiveText())
        : '',
      prompt: game.promptFor(),
      clock: formatClock(game.sky.hour),
      missionTimer: missionActive && mission.mission?.timeLimit
        ? mission.getTimeLeft()
        : sideJobActive ? (game.sideJobs.getTimeLeft() || null) : null,
      inVehicle: Boolean(vehicle),
      rep: { tierName: `${game.rep.tier} · ${game.rep.tierName}`, points: game.rep.points },
      shells: { collected: game.collectibles.count, total: game.collectibles.total },
    };
  };

  game.pauseState = function pauseState() {
    return {
      ...game.radarState(),
      brief: MISSIONS.map((m) => ({
        title: `${m.name} — ${m.giver} (${m.district}) · $${m.reward.toLocaleString('en-US')}${!game.rep.meetsTier(m.requiresTier ?? 1) ? ` · Requires REP tier ${m.requiresTier}` : ''}`,
        done: game.missions.completedIds.includes(m.id),
        active: game.missions.mission?.id === m.id && game.missions.status === 'active',
      })),
      stats: {
        money: game.money,
        completion: completionPercent({
          completedMissions: game.missions.completedIds,
          shells: game.collectibles.serialize(),
          rep: game.rep.points,
        }),
        repTier: game.rep.tier,
        repName: game.rep.tierName,
        repPoints: game.rep.points,
        shells: game.collectibles.count,
        shellsTotal: game.collectibles.total,
        missionsDone: game.stats.missionsPassed,
        missionsTotal: MISSIONS.length,
        sideJobs: game.stats.sideJobs,
        carsStolen: game.stats.carsStolen,
        copsLost: game.stats.copsLost,
        busted: game.stats.busted,
        wasted: game.stats.deaths,
        distanceDriven: game.stats.distanceDriven,
        playTime: game.stats.playSeconds,
      },
      settings: game.settings,
      hasActiveMission: game.missions.status === 'active',
    };
  };

  /** Render one frame: 3D scene, tracers, radar, HUD. */
  game.render = function render(frameDt, orbitMode = false) {
    if (orbitMode) {
      // Title screen: a slow orbit over the city centre.
      const angle = game.time * 0.04;
      camera.position.set(Math.sin(angle) * 150, 75, Math.cos(angle) * 150);
      camera.lookAt(0, 0, 0);
    } else {
      // The player owns the chase camera (orbit yaw + pitch from mouse drags).
      game.player.updateCamera(camera, frameDt);
    }
    if (typeof game.city.setNight === 'function') game.city.setNight(game.sky.nightFactor);
    for (let i = game.tracers.length - 1; i >= 0; i -= 1) {
      const t = game.tracers[i];
      t.ttl -= frameDt;
      if (t.ttl <= 0) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        game.tracers.splice(i, 1);
      } else {
        t.line.material.opacity = t.ttl / 0.09;
      }
    }
    renderer.render(scene, camera);
    if (radarCtx) drawRadar(radarCtx, game.radarState());
    game.hud.update(game.hudState());
  };

  game.respawn = function respawn() {
    const kind = game.deadKind ?? 'wasted';
    const landmark = LANDMARKS.find((l) => l.id === (kind === 'busted' ? 'police' : 'hospital'));
    const pos = landmark ? landmarkPos(landmark) : { x: SPAWN.x, z: SPAWN.z };
    if (kind === 'wasted') {
      game.money = Math.max(0, game.money - WANTED_CFG.hospitalCost);
      game.stats.deaths += 1;
    } else {
      game.stats.busted += 1;
    }
    game.wanted.reset();
    game.prevWantedLevel = 0;
    game.player.respawn(pos.x, pos.z);
    game.player.heading = SPAWN.heading;
    game.player._camYaw = SPAWN.heading;
    game.player.mesh.rotation.y = SPAWN.heading;
    game.deadKind = null;
    game.save();
  };

  game.reset();
  return game;
}

const game = createGame(seed);
// Exposed for headless playtests (not part of the game itself).
window.__solmarGame = game;

function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

function runShot(name) {
  game.hud.setVisible(true);
  const staged = stageShot(name, game);
  // The map shot never steps, so plan its GPS route up front (the chase and
  // race shots re-plan in step() anyway).
  game.planRoutes();
  // Staging drives an autopilot through the city: crimes it commits on the
  // way (clipped peds) are staging artefacts, not player crimes.
  game.suppressCrimes = true;
  for (let i = 0; i < staged.steps; i += 1) {
    const input = staged.drive ? staged.drive(i, game.player._camYaw ?? game.player.heading) : null;
    game.step(STEP, virtualInput(input), 0);
  }
  game.suppressCrimes = false;
  // Final dress-up: roadblocks, parked cars — placed after the drive so the
  // autopilot cannot disturb them.
  if (staged.settle) staged.settle(game);
  if (staged.screen === 'pause') {
    game.hud.setVisible(false);
    const menus = new Menus({});
    menus.showPause(game.pauseState());
    menus.selectTab('map');
  }
  let painted = 0;
  function paint() {
    game.render(STEP, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  let demoTarget = null;
  const driver = new AutoDriver(game);

  const menus = new Menus({
    onNew: () => {
      game.audio.unlock();
      game.audio.play('click');
      game.reset();
      game.money = defaultSave().money;
      game.save();
      screen = 'play';
      menus.hideAll();
      game.hud.setVisible(true);
      announce('Playing Solmar City.');
    },
    onContinue: () => {
      game.audio.unlock();
      game.audio.play('click');
      game.applySave(loadGame());
      screen = 'play';
      menus.hideAll();
      game.hud.setVisible(true);
      announce('Playing Solmar City.');
    },
    onResume: () => {
      game.audio.unlock();
      if (screen === 'dead') game.respawn();
      if (screen === 'mission') {
        // Leave the card behind: the mission is over, free roam resumes.
        game.missions.status = 'idle';
        game.missions.mission = null;
        game.updateMarker(true);
      }
      screen = 'play';
      menus.hideAll();
      game.hud.setVisible(true);
    },
    onQuitToTitle: () => {
      game.save();
      screen = 'title';
      menus.showStart(hasSave());
      game.hud.setVisible(false);
    },
    onRestartMission: () => {
      const id = game.missions.mission?.id;
      menus.hideAll();
      if (id) {
        game.missions.status = 'idle';
        // Retry after death: respawn the player at the giver with full
        // health first, or the restart fails again on the next step.
        // Hostiles and mission cars reset too, so the retry is clean.
        const def = MISSIONS.find((m) => m.id === id);
        game.clearHostiles();
        game.restoreMissionVehicles();
        game.wanted.reset();
        game.prevWantedLevel = 0;
        if (def) {
          game.player.respawn(def.giverPos.x, def.giverPos.z);
          game.player.heading = SPAWN.heading;
          game.player._camYaw = SPAWN.heading;
          game.player.mesh.rotation.y = SPAWN.heading;
        } else {
          game.player.health = PLAYER_CFG.maxHealth;
        }
        game.startMission(id);
      }
      screen = 'play';
      game.hud.setVisible(true);
    },
    onAbandonMission: () => {
      if (game.missions.status !== 'active') return;
      game.missions.abandon();
      game.clearHostiles();
      game.restoreMissionVehicles();
      game.updateMarker(true);
      game.subtitleQueue = [];
      game.hud.hideSubtitle?.();
      game.lastMissionStatus = 'idle';
      game.save();
      game.hud.toast('Mission abandoned', 2);
      screen = 'play';
      menus.hidePause();
      game.hud.setVisible(true);
    },
    onWaypoint: (waypoint) => {
      game.setWaypoint(waypoint);
    },
    onSetting: (key, value) => {
      if (key === 'northUp') game.settings.radarNorthUp = Boolean(value);
      else if (key === 'muted') {
        game.settings.sfx = !value;
        game.settings.music = !value;
        game.audio.enabled = !value;
      } else if (key === 'showSpeed') game.settings.showSpeed = Boolean(value);
      game.save();
    },
  });
  menus.applySettings(game.settings);

  // First gesture unlocks audio (autoplay policy); also unlock on any key.
  const unlockOnce = () => game.audio.unlock();
  window.addEventListener('pointerdown', unlockOnce, { once: true });
  window.addEventListener('keydown', unlockOnce, { once: true });

  window.addEventListener('resize', () => {
    game.renderer.setSize(window.innerWidth, window.innerHeight);
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'pause';
      game.save();
      menus.showPause(game.pauseState());
      announce('Paused.');
    }
  });

  function startDemo() {
    game.putPlayerInCar('taxi', 0xf2c200, 0, 0, 0);
    screen = 'play';
    game.hud.setVisible(true);
    announce('Demo mode: the autopilot is driving.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (screen === 'title') {
      if (actions & ACTION_CONFIRM) menus.cb.onNew();
      return;
    }
    if (screen === 'mission' || screen === 'dead') {
      if (actions & ACTION_CONFIRM) menus.cb.onResume();
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === 'play') {
        screen = 'pause';
        game.save();
        menus.showPause(game.pauseState());
        announce('Paused.');
      } else if (screen === 'pause') {
        screen = 'play';
        menus.hidePause();
      }
      return;
    }
    if (screen !== 'play') return;
    if (actions & ACTION_MISSIONS) {
      screen = 'pause';
      menus.showPause(game.pauseState());
      menus.selectTab('brief');
      return;
    }
    if (actions & ACTION_MAP) {
      screen = 'pause';
      menus.showPause(game.pauseState());
      menus.selectTab('map');
      return;
    }
    if (actions & ACTION_INTERACT) game.interact();
    // The rest (ENTER for the player, weapon/reload for combat) flows into
    // step() via the actions argument; the player consumes ENTER itself.
    game.pendingActions = actions;
  }

  function checkEdges() {
    // Mission pass / fail.
    if (game.missions.status !== game.lastMissionStatus) {
      const status = game.missions.status;
      if (status === 'passed') {
        const reward = game.missions.getReward();
        const repResult = game.rep.add(game.missions.getRepReward());
        game.applyTierUnlocks(repResult.newTier.tier);
        game.money += reward;
        game.stats.missionsPassed += 1;
        game.subtitleQueue = [];
        game.hud.hideSubtitle?.();
        game.save();
        game.audio.play('passed');
        screen = 'mission';
        // MISSION PASSED screen: payout + REP + unlock, on the card.
        let cardText = `${game.missions.getClosingLine()} +${repResult.gained} REP.`;
        if (repResult.tierUp) {
          cardText += ` REP ${repResult.newTier.tier} · ${repResult.newTier.name} — ${repResult.unlock}.`;
        }
        menus.showMission(true, cardText, reward);
        announce(`Mission passed. Reward $${reward}.`);
      } else if (status === 'failed') {
        game.stats.missionsFailed += 1;
        game.subtitleQueue = [];
        game.hud.hideSubtitle?.();
        game.save();
        game.audio.play('failed');
        screen = 'mission';
        menus.showMission(false, game.missions.failReason || game.missions.getClosingLine(), 0);
        announce('Mission failed.');
      }
      game.lastMissionStatus = status;
    }
    // Busted / wasted.
    if (game.wanted.busted && screen === 'play') {
      game.deadKind = 'busted';
      let deadText = 'The Solmar PD took you in. Your car is impounded and your wanted level is cleared.';
      // BUSTED fails the mission, like WASTED does (P1-9): the BUSTED card
      // carries the news, so the FAILED card is suppressed by syncing the
      // last-seen status past it.
      if (game.missions.status === 'active') {
        game.missions.failMission('Busted by the Solmar PD.');
        game.stats.missionsFailed += 1;
        game.clearHostiles();
        game.missions.status = 'idle';
        game.missions.mission = null;
        game.lastMissionStatus = 'idle';
        game.updateMarker(true);
        game.subtitleQueue = [];
        game.hud.hideSubtitle?.();
        game.save();
        deadText += ' Your mission failed.';
      }
      screen = 'dead';
      menus.showDead('busted', deadText);
      announce('Busted.');
    } else if (game.player.dead && screen === 'play') {
      game.deadKind = 'wasted';
      screen = 'dead';
      menus.showDead('wasted', `You woke up at St. Marina General. The bill is $${WANTED_CFG.hospitalCost}.`);
      announce('Wasted.');
    }
  }

  function step() {
    if (screen === 'title') {
      // Ambient city behind the start screen: traffic, peds and the clock.
      game.time += STEP;
      game.sky.update(STEP);
      const ctx = game.worldCtx(virtualInput());
      game.traffic?.update(STEP, ctx);
      game.peds?.update(STEP, ctx);
      return;
    }
    if (screen !== 'play') return;
    let inputObj;
    let actions = game.pendingActions ?? 0;
    game.pendingActions = 0;
    if (demo) {
      // Attract mode: the autopilot drives to random intersections.
      const player = game.player;
      if (!demoTarget || dist2(player.x, player.z, demoTarget.x, demoTarget.z) < 15 * 15) {
        demoTarget = game.graph.nodePos(game.graph.randomNode(game.rng));
      }
      inputObj = virtualInput(driver.driveTo(demoTarget));
      actions = 0;
    } else {
      inputObj = input;
    }
    game.stats.playSeconds += STEP;
    game.step(STEP, inputObj, actions);
    checkEdges();
    // Autosave every 30 seconds of play.
    if (game.time - game.savedAt > 30) {
      game.savedAt = game.time;
      game.save();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += frameDt;
    last = now;
    // Tab is the map key only during play; on any menu screen it must move
    // focus natively, so keyboard-only players can reach every menu button.
    input.setMenuOpen(screen !== 'play');
    handleActions();
    if (screen === 'title' || screen === 'play') {
      while (accumulator >= STEP && (screen === 'title' || screen === 'play')) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    game.render(frameDt || STEP, screen === 'title');
    if (screen === 'title' || screen === 'pause' || screen === 'mission' || screen === 'dead') {
      game.hud.setVisible(false);
    } else {
      game.hud.setVisible(true);
    }
  }

  if (demo) {
    startDemo();
  } else {
    menus.showStart(hasSave());
    game.hud.setVisible(false);
    announce('Solmar City. Press Enter or click New Game to start.');
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
