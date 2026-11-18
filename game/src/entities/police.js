// Police pursuit, driven by systems/wanted.js — this module executes orders,
// it never decides the wanted level.
//
// Wanted calls (guarded: it checks the method exists first):
//   police.setPursuit(level, playerPos) — field `level` cruisers (one per
//       star) chasing the player; playerPos may be null, the pursuit then
//       uses the player's position from world on the next update.
//   police.releaseAll()                 — stand the pursuit down (wanted
//       cleared, Respray, BUSTED/WASTED reset).
//
// main.js asks two questions every frame for Wanted.update:
//   police.canSeePlayer(playerPos)  — any cruiser/officer within sight range
//   police.officerCloseTo(playerPos) — an officer inside arrest range
//
// Behaviour follows config WANTED: at 1-2 stars officers run up and stand
// next to the player on foot (Wanted counts the arrest); at 3+ stars they
// shoot. Cruisers chase in path mode from far away (A* route to the player's
// node) and switch to direct pursuit + ram up close. A wrecked or far-away
// cruiser is replaced near the player so the pressure never silently ends.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { createPersonMesh } from './pedestrians.js';
import { WANTED } from '../config.js';
import { adaptGraph, angleDiff, clamp, lerp } from './graph.js';

const SIGHT_RANGE = 60;
const CRUISER_RESPAWN_DIST = 260;
const OFFICER_SPEED = 6.8;
const OFFICER_SHOOT_RANGE = 35;
const OFFICER_SHOOT_DAMAGE = 8;

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

class Cruiser {
  constructor(manager, x, z, heading) {
    this.manager = manager;
    this.vehicle = new Vehicle(manager.scene, 'police', 0x111111, { x, z, heading, driver: true });
    this.route = [];
    this.seg = 0;
    this.replanTimer = 0;
    this.wreckedTimer = 0;
    this.sirenPhase = manager.rng() * 2;
  }

  get x() {
    return this.vehicle.x;
  }

  get z() {
    return this.vehicle.z;
  }

  planRoute(playerPos) {
    const graph = this.manager.graph;
    if (!graph) {
      this.route = [];
      return;
    }
    const from = graph.nearestNode(this.x, this.z);
    const to = graph.nearestNode(playerPos.x, playerPos.z);
    const path = graph.findPath(from, to);
    this.route = path.length > 1 ? path : [from, to];
    this.seg = 0;
  }

  update(dt, world) {
    const v = this.vehicle;
    const player = world.player;
    // Siren flash: alternate the red and blue light bar.
    const lights = v.parts.lights || {};
    const on = Math.floor(this.sirenPhase + (world.time || 0) * 4) % 2 === 0;
    if (lights.red) lights.red.emissiveIntensity = on ? 2.2 : 0.25;
    if (lights.blue) lights.blue.emissiveIntensity = on ? 0.25 : 2.2;

    if (v.wrecked) {
      this.wreckedTimer += dt;
      v.setControl({ throttle: 0, brake: 0.8, steer: 0, handbrake: true });
      v.update(dt, world);
      return;
    }
    if (!player || player.dead) {
      v.setControl({ throttle: 0, brake: 0.5, steer: 0, handbrake: false });
      v.update(dt, world);
      return;
    }

    const dx = player.x - v.x;
    const dz = player.z - v.z;
    const dist = Math.hypot(dx, dz);
    // The player is on foot and the cruiser is on top of them: stop and let
    // the officers handle it (a cruiser ramming a pedestrian looks broken).
    if (player.onFoot && dist < 10) {
      v.setControl({ throttle: 0, brake: 0.9, steer: 0, handbrake: false });
      v.update(dt, world);
      return;
    }
    let aimX;
    let aimZ;
    let targetSpeed = v.type.topSpeed * 0.92;

    if (dist > 45 && this.manager.graph) {
      // Far: follow the road graph to the player's node.
      this.replanTimer -= dt;
      if (this.replanTimer <= 0 || this.seg + 1 >= this.route.length) {
        this.replanTimer = 2;
        this.planRoute(player.pos);
      }
      const a = this.route[this.seg];
      const b = this.route[this.seg + 1];
      if (a === undefined || b === undefined) {
        aimX = player.x;
        aimZ = player.z;
      } else {
        const p = this.manager.graph.edgePoint({ a, b }, 1, 0); // road centre
        aimX = p.x;
        aimZ = p.z;
        if (Math.hypot(p.x - v.x, p.z - v.z) < 10) this.seg += 1;
      }
    } else {
      // Close: direct pursuit with prediction — and a ram when alongside.
      const pvx = player.vehicle
        ? Math.sin(player.vehicle.heading) * player.vehicle.speed
        : Math.sin(player.heading) * player.speed;
      const pvz = player.vehicle
        ? Math.cos(player.vehicle.heading) * player.vehicle.speed
        : Math.cos(player.heading) * player.speed;
      aimX = player.x + pvx * 0.6;
      aimZ = player.z + pvz * 0.6;
      targetSpeed = v.type.topSpeed;
    }

    const want = Math.atan2(aimX - v.x, aimZ - v.z);
    const steer = clamp(angleDiff(want, v.heading) * 2.2, -1, 1);
    // Brake only for a car directly ahead; pursuit is otherwise flat-out.
    let blocked = false;
    for (const other of world.vehicles || []) {
      if (other === v) continue;
      const ox = other.x - v.x;
      const oz = other.z - v.z;
      const fwd = ox * Math.sin(v.heading) + oz * Math.cos(v.heading);
      const lat = Math.abs(ox * -Math.cos(v.heading) + oz * Math.sin(v.heading));
      if (fwd > 0 && fwd < 9 && lat < 2.4) {
        blocked = true;
        break;
      }
    }
    v.setControl({
      throttle: !blocked && v.speed < targetSpeed ? 1 : 0,
      brake: blocked ? 0.9 : 0,
      steer,
      handbrake: false,
    });
    v.update(dt, world);
  }

