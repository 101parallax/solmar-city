// Rico Vane, the player: on foot (WASD relative to the orbit camera, Shift to
// run) and driving (F to enter/exit the nearest car, civilian drivers dragged
// out and fleeing). This is the object MissionManager and Combat read:
//   player.pos         {x, z} — combat + missions
//   player.vehicleId   id of the driven car, or null on foot — missions
//   player.health / player.armour — plain numbers, mutated by combat.damage
//   player.dead        health <= 0 — main.js maps it to state.playerDead
//   player.facing      aim angle in combat convention (atan2(dz, dx))
// Input comes from world.input (input.js, Worker D). One-shot keys arrive as
// world.actions (the flags main.js took this frame); when main.js does not
// provide them, the player takes them from the input object itself (tests).
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { ACTION_ENTER } from '../input.js';
import { createPersonMesh } from './pedestrians.js';
import { angleDiff, clamp, lerp } from './graph.js';

export class Player {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.health = PLAYER.maxHealth;
    this.armour = opts.armour || 0;
    this.vehicle = null;
    this.speed = 0;
    this._phase = 0;
    this._camYaw = this.heading;
    this._camPitch = 0.32;
    this._camDist = 0;
    this._lastDrag = -10;
    this._time = 0;
    this.parts = createPersonMesh({
      shirt: 0x2a2f36,
      pants: 0x2a3a5f,
      skin: 0xc98a5a,
      hair: 0x1a1210,
      height: 1.8,
    });
    this.mesh = this.parts.group;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    if (scene) scene.add(this.mesh);
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  get vehicleId() {
    return this.vehicle ? this.vehicle.id : null;
  }

  get onFoot() {
    return this.vehicle === null;
  }

  get dead() {
    return this.health <= 0;
  }

  // Combat measures angles as atan2(dz, dx) (0 = +x); our heading is
  // atan2(dx, dz) (0 = +z). Convert so lock-on and tracers agree.
  get facing() {
    return Math.atan2(Math.cos(this.heading), Math.sin(this.heading));
  }

  get position() {
    return { x: this.x, z: this.z };
  }

