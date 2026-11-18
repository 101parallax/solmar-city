// Entities test harness (Worker B). Runs in headless Chromium via Playwright.
// 1. Logic sim: 60 s of fixed-step play with a scripted input, no rendering.
//    Checks steal / wanted / pursuit / mission wiring / ped states / streaming.
// 2. Staged scenes for screenshots: window.__stage('chase'|'street'|'top').
// Results land in window.__simResults; window.__shotReady signals completion.
//
// The city here is a TEST stand-in (flat ground + box blocks + road strips),
// not the real world/city.js — it exists only so entities are visible.
// The road graph, wanted system and mission engine are the REAL modules.
import * as THREE from 'three';
import { createRandom } from '../../game/src/random.js';
import { RoadGraph } from '../../game/src/world/roadgraph.js';
import { STREET_COORDS, DISTRICT_GRID, districtAt } from '../../game/src/data/city.js';
import { CITY, PALETTE } from '../../game/src/config.js';
import { ACTION_ENTER } from '../../game/src/input.js';
import { Player } from '../../game/src/entities/player.js';
import { TrafficManager } from '../../game/src/entities/traffic.js';
import { PedestrianManager } from '../../game/src/entities/pedestrians.js';
import { Police } from '../../game/src/entities/police.js';
import { resolveVehicleCollisions } from '../../game/src/entities/vehicles.js';
import { Wanted } from '../../game/src/systems/wanted.js';
import { MissionManager } from '../../game/src/systems/missions.js';

const results = { errors: [], checks: [], counts: {} };
function check(name, pass, detail = '') {
  results.checks.push({ name, pass: !!pass, detail: String(detail) });
}
window.addEventListener('error', (e) => results.errors.push(String(e.message || e.error)));

const rng = createRandom(1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87bfe8);
scene.fog = new THREE.Fog(0x87bfe8, 200, 700);
const camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
renderer.setSize(1280, 720);
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(120, 180, 60);
scene.add(sun, new THREE.AmbientLight(0xffffff, 0.9));

// ---- test-only city stand-in: ground, road strips, block boxes ----
{
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  for (const c of STREET_COORDS) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(12, 580), roadMat);
    a.rotation.x = -Math.PI / 2;
    a.position.set(c, 0.02, 0);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(580, 12), roadMat);
    b.rotation.x = -Math.PI / 2;
    b.position.set(0, 0.02, c);
    scene.add(a, b);
  }
  const blockRng = createRandom(7);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const district = districtAt(col, row);
      const colors = PALETTE.districts[district].wall;
      const n = district === 'downtown' ? 1 : 2 + Math.floor(blockRng() * 2);
      for (let i = 0; i < n; i++) {
        const w = 14 + blockRng() * 14;
        const d = 14 + blockRng() * 14;
        const h = district === 'downtown' ? 30 + blockRng() * 70 : 7 + blockRng() * 8;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: colors[Math.floor(blockRng() * colors.length)] }),
        );
        const bx = STREET_COORDS[col] + 10 + blockRng() * 40;
        const bz = STREET_COORDS[row] + 10 + blockRng() * 40;
        box.position.set(bx, h / 2, bz);
        scene.add(box);
      }
    }
  }
}

// ---- world ----
const graph = new RoadGraph();
const police = new Police(scene, graph, createRandom(11));
const wanted = new Wanted(police);
const missions = new MissionManager();
const player = new Player(scene, { x: 140, z: -120 });
const traffic = new TrafficManager(scene, graph, createRandom(21));
const peds = new PedestrianManager(scene, graph, createRandom(31));
const crimes = [];
const world = {
  graph, player, traffic, pedestrians: peds, police,
  vehicles: [], alerts: [], policeShots: [], actions: 0, time: 0,
  // Test stand-in for world/city.js collision: clamp everything to the city
  // edge (|x|, |z| <= 285). The real game also pushes entities out of
  // buildings through this same hook.
  collideCircle(x, z, r) {
    const lim = 285 - r;
    const cx = Math.max(-lim, Math.min(lim, x));
    const cz = Math.max(-lim, Math.min(lim, z));
    if (cx === x && cz === z) return null;
    return { x: cx, z: cz };
  },
  onCrime: (type, pos) => {
    crimes.push({ type, pos: { ...pos } });
    wanted.addCrime(type, pos, true);
  },
};
function refreshVehicles() {
  world.vehicles = traffic.vehicles.concat(police.cruiserVehicles);
}

// Scripted input: the harness drives these fields per phase.
const script = { move: { x: 0, y: 0 }, run: false, brake: false, actions: 0 };
const input = {
  move: () => ({ ...script.move }),
  run: () => script.run,
  brake: () => script.brake,
  shooting: () => false,
  lookDelta: () => ({ x: 0, y: 0 }),
  takeActions: () => 0,
  pointer: () => ({ x: 0, y: 0 }),
};
world.input = input;

