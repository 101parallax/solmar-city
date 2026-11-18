// Pedestrians: walk sidewalk loops on the road graph, idle, flee threats, and
// fall down (then get up and run) when hit by a car. Non-graphic: no blood,
// no ragdoll — the fall is a simple tip-over and recovery.
// Threats arrive two ways: world.alerts [{x, z, radius}] pushed by combat, and
// fast vehicles seen directly. Crimes are reported via world.onCrime(type, pos)
// — wanted logic lives in systems/wanted.js, never here.
import * as THREE from 'three';
import { randomName, randomPedType, pick } from '../data/people.js';
import { PEDS } from '../config.js';
import { adaptGraph, SIDEWALK_OFFSET, angleDiff, clamp, lerp } from './graph.js';

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

// Low-poly person, built facing +Z. Returns pivots for walk animation.
export function createPersonMesh(opts = {}) {
  const h = opts.height || 1.75;
  const s = h / 1.75;
  const group = new THREE.Group();
  const shirt = lambert(opts.shirt ?? 0x3a5f8a);
  const pants = lambert(opts.pants ?? 0x2a2f36);
  const skin = lambert(opts.skin ?? 0xe8b88a);
  const hairMat = lambert(opts.hair ?? 0x2a1a10);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.58 * s, 0.24 * s), shirt);
  torso.position.y = 1.18 * s;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28 * s, 0.3 * s, 0.26 * s), skin);
  head.position.y = 1.66 * s;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.12 * s, 0.28 * s), hairMat);
  hair.position.y = 1.82 * s;
  group.add(torso, head, hair);

  function limb(mat, w, len, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    mesh.position.y = -len / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  const legL = limb(pants, 0.16 * s, 0.88 * s, -0.11 * s, 0.9 * s);
  const legR = limb(pants, 0.16 * s, 0.88 * s, 0.11 * s, 0.9 * s);
  const armL = limb(shirt, 0.12 * s, 0.7 * s, -0.28 * s, 1.42 * s);
  const armR = limb(shirt, 0.12 * s, 0.7 * s, 0.28 * s, 1.42 * s);
  return { group, torso, head, legL, legR, armL, armR };
}

const STATE_WALK = 'walk';
const STATE_IDLE = 'idle';
const STATE_FLEE = 'flee';
const STATE_DOWN = 'down';

class Ped {
  constructor(scene, graph, rng, x, z) {
    this.graph = graph;
    this.rng = rng;
    this.type = randomPedType(rng);
    this.name = randomName(rng);
    this.x = x;
    this.z = z;
    this.heading = rng() * Math.PI * 2;
    this.state = STATE_WALK;
    this.stateTime = 0;
    this.speed = 0;
    this.phase = rng() * Math.PI * 2;
    this.side = rng() < 0.5 ? 1 : -1; // which sidewalk side of the road
    this.node = graph ? graph.nearestNode(x, z) : -1;
    this.target = this.pickNextTarget();
    this.fleeFrom = null;
    this.shirt = pick(this.type.shirts, rng);
    this.parts = createPersonMesh({
      shirt: this.shirt,
      pants: pick(this.type.pants, rng),
      skin: pick(this.type.skins, rng),
      height: this.type.height,
    });
    this.mesh = this.parts.group;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = this.heading;
    if (scene) scene.add(this.mesh);
    this.scene = scene;
  }

  // Next sidewalk waypoint: a random neighbor node, offset to the sidewalk.
  pickNextTarget() {
    if (!this.graph || this.node < 0) {
      const a = this.rng() * Math.PI * 2;
      const r = 20 + this.rng() * 40;
      return { x: this.x + Math.sin(a) * r, z: this.z + Math.cos(a) * r };
    }
    const idx = this.graph.nodes.findIndex((n) => n.id === this.node);
    const nbs = this.graph.neighbors[idx] || [];
    if (nbs.length === 0) return { x: this.x, z: this.z };
    const nextIdx = nbs[Math.floor(this.rng() * nbs.length)];
    const next = this.graph.nodes[nextIdx];
    const cur = this.graph.nodePos(this.node);
    const dx = next.x - cur.x;
    const dz = next.z - cur.z;
    const len = Math.hypot(dx, dz) || 1;
    const off = SIDEWALK_OFFSET * this.side;
    this.node = next.id;
    return {
      x: next.x + (-dz / len) * off,
      z: next.z + (dx / len) * off,
    };
  }

