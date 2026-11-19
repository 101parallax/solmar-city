// Player: the on-foot protagonist. Capsule body plus head built from
// primitives, camera-relative WASD movement, and vehicle entry/exit on F.
// (E interaction is wired in main.js, not here — one path only.)
import * as THREE from 'three';

const CITY_HALF = 280;
// The beach runs south of the city grid to the water line (z 315): the
// player may walk the sand, so the southern clamp is 312, not 280.
const BEACH_MAX_Z = 312;
const WALK_SPEED = 6;
const SPRINT_SPEED = 10;
const HOSPITAL_FALLBACK = { x: -140, z: 140 };

export class Player {
  constructor(game) {
    this.game = game;
    this.heading = 0;
    this.speed = 0;
    this.dead = false;
    this.mesh = new THREE.Group();
    this.mesh.name = 'player';

    const jacket = new THREE.MeshStandardMaterial({ color: 0x2e7f8f });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2b2f36 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a077 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x1c1c22 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 4, 10), jacket);
    body.position.y = 1.05;
    body.castShadow = true;
    this.mesh.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 12), skin);
    head.position.y = 1.85;
    head.castShadow = true;
    this.mesh.add(head);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, 1.2), hair);
    cap.position.y = 1.9;
    this.mesh.add(cap);

    const legGeo = new THREE.CapsuleGeometry(0.13, 0.55, 3, 8);
    const legL = new THREE.Mesh(legGeo, pants);
    legL.position.set(-0.16, 0.45, 0);
    const legR = new THREE.Mesh(legGeo, pants);
    legR.position.set(0.16, 0.45, 0);
    this.mesh.add(legL, legR);
    this.legL = legL;
    this.legR = legR;

    const armGeo = new THREE.CapsuleGeometry(0.11, 0.55, 3, 8);
    const armL = new THREE.Mesh(armGeo, jacket);
    armL.position.set(-0.48, 1.1, 0);
    const armR = new THREE.Mesh(armGeo, jacket);
    armR.position.set(0.48, 1.1, 0);
    this.mesh.add(armL, armR);
    this.armL = armL;
    this.armR = armR;

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.mesh.add(shadow);

    const start = game.state.playerPos || { x: 0, z: 20 };
    this.mesh.position.set(start.x, 0, start.z);
    game.scene.add(this.mesh);
    this.walkPhase = 0;
    this.tmpForward = new THREE.Vector3();
    this.tmpRight = new THREE.Vector3();
  }

  get health() {
    return this.game.state.health;
  }

  set health(value) {
    this.game.state.health = Math.max(0, Math.min(100, value));
  }

  get inVehicle() {
    return this.game.state.playerInVehicle;
  }

  position() {
    return { x: this.mesh.position.x, z: this.mesh.position.z };
  }

  teleport(x, z) {
    const clampedX = Math.max(-CITY_HALF + 2, Math.min(CITY_HALF - 2, x));
    const clampedZ = Math.max(-CITY_HALF + 2, Math.min(BEACH_MAX_Z, z));
    this.mesh.position.set(clampedX, 0, clampedZ);
    const vehicle = this.game.state.playerInVehicle;
    if (vehicle && vehicle.mesh) {
      vehicle.mesh.position.set(clampedX, 0, clampedZ);
      vehicle.speed = 0;
    }
    this.game.state.playerPos = { x: clampedX, z: clampedZ };
  }

  isBlocked(x, z, radius) {
    if (Math.abs(x) > CITY_HALF - 1 || z < -(CITY_HALF - 1) || z > BEACH_MAX_Z) return true;
    const city = this.game.city;
    if (!city) return false;
    if (city.isWater && city.isWater(x, z)) return true;
    const colliders = city.colliders || [];
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (
        x + radius > c.minX && x - radius < c.maxX &&
        z + radius > c.minZ && z - radius < c.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  update(dt) {
    const game = this.game;
    const state = game.state;
    const input = game.input;
    const vehicle = state.playerInVehicle;

    // NOTE: E is handled by the single keydown listener in main.js, which
    // emits the 'interact' event (also while driving). Emitting it here too
    // would fire every interaction twice, so player.js stays out of it.

    if (vehicle) {
      // On foot mesh hides while driving; it rides with the car.
      this.mesh.visible = false;
      this.mesh.position.copy(vehicle.mesh.position);
      this.heading = vehicle.heading;
      state.playerPos = this.position();
      if (input.wasPressed('KeyF')) {
        game.vehicles?.exit();
      }
      return;
    }

    this.mesh.visible = true;

    // Camera-relative movement: forward is where the camera looks on the
    // ground plane, so WASD always feels aligned with the view.
    const camera = game.camera;
    camera.getWorldDirection(this.tmpForward);
    this.tmpForward.y = 0;
    if (this.tmpForward.lengthSq() < 0.0001) this.tmpForward.set(0, 0, -1);
    this.tmpForward.normalize();
    this.tmpRight.set(-this.tmpForward.z, 0, this.tmpForward.x);

    let moveX = 0;
    let moveZ = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) {
      moveX += this.tmpForward.x;
      moveZ += this.tmpForward.z;
    }
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) {
      moveX -= this.tmpForward.x;
      moveZ -= this.tmpForward.z;
    }
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) {
      moveX += this.tmpRight.x;
      moveZ += this.tmpRight.z;
    }
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) {
      moveX -= this.tmpRight.x;
      moveZ -= this.tmpRight.z;
    }

    const moving = moveX !== 0 || moveZ !== 0;
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const topSpeed = sprint ? SPRINT_SPEED : WALK_SPEED;
    if (moving) {
      const len = Math.hypot(moveX, moveZ);
      moveX /= len;
      moveZ /= len;
      this.speed = Math.min(topSpeed, this.speed + 30 * dt);
      this.heading = Math.atan2(moveX, moveZ);
      const nextX = this.mesh.position.x + moveX * this.speed * dt;
      const nextZ = this.mesh.position.z + moveZ * this.speed * dt;
      // Slide along walls: try each axis separately.
      if (!this.isBlocked(nextX, this.mesh.position.z, 0.5)) {
        this.mesh.position.x = nextX;
      }
      if (!this.isBlocked(this.mesh.position.x, nextZ, 0.5)) {
        this.mesh.position.z = nextZ;
      }
      this.walkPhase += dt * this.speed * 1.4;
      const swing = Math.sin(this.walkPhase) * 0.55;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
    } else {
      this.speed = Math.max(0, this.speed - 40 * dt);
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
      this.armL.rotation.x *= 0.8;
      this.armR.rotation.x *= 0.8;
    }
    this.mesh.rotation.y = this.heading;
    state.playerPos = this.position();

    if (input.wasPressed('KeyF')) {
      const parked = game.vehicles?.nearestParked(
        this.mesh.position.x,
        this.mesh.position.z,
        6,
      );
      if (parked) {
        game.vehicles.enter(parked);
      }
    }
  }

  takeDamage(n) {
    if (this.dead || n <= 0) return;
    const state = this.game.state;
    let remaining = n;
    if (state.armour > 0) {
      const absorbed = Math.min(state.armour, remaining);
      state.armour -= absorbed;
      remaining -= absorbed;
    }
    this.health = this.health - remaining;
    this.game.effects?.shake(0.25);
    this.game.audio?.sfx?.('crash');
    if (this.health <= 0) this.die();
  }

  heal(n) {
    this.health = Math.min(100, this.health + n);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    const game = this.game;
    const state = game.state;
    if (state.mission) {
      game.missions?.failMission('You were taken down');
      // Restore health so the retry/abandon flow never resumes with a
      // dead player standing in the world.
      state.health = 100;
      this.dead = false;
      return;
    }
    // Free roam: wake up at the hospital, $150 poorer. The drop point is
    // beside the hospital building, not at its centre — the centre sits
    // inside the building collider, where the player would be stuck.
    const hospital = findPlace(game, 'hospital') || HOSPITAL_FALLBACK;
    const drop = { x: hospital.x + 18, z: hospital.z };
    state.money = Math.max(0, state.money - 150);
    state.health = 100;
    state.armour = 0;
    if (state.playerInVehicle) {
      game.vehicles?.exit();
    }
    this.teleport(drop.x, drop.z);
    game.hud?.showEventPopup('Hospital bill -$150');
    game.events?.emit('playerDied', { pos: drop });
    this.dead = false;
  }
}

// Look up a named place from city landmarks, tolerating the few shapes
// landmark entries may take. Returns null when nothing matches.
export function findPlace(game, name) {
  const landmarks = game.city?.landmarks;
  if (!Array.isArray(landmarks)) return null;
  const wanted = name.toLowerCase();
  for (const mark of landmarks) {
    const label = String(mark.name || mark.id || '').toLowerCase();
    if (!label.includes(wanted)) continue;
    if (typeof mark.x === 'number' && typeof mark.z === 'number') {
      return { x: mark.x, z: mark.z };
    }
    if (mark.position) {
      return { x: mark.position.x ?? 0, z: mark.position.z ?? 0 };
    }
  }
  return null;
}