const STEP = 1 / 60;
function step() {
  world.time += STEP;
  world.actions = script.actions;
  script.actions = 0;
  // Alerts live one frame: they are read during this step, cleared at its end.
  refreshVehicles();
  player.update(STEP, world);
  refreshVehicles();
  traffic.update(STEP, world);
  peds.update(STEP, world);
  police.update(STEP, world);
  refreshVehicles();
  resolveVehicleCollisions(world.vehicles, STEP);
  player.syncToVehicle(); // collisions move the driven car after player.update
  const policeVisible = police.canSeePlayer(player.pos);
  const officerClose = police.officerCloseTo(player.pos);
  wanted.update(STEP, player.pos, policeVisible, { onFoot: player.onFoot, officerClose });
  const target = traffic.getMissionVehicle('m3-target');
  missions.update(STEP, {
    player: { pos: player.pos, vehicleId: player.vehicleId },
    defeatedCount: 0,
    targetVehicle: target ? { pos: target.position, speed: Math.abs(target.speed), wrecked: target.wrecked } : null,
    playerDead: player.dead,
  });
  world.alerts = [];
  // policeShots accumulate (the harness counts them); a real main.js would
  // drain them for tracers each frame.
}
function runSeconds(n) {
  const steps = Math.round(n / STEP);
  for (let i = 0; i < steps; i++) step();
}

// ---- Phase 1: walk on foot (10 s) ----
script.move = { x: 0, y: 1 };
const walkStart = { ...player.pos };
runSeconds(10);
const walkDist = Math.hypot(player.pos.x - walkStart.x, player.pos.z - walkStart.z);
check('player walks on foot', walkDist > 25, `walked ${walkDist.toFixed(1)} m in 10 s`);
check('peds populated', peds.count >= 30, `${peds.count} peds`);
check('traffic populated', traffic.count >= 18, `${traffic.count} cars`);
check('parked cars placed', traffic.parked.length >= 20, `${traffic.parked.length} parked`);

// ---- Phase 2: steal the M1 target ----
missions.start('m1');
const m1 = traffic.getMissionVehicle('m1-target');
check('m1-target exists', !!m1, m1 ? `${m1.type.name} at (${m1.x.toFixed(0)}, ${m1.z.toFixed(0)})` : 'missing');
player.x = m1.x + 2;
player.z = m1.z + 2;
player.mesh.position.set(player.x, 0, player.z);
script.move = { x: 0, y: 0 };
runSeconds(0.5);
script.actions = ACTION_ENTER;
runSeconds(0.5);
check('steal: player in m1-target', player.vehicleId === 'm1-target', `vehicleId=${player.vehicleId}`);
check('steal: mission objective 2 done', missions.objectiveIndex >= 2, `objectiveIndex=${missions.objectiveIndex}`);
check('steal: crime reported', crimes.some((c) => c.type === 'steal'), JSON.stringify(crimes));
check('steal: wanted level 1', wanted.level === 1, `level=${wanted.level}`);
check('steal: 1 cruiser pursuing', police.cruisers.length === 1, `${police.cruisers.length} cruisers`);

// ---- Phase 3: drive (15 s, gentle meander to stay on city streets) ----
const steerPlan = [0, 0, 0.3, 0.3, 0, 0, -0.3, -0.3, 0, 0, 0.3, 0, 0, -0.3, 0];
const driveTrace = [];
for (const s of steerPlan) {
  script.move = { x: s, y: 1 };
  runSeconds(1);
  driveTrace.push(`${Math.abs(player.vehicle.speed).toFixed(0)}m/s d${player.vehicle.damage.toFixed(2)}`);
}
const driveSpeed = player.vehicle ? Math.abs(player.vehicle.speed) : 0;
const driveDmg = player.vehicle ? player.vehicle.damage.toFixed(2) : '?';
const driveWrecked = player.vehicle ? player.vehicle.wrecked : '?';
check('driving: car moves', driveSpeed > 5, `speed=${driveSpeed.toFixed(1)} m/s dmg=${driveDmg} wrecked=${driveWrecked} | ${driveTrace.join(' ')}`);
check('driving: player follows car', Math.hypot(player.x - player.vehicle.x, player.z - player.vehicle.z) < 0.01, 'pos synced');

// ---- Phase 4: wanted 3+ -> pursuit + officers shoot ----
// (The level may already be above 1 from a runover in phase 3, so the checks
// are adaptive: the pursuit must field exactly one cruiser per star.)
wanted.addCrime('shooting', player.pos, true);
wanted.addCrime('shooting', player.pos, true);
check('wanted level 3+', wanted.level >= 3, `level=${wanted.level}`);
check('cruisers match stars', police.cruisers.length === wanted.level,
  `${police.cruisers.length} cruisers at ${wanted.level} stars`);
