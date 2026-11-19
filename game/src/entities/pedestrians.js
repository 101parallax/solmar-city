// Pedestrians: sidewalk walkers that follow the navigation graph, pause
// now and then, step aside for nearby cars, and flee from gunfire.
// NavGraph construction is guarded with a sidewalk-grid fallback.
import * as THREE from 'three';
import { NavGraph } from './graph.js';
import { CITY_DATA } from '../data/city.js';

const PED_COUNT = 36;
const CITY_HALF = 280;
const BLOCK = 70;
const PANIC_RADIUS = 30;
const FLEE_TIME = 4;

const SHIRT_COLORS = [
  0xe2574c, 0x4c8de5, 0x53b06a, 0xe5c14c, 0x9b5de5, 0xe58bb1, 0x4cc9d8,
];

export class Pedestrians {
  constructor(game) {
    this.game = game;
    this.rng = game.rng || {
      next: () => 0.5,
      range: (a, b) => (a + b) / 2,
      int: (a) => a,
      pick: (arr) => arr[0],
      chance: () => false,
    };
    // Reuse the shared nav graph built by main.js (new NavGraph(game)
    // would throw: the constructor needs city data, not the game object).
    this.navGraph = game.navGraph || null;
    if (!this.navGraph) {
      try {
        this.navGraph = new NavGraph(CITY_DATA);
      } catch (err) {
        this.navGraph = null;
      }
    }
    this.list = [];
    this.nextId = 1;
    for (let i = 0; i < PED_COUNT; i++) {
      const start = this.randomSidewalkPoint();
      const ped = this.buildPed(start.x, start.z);
      this.list.push(ped);
    }
  }

