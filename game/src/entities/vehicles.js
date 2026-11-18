// Arcade vehicle: bicycle-model steering, grip-based drift, visual damage.
// Mesh is built facing +Z; forward = (sin(heading), cos(heading)) in (x, z).
// The owner (player, traffic AI, police AI) sets `control` each frame, then
// calls update(dt, world). World is optional here; if world.collideCircle
// exists it is used to keep the car out of buildings (provided by world/).
import * as THREE from 'three';
import { vehicleType } from '../data/vehicles.js';
import { clamp, lerp } from './graph.js';

export class Vehicle {
  constructor(scene, typeId, color, opts = {}) {
    this.type = vehicleType(typeId);
    this.color = color ?? this.type.colors[0];
    // Stable id: mission vehicles get 'm1-target' / 'm3-target' (see
    // data/missions.js); everything else gets a unique veh-N id. Player
    // exposes the id of the car it drives as `vehicleId` for MissionManager.
    this.id = opts.id ?? `veh-${++vehicleCounter}`;
    this.scene = scene;
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.speed = 0; // forward speed, m/s (signed)
    this.slide = 0; // lateral speed, m/s (drift)
    this.steer = 0; // current smoothed steer angle, radians
    this.damage = 0; // 0..1
    this.smoking = false;
    this.wrecked = false;
    // Nitrous (v2): 0..1 tank. setNos(true) while the player holds Shift in a
    // car; boosting drains the tank in ~4 s, it refills in ~12 s. AI and
    // police cars never call setNos, so only the player's car boosts.
    this.nos = 1;
    this.nosActive = false;
    this.nosBoosting = false;
    this.driver = opts.driver !== false; // civilian cars have a driver to eject
    this.parked = !!opts.parked;
    this.stolen = false; // set when the player steals it; traffic AI ignores it
    this.control = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this._roll = 0;
    this._pitch = 0;
    this._wheelSpin = 0;
    this._time = 0;
    this._inContact = false;
    this._lastCollideDmgAt = -10;
    this.parts = createVehicleMesh(this.type, this.color);
    this.mesh = this.parts.group;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    if (scene) scene.add(this.mesh);
  }

  get position() {
    return { x: this.x, z: this.z };
  }

  get forwardSpeed() {
    return this.speed;
  }

  get radius() {
    return Math.max(this.type.length, this.type.width) / 2;
  }

  setControl(control) {
    Object.assign(this.control, control);
  }

  /** Hold the nitrous button (Shift while driving). Boosting needs throttle. */
  setNos(active) {
    this.nosActive = Boolean(active);
  }

  /**
   * Whether this car can boost at all. Sports cars and supercars carry
   * factory nitrous; every other car needs the Nitro Kit from Chroma Auto
   * (Worker A, P0-11 — the shop sets vehicle.hasNitro on purchase). The
   * cover shot stages a Vento GT, so the NOS bar reads in a fresh game.
   */
  get hasNos() {
    return Boolean(this.hasNitro || this.type.id === 'sports' || this.type.id === 'supercar');
  }

  addDamage(amount) {
    if (this.wrecked) return;
    this.damage = clamp(this.damage + amount, 0, 1);
    if (this.damage >= 0.6) this.smoking = true;
    if (this.damage >= 1) {
      this.wrecked = true;
      this.smoking = true;
    }
    // Visual damage: body darkens and dulls as damage grows.
    const base = new THREE.Color(this.color);
    const dark = base.clone().lerp(new THREE.Color(0x1a1a1a), this.damage * 0.55);
    this.parts.bodyMat.color.copy(dark);
  }

