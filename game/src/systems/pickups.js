import * as THREE from 'three';
import { CITY_DATA } from '../data/city.js';
import { findPlace } from '../entities/player.js';
import { WEAPONS } from './combat.js';

// Fixed health, armour and ammo pickups at the hospital, PD HQ, Respray and
// a few more landmarks. Each one respawns 60 seconds after it is collected.
// A pickup is only consumed when it would actually help (no wasted health
// pickups at full health).
export class Pickups {
  constructor(game) {
    this.game = game;
    this.elapsed = 0;
    this.items = [];
    const spots = [
      { type: 'health', places: ['hospital', 'rumah sakit'], fallback: { x: -140, z: 140 } },
      { type: 'armour', places: ['police', 'pd hq', 'headquarters'], fallback: { x: 140, z: -140 } },
      { type: 'ammo', places: ['respray', 'chroma', 'auto'], fallback: { x: 0, z: -210 } },
      { type: 'health', places: ['beach', 'pantai'], fallback: { x: -210, z: 210 } },
      { type: 'ammo', places: ['gun', 'weapon', 'ammo'], fallback: { x: 210, z: 105 } },
      { type: 'armour', places: ['harbor', 'port', 'dock'], fallback: { x: 210, z: -210 } },
    ];
    for (const spot of spots) {
      const pos = findPlace(CITY_DATA, ...spot.places) ?? spot.fallback;
      const mesh = buildPickupMesh(spot.type);
      mesh.position.set(pos.x, 1.2, pos.z);
      game.scene.add(mesh);
      this.items.push({
        type: spot.type, x: pos.x, z: pos.z, mesh,
        available: true, timer: 0, phase: game.rng.next() * Math.PI * 2,
      });
    }
  }

  update(dt) {
    this.elapsed += dt;
    const playerPos = this.game.state.playerPos;
    for (const item of this.items) {
      if (!item.available) {
        item.timer -= dt;
        if (item.timer <= 0) {
          item.available = true;
          item.mesh.visible = true;
        }
        continue;
      }
      item.mesh.position.y = 1.2 + Math.sin(this.elapsed * 2 + item.phase) * 0.15;
      item.mesh.rotation.y += dt * 1.5;
      const dist = Math.hypot(item.x - playerPos.x, item.z - playerPos.z);
      if (dist < 2.5) this._collect(item);
    }
  }

  _collect(item) {
    const state = this.game.state;
    if (item.type === 'health') {
      if (state.health >= 100) return;
      this.game.player?.heal?.(50);
      this.game.hud?.showEventPopup?.('HEALTH +50');
    } else if (item.type === 'armour') {
      if (state.armour >= 100) return;
      state.armour = Math.min(100, state.armour + 50);
      this.game.hud?.showEventPopup?.('ARMOUR +50');
    } else {
      const full = state.ammo.pistol >= WEAPONS.pistol.maxAmmo
        && state.ammo.carbine >= WEAPONS.carbine.maxAmmo
        && state.ammo.shotgun >= WEAPONS.shotgun.maxAmmo;
      if (full) return;
      state.ammo.pistol = WEAPONS.pistol.maxAmmo;
      state.ammo.carbine = WEAPONS.carbine.maxAmmo;
      state.ammo.shotgun = WEAPONS.shotgun.maxAmmo;
      this.game.hud?.showEventPopup?.('AMMO RESTOCKED');
    }
    item.available = false;
    item.timer = 60;
    item.mesh.visible = false;
    this.game.effects?.spawnParticles?.(
      { x: item.x, y: 1.2, z: item.z }, 0x7dff9a, 14,
      { speed: 3, up: 3, life: 0.6 },
    );
    this.game.audio?.sfx?.('pickup');
  }

  positions() {
    return this.items.map((item) => ({
      type: item.type, x: item.x, z: item.z, available: item.available,
    }));
  }

  // New Game: every pickup is available again.
  reset() {
    for (const item of this.items) {
      item.available = true;
      item.timer = 0;
      if (item.mesh) item.mesh.visible = true;
    }
  }
}

function buildPickupMesh(type) {
  const group = new THREE.Group();
  const ringColors = { health: 0x2ecc71, armour: 0x3498db, ammo: 0xf2c230 };
  if (type === 'health') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    );
    group.add(box);
    const crossMat = new THREE.MeshStandardMaterial({
      color: 0xe02020, emissive: 0xe02020, emissiveIntensity: 0.5, roughness: 0.4,
    });
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.06), crossMat);
    crossV.position.z = 0.36;
    group.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.06), crossMat);
    crossH.position.z = 0.36;
    group.add(crossH);
  } else if (type === 'armour') {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.8, 0.18),
      new THREE.MeshStandardMaterial({
        color: 0x2f6fd0, metalness: 0.7, roughness: 0.3,
      }),
    );
    group.add(plate);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.16, 0.2),
      new THREE.MeshStandardMaterial({
        color: 0xbfe3ff, emissive: 0x9fd0ff, emissiveIntensity: 0.6,
      }),
    );
    group.add(stripe);
  } else {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x8a6a2f, roughness: 0.8 }),
    );
    group.add(crate);
    const bulletMat = new THREE.MeshStandardMaterial({
      color: 0xf2c230, metalness: 0.8, roughness: 0.3,
    });
    for (let i = -1; i <= 1; i++) {
      const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), bulletMat);
      bullet.position.set(i * 0.2, 0.4, 0);
      group.add(bullet);
    }
  }
  // Ground ring so the pickup reads from a distance.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.1, 24),
    new THREE.MeshBasicMaterial({
      color: ringColors[type], transparent: true, opacity: 0.6, side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.15;
  group.add(ring);
  return group;
}
