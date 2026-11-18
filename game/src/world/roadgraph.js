// Road graph for vehicle AI: nodes are the 9x9 road intersections, edges run
// along the grid roads. Traffic, police and mission chases all route through
// it with a simple breadth-first search.
import { CITY_DATA } from '../data/city.js';

export class RoadGraph {
  constructor() {
    this.xs = CITY_DATA.roads.vertical;
    this.zs = CITY_DATA.roads.horizontal;
    this.nodes = [];
    this.index = new Map();
    for (let ix = 0; ix < this.xs.length; ix++) {
      for (let iz = 0; iz < this.zs.length; iz++) {
        const id = ix * this.zs.length + iz;
        this.nodes.push({ id, x: this.xs[ix], z: this.zs[iz], ix, iz });
        this.index.set(`${ix},${iz}`, id);
      }
    }
  }

  neighbors(node) {
    const out = [];
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of steps) {
      const id = this.index.get(`${node.ix + dx},${node.iz + dz}`);
      if (id !== undefined) out.push(this.nodes[id]);
    }
    return out;
  }

  nearestNode(x, z) {
    let best = this.nodes[0];
    let bestD = Infinity;
    for (const node of this.nodes) {
      const d = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = node;
      }
    }
    return best;
  }

  // Closest point on any road centreline to (x, z).
  nearestRoad(x, z) {
    let bestX = this.xs[0];
    let bestDx = Infinity;
    for (const gx of this.xs) {
      const d = Math.abs(gx - x);
      if (d < bestDx) {
        bestDx = d;
        bestX = gx;
      }
    }
    let bestZ = this.zs[0];
    let bestDz = Infinity;
    for (const gz of this.zs) {
      const d = Math.abs(gz - z);
      if (d < bestDz) {
        bestDz = d;
        bestZ = gz;
      }
    }
    return bestDx <= bestDz ? { x: bestX, z } : { x, z: bestZ };
  }

  // Waypoints from (from) to (to) along the road grid, start and end included.
  route(from, to) {
    const start = this.nearestNode(from.x, from.z);
    const goal = this.nearestNode(to.x, to.z);
    if (start.id === goal.id) return [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
    const prev = new Map([[start.id, null]]);
    const queue = [start];
    while (queue.length) {
      const node = queue.shift();
      if (node.id === goal.id) break;
      for (const next of this.neighbors(node)) {
        if (!prev.has(next.id)) {
          prev.set(next.id, node.id);
          queue.push(next);
        }
      }
    }
    const path = [{ x: from.x, z: from.z }];
    let cursor = goal.id;
    const chain = [];
    while (cursor !== null && cursor !== undefined) {
      chain.push(this.nodes[cursor]);
      cursor = prev.get(cursor);
    }
    chain.reverse();
    for (const node of chain) path.push({ x: node.x, z: node.z });
    path.push({ x: to.x, z: to.z });
    return path;
  }

  // A random multi-leg route for ambient traffic.
  randomRoute(rng) {
    const a = rng.pick(this.nodes);
    let b = rng.pick(this.nodes);
    let guard = 0;
    while (b.id === a.id && guard++ < 8) b = rng.pick(this.nodes);
    return this.route({ x: a.x, z: a.z }, { x: b.x, z: b.z });
  }

  // A random point on a random road, for spawning parked cars and pickups.
  randomPointOnRoad(rng) {
    const node = rng.pick(this.nodes);
    const along = rng.chance(0.5);
    const offset = rng.range(-28, 28);
    const clamp = (v) => Math.min(280, Math.max(-280, v));
    return along
      ? { x: node.x, z: clamp(node.z + offset) }
      : { x: clamp(node.x + offset), z: node.z };
  }
}
