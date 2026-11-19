// Police: pursuit cruisers, foot officers, and roadblocks. Cruiser count
// scales with the wanted level (1-5), officers chase on foot, and a 5-star
// wanted level adds a roadblock ahead of the player.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';

const UNIT_NAMES = ['MERLIN', 'IBIS', 'TARPON', 'OSPREY', 'EGRET', 'HERON'];
const CRUISER_DEF = {
  name: 'Interceptor',
  type: 'sport',
  topSpeed: 210,
  accel: 14,
  color: 0xf2f2f2,
};
const OFFICER_HP = 100;
const BUST_TIME = 2;

export class Police {
  constructor(game) {
    this.game = game;
    this.rng = game.rng || {
      next: () => 0.5,
      range: (a, b) => (a + b) / 2,
      int: (a) => a,
      pick: (arr) => arr[0],
      chance: () => false,
    };
    this.cruisers = [];
    this.officers = [];
    this.roadblock = [];
    this.lightTimer = 0;
    this.lightOn = false;
    this.bustTimer = 0;
    this.busted = false;
    this.nextUnit = 0;
    this.nextOfficerId = 1;
  }

  unitName() {
    const name = UNIT_NAMES[this.nextUnit % UNIT_NAMES.length];
    this.nextUnit++;
    return name;
  }

  spawnCruiserNearPlayer() {
    const game = this.game;
    const playerPos = game.state.playerPos || { x: 0, z: 0 };
    const angle = this.rng.next() * Math.PI * 2;
    const dist = this.rng.range(40, 80);
    const x = Math.max(-270, Math.min(270, playerPos.x + Math.cos(angle) * dist));
    const z = Math.max(-270, Math.min(270, playerPos.z + Math.sin(angle) * dist));
    const vehicle = new Vehicle(game, CRUISER_DEF, x, z, angle);
    vehicle.mesh.userData.hit = { kind: 'police', ref: vehicle };
    this.addLightBar(vehicle.mesh);
    const unit = {
      name: this.unitName(),
      vehicle,
      status: 'EN ROUTE',
    };
    this.cruisers.push(unit);
    return unit;
  }

