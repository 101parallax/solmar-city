import * as THREE from 'three';
import { Vehicle, pointBlocked, blobShadowMesh, wrapAngle, turnToward } from './vehicles.js';
import { findPlace } from './player.js';
import { CITY_DATA } from '../data/city.js';

// Solmar PD pursuit: one cruiser per wanted star, officers on foot from
// two stars up, and a roadblock at five stars. Units carry seabird and
// gamefish names for the response panel. An officer standing next to a slow
// on-foot player makes an arrest (BUSTED).
const UNIT_NAMES = ['MERLIN', 'IBIS', 'TARPON', 'OSPREY', 'EGRET', 'HERON'];
const CRUISER_DEF = { name: 'PD Cruiser', type: 'sedan', topSpeed: 52, accel: 20, color: 0x1d3050 };

export class Police {
  constructor(game) {
    this.game = game;
    this.cruisers = [];
    this.officers = [];
    this.roadblock = null;
    this.bustedTimer = 0;
    this.nextId = 1;
    this.nextUnit = 0;
    game.events?.on?.('wantedChanged', ({ level }) => this.spawnForWanted(level));
  }

  _unitName() {
    const name = UNIT_NAMES[this.nextUnit % UNIT_NAMES.length];
    this.nextUnit++;
    return `${name}-${String(this.nextId++).padStart(2, '0')}`;
  }

  spawnForWanted(level) {
    const clamped = THREE.MathUtils.clamp(level, 0, 5);
    if (clamped === 0) {
      this.clearPursuit();
      return;
    }
    // Cruisers: one per star.
    while (this.cruisers.length < clamped) this._spawnCruiser();
    while (this.cruisers.length > clamped) {
      this._removeCruiser(this.cruisers[this.cruisers.length - 1]);
    }
    // Officers on foot from 2 stars up: one per star above the first.
    const wantOfficers = clamped >= 2 ? clamped - 1 : 0;
    while (this.officers.filter((officer) => !officer.fallen).length < wantOfficers) {
      this._spawnOfficer();
    }
    while (this.officers.filter((officer) => !officer.fallen).length > wantOfficers) {
      const officer = [...this.officers].reverse().find((entry) => !entry.fallen);
      if (!officer) break;
      this._removeOfficer(officer);
    }
    // Roadblock at 5 stars.
    if (clamped >= 5 && !this.roadblock) this._spawnRoadblock();
    if (clamped < 5 && this.roadblock) this._removeRoadblock();
  }

  _spawnCruiser() {
    const playerPos = this.game.state.playerPos;
    const rng = this.game.rng;
    let x = playerPos.x + 40;
    let z = playerPos.z;
    for (let tries = 0; tries < 8; tries++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = rng.range(35, 55);
      const cx = playerPos.x + Math.cos(angle) * dist;
      const cz = playerPos.z + Math.sin(angle) * dist;
      if (!pointBlocked(this.game, cx, cz, 1.5)) {
        x = cx;
        z = cz;
        break;
      }
    }
    const vehicle = new Vehicle(
      this.game, CRUISER_DEF, x, z, rng.next() * Math.PI * 2,
      { police: true, parked: false },
    );
    const cruiser = { vehicle, name: this._unitName(), status: 'EN ROUTE' };
    this.cruisers.push(cruiser);
    this.game.audio?.sfx?.('sirenBlip');
    return cruiser;
  }

  _removeCruiser(cruiser) {
    this.cruisers = this.cruisers.filter((entry) => entry !== cruiser);
    this.game.scene.remove(cruiser.vehicle.mesh);
  }

  _spawnOfficer() {
    const playerPos = this.game.state.playerPos;
    const rng = this.game.rng;
    let x = playerPos.x + 15;
    let z = playerPos.z;
    for (let tries = 0; tries < 8; tries++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = rng.range(12, 25);
      const cx = playerPos.x + Math.cos(angle) * dist;
      const cz = playerPos.z + Math.sin(angle) * dist;
      if (!pointBlocked(this.game, cx, cz, 0.6)) {
        x = cx;
        z = cz;
        break;
      }
    }
    const officer = new Officer(this.game, x, z, this._unitName());
    officer.id = this.nextId++;
    officer.mesh.userData.hitTarget = { kind: 'officer', id: officer.id };
    this.officers.push(officer);
    return officer;
  }

  _removeOfficer(officer) {
    this.officers = this.officers.filter((entry) => entry !== officer);
    this.game.scene.remove(officer.mesh);
  }