  buildPed(x, z) {
    const shirt = this.rng.pick(SHIRT_COLORS);
    const mesh = new THREE.Group();
    mesh.name = 'pedestrian';
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x333a44 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a077 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 3, 8), shirtMat);
    body.position.y = 1.0;
    body.castShadow = true;
    mesh.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), skinMat);
    head.position.y = 1.72;
    mesh.add(head);
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.5, 3, 8);
    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.position.set(-0.14, 0.42, 0);
    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.position.set(0.14, 0.42, 0);
    mesh.add(legL, legR);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 16),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    mesh.add(shadow);
    mesh.position.set(x, 0, z);
    const ped = {
      id: this.nextId++,
      mesh,
      legL,
      legR,
      hp: 100,
      alive: true,
      heading: this.rng.next() * Math.PI * 2,
      speed: this.rng.range(1.1, 2.1),
      state: 'walk',
      timer: this.rng.range(0, 3),
      route: [],
      waypointIndex: 0,
      fleeX: 0,
      fleeZ: 0,
      fallTimer: 0,
      walkPhase: this.rng.next() * Math.PI * 2,
    };
    mesh.userData.hit = { kind: 'ped', ref: ped };
    ped.route = this.newRoute({ x, z });
    this.game.scene.add(mesh);
    return ped;
  }

  count() {
    let alive = 0;
    for (const ped of this.list) if (ped.alive) alive++;
    return alive;
  }

  gridLine() {
    const steps = Math.floor((CITY_HALF * 2) / BLOCK);
    return -CITY_HALF + this.rng.int(0, steps) * BLOCK;
  }

  randomSidewalkPoint() {
    // Sidewalks run a few metres off the street centre lines.
    const offset = 6 + this.rng.range(0, 3);
    if (this.rng.chance(0.5)) {
      return {
        x: this.gridLine() + (this.rng.chance(0.5) ? offset : -offset),
        z: this.rng.range(-CITY_HALF + 10, CITY_HALF - 10),
      };
    }
    return {
      x: this.rng.range(-CITY_HALF + 10, CITY_HALF - 10),
      z: this.gridLine() + (this.rng.chance(0.5) ? offset : -offset),
    };
  }

  newRoute(from) {
    if (this.navGraph && typeof this.navGraph.path === 'function') {
      try {
        const target = this.randomSidewalkPoint();
        const route = this.navGraph.path(from, target);
        if (Array.isArray(route) && route.length > 0) return route;
      } catch (ignored) {
        // Fall through to the sidewalk grid below.
      }
    }
    const route = [];
    let x = from.x;
    let z = from.z;
    let horizontal = this.rng.chance(0.5);
    for (let i = 0; i < 5; i++) {
      if (horizontal) x = this.gridLine();
      else z = this.gridLine();
      horizontal = !horizontal;
      route.push({ x, z });
    }
    return route;
  }

  panicAt(x, z) {
    for (const ped of this.list) {
      if (!ped.alive) continue;
      const dx = ped.mesh.position.x - x;
      const dz = ped.mesh.position.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist < PANIC_RADIUS && dist > 0.01) {
        ped.state = 'flee';
        ped.timer = FLEE_TIME;
        ped.fleeX = dx / dist;
        ped.fleeZ = dz / dist;
      }
    }
  }

  damage(pedOrId, n) {
    const ped =
      typeof pedOrId === 'object'
        ? pedOrId
        : this.list.find((p) => p.id === pedOrId);
    if (!ped || !ped.alive) return false;
    ped.hp -= n;
    if (ped.hp > 0) {
      this.panicAt(ped.mesh.position.x, ped.mesh.position.z);
      return false;
    }
    ped.alive = false;
    ped.state = 'dead';
    ped.fallTimer = 6;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.3;
    this.game.wanted?.addCrime('killPed');
    this.game.effects?.spawnParticles(
      { x: ped.mesh.position.x, y: 1, z: ped.mesh.position.z },
      0xaa2222,
      12,
      { speed: 4, up: 3, life: 0.6, gravity: 10 },
    );
    return true;
  }

  vehicleTooClose(ped, vehicles) {
    const px = ped.mesh.position.x;
    const pz = ped.mesh.position.z;
    for (const v of vehicles) {
      if (v.wrecked) continue;
      const dx = v.mesh.position.x - px;
      const dz = v.mesh.position.z - pz;
      if (Math.hypot(dx, dz) < 7 && Math.abs(v.speed) > 1) {
        return { x: dx, z: dz };
      }
    }
    return null;
  }

  update(dt) {
    // One shared vehicle list per frame: building it per pedestrian
    // would allocate 36 arrays every frame.
    const vehicles = this.game.vehicles?.otherVehicles?.() || [];
    for (const ped of this.list) {
      if (!ped.alive) {
        ped.fallTimer -= dt;
        if (ped.fallTimer <= 0 && ped.mesh.visible) {
          ped.mesh.visible = false;
        }
        continue;
      }
      ped.timer -= dt;
      const pos = ped.mesh.position;
      if (ped.state === 'flee') {
        const speed = 5.2;
        pos.x += ped.fleeX * speed * dt;
        pos.z += ped.fleeZ * speed * dt;
        pos.x = Math.max(-CITY_HALF + 2, Math.min(CITY_HALF - 2, pos.x));
        pos.z = Math.max(-CITY_HALF + 2, Math.min(CITY_HALF - 2, pos.z));
        ped.heading = Math.atan2(ped.fleeX, ped.fleeZ);
        ped.walkPhase += dt * 11;
        if (ped.timer <= 0) {
          ped.state = 'walk';
          ped.route = this.newRoute({ x: pos.x, z: pos.z });
          ped.waypointIndex = 0;
        }
      } else if (ped.state === 'idle') {
        if (ped.timer <= 0) {
          ped.state = 'walk';
          ped.timer = this.rng.range(6, 14);
        }
      } else {
        if (ped.timer <= 0 && this.rng.chance(0.3)) {
          ped.state = 'idle';
          ped.timer = this.rng.range(1.5, 4);
        }
        // Step aside when a moving car comes close.
        const threat = this.vehicleTooClose(ped, vehicles);
        if (threat) {
          const len = Math.hypot(threat.x, threat.z) || 1;
          pos.x -= (threat.x / len) * 3 * dt;
          pos.z -= (threat.z / len) * 3 * dt;
        }
        if (ped.waypointIndex >= ped.route.length) {
          ped.route = this.newRoute({ x: pos.x, z: pos.z });
          ped.waypointIndex = 0;
        }
        const target = ped.route[ped.waypointIndex];
        if (target) {
          const dx = target.x - pos.x;
          const dz = target.z - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 2) {
            ped.waypointIndex++;
          } else {
            const stepX = (dx / dist) * ped.speed * dt;
            const stepZ = (dz / dist) * ped.speed * dt;
            pos.x += stepX;
            pos.z += stepZ;
            ped.heading = Math.atan2(dx, dz);
            ped.walkPhase += dt * ped.speed * 3.2;
          }
        }
      }
      ped.mesh.rotation.y = ped.heading;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      const moving = ped.state !== 'idle';
      ped.legL.rotation.x = moving ? swing : 0;
      ped.legR.rotation.x = moving ? -swing : 0;
    }
  }
}
