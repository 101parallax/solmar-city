import * as THREE from 'three';
import { NavGraph } from './graph.js';
import { CITY_DATA } from '../data/city.js';
import { pointBlocked, blobShadowMesh, turnToward } from './vehicles.js';

// Thirty-six pedestrians strolling the sidewalks on NavGraph paths. They
// pause to look around, sidestep an approaching car, and run when gunfire
// goes off nearby. Fallen pedestrians are replaced by fresh ones after
// thirty seconds so the streets stay alive.
const SHIRT_COLORS = [
  0xd94f4f, 0x4f7dd9, 0x53b06a, 0xe0a83c,
  0x9b59d0, 0x38b6b0, 0xe07ba8, 0xdadada,
];

export class Pedestrians {
  constructor(game) {
    this.game = game;
    this.peds = [];
    this.graph = null;
    try {
      this.graph = new NavGraph(CITY_DATA);
    } catch {
      this.graph = null;
    }
    this.nextId = 1;
    for (let i = 0; i < 36; i++) this._spawnPed(this._randomSidewalkPoint());
    // Explosions scare the street just like gunfire does.
    game.events?.on?.('vehicleWrecked', ({ vehicle }) => {
      if (vehicle) this.panicAt(vehicle.mesh.position.x, vehicle.mesh.position.z);
    });
  }

  _randomSidewalkPoint() {
    const rng = this.game.rng;
    for (let tries = 0; tries < 16; tries++) {
      const x = rng.range(-260, 260);
      const z = rng.range(-260, 260);
      if (!this.game.city?.isRoad?.(x, z) && !pointBlocked(this.game, x, z, 0.6)) {
        return { x, z };
      }
    }
    return { x: rng.range(-100, 100), z: rng.range(-100, 100) };
  }

  _spawnPed(point) {
    const rng = this.game.rng;
    const parts = buildPedMesh(rng.pick(SHIRT_COLORS));
    parts.group.position.set(point.x, 0, point.z);
    const id = this.nextId++;
    parts.group.userData.hitTarget = { kind: 'ped', id };
    this.game.scene.add(parts.group);
    const ped = {
      id,
      mesh: parts.group,
      legL: parts.legL,
      legR: parts.legR,
      hp: 50,
      speed: rng.range(1.1, 2.0),
      path: this._newPath(point),
      wp: 0,
      panic: 0,
      fleeFrom: null,
      dead: false,
      deadTimer: 0,
      phase: rng.next() * Math.PI * 2,
      pause: 0,
    };
    this.peds.push(ped);
    return ped;
  }

  _newPath(from) {
    if (this.graph?.path) {
      try {
        const route = this.graph.path(from, this._randomSidewalkPoint());
        if (Array.isArray(route) && route.length > 1) return route;
      } catch {
        // Fall through to the straight-line stroll below.
      }
    }
    const rng = this.game.rng;
    return [{
      x: THREE.MathUtils.clamp(from.x + rng.range(-60, 60), -260, 260),
      z: THREE.MathUtils.clamp(from.z + rng.range(-60, 60), -260, 260),
    }];
  }