  fleeFromPoint(x, z) {
    if (this.state === STATE_DOWN) return;
    this.state = STATE_FLEE;
    this.stateTime = 0;
    this.fleeFrom = { x, z };
    // Run to a SIDEWALK point roughly away from the threat (sampled edges,
    // sidewalk offset). Fleeing to a road node made peds sprint down the
    // middle of the street and get hit again by the next car.
    if (this.graph) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < 8; i += 1) {
        const edge = this.graph.randomEdge(this.rng);
        const side = this.rng() < 0.5 ? 1 : -1;
        const p = this.graph.edgePoint(edge, this.rng(), SIDEWALK_OFFSET * side);
        const away = (p.x - x) * (this.x - x) + (p.z - z) * (this.z - z);
        const near = -Math.hypot(p.x - this.x, p.z - this.z);
        const score = away + near * 10;
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      if (best) {
        this.node = this.graph.nearestNode(best.x, best.z);
        this.target = { x: best.x, z: best.z };
      }
    } else {
      const a = Math.atan2(this.x - x, this.z - z);
      this.target = { x: this.x + Math.sin(a) * 40, z: this.z + Math.cos(a) * 40 };
    }
  }

  knockDown() {
    if (this.state === STATE_DOWN) return;
    this.state = STATE_DOWN;
    this.stateTime = 0;
    this.speed = 0;
  }

  update(dt, world) {
    this.stateTime += dt;
    const walking = this.state === STATE_WALK;
    const fleeing = this.state === STATE_FLEE;
    const down = this.state === STATE_DOWN;

    if (down) {
      // Tip over, lie still briefly, then get up and run.
      const t = clamp(this.stateTime / 0.4, 0, 1);
      this.mesh.rotation.x = -Math.PI / 2 * t * (this.stateTime < 1.2 ? 1 : Math.max(0, 1 - (this.stateTime - 1.2) / 0.4));
      if (this.stateTime > 1.6) {
        this.mesh.rotation.x = 0;
        this.state = STATE_WALK; // fleeFromPoint ignores DOWN state
        this.fleeFromPoint(this.x + 1, this.z);
      }
      return;
    }

    if (this.state === STATE_IDLE) {
      this.speed = lerp(this.speed, 0, Math.min(1, dt * 8));
      if (this.stateTime > 2 + this.rng() * 4) {
        this.state = STATE_WALK;
        this.stateTime = 0;
        this.target = this.pickNextTarget();
      }
    } else {
      const targetSpeed = fleeing ? this.type.runSpeed : this.type.walkSpeed;
      this.speed = lerp(this.speed, targetSpeed, Math.min(1, dt * 4));
      const dx = this.target.x - this.x;
      const dz = this.target.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) {
        if (fleeing) {
          if (this.stateTime > 4) {
            this.state = STATE_WALK;
            this.stateTime = 0;
          }
          this.target = this.pickNextTarget();
        } else if (this.rng() < 0.06) {
          this.state = STATE_IDLE;
          this.stateTime = 0;
        } else {
          this.target = this.pickNextTarget();
        }
      } else {
        const want = Math.atan2(dx, dz);
        this.heading += angleDiff(want, this.heading) * Math.min(1, dt * 6);
      }
      if (fleeing && this.stateTime > 8) {
        this.state = STATE_WALK;
        this.stateTime = 0;
      }
    }

    // Threat scan: alerts from combat + fast vehicles nearby. The speed
    // threshold (15 m/s) sits above traffic cruise speed (max ~14), so
    // normal traffic never spooks a crowd — only a speeding car does.
    if (!fleeing && world) {
      const alerts = world.alerts || [];
      for (const a of alerts) {
        const d2 = (a.x - this.x) ** 2 + (a.z - this.z) ** 2;
        if (d2 < (a.radius || 30) ** 2) {
          this.fleeFromPoint(a.x, a.z);
          break;
        }
      }
      if (this.state !== STATE_FLEE) {
        for (const v of world.vehicles || []) {
          if (Math.abs(v.speed) < 15) continue;
          const d2 = (v.x - this.x) ** 2 + (v.z - this.z) ** 2;
          if (d2 < 100) {
            this.fleeFromPoint(v.x, v.z);
            break;
          }
        }
      }
    }

    // Hit by a car? Fall down, then get up and flee. Only the PLAYER's car
    // reports the crime — AI traffic hitting a ped is emergent chaos, not
    // the player's wanted level. Hit test is a box around the car (not a
    // circle), so a car passing a ped on the sidewalk does not flatten them.
    if (world) {
      for (const v of world.vehicles || []) {
        if (Math.abs(v.speed) < 2) continue;
        const dx = this.x - v.x;
        const dz = this.z - v.z;
        const fx = Math.sin(v.heading);
        const fz = Math.cos(v.heading);
        const fwd = dx * fx + dz * fz;
        const lat = Math.abs(dx * -fz + dz * fx);
        const halfLen = v.type.length / 2 + 0.5;
        const halfWid = v.type.width / 2 + 0.6;
        if (fwd > -halfLen && fwd < halfLen && lat < halfWid) {
          this.knockDown();
          if (world.player?.vehicle === v && typeof world.onCrime === 'function') {
            world.onCrime('runover', { x: this.x, z: this.z });
          }
          break;
        }
      }
    }

    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    if (world && typeof world.collideCircle === 'function') {
      const fixed = world.collideCircle(this.x, this.z, 0.5);
      if (fixed) {
        this.x = fixed.x;
        this.z = fixed.z;
      }
    }

    // Walk-cycle animation.
    this.phase += this.speed * dt * 3.2;
    const swing = clamp(this.speed / 2, 0, 1) * 0.65;
    const s = Math.sin(this.phase);
    this.parts.legL.rotation.x = s * swing;
    this.parts.legR.rotation.x = -s * swing;
    this.parts.armL.rotation.x = -s * swing * 0.7;
    this.parts.armR.rotation.x = s * swing * 0.7;
    this.parts.group.rotation.x = fleeing ? 0.12 : 0;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  destroy() {
    if (this.scene) this.scene.remove(this.mesh);
    this.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}