  destroy() {
    this.vehicle.destroy();
  }
}

class Officer {
  constructor(manager, x, z) {
    this.manager = manager;
    this.x = x;
    this.z = z;
    this.heading = manager.rng() * Math.PI * 2;
    this.speed = 0;
    this.phase = manager.rng() * Math.PI * 2;
    this.shootTimer = 0.5 + manager.rng();
    this.parts = createPersonMesh({
      shirt: 0x1f2a5f,
      pants: 0x1a1a1a,
      skin: [0xe8b88a, 0xc98a5a, 0x8a5a3a][Math.floor(manager.rng() * 3)],
      height: 1.78,
    });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.3), lambert(0x141a2e));
    cap.position.y = 1.88;
    this.parts.group.add(cap);
    this.mesh = this.parts.group;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = this.heading;
    if (manager.scene) manager.scene.add(this.mesh);
  }

  update(dt, world, level) {
    const player = world.player;
    if (!player || player.dead) {
      this.speed = lerp(this.speed, 0, Math.min(1, dt * 6));
      return;
    }
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist = Math.hypot(dx, dz);
    const shooting = level >= WANTED.shootFromStars;
    const arresting = !shooting && player.onFoot;

    let targetSpeed = 0;
    if (arresting) {
      // Run up and stand next to the player; Wanted counts the arrest.
      targetSpeed = dist > WANTED.arrestRange ? OFFICER_SPEED : 0;
    } else if (shooting) {
      if (dist > OFFICER_SHOOT_RANGE) targetSpeed = OFFICER_SPEED;
      else if (dist < 10) targetSpeed = -OFFICER_SPEED * 0.5; // back off, keep range
      else targetSpeed = 0;
      // Fire on a timer; hits are seeded, so replays stay deterministic.
      if (dist <= OFFICER_SHOOT_RANGE) {
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
          this.shootTimer = 0.9 + this.manager.rng() * 0.5;
          const hit = this.manager.rng() < 0.45;
          world.policeShots = world.policeShots || [];
          world.policeShots.push({
            from: { x: this.x, z: this.z },
            to: { x: player.x, z: player.z },
            hit,
          });
          if (hit) player.takeDamage(OFFICER_SHOOT_DAMAGE);
          if (world.alerts) world.alerts.push({ x: this.x, z: this.z, radius: 30 });
        }
      }
    } else {
      // Player driving at 1-2 stars: keep running toward them anyway.
      targetSpeed = OFFICER_SPEED;
    }

    this.speed = lerp(this.speed, targetSpeed, Math.min(1, dt * 5));
    const want = Math.atan2(dx, dz);
    this.heading += angleDiff(want, this.heading) * Math.min(1, dt * 8);
    const step = this.speed * dt;
    this.x += Math.sin(this.heading) * step;
    this.z += Math.cos(this.heading) * step;
    if (world && typeof world.collideCircle === 'function') {
      const fixed = world.collideCircle(this.x, this.z, 0.45);
      if (fixed) {
        this.x = fixed.x;
        this.z = fixed.z;
      }
    }
    this.phase += Math.abs(this.speed) * dt * 3.4;
    const swing = clamp(Math.abs(this.speed) / 2, 0, 1) * 0.7;
    const s = Math.sin(this.phase);
    this.parts.legL.rotation.x = s * swing;
    this.parts.legR.rotation.x = -s * swing;
    this.parts.armL.rotation.x = shooting && dist <= OFFICER_SHOOT_RANGE ? -1.2 : -s * swing * 0.7;
    this.parts.armR.rotation.x = shooting && dist <= OFFICER_SHOOT_RANGE ? -1.2 : s * swing * 0.7;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  destroy() {
    if (this.manager.scene) this.manager.scene.remove(this.mesh);
    this.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}

export class Police {
  // `graph` is the raw RoadGraph; it is adapted internally.
  constructor(scene, graph, rng, opts = {}) {
    this.scene = scene;
    this.graph = graph ? adaptGraph(graph) : null;
    this.rng = rng;
    this.level = 0;
    this.cruisers = [];
    this.officers = [];
    this.cruisersPerStar = opts.cruisersPerStar ?? WANTED.cruisersPerStar;
    this.officersOnFoot = opts.officersOnFoot ?? WANTED.officersOnFoot;
    this._lastPlayerPos = { x: 0, z: 0 };
    this._officerTimer = 0;
  }

