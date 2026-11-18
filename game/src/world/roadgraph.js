// The road graph of Solmar City: one shared graph for rendering, traffic AI, GPS
// routing on the radar, and spawn placement. Nodes are the 9x9 street intersections;
// edges are the street segments between them, each two lanes wide, right-hand traffic.
// Positions are world metres (X east, Z south); node index is row * 9 + col.

import { STREET_COORDS } from '../data/city.js';
import { CITY } from '../config.js';

export const GRID_N = 9;

/** Node index from grid coordinates. */
export function nodeIndex(col, row) {
  return row * GRID_N + col;
}

export class RoadGraph {
  constructor() {
    this.nodes = [];
    for (let row = 0; row < GRID_N; row++) {
      for (let col = 0; col < GRID_N; col++) {
        this.nodes.push({ x: STREET_COORDS[col], z: STREET_COORDS[row], col, row });
      }
    }
    // Adjacency: for each node, the list of {to, edge} neighbours.
    this.adj = this.nodes.map(() => []);
    this.edges = [];
    const addEdge = (a, b) => {
      const na = this.nodes[a];
      const nb = this.nodes[b];
      const length = Math.hypot(nb.x - na.x, nb.z - na.z);
      const edge = { a, b, length, lanes: 2 };
      const id = this.edges.length;
      this.edges.push(edge);
      this.adj[a].push({ to: b, edge: id });
      this.adj[b].push({ to: a, edge: id });
      return id;
    };
    for (let row = 0; row < GRID_N; row++) {
      for (let col = 0; col < GRID_N; col++) {
        if (col + 1 < GRID_N) addEdge(nodeIndex(col, row), nodeIndex(col + 1, row));
        if (row + 1 < GRID_N) addEdge(nodeIndex(col, row), nodeIndex(col, row + 1));
      }
    }
  }

  /** World position of a node index. */
  nodePos(index) {
    const n = this.nodes[index];
    return { x: n.x, z: n.z };
  }

  /** Index of the intersection nearest a world position (analytic: the grid is regular). */
  nearestNode(x, z) {
    const col = Math.max(0, Math.min(GRID_N - 1, Math.round((x + 280) / CITY.pitch)));
    const row = Math.max(0, Math.min(GRID_N - 1, Math.round((z + 280) / CITY.pitch)));
    return nodeIndex(col, row);
  }

  /** Shortest path between two node indices (A* on the grid). Returns node indices. */
  findPath(start, goal) {
    if (start === goal) return [start];
    const n = this.nodes.length;
    const gScore = new Float64Array(n).fill(Infinity);
    const cameFrom = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heuristic = (i) => {
      const a = this.nodes[i];
      const b = this.nodes[goal];
      return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    };
    // Open list as a small binary heap of [f, node]; the graph has 81 nodes.
    const heap = [];
    const push = (f, node) => {
      heap.push([f, node]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        const tmp = heap[p];
        heap[p] = heap[i];
        heap[i] = tmp;
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let smallest = i;
          if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
          if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r;
          if (smallest === i) break;
          const tmp = heap[smallest];
          heap[smallest] = heap[i];
          heap[i] = tmp;
          i = smallest;
        }
      }
      return top;
    };
    gScore[start] = 0;
    push(heuristic(start), start);
    while (heap.length > 0) {
      const [, current] = pop();
      if (closed[current]) continue;
      closed[current] = 1;
      if (current === goal) break;
      for (const { to, edge } of this.adj[current]) {
        if (closed[to]) continue;
        const tentative = gScore[current] + this.edges[edge].length;
        if (tentative < gScore[to]) {
          cameFrom[to] = current;
          gScore[to] = tentative;
          push(tentative + heuristic(to), to);
        }
      }
    }
    if (cameFrom[goal] === -1) return [];
    const path = [];
    let cur = goal;
    while (cur !== -1) {
      path.push(cur);
      cur = cameFrom[cur];
    }
    path.reverse();
    return path;
  }

  /**
   * A point along an edge, offset into the right-hand lane for the direction of
   * travel. t is 0..1 from edge.a to edge.b; flip reverses the travel direction.
   */
  lanePoint(edgeId, t, flip = false) {
    const edge = this.edges[edgeId];
    const from = this.nodes[flip ? edge.b : edge.a];
    const to = this.nodes[flip ? edge.a : edge.b];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    // Right-hand offset: perpendicular to travel. X east, Z south, so the
    // right side of direction (dx, dz) is (-dz, dx) normalised.
    const laneOffset = CITY.roadWidth / 4;
    const ox = (-dz / len) * laneOffset;
    const oz = (dx / len) * laneOffset;
    return {
      x: from.x + dx * t + ox,
      z: from.z + dz * t + oz,
      heading: Math.atan2(dx, dz),
    };
  }

  /** Heading (radians, atan2(dx, dz)) travelling from node a to node b. */
  headingBetween(a, b) {
    const na = this.nodes[a];
    const nb = this.nodes[b];
    return Math.atan2(nb.x - na.x, nb.z - na.z);
  }

  /** Edge id between two adjacent nodes, or -1 when they are not neighbours. */
  edgeBetween(a, b) {
    for (const { to, edge } of this.adj[a]) {
      if (to === b) return edge;
    }
    return -1;
  }

  /**
   * World-space waypoints for a node path (e.g. from findPath): the lane-centre
   * point of every node, with the right-hand offset for the direction of travel.
   * The radar draws these as the GPS route; traffic follows them.
   */
  pathPositions(path) {
    const out = [];
    for (let i = 0; i < path.length; i++) {
      const node = this.nodes[path[i]];
      let x = node.x;
      let z = node.z;
      if (i + 1 < path.length) {
        const next = this.nodes[path[i + 1]];
        const dx = next.x - node.x;
        const dz = next.z - node.z;
        const len = Math.hypot(dx, dz) || 1;
        const laneOffset = CITY.roadWidth / 4;
        x += (dz / len) * laneOffset;
        z += (-dx / len) * laneOffset;
      } else if (i > 0) {
        const prev = this.nodes[path[i - 1]];
        const dx = node.x - prev.x;
        const dz = node.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        const laneOffset = CITY.roadWidth / 4;
        x += (dz / len) * laneOffset;
        z += (-dx / len) * laneOffset;
      }
      out.push({ x, z, node: path[i] });
    }
    return out;
  }

  /** A random node index, via the caller's seeded RNG. */
  randomNode(rng) {
    return Math.floor(rng() * this.nodes.length);
  }

  /** A random edge id, via the caller's seeded RNG. */
  randomEdge(rng) {
    return Math.floor(rng() * this.edges.length);
  }

  /** All node indices within radius metres of a world position. */
  nodesNear(x, z, radius) {
    const out = [];
    const r2 = radius * radius;
    for (let i = 0; i < this.nodes.length; i++) {
      const dx = this.nodes[i].x - x;
      const dz = this.nodes[i].z - z;
      if (dx * dx + dz * dz <= r2) out.push(i);
    }
    return out;
  }
}
