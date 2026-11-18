// Traffic AI: ~20 cars driving the road graph with pure pursuit, slowing for
// corners, braking for obstacles, overtaking when blocked, plus parked cars
// along the kerbs. Population streams around the player (spawn inside
// TRAFFIC.spawnDistance, despawn past TRAFFIC.despawnDistance).
//
// This manager also owns the mission vehicles (data/missions.js): m1-target
// (Vortex GT, parked in Downtown) and m3-target (Eddie's coupe, parked in
// Vista Hills, flee AI armed by activateMissionVehicle). Mission cars are
// never despawned and never reclaimed. main.js reads them through
// getMissionVehicle(id) to build state.targetVehicle.
//
// Collisions are NOT resolved here: main.js calls resolveVehicleCollisions
// once per frame with world.vehicles (traffic + police cruisers).
import { Vehicle } from './vehicles.js';
import { randomTrafficType, randomColor } from '../data/vehicles.js';
import { MISSIONS } from '../data/missions.js';
import { TRAFFIC } from '../config.js';
import { adaptGraph, LANE_OFFSET, angleDiff, clamp, lerp } from './graph.js';

export class TrafficManager {
  // `graph` is the raw RoadGraph; it is adapted internally.
  constructor(scene, graph, rng, opts = {}) {
    this.scene = scene;
    this.graph = graph ? adaptGraph(graph) : null;
    this.rng = rng;
    this.target = opts.target ?? TRAFFIC.activeCars;
    this.parkedTarget = opts.parkedCars ?? TRAFFIC.parkedCars;
    this.spawnDistance = opts.spawnDistance ?? TRAFFIC.spawnDistance;
    this.despawnDistance = opts.despawnDistance ?? TRAFFIC.despawnDistance;
    this.cars = []; // TrafficCar[]
    this.parked = []; // Vehicle[]
    this.mission = new Map(); // id -> { vehicle, mode, armed }
    this.spawnParked();
    this.spawnMissionVehicles();
  }

  // Every vehicle this manager owns (AI + parked + mission), for
  // world.vehicles and collision. Stolen cars stay in the list; their AI
  // wrapper stops driving them and the player drives instead.
  get vehicles() {
    const out = this.cars.map((c) => c.vehicle);
    for (const v of this.parked) out.push(v);
    return out;
  }

  get count() {
    return this.cars.length;
  }

