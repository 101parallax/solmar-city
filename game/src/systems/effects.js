// Combat feedback for Solmar City: smoke + spark particles, screen shake, and
// floating damage numbers. v1 had none of these — a wrecked car just sat there
// and a hit showed nothing but a tracer. The tracer in main.js (addTracer) is
// the pattern this follows: short-lived visuals, pooled, no allocation per hit.
//
// INTEGRATION (coordinator, at merge — main.js gains exactly these lines):
//   createGame:  const effects = new Effects(scene);  // add `effects` to game
//   render:      game.effects.update(frameDt, camera); // AFTER player.updateCamera
//   call sites (one line each, in the owning worker's file):
//     missions advance, checkpoint objective completes -> audio.play('checkpoint')
//     Vehicle.takeDamage, wrecked flips false->true  -> audio.play('explosion')
//       + effects.spawnExplosion({ x, z }) + effects.shake(0.8)
//     tryShoot, a hit lands                          -> effects.damageNumber(pos, dmg)
//       + effects.spawnSparks(pos, 4)
// Deterministic: every roll flows through one seeded stream (no unseeded RNG).
// No network, no embedded URLs — the soft-circle sprite is a canvas texture.

import * as THREE from 'three';
import { createRandom } from '../random.js';

export class Effects {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.rng = createRandom(opts.seed ?? 20261118);
    this.trauma = 0;
    this._tmp = new THREE.Vector3();
    this._texture = this._makeSoftTexture();
    this._smoke = this._makePool(40, 0x5a5a55);
    this._sparks = this._makePool(40, 0xffa030);
    this._numbers = this._makeNumberPool(12);
  }

  /** Soft radial blob, drawn once on a canvas and shared by every sprite. */
  _makeSoftTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }

  /** A pool of hidden sprites sharing one texture; each has its own material
   * so opacity stays per-particle. `entries` carry the particle state. */
  _makePool(size, color) {
    const pool = [];
    for (let i = 0; i < size; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: this._texture, color, transparent: true, opacity: 0, depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.scene.add(sprite);
      pool.push({ sprite, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
    }
    return pool;
  }

  /** Floating damage numbers live in the DOM (crisp text, no canvas atlas):
   * one fixed overlay + a pool of absolutely-positioned divs. */
  _makeNumberPool(size) {
    if (typeof document === 'undefined') return [];
    const container = document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:6;';
    document.body.appendChild(container);
    const pool = [];
    for (let i = 0; i < size; i += 1) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:0;top:0;font:700 22px "Passion One","Arial Narrow",sans-serif;'
        + 'color:#ffd23f;text-shadow:0 2px 4px rgba(0,0,0,0.9);will-change:transform,opacity;display:none;';
      container.appendChild(el);
      pool.push({ el, x: 0, y: 0, z: 0, life: 0, maxLife: 1 });
    }
    return pool;
  }

  _alloc(pool) {
    for (const entry of pool) {
      if (entry.life <= 0) return entry;
    }
    return pool[0];
  }

  /** Grey smoke puff: rises, grows, fades. `pos` is { x, z } (y starts at 0.8). */
  spawnSmoke(pos, count = 6) {
    for (let i = 0; i < count; i += 1) {
      const p = this._alloc(this._smoke);
      p.sprite.position.set(pos.x + (this.rng() - 0.5) * 1.2, 0.8, pos.z + (this.rng() - 0.5) * 1.2);
      p.vx = (this.rng() - 0.5) * 1.6;
      p.vy = 1.2 + this.rng() * 1.2;
      p.vz = (this.rng() - 0.5) * 1.6;
      p.maxLife = 0.9 + this.rng() * 0.8;
      p.life = p.maxLife;
      p.sprite.visible = true;
    }
  }

  /** Hot sparks: fast, gravity-pulled, gone in half a second. */
  spawnSparks(pos, count = 10) {
    const colors = [0xffe08a, 0xffa030, 0xff6b2d];
    for (let i = 0; i < count; i += 1) {
      const p = this._alloc(this._sparks);
      p.sprite.position.set(pos.x, 1.1, pos.z);
      p.vx = (this.rng() - 0.5) * 12;
      p.vy = 2 + this.rng() * 5;
      p.vz = (this.rng() - 0.5) * 12;
      p.maxLife = 0.25 + this.rng() * 0.3;
      p.life = p.maxLife;
      p.sprite.material.color.setHex(colors[Math.floor(this.rng() * colors.length)]);
      p.sprite.visible = true;
    }
  }

  /** A vehicle wrecking: smoke + sparks + a shake. Pair with audio 'explosion'. */
  spawnExplosion(pos) {
    this.spawnSmoke(pos, 10);
    this.spawnSparks(pos, 14);
    this.shake(0.8);
  }

  /** Add camera trauma (0..1). Trauma decays in update(); the offset applied
   * each frame is trauma^2, so small shakes stay subtle and big ones punch. */
  shake(magnitude) {
    this.trauma = Math.min(1, this.trauma + magnitude);
  }

  /** A floating number over a world position: damage dealt, or a kill bonus.
   * `kind` is 'hit' (gold) or 'kill' (red). */
  damageNumber(worldPos, text, kind = 'hit') {
    if (this._numbers.length === 0) return;
    const n = this._alloc(this._numbers);
    n.x = worldPos.x;
    n.y = 1.9;
    n.z = worldPos.z;
    n.maxLife = 0.9;
    n.life = n.maxLife;
    n.el.textContent = String(text);
    n.el.style.color = kind === 'kill' ? '#ff6b61' : '#ffd23f';
    n.el.style.display = '';
  }

  /**
   * Advance every effect. Call once per frame AFTER the camera is placed
   * (player.updateCamera), so the shake offset lands on the final camera
   * position and is gone again next frame.
   */
  update(dt, camera) {
    // Screen shake: a decaying random offset on the camera.
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
      const mag = this.trauma * this.trauma * 0.55;
      camera.position.x += (this.rng() * 2 - 1) * mag;
      camera.position.y += (this.rng() * 2 - 1) * mag * 0.7;
    }
    this._updatePool(this._smoke, dt, 1.4, 0.8, 2.4, 0.5);
    this._updatePool(this._sparks, dt, -12, 0.25, 0.25, 1);
    this._updateNumbers(dt, camera);
  }

  /** Shared particle step: integrate, apply vertical accel, fade + scale. */
  _updatePool(pool, dt, accelY, scaleFrom, scaleTo, peakOpacity) {
    for (const p of pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vy += accelY * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      const frac = p.life / p.maxLife;
      const scale = scaleTo + (scaleFrom - scaleTo) * frac;
      p.sprite.scale.set(scale, scale, 1);
      p.sprite.material.opacity = peakOpacity * frac;
    }
  }

  /** Damage numbers rise, fade, and track their world position on screen. */
  _updateNumbers(dt, camera) {
    if (typeof window === 'undefined') return;
    for (const n of this._numbers) {
      if (n.life <= 0) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.el.style.display = 'none';
        continue;
      }
      n.y += dt * 1.2;
      this._tmp.set(n.x, n.y, n.z).project(camera);
      if (this._tmp.z > 1) {
        n.el.style.display = 'none';
        continue;
      }
      const x = (this._tmp.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-this._tmp.y * 0.5 + 0.5) * window.innerHeight;
      n.el.style.display = '';
      n.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
      n.el.style.opacity = (n.life / n.maxLife).toFixed(2);
    }
  }
}