  update(dt, world = null) {
    const t = this.type;
    const c = this.control;
    this._time += dt;
    // Nitrous: boosts top speed +35% and adds extra thrust while the tank
    // lasts; it only engages under throttle, never while wrecked.
    const boosting = this.nosActive && this.nos > 0.01 && !this.wrecked && c.throttle > 0;
    if (boosting) this.nos = Math.max(0, this.nos - dt / 4);
    else this.nos = Math.min(1, this.nos + dt / 12);
    this.nosBoosting = boosting;
    const topSpeed = t.topSpeed * (1 - 0.55 * this.damage) * (boosting ? 1.35 : 1);
    const engine = this.wrecked ? 0 : 1;

    // Longitudinal: engine, drag, rolling resistance, brake/reverse.
    if (c.throttle > 0) this.speed += c.throttle * t.accel * engine * dt;
    if (boosting) this.speed += t.accel * 1.2 * engine * dt;
    this.speed -= this.speed * Math.abs(this.speed) * 0.0035 * dt; // drag
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.6 * dt); // rolling
    if (c.brake > 0) {
      if (this.speed > 0.5) this.speed -= t.brake * c.brake * dt;
      else this.speed -= t.accel * 0.6 * c.brake * dt; // reverse
    }
    if (c.handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    this.speed = clamp(this.speed, -t.reverseSpeed, topSpeed);

    // Steering: less lock at speed; smoothed so the wheel doesn't snap.
    const speedFactor = 1 / (1 + Math.abs(this.speed) * 0.045);
    const targetSteer = c.steer * t.maxSteer * speedFactor;
    this.steer = lerp(this.steer, targetSteer, Math.min(1, dt * 8));
    const yawRate = (this.speed / t.wheelBase) * Math.tan(this.steer);
    this.heading += yawRate * dt;
    if (c.handbrake && Math.abs(this.speed) > 5) {
      this.heading += c.steer * 0.9 * Math.sign(this.speed) * dt; // drift swing
    }

    // Lateral slide: grip bleeds it away; handbrake kills grip (drift).
    const grip = c.handbrake ? 1.2 : t.grip;
    this.slide *= Math.exp(-grip * dt);
    if (c.handbrake && Math.abs(this.steer) > 0.1) {
      this.slide = lerp(this.slide, -c.steer * Math.abs(this.speed) * 0.35, Math.min(1, dt * 3));
    }

    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const rx = -fz;
    const rz = fx;
    let nx = this.x + (fx * this.speed + rx * this.slide) * dt;
    let nz = this.z + (fz * this.speed + rz * this.slide) * dt;
    if (world && typeof world.collideCircle === 'function') {
      const fixed = world.collideCircle(nx, nz, this.radius);
      if (fixed && (Math.abs(fixed.x - nx) + Math.abs(fixed.z - nz) > 0.01)) {
        // Crash damage fires once per impact (on the free -> contact
        // transition): sliding along a wall must not wreck the car.
        if (!this._inContact && Math.abs(this.speed) > 6) this.addDamage(0.04);
        this._inContact = true;
        nx = fixed.x;
        nz = fixed.z;
      } else {
        this._inContact = false;
      }
    }
    this.x = nx;
    this.z = nz;

    // Visuals: body roll into corners, pitch under accel/brake, spinning wheels.
    const rollTarget = clamp(-this.steer * Math.abs(this.speed) * 0.012, -0.09, 0.09);
    const pitchTarget = clamp(-c.throttle * 0.02 + (c.brake > 0 ? 0.025 : 0), -0.04, 0.04);
    this._roll = lerp(this._roll, rollTarget, Math.min(1, dt * 6));
    this._pitch = lerp(this._pitch, pitchTarget, Math.min(1, dt * 6));
    this.parts.body.rotation.z = this._roll;
    this.parts.body.rotation.x = this._pitch;
    this._wheelSpin += (this.speed / WHEEL_R) * dt;
    for (const w of this.parts.spinWheels) w.rotation.x = this._wheelSpin;
    for (const w of this.parts.steerWheels) w.rotation.y = this.steer;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  destroy() {
    if (this.scene) this.scene.remove(this.mesh);
    this.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}


const WHEEL_R = 0.34;

let vehicleCounter = 0;

function lambert(color, emissive = 0x000000) {
  return new THREE.MeshLambertMaterial({ color, emissive });
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// Build the visible vehicle. Returns { group, body, spinWheels, steerWheels,
// bodyMat } — body holds the bodywork (rolls/pitches), wheels spin and steer.
export function createVehicleMesh(type, color) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const bodyMat = lambert(color);
  const glassMat = lambert(0x1a2530);
  const darkMat = lambert(0x1c1c1c);
  const { length: L, width: W, height: H } = type;
  const spinWheels = [];
  const steerWheels = [];
  const lights = {}; // police light-bar materials, for the siren flash

  function addWheel(x, z, steer) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(x, WHEEL_R, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 12), darkMat);
    tire.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8), lambert(0xb8bcc2));
    hub.rotation.z = Math.PI / 2;
    spin.add(tire, hub);
    steerPivot.add(spin);
    group.add(steerPivot);
    spinWheels.push(spin);
    if (steer) steerWheels.push(steerPivot);
    return spin;
  }

  if (type.kind === 'bike') {
    body.add(box(0.34, 0.34, 1.5, bodyMat, 0, 0.72, 0));
    body.add(box(0.3, 0.22, 0.5, darkMat, 0, 0.88, -0.35)); // seat
    body.add(box(0.5, 0.06, 0.06, darkMat, 0, 1.0, 0.55)); // handlebar
    body.add(box(0.06, 0.3, 0.06, darkMat, 0, 0.85, 0.55));
    const head = box(0.2, 0.12, 0.06, lambert(0xffffff, 0xffffcc), 0, 0.78, 0.78);
    body.add(head);
    addWheel(0, 0.72, true);
    addWheel(0, -0.72, false);
    return { group, body, spinWheels, steerWheels, bodyMat, lights };
  }

  const bodyH = type.kind === 'bus' || type.kind === 'van' ? H * 0.82 : H * 0.55;
  const bodyY = WHEEL_R + bodyH / 2 + 0.08;
  body.add(box(W, bodyH, L, bodyMat, 0, bodyY, 0));
  if (type.kind === 'bus') {
    body.add(box(W + 0.04, 0.7, L * 0.92, glassMat, 0, bodyY + bodyH * 0.28, 0));
    body.add(box(W * 0.5, 0.5, 0.1, lambert(0x222222, 0x111111), 0, bodyY + 0.6, L / 2 + 0.02));
  } else if (type.kind === 'van') {
    body.add(box(W + 0.04, H * 0.3, L * 0.26, glassMat, 0, bodyY + bodyH * 0.42, L * 0.3));
  } else {
    const cabL = L * 0.48;
    const cabH = H * 0.42;
    const cabY = bodyY + bodyH / 2 + cabH / 2 - 0.02;
    body.add(box(W * 0.86, cabH, cabL, bodyMat, 0, cabY, -L * 0.04));
    body.add(box(W * 0.88, cabH * 0.7, cabL * 0.86, glassMat, 0, cabY + 0.02, -L * 0.04));
    body.add(box(W * 0.88, cabH * 0.45, 0.06, glassMat, 0, cabY, L * 0.2)); // windshield
    body.add(box(W * 0.88, cabH * 0.45, 0.06, glassMat, 0, cabY, -L * 0.28)); // rear window
  }
  // Lights: front white, rear red.
  const lampZ = L / 2 + 0.01;
  body.add(box(0.42, 0.16, 0.06, lambert(0xfff6c8, 0x555533), -W * 0.32, bodyY, lampZ));
  body.add(box(0.42, 0.16, 0.06, lambert(0xfff6c8, 0x555533), W * 0.32, bodyY, lampZ));
  body.add(box(0.42, 0.16, 0.06, lambert(0xaa1111, 0x330000), -W * 0.32, bodyY, -lampZ));
  body.add(box(0.42, 0.16, 0.06, lambert(0xaa1111, 0x330000), W * 0.32, bodyY, -lampZ));
  if (type.taxi) {
    body.add(box(0.7, 0.22, 0.34, lambert(0xf2c200, 0x332200), 0, bodyY + H * 0.62, -L * 0.04));
  }
  if (type.police) {
    body.add(box(W + 0.04, 0.5, L * 0.7, lambert(0xf0f0f0), 0, bodyY + 0.05, 0)); // white doors
    const barY = bodyY + H * 0.72;
    lights.red = lambert(0xdd1122, 0xaa0011);
    lights.blue = lambert(0x2266ff, 0x0022aa);
    body.add(box(0.5, 0.14, 0.24, lights.red, -0.3, barY, -L * 0.04));
    body.add(box(0.5, 0.14, 0.24, lights.blue, 0.3, barY, -L * 0.04));
  }
  if (type.id === 'ambulance') {
    const cross = lambert(0xdd1122);
    for (const sx of [-1, 1]) {
      body.add(box(0.06, 0.5, 0.18, cross, sx * (W / 2 + 0.01), bodyY + 0.3, 0));
      body.add(box(0.06, 0.18, 0.5, cross, sx * (W / 2 + 0.01), bodyY + 0.3, 0));
    }
  }
  const wb = type.wheelBase / 2;
  const ww = W / 2 - 0.08;
  addWheel(-ww, wb, true);
  addWheel(ww, wb, true);
  addWheel(-ww, -wb, false);
  addWheel(ww, -wb, false);
  return { group, body, spinWheels, steerWheels, bodyMat, lights };
}


