import * as THREE from 'three';
import { CITY_DATA } from '../data/city.js';
import { pointBlocked, blobShadowMesh, turnToward } from './vehicles.js';

// The player on foot: a primitive-built character with camera-relative WASD
// movement, sprint, vehicle entry (F) and interaction (E). Armour absorbs
// damage before health does. Dying during a mission fails it; dying in free
// roam wakes the player up at the hospital minus a $150 bill.
export class Player {
  constructor(game) {
    this.game = game;
    this.health = game.state?.health ?? 100;
    this.inVehicle = null;
    this.heading = 0;
    this.walkPhase = 0;
    this.tmpDir = new THREE.Vector3();
    this.mesh = this._buildMesh();
    this.mesh.position.set(0, 0, 0);
    game.scene.add(this.mesh);
  }

  _buildMesh() {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.7 });
    const jacket = new THREE.MeshStandardMaterial({ color: 0x0e7c86, roughness: 0.6 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x1d2733, roughness: 0.8 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 });
    // Legs pivot at the hip so the walk cycle can swing them.
    const legGeo = new THREE.BoxGeometry(0.22, 0.86, 0.26);
    this.legL = new THREE.Group();
    this.legL.position.set(-0.14, 0.86, 0);
    const legLMesh = new THREE.Mesh(legGeo, pants);
    legLMesh.position.y = -0.43;
    this.legL.add(legLMesh);
    group.add(this.legL);
    this.legR = new THREE.Group();
    this.legR.position.set(0.14, 0.86, 0);
    const legRMesh = new THREE.Mesh(legGeo, pants);
    legRMesh.position.y = -0.43;
    this.legR.add(legRMesh);
    group.add(this.legR);
    // Torso and arms.
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacket);
    torso.position.y = 1.22;
    group.add(torso);
    const armGeo = new THREE.BoxGeometry(0.18, 0.66, 0.22);
    this.armL = new THREE.Group();
    this.armL.position.set(-0.42, 1.52, 0);
    const armLMesh = new THREE.Mesh(armGeo, jacket);
    armLMesh.position.y = -0.33;
    this.armL.add(armLMesh);
    group.add(this.armL);
    this.armR = new THREE.Group();
    this.armR.position.set(0.42, 1.52, 0);
    const armRMesh = new THREE.Mesh(armGeo, jacket);
    armRMesh.position.y = -0.33;
    this.armR.add(armRMesh);
    group.add(this.armR);
    // Head and cap.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), skin);
    head.position.y = 1.82;
    group.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.1, 16), capMat);
    cap.position.y = 1.98;
    group.add(cap);
    group.add(blobShadowMesh(1.4));
    return group;
  }

  position() {
    if (this.inVehicle) {
      return { x: this.inVehicle.mesh.position.x, z: this.inVehicle.mesh.position.z };
    }
    return { x: this.mesh.position.x, z: this.mesh.position.z };
  }

  teleport(x, z, heading = null) {
    this.mesh.position.set(x, 0, z);
    if (heading !== null) {
      this.heading = heading;
      this.mesh.rotation.y = heading;
    }
    this.game.state.playerPos = { x, z };
  }

  update(dt) {
    const state = this.game.state;
    const input = this.game.input;
    // Driving: the mesh hides inside the car and follows it.
    if (this.inVehicle) {
      this.mesh.position.copy(this.inVehicle.mesh.position);
      this.mesh.rotation.y = this.inVehicle.heading;
      state.playerPos = { x: this.mesh.position.x, z: this.mesh.position.z };
      if (input?.wasPressed('KeyF')) this.game.vehicles?.exit?.();
      // E works from the driver's seat too: driving up to Chroma Auto and
      // pressing E must open the shop (Repair requires being in a vehicle,
      // so an on-foot-only E would make it unbuyable through the UI).
      if (input?.wasPressed('KeyE')) {
        this.game.events?.emit?.('interact', {
          x: this.mesh.position.x, z: this.mesh.position.z,
        });
      }
      return;
    }
    if (input) {
      const forward = (input.isDown('KeyW') || input.isDown('ArrowUp')) ? 1 : 0;
      const back = (input.isDown('KeyS') || input.isDown('ArrowDown')) ? 1 : 0;
      const right = (input.isDown('KeyD') || input.isDown('ArrowRight')) ? 1 : 0;
      const left = (input.isDown('KeyA') || input.isDown('ArrowLeft')) ? 1 : 0;
      // Movement is relative to where the camera looks.
      let fx = 0;
      let fz = -1;
      const camera = this.game.camera;
      if (camera) {
        camera.getWorldDirection(this.tmpDir);
        const len = Math.hypot(this.tmpDir.x, this.tmpDir.z);
        if (len > 0.001) {
          fx = this.tmpDir.x / len;
          fz = this.tmpDir.z / len;
        }
      }
      const rx = -fz;
      const rz = fx;
      let mx = fx * (forward - back) + rx * (right - left);
      let mz = fz * (forward - back) + rz * (right - left);
      const mag = Math.hypot(mx, mz);
      if (mag > 0.01) {
        mx /= mag;
        mz /= mag;
        const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
        const speed = sprint ? 8.5 : 5.2;
        const nx = this.mesh.position.x + mx * speed * dt;
        const nz = this.mesh.position.z + mz * speed * dt;
        // Move axis by axis so walls slide instead of fully blocking.
        if (!pointBlocked(this.game, nx, this.mesh.position.z, 0.5)) {
          this.mesh.position.x = nx;
        }
        if (!pointBlocked(this.game, this.mesh.position.x, nz, 0.5)) {
          this.mesh.position.z = nz;
        }
        this.heading = turnToward(this.heading, Math.atan2(mx, mz), dt * 10);
        this.mesh.rotation.y = this.heading;
        this.walkPhase += dt * speed * 1.6;
        const swing = Math.sin(this.walkPhase) * 0.55;
        this.legL.rotation.x = swing;
        this.legR.rotation.x = -swing;
        this.armL.rotation.x = -swing * 0.7;
        this.armR.rotation.x = swing * 0.7;
      } else {
        // Ease the limbs back to neutral when standing still.
        this.legL.rotation.x *= 0.8;
        this.legR.rotation.x *= 0.8;
        this.armL.rotation.x *= 0.8;
        this.armR.rotation.x *= 0.8;
      }
      if (input.wasPressed('KeyF')) {
        const vehicle = this.game.vehicles?.nearestParked?.(
          this.mesh.position.x, this.mesh.position.z,
        );
        if (vehicle) this.game.vehicles.enter(vehicle);
      }
      if (input.wasPressed('KeyE')) {
        this.game.events?.emit?.('interact', {
          x: this.mesh.position.x, z: this.mesh.position.z,
        });
      }
    }
    state.playerPos = { x: this.mesh.position.x, z: this.mesh.position.z };
    this.health = state.health;
  }

  takeDamage(amount) {
    const state = this.game.state;
    let remaining = amount;
    if (state.armour > 0) {
      const absorbed = Math.min(state.armour, remaining);
      state.armour -= absorbed;
      remaining -= absorbed;
    }
    state.health = Math.max(0, state.health - remaining);
    this.health = state.health;
    this.game.effects?.shake?.(0.25);
    if (state.health <= 0) this.die();
  }

  heal(amount) {
    const state = this.game.state;
    state.health = Math.min(100, state.health + amount);
    this.health = state.health;
  }

  die() {
    const state = this.game.state;
    this.game.events?.emit?.('playerDied', {});
    if (this.inVehicle) this.game.vehicles?.exit?.();
    if (state.mission) {
      this.game.missions?.failMission?.('You were wasted');
      return;
    }
    const hospital = findPlace(CITY_DATA, 'hospital', 'rumah sakit') ?? { x: 0, z: 0 };
    const bill = Math.min(150, state.money);
    state.money -= bill;
    state.health = 100;
    this.health = 100;
    this.teleport(hospital.x, hospital.z);
    this.game.hud?.showEventPopup?.(`Hospital bill -$${bill}`);
    this.game.hud?.showToast?.('You woke up at Solmar General');
  }
}

