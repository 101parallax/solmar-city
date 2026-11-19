// Vehicles: arcade car physics, NOS, wrecks, and the parked-car manager.
// NEAR MISS is fully deterministic: speed plus edge-to-edge gap, re-armed by
// distance only, with no wall-clock timing anywhere.
import * as THREE from 'three';
import { VEHICLES } from '../data/vehicles.js';

const CITY_HALF = 280;
// The beach runs south of the city grid to the water line (z 315): cars may
// drive the sand, so the southern clamp is 312, not 280.
const BEACH_MAX_Z = 312;
const NOS_DRAG = 0.12;
const BASE_DRAG = 0.35;
const HANDBRAKE_DECAY = 0.9;
const NEAR_MISS_SPEED_KMH = 80;
const NEAR_MISS_GAP = 2;
const NEAR_MISS_REARM_GAP = 10;
const NEAR_MISS_REWARD = 250;

const FALLBACK_VEHICLES = [
  { name: 'Vento GT', type: 'sport', topSpeed: 220, accel: 13, color: 0xd43d2a },
  { name: 'Marina LX', type: 'sedan', topSpeed: 165, accel: 9, color: 0x3a6ea5 },
  { name: 'Palma Sedan', type: 'sedan', topSpeed: 160, accel: 9, color: 0x9aa5ad },
  { name: 'Coral Coupe', type: 'sport', topSpeed: 205, accel: 12, color: 0xff8c42 },
  { name: 'Duna SUV', type: 'suv', topSpeed: 175, accel: 10, color: 0x5b7a4d },
  { name: 'Brisa Van', type: 'van', topSpeed: 140, accel: 7, color: 0xe8e3d3 },
  { name: 'Tidal Bus', type: 'bus', topSpeed: 120, accel: 5, color: 0x2f9e8f },
  { name: 'Harbor Truck', type: 'truck', topSpeed: 130, accel: 6, color: 0xc7c9cc },
  { name: 'Solstice R', type: 'supercar', topSpeed: 250, accel: 15, color: 0x222831 },
  { name: 'Laguna GT', type: 'sport', topSpeed: 215, accel: 12, color: 0x1f6fb2 },
  { name: 'Cayo Pickup', type: 'truck', topSpeed: 155, accel: 8, color: 0x8a5a2b },
];

// Parked-car spots on road intersections. None of them may sit on a mission
// point (M1 steal spawn, M2/M4/M7 points, M3/M5 defeat positions, race gates
// or fare destinations), or cars and mission actors would spawn on top of
// each other.
const PARKING_SPOTS = [
  { x: 140, z: 70, heading: 0 },
  { x: -210, z: -210, heading: 1.57 },
  { x: -70, z: -210, heading: 0 },
  { x: -70, z: 140, heading: 1.57 },
  { x: 0, z: -140, heading: 0 },
  { x: 70, z: 0, heading: 1.57 },
  { x: 140, z: -210, heading: 0 },
  { x: 280, z: 210, heading: 1.57 },
  { x: -280, z: 70, heading: 0 },
  { x: 280, z: -70, heading: 1.57 },
  { x: 70, z: -210, heading: 0 },
];

let blobTexture = null;
let vehicleIdCounter = 1;

