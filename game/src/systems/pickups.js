// Pickups: health, armour and ammo caches at fixed landmarks. Taking one
// applies its effect immediately; it respawns after 60 seconds on a dt
// timer. Positions fall back to fixed city coordinates when a landmark
// cannot be found in the city data.
import * as THREE from 'three';
import { findPlace } from '../entities/player.js';

const RESPAWN_TIME = 60;
const PICKUP_RADIUS = 2.6;

const PICKUP_TYPES = {
  health: { color: 0x37c871, label: 'Health +50', amount: 50 },
  armour: { color: 0x3a86ff, label: 'Armour +50', amount: 50 },
  ammo: { color: 0xff9f1c, label: 'Ammo refilled', amount: 0 },
};

const FALLBACK_SPOTS = [
  { type: 'health', place: 'hospital', x: -160, z: 120 },
  { type: 'armour', place: 'police', x: 70, z: -70 },
  { type: 'ammo', place: 'gun', x: -70, z: -140 },
  { type: 'health', place: 'respray', x: 210, z: 0 },
  { type: 'ammo', place: 'harbor', x: -210, z: 210 },
  { type: 'health', place: 'beach', x: 0, z: 210 },
];

export class Pickups {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.list = [];
    for (const spot of FALLBACK_SPOTS) {
      const found = findPlace(game, spot.place);
      // Landmark centres sit inside building colliders, so step 18 m east
      // of a found place: still beside the landmark, but reachable.
      const x = found ? found.x + 18 : spot.x;
      const z = found ? found.z : spot.z;
      this.list.push(this.buildPickup(spot.type, x, z));
    }
  }

  buildPickup(type, x, z) {
    const def = PICKUP_TYPES[type];
    const group = new THREE.Group();
    group.name = `pickup-${type}`;
    const ringMat = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: 0.7,
      metalness: 0.2,
      roughness: 0.4,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 10, 24), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.1;
    group.add(ring);
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.55),
      ringMat,
    );
    core.position.y = 1.1;
    group.add(core);
    const base = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 20),
      new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.03;
    group.add(base);
    group.position.set(x, 0, z);
    this.game.scene.add(group);
    return {
      type,
      x,
      z,
      mesh: group,
      ring,
      core,
      active: true,
      respawnTimer: 0,
    };
  }

  positions() {
    return this.list.map((p) => ({
      type: p.type,
      x: p.x,
      z: p.z,
      active: p.active,
    }));
  }

  reset() {
    for (const pickup of this.list) {
      pickup.active = true;
      pickup.respawnTimer = 0;
      pickup.mesh.visible = true;
    }
  }

  needsPickup(pickup) {
    const state = this.game.state;
    if (pickup.type === 'health') return state.health < 100;
    if (pickup.type === 'armour') return state.armour < 100;
    const ammo = state.ammo || {};
    return (
      (ammo.pistol ?? 0) < 48 ||
      (ammo.carbine ?? 0) < 120 ||
      (ammo.shotgun ?? 0) < 24
    );
  }

  applyEffect(pickup) {
    const game = this.game;
    const state = game.state;
    const def = PICKUP_TYPES[pickup.type];
    if (pickup.type === 'health') {
      game.player?.heal(def.amount);
    } else if (pickup.type === 'armour') {
      state.armour = Math.min(100, state.armour + def.amount);
    } else if (pickup.type === 'ammo') {
      state.ammo.pistol = 48;
      state.ammo.carbine = 120;
      state.ammo.shotgun = 24;
    }
    game.hud?.showEventPopup(def.label);
    game.audio?.sfx?.('pickup');
    game.effects?.spawnParticles(
      { x: pickup.x, y: 1.2, z: pickup.z },
      def.color,
      16,
      { speed: 3, up: 3, life: 0.6, gravity: 2 },
    );
  }

  update(dt) {
    this.time += dt;
    const playerPos = this.game.state.playerPos || { x: 0, z: 0 };
    for (const pickup of this.list) {
      if (!pickup.active) {
        pickup.respawnTimer -= dt;
        if (pickup.respawnTimer <= 0) {
          pickup.active = true;
          pickup.mesh.visible = true;
        }
        continue;
      }
      // Idle motion runs on accumulated dt so it is deterministic.
      pickup.ring.rotation.z += dt * 1.6;
      pickup.core.rotation.y += dt * 2.2;
      pickup.core.position.y = 1.1 + Math.sin(this.time * 2 + pickup.x) * 0.15;
      const dx = playerPos.x - pickup.x;
      const dz = playerPos.z - pickup.z;
      if (Math.hypot(dx, dz) < PICKUP_RADIUS && this.needsPickup(pickup)) {
        this.applyEffect(pickup);
        pickup.active = false;
        pickup.respawnTimer = RESPAWN_TIME;
        pickup.mesh.visible = false;
      }
    }
  }
}
