// Pedestrian navigation graph: nodes sit on sidewalk corners around every
// intersection, edges run along the sidewalks and across crosswalks, so
// pedestrians walk on pavements instead of through traffic.
import { CITY_DATA } from '../data/city.js';
import { CONFIG } from '../config.js';

export class NavGraph {
  constructor() {
    const off = CONFIG.city.roadWidth / 2 + CONFIG.city.sidewalkWidth / 2;
    this.nodes = [];
    this.adj = new Map();
    this.index = new Map();
    const xs = CITY_DATA.roads.vertical;
    const zs = CITY_DATA.roads.horizontal;
    const addNode = (x, z, key) => {
      const id = this.nodes.length;
      this.nodes.push({ id, x, z });
      this.adj.set(id, []);
      this.index.set(key, id);
      return id;
    };
    const link = (a, b) => {
      if (a === undefined || b === undefined || a === b) return;
      this.adj.get(a).push(b);
      this.adj.get(b).push(a);
    };
    // One node per sidewalk corner of every intersection.
    for (let ix = 0; ix < xs.length; ix++) {
      for (let iz = 0; iz < zs.length; iz++) {
        const corners = [
          addNode(xs[ix] - off, zs[iz] - off, `${ix},${iz},nw`),
          addNode(xs[ix] + off, zs[iz] - off, `${ix},${iz},ne`),
          addNode(xs[ix] - off, zs[iz] + off, `${ix},${iz},sw`),
          addNode(xs[ix] + off, zs[iz] + off, `${ix},${iz},se`),
        ];
        // Crosswalks: the four corners of one intersection connect.
        for (let i = 0; i < corners.length; i++) {
          for (let j = i + 1; j < corners.length; j++) link(corners[i], corners[j]);
        }
      }
    }
    // Sidewalk runs along each road, on both sides.
    for (let ix = 0; ix < xs.length; ix++) {
      for (let iz = 0; iz < zs.length - 1; iz++) {
        link(this.index.get(`${ix},${iz},nw`), this.index.get(`${ix},${iz + 1},nw`));
        link(this.index.get(`${ix},${iz},sw`), this.index.get(`${ix},${iz + 1},sw`));
        link(this.index.get(`${ix},${iz},ne`), this.index.get(`${ix},${iz + 1},ne`));
        link(this.index.get(`${ix},${iz},se`), this.index.get(`${ix},${iz + 1},se`));
      }
    }
    for (let iz = 0; iz < zs.length; iz++) {
      for (let ix = 0; ix < xs.length - 1; ix++) {
        link(this.index.get(`${ix},${iz},nw`), this.index.get(`${ix + 1},${iz},nw`));
        link(this.index.get(`${ix},${iz},ne`), this.index.get(`${ix + 1},${iz},ne`));
        link(this.index.get(`${ix},${iz},sw`), this.index.get(`${ix + 1},${iz},sw`));
        link(this.index.get(`${ix},${iz},se`), this.index.get(`${ix + 1},${iz},se`));
      }
    }
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

  // A random sidewalk node, for spawning pedestrians across the city.
  randomNode(rng) {
    return rng.pick(this.nodes);
  }

  // Waypoints along sidewalks from (from) to (to), start and end included.
  path(from, to) {
    const start = this.nearestNode(from.x, from.z);
    const goal = this.nearestNode(to.x, to.z);
    if (start.id === goal.id) return [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
    const prev = new Map([[start.id, null]]);
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift();
      if (id === goal.id) break;
      for (const next of this.adj.get(id)) {
        if (!prev.has(next)) {
          prev.set(next, id);
          queue.push(next);
        }
      }
    }
    const out = [{ x: from.x, z: from.z }];
    let cursor = goal.id;
    const chain = [];
    while (cursor !== null && cursor !== undefined) {
      chain.push(this.nodes[cursor]);
      cursor = prev.get(cursor);
    }
    chain.reverse();
    for (const node of chain) out.push({ x: node.x, z: node.z });
    out.push({ x: to.x, z: to.z });
    return out;
  }
}