export class Vehicle {
  constructor(game, def, x, z, heading = 0) {
    this.game = game;
    this.id = vehicleIdCounter++;
    this.def = def;
    this.name = def.name;
    this.type = def.type || 'sedan';
    this.topSpeedKmh = def.topSpeed || 160;
    this.topSpeedMs = this.topSpeedKmh / 3.6;
    this.accel = def.accel || 9;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.nos = 100;
    this.nosActive = false;
    this.parked = false;
    this.wrecked = false;
    this.drifting = false;
    this.driftCounted = false;
    this.smokeTimer = 0;

    const wide = this.type === 'bus' || this.type === 'truck';
    const length = wide ? 6.4 : this.type === 'van' ? 5.2 : 4.4;
    const width = wide ? 2.4 : 1.9;
    const height = this.type === 'bus' ? 2.4 : 0.62;
    this.length = length;
    this.width = width;

    this.mesh = new THREE.Group();
    this.mesh.name = `vehicle-${this.name}`;
    this.mesh.userData.hit = { kind: 'vehicle', ref: this };

    this.bodyMat = new THREE.MeshStandardMaterial({
      color: def.color ?? 0x888888,
      metalness: 0.5,
      roughness: 0.45,
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, length),
      this.bodyMat,
    );
    body.position.y = 0.62;
    body.castShadow = true;
    this.mesh.add(body);

    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x10151c,
      metalness: 0.7,
      roughness: 0.25,
    });
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.86, 0.55, length * 0.45),
      cabinMat,
    );
    cabin.position.set(0, 1.16, this.type === 'bus' ? 0 : -length * 0.06);
    this.mesh.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414 });
    this.wheels = [];
    this.frontWheels = [];
    const wheelX = width / 2 - 0.05;
    const wheelZ = length / 2 - 0.75;
    for (const [wx, wz, front] of [
      [-wheelX, wheelZ, true],
      [wheelX, wheelZ, true],
      [-wheelX, -wheelZ, false],
      [wheelX, -wheelZ, false],
    ]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, 0.36, wz);
      this.mesh.add(wheel);
      this.wheels.push(wheel);
      if (front) this.frontWheels.push(wheel);
    }

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff6c9,
      emissive: 0xffedb0,
      emissiveIntensity: 0.7,
    });
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.16, 0.08),
        lampMat,
      );
      lamp.position.set(side * (width / 2 - 0.3), 0.66, length / 2 + 0.02);
      this.mesh.add(lamp);
    }

    this.brakeMat = new THREE.MeshStandardMaterial({
      color: 0x881111,
      emissive: 0xff2222,
      emissiveIntensity: 0.15,
    });
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.16, 0.08),
        this.brakeMat,
      );
      lamp.position.set(side * (width / 2 - 0.3), 0.66, -length / 2 - 0.02);
      this.mesh.add(lamp);
    }

    const shadow = blobShadowMesh(length + 1.2, width + 1.2);
    shadow.position.y = 0.02;
    this.mesh.add(shadow);

    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    game.scene.add(this.mesh);
  }

  speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  position() {
    return { x: this.mesh.position.x, z: this.mesh.position.z };
  }

  setBrakeLights(on) {
    this.brakeMat.emissiveIntensity = on ? 2.2 : 0.15;
  }

  exhaustPosition(out) {
    out.set(
      this.mesh.position.x - Math.sin(this.heading) * (this.length / 2),
      0.45,
      this.mesh.position.z - Math.cos(this.heading) * (this.length / 2),
    );
    return out;
  }

  isBlocked(x, z) {
    if (Math.abs(x) > CITY_HALF - 2 || z < -(CITY_HALF - 2) || z > BEACH_MAX_Z) return true;
    const city = this.game.city;
    if (!city) return false;
    if (city.isWater && city.isWater(x, z)) return true;
    const colliders = city.colliders || [];
    const r = 1.4;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (
        x + r > c.minX && x - r < c.maxX &&
        z + r > c.minZ && z - r < c.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  crash(intoSpeed) {
    const impact = Math.abs(intoSpeed);
    if (impact < 3) return;
    this.damage(Math.min(40, impact * 1.2));
    this.game.effects?.sparks({
      x: this.mesh.position.x,
      y: 0.8,
      z: this.mesh.position.z,
    });
    this.game.audio?.sfx?.('crash');
  }

  damage(n) {
    if (this.wrecked || n <= 0) return;
    this.health -= n;
    if (this.health <= 0) {
      this.health = 0;
      this.wrecked = true;
      this.speed = 0;
      this.bodyMat.color.set(0x222222);
      this.bodyMat.metalness = 0.1;
      this.game.effects?.explosion({
        x: this.mesh.position.x,
        y: 1,
        z: this.mesh.position.z,
      });
      this.game.events?.emit('vehicleWrecked', {
        vehicle: this,
        name: this.name,
      });
    }
  }

  drive(dt, throttle, brake, steerInput, handbrake, wantNos) {
    if (this.wrecked) {
      this.speed = 0;
      return;
    }
    const state = this.game.state;
    this.nosActive =
      wantNos && state.unlocks?.nitro && this.nos > 0 && this.speed > 4;
    if (this.nosActive) {
      this.nos = Math.max(0, this.nos - 32 * dt);
    } else {
      this.nos = Math.min(100, this.nos + 9 * dt);
    }
    const topMs = this.topSpeedMs * (this.nosActive ? 1.35 : 1);
    if (throttle > 0) {
      this.speed += this.accel * throttle * dt;
    } else if (brake > 0) {
      if (this.speed > 0.5) {
        this.speed -= 26 * brake * dt;
      } else {
        this.speed -= 8 * brake * dt;
      }
    }
    // Drag: NOS runs at the low 0.12 drag so the boost actually reaches
    // the higher top speed; normal drag is much stronger.
    const drag = this.nosActive ? NOS_DRAG : BASE_DRAG;
    this.speed -= this.speed * drag * dt;
    if (throttle === 0 && brake === 0) {
      const rolling = 2.5 * dt;
      if (Math.abs(this.speed) <= rolling) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * rolling;
    }
    if (handbrake) {
      // Handbrake decay factor 0.9 per second of grip loss.
      this.speed *= Math.max(0, 1 - HANDBRAKE_DECAY * dt);
      if (Math.abs(this.speed) > 12) {
        this.drifting = true;
        if (!this.driftCounted) {
          this.driftCounted = true;
          state.stats.drifts = (state.stats.drifts || 0) + 1;
          this.game.rep?.addRep?.(1);
          this.game.hud?.showEventPopup('DRIFT');
        }
      }
    } else if (Math.abs(this.speed) < 5) {
      this.drifting = false;
      this.driftCounted = false;
    }
    this.speed = Math.max(-9, Math.min(topMs, this.speed));

    // Steering weakens with speed so high-speed driving stays stable.
    const speedFactor = Math.min(1, Math.abs(this.speed) / 9);
    const steerAuthority = 1.9 * (1 - 0.55 * Math.min(1, Math.abs(this.speed) / this.topSpeedMs));
    this.steer = steerInput;
    this.heading +=
      steerInput * steerAuthority * speedFactor * dt * Math.sign(this.speed || 1);

    const nextX =
      this.mesh.position.x + Math.sin(this.heading) * this.speed * dt;
    const nextZ =
      this.mesh.position.z + Math.cos(this.heading) * this.speed * dt;
    if (this.isBlocked(nextX, nextZ)) {
      this.crash(this.speed);
      this.speed *= -0.25;
    } else {
      this.mesh.position.x = nextX;
      this.mesh.position.z = nextZ;
    }
    this.mesh.rotation.y = this.heading;

    const wheelSpin = (this.speed * dt) / 0.36;
    for (const wheel of this.wheels) wheel.rotation.x += wheelSpin;
    for (const wheel of this.frontWheels) {
      wheel.rotation.y = steerInput * 0.45;
    }
    this.setBrakeLights(brake > 0 || handbrake);

    if (this.nosActive) {
      const exhaust = this.exhaustPosition(new THREE.Vector3());
      this.game.effects?.spawnParticles(exhaust, 0xff7733, 2, {
        speed: 2,
        up: 0.5,
        life: 0.25,
        gravity: 0,
      });
    }
    if (this.health < 35 && !this.wrecked) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.4;
        this.game.effects?.smoke({
          x: this.mesh.position.x,
          y: 1.2,
          z: this.mesh.position.z,
        });
      }
    }
  }

  update(dt, input, isPlayer) {
    if (!isPlayer || this.wrecked) return;
    const throttle =
      input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0;
    const brake =
      input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0;
    let steerInput = 0;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) steerInput -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) steerInput += 1;
    const handbrake = input.isDown('Space');
    const wantNos = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    this.drive(dt, throttle, brake, steerInput, handbrake, wantNos);
  }

  // Simple AI steering: turn toward a target heading and hold a target
  // speed. Used by traffic and police cruisers.
  driveAI(dt, targetHeading, targetSpeed) {
    if (this.wrecked) return;
    const diff = wrapAngle(targetHeading - this.heading);
    const steerInput = Math.max(-1, Math.min(1, diff * 2.2));
    const throttle = this.speed < targetSpeed ? 1 : 0;
    const brake = this.speed > targetSpeed + 1 ? 1 : 0;
    this.drive(dt, throttle, brake, steerInput, false, false);
  }

  dispose() {
    this.game.scene.remove(this.mesh);
  }
}

