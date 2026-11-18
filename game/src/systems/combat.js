import * as THREE from 'three';

// Third-person shooting: the crosshair follows the pointer and every shot is
// a raycast from the camera through the mouse position. Three weapons with
// distinct damage, fire rate and spread; the shotgun fires six pellets.
// Shooting cops and civilians adds wanted heat; mission hostiles are free.
export class Combat {
  constructor(game) {
    this.game = game;
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ndc = new THREE.Vector2();
    this.tmpVector = new THREE.Vector3();
    this.tmpOrigin = new THREE.Vector3();
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.crosshairEl = null;
    this._copHeatThisShot = false;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const state = this.game.state;
    const input = this.game.input;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        state.ammo[state.weapon] = WEAPONS[state.weapon].maxAmmo;
        this.game.audio?.sfx?.('reload');
      }
    }
    if (!input) return;
    if (input.wasPressed('Digit1')) this.setWeapon('pistol');
    if (input.wasPressed('Digit2')) this.setWeapon('carbine');
    if (input.wasPressed('Digit3')) this.setWeapon('shotgun');
    if (input.mouse?.down && !state.paused) this.tryShoot();
    // Crosshair follows the pointer: transform-only write, no layout reads.
    if (!this.crosshairEl) this.crosshairEl = document.getElementById('crosshair');
    if (this.crosshairEl && input.mouse) {
      this.crosshairEl.style.transform =
        `translate(${input.mouse.x}px, ${input.mouse.y}px) translate(-50%, -50%)`;
    }
  }

  setWeapon(name) {
    const state = this.game.state;
    if (name === 'shotgun' && !state.unlocks?.shotgun) {
      this.game.hud?.showToast?.('Shotgun locked - reach REP tier 3');
      return;
    }
    if (WEAPONS[name]) state.weapon = name;
  }

  cycleWeapon() {
    const order = ['pistol', 'carbine', 'shotgun'];
    const current = order.indexOf(this.game.state.weapon);
    for (let step = 1; step <= order.length; step++) {
      const next = order[(current + step) % order.length];
      if (next === 'shotgun' && !this.game.state.unlocks?.shotgun) continue;
      this.game.state.weapon = next;
      return;
    }
  }

  // Where the mouse points on the ground plane, or null when it never hits.
  aimPoint() {
    const input = this.game.input;
    const camera = this.game.camera;
    if (!input?.mouse || !camera) return null;
    this.ndc.set(
      (input.mouse.x / window.innerWidth) * 2 - 1,
      -(input.mouse.y / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpVector);
    if (!hit) return null;
    return { x: hit.x, z: hit.z };
  }

  reload() {
    if (this.reloading) return;
    const state = this.game.state;
    if (state.ammo[state.weapon] >= WEAPONS[state.weapon].maxAmmo) return;
    this.reloading = true;
    this.reloadTimer = 1.2;
    this.game.audio?.sfx?.('reload');
  }

  tryShoot() {
    const state = this.game.state;
    if (this.cooldown > 0 || this.reloading || state.paused) return;
    if (state.playerInVehicle) return;
    const weapon = WEAPONS[state.weapon];
    if (state.ammo[state.weapon] <= 0) {
      this.game.audio?.sfx?.('empty');
      this.reload();
      return;
    }
    state.ammo[state.weapon]--;
    state.stats.shotsFired++;
    this.cooldown = weapon.fireRate;
    this._copHeatThisShot = false;
    const player = this.game.player;
    const origin = player
      ? { x: player.mesh.position.x, y: 1.45, z: player.mesh.position.z }
      : { x: state.playerPos.x, y: 1.45, z: state.playerPos.z };
    this.game.effects?.muzzleFlash?.(origin);
    this.game.audio?.sfx?.('shot');
    this.game.effects?.shake?.(0.08);
    this.game.pedestrians?.panicAt?.(origin.x, origin.z);
    // Collect the target list once per trigger pull, not once per pellet.
    const targets = this._targets();
    for (let pellet = 0; pellet < weapon.pellets; pellet++) {
      const dir = this._aimDirection(weapon.spread);
      if (!dir) continue;
      // Hit detection raycasts from the CAMERA, not the player: the bullet
      // direction is the camera ray through the crosshair, so a ray fired
      // from the player 12 m behind the camera would systematically miss
      // whatever the crosshair points at. The tracer is still drawn from
      // the muzzle to the hit point.
      const cam = this.game.camera;
      if (cam) this.tmpOrigin.copy(cam.position);
      else this.tmpOrigin.set(origin.x, origin.y, origin.z);
      this.raycaster.set(this.tmpOrigin, dir);
      this.raycaster.far = weapon.range;
      const hits = this.raycaster.intersectObjects(targets, true);
      const end = {
        x: this.tmpOrigin.x + dir.x * weapon.range,
        y: Math.max(0.1, this.tmpOrigin.y + dir.y * weapon.range),
        z: this.tmpOrigin.z + dir.z * weapon.range,
      };
      if (hits.length > 0) {
        const hit = hits[0];
        const target = findHitTarget(hit.object);
        end.x = hit.point.x;
        end.y = hit.point.y;
        end.z = hit.point.z;
        if (target) this._applyHit(target, weapon.damage, hit.point);
        else {
          this.game.effects?.sparks?.({ x: hit.point.x, y: hit.point.y, z: hit.point.z });
        }
      } else {
        // Missed everything: kick up dust where the bullet lands.
        const ground = this.aimPoint();
        if (ground) {
          this.game.effects?.spawnParticles?.(
            { x: ground.x, y: 0.2, z: ground.z }, 0xcbb98a, 3,
            { speed: 2, up: 1.5, life: 0.4, gravity: 6 },
          );
        }
      }
      this.game.effects?.tracer?.(origin, end);
    }
  }

  _aimDirection(spread) {
    const input = this.game.input;
    const camera = this.game.camera;
    if (!input?.mouse || !camera) return null;
    this.ndc.set(
      (input.mouse.x / window.innerWidth) * 2 - 1,
      -(input.mouse.y / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, camera);
    const dir = this.raycaster.ray.direction.clone();
    const rng = this.game.rng;
    dir.x += (rng.next() - 0.5) * spread * 2;
    dir.y += (rng.next() - 0.5) * spread * 2;
    dir.z += (rng.next() - 0.5) * spread * 2;
    return dir.normalize();
  }

  _targets() {
    const meshes = [];
    for (const hostile of this.game.hostiles?.list ?? []) meshes.push(hostile.mesh);
    for (const officer of this.game.police?.officers ?? []) {
      if (!officer.fallen) meshes.push(officer.mesh);
    }
    for (const cruiser of this.game.police?.cruisers ?? []) {
      meshes.push(cruiser.vehicle.mesh);
    }
    for (const ped of this.game.pedestrians?.peds ?? []) {
      if (!ped.dead) meshes.push(ped.mesh);
    }
    for (const vehicle of this.game.vehicles?.all ?? []) meshes.push(vehicle.mesh);
    for (const car of this.game.traffic?.cars ?? []) meshes.push(car.vehicle.mesh);
    if (this.game.police?.roadblock) {
      for (const vehicle of this.game.police.roadblock.vehicles) meshes.push(vehicle.mesh);
    }
    return meshes;
  }

  _applyHit(target, damage, point) {
    const at = { x: point.x, y: point.y, z: point.z };
    if (target.kind === 'hostile') {
      // Mission hostiles are heat-free by design.
      this.game.hostiles?.damage?.(target.id, damage);
      this.game.effects?.spawnParticles?.(at, 0xcc2222, 6,
        { speed: 3, up: 2, life: 0.4, gravity: 8 });
    } else if (target.kind === 'officer') {
      const killed = this.game.police?.damageOfficer?.(target.id, damage);
      this.game.effects?.damageNumber?.({ x: at.x, y: at.y + 0.8, z: at.z }, damage);
      if (killed) this.game.wanted?.addCrime?.('killCop');
      else if (!this._copHeatThisShot) {
        this._copHeatThisShot = true;
        this.game.wanted?.addCrime?.('shootCop');
      }
    } else if (target.kind === 'ped') {
      const killed = this.game.pedestrians?.damage?.(target.id, damage);
      if (killed) this.game.wanted?.addCrime?.('killPed');
      else this.game.wanted?.addHeat?.(3);
    } else if (target.kind === 'vehicle' || target.kind === 'cruiser') {
      target.ref?.damage?.(damage);
      this.game.effects?.sparks?.(at);
      this.game.effects?.damageNumber?.({ x: at.x, y: at.y + 0.8, z: at.z }, damage);
      if (target.kind === 'cruiser' && !this._copHeatThisShot) {
        this._copHeatThisShot = true;
        this.game.wanted?.addCrime?.('shootCop');
      }
    }
  }
}

// Weapon tuning: damage per hit, seconds between shots, spread in radians,
// pellets per trigger pull, range in metres, full ammo load.
export const WEAPONS = {
  pistol: { damage: 25, fireRate: 0.28, spread: 0.012, pellets: 1, range: 70, maxAmmo: 48 },
  carbine: { damage: 18, fireRate: 0.11, spread: 0.03, pellets: 1, range: 90, maxAmmo: 120 },
  shotgun: { damage: 11, fireRate: 0.85, spread: 0.085, pellets: 6, range: 35, maxAmmo: 24 },
};

// Walk up the parent chain until a mesh carrying hit metadata is found.
function findHitTarget(object) {
  let current = object;
  while (current) {
    if (current.userData?.hitTarget) return current.userData.hitTarget;
    current = current.parent;
  }
  return null;
}