  /** Armour absorbs first, the rest hits health. Mirrors combat.damage. */
  takeDamage(amount) {
    const absorbed = Math.min(this.armour, amount);
    this.armour -= absorbed;
    this.health = Math.max(0, this.health - (amount - absorbed));
    return this.dead;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  /** WASTED respawn: hospital steps, full health, on foot, no armour. */
  respawn(x, z) {
    if (this.vehicle) {
      this.vehicle.setControl({ throttle: 0, brake: 0, steer: 0, handbrake: false });
      this.vehicle = null;
    }
    this.x = x;
    this.z = z;
    this.health = PLAYER.maxHealth;
    this.armour = 0;
    this.speed = 0;
    this.mesh.visible = true;
    this.mesh.position.set(x, 0, z);
  }

  // Nearest enterable car within steal range (not wrecked, not a moving cop
  // chase target — any Vehicle in world.vehicles qualifies).
  nearestVehicle(world) {
    let best = null;
    let bestD = PLAYER.stealRange;
    for (const v of world?.vehicles || []) {
      if (v.wrecked) continue;
      const d = Math.hypot(v.x - this.x, v.z - this.z) - v.radius * 0.5;
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  enterVehicle(vehicle, world) {
    if (!vehicle || this.vehicle) return false;
    const firstTheft = !vehicle.stolen;
    if (vehicle.driver) {
      vehicle.driver = false;
      // The driver is dragged out and runs away.
      if (world?.pedestrians && typeof world.pedestrians.spawnFleeing === 'function') {
        world.pedestrians.spawnFleeing(vehicle.x, vehicle.z);
      }
    }
    // Taking any car that is not already yours is a theft — parked or not.
    // Re-entering a car you already stole is not a new crime.
    if (firstTheft && typeof world?.onCrime === 'function') {
      world.onCrime('steal', { x: vehicle.x, z: vehicle.z });
    }
    vehicle.stolen = true;
    vehicle.parked = false;
    this.vehicle = vehicle;
    this.mesh.visible = false;
    this._camYaw = vehicle.heading;
    return true;
  }

  exitVehicle(world) {
    const v = this.vehicle;
    if (!v) return false;
    // Step out on the driver's side (left of the car's forward).
    const lx = Math.cos(v.heading);
    const lz = -Math.sin(v.heading);
    this.x = v.x + lx * (v.type.width / 2 + 0.9);
    this.z = v.z + lz * (v.type.width / 2 + 0.9);
    if (world && typeof world.collideCircle === 'function') {
      const fixed = world.collideCircle(this.x, this.z, PLAYER.radius);
      if (fixed) {
        this.x = fixed.x;
        this.z = fixed.z;
      }
    }
    v.setControl({ throttle: 0, brake: 0, steer: 0, handbrake: false });
    this.heading = v.heading;
    this.vehicle = null;
    this.speed = 0;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    return true;
  }

  // Re-sync the player's position from the driven car. main.js calls this
  // after resolveVehicleCollisions (the collision pass moves the car after
  // this update ran); update() also syncs at its start so a frame never
  // reads a stale position.
  syncToVehicle() {
    if (!this.vehicle) return;
    this.x = this.vehicle.x;
    this.z = this.vehicle.z;
    this.heading = this.vehicle.heading;
    this.speed = Math.abs(this.vehicle.speed);
  }

  update(dt, world) {
    this._time += dt;
    if (this.vehicle) this.syncToVehicle();
    const input = world?.input;
    if (!input || this.dead) {
      if (this.vehicle) this.vehicle.setControl({ throttle: 0, brake: 0, steer: 0, handbrake: false });
      return;
    }

    // Camera orbit from mouse drag (lookDelta is consumed once per frame).
    const look = input.lookDelta ? input.lookDelta() : { x: 0, y: 0 };
    if (look.x !== 0 || look.y !== 0) {
      this._camYaw -= look.x * 0.0045;
      this._camPitch = clamp(this._camPitch + look.y * 0.003, 0.08, 1.1);
      this._lastDrag = this._time;
    }

    const actions = world.actions !== undefined
      ? world.actions
      : input.takeActions ? input.takeActions() : 0;
    if (actions & ACTION_ENTER) {
      if (this.vehicle) this.exitVehicle(world);
      else {
        const v = this.nearestVehicle(world);
        if (v) this.enterVehicle(v, world);
      }
    }

    const move = input.move ? input.move() : { x: 0, y: 0 };

    if (this.vehicle) {
      // Driving: y is throttle/brake, x is steering, Space is the handbrake.
      this.vehicle.setControl({
        throttle: move.y > 0 ? move.y : 0,
        brake: move.y < 0 ? -move.y : 0,
        steer: -move.x,
        handbrake: input.brake ? input.brake() : false,
      });
      // The player owns the driven car's physics step; traffic AI skips
      // stolen cars, so the car is stepped exactly once per frame.
      this.vehicle.update(dt, world);
      this.x = this.vehicle.x;
      this.z = this.vehicle.z;
      this.heading = this.vehicle.heading;
      this.speed = Math.abs(this.vehicle.speed);
      // The chase camera eases back behind the car after a drag.
      if (this._time - this._lastDrag > 1.5) {
        this._camYaw += angleDiff(this.vehicle.heading, this._camYaw) * Math.min(1, dt * 2.5);
      }
      return;
    }

    // On foot: movement is relative to the camera yaw.
    const fx = Math.sin(this._camYaw);
    const fz = Math.cos(this._camYaw);
    const rx = -fz;
    const rz = fx;
    let mx = fx * move.y + rx * move.x;
    let mz = fz * move.y + rz * move.x;
    const len = Math.hypot(mx, mz);
    const running = input.run ? input.run() : false;
    const targetSpeed = len > 0.1 ? (running ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
    this.speed = lerp(this.speed, targetSpeed, Math.min(1, dt * 10));
    if (len > 0.1) {
      mx /= len;
      mz /= len;
      const want = Math.atan2(mx, mz);
      this.heading += angleDiff(want, this.heading) * Math.min(1, dt * 12);
      this.x += mx * this.speed * dt;
      this.z += mz * this.speed * dt;
      if (world && typeof world.collideCircle === 'function') {
        const fixed = world.collideCircle(this.x, this.z, PLAYER.radius);
        if (fixed) {
          this.x = fixed.x;
          this.z = fixed.z;
        }
      }
    }

    // Walk-cycle animation.
    this._phase += this.speed * dt * 3.2;
    const swing = clamp(this.speed / 2, 0, 1) * 0.65;
    const s = Math.sin(this._phase);
    this.parts.legL.rotation.x = s * swing;
    this.parts.legR.rotation.x = -s * swing;
    this.parts.armL.rotation.x = -s * swing * 0.7;
    this.parts.armR.rotation.x = s * swing * 0.7;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // Third-person camera: main.js calls this after update(). On foot the camera
  // sits behind the orbit yaw; driving, behind the car. Pitch is clamped so
  // the camera never goes under the street.
  updateCamera(camera, dt) {
    const driving = this.vehicle !== null;
    const targetDist = driving ? 9.5 : 6.5;
    const targetHeight = driving ? 3.4 : 2.9;
    this._camDist = lerp(this._camDist || targetDist, targetDist, Math.min(1, dt * 4));
    const yaw = this._camYaw;
    const cx = this.x - Math.sin(yaw) * Math.cos(this._camPitch) * this._camDist;
    const cz = this.z - Math.cos(yaw) * Math.cos(this._camPitch) * this._camDist;
    const cy = Math.max(1.2, 1.6 + Math.sin(this._camPitch) * this._camDist + (targetHeight - 2.9));
    camera.position.set(cx, cy, cz);
    camera.lookAt(this.x, 1.5, this.z);
  }

  destroy() {
    if (this.scene) this.scene.remove(this.mesh);
    this.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
