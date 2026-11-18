// Road-graph adapter: the one place entities touch the city graph.
//
// Expected shape from world/roadgraph.js (worker A, RoadGraph):
//   graph.nodes: [{ x, z, col, row }, ...]     (index IS the node id)
//   graph.edges: [{ a, b, length, lanes }, ...] (a, b are node indices)
//   graph.adj: [[{ to, edge }, ...], ...]
//   graph.nearestNode(x, z) -> node index      (TWO args, not a pos object)
//   graph.findPath(a, b) -> node indices       (A*; BFS fallback here)
//   graph.nodePos(index) -> { x, z }
// Everything below works from nodes+edges alone, so entities keep running even
// if the graph only exposes the raw arrays. Distances are in meters; the graph
// is treated as undirected (two-way streets, right-hand traffic).

export const LANE_OFFSET = 3.0; // right-lane centre: roadWidth(12)/4, matches lanePoint magnitude
export const SIDEWALK_OFFSET = 7.2; // kerb is at 6 m from centre; peds walk just past it

export function adaptGraph(graph) {
  const nodes = graph.nodes.map((n, i) => ({ id: n.id ?? i, x: n.x, z: n.z }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
  const neighbors = nodes.map(() => []);
  const edges = [];
  const seenEdge = new Set();
  for (const e of graph.edges || []) {
    const a = e.a?.id ?? e.a;
    const b = e.b?.id ?? e.b;
    if (!byId.has(a) || !byId.has(b) || a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    const na = byId.get(a);
    const nb = byId.get(b);
    const len = Math.hypot(nb.x - na.x, nb.z - na.z);
    edges.push({ a, b, len });
    neighbors[indexOf.get(a)].push(indexOf.get(b));
    neighbors[indexOf.get(b)].push(indexOf.get(a));
  }

  function nodePos(id) {
    return byId.get(id);
  }

  function nearestNode(x, z) {
    if (typeof graph.nearestNode === 'function') {
      const hit = graph.nearestNode(x, z); // RoadGraph takes (x, z), not {x, z}
      const id = hit?.id ?? hit;
      if (byId.has(id)) return id;
    }
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return nodes[best].id;
  }

  // Breadth-first shortest path over node ids (unweighted: blocks are uniform).
  function bfsPath(fromId, toId) {
    const start = indexOf.get(fromId);
    const goal = indexOf.get(toId);
    if (start === undefined || goal === undefined) return [];
    if (start === goal) return [fromId];
    const prev = new Int32Array(nodes.length).fill(-1);
    const queue = [start];
    prev[start] = start;
    for (let head = 0; head < queue.length; head += 1) {
      const cur = queue[head];
      if (cur === goal) break;
      for (const nb of neighbors[cur]) {
        if (prev[nb] === -1) {
          prev[nb] = cur;
          queue.push(nb);
        }
      }
    }
    if (prev[goal] === -1) return [];
    const path = [];
    let cur = goal;
    while (cur !== start) {
      path.push(nodes[cur].id);
      cur = prev[cur];
    }
    path.push(nodes[start].id);
    path.reverse();
    return path;
  }

  function findPath(fromId, toId) {
    if (typeof graph.findPath === 'function') {
      try {
        const raw = graph.findPath(fromId, toId) || [];
        const ids = raw.map((n) => n?.id ?? n).filter((id) => byId.has(id));
        if (ids.length > 0) return ids;
      } catch {
        // Fall through to the local BFS.
      }
    }
    return bfsPath(fromId, toId);
  }

  function randomNode(rng) {
    return nodes[Math.floor(rng() * nodes.length)].id;
  }

  function randomEdge(rng) {
    return edges[Math.floor(rng() * edges.length)];
  }

  // Point on edge a->b at fraction t, offset to the RIGHT of travel by `off`
  // meters (right-hand traffic). Right of direction (dx, dz) is (-dz, dx).
  function edgePoint(edge, t, off) {
    const na = byId.get(edge.a);
    const nb = byId.get(edge.b);
    const dx = nb.x - na.x;
    const dz = nb.z - na.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    return {
      x: na.x + dx * t + -uz * off,
      z: na.z + dz * t + ux * off,
    };
  }

  function edgeHeading(edge) {
    const na = byId.get(edge.a);
    const nb = byId.get(edge.b);
    // Heading: forward = (sin h, cos h) in (x, z), mesh built facing +Z.
    return Math.atan2(nb.x - na.x, nb.z - na.z);
  }

  return {
    nodes, edges, neighbors, byId,
    nodePos, nearestNode, findPath, randomNode, randomEdge,
    edgePoint, edgeHeading,
    nodeCount: nodes.length,
  };
}

/** Angle difference wrapped to [-PI, PI]. */
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
