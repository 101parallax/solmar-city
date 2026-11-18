import * as THREE from 'three';
import { VEHICLES } from '../data/vehicles.js';

// Arcade vehicle: primitive-built mesh, simple arcade handling, NOS boost,
// damage and wreck states. One class serves player cars, parked cars,
// traffic and police cruisers.
export class Vehicle {
  constructor(game, def, x, z, heading = 0, opts = {}) {
    this.game = game;
    this.def = def;
    this.name = def.name ?? 'Car';
    this.type = def.type ?? 'sedan';
    // Top speed may be authored in km/h or m/s; normalise to m/s.
    const rawTop = def.topSpeed ?? 40;
    this.topSpeed = rawTop > 80 ? rawTop / 3.6 : rawTop;
    this.accel = THREE.MathUtils.clamp(def.accel ?? 12, 4, 30);
    this.health = 100;
    this.maxHealth = 100;
    this.speed = 0;
    this.heading = heading;
    this.steerVisual = 0;
    this.nos = 100;
    this.nosActive = false;
    this.wrecked = false;
    this.isPlayer = false;
    this.isPolice = !!opts.police;
    this.parked = opts.parked !== false;
    this.stolenOnce = false;
    this.driftTime = 0;
    this.smokeTimer = 0;
    this.lightTimer = 0;
    this.mesh = this._buildMesh();
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.mesh.userData.hitTarget = { kind: this.isPolice ? 'cruiser' : 'vehicle', ref: this };
    game.scene.add(this.mesh);
  }

