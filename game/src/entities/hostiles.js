// Hostile NPCs for the M3 defeat objective (Eddie's guards at 210, 210).
// A damageable target for systems/combat.js: numeric health/armour and a
// pos {x, z}, so findLockOn + Combat.shoot + damage() all work on it
// unchanged. Death is signalled by fall(), which main.js turns into
// state.defeatedCount. Meshes reuse createPersonMesh from pedestrians.js.

import { createPersonMesh } from './pedestrians.js';

export class Hostile {
  constructor(scene, x, z, opts = {}) {
    this.x = x;
    this.z = z;
    this.heading = opts.heading ?? Math.PI;
    this.health = opts.health ?? 100;
    this.armour = opts.armour ?? 0;
    this.alive = true;
    this.shootTimer = opts.shootDelay ?? 1;
    this.shootDamage = opts.shootDamage ?? 8;
    this.shootRange = opts.shootRange ?? 45;
    const parts = createPersonMesh({
      shirt: opts.shirt ?? 0x2a2a2a,
      pants: opts.pants ?? 0x1f1f1f,
      skin: 0xc98a5a,
    });
    this.mesh = parts.group;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = this.heading;
    if (scene) scene.add(this.mesh);
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  get dead() {
    return this.health <= 0;
  }

  /** Fall over on the killing blow; returns true only the first time. */
  fall() {
    if (!this.alive) return false;
    this.alive = false;
    this.mesh.rotation.x = -Math.PI / 2;
    return true;
  }

  destroy(scene) {
    if (scene) scene.remove(this.mesh);
  }

  /**
   * Face the player and fire on a timer. Returns true on the frames a shot
   * goes off (main.js renders the tracer + sound + damage); false otherwise.
   * Guards only shoot a player on foot within range. `rng` is the seeded
   * game RNG (unseeded randomness would break shot determinism).
   */
  update(dt, player, rng) {
    if (!this.alive) return false;
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const d = Math.hypot(dx, dz);
    this.heading = Math.atan2(dx, dz);
    this.mesh.rotation.y = this.heading;
    if (d > this.shootRange || player.vehicle) return false;
    this.shootTimer -= dt;
    if (this.shootTimer > 0) return false;
    this.shootTimer = 1.1 + rng() * 0.5;
    return true;
  }
}

/** Spawn one guard per spot, staggered so they do not all fire at once. */
export function spawnHostiles(scene, spots) {
  return spots.map((spot, i) => new Hostile(scene, spot.x, spot.z, { shootDelay: 1 + i * 0.5 }));
}