// Tolerant place lookup over CITY_DATA: matches a name fragment against
// top-level keys, known containers (shops, locations, places) and arrays of
// named entries, accepting {x, z}, [x, z] or nested pos/position shapes.
export function findPlace(data, ...names) {
  if (!data) return null;
  const wanted = names.map((name) => name.toLowerCase());
  const matches = (key) => typeof key === 'string'
    && wanted.some((word) => key.toLowerCase().includes(word));
  const asPoint = (value) => {
    if (!value) return null;
    if (typeof value.x === 'number' && typeof value.z === 'number') {
      return { x: value.x, z: value.z };
    }
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
      return { x: value[0], z: value[1] };
    }
    if (value.pos) return asPoint(value.pos);
    if (value.position) return asPoint(value.position);
    return null;
  };
  const scanObject = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    for (const [key, value] of Object.entries(obj)) {
      if (matches(key)) {
        const point = asPoint(value);
        if (point) return point;
      }
    }
    return null;
  };
  const scanArray = (arr) => {
    if (!Array.isArray(arr)) return null;
    for (const entry of arr) {
      const name = entry?.name ?? entry?.id ?? '';
      if (matches(name)) {
        const point = asPoint(entry);
        if (point) return point;
      }
    }
    return null;
  };
  return scanObject(data)
    ?? scanObject(data.shops) ?? scanObject(data.locations) ?? scanObject(data.places)
    ?? scanObject(data.stores) ?? scanObject(data.buildings)
    ?? scanArray(data.landmarks) ?? scanArray(data.shops) ?? scanArray(data.places)
    ?? scanArray(data.pointsOfInterest) ?? null;
}