  _buildMesh() {
    const dims = {
      sedan: [4.4, 1.9], sport: [4.3, 1.95], supercar: [4.5, 2.0],
      SUV: [4.8, 2.05], van: [5.2, 2.05], bus: [9.5, 2.5], truck: [6.8, 2.4],
    };
    const [length, width] = dims[this.type] ?? dims.sedan;
    this.length = length;
    this.width = width;
    const group = new THREE.Group();
    // Vehicle defs carry a `colors` palette (first entry is the signature
    // colour); police defs carry a single `color`. Without this every car
    // fell back to the same grey.
    const paintColor = this.def.color
      ?? (Array.isArray(this.def.colors) ? this.def.colors[0] : undefined)
      ?? 0x8899aa;
    const paint = new THREE.Color(paintColor);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: paint, metalness: 0.6, roughness: 0.35,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0e1a24, metalness: 0.9, roughness: 0.15,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 0.72, length), this.bodyMat);
    body.position.y = 0.62;
    group.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.82, 0.62, length * 0.48), glassMat,
    );
    cabin.position.set(0, 1.28, -length * 0.06);
    group.add(cabin);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.84, 0.08, length * 0.5), this.bodyMat,
    );
    roof.position.set(0, 1.62, -length * 0.06);
    group.add(roof);
    // Wheels on pivot groups so they can spin and (front) steer.
    this.wheels = [];
    this.frontWheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.28, 10);
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc, metalness: 0.8, roughness: 0.3,
    });
    for (const z of [-length * 0.32, length * 0.32]) {
      for (const side of [-1, 1]) {
        const holder = new THREE.Group();
        holder.position.set(side * (width / 2 - 0.05), 0.34, z);
        const tire = new THREE.Mesh(wheelGeo, wheelMat);
        tire.rotation.z = Math.PI / 2;
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.rotation.z = Math.PI / 2;
        holder.add(tire);
        holder.add(hub);
        group.add(holder);
        this.wheels.push(holder);
        if (z > 0) this.frontWheels.push(holder);
      }
    }
    // Headlights and tail lights.
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff6c9, emissive: 0xfff2a0, emissiveIntensity: 0.9,
    });
    this.tailMat = new THREE.MeshStandardMaterial({
      color: 0x550000, emissive: 0xff2211, emissiveIntensity: 0.4,
    });
    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), headMat);
      head.position.set(side * width * 0.32, 0.66, length / 2 + 0.02);
      group.add(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), this.tailMat);
      tail.position.set(side * width * 0.32, 0.68, -length / 2 - 0.02);
      group.add(tail);
    }
    // Police light bar with alternating red/blue beacons.
    if (this.isPolice) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.6, 0.14, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }),
      );
      bar.position.set(0, 1.72, -length * 0.06);
      group.add(bar);
      this.lightMatL = new THREE.MeshStandardMaterial({
        color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2.5,
      });
      this.lightMatR = new THREE.MeshStandardMaterial({
        color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 0.2,
      });
      const beaconGeo = new THREE.BoxGeometry(0.34, 0.2, 0.28);
      const beaconL = new THREE.Mesh(beaconGeo, this.lightMatL);
      beaconL.position.set(-width * 0.16, 1.86, -length * 0.06);
      group.add(beaconL);
      const beaconR = new THREE.Mesh(beaconGeo, this.lightMatR);
      beaconR.position.set(width * 0.16, 1.86, -length * 0.06);
      group.add(beaconR);
    }
    group.add(blobShadowMesh(Math.max(length, width) * 1.15));
    return group;
  }

  setBrakeLights(on) {
    if (this.tailMat) this.tailMat.emissiveIntensity = on ? 2.4 : 0.4;
  }

  speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  position() {
    return { x: this.mesh.position.x, z: this.mesh.position.z };
  }

  damage(amount) {
    if (this.wrecked) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health > 0) return;
    this.wrecked = true;
    this.speed = 0;
    this.bodyMat.color.set(0x1c1c1e);
    const pos = { x: this.mesh.position.x, y: 1, z: this.mesh.position.z };
    this.game.effects?.explosion?.(pos);
    this.game.audio?.sfx?.('explosion');
    this.game.events?.emit?.('vehicleWrecked', { vehicle: this });
    if (this.isPlayer) {
      this.game.player?.takeDamage?.(20);
      this.game.vehicles?.exit?.();
    }
  }

  update(dt, controls = null) {
    // A wrecked car is a burnt hulk: occasional smoke, no movement.
    if (this.wrecked) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.7;
        this.game.effects?.smoke?.({
          x: this.mesh.position.x, y: 1, z: this.mesh.position.z,
        });
      }
      return;
    }
    const input = this.game.input;
    let throttle = 0;
    let brake = 0;
    let steer = 0;
    let handbrake = false;
    let wantNos = false;
    if (controls) {
      throttle = controls.throttle ?? 0;
      brake = controls.brake ?? 0;
      steer = controls.steer ?? 0;
      handbrake = !!controls.handbrake;
      wantNos = !!controls.nos;
    } else if (this.isPlayer && input) {
      throttle = (input.isDown('KeyW') || input.isDown('ArrowUp')) ? 1 : 0;
      brake = (input.isDown('KeyS') || input.isDown('ArrowDown')) ? 1 : 0;
      steer = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
        - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
      handbrake = input.isDown('Space');
      wantNos = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    }
    // NOS: top speed x1.35 while the tank lasts (needs the REP unlock).
    const nitroUnlocked = !!this.game.state?.unlocks?.nitro;
    this.nosActive = this.isPlayer && wantNos && nitroUnlocked && this.nos > 0 && this.speed > 5;
    if (this.nosActive) this.nos = Math.max(0, this.nos - 30 * dt);
    else this.nos = Math.min(100, this.nos + 8 * dt);
    let top = this.topSpeed * (this.nosActive ? 1.35 : 1);
    if (controls?.boost) top *= 1.15;
    // Longitudinal physics.
    if (throttle > 0) this.speed += this.accel * throttle * dt * (this.speed < 0 ? 2.2 : 1);
    if (brake > 0) {
      if (this.speed > 0.5) this.speed -= 26 * brake * dt;
      else this.speed = Math.max(-9, this.speed - 10 * brake * dt);
    }
    // Handbrake bleeds speed gently (0.9/s): at the old 2.2/s the car could
    // never hold the 12 m/s drift threshold, so DRIFT bonuses were
    // unreachable. With throttle held the car now sustains a drift.
    if (handbrake) this.speed -= this.speed * Math.min(1, 0.9 * dt);
    // Rolling drag: at the old 0.35/s the drag equilibrium (accel/drag)
    // sat at ~63 m/s for the Vento GT — below its NOS top speed of 84, so
    // NOS could never push the car past its normal top speed. At 0.12/s
    // the caps (topSpeed, NOS x1.35) decide the top speed, not drag.
    this.speed -= this.speed * 0.12 * dt;
    if (Math.abs(this.speed) < 0.05 && throttle === 0 && brake === 0) this.speed = 0;
    this.speed = THREE.MathUtils.clamp(this.speed, -9, top);
    // Steering scales with speed and flips in reverse.
    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 9, 0, 1);
    this.heading += steer * 1.9 * speedFactor * dt * Math.sign(this.speed || 1);
    this.steerVisual += (steer * 0.45 - this.steerVisual) * Math.min(1, dt * 10);
    // Drift: handbrake + speed + steering, paid out when the drift ends.
    const drifting = handbrake && Math.abs(this.speed) > 12 && Math.abs(steer) > 0.3;
    if (drifting) {
      this.driftTime += dt;
      if (this.game.rng.chance(0.5)) {
        this.game.effects?.smoke?.({
          x: this.mesh.position.x - Math.sin(this.heading) * this.length * 0.3,
          y: 0.4,
          z: this.mesh.position.z - Math.cos(this.heading) * this.length * 0.3,
        });
      }
    } else {
      if (this.driftTime > 0.8 && this.isPlayer) this._awardDrift();
      this.driftTime = 0;
    }
    // Move, stopping hard on buildings, water and the city edge.
    const nx = this.mesh.position.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.mesh.position.z + Math.cos(this.heading) * this.speed * dt;
    if (pointBlocked(this.game, nx, nz, 1.1)) {
      if (Math.abs(this.speed) > 8) {
        this.damage(Math.min(30, Math.abs(this.speed) * 1.2));
        this.game.effects?.sparks?.({ x: nx, y: 0.8, z: nz });
        this.game.effects?.shake?.(0.35);
        this.game.audio?.sfx?.('crash');
      }
      this.speed *= -0.25;
    } else {
      this.mesh.position.x = nx;
      this.mesh.position.z = nz;
    }
    this.mesh.rotation.y = this.heading;
    // Wheel spin and front-wheel steering.
    const spin = (this.speed * dt) / 0.34;
    for (const wheel of this.wheels) wheel.rotation.x += spin;
    for (const wheel of this.frontWheels) wheel.rotation.y = this.steerVisual;
    // NOS exhaust flames.
    if (this.nosActive) {
      this.game.effects?.spawnParticles?.({
        x: this.mesh.position.x - Math.sin(this.heading) * this.length * 0.5,
        y: 0.45,
        z: this.mesh.position.z - Math.cos(this.heading) * this.length * 0.5,
      }, 0xff7722, 2, { speed: 2, up: 0.5, life: 0.25, gravity: 0 });
    }
    // Damaged cars smoke from the hood.
    if (this.health < 40) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.35;
        this.game.effects?.smoke?.({
          x: this.mesh.position.x + Math.sin(this.heading) * this.length * 0.3,
          y: 1.1,
          z: this.mesh.position.z + Math.cos(this.heading) * this.length * 0.3,
        });
      }
    }
    // Police beacons alternate red and blue.
    if (this.isPolice) {
      this.lightTimer += dt;
      const phase = Math.floor(this.lightTimer / 0.25) % 2;
      if (this.lightMatL) this.lightMatL.emissiveIntensity = phase === 0 ? 2.5 : 0.2;
      if (this.lightMatR) this.lightMatR.emissiveIntensity = phase === 0 ? 0.2 : 2.5;
    }
  }

  _awardDrift() {
    const bonus = Math.min(500, 50 + Math.floor(this.driftTime) * 50);
    const state = this.game.state;
    state.money += bonus;
    state.stats.drifts++;
    this.game.rep?.addRep?.(2);
    this.game.hud?.showEventPopup?.(`DRIFT +$${bonus}`);
    this.game.audio?.sfx?.('money');
  }
}

