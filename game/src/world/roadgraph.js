// RoadGraph: the drivable street grid of Solmar City. Roads are straight lines
// on a 70 m pitch in both axes; intersections are where a vertical and a
// horizontal line cross. Traffic, police and mission routing all plan on this
// graph, so routes are Manhattan paths through intersections — never diagonal
// shortcuts across blocks.

export class RoadGraph {
  constructor(cityData) {
    this.lines = cityData.roadLines.slice();
    this.roadWidth = cityData.roadWidth;
    this.bounds = cityData.bounds;
    // All intersections, cached for route planning.
    this.intersections = [];
    for (const x of this.lines) {
      for (const z of this.lines) {
        this.intersections.push({ x, z });
      }
    }
  }

  _nearestLine(v) {
    let best = this.lines[0];
    let bestDist = Math.abs(v - best);
    for (const line of this.lines) {
      const d = Math.abs(v - line);
      if (d < bestDist) {
        bestDist = d;
        best = line;
      }
    }
    return best;
  }

  // True when the point sits on a road (within half the road width of a line).
  isOnRoad(x, z) {
    const half = this.roadWidth / 2 + 1;
    for (const line of this.lines) {
      if (Math.abs(x - line) <= half || Math.abs(z - line) <= half) return true;
    }
    return false;
  }

  // The closest point on any road to (x, z), snapped to the nearer road line.
  nearestRoad(x, z) {
    const lx = this._nearestLine(x);
    const lz = this._nearestLine(z);
    if (Math.abs(x - lx) <= Math.abs(z - lz)) return { x: lx, z };
    return { x, z: lz };
  }

  // The intersection closest to (x, z).
  nearestIntersection(x, z) {
    let best = this.intersections[0];
    let bestDist = Infinity;
    for (const p of this.intersections) {
      const dx = p.x - x;
      const dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  // Manhattan route from one point to another via intersections. Returns an
  // array of waypoints [{x, z}, ...] starting at the caller's road snap and
  // ending at the destination's road snap. Never crosses a block diagonally.
  route(from, to) {
    const start = this.nearestRoad(from.x, from.z);
    const end = this.nearestRoad(to.x, to.z);
    // Same road line in either axis: drive straight, no detour.
    if (start.x === end.x || start.z === end.z) return [start, end];
    const a = this.nearestIntersection(start.x, start.z);
    const b = this.nearestIntersection(end.x, end.z);
    const points = [{ x: start.x, z: start.z }];
    // Walk the grid from intersection a to intersection b, one axis at a time.
    let cx = a.x;
    let cz = a.z;
    points.push({ x: cx, z: cz });
    const stepX = Math.sign(b.x - a.x);
    const stepZ = Math.sign(b.z - a.z);
    while (cx !== b.x) {
      cx += stepX * 70;
      points.push({ x: cx, z: cz });
    }
    while (cz !== b.z) {
      cz += stepZ * 70;
      points.push({ x: cx, z: cz });
    }
    points.push({ x: end.x, z: end.z });
    // Drop consecutive duplicates (start may already be an intersection).
    return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.z !== points[i - 1].z);
  }

  // A random multi-leg route for traffic cars: 3 to 6 random intersections.
  randomRoute(rng) {
    const legs = rng.int(3, 6);
    const points = [];
    for (let i = 0; i < legs; i++) {
      const p = rng.pick(this.intersections);
      points.push({ x: p.x, z: p.z });
    }
    return points;
  }

  // A random point on a random road (used for ambient spawns).
  randomRoadPoint(rng) {
    const line = rng.pick(this.lines);
    const along = rng.range(this.bounds.minX, this.bounds.maxX);
    if (rng.chance(0.5)) return { x: line, z: along };
    return { x: along, z: line };
  }
}