  get active() {
    return this.level > 0;
  }

  get cruiserVehicles() {
    return this.cruisers.map((c) => c.vehicle);
  }

  // Wanted's entry point: field `level` cruisers. playerPos may be null
  // (Wanted notifies on level change without a position); the pursuit then
  // spawns around the last known player position.
  setPursuit(level, playerPos = null) {
    this.level = clamp(level, 0, WANTED.maxStars);
    if (playerPos) this._lastPlayerPos = { x: playerPos.x, z: playerPos.z };
    const wanted = this.level * this.cruisersPerStar;
    while (this.cruisers.length < wanted) this.spawnCruiser();
    while (this.cruisers.length > wanted) {
      const removed = this.cruisers.pop();
      removed.destroy();
    }
    if (this.level === 0) this.clearOfficers();
  }

  releaseAll() {
    this.level = 0;
    for (const c of this.cruisers) c.destroy();
    this.cruisers = [];
    this.clearOfficers();
  }

  clearOfficers() {
    for (const o of this.officers) o.destroy();
    this.officers = [];
  }

  spawnCruiser() {
    const p = this._lastPlayerPos;
    let x = p.x + 80;
    let z = p.z;
    let heading = Math.atan2(p.x - x, p.z - z);
    if (this.graph) {
      for (let tries = 0; tries < 16; tries += 1) {
        const id = this.graph.randomNode(this.rng);
        const n = this.graph.nodePos(id);
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d > 60 && d < 130) {
          x = n.x;
          z = n.z;
          heading = Math.atan2(p.x - x, p.z - z);
          break;
        }
      }
    }
    const cruiser = new Cruiser(this, x, z, heading);
    cruiser.vehicle.speed = 15;
    cruiser.planRoute(p);
    this.cruisers.push(cruiser);
    return cruiser;
  }

  spawnOfficer() {
    const p = this._lastPlayerPos;
    let x = p.x + 30;
    let z = p.z;
    if (this.graph) {
      for (let tries = 0; tries < 12; tries += 1) {
        const edge = this.graph.randomEdge(this.rng);
        const pt = this.graph.edgePoint(edge, this.rng(), 7.2);
        const d = Math.hypot(pt.x - p.x, pt.z - p.z);
        if (d > 20 && d < 45) {
          x = pt.x;
          z = pt.z;
          break;
        }
      }
    }
    const officer = new Officer(this, x, z);
    this.officers.push(officer);
    return officer;
  }

  // main.js feeds this to Wanted.update as `policeVisible`.
  canSeePlayer(playerPos) {
    for (const c of this.cruisers) {
      if (Math.hypot(c.x - playerPos.x, c.z - playerPos.z) < SIGHT_RANGE) return true;
    }
    for (const o of this.officers) {
      if (Math.hypot(o.x - playerPos.x, o.z - playerPos.z) < SIGHT_RANGE) return true;
    }
    return false;
  }

  // main.js feeds this to Wanted.update as opts.officerClose.
  officerCloseTo(playerPos, range = WANTED.arrestRange) {
    for (const o of this.officers) {
      if (Math.hypot(o.x - playerPos.x, o.z - playerPos.z) < range) return true;
    }
    return false;
  }

  update(dt, world) {
    const player = world?.player;
    if (player) this._lastPlayerPos = { x: player.x, z: player.z };
    if (this.level === 0 && this.cruisers.length === 0 && this.officers.length === 0) return;

    // Keep the cruiser count at the pursuit level (replace wrecked ones).
    if (this.level > 0) {
      const wanted = this.level * this.cruisersPerStar;
      for (let i = this.cruisers.length - 1; i >= 0; i -= 1) {
        const c = this.cruisers[i];
        const d = player ? Math.hypot(c.x - player.x, c.z - player.z) : 0;
        if ((c.vehicle.wrecked && c.wreckedTimer > 4) || d > CRUISER_RESPAWN_DIST) {
          c.destroy();
          this.cruisers.splice(i, 1);
        }
      }
      while (this.cruisers.length < wanted) this.spawnCruiser();
    }

    // Officers: field them while the player is on foot; drop them when the
    // player drives far away (they re-deploy when the player exits the car).
    if (this.level > 0 && player && player.onFoot) {
      this._officerTimer -= dt;
      if (this._officerTimer <= 0) {
        this._officerTimer = 1;
        while (this.officers.length < this.officersOnFoot) this.spawnOfficer();
      }
    }
    for (let i = this.officers.length - 1; i >= 0; i -= 1) {
      const o = this.officers[i];
      const d = player ? Math.hypot(o.x - player.x, o.z - player.z) : 0;
      if (player && !player.onFoot && d > 150) {
        o.destroy();
        this.officers.splice(i, 1);
      }
    }

    for (const c of this.cruisers) c.update(dt, world);
    for (const o of this.officers) o.update(dt, world, this.level);
  }

  destroy() {
    this.releaseAll();
  }
}