// Fixed parking spots for the 11 drivable cars, spread across the city grid.
const PARKED_SPOTS = [
  [-245, -175, 0], [-175, -245, Math.PI / 2], [-105, -175, 0],
  [-35, -245, 0], [35, -175, Math.PI], [105, -245, 0],
  [175, -175, 0], [245, -105, Math.PI / 2], [-245, 35, 0],
  [-175, 105, Math.PI / 2], [105, 175, 0],
];

export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.parked = [];
    this.all = [];
    // Per-vehicle near-miss arming: a car re-arms only after it is far away,
    // so the bonus is purely distance-based and never depends on wall time.
    this.nearMissArmed = new Map();
    VEHICLES.forEach((def, i) => {
      const spot = PARKED_SPOTS[i % PARKED_SPOTS.length];
      const vehicle = new Vehicle(game, def, spot[0], spot[1], spot[2], { parked: true });
      this.parked.push(vehicle);
      this.all.push(vehicle);
    });
  }

  spawn(nameOrDef, x, z, heading = 0, opts = {}) {
    let def = typeof nameOrDef === 'string'
      ? VEHICLES.find((v) => v.name.toLowerCase() === nameOrDef.toLowerCase())
      : nameOrDef;
    // Mission chase targets are authored by vehicle type ('sport',
    // 'supercar'), so fall back to a type match before the default car.
    if (!def && typeof nameOrDef === 'string') {
      def = VEHICLES.find((v) => v.type.toLowerCase() === nameOrDef.toLowerCase());
    }
    if (!def) def = VEHICLES[0];
    const vehicle = new Vehicle(this.game, def, x, z, heading, opts);
    this.all.push(vehicle);
    // Spawned cars are parked by default (mission vehicles, shot cars):
    // nearestParked() only searches this list, so a spawned car left out
    // of it could never be entered with F — which made the M1 Vento GT
    // (spawned, not parked) impossible to steal.
    if (vehicle.parked) this.parked.push(vehicle);
    return vehicle;
  }

  nearestParked(x, z, maxDist = 4.5) {
    let best = null;
    let bestDist = maxDist;
    for (const vehicle of this.parked) {
      if (vehicle.wrecked) continue;
      const d = Math.hypot(vehicle.mesh.position.x - x, vehicle.mesh.position.z - z);
      if (d < bestDist) {
        best = vehicle;
        bestDist = d;
      }
    }
    return best;
  }

  findByName(name) {
    return this.all.find((v) => v.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  enter(vehicle) {
    if (!vehicle || vehicle.wrecked) return false;
    this.exit();
    vehicle.isPlayer = true;
    vehicle.parked = false;
    this.parked = this.parked.filter((v) => v !== vehicle);
    this.game.state.playerInVehicle = vehicle;
    const player = this.game.player;
    if (player) {
      player.inVehicle = vehicle;
      player.mesh.visible = false;
      player.mesh.position.copy(vehicle.mesh.position);
    }
    if (!vehicle.stolenOnce) {
      vehicle.stolenOnce = true;
      this.game.state.stats.carsStolen++;
      this.game.wanted?.addCrime?.('steal');
      this.game.events?.emit?.('carStolen', { vehicle });
    }
    return true;
  }

  exit() {
    const vehicle = this.game.state.playerInVehicle;
    if (!vehicle) return;
    const player = this.game.player;
    vehicle.isPlayer = false;
    this.game.state.playerInVehicle = null;
    // The car stays parked where it was left, so the player can get back in.
    // stolenOnce stays set, so re-entering it is not a second theft.
    if (!vehicle.wrecked && !this.parked.includes(vehicle)) {
      vehicle.parked = true;
      this.parked.push(vehicle);
    }
    if (player) {
      player.inVehicle = null;
      player.mesh.visible = true;
      const sideX = vehicle.mesh.position.x + Math.cos(vehicle.heading) * 2.2;
      const sideZ = vehicle.mesh.position.z - Math.sin(vehicle.heading) * 2.2;
      if (!pointBlocked(this.game, sideX, sideZ, 0.5)) player.teleport(sideX, sideZ);
      else player.teleport(vehicle.mesh.position.x, vehicle.mesh.position.z + 2.5);
    }
  }

  update(dt) {
    const active = this.game.state.playerInVehicle;
    if (!active) return;
    active.update(dt, null);
    this._resolveCollisions(active);
    this._checkNearMiss(active);
  }

  _otherVehicles(except) {
    const others = [];
    for (const vehicle of this.all) {
      if (vehicle !== except && !vehicle.wrecked) others.push(vehicle);
    }
    for (const car of this.game.traffic?.cars ?? []) {
      if (car.vehicle && !car.vehicle.wrecked) others.push(car.vehicle);
    }
    for (const cruiser of this.game.police?.cruisers ?? []) {
      if (cruiser.vehicle && !cruiser.vehicle.wrecked) others.push(cruiser.vehicle);
    }
    if (this.game.police?.roadblock) {
      for (const vehicle of this.game.police.roadblock.vehicles) {
        if (!vehicle.wrecked) others.push(vehicle);
      }
    }
    return others;
  }

  _resolveCollisions(active) {
    const px = active.mesh.position.x;
    const pz = active.mesh.position.z;
    for (const other of this._otherVehicles(active)) {
      const ox = other.mesh.position.x;
      const oz = other.mesh.position.z;
      const dx = px - ox;
      const dz = pz - oz;
      const dist = Math.hypot(dx, dz);
      if (dist >= 2.3 || dist < 0.01) continue;
      // Push the player car out of the overlap and trade paint.
      const push = (2.3 - dist) / dist;
      active.mesh.position.x += dx * push;
      active.mesh.position.z += dz * push;
      const impact = Math.abs(active.speed);
      if (impact > 4) {
        active.damage(Math.min(20, impact));
        other.damage(Math.min(20, impact * 0.8));
        this.game.effects?.sparks?.({ x: (px + ox) / 2, y: 0.8, z: (pz + oz) / 2 });
        this.game.effects?.shake?.(0.3);
        this.game.audio?.sfx?.('crash');
      }
      active.speed *= 0.5;
    }
  }

  // NEAR MISS (deterministic): player car above 80 km/h passing another car
  // with an edge-to-edge gap under 2 m. Distance and speed only — no timers.
  _checkNearMiss(playerVehicle) {
    if (playerVehicle.speedKmh() <= 80) return;
    const px = playerVehicle.mesh.position.x;
    const pz = playerVehicle.mesh.position.z;
    for (const other of this._otherVehicles(playerVehicle)) {
      const centerDist = Math.hypot(other.mesh.position.x - px, other.mesh.position.z - pz);
      if (centerDist > 12) {
        this.nearMissArmed.set(other, true);
        continue;
      }
      const armed = this.nearMissArmed.get(other) ?? true;
      const gap = centerDist - 2.0;
      if (armed && gap < 2 && gap > 0.2) {
        this.nearMissArmed.set(other, false);
        const state = this.game.state;
        state.money += 250;
        state.stats.nearMiss++;
        this.game.rep?.addRep?.(3);
        this.game.hud?.showEventPopup?.('NEAR MISS +$250');
        this.game.audio?.sfx?.('money');
        this.game.events?.emit?.('nearMiss', { vehicle: other });
      }
    }
  }
}

// True when a point (with radius) is inside a building, in water, or outside
// the city bounds. Shared by every entity that moves.
export function pointBlocked(game, x, z, radius = 0.5) {
  const city = game.city;
  if (!city) return false;
  if (city.isWater && city.isWater(x, z)) return true;
  const bounds = city.bounds;
  if (bounds) {
    const minX = bounds.minX ?? -280;
    const maxX = bounds.maxX ?? 280;
    const minZ = bounds.minZ ?? -280;
    const maxZ = bounds.maxZ ?? 280;
    if (x < minX + radius || x > maxX - radius || z < minZ + radius || z > maxZ - radius) {
      return true;
    }
  } else if (Math.abs(x) > 280 || Math.abs(z) > 280) {
    return true;
  }
  const colliders = city.colliders ?? [];
  for (const c of colliders) {
    if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) {
      return true;
    }
  }
  return false;
}

// Soft radial blob shadow, built once from a canvas gradient and shared by
// every entity. Excluded from raycasts so it never blocks bullets.
let shadowTexture = null;
let shadowMaterial = null;
export function blobShadowMesh(size) {
  if (!shadowTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    shadowTexture = new THREE.CanvasTexture(canvas);
  }
  if (!shadowMaterial) {
    shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.4,
    });
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), shadowMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  mesh.raycast = () => {};
  return mesh;
}

// Shortest signed angle difference, wrapped to [-PI, PI].
export function wrapAngle(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

// Turn `current` toward `target` by at most `maxStep` radians.
export function turnToward(current, target, maxStep) {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}