const chaseStart = police.cruisers.map((c) => Math.hypot(c.x - player.x, c.z - player.z));
script.move = { x: 0, y: 1 };
runSeconds(10);
const chaseEnd = police.cruisers.map((c) => Math.hypot(c.x - player.x, c.z - player.z));
const closestEnd = Math.min(...chaseEnd);
check('cruisers close in', closestEnd < Math.min(...chaseStart) || closestEnd < 60,
  `closest ${Math.min(...chaseStart).toFixed(0)} m -> ${closestEnd.toFixed(0)} m`);
// Exit the car: officers should deploy and shoot at 3 stars.
script.actions = ACTION_ENTER;
runSeconds(0.5);
script.move = { x: 0, y: 0 };
runSeconds(8);
check('officers deploy on foot', police.officers.length >= 2, `${police.officers.length} officers`);
const shotsBefore = world.policeShots.length;
player.heal(100); // full health, so the 4 s fire window cannot kill the player
const hpBefore = player.health;
runSeconds(4);
check('officers shoot at 3 stars', world.policeShots.length > shotsBefore,
  `${world.policeShots.length - shotsBefore} shots in 4 s`);
check('officer fire damages player', player.health < hpBefore, `health ${hpBefore} -> ${player.health}`);

// ---- Phase 5: releaseAll + hide decay ----
wanted.clearWanted();
runSeconds(1);
check('releaseAll clears cruisers', police.cruisers.length === 0, `${police.cruisers.length} cruisers`);
check('releaseAll clears officers', police.officers.length === 0, `${police.officers.length} officers`);
check('wanted cleared', wanted.level === 0, `level=${wanted.level}`);

// ---- Phase 6: ped flee + knockdown ----
if (peds.peds.length === 0) peds.spawnNearPlayer(player.x, player.z);
// Pick a ped with no car nearby, so the alert — not a collision — is what
// makes them run.
const alerted = peds.peds.find((p) => !world.vehicles.some((v) => Math.hypot(v.x - p.x, v.z - p.z) < 15))
  || peds.peds[0];
const pedBefore = { x: alerted.x, z: alerted.z, state: alerted.state };
world.alerts.push({ x: alerted.x, z: alerted.z, radius: 30 });
runSeconds(2);
check('ped flees from alert', alerted.state === 'flee' || Math.hypot(alerted.x - pedBefore.x, alerted.z - pedBefore.z) > 3,
  `state=${alerted.state}`);
// Knockdown: put a ped 6 m in front of the player's fast car and drive into
// it. Close + fast, so the ped's dodge reflex cannot clear the car's path.
player.x = 0;
player.z = -60;
const victim = peds.spawnAt(0, -54);
victim.state = 'idle';
victim.stateTime = 0;
victim.target = { x: 0, z: -54 };
const testCar = traffic.parked[0];
testCar.x = 0;
testCar.z = -60;
testCar.heading = 0;
testCar.mesh.position.set(0, 0, -60);
testCar.mesh.rotation.y = 0;
player.enterVehicle(testCar, world);
testCar.speed = 25;
script.move = { x: 0, y: 1 };
runSeconds(3);
check('ped knocked down by car', victim.state === 'down' || victim.state === 'flee', `state=${victim.state}`);
check('runover crime reported', crimes.some((c) => c.type === 'runover'), `crimes=${crimes.map((c) => c.type).join(',')}`);
// Move the victim onto the sidewalk: on the road, passing traffic would
// knock them down again before the recovery check runs.
victim.x = 7.5;
victim.mesh.position.set(7.5, 0, victim.z);
runSeconds(2.5);
check('ped gets up and flees', victim.state !== 'down', `state=${victim.state}`);
script.actions = ACTION_ENTER;
runSeconds(0.5);
wanted.clearWanted(); // the runover starred the player; clear it for phase 7
player.heal(100);

// ---- Phase 7: M3 flee car ----
const m3 = traffic.getMissionVehicle('m3-target');
check('m3-target exists', !!m3, m3 ? `at (${m3.x.toFixed(0)}, ${m3.z.toFixed(0)})` : 'missing');
const activated = traffic.activateMissionVehicle('m3-target');
check('m3 flee activated', activated, '');
player.x = m3.x + 10;
player.z = m3.z;
player.mesh.position.set(player.x, 0, player.z);
const m3Start = { x: m3.x, z: m3.z };
const m3Car = traffic.cars.find((c) => c.vehicle === m3);
const m3Trace = [];
for (let s = 0; s < 10; s++) {
  runSeconds(1);
  m3Trace.push(`${Math.abs(m3.speed).toFixed(0)}m/s seg${m3Car.seg}/${m3Car.route.length} blk${m3Car.blockedTimer.toFixed(0)} ovt${m3Car.overtaking ? 1 : 0}`);
}
const m3Moved = Math.hypot(m3.x - m3Start.x, m3.z - m3Start.z);
check('m3 flee car drives away', m3Moved > 30, `moved ${m3Moved.toFixed(1)} m | ${m3Trace.join(' ')}`);