export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.rng = game.rng || {
      next: () => 0.5,
      range: (a, b) => (a + b) / 2,
      int: (a) => a,
      pick: (arr) => arr[0],
      chance: () => false,
    };
    this.all = [];
    this.parked = [];
    this.nearMissState = new Map();
    const defs =
      Array.isArray(VEHICLES) && VEHICLES.length > 0
        ? VEHICLES
        : FALLBACK_VEHICLES;
    const count = Math.min(defs.length, PARKING_SPOTS.length);
    for (let i = 0; i < count; i++) {
      const spot = PARKING_SPOTS[i];
      const vehicle = new Vehicle(game, defs[i], spot.x, spot.z, spot.heading);
      vehicle.parked = true;
      this.all.push(vehicle);
      this.parked.push(vehicle);
    }
    // Home spots for a new game: stolen or wrecked parked cars come back
    // here, and mission-spawned cars (never parked here) are removed.
    this._homeSpots = this.parked.map((vehicle) => ({
      vehicle,
      x: vehicle.mesh.position.x,
      z: vehicle.mesh.position.z,
      heading: vehicle.heading,
    }));
  }

  // New game: remove every spawned car (mission vehicles, chase targets),
  // restore the parked cars to their home spots, repaired and re-parked.
  reset() {
    const home = new Map(this._homeSpots.map((s) => [s.vehicle, s]));
    for (const vehicle of this.all.slice()) {
      if (!home.has(vehicle)) vehicle.dispose();
    }
    this.all = this.all.filter((v) => home.has(v));
    this.parked = [];
    for (const spot of this._homeSpots) {
      const v = spot.vehicle;
      v.health = 100;
      v.wrecked = false;
      v.speed = 0;
      v.nos = 100;
      v.parked = true;
      v.drifting = false;
      v.driftCounted = false;
      v.bodyMat.color.set(v.def.color ?? 0x888888);
      v.bodyMat.metalness = 0.5;
      v.mesh.position.set(spot.x, 0, spot.z);
      v.mesh.rotation.y = spot.heading;
      v.heading = spot.heading;
      this.parked.push(v);
    }
    this.nearMissState.clear();
  }

  findDef(type) {
    const defs =
      Array.isArray(VEHICLES) && VEHICLES.length > 0
        ? VEHICLES
        : FALLBACK_VEHICLES;
    if (!type) return defs[0];
    const wanted = String(type).toLowerCase();
    return (
      defs.find((d) => String(d.name).toLowerCase() === wanted) ||
      defs.find((d) => String(d.type).toLowerCase() === wanted) ||
      defs[0]
    );
  }

  spawn(type, x, z) {
    const def = this.findDef(type);
    const heading = this.rng.next() * Math.PI * 2;
    const vehicle = new Vehicle(this.game, def, x, z, heading);
    this.all.push(vehicle);
    return vehicle;
  }

  findByName(name) {
    const wanted = String(name).toLowerCase();
    return (
      this.all.find((v) => v.name.toLowerCase() === wanted) || null
    );
  }

  nearestParked(x, z, maxDist = 6) {
    let best = null;
    let bestDist = maxDist;
    for (const vehicle of this.parked) {
      if (vehicle.wrecked) continue;
      const dx = vehicle.mesh.position.x - x;
      const dz = vehicle.mesh.position.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = vehicle;
      }
    }
    return best;
  }

  enter(vehicle, opts = {}) {
    if (!vehicle || vehicle.wrecked) return false;
    const state = this.game.state;
    const wasParked = vehicle.parked;
    vehicle.parked = false;
    this.parked = this.parked.filter((v) => v !== vehicle);
    state.playerInVehicle = vehicle;
    if (wasParked && opts.crime !== false) {
      state.stats.carsStolen = (state.stats.carsStolen || 0) + 1;
      this.game.wanted?.addCrime('steal');
      this.game.hud?.showEventPopup(`Stole the ${vehicle.name}`);
    }
    this.game.audio?.sfx?.('pickup');
    return true;
  }

  exit() {
    const state = this.game.state;
    const vehicle = state.playerInVehicle;
    if (!vehicle) return false;
    const player = this.game.player;
    if (player) {
      const sideX = Math.cos(vehicle.heading);
      const sideZ = -Math.sin(vehicle.heading);
      const dropX = vehicle.mesh.position.x + sideX * 2.4;
      const dropZ = vehicle.mesh.position.z + sideZ * 2.4;
      player.mesh.position.set(dropX, 0, dropZ);
      player.mesh.visible = true;
      state.playerPos = { x: dropX, z: dropZ };
    }
    vehicle.speed = 0;
    state.playerInVehicle = null;
    return true;
  }

  otherVehicles() {
    const list = [];
    for (const v of this.all) list.push(v);
    const traffic = this.game.traffic?.cars || [];
    for (const car of traffic) list.push(car.vehicle);
    const cruisers = this.game.police?.cruisers || [];
    for (const unit of cruisers) list.push(unit.vehicle);
    return list;
  }

  checkNearMiss(playerVehicle) {
    const speedKmh = playerVehicle.speedKmh();
    if (speedKmh <= NEAR_MISS_SPEED_KMH) return;
    const px = playerVehicle.mesh.position.x;
    const pz = playerVehicle.mesh.position.z;
    for (const other of this.otherVehicles()) {
      if (other === playerVehicle || other.wrecked) continue;
      const dx = other.mesh.position.x - px;
      const dz = other.mesh.position.z - pz;
      const centerDist = Math.hypot(dx, dz);
      // Edge-to-edge gap: subtract both half-lengths along the line
      // between the cars (approximated by the sum of half lengths).
      const gap = centerDist - (playerVehicle.length + other.length) / 2;
      const key = other.id;
      let armed = this.nearMissState.get(key);
      if (armed === undefined) armed = true;
      if (gap < NEAR_MISS_GAP && armed) {
        this.nearMissState.set(key, false);
        const state = this.game.state;
        state.money += NEAR_MISS_REWARD;
        state.stats.nearMiss = (state.stats.nearMiss || 0) + 1;
        this.game.rep?.addRep?.(2);
        this.game.hud?.showEventPopup(`NEAR MISS +$${NEAR_MISS_REWARD}`);
        this.game.audio?.sfx?.('money');
      } else if (gap > NEAR_MISS_REARM_GAP && !armed) {
        // Re-arm by distance only: no timers, no wall clock.
        this.nearMissState.set(key, true);
      }
    }
  }

  checkCollisions(playerVehicle) {
    const px = playerVehicle.mesh.position.x;
    const pz = playerVehicle.mesh.position.z;
    for (const other of this.otherVehicles()) {
      if (other === playerVehicle || other.wrecked) continue;
      const dx = other.mesh.position.x - px;
      const dz = other.mesh.position.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.1 && Math.abs(playerVehicle.speed) > 2) {
        const impact = Math.abs(playerVehicle.speed);
        playerVehicle.crash(impact);
        other.damage(impact * 0.8);
        playerVehicle.speed *= 0.35;
        other.speed = Math.max(other.speed, impact * 0.3);
      }
    }
  }

  update(dt) {
    const vehicle = this.game.state.playerInVehicle;
    if (!vehicle) return;
    vehicle.update(dt, this.game.input, true);
    if (!vehicle.wrecked) {
      this.checkNearMiss(vehicle);
      this.checkCollisions(vehicle);
    }
  }
}

// Local blob shadow: a radial-gradient canvas texture shared by every
// vehicle. Built lazily so importing this module never touches the DOM.
export function blobShadowMesh(length, width) {
  if (!blobTexture && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    blobTexture = new THREE.CanvasTexture(canvas);
  }
  const material = new THREE.MeshBasicMaterial({
    map: blobTexture || null,
    color: blobTexture ? 0xffffff : 0x000000,
    transparent: true,
    opacity: blobTexture ? 1 : 0.3,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length),
    material,
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function turnToward(current, target, maxStep) {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}