  _spawnRoadblock() {
    const player = this.game.player;
    const playerPos = this.game.state.playerPos;
    const heading = player?.inVehicle ? player.inVehicle.heading : (player?.heading ?? 0);
    const ahead = 26;
    const bx = playerPos.x + Math.sin(heading) * ahead;
    const bz = playerPos.z + Math.cos(heading) * ahead;
    const vehicles = [];
    for (const side of [-1, 1]) {
      const px = bx + Math.cos(heading) * side * 3.2;
      const pz = bz - Math.sin(heading) * side * 3.2;
      const vehicle = new Vehicle(
        this.game, CRUISER_DEF, px, pz, heading + Math.PI / 2,
        { police: true, parked: false },
      );
      vehicles.push(vehicle);
    }
    this.roadblock = { vehicles, name: this._unitName(), x: bx, z: bz };
  }

  _removeRoadblock() {
    for (const vehicle of this.roadblock.vehicles) this.game.scene.remove(vehicle.mesh);
    this.roadblock = null;
  }

  clearPursuit() {
    for (const cruiser of this.cruisers) this.game.scene.remove(cruiser.vehicle.mesh);
    for (const officer of this.officers) this.game.scene.remove(officer.mesh);
    if (this.roadblock) this._removeRoadblock();
    this.cruisers = [];
    this.officers = [];
    this.bustedTimer = 0;
  }