  update(dt) {
    const state = this.game.state;
    const playerVehicle = state.playerInVehicle;
    for (const ped of this.peds) {
      if (ped.dead) {
        ped.deadTimer += dt;
        if (ped.deadTimer > 30) {
          const point = this._randomSidewalkPoint();
          ped.mesh.position.set(point.x, 0, point.z);
          ped.mesh.rotation.set(0, 0, 0);
          ped.hp = 50;
          ped.dead = false;
          ped.deadTimer = 0;
          ped.panic = 0;
          ped.path = this._newPath(point);
          ped.wp = 0;
        }
        continue;
      }
      const pos = ped.mesh.position;
      // Fleeing from gunfire: run straight away from the shots.
      if (ped.panic > 0) {
        ped.panic -= dt;
        const awayX = pos.x - ped.fleeFrom.x;
        const awayZ = pos.z - ped.fleeFrom.z;
        const len = Math.hypot(awayX, awayZ) || 1;
        this._movePed(ped, awayX / len, awayZ / len, 5.2, dt);
        continue;
      }
      // Dodge the player's car when it bears down on the sidewalk.
      if (playerVehicle && Math.abs(playerVehicle.speed) > 3) {
        const vx = playerVehicle.mesh.position.x;
        const vz = playerVehicle.mesh.position.z;
        const d = Math.hypot(vx - pos.x, vz - pos.z);
        if (d < 7) {
          const awayX = pos.x - vx;
          const awayZ = pos.z - vz;
          const len = Math.hypot(awayX, awayZ) || 1;
          this._movePed(ped, awayX / len, awayZ / len, 3.4, dt);
          continue;
        }
      }
      if (ped.pause > 0) {
        ped.pause -= dt;
        ped.legL.rotation.x *= 0.85;
        ped.legR.rotation.x *= 0.85;
        continue;
      }
      const target = ped.path[ped.wp];
      if (!target) {
        ped.path = this._newPath({ x: pos.x, z: pos.z });
        ped.wp = 0;
        continue;
      }
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) {
        ped.wp++;
        if (ped.wp >= ped.path.length) {
          ped.path = this._newPath({ x: pos.x, z: pos.z });
          ped.wp = 0;
          if (this.game.rng.chance(0.25)) ped.pause = this.game.rng.range(1, 4);
        }
        continue;
      }
      this._movePed(ped, dx / dist, dz / dist, ped.speed, dt);
    }
  }

  _movePed(ped, dx, dz, speed, dt) {
    const pos = ped.mesh.position;
    const nx = pos.x + dx * speed * dt;
    const nz = pos.z + dz * speed * dt;
    if (!pointBlocked(this.game, nx, pos.z, 0.4)) pos.x = nx;
    if (!pointBlocked(this.game, pos.x, nz, 0.4)) pos.z = nz;
    ped.mesh.rotation.y = turnToward(ped.mesh.rotation.y, Math.atan2(dx, dz), dt * 8);
    ped.phase += dt * speed * 2.2;
    const swing = Math.sin(ped.phase) * 0.5;
    ped.legL.rotation.x = swing;
    ped.legR.rotation.x = -swing;
  }

  count() {
    return this.peds.filter((ped) => !ped.dead).length;
  }

  panicAt(x, z) {
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.mesh.position.x - x, ped.mesh.position.z - z);
      if (d < 26) {
        ped.panic = this.game.rng.range(2.5, 5);
        ped.fleeFrom = { x, z };
      }
    }
  }

  // Returns true when the pedestrian goes down.
  damage(id, amount) {
    const ped = this.peds.find((entry) => entry.id === id);
    if (!ped || ped.dead) return false;
    ped.hp -= amount;
    if (ped.hp <= 0) {
      ped.dead = true;
      ped.deadTimer = 0;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.25;
      this.panicAt(ped.mesh.position.x, ped.mesh.position.z);
      return true;
    }
    ped.panic = 4;
    ped.fleeFrom = { x: this.game.state.playerPos.x, z: this.game.state.playerPos.z };
    return false;
  }
}

function buildPedMesh(shirtColor) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xb57748, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.8 });
  const legGeo = new THREE.BoxGeometry(0.2, 0.82, 0.24);
  const legL = new THREE.Group();
  legL.position.set(-0.13, 0.82, 0);
  const legLMesh = new THREE.Mesh(legGeo, pants);
  legLMesh.position.y = -0.41;
  legL.add(legLMesh);
  group.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.13, 0.82, 0);
  const legRMesh = new THREE.Mesh(legGeo, pants);
  legRMesh.position.y = -0.41;
  legR.add(legRMesh);
  group.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.32), shirt);
  torso.position.y = 1.16;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), skin);
  head.position.y = 1.72;
  group.add(head);
  group.add(blobShadowMesh(1.3));
  return { group, legL, legR };
}
