// Combat: three weapons with distinct damage, fire rate, spread and ammo.
// Shots are raycast from the CAMERA through the crosshair (raycasting from
// the player was the v3 bug: shots missed what the crosshair showed).
// No drive-by: tryShoot refuses while the player is in a vehicle.
import * as THREE from 'three';

const WEAPONS = {
  pistol: {
    damage: 25,
    fireRate: 0.28,
    spread: 0.015,
    range: 90,
    pellets: 1,
    maxAmmo: 48,
    auto: false,
  },
  carbine: {
    damage: 16,
    fireRate: 0.11,
    spread: 0.035,
    range: 110,
    pellets: 1,
    maxAmmo: 120,
    auto: true,
  },
  shotgun: {
    damage: 11,
    fireRate: 0.85,
    spread: 0.11,
    range: 45,
    pellets: 6,
    maxAmmo: 24,
    auto: false,
  },
};
const WEAPON_ORDER = ['pistol', 'carbine', 'shotgun'];
const RELOAD_TIME = 1.2;

export class Combat {
  constructor(game) {
    this.game = game;
    this.rng = game.rng || {
      next: () => 0.5,
      range: (a, b) => (a + b) / 2,
      int: (a) => a,
      pick: (arr) => arr[0],
      chance: () => false,
    };
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 120;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.mouseNdc = new THREE.Vector2();
    this.muzzle = new THREE.Vector3();
    this.aimDir = new THREE.Vector3();
    this.spreadDir = new THREE.Vector3();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hitPoint = new THREE.Vector3();
  }

  currentWeapon() {
    const name = this.game.state.weapon || 'pistol';
    return WEAPONS[name] || WEAPONS.pistol;
  }

  currentWeaponName() {
    return this.game.state.weapon || 'pistol';
  }

  setWeapon(name) {
    if (!WEAPONS[name]) return false;
    if (name === 'shotgun' && !this.game.state.unlocks?.shotgun) return false;
    this.game.state.weapon = name;
    this.reloading = false;
    return true;
  }

  cycleWeapon() {
    const current = WEAPON_ORDER.indexOf(this.currentWeaponName());
    for (let step = 1; step <= WEAPON_ORDER.length; step++) {
      const next = WEAPON_ORDER[(current + step) % WEAPON_ORDER.length];
      if (this.setWeapon(next)) return next;
    }
    return this.currentWeaponName();
  }

  updateMouseNdc() {
    const input = this.game.input;
    const el = this.game.renderer?.domElement;
    const width = el?.clientWidth || window.innerWidth;
    const height = el?.clientHeight || window.innerHeight;
    const mx = input.mouse?.x ?? width / 2;
    const my = input.mouse?.y ?? height / 2;
    this.mouseNdc.set((mx / width) * 2 - 1, -(my / height) * 2 + 1);
  }

  aimPoint() {
    const camera = this.game.camera;
    this.updateMouseNdc();
    this.raycaster.setFromCamera(this.mouseNdc, camera);
    const hit = this.raycaster.ray.intersectPlane(
      this.groundPlane,
      this.hitPoint,
    );
    if (hit) return { x: hit.x, y: 0, z: hit.z };
    const dir = this.raycaster.ray.direction;
    const range = this.currentWeapon().range;
    return {
      x: camera.position.x + dir.x * range,
      y: camera.position.y + dir.y * range,
      z: camera.position.z + dir.z * range,
    };
  }

  muzzlePosition() {
    const player = this.game.player;
    if (player?.mesh) {
      const pos = player.mesh.position;
      this.muzzle.set(
        pos.x + Math.sin(player.heading) * 0.5,
        1.45,
        pos.z + Math.cos(player.heading) * 0.5,
      );
      return this.muzzle;
    }
    const camera = this.game.camera;
    camera.getWorldDirection(this.aimDir);
    this.muzzle.copy(camera.position).addScaledVector(this.aimDir, 1);
    this.muzzle.y -= 0.2;
    return this.muzzle;
  }

  collectTargets() {
    const targets = [];
    const game = this.game;
    for (const hostile of game.hostiles?.list || []) {
      if (hostile.alive) targets.push(hostile.mesh);
    }
    for (const officer of game.police?.officers || []) {
      if (officer.alive) targets.push(officer.mesh);
    }
    for (const unit of game.police?.cruisers || []) {
      if (!unit.vehicle.wrecked) targets.push(unit.vehicle.mesh);
    }
    for (const unit of game.police?.roadblock || []) {
      if (!unit.vehicle.wrecked) targets.push(unit.vehicle.mesh);
    }
    for (const ped of game.pedestrians?.list || []) {
      if (ped.alive) targets.push(ped.mesh);
    }
    for (const vehicle of game.vehicles?.all || []) {
      if (!vehicle.wrecked) targets.push(vehicle.mesh);
    }
    for (const car of game.traffic?.cars || []) {
      if (!car.vehicle.wrecked) targets.push(car.vehicle.mesh);
    }
    return targets;
  }

