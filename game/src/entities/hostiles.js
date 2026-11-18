import * as THREE from 'three';
import { pointBlocked, blobShadowMesh, turnToward } from './vehicles.js';

// Mission enemies: guards and gang members who close in on the player and
// shoot from range, plus the M7 boss with 250 HP. Shooting them adds no
// wanted heat — the combat system treats mission hostiles as heat-free.
export class Hostiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
  }

  spawn(count, positions, opts = {}) {
    const created = [];
    for (let i = 0; i < count; i++) {
      const pos = positions?.[i] ?? { x: 0, z: 0 };
      const isBoss = !!(opts.boss && i === 0);
      const role = isBoss ? 'boss' : (opts.role ?? 'guard');
      const hp = opts.hp ?? (isBoss ? 250 : 60);
      const parts = buildHostileMesh(role);
      parts.group.position.set(pos.x, 0, pos.z);
      const id = this.nextId++;
      parts.group.userData.hitTarget = { kind: 'hostile', id };
      this.game.scene.add(parts.group);
      const hostile = {
        id,
        hp,
        maxHp: hp,
        mesh: parts.group,
        role,
        speed: role === 'boss' ? 4.2 : 5.0,
        shootCooldown: this.game.rng.range(0.8, 1.8),
        legL: parts.legL,
        legR: parts.legR,
        phase: 0,
        name: isBoss ? (opts.name ?? 'Dario Voss') : null,
      };
      this.list.push(hostile);
      created.push(hostile);
    }
    return created;
  }

  // Returns true when the hostile goes down.
  damage(id, amount) {
    const hostile = this.list.find((entry) => entry.id === id);
    if (!hostile) return false;
    hostile.hp -= amount;
    // A hit hostile returns fire almost immediately.
    hostile.shootCooldown = Math.min(hostile.shootCooldown, 0.3);
    const pos = hostile.mesh.position;
    this.game.effects?.damageNumber?.({ x: pos.x, y: 2.2, z: pos.z }, amount);
    if (hostile.hp > 0) return false;
    this.game.effects?.spawnParticles?.(
      { x: pos.x, y: 1.2, z: pos.z }, 0xcc2222, 16,
      { speed: 4, up: 3, life: 0.6 },
    );
    this.game.scene.remove(hostile.mesh);
    this.list = this.list.filter((entry) => entry !== hostile);
    this.game.events?.emit?.('hostileKilled', {
      id: hostile.id, role: hostile.role, name: hostile.name,
    });
    return true;
  }

  alive() {
    return this.list.length;
  }

  clear() {
    for (const hostile of this.list) this.game.scene.remove(hostile.mesh);
    this.list = [];
  }

  update(dt) {
    const playerPos = this.game.state.playerPos;
    const playerVehicle = this.game.state.playerInVehicle;
    for (const hostile of this.list) {
      const pos = hostile.mesh.position;
      const dx = playerPos.x - pos.x;
      const dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      hostile.mesh.rotation.y = turnToward(
        hostile.mesh.rotation.y, Math.atan2(dx, dz), dt * 6,
      );
      if (dist > 16) {
        // Close in on the player.
        const step = hostile.speed * dt;
        const nx = pos.x + (dx / dist) * step;
        const nz = pos.z + (dz / dist) * step;
        if (!pointBlocked(this.game, nx, pos.z, 0.5)) pos.x = nx;
        if (!pointBlocked(this.game, pos.x, nz, 0.5)) pos.z = nz;
        hostile.phase += dt * 8;
        const swing = Math.sin(hostile.phase) * 0.5;
        if (hostile.legL) {
          hostile.legL.rotation.x = swing;
          hostile.legR.rotation.x = -swing;
        }
      } else if (dist < 30) {
        // In range: shoot at the player (or their car).
        hostile.shootCooldown -= dt;
        if (hostile.shootCooldown <= 0) {
          hostile.shootCooldown = this.game.rng.range(0.9, 1.7);
          const from = { x: pos.x, y: 1.4, z: pos.z };
          const to = { x: playerPos.x, y: 1.2, z: playerPos.z };
          this.game.effects?.tracer?.(from, to);
          this.game.effects?.muzzleFlash?.(from);
          this.game.audio?.sfx?.('shot');
          const boss = hostile.role === 'boss';
          const hitChance = boss ? 0.62 : 0.5;
          if (this.game.rng.chance(hitChance)) {
            if (playerVehicle) playerVehicle.damage(boss ? 9 : 6);
            else this.game.player?.takeDamage?.(boss ? 12 : 7);
          }
        }
      }
    }
  }
}

function buildHostileMesh(role) {
  const group = new THREE.Group();
  const boss = role === 'boss';
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.7 });
  const jacket = new THREE.MeshStandardMaterial({
    color: boss ? 0xb02020 : 0x2e4a2e, roughness: 0.7,
  });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.8 });
  const legGeo = new THREE.BoxGeometry(0.22, 0.86, 0.26);
  const legL = new THREE.Group();
  legL.position.set(-0.14, 0.86, 0);
  const legLMesh = new THREE.Mesh(legGeo, pants);
  legLMesh.position.y = -0.43;
  legL.add(legLMesh);
  group.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.14, 0.86, 0);
  const legRMesh = new THREE.Mesh(legGeo, pants);
  legRMesh.position.y = -0.43;
  legR.add(legRMesh);
  group.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacket);
  torso.position.y = 1.22;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), skin);
  head.position.y = 1.82;
  group.add(head);
  // A visible weapon so hostiles read as armed at a glance.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.12, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.6 }),
  );
  gun.position.set(0.34, 1.35, 0.3);
  group.add(gun);
  if (boss) group.scale.setScalar(1.15);
  group.add(blobShadowMesh(1.4));
  return { group, legL, legR };
}