  update(dt) {
    const state = this.game.state;
    const wanted = state.wanted;
    if (wanted === 0) {
      if (this.cruisers.length > 0 || this.officers.length > 0) this.clearPursuit();
      return;
    }
    // Self-heal: keep unit counts in sync even if a wanted change bypassed
    // the event bus (for example a screenshot staging the state directly).
    if (this.cruisers.length !== wanted) this.spawnForWanted(wanted);
    const playerPos = state.playerPos;
    const playerVehicle = state.playerInVehicle;

    for (const cruiser of this.cruisers) {
      const vehicle = cruiser.vehicle;
      if (vehicle.wrecked) {
        cruiser.status = 'DISABLED';
        continue;
      }
      const pos = vehicle.mesh.position;
      const dx = playerPos.x - pos.x;
      const dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      // Aim slightly ahead of a moving player.
      let tx = playerPos.x;
      let tz = playerPos.z;
      if (playerVehicle) {
        tx += Math.sin(playerVehicle.heading) * playerVehicle.speed * 0.5;
        tz += Math.cos(playerVehicle.heading) * playerVehicle.speed * 0.5;
      }
      const desired = Math.atan2(tx - pos.x, tz - pos.z);
      const diff = wrapAngle(desired - vehicle.heading);
      const ramming = dist < 9;
      cruiser.status = ramming ? 'RAMMING' : (dist > 60 ? 'EN ROUTE' : 'PURSUIT');
      vehicle.update(dt, {
        throttle: 1, brake: 0,
        steer: THREE.MathUtils.clamp(diff * 2.4, -1, 1),
        handbrake: false, nos: false, boost: ramming,
      });
      // Impact with the player vehicle trades paint on both sides.
      if (playerVehicle && dist < 3.4) {
        playerVehicle.damage(4);
        vehicle.damage(2);
        this.game.effects?.sparks?.({
          x: (pos.x + playerPos.x) / 2, y: 1, z: (pos.z + playerPos.z) / 2,
        });
        this.game.effects?.shake?.(0.3);
      }
    }

    let officerNear = false;
    for (const officer of this.officers) {
      if (officer.fallen) continue;
      const pos = officer.mesh.position;
      const dx = playerPos.x - pos.x;
      const dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.2) {
        const step = officer.speed * dt;
        const nx = pos.x + (dx / dist) * step;
        const nz = pos.z + (dz / dist) * step;
        if (!pointBlocked(this.game, nx, pos.z, 0.5)) pos.x = nx;
        if (!pointBlocked(this.game, pos.x, nz, 0.5)) pos.z = nz;
        officer.mesh.rotation.y = turnToward(
          officer.mesh.rotation.y, Math.atan2(dx, dz), dt * 8,
        );
      }
      // Arrest: an officer standing next to a slow on-foot player busts them.
      if (!playerVehicle && dist < 2.0) officerNear = true;
      // Officers open fire on a fleeing on-foot player from 3 stars up.
      if (!playerVehicle && wanted >= 3 && dist < 24 && dist > 3) {
        officer.shootCooldown -= dt;
        if (officer.shootCooldown <= 0) {
          officer.shootCooldown = this.game.rng.range(1.0, 1.8);
          const from = { x: pos.x, y: 1.4, z: pos.z };
          const to = { x: playerPos.x, y: 1.2, z: playerPos.z };
          this.game.effects?.tracer?.(from, to);
          this.game.effects?.muzzleFlash?.(from);
          this.game.audio?.sfx?.('shot');
          if (this.game.rng.chance(0.5)) this.game.player?.takeDamage?.(6);
        }
      }
    }
    if (officerNear) {
      this.bustedTimer += dt;
      if (this.bustedTimer > 1.5) this._busted();
    } else {
      this.bustedTimer = 0;
    }
  }

  _busted() {
    const state = this.game.state;
    this.bustedTimer = 0;
    this.game.events?.emit?.('busted', {});
    if (state.mission) {
      this.game.missions?.failMission?.('BUSTED - the Solmar PD caught you');
      return;
    }
    const fine = Math.min(200, state.money);
    state.money -= fine;
    this.game.wanted?.clearWanted?.();
    const pd = findPlace(CITY_DATA, 'police', 'pd hq', 'headquarters') ?? { x: 0, z: 0 };
    if (state.playerInVehicle) this.game.vehicles?.exit?.();
    this.game.player?.teleport?.(pd.x, pd.z);
    this.game.hud?.showEventPopup?.(`BUSTED - fine -$${fine}`);
    this.game.menus?.showBusted?.();
  }

  // Positions for the radar blips: cruisers and officers on foot, with a
  // hot flag once the pursuit reaches 3 stars.
  cruiserPositions() {
    const out = [];
    const hot = this.game.state.wanted >= 3;
    for (const cruiser of this.cruisers) {
      const p = cruiser.vehicle.mesh.position;
      out.push({ x: p.x, z: p.z, hot });
    }
    for (const officer of this.officers) {
      if (officer.fallen) continue;
      const p = officer.mesh.position;
      out.push({ x: p.x, z: p.z, hot });
    }
    return out;
  }

  // Units for the response panel, nearest first.
  units() {
    const playerPos = this.game.state.playerPos;
    const list = [];
    for (const cruiser of this.cruisers) {
      const p = cruiser.vehicle.mesh.position;
      list.push({
        name: cruiser.name, type: 'CRUISER',
        distance: Math.round(Math.hypot(p.x - playerPos.x, p.z - playerPos.z)),
        status: cruiser.status,
      });
    }
    for (const officer of this.officers) {
      const p = officer.mesh.position;
      list.push({
        name: officer.name, type: 'OFFICER',
        distance: Math.round(Math.hypot(p.x - playerPos.x, p.z - playerPos.z)),
        status: officer.fallen ? 'DOWN' : 'ON FOOT',
      });
    }
    if (this.roadblock) {
      list.push({
        name: this.roadblock.name, type: 'ROADBLOCK',
        distance: Math.round(Math.hypot(this.roadblock.x - playerPos.x, this.roadblock.z - playerPos.z)),
        status: 'ROADBLOCK',
      });
    }
    return list.toSorted((a, b) => a.distance - b.distance);
  }

  // Returns true when the officer goes down.
  damageOfficer(id, amount) {
    const officer = this.officers.find((entry) => entry.id === id);
    if (!officer || officer.fallen) return false;
    officer.health -= amount;
    if (officer.health <= 0) {
      officer.fall();
      return true;
    }
    return false;
  }

  nearestUnitDistance() {
    const playerPos = this.game.state.playerPos;
    let nearest = Infinity;
    for (const cruiser of this.cruisers) {
      if (cruiser.vehicle.wrecked) continue;
      const p = cruiser.vehicle.mesh.position;
      nearest = Math.min(nearest, Math.hypot(p.x - playerPos.x, p.z - playerPos.z));
    }
    for (const officer of this.officers) {
      if (officer.fallen) continue;
      const p = officer.mesh.position;
      nearest = Math.min(nearest, Math.hypot(p.x - playerPos.x, p.z - playerPos.z));
    }
    if (this.roadblock) {
      nearest = Math.min(nearest, Math.hypot(
        this.roadblock.x - playerPos.x, this.roadblock.z - playerPos.z,
      ));
    }
    return nearest;
  }
}

// A single officer on foot: 100 health, chases the player, falls flat when
// their health reaches zero.
class Officer {
  constructor(game, x, z, name) {
    this.game = game;
    this.name = name;
    this.health = 100;
    this.fallen = false;
    this.speed = 6.4;
    this.shootCooldown = 1.5;
    this.mesh = buildOfficerMesh();
    this.mesh.position.set(x, 0, z);
    game.scene.add(this.mesh);
  }

  fall() {
    if (this.fallen) return;
    this.fallen = true;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.3;
  }
}

function buildOfficerMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1d2f4d, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141c26, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb57748, roughness: 0.7 });
  const legGeo = new THREE.BoxGeometry(0.22, 0.86, 0.26);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(side * 0.14, 0.43, 0);
    group.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), navy);
  torso.position.y = 1.22;
  group.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.4, 0.38), dark);
  vest.position.y = 1.2;
  group.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), skin);
  head.position.y = 1.82;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16), navy);
  cap.position.y = 1.99;
  group.add(cap);
  group.add(blobShadowMesh(1.4));
  return group;
}