  addLightBar(mesh) {
    const barGeo = new THREE.BoxGeometry(0.5, 0.16, 0.3);
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xaa1111,
      emissive: 0xff2222,
      emissiveIntensity: 1,
    });
    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x1122aa,
      emissive: 0x2244ff,
      emissiveIntensity: 1,
    });
    const red = new THREE.Mesh(barGeo, redMat);
    red.position.set(-0.35, 1.5, -0.2);
    const blue = new THREE.Mesh(barGeo, blueMat);
    blue.position.set(0.35, 1.5, -0.2);
    mesh.add(red, blue);
    mesh.userData.redLight = redMat;
    mesh.userData.blueLight = blueMat;
  }

  spawnOfficerNearPlayer() {
    const game = this.game;
    const playerPos = game.state.playerPos || { x: 0, z: 0 };
    const angle = this.rng.next() * Math.PI * 2;
    const dist = this.rng.range(15, 30);
    const x = Math.max(-275, Math.min(275, playerPos.x + Math.cos(angle) * dist));
    const z = Math.max(-275, Math.min(275, playerPos.z + Math.sin(angle) * dist));
    const mesh = new THREE.Group();
    mesh.name = 'officer';
    const uniform = new THREE.MeshStandardMaterial({ color: 0x1d3557 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a077 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.75, 3, 8), uniform);
    body.position.y = 1.05;
    body.castShadow = true;
    mesh.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
    head.position.y = 1.85;
    mesh.add(head);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.14, 12),
      new THREE.MeshStandardMaterial({ color: 0x0f1f38 }),
    );
    cap.position.y = 2.02;
    mesh.add(cap);
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.16, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xffd166,
        emissive: 0xaa7711,
        emissiveIntensity: 0.4,
      }),
    );
    badge.position.set(-0.14, 1.25, 0.3);
    mesh.add(badge);
    mesh.position.set(x, 0, z);
    const officer = {
      id: this.nextOfficerId++,
      name: this.unitName(),
      mesh,
      hp: OFFICER_HP,
      maxHp: OFFICER_HP,
      alive: true,
      fallTimer: 0,
      fireTimer: this.rng.range(0.5, 1.5),
      heading: 0,
    };
    mesh.userData.hit = { kind: 'officer', ref: officer };
    game.scene.add(mesh);
    this.officers.push(officer);
    return officer;
  }

  spawnForWanted(level) {
    while (this.cruisers.length < level) this.spawnCruiserNearPlayer();
    while (this.cruisers.length > level) {
      const unit = this.cruisers.pop();
      unit.vehicle.dispose();
    }
    if (level >= 5 && this.roadblock.length === 0) {
      this.buildRoadblock();
    } else if (level < 5 && this.roadblock.length > 0) {
      this.clearRoadblock();
    }
  }

  buildRoadblock() {
    const game = this.game;
    const playerPos = game.state.playerPos || { x: 0, z: 0 };
    const playerVehicle = game.state.playerInVehicle;
    const heading = playerVehicle ? playerVehicle.heading : game.player?.heading || 0;
    const aheadX = Math.sin(heading);
    const aheadZ = Math.cos(heading);
    for (const side of [-1, 1]) {
      const x = playerPos.x + aheadX * 26 + -aheadZ * side * 3;
      const z = playerPos.z + aheadZ * 26 + aheadX * side * 3;
      const vehicle = new Vehicle(game, CRUISER_DEF, x, z, heading + Math.PI / 2);
      vehicle.mesh.userData.hit = { kind: 'police', ref: vehicle };
      this.addLightBar(vehicle.mesh);
      this.roadblock.push({ name: this.unitName(), vehicle, status: 'ROADBLOCK' });
    }
  }

  clearRoadblock() {
    for (const unit of this.roadblock) unit.vehicle.dispose();
    this.roadblock = [];
  }

  clearPursuit() {
    for (const unit of this.cruisers) unit.vehicle.dispose();
    for (const officer of this.officers) {
      this.game.scene.remove(officer.mesh);
    }
    this.clearRoadblock();
    this.cruisers = [];
    this.officers = [];
    this.bustTimer = 0;
    this.busted = false;
  }

  units() {
    const list = [];
    const playerPos = this.game.state.playerPos || { x: 0, z: 0 };
    for (const unit of this.cruisers) {
      const pos = unit.vehicle.mesh.position;
      list.push({
        name: unit.name,
        type: 'CRUISER',
        distance: Math.round(Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z)),
        status: unit.status,
      });
    }
    for (const unit of this.roadblock) {
      const pos = unit.vehicle.mesh.position;
      list.push({
        name: unit.name,
        type: 'CRUISER',
        distance: Math.round(Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z)),
        status: 'ROADBLOCK',
      });
    }
    for (const officer of this.officers) {
      if (!officer.alive) continue;
      const pos = officer.mesh.position;
      list.push({
        name: officer.name,
        type: 'OFFICER',
        distance: Math.round(Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z)),
        status: 'PURSUIT',
      });
    }
    return list;
  }

  cruiserPositions() {
    const list = [];
    for (const unit of this.cruisers) {
      list.push({
        x: unit.vehicle.mesh.position.x,
        z: unit.vehicle.mesh.position.z,
      });
    }
    for (const unit of this.roadblock) {
      list.push({
        x: unit.vehicle.mesh.position.x,
        z: unit.vehicle.mesh.position.z,
      });
    }
    return list;
  }

  nearestUnitDistance() {
    const playerPos = this.game.state.playerPos || { x: 0, z: 0 };
    let nearest = Infinity;
    for (const unit of this.cruisers) {
      const pos = unit.vehicle.mesh.position;
      nearest = Math.min(nearest, Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z));
    }
    for (const officer of this.officers) {
      if (!officer.alive) continue;
      const pos = officer.mesh.position;
      nearest = Math.min(nearest, Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z));
    }
    return nearest;
  }

  damageOfficer(officerOrId, n) {
    const officer =
      typeof officerOrId === 'object'
        ? officerOrId
        : this.officers.find((o) => o.id === officerOrId);
    if (!officer || !officer.alive) return false;
    officer.hp -= n;
    if (officer.hp > 0) {
      this.game.wanted?.addCrime('shootCop');
      return false;
    }
    officer.alive = false;
    officer.fallTimer = 5;
    officer.mesh.rotation.x = -Math.PI / 2;
    officer.mesh.position.y = 0.3;
    this.game.wanted?.addCrime('killCop');
    return true;
  }

  damageCruiser(vehicle, n) {
    if (!vehicle || vehicle.wrecked) return false;
    vehicle.damage(n);
    this.game.wanted?.addHeat(2);
    return vehicle.wrecked;
  }

  update(dt) {
    const game = this.game;
    const state = game.state;
    const level = state.wanted || 0;

    if (level === 0) {
      if (this.cruisers.length > 0 || this.officers.length > 0) {
        this.clearPursuit();
      }
      return;
    }

    this.spawnForWanted(level);

    // Flash the light bars alternately on a dt timer.
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.28;
      this.lightOn = !this.lightOn;
      const allUnits = [...this.cruisers, ...this.roadblock];
      for (const unit of allUnits) {
        const red = unit.vehicle.mesh.userData.redLight;
        const blue = unit.vehicle.mesh.userData.blueLight;
        if (red) red.emissiveIntensity = this.lightOn ? 3 : 0.2;
        if (blue) blue.emissiveIntensity = this.lightOn ? 0.2 : 3;
      }
    }

    const playerPos = state.playerPos || { x: 0, z: 0 };
    const playerVehicle = state.playerInVehicle;
    const playerSpeed = playerVehicle ? Math.abs(playerVehicle.speed) : 0;

    for (const unit of this.cruisers) {
      const vehicle = unit.vehicle;
      if (vehicle.wrecked) {
        unit.status = 'DISABLED';
        continue;
      }
      const pos = vehicle.mesh.position;
      const dx = playerPos.x - pos.x;
      const dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 160) {
        // Too far behind: reappear closer so the chase never goes quiet.
        const angle = this.rng.next() * Math.PI * 2;
        pos.x = Math.max(-270, Math.min(270, playerPos.x + Math.cos(angle) * 55));
        pos.z = Math.max(-270, Math.min(270, playerPos.z + Math.sin(angle) * 55));
        vehicle.speed = 0;
        unit.status = 'EN ROUTE';
        continue;
      }
      const targetHeading = Math.atan2(dx, dz);
      if (dist < 9 && playerVehicle) {
        unit.status = 'RAMMING';
        vehicle.driveAI(dt, targetHeading, vehicle.topSpeedMs);
      } else if (dist > 80) {
        unit.status = 'EN ROUTE';
        vehicle.driveAI(dt, targetHeading, vehicle.topSpeedMs * 0.95);
      } else {
        unit.status = 'PURSUIT';
        const targetSpeed = Math.min(
          vehicle.topSpeedMs,
          playerSpeed + 4,
        );
        vehicle.driveAI(dt, targetHeading, Math.max(10, targetSpeed));
      }
    }

    // Officers only deploy while the player is on foot.
    const wantOfficers = !playerVehicle ? Math.min(2, level) : 0;
    const aliveOfficers = this.officers.filter((o) => o.alive).length;
    if (aliveOfficers < wantOfficers) this.spawnOfficerNearPlayer();

    let touchingPlayer = false;
    for (const officer of this.officers) {
      if (!officer.alive) {
        officer.fallTimer -= dt;
        if (officer.fallTimer <= 0 && officer.mesh.visible) {
          officer.mesh.visible = false;
        }
        continue;
      }
      const pos = officer.mesh.position;
      const dx = playerPos.x - pos.x;
      const dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.5 && !playerVehicle) touchingPlayer = true;
      if (dist > 2) {
        const speed = dist > 25 ? 5.4 : 4.4;
        pos.x += (dx / dist) * speed * dt;
        pos.z += (dz / dist) * speed * dt;
        officer.heading = Math.atan2(dx, dz);
        officer.mesh.rotation.y = officer.heading;
      }
      // Armed response at 3 stars and above.
      if (level >= 3 && dist < 30 && dist > 3) {
        officer.fireTimer -= dt;
        if (officer.fireTimer <= 0) {
          officer.fireTimer = 1.4;
          if (this.rng.chance(0.35)) {
            game.player?.takeDamage(6);
            game.effects?.tracer(
              { x: pos.x, y: 1.4, z: pos.z },
              { x: playerPos.x, y: 1.2, z: playerPos.z },
            );
            game.audio?.sfx?.('shot');
          }
        }
      }
    }

    if (touchingPlayer && !this.busted) {
      this.bustTimer += dt;
      if (this.bustTimer >= BUST_TIME) {
        this.busted = true;
        game.events?.emit('busted', {});
      }
    } else {
      this.bustTimer = 0;
    }
  }
}
