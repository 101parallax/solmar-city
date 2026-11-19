// Hostiles: mission enemies (guards and bosses). They advance on the
// player, open fire at range, and report deaths so missions can track
// defeat objectives. The default boss is Dario Voss with 250 HP.
import * as THREE from 'three';

const BOSS_NAME = 'Dario Voss';
const BOSS_HP = 250;
const GUARD_HP = 100;
const ENGAGE_RANGE = 34;
const STOP_RANGE = 12;

export class Hostiles {
  constructor(game) {
    this.game = game;
    this.rng = game.rng || {
      next: () => 0.5,
      range: (a, b) => (a + b) / 2,
      int: (a) => a,
      pick: (arr) => arr[0],
      chance: () => false,
    };
    this.list = [];
    this.nextId = 1;
  }

  alive() {
    let count = 0;
    for (const hostile of this.list) if (hostile.alive) count++;
    return count;
  }

  spawn(count, positions, opts = {}) {
    const created = [];
    const spots = Array.isArray(positions) ? positions : [];
    for (let i = 0; i < count; i++) {
      const spot = spots[i] || {
        x: (spots[0]?.x ?? 0) + this.rng.range(-8, 8),
        z: (spots[0]?.z ?? 0) + this.rng.range(-8, 8),
      };
      const isBoss = Boolean(opts.boss) && i === 0;
      const role = isBoss ? 'boss' : opts.role || 'guard';
      const hp = isBoss
        ? opts.hp ?? BOSS_HP
        : opts.hp ?? GUARD_HP;
      const name = isBoss ? opts.bossName || opts.name || BOSS_NAME : opts.name || 'Guard';
      const hostile = this.buildHostile(spot.x, spot.z, role, name, hp);
      this.list.push(hostile);
      created.push(hostile);
    }
    return created;
  }

  buildHostile(x, z, role, name, hp) {
    const isBoss = role === 'boss';
    const scale = isBoss ? 1.18 : 1;
    const mesh = new THREE.Group();
    mesh.name = `hostile-${role}`;
    const jacketMat = new THREE.MeshStandardMaterial({
      color: isBoss ? 0x5b2333 : 0x4a4a52,
    });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x22262e });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc98d64 });
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32 * scale, 0.75 * scale, 3, 8),
      jacketMat,
    );
    body.position.y = 1.05 * scale;
    body.castShadow = true;
    mesh.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26 * scale, 12, 10),
      skinMat,
    );
    head.position.y = 1.86 * scale;
    mesh.add(head);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    );
    gun.position.set(0.3 * scale, 1.25 * scale, 0.4 * scale);
    mesh.add(gun);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5 * scale, 16),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    mesh.add(shadow);
    mesh.position.set(x, 0, z);
    const hostile = {
      id: this.nextId++,
      hp,
      maxHp: hp,
      mesh,
      role,
      name,
      alive: true,
      heading: 0,
      fireTimer: this.rng.range(0.6, 1.6),
      fallTimer: 0,
      speed: isBoss ? 3 : 3.6,
      damagePerShot: isBoss ? 9 : 5,
    };
    mesh.userData.hit = { kind: 'hostile', ref: hostile };
    this.game.scene.add(mesh);
    return hostile;
  }

  damage(id, n) {
    const hostile = this.list.find((h) => h.id === id);
    if (!hostile || !hostile.alive) return false;
    hostile.hp -= n;
    if (hostile.hp > 0) return false;
    hostile.hp = 0;
    hostile.alive = false;
    hostile.fallTimer = 4;
    hostile.mesh.rotation.x = -Math.PI / 2;
    hostile.mesh.position.y = 0.3;
    this.game.effects?.spawnParticles(
      {
        x: hostile.mesh.position.x,
        y: 1,
        z: hostile.mesh.position.z,
      },
      0xaa2222,
      14,
      { speed: 4, up: 3, life: 0.6, gravity: 10 },
    );
    this.game.events?.emit('hostileDown', {
      id: hostile.id,
      role: hostile.role,
      name: hostile.name,
    });
    if (hostile.role === 'boss') {
      this.game.events?.emit('bossDown', {
        id: hostile.id,
        name: hostile.name,
      });
    }
    return true;
  }

  clear() {
    for (const hostile of this.list) {
      this.game.scene.remove(hostile.mesh);
    }
    this.list = [];
  }

  update(dt) {
    const game = this.game;
    const playerPos = game.state.playerPos || { x: 0, z: 0 };
    const playerDown = (game.state.health || 0) <= 0;
    for (const hostile of this.list) {
      if (!hostile.alive) {
        hostile.fallTimer -= dt;
        if (hostile.fallTimer <= 0 && hostile.mesh.visible) {
          hostile.mesh.visible = false;
        }
        continue;
      }
      const pos = hostile.mesh.position;
      const dx = playerPos.x - pos.x;
      const dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > STOP_RANGE && dist > 0.01) {
        pos.x += (dx / dist) * hostile.speed * dt;
        pos.z += (dz / dist) * hostile.speed * dt;
        hostile.heading = Math.atan2(dx, dz);
        hostile.mesh.rotation.y = hostile.heading;
      } else if (dist > 0.01) {
        hostile.heading = Math.atan2(dx, dz);
        hostile.mesh.rotation.y = hostile.heading;
      }
      if (dist < ENGAGE_RANGE && !playerDown) {
        hostile.fireTimer -= dt;
        if (hostile.fireTimer <= 0) {
          hostile.fireTimer = hostile.role === 'boss' ? 1.1 : 1.5;
          if (this.rng.chance(0.5)) {
            game.player?.takeDamage(hostile.damagePerShot);
            game.effects?.tracer(
              { x: pos.x, y: 1.4, z: pos.z },
              { x: playerPos.x, y: 1.2, z: playerPos.z },
            );
            game.audio?.sfx?.('shot');
          }
        }
      }
    }
  }
}