// Simple circle-vs-circle push-apart for vehicles; hard hits add damage.
// Call once per frame with the full vehicle list (traffic + police + player).
let collideClock = 0;
export function resolveVehicleCollisions(vehicles, dt) {
  collideClock += dt;
  for (let i = 0; i < vehicles.length; i += 1) {
    for (let j = i + 1; j < vehicles.length; j += 1) {
      const a = vehicles[i];
      const b = vehicles[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const min = (a.radius + b.radius) * 0.8;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const ux = dx / d;
      const uz = dz / d;
      const rel = Math.abs(a.speed - b.speed);
      a.x -= ux * push;
      a.z -= uz * push;
      b.x += ux * push;
      b.z += uz * push;
      // Impact damage is an event (0.75 s cooldown per car, on the shared
      // collision clock so parked cars — which never step — still re-arm):
      // a hard hit costs at most 0.06, so a car survives a long pursuit
      // of rams before it is wrecked.
      if (rel > 6) {
        for (const v of [a, b]) {
          if (collideClock - v._lastCollideDmgAt > 0.75) {
            v._lastCollideDmgAt = collideClock;
            v.addDamage(Math.min(0.06, (rel - 6) * 0.002));
          }
        }
      }
      const slow = Math.min(0.5, rel * 0.3 * dt);
      a.speed *= 1 - slow;
      b.speed *= 1 - slow;
    }
  }
}
