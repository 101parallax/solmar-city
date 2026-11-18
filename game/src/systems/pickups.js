// World pickups for Solmar City (v2): health, armour and ammo at fixed,
// memorable spots — the hospital steps, PD HQ and Chroma Auto. Each one is
// a small floating marker with a ground ring; walking (or driving) within
// 3 m collects it, and it respawns after 30 seconds. A pickup the player
// cannot use yet (full health, full armour, full reserves) stays on the
// ground instead of being wasted.
//
// Interface (design §2 contract):
//   new Pickups(scene)
//   pickups.update(dt, game) — game carries player, combat, hud, audio, time
// Spots are derived from data/city.js landmarks, so the map can never drift
// apart from the pickups. Offsets put each marker just outside its landmark
// building's footprint, on the lot the player can actually reach.

import * as THREE from 'three';
import { LANDMARKS, landmarkPos } from '../data/city.js';
import { PLAYER } from '../config.js';

const PICKUP_RADIUS = 3;
const RESPAWN_SECONDS = 30;
const HEALTH_AMOUNT = 50;
const ARMOUR_AMOUNT = 50;
const AMMO_PISTOL = 24;
const AMMO_CARBINE = 30;
const MAX_RESERVE = { pistol: 96, carbine: 180 };

const SPOTS = [
  { type: 'health', landmark: 'hospital', offset: { x: 0, z: 24 }, label: 'Health' },
  { type: 'armour', landmark: 'police', offset: { x: 0, z: 20 }, label: 'Armour' },
  { type: 'ammo', landmark: 'respray', offset: { x: 0, z: -18 }, label: 'Ammo' },
];

function lambert(color, emissive = 0x000000) {
  return new THREE.MeshLambertMaterial({ color, emissive });
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** The floating marker for one pickup type, built from boxes only. */
function buildMarker(type) {
  const group = new THREE.Group();
  if (type === 'health') {
    // White case, red cross.
    group.add(box(0.9, 0.9, 0.4, lambert(0xf4f6f8), 0, 0, 0));
    group.add(box(0.55, 0.2, 0.46, lambert(0xdd2233, 0x550000), 0, 0, 0));
    group.add(box(0.2, 0.55, 0.46, lambert(0xdd2233, 0x550000), 0, 0, 0));
  } else if (type === 'armour') {
    // Blue vest plate with a lighter chest stripe.
    group.add(box(0.9, 1.0, 0.35, lambert(0x2f6fd2, 0x0a1a33), 0, 0, 0));
    group.add(box(0.9, 0.22, 0.4, lambert(0x9cc8ff), 0, 0.18, 0));
    group.add(box(0.5, 0.3, 0.4, lambert(0x1c1c1c), 0, -0.3, 0));
  } else {
    // Olive ammo crate with a brass stripe.
    group.add(box(1.0, 0.7, 0.7, lambert(0x5a6b3a, 0x111a08), 0, 0, 0));
    group.add(box(1.02, 0.16, 0.72, lambert(0xd8b13a, 0x332200), 0, 0.1, 0));
  }
  return group;
}

class Pickup {
  constructor(scene, spot) {
    this.type = spot.type;
    this.label = spot.label;
    const landmark = LANDMARKS.find((l) => l.id === spot.landmark);
    const base = landmark ? landmarkPos(landmark) : { x: 0, z: 0 };
    this.x = base.x + spot.offset.x;
    this.z = base.z + spot.offset.z;
    this.taken = false;
    this.takenAt = 0;
    this._phase = 0;

    this.group = new THREE.Group();
    this.group.position.set(this.x, 0, this.z);
    this.marker = buildMarker(spot.type);
    this.marker.position.y = 1.3;
    this.group.add(this.marker);
    const ringColor = spot.type === 'health' ? 0x7dd87d : spot.type === 'armour' ? 0x6fb3ff : 0xffd23f;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.5, 28),
      new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.12;
    this.group.add(this.ring);
    if (scene) scene.add(this.group);
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  restore() {
    this.taken = false;
    this.group.visible = true;
  }

  collect() {
    this.taken = true;
    this.group.visible = false;
  }

  update(dt) {
    if (this.taken) return;
    this._phase += dt * 2;
    this.marker.position.y = 1.3 + Math.sin(this._phase) * 0.15;
    this.marker.rotation.y += dt * 0.8;
    this.ring.material.opacity = 0.45 + Math.sin(this._phase) * 0.2;
  }

  destroy(scene) {
    if (scene) scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = SPOTS.map((spot) => new Pickup(scene, spot));
    this._lastTime = 0;
  }

  /** Apply one pickup's effect. Returns the toast line, or null if unusable. */
  apply(item, game) {
    const player = game.player;
    const combat = game.combat;
    if (item.type === 'health') {
      if (!player || player.health >= PLAYER.maxHealth) return null;
      player.heal(HEALTH_AMOUNT);
      return `Health +${HEALTH_AMOUNT}`;
    }
    if (item.type === 'armour') {
      if (!player || player.armour >= 100) return null;
      player.armour = Math.min(100, player.armour + ARMOUR_AMOUNT);
      return `Armour +${ARMOUR_AMOUNT}`;
    }
    // Ammo: tops up both guns' reserves; skipped only when both are full.
    if (!combat) return null;
    const pistolRoom = MAX_RESERVE.pistol - (combat.ammo.pistol ?? 0);
    const carbineRoom = MAX_RESERVE.carbine - (combat.ammo.carbine ?? 0);
    if (pistolRoom <= 0 && carbineRoom <= 0) return null;
    const pistol = Math.max(0, Math.min(AMMO_PISTOL, pistolRoom));
    const carbine = Math.max(0, Math.min(AMMO_CARBINE, carbineRoom));
    combat.ammo.pistol = (combat.ammo.pistol ?? 0) + pistol;
    combat.ammo.carbine = (combat.ammo.carbine ?? 0) + carbine;
    return `Ammo +${pistol} / +${carbine}`;
  }

  update(dt, game) {
    const now = game?.time ?? 0;
    // The clock running backwards means a reset (New Game / shot stage):
    // every pickup is back on the ground.
    if (now < this._lastTime) for (const item of this.items) item.restore();
    this._lastTime = now;
    const player = game?.player;
    if (!player) return;
    for (const item of this.items) {
      if (item.taken) {
        if (now - item.takenAt >= RESPAWN_SECONDS) item.restore();
        continue;
      }
      item.update(dt);
      const dx = player.x - item.x;
      const dz = player.z - item.z;
      if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      const line = this.apply(item, game);
      if (!line) continue; // full already: leave it on the ground
      item.takenAt = now;
      item.collect();
      if (game.hud) game.hud.toast(line, 2);
      if (game.audio) game.audio.play('pickup');
    }
  }

  destroy() {
    for (const item of this.items) item.destroy(this.scene);
    this.items = [];
  }
}
