// NavGraph: the pedestrian sidewalk graph. Each road intersection has four
// sidewalk corner nodes (offset from the road centre by half the road width
// plus a sidewalk margin); corners connect to their neighbours along the same
// sidewalk and across the intersection, so walkers stay on pavements and cross
// only at corners. Paths are found with breadth-first search — the graph is
// small (324 nodes) and unweighted, so BFS is exact and fast.

export class NavGraph {
  constructor(cityData) {
    this.lines = cityData.roadLines.slice();
    this.offset = cityData.roadWidth / 2 + 3;
    this.nodes = [];
    this.edges = new Map();
    this._build();
  }

  _key(x, z) {
    return `${x},${z}`;
  }

  _addNode(x, z) {
    const key = this._key(x, z);
    if (this.edges.has(key)) return key;
    this.nodes.push({ x, z });
    this.edges.set(key, []);
    return key;
  }

  _link(a, b) {
    const ea = this.edges.get(a);
    const eb = this.edges.get(b);
    if (ea && !ea.includes(b)) ea.push(b);
    if (eb && !eb.includes(a)) eb.push(a);
  }

  _build() {
    const o = this.offset;
    const lines = this.lines;
    // Corner nodes for every intersection, linked in a cycle (crosswalks).
    for (const ix of lines) {
      for (const iz of lines) {
        const nw = this._addNode(ix - o, iz - o);
        const ne = this._addNode(ix + o, iz - o);
        const se = this._addNode(ix + o, iz + o);
        const sw = this._addNode(ix - o, iz + o);
        this._link(nw, ne);
        this._link(ne, se);
        this._link(se, sw);
        this._link(sw, nw);
      }
    }
    // Sidewalk runs between adjacent intersections, both axes.
    for (let i = 0; i < lines.length - 1; i++) {
      const a = lines[i];
      const b = lines[i + 1];
      for (const iz of lines) {
        this._link(this._key(a + o, iz - o), this._key(b - o, iz - o));
        this._link(this._key(a + o, iz + o), this._key(b - o, iz + o));
      }
      for (const ix of lines) {
        this._link(this._key(ix - o, a + o), this._key(ix - o, b - o));
        this._link(this._key(ix + o, a + o), this._key(ix + o, b - o));
      }
    }
  }

  // The sidewalk node closest to (x, z).
  nearestNode(x, z) {
    let best = this.nodes[0];
    let bestDist = Infinity;
    for (const n of this.nodes) {
      const dx = n.x - x;
      const dz = n.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return { x: best.x, z: best.z };
  }

  // Shortest sidewalk path from one point to another (BFS). Returns waypoints
  // [{x, z}, ...] from the start's nearest node to the goal's nearest node.
  path(from, to) {
    const start = this.nearestNode(from.x, from.z);
    const goal = this.nearestNode(to.x, to.z);
    const startKey = this._key(start.x, start.z);
    const goalKey = this._key(goal.x, goal.z);
    if (startKey === goalKey) return [start];
    const prev = new Map([[startKey, null]]);
    const queue = [startKey];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      if (current === goalKey) break;
      for (const next of this.edges.get(current) ?? []) {
        if (!prev.has(next)) {
          prev.set(next, current);
          queue.push(next);
        }
      }
    }
    if (!prev.has(goalKey)) return [start, goal];
    const keys = [];
    let cursor = goalKey;
    while (cursor !== null) {
      keys.push(cursor);
      cursor = prev.get(cursor);
    }
    keys.reverse();
    return keys.map((k) => {
      const [x, z] = k.split(',').map(Number);
      return { x, z };
    });
  }

  // A random sidewalk node (used for pedestrian spawns and idle strolls).
  randomNode(rng) {
    const n = rng.pick(this.nodes);
    return { x: n.x, z: n.z };
  }
}