  spawnParked() {
    if (!this.graph) return;
    let placed = 0;
    let tries = 0;
    while (placed < this.parkedTarget && tries < this.parkedTarget * 12) {
      tries += 1;
      const edge = this.graph.randomEdge(this.rng);
      const t = 0.15 + this.rng() * 0.7;
      const side = this.rng() < 0.5 ? 1 : -1;
      const p = this.graph.edgePoint(edge, t, 4.8 * side);
      const heading = this.graph.edgeHeading(edge) + (side < 0 ? Math.PI : 0);
      if (Math.hypot(p.x, p.z) < 25) continue; // keep the spawn clear
      let crowded = false;
      for (const v of this.parked) {
        if (Math.hypot(v.x - p.x, v.z - p.z) < 7) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
      const type = randomTrafficType(this.rng);
      const car = new Vehicle(this.scene, type.id, randomColor(type, this.rng), {
        x: p.x, z: p.z, heading, driver: false, parked: true,
      });
      this.parked.push(car);
      placed += 1;
    }
  }

  // Mission target cars, from data/missions.js: every steal objective parks
  // its car, every chase objective stages a flee car. Vehicle type and color
  // come from the objective (defaults: sports, red for steal / blue for chase).
  spawnMissionVehicles() {
    if (!this.graph) return;
    for (const mission of MISSIONS) {
      for (const objective of mission.objectives) {
        if (objective.type !== 'steal' && objective.type !== 'chase') continue;
        if (!objective.vehicleId) continue;
        const mode = objective.type === 'chase' ? 'flee' : 'parked';
        const color = objective.vehicleColor ?? (mode === 'flee' ? 0x1f6fd2 : 0xd21f2b);
        this.spawnMissionVehicle(
          objective.vehicleId,
          objective.vehicleType ?? 'sports',
          objective.pos.x + 4.5,
          objective.pos.z,
          Math.PI,
          { mode, color },
        );
      }
    }
  }

  spawnMissionVehicle(id, typeId, x, z, heading, opts = {}) {
    const vehicle = new Vehicle(this.scene, typeId, opts.color ?? 0xd21f2b, {
      id, x, z, heading, driver: opts.mode !== 'parked', parked: true,
    });
    this.parked.push(vehicle);
    this.mission.set(id, { vehicle, mode: opts.mode || 'parked', armed: false });
    return vehicle;
  }

  getMissionVehicle(id) {
    return this.mission.get(id)?.vehicle ?? null;
  }

  // Arm the flee AI (called when the M3 chase objective begins). Without this
  // call the coupe stays parked — the chase is still completable by driving
  // up to it, so a missing call degrades gracefully instead of breaking M3.
  activateMissionVehicle(id) {
    const entry = this.mission.get(id);
    if (!entry || entry.mode !== 'flee' || entry.armed) return false;
    entry.armed = true;
    const idx = this.parked.indexOf(entry.vehicle);
    if (idx >= 0) this.parked.splice(idx, 1);
    entry.vehicle.parked = false;
    entry.vehicle.driver = true;
    const car = new TrafficCar(this, entry.vehicle, [], { flee: true });
    car.newRoute({ player: { x: entry.vehicle.x + 100, z: entry.vehicle.z } });
    this.cars.push(car);
    return true;
  }

  spawnCarNear(px, pz) {
    if (!this.graph) return null;
    for (let tries = 0; tries < 16; tries += 1) {
      const edge = this.graph.randomEdge(this.rng);
      const flip = this.rng() < 0.5;
      const t = this.rng();
      const p = this.graph.edgePoint({ a: flip ? edge.b : edge.a, b: flip ? edge.a : edge.b }, t, LANE_OFFSET);
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < 40 || d > this.spawnDistance) continue;
      const heading = this.graph.edgeHeading({ a: flip ? edge.b : edge.a, b: flip ? edge.a : edge.b });
      const type = randomTrafficType(this.rng);
      const vehicle = new Vehicle(this.scene, type.id, randomColor(type, this.rng), {
        x: p.x, z: p.z, heading,
      });
      vehicle.speed = TRAFFIC.cruiseSpeed;
      const behind = flip ? edge.b : edge.a;
      const ahead = flip ? edge.a : edge.b;
      const dest = this.graph.randomNode(this.rng);
      const path = this.graph.findPath(ahead, dest);
      const route = [behind, ...(path.length ? path : [ahead, dest])];
      const cruise = TRAFFIC.cruiseSpeed + (this.rng() - 0.5) * 2 * TRAFFIC.cruiseJitter;
      const car = new TrafficCar(this, vehicle, route, { cruise });
      this.cars.push(car);
      return car;
    }
    return null;
  }

  update(dt, world) {
    const px = world?.player?.x ?? 0;
    const pz = world?.player?.z ?? 0;
    // Streaming: despawn far AI cars, top the population back up.
    for (let i = this.cars.length - 1; i >= 0; i -= 1) {
      const car = this.cars[i];
      const v = car.vehicle;
      const d = Math.hypot(v.x - px, v.z - pz);
      const isMission = this.mission.has(v.id);
      if (v.stolen && d > 120 && !isMission) {
        // Abandoned by the player far away: becomes a parked car.
        v.stolen = false;
        v.parked = true;
        v.setControl({ throttle: 0, brake: 0.5, steer: 0, handbrake: true });
        this.parked.push(v);
        this.cars.splice(i, 1);
      } else if (!v.stolen && !isMission && d > this.despawnDistance) {
        v.destroy();
        this.cars.splice(i, 1);
      }
    }
    let guard = 0;
    while (this.cars.length < this.target && guard < 4) {
      guard += 1;
      if (!this.spawnCarNear(px, pz)) break;
    }
    for (const car of this.cars) car.update(dt, world);
  }

