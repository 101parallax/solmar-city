// Collectibles: 20 Sun Shells hidden around the city. Positions come from
// CITY_DATA when it provides them, otherwise from a fixed fallback list so
// the system still works standalone. Each shell is a small glowing mesh that
// bobs in place; walking close picks it up for +1 shell and a little REP.

import * as THREE from 'three';
import { CITY_DATA } from '../data/city.js';
import { computeCompletion } from './save.js';

export class Collectibles {
  static PICKUP_RADIUS = 3;
  static REP_PER_SHELL = 5;
  static TOTAL = 20;

  // Fixed fallback positions (road grid + beach edge) used only when the
  // city data does not list shells.
  static FALLBACK_SHELLS = [
    { x: -245, z: 245 }, { x: -175, z: 245 }, { x: -105, z: 245 }, { x: -35, z: 245 },
    { x: 35, z: 245 }, { x: 105, z: 245 }, { x: 175, z: 245 }, { x: 245, z: 245 },
    { x: -245, z: -35 }, { x: -245, z: 105 }, { x: 245, z: -105 }, { x: 245, z: 35 },
    { x: -175, z: -175 }, { x: -35, z: -175 }, { x: 105, z: -175 }, { x: 245, z: -245 },
    { x: -105, z: 35 }, { x: 35, z: -35 }, { x: 175, z: 105 }, { x: -35, z: 175 },
  ];

  constructor(game) {
    this.game = game;
    this.state = game.state;
    this._time = 0;
    this.shells = this._loadPositions();
    this._buildMeshes();
  }

  _loadPositions() {
    const fromCity = CITY_DATA && (CITY_DATA.sunShells || CITY_DATA.shells);
    const list = Array.isArray(fromCity) && fromCity.length > 0
      ? fromCity
      : Collectibles.FALLBACK_SHELLS;
    return list.slice(0, Collectibles.TOTAL).map((entry, i) => ({
      id: entry.id || `shell-${i + 1}`,
      x: entry.x,
      z: entry.z,
      collected: false,
      mesh: null,
    }));
  }

  _buildMeshes() {
    if (!this.game.scene) return;
    const geometry = new THREE.SphereGeometry(0.55, 10, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffb347,
      emissive: 0xff8c1a,
      emissiveIntensity: 0.9,
      roughness: 0.35,
    });
    for (const shell of this.shells) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(1, 0.45, 1);
      mesh.position.set(shell.x, 0.7, shell.z);
      this.game.scene.add(mesh);
      shell.mesh = mesh;
    }
  }

  update(dt) {
    this._time += dt;
    // Sync with state every frame so a loaded save hides collected shells
    // even though construction happened before the load.
    const collectedIds = this.state.shellsCollected || [];
    const pos = this.state.playerPos;
    for (const shell of this.shells) {
      if (!shell.collected && collectedIds.includes(shell.id)) {
        shell.collected = true;
        if (shell.mesh) shell.mesh.visible = false;
      }
      if (shell.collected) continue;
      if (shell.mesh) {
        shell.mesh.position.y = 0.7 + Math.sin(this._time * 2 + shell.x) * 0.15;
        shell.mesh.rotation.y += dt * 1.5;
      }
      if (!pos) continue;
      const dx = pos.x - shell.x;
      const dz = pos.z - shell.z;
      if (dx * dx + dz * dz < Collectibles.PICKUP_RADIUS * Collectibles.PICKUP_RADIUS) {
        this._collect(shell);
      }
    }
  }

  _collect(shell) {
    shell.collected = true;
    if (shell.mesh) shell.mesh.visible = false;
    if (!this.state.shellsCollected.includes(shell.id)) {
      this.state.shellsCollected.push(shell.id);
    }
    this.state.shells = this.state.shellsCollected.length;
    this.state.completion = computeCompletion(this.state);
    if (this.game.rep) this.game.rep.addRep(Collectibles.REP_PER_SHELL);
    if (this.game.hud) {
      this.game.hud.showEventPopup(`SUN SHELL ${this.count()}/${Collectibles.TOTAL}`);
    }
    this._sfx('pickup');
    if (this.game.events) {
      this.game.events.emit('shellCollected', { id: shell.id, count: this.count() });
    }
  }

  count() {
    return this.state.shells;
  }

  // New Game: every shell is back in the world.
  reset() {
    for (const shell of this.shells) {
      shell.collected = false;
      if (shell.mesh) shell.mesh.visible = true;
    }
  }

  remaining() {
    return Collectibles.TOTAL - this.count();
  }

  positions() {
    return this.shells.map((shell) => ({
      id: shell.id,
      x: shell.x,
      z: shell.z,
      collected: shell.collected,
    }));
  }

  _sfx(name) {
    try {
      if (this.game.audio) this.game.audio.sfx(name);
    } catch (err) {
      // Audio is cosmetic; a missing sound must never break a pickup.
    }
  }
}