export class PedestrianManager {
  // `graph` is the raw RoadGraph (or null); it is adapted internally.
  constructor(scene, graph, rng, opts = {}) {
    this.scene = scene;
    this.graph = graph ? adaptGraph(graph) : null;
    this.rng = rng;
    this.target = opts.target ?? PEDS.active;
    this.spawnRadius = opts.spawnRadius ?? 130;
    this.despawnRadius = opts.despawnRadius ?? PEDS.despawnDistance;
    this.peds = [];
  }

  get count() {
    return this.peds.length;
  }

  spawnAt(x, z) {
    const ped = new Ped(this.scene, this.graph, this.rng, x, z);
    this.peds.push(ped);
    return ped;
  }

  // A driver dragged out of a stolen car: spawns fleeing on the spot.
  spawnFleeing(x, z) {
    const ped = this.spawnAt(x, z);
    ped.fleeFromPoint(x, z);
    return ped;
  }

  spawnNearPlayer(px, pz) {
    if (!this.graph) {
      const a = this.rng() * Math.PI * 2;
      const r = 40 + this.rng() * (this.spawnRadius - 40);
      return this.spawnAt(px + Math.sin(a) * r, pz + Math.cos(a) * r);
    }
    // Pick a node inside the spawn band, then a sidewalk point on one of its edges.
    for (let tries = 0; tries < 12; tries += 1) {
      const edge = this.graph.randomEdge(this.rng);
      const t = this.rng();
      const side = this.rng() < 0.5 ? 1 : -1;
      const p = this.graph.edgePoint(edge, t, SIDEWALK_OFFSET * side);
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d > 15 && d < this.spawnRadius) return this.spawnAt(p.x, p.z);
    }
    return null;
  }

  update(dt, world) {
    const px = world?.player?.x ?? 0;
    const pz = world?.player?.z ?? 0;
    // Streaming: cull the far, top up near the player.
    for (let i = this.peds.length - 1; i >= 0; i -= 1) {
      const p = this.peds[i];
      if (Math.hypot(p.x - px, p.z - pz) > this.despawnRadius) {
        p.destroy();
        this.peds.splice(i, 1);
      }
    }
    let guard = 0;
    while (this.peds.length < this.target && guard < 6) {
      guard += 1;
      if (!this.spawnNearPlayer(px, pz)) break;
    }
    for (const p of this.peds) p.update(dt, world);
  }

  destroy() {
    for (const p of this.peds) p.destroy();
    this.peds = [];
  }
}