// ---- Phase 8: M1 deliver -> mission passed (teleport to the garage) ----
// Direct enter (the F-key path is already covered in phase 2): a passing
// traffic car could otherwise be nearer than m1 and get entered instead.
player.enterVehicle(m1, world);
check('M1: back in m1-target', player.vehicleId === 'm1-target', `vehicleId=${player.vehicleId}`);
const deliver = missions.mission.objectives[2];
m1.x = deliver.pos.x;
m1.z = deliver.pos.z;
m1.mesh.position.set(m1.x, 0, m1.z);
player.x = m1.x;
player.z = m1.z;
runSeconds(1);
check('M1 passed', missions.status === 'passed', `status=${missions.status} objective=${missions.objectiveIndex}`);
wanted.clearWanted();

// ---- totals ----
results.counts = {
  peds: peds.count,
  traffic: traffic.count,
  parked: traffic.parked.length,
  crimes: crimes.length,
  simSeconds: Math.round(world.time),
};
const failed = results.checks.filter((c) => !c.pass);
results.passed = results.checks.length - failed.length;
results.total = results.checks.length;
results.errors.push(...failed.map((c) => `FAIL: ${c.name} (${c.detail})`));
window.__simResults = results;

// ---- staged scenes for screenshots ----
function stageChase() {
  // Player in a sports car downtown, wanted 3, cruisers behind, golden light.
  wanted.clearWanted();
  player.respawn(70, -70);
  const car = traffic.parked.find((v) => v.type.id === 'sports') || traffic.parked[0];
  car.x = 70;
  car.z = -70;
  car.heading = Math.PI / 2;
  car.mesh.position.set(70, 0, -70);
  car.mesh.rotation.y = car.heading;
  player.enterVehicle(car, world);
  wanted.addCrime('shooting', player.pos, true);
  wanted.addCrime('shooting', player.pos, true);
  wanted.addCrime('shooting', player.pos, true);
  runSeconds(3);
  // Stage the cruisers visibly behind the player's car for the screenshot.
  police.cruisers.forEach((c, i) => {
    const back = 14 + i * 9;
    c.vehicle.x = car.x - Math.sin(car.heading) * back + (i - 1) * 4;
    c.vehicle.z = car.z - Math.cos(car.heading) * back;
    c.vehicle.heading = car.heading;
    c.vehicle.speed = 12;
    c.vehicle.mesh.position.set(c.vehicle.x, 0, c.vehicle.z);
    c.vehicle.mesh.rotation.y = c.vehicle.heading;
  });
  runSeconds(0.5);
  player.updateCamera(camera, 1);
  camera.position.y += 1.5;
}
function stageStreet() {
  wanted.clearWanted();
  player.respawn(-70, 70);
  runSeconds(2);
  player._camYaw = Math.PI * 0.75;
  player.updateCamera(camera, 1);
}
function stageTop() {
  wanted.clearWanted();
  camera.position.set(0, 320, 120);
  camera.lookAt(0, 0, 0);
}
function stagePolice() {
  // Close-up: a cruiser + an officer, so the livery and uniform can be read.
  wanted.clearWanted();
  player.respawn(0, 0);
  player._camYaw = 0;
  wanted.addCrime('shooting', player.pos, true);
  runSeconds(1);
  const cruiser = police.cruisers[0];
  cruiser.vehicle.x = 0;
  cruiser.vehicle.z = 12;
  cruiser.vehicle.heading = Math.PI;
  cruiser.vehicle.speed = 0;
  cruiser.vehicle.mesh.position.set(0, 0, 12);
  cruiser.vehicle.mesh.rotation.y = Math.PI;
  runSeconds(1);
  const officer = police.officers[0];
  if (officer) {
    officer.x = 3;
    officer.z = 8;
    officer.mesh.position.set(3, 0, 8);
  }
  camera.position.set(0, 2.2, 2);
  camera.lookAt(0, 1.2, 12);
}
window.__stage = (name) => {
  if (name === 'chase') stageChase();
  else if (name === 'street') stageStreet();
  else if (name === 'police') stagePolice();
  else stageTop();
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
};
window.__render = () => renderer.render(scene, camera);
window.__simResults = results;
