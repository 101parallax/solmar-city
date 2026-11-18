import * as THREE from 'three';

// Particle bursts, smoke, sparks, explosions, tracers, screen shake and
// floating damage numbers. All particles live in one pooled THREE.Points
// cloud, so spawning an effect never allocates geometry or materials.
export class Effects {
  constructor(game) {
    this.game = game;
    this.maxParticles = 600;
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.velocities = new Float32Array(this.maxParticles * 3);
    this.life = new Float32Array(this.maxParticles);
    this.gravity = new Float32Array(this.maxParticles);
    this.cursor = 0;
    for (let i = 0; i < this.maxParticles; i++) this.positions[i * 3 + 1] = -999;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.45, vertexColors: true, transparent: true,
      opacity: 0.95, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    game.scene.add(this.points);
    // Small pool of reusable point lights for explosions and muzzle flashes.
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffaa33, 0, 32, 1.8);
      light.visible = false;
      game.scene.add(light);
      this.lights.push({ light, life: 0, peak: 0, duration: 1 });
    }
    // Reusable tracer lines (muzzle to impact point).
    this.tracers = [];
    for (let i = 0; i < 10; i++) {
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(),
      ]);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffe9a3, transparent: true, opacity: 0,
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.visible = false;
      line.frustumCulled = false;
      game.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerCursor = 0;
    this.shakeMagnitude = 0;
    this.damageNumbers = [];
    this.damageLayer = null;
    this.tmpColor = new THREE.Color();
    this.tmpVector = new THREE.Vector3();
  }

  spawnParticles(pos, color, count, opts = {}) {
    const speed = opts.speed ?? 6;
    const up = opts.up ?? 3;
    const life = opts.life ?? 0.7;
    const gravity = opts.gravity ?? 9;
    const spread = opts.spread ?? 1;
    const rng = this.game.rng;
    this.tmpColor.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.maxParticles;
      const i3 = i * 3;
      this.positions[i3] = pos.x + (rng.next() - 0.5) * 0.4;
      this.positions[i3 + 1] = (pos.y ?? 1) + (rng.next() - 0.5) * 0.4;
      this.positions[i3 + 2] = pos.z + (rng.next() - 0.5) * 0.4;
      const angle = rng.next() * Math.PI * 2;
      const radial = rng.next() * speed * spread;
      this.velocities[i3] = Math.cos(angle) * radial;
      this.velocities[i3 + 1] = up * (0.4 + rng.next() * 0.9);
      this.velocities[i3 + 2] = Math.sin(angle) * radial;
      this.colors[i3] = this.tmpColor.r;
      this.colors[i3 + 1] = this.tmpColor.g;
      this.colors[i3 + 2] = this.tmpColor.b;
      this.life[i] = life * (0.6 + rng.next() * 0.7);
      this.gravity[i] = gravity;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  smoke(pos) {
    this.spawnParticles(pos, 0x555560, 10, { speed: 1.5, up: 2.2, life: 1.4, gravity: -1.5 });
  }

  sparks(pos) {
    this.spawnParticles(pos, 0xffc233, 14, { speed: 9, up: 4, life: 0.45, gravity: 14 });
  }

  explosion(pos) {
    this.spawnParticles(pos, 0xff7722, 60, { speed: 12, up: 7, life: 0.9, gravity: 6 });
    this.spawnParticles(pos, 0xffcc44, 30, { speed: 7, up: 5, life: 0.5, gravity: 4 });
    this.spawnParticles(pos, 0x333333, 24, { speed: 3, up: 4, life: 1.8, gravity: -1 });
    const slot = this.lights.find((entry) => entry.life <= 0) ?? this.lights[0];
    slot.light.position.set(pos.x, (pos.y ?? 1) + 1.5, pos.z);
    slot.light.color.set(0xff8830);
    slot.light.intensity = 220;
    slot.light.visible = true;
    slot.life = 0.35;
    slot.duration = 0.35;
    slot.peak = 220;
    this.shake(0.9);
  }

  muzzleFlash(pos) {
    this.spawnParticles(pos, 0xffdd66, 4, { speed: 2, up: 0.5, life: 0.12, gravity: 0 });
    const slot = this.lights.find((entry) => entry.life <= 0);
    if (!slot) return;
    slot.light.position.set(pos.x, pos.y ?? 1.4, pos.z);
    slot.light.color.set(0xffcc55);
    slot.light.intensity = 40;
    slot.light.visible = true;
    slot.life = 0.06;
    slot.duration = 0.06;
    slot.peak = 40;
  }

  tracer(from, to) {
    const entry = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    const positions = entry.line.geometry.attributes.position;
    positions.setXYZ(0, from.x, from.y ?? 1.4, from.z);
    positions.setXYZ(1, to.x, to.y ?? 1, to.z);
    positions.needsUpdate = true;
    entry.line.material.opacity = 0.9;
    entry.line.visible = true;
    entry.life = 0.07;
  }

  shake(magnitude) {
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
  }

  damageNumber(pos, amount) {
    if (!this.damageLayer) {
      this.damageLayer = document.getElementById('hud-damage-layer');
      if (!this.damageLayer) return;
    }
    const camera = this.game.camera;
    if (!camera) return;
    this.tmpVector.set(pos.x, pos.y ?? 1.5, pos.z).project(camera);
    if (this.tmpVector.z > 1) return;
    const x = (this.tmpVector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.tmpVector.y * 0.5 + 0.5) * window.innerHeight;
    if (this.damageNumbers.length > 14) {
      const old = this.damageNumbers.shift();
      old.el.remove();
    }
    const el = document.createElement('div');
    el.textContent = String(Math.round(amount));
    el.style.cssText = 'position:absolute;left:0;top:0;color:#ffd23f;font-weight:700;'
      + 'font-size:20px;text-shadow:0 2px 4px rgba(0,0,0,0.8);pointer-events:none;'
      + 'will-change:transform,opacity;';
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    this.damageLayer.appendChild(el);
    this.damageNumbers.push({ el, x, y, life: 0.8 });
  }

  update(dt) {
    // Particles: integrate, apply gravity, park dead ones below the world.
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.positions[i3 + 1] = -999;
        continue;
      }
      this.velocities[i3 + 1] -= this.gravity[i] * dt;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
      if (this.positions[i3 + 1] < 0.05) {
        this.positions[i3 + 1] = 0.05;
        this.velocities[i3 + 1] = 0;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    // Flash lights decay back to dark.
    for (const entry of this.lights) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      if (entry.life <= 0) {
        entry.light.visible = false;
        entry.light.intensity = 0;
      } else {
        entry.light.intensity = entry.peak * (entry.life / entry.duration);
      }
    }
    // Tracers fade out within a few frames.
    for (const entry of this.tracers) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      if (entry.life <= 0) {
        entry.line.visible = false;
        entry.line.material.opacity = 0;
      } else {
        entry.line.material.opacity = (entry.life / 0.07) * 0.9;
      }
    }
    // Screen shake: a decaying random offset on the camera. The main loop
    // repositions the camera every frame, so the offset never accumulates.
    if (this.shakeMagnitude > 0.001) {
      const camera = this.game.camera;
      if (camera) {
        const m = this.shakeMagnitude;
        const rng = this.game.rng;
        camera.position.x += (rng.next() - 0.5) * m * 0.6;
        camera.position.y += (rng.next() - 0.5) * m * 0.6;
      }
      this.shakeMagnitude = Math.max(0, this.shakeMagnitude - dt * 2.2);
    }
    // Floating damage numbers rise and fade (transform and opacity only,
    // so no layout work happens per frame).
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const item = this.damageNumbers[i];
      item.life -= dt;
      if (item.life <= 0) {
        item.el.remove();
        this.damageNumbers.splice(i, 1);
        continue;
      }
      item.y -= 34 * dt;
      item.el.style.transform = `translate(${item.x}px, ${item.y}px) translate(-50%, -50%)`;
      item.el.style.opacity = String(Math.min(1, item.life / 0.4));
    }
  }
}
