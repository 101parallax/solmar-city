// Effects: pooled particles, explosions, tracers, screen shake and floating
// damage numbers. Everything is preallocated (no per-frame allocation) so the
// per-frame update stays small and never blocks the main thread.
import * as THREE from 'three';

const MAX_PARTICLES = 800;
const MAX_TRACERS = 10;
const MAX_LIGHTS = 3;

export class Effects {
  constructor(game) {
    this.game = game;
    this.rng = game.rng || {
      next: () => 0.5,
      range: (a, b) => (a + b) / 2,
      int: (a) => a,
      pick: (arr) => arr[0],
      chance: () => false,
    };
    this.cursor = 0;
    this.time = 0;

    // Particle pool: one THREE.Points draw call for every particle.
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.gravity = new Float32Array(MAX_PARTICLES);
    this.baseColor = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.positions[i * 3 + 1] = -9999;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    game.scene.add(this.points);

    // Pooled point lights for explosions and muzzle flashes.
    this.lights = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const light = new THREE.PointLight(0xffaa33, 0, 30, 1.6);
      light.visible = false;
      game.scene.add(light);
      this.lights.push({ light, life: 0, maxLife: 1 });
    }
    this.lightCursor = 0;

    // Pooled tracer lines.
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const tGeo = new THREE.BufferGeometry();
      tGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(6), 3),
      );
      const tMat = new THREE.LineBasicMaterial({
        color: 0xffe9a8,
        transparent: true,
        opacity: 0,
      });
      const line = new THREE.Line(tGeo, tMat);
      line.visible = false;
      line.frustumCulled = false;
      game.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerCursor = 0;

    // Floating damage numbers (DOM). Writes are batched in update(dt):
    // positions are computed once at spawn, then only transform/opacity
    // change per frame, so no layout read ever interleaves with a write.
    this.damageLayer = null;
    if (typeof document !== 'undefined') {
      this.damageLayer = document.getElementById('hud-damage-layer');
    }
    this.damageNumbers = [];

    // Screen shake state. The offset is applied to the camera in update(dt)
    // on top of the position main.js set that same frame; main.js
    // repositions the camera every frame, so no offset ever accumulates.
    this.shakeMagnitude = 0;
    this.shakeOffset = new THREE.Vector3();
    this.tmpColor = new THREE.Color();
    this.tmpVec = new THREE.Vector3();
  }

  spawnParticles(pos, color, count, opts = {}) {
    const speed = opts.speed ?? 6;
    const up = opts.up ?? 3;
    const life = opts.life ?? 0.7;
    const gravity = opts.gravity ?? 9;
    this.tmpColor.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const i3 = i * 3;
      this.positions[i3] = pos.x + (this.rng.next() - 0.5) * 0.6;
      this.positions[i3 + 1] = (pos.y ?? 1) + (this.rng.next() - 0.5) * 0.6;
      this.positions[i3 + 2] = pos.z + (this.rng.next() - 0.5) * 0.6;
      const angle = this.rng.next() * Math.PI * 2;
      const radial = this.rng.next() * speed;
      this.vel[i3] = Math.cos(angle) * radial;
      this.vel[i3 + 1] = up * (0.4 + this.rng.next());
      this.vel[i3 + 2] = Math.sin(angle) * radial;
      this.life[i] = life * (0.6 + this.rng.next() * 0.7);
      this.maxLife[i] = this.life[i];
      this.gravity[i] = gravity;
      this.baseColor[i3] = this.tmpColor.r;
      this.baseColor[i3 + 1] = this.tmpColor.g;
      this.baseColor[i3 + 2] = this.tmpColor.b;
      this.colors[i3] = this.tmpColor.r;
      this.colors[i3 + 1] = this.tmpColor.g;
      this.colors[i3 + 2] = this.tmpColor.b;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  smoke(pos) {
    this.spawnParticles(pos, 0x777777, 10, {
      speed: 1.5,
      up: 2.5,
      life: 1.6,
      gravity: -1.5,
    });
  }

  sparks(pos) {
    this.spawnParticles(pos, 0xffcc33, 14, {
      speed: 9,
      up: 4,
      life: 0.4,
      gravity: 14,
    });
  }

  explosion(pos) {
    this.spawnParticles(pos, 0xff7722, 55, {
      speed: 12,
      up: 7,
      life: 0.9,
      gravity: 6,
    });
    this.spawnParticles(pos, 0xffcc44, 30, {
      speed: 8,
      up: 5,
      life: 0.5,
      gravity: 4,
    });
    this.smoke(pos);
    this.flashLight(pos, 0xff9933, 60, 0.5);
    this.shake(0.9);
    this.game.audio?.sfx?.('explosion');
  }

  muzzleFlash(pos) {
    this.spawnParticles(pos, 0xffe9a8, 4, {
      speed: 3,
      up: 1,
      life: 0.08,
      gravity: 0,
    });
    this.flashLight(pos, 0xffe9a8, 8, 0.07);
  }

  flashLight(pos, color, intensity, duration) {
    const slot = this.lights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % MAX_LIGHTS;
    slot.light.position.set(pos.x, pos.y ?? 1.5, pos.z);
    slot.light.color.set(color);
    slot.light.intensity = intensity;
    slot.light.visible = true;
    slot.life = duration;
    slot.maxLife = duration;
  }

  tracer(from, to) {
    if (!from || !to) return;
    const slot = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % MAX_TRACERS;
    const attr = slot.line.geometry.attributes.position;
    attr.setXYZ(0, from.x, from.y ?? 1.4, from.z);
    attr.setXYZ(1, to.x, to.y ?? 1.2, to.z);
    attr.needsUpdate = true;
    slot.line.material.opacity = 0.9;
    slot.line.visible = true;
    slot.life = 0.09;
  }

  shake(magnitude) {
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
  }

  damageNumber(pos, amount) {
    if (!this.damageLayer || !this.game.camera) return;
    if (typeof window === 'undefined') return;
    this.tmpVec.set(pos.x, (pos.y ?? 1.5) + 1.2, pos.z);
    this.tmpVec.project(this.game.camera);
    if (this.tmpVec.z > 1) return;
    const x = (this.tmpVec.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.tmpVec.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = 'damage-number';
    el.textContent = String(Math.round(amount));
    el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    this.damageLayer.appendChild(el);
    this.damageNumbers.push({ el, life: 0.8, x, y });
  }

  update(dt) {
    this.time += dt;
    // Particles: integrate, fade by shrinking toward black, park dead ones
    // far below the world. One buffer upload per frame.
    let anyAlive = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      anyAlive = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.positions[i3 + 1] = -9999;
        this.colors[i3] = 0;
        this.colors[i3 + 1] = 0;
        this.colors[i3 + 2] = 0;
        continue;
      }
      this.vel[i3 + 1] -= this.gravity[i] * dt;
      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.positions[i3 + 1] < 0.05) {
        this.positions[i3 + 1] = 0.05;
        this.vel[i3 + 1] *= -0.3;
      }
      const fade = this.life[i] / this.maxLife[i];
      this.colors[i3] = this.baseColor[i3] * fade;
      this.colors[i3 + 1] = this.baseColor[i3 + 1] * fade;
      this.colors[i3 + 2] = this.baseColor[i3 + 2] * fade;
    }
    if (anyAlive) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }

    for (const slot of this.lights) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.light.visible = false;
        slot.light.intensity = 0;
      } else {
        slot.light.intensity *= Math.max(0, slot.life / slot.maxLife);
      }
    }

    for (const slot of this.tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.line.visible = false;
        slot.line.material.opacity = 0;
      } else {
        slot.line.material.opacity = slot.life / 0.09 * 0.9;
      }
    }

    // Damage numbers rise and fade; removal is batched here, never during
    // a layout read.
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.life -= dt;
      if (d.life <= 0) {
        d.el.remove();
        this.damageNumbers.splice(i, 1);
        continue;
      }
      const rise = (0.8 - d.life) * 45;
      d.el.style.transform =
        `translate(${d.x.toFixed(0)}px, ${(d.y - rise).toFixed(0)}px)`;
      d.el.style.opacity = Math.min(1, d.life / 0.3).toFixed(2);
    }

    // Screen shake: main.js positions the camera fresh every frame BEFORE
    // this update runs, so the offset here is purely additive — there is
    // no previous offset left on the camera to subtract (subtracting one
    // would shift the camera away from its true position each frame).
    const camera = this.game.camera;
    if (camera && this.shakeMagnitude > 0.001) {
      this.shakeMagnitude *= Math.pow(0.02, dt);
      const m = this.shakeMagnitude;
      this.shakeOffset.set(
        (this.rng.next() - 0.5) * 2 * m,
        (this.rng.next() - 0.5) * 2 * m * 0.7,
        (this.rng.next() - 0.5) * 2 * m,
      );
      camera.position.add(this.shakeOffset);
    }
  }
}