  destroy() {
    for (const car of this.cars) car.vehicle.destroy();
    for (const v of this.parked) v.destroy();
    this.cars = [];
    this.parked = [];
    this.mission.clear();
  }
}

// One AI-driven car: a Vehicle plus a route through the graph.
class TrafficCar {
  constructor(manager, vehicle, route, opts = {}) {
    this.manager = manager;
    this.vehicle = vehicle;
    this.graph = manager.graph;
    this.route = route; // node ids, route[0] is the node behind the car
    this.seg = 0; // current segment index: route[seg] -> route[seg+1]
    this.cruise = opts.cruise ?? TRAFFIC.cruiseSpeed;
    this.flee = !!opts.flee;
    this.blockedTimer = 0;
    this.overtaking = false;
    this.latOffset = 0; // lateral shift while overtaking (metres)
    this.replanTimer = 0;
    this.stuckTimer = 0;
  }

  get x() {
    return this.vehicle.x;
  }

  get z() {
    return this.vehicle.z;
  }

  // Next waypoint: the far node of the current segment, in the right lane.
  targetPoint() {
    const a = this.route[this.seg];
    const b = this.route[this.seg + 1];
    if (a === undefined || b === undefined) return null;
    return this.graph.edgePoint({ a, b }, 1, LANE_OFFSET + this.latOffset);
  }

  // Is the road ahead blocked? Returns the obstacle distance, or Infinity.
  obstacleAhead(world) {
    const v = this.vehicle;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const rx = -fz;
    const rz = fx;
    const lookAhead = TRAFFIC.followGap + Math.abs(v.speed) * 0.9;
    let best = Infinity;
    for (const other of world?.vehicles || []) {
      if (other === v) continue;
      const dx = other.x - v.x;
      const dz = other.z - v.z;
      const fwd = dx * fx + dz * fz;
      const lat = Math.abs(dx * rx + dz * rz);
      if (fwd > 0 && fwd < lookAhead && lat < 2.6) best = Math.min(best, fwd);
    }
    for (const ped of world?.pedestrians?.peds || []) {
      const dx = ped.x - v.x;
      const dz = ped.z - v.z;
      const fwd = dx * fx + dz * fz;
      const lat = Math.abs(dx * rx + dz * rz);
      if (fwd > 0 && fwd < 14 && lat < 2.6) best = Math.min(best, fwd);
    }
    return best;
  }

  // Is the left (oncoming) lane clear enough to overtake into?
  leftLaneClear(world) {
    const v = this.vehicle;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const rx = -fz;
    const rz = fx;
    for (const other of world?.vehicles || []) {
      if (other === v) continue;
      const dx = other.x - v.x;
      const dz = other.z - v.z;
      const fwd = dx * fx + dz * fz;
      const lat = dx * rx + dz * rz; // negative = left side
      if (fwd > -5 && fwd < 28 && lat < -0.5 && lat > -6) return false;
    }
    return true;
  }

  newRoute(world) {
    const near = this.graph.nearestNode(this.x, this.z);
    // route[0] must be the node BEHIND the car, so segment 0 is the street
    // the car is actually on (otherwise it aims past the next intersection
    // and cuts the corner). Pick the neighbour of `near` most opposite to
    // the car's heading.
    const nearPos = this.graph.nodePos(near);
    const nearIdx = this.graph.nodes.findIndex((n) => n.id === near);
    const fx = Math.sin(this.vehicle.heading);
    const fz = Math.cos(this.vehicle.heading);
    let behind = near;
    let bestScore = -Infinity;
    for (const nbIdx of this.graph.neighbors[nearIdx] || []) {
      const nb = this.graph.nodes[nbIdx];
      const score = (nb.x - nearPos.x) * -fx + (nb.z - nearPos.z) * -fz;
      if (score > bestScore) {
        bestScore = score;
        behind = nb.id;
      }
    }
    let dest;
    if (this.flee && world?.player) {
      // Flee: pick the sampled node farthest from the player.
      let bestD = -1;
      dest = near;
      for (let i = 0; i < 8; i += 1) {
        const id = this.graph.randomNode(this.manager.rng);
        const p = this.graph.nodePos(id);
        const d = (p.x - world.player.x) ** 2 + (p.z - world.player.z) ** 2;
        if (d > bestD) {
          bestD = d;
          dest = id;
        }
      }
    } else {
      dest = this.graph.randomNode(this.manager.rng);
    }
    const path = this.graph.findPath(near, dest);
    this.route = behind === near
      ? (path.length > 1 ? path : [near, dest])
      : [behind, ...(path.length ? path : [near, dest])];
    this.seg = 0;
  }

