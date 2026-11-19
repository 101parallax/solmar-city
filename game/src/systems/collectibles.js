// Sun Shells: 20 glowing shells hidden across Solmar City.
// Each pickup grants +1 shell, a small reputation bonus, a popup and a
// completion update. Positions come from the city data when available,
// otherwise from a fixed fallback list so the set is always complete.

import * as THREE from 'three';
import { CITY_DATA } from '../data/city.js';
import { computeCompletion } from './save.js';

const SHELL_REP = 5;
const PICKUP_RADIUS = 3.5;
const SHELL_COUNT = 20;

// Fixed fallback positions (beach row, harbor row, parks and corners),
// all on the road grid inside -280..280.
const FALLBACK_SHELLS = [
  { id: 'shell-1', x: -210, z: 280 },
  { id: 'shell-2', x: -140, z: 280 },
  { id: 'shell-3', x: -70, z: 280 },
  { id: 'shell-4', x: 0, z: 280 },
  { id: 'shell-5', x: 70, z: 280 },
  { id: 'shell-6', x: 140, z: 280 },
  { id: 'shell-7', x: 210, z: 280 },
  { id: 'shell-8', x: -140, z: -280 },
  { id: 'shell-9', x: 0, z: -280 },
  { id: 'shell-10', x: 140, z: -280 },
  { id: 'shell-11', x: -210, z: 0 },
  { id: 'shell-12', x: -70, z: -70 },
  { id: 'shell-13', x: 70, z: 70 },
  { id: 'shell-14', x: 210, z: -70 },
  { id: 'shell-15', x: 0, z: -210 },
  { id: 'shell-16', x: -210, z: 210 },
  { id: 'shell-17', x: 210, z: 210 },
  { id: 'shell-18', x: 0, z: 140 },
  { id: 'shell-19', x: -140, z: -210 },
  { id: 'shell-20', x: 140, z: -210 },
];

export class Collectibles {
  constructor(game) {
    this.game = game;
    this.shells = this.resolveShells();
    this.meshes = new Map();
    this.time = 0;
    this.buildMeshes();
  }

  // Prefer the city data; fall back to the fixed list when it is absent
  // or empty so the shell set is always exactly 20 strong.
  resolveShells() {
    const fromCity = CITY_DATA?.shells;
    if (Array.isArray(fromCity) && fromCity.length > 0) {
      return fromCity.map((shell, index) => ({
        id: shell.id ?? `shell-${index + 1}`,
        x: shell.x ?? 0,
        z: shell.z ?? 0,
      }));
    }
    return FALLBACK_SHELLS.map((shell) => ({ ...shell }));
  }

  // One shared glowing sphere per shell. Visuals are best-effort: any
  // failure here must never break the pickup logic below.
  buildMeshes() {
    try {
      const scene = this.game.scene;
      if (!scene || typeof scene.add !== 'function') return;
      const geometry = new THREE.SphereGeometry(0.5, 12, 8);
      const material = new THREE.MeshStandardMaterial({
        color: 0xffb347,
        emissive: 0xff8c1a,
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.1,
      });
      for (const shell of this.shells) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(shell.x, 1, shell.z);
        mesh.visible = !this.isCollected(shell.id);
        scene.add(mesh);
        this.meshes.set(shell.id, mesh);
      }
    } catch (err) {
      // Meshes are optional decoration; pickups work without them.
    }
  }

  // True when the shell id is already in the collected list.
  isCollected(id) {
    return (this.game.state.shellsCollected ?? []).includes(id);
  }

  // Check the player distance each frame; pick up at most one shell
  // per frame so rapid movement cannot swallow two at once.
  update(dt) {
    const state = this.game.state;
    if (state.paused) return;
    // Gentle bob on simulation time (never wall-clock time) so the
    // shells read as alive without breaking determinism.
    this.time += dt;
    for (let i = 0; i < this.shells.length; i += 1) {
      const mesh = this.meshes.get(this.shells[i].id);
      if (mesh?.visible) mesh.position.y = 1 + Math.sin(this.time * 2 + i * 0.7) * 0.15;
    }
    const pos = state.playerPos;
    if (!pos) return;
    for (const shell of this.shells) {
      if (this.isCollected(shell.id)) continue;
      const dx = shell.x - pos.x;
      const dz = shell.z - pos.z;
      if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      state.shellsCollected.push(shell.id);
      state.shells = state.shellsCollected.length;
      const mesh = this.meshes.get(shell.id);
      if (mesh) mesh.visible = false;
      this.game.rep?.addRep?.(SHELL_REP);
      state.completion = computeCompletion(state);
      this.game.hud?.showEventPopup?.(`Sun Shell ${state.shells} / ${this.shells.length}`);
      this.game.audio?.sfx?.('pickup');
      this.game.events?.emit?.('shellCollected', { id: shell.id, count: state.shells });
      break;
    }
  }

  // Number of shells collected so far.
  count() {
    return this.game.state.shellsCollected?.length ?? 0;
  }

  // Number of shells still out in the city.
  remaining() {
    return this.shells.length - this.count();
  }

  // Positions of the shells still to collect (for the radar and map).
  positions() {
    return this.shells
      .filter((shell) => !this.isCollected(shell.id))
      .map((shell) => ({ id: shell.id, x: shell.x, z: shell.z }));
  }

  // Total shells in this city (always 20).
  total() {
    return this.shells.length;
  }

  // Reset every shell to uncollected (new game). Restores the meshes
  // and recomputes completion from the fresh state.
  reset() {
    this.game.state.shellsCollected = [];
    this.game.state.shells = 0;
    for (const mesh of this.meshes.values()) mesh.visible = true;
    this.game.state.completion = computeCompletion(this.game.state);
  }
}