  findHitRecord(object) {
    let node = object;
    while (node) {
      if (node.userData?.hit) return node.userData.hit;
      node = node.parent;
    }
    return null;
  }

  applyHit(record, damage, point) {
    const game = this.game;
    game.effects?.damageNumber(point, damage);
    if (record.kind === 'hostile') {
      game.hostiles.damage(record.ref.id, damage);
      // Mission hostiles carry no wanted weight.
      game.effects?.spawnParticles(point, 0xaa2222, 6, {
        speed: 4,
        up: 2,
        life: 0.4,
        gravity: 10,
      });
    } else if (record.kind === 'officer') {
      game.police.damageOfficer(record.ref, damage);
      game.effects?.spawnParticles(point, 0xaa2222, 6, {
        speed: 4,
        up: 2,
        life: 0.4,
        gravity: 10,
      });
    } else if (record.kind === 'police') {
      game.police.damageCruiser(record.ref, damage);
      game.effects?.sparks(point);
    } else if (record.kind === 'ped') {
      game.pedestrians.damage(record.ref, damage);
      game.effects?.spawnParticles(point, 0xaa2222, 6, {
        speed: 4,
        up: 2,
        life: 0.4,
        gravity: 10,
      });
    } else {
      // Parked, traffic or player vehicle.
      record.ref.damage?.(damage);
      game.effects?.sparks(point);
    }
  }

  tryShoot() {
    const game = this.game;
    const state = game.state;
    // No drive-by shooting.
    if (state.playerInVehicle) return false;
    if (this.reloading || this.cooldown > 0) return false;
    const weaponName = this.currentWeaponName();
    const weapon = this.currentWeapon();
    const ammo = state.ammo?.[weaponName] ?? 0;
    if (ammo <= 0) {
      game.audio?.sfx?.('empty');
      this.reload();
      return false;
    }

    state.ammo[weaponName] = ammo - 1;
    state.stats.shotsFired = (state.stats.shotsFired || 0) + 1;
    this.cooldown = weapon.fireRate;

    const camera = game.camera;
    this.updateMouseNdc();
    this.raycaster.setFromCamera(this.mouseNdc, camera);
    this.raycaster.far = weapon.range;
    const targets = this.collectTargets();
    const muzzle = this.muzzlePosition();

    for (let p = 0; p < weapon.pellets; p++) {
      // Spread jitters the camera ray, so pellets fan out from the
      // crosshair instead of from the player. The direction vector is
      // reused across pellets instead of cloned per pellet.
      const dir = this.spreadDir.copy(this.raycaster.ray.direction);
      dir.x += (this.rng.next() - 0.5) * weapon.spread * 2;
      dir.y += (this.rng.next() - 0.5) * weapon.spread * 2;
      dir.z += (this.rng.next() - 0.5) * weapon.spread * 2;
      dir.normalize();
      this.raycaster.set(camera.position, dir);
      const hits = this.raycaster.intersectObjects(targets, true);
      if (hits.length > 0) {
        const hit = hits[0];
        const record = this.findHitRecord(hit.object);
        const point = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
        game.effects?.tracer(
          { x: muzzle.x, y: muzzle.y, z: muzzle.z },
          point,
        );
        if (record) this.applyHit(record, weapon.damage, point);
      } else {
        const end = {
          x: camera.position.x + dir.x * weapon.range,
          y: Math.max(0.2, camera.position.y + dir.y * weapon.range),
          z: camera.position.z + dir.z * weapon.range,
        };
        game.effects?.tracer(
          { x: muzzle.x, y: muzzle.y, z: muzzle.z },
          end,
        );
      }
    }

    game.effects?.muzzleFlash({ x: muzzle.x, y: muzzle.y, z: muzzle.z });
    game.audio?.sfx?.('shot');
    const playerPos = state.playerPos || { x: 0, z: 0 };
    game.pedestrians?.panicAt(playerPos.x, playerPos.z);

    if ((state.ammo[weaponName] ?? 0) <= 0) this.reload();
    return true;
  }

  reload() {
    if (this.reloading) return false;
    const weaponName = this.currentWeaponName();
    const weapon = this.currentWeapon();
    if ((this.game.state.ammo?.[weaponName] ?? 0) >= weapon.maxAmmo) {
      return false;
    }
    this.reloading = true;
    this.reloadTimer = RELOAD_TIME;
    this.game.audio?.sfx?.('reload');
    return true;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        const weaponName = this.currentWeaponName();
        const weapon = this.currentWeapon();
        this.game.state.ammo[weaponName] = weapon.maxAmmo;
      }
      return;
    }
    const input = this.game.input;
    if (!input) return;
    // Full-auto weapons fire while the button is held; the rest fire on
    // click. tryShoot is cooldown-gated, so a main-loop click handler
    // calling it too can never double-fire.
    if (this.currentWeapon().auto) {
      if (input.mouse?.down) this.tryShoot();
    } else if (input.mouse?.justClicked) {
      this.tryShoot();
    }
  }
}