  update(dt, world) {
    const v = this.vehicle;
    if (v.stolen) return; // the player steps a stolen car, not the AI
    if (v.wrecked) {
      v.setControl({ throttle: 0, brake: 0.5, steer: 0, handbrake: false });
      v.update(dt, world);
      return;
    }
    if (this.seg + 1 >= this.route.length) this.newRoute(world);
    let target = this.targetPoint();
    if (!target) {
      this.newRoute(world);
      target = this.targetPoint();
    }
    const dx = target.x - v.x;
    const dz = target.z - v.z;
    const distToNode = Math.hypot(dx, dz);
    if (distToNode < 9) {
      this.seg += 1;
      if (this.seg + 1 >= this.route.length) this.newRoute(world);
      target = this.targetPoint();
    }

    // Corner speed: slow before a turn, full cruise on straights.
    let targetSpeed = this.flee ? v.type.topSpeed * 0.85 : this.cruise;
    const a = this.route[this.seg];
    const b = this.route[this.seg + 1];
    const c = this.route[this.seg + 2];
    if (b !== undefined && c !== undefined) {
      const turn = Math.abs(angleDiff(this.graph.edgeHeading({ a: b, b: c }), this.graph.edgeHeading({ a, b })));
      if (turn > 0.25 && distToNode < 20) targetSpeed = Math.min(targetSpeed, TRAFFIC.cornerSpeed);
    }
    if (this.flee) {
      this.replanTimer -= dt;
      if (this.replanTimer <= 0) {
        this.replanTimer = 4;
        this.newRoute(world);
      }
    }

    // Obstacles: brake, and overtake if blocked for a while.
    const obstacle = this.obstacleAhead(world);
    if (obstacle < Infinity) {
      this.blockedTimer += dt;
      if (this.blockedTimer > 2.5 && !this.overtaking && this.leftLaneClear(world)) {
        this.overtaking = true;
      }
    } else {
      this.blockedTimer = 0;
      if (this.overtaking) this.overtaking = false;
    }
    this.latOffset = lerp(this.latOffset, this.overtaking ? -LANE_OFFSET * 2 : 0, Math.min(1, dt * 1.5));
    if (this.blockedTimer > 6) {
      // Stuck behind something that will not move: pick a new route.
      this.blockedTimer = 0;
      this.overtaking = false;
      this.newRoute(world);
    }

    // Pure pursuit steering toward the waypoint.
    const want = Math.atan2(target.x - v.x, target.z - v.z);
    const steer = clamp(angleDiff(want, v.heading) * 1.8, -1, 1);
    const braking = obstacle < TRAFFIC.followGap + Math.abs(v.speed) * 0.5;
    v.setControl({
      throttle: !braking && v.speed < targetSpeed ? 1 : 0,
      brake: braking || v.speed > targetSpeed + 3 ? 0.8 : 0,
      steer,
      handbrake: false,
    });
    v.update(dt, world);

    // Stuck against a wall or another car: nudge a new route after a while.
    if (Math.abs(v.speed) < 0.3 && !braking) this.stuckTimer += dt;
    else this.stuckTimer = 0;
    if (this.stuckTimer > 5) {
      this.stuckTimer = 0;
      this.newRoute(world);
    }
  }
}
