// The minimap (radar) and the full pause-menu map, both drawn in 2D canvas from the
// same city data the 3D world uses: dark blocks, light roads, blue water, green
// parks. The radar is a circle rotating with the player (heading up, or north up),
// player as a white arrow in the middle, blips for missions, Respray, hospital and
// police, a yellow GPS route to the objective and a purple route to the waypoint.
// The full map is the same drawing north-up at city scale, with district names.
//
// State shape (from main.js):
//   { city, graph, playerPos: {x, z}, playerHeading, objective, waypoint,
//     route, waypointRoute, blips: [{x, z, kind, label}], police: [{x, z}],
//     northUp, time }
// city: { bounds: {minX, maxX, minZ, maxZ}, districts: [{name, kind, bounds}],
//         water: [{minX, maxX, minZ, maxZ}] }
// Heading: forward = (sin h, cos h) in (x, z), so 0 = south (+Z). The radar
// rotates by (heading - PI) so the player's heading points up on the disc.

/**
 * Draw the rotating minimap into `ctx` (a square canvas). The player stays in the
 * middle; the world rotates so the player's heading points up, unless northUp is set.
 */
export function drawRadar(ctx, state) {
  const size = ctx.canvas.width;
  const centre = size / 2;
  const scale = centre / RADAR_RANGE;
  const player = state.playerPos ?? { x: 0, z: 0 };
  const heading = state.northUp ? 0 : state.playerHeading ?? 0;
  const time = state.time ?? 0;

  ctx.save();
  ctx.clearRect(0, 0, size, size);
  // Circular clip: the radar is a disc, like the genre's minimaps.
  ctx.beginPath();
  ctx.arc(centre, centre, centre - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = COLORS.block;
  ctx.fillRect(0, 0, size, size);

  ctx.translate(centre, centre);
  ctx.rotate(heading - Math.PI);
  ctx.scale(scale, scale);
  ctx.translate(-player.x, -player.z);
  const toCanvas = (x, z) => ({ x, y: z }); // transform already applied by the matrix
  drawTerrain(ctx, state, toCanvas);
  drawRoads(ctx, state, toCanvas, 7);
  drawRoute(ctx, state.route, toCanvas, COLORS.route, 5);
  drawRoute(ctx, state.waypointRoute, toCanvas, COLORS.waypointRoute, 5);
  // Blips are drawn in world space so they rotate with the map; their radius is in
  // world metres here, then the matrix scales them.
  const blipR = 5;
  for (const blip of state.blips ?? []) {
    drawBlip(ctx, blip.x, blip.z, blipR, blip.kind, blip.label, time);
  }
  for (const cop of state.police ?? []) {
    drawBlip(ctx, cop.x, cop.z, blipR, 'police', null, time);
  }
  if (state.objective) {
    drawBlip(ctx, state.objective.x, state.objective.z, blipR + 1, 'objective', null, time);
  }
  if (state.waypoint) {
    drawBlip(ctx, state.waypoint.x, state.waypoint.z, blipR, 'waypoint', null, time);
  }
  ctx.restore();

  // The player arrow is drawn unrotated in screen space: it always points up.
  ctx.save();
  ctx.translate(centre, centre);
  ctx.fillStyle = COLORS.player;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // North marker on the rim when the map rotates; it sits where north points.
  // North is (0, -1) in world (x, z); after the (heading - PI) rotation it lands
  // at (-sin h, cos h) from the centre.
  if (!state.northUp) {
    const nx = centre - Math.sin(heading) * (centre - 10);
    const ny = centre + Math.cos(heading) * (centre - 10);
    ctx.fillStyle = COLORS.north;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);
  }

  // Rim ring.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centre, centre, centre - 1, 0, Math.PI * 2);
  ctx.stroke();
}

const RADAR_RANGE = 130; // metres shown from the centre to the rim
const COLORS = {
  block: '#20262e',
  blockAlt: '#242b33',
  road: '#9aa5b1',
  roadMinor: '#7d8794',
  water: '#2e6da8',
  park: '#3f7a4a',
  sand: '#c9b489',
  route: '#ffd23f',
  waypointRoute: '#b388ff',
  player: '#ffffff',
  north: '#e8ecf0',
};

function nodePos(graph, id) {
  if (id && typeof id === 'object' && typeof id.x === 'number') return id;
  if (!graph || !graph.nodes) return null;
  const nodes = graph.nodes;
  if (typeof nodes.get === 'function') return nodes.get(id) ?? null;
  if (Array.isArray(nodes)) return nodes[id] ?? null;
  return nodes[id] ?? null;
}

/** All road segments as [x1, z1, x2, z2] pairs, whatever the graph's edge shape. */
function roadSegments(graph) {
  const segments = [];
  if (!graph || !Array.isArray(graph.edges)) return segments;
  for (const edge of graph.edges) {
    const a = nodePos(graph, edge.a ?? edge.from ?? edge[0]);
    const b = nodePos(graph, edge.b ?? edge.to ?? edge[1]);
    if (a && b) segments.push([a.x, a.z, b.x, b.z]);
  }
  return segments;
}

function drawTerrain(ctx, state, toCanvas) {
  const city = state.city;
  const bounds = city?.bounds;
  if (!bounds) return;
  // Base: the whole city block colour.
  ctx.fillStyle = COLORS.block;
  const tl = toCanvas(bounds.minX, bounds.minZ);
  const br = toCanvas(bounds.maxX, bounds.maxZ);
  ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  // Water first (sea and harbour), then parks and sand, then districts.
  ctx.fillStyle = COLORS.water;
  for (const w of city.water ?? []) {
    const a = toCanvas(w.minX, w.minZ);
    const b = toCanvas(w.maxX, w.maxZ);
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
  for (const d of city.districts ?? []) {
    const a = toCanvas(d.bounds.minX, d.bounds.minZ);
    const b = toCanvas(d.bounds.maxX, d.bounds.maxZ);
    if (d.kind === 'park') ctx.fillStyle = COLORS.park;
    else if (d.kind === 'beach') ctx.fillStyle = COLORS.sand;
    else if (d.kind === 'water') ctx.fillStyle = COLORS.water;
    else ctx.fillStyle = COLORS.blockAlt;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
}

function drawRoads(ctx, state, toCanvas, roadWidth) {
  const segments = roadSegments(state.graph);
  if (segments.length === 0) return;
  ctx.strokeStyle = COLORS.road;
  ctx.lineWidth = roadWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [x1, z1, x2, z2] of segments) {
    const a = toCanvas(x1, z1);
    const b = toCanvas(x2, z2);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

function drawRoute(ctx, route, toCanvas, color, width) {
  if (!route || route.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  const first = toCanvas(route[0].x, route[0].z);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < route.length; i += 1) {
    const p = toCanvas(route[i].x, route[i].z);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function drawBlip(ctx, x, y, radius, kind, label, time) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'police') {
    // Flashing red/blue, alternating twice a second.
    const phase = Math.floor((time ?? 0) * 2) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#2f7bff';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'mission') {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `bold ${radius * 1.4}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label ?? '!', 0, 1);
  } else if (kind === 'hospital') {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-radius, -radius * 0.35, radius * 2, radius * 0.7);
    ctx.fillRect(-radius * 0.35, -radius, radius * 0.7, radius * 2);
  } else if (kind === 'respray') {
    ctx.fillStyle = '#ff8c1a';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `bold ${radius * 1.3}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('R', 0, 1);
  } else if (kind === 'objective') {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (kind === 'waypoint') {
    ctx.fillStyle = '#b388ff';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#e8ecf0';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw the full city map into `ctx`, north up, fitting the whole city. District names
 * are labelled; blips and routes are drawn like the radar. Returns the transform used,
 * so the pause menu can turn a click back into world coordinates:
 * `{ scale, offsetX, offsetZ, width, height }` with world = (px - offset) / scale.
 */
export function drawFullMap(ctx, state, width, height) {
  const city = state.city;
  const bounds = city?.bounds ?? { minX: -280, maxX: 280, minZ: -280, maxZ: 280 };
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxZ - bounds.minZ;
  const pad = 12;
  const scale = Math.min((width - pad * 2) / worldW, (height - pad * 2) / worldH);
  const offsetX = pad + (width - pad * 2 - worldW * scale) / 2 - bounds.minX * scale;
  const offsetZ = pad + (height - pad * 2 - worldH * scale) / 2 - bounds.minZ * scale;
  const toCanvas = (x, z) => ({ x: x * scale + offsetX, y: z * scale + offsetZ });
  const time = state.time ?? 0;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.block;
  ctx.fillRect(0, 0, width, height);
  drawTerrain(ctx, state, toCanvas);
  drawRoads(ctx, state, toCanvas, Math.max(2, 6 * scale));
  drawRoute(ctx, state.route, toCanvas, COLORS.route, Math.max(2, 4 * scale));
  drawRoute(ctx, state.waypointRoute, toCanvas, COLORS.waypointRoute, Math.max(2, 4 * scale));

  // District names, centred in each district.
  ctx.fillStyle = 'rgba(232,236,240,0.75)';
  ctx.font = '600 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const d of city?.districts ?? []) {
    const cx = (d.bounds.minX + d.bounds.maxX) / 2;
    const cz = (d.bounds.minZ + d.bounds.maxZ) / 2;
    const p = toCanvas(cx, cz);
    ctx.fillText(d.name, p.x, p.y);
  }

  const blipR = 6;
  for (const blip of state.blips ?? []) {
    const p = toCanvas(blip.x, blip.z);
    drawBlip(ctx, p.x, p.y, blipR, blip.kind, blip.label, time);
  }
  for (const cop of state.police ?? []) {
    const p = toCanvas(cop.x, cop.z);
    drawBlip(ctx, p.x, p.y, blipR, 'police', null, time);
  }
  if (state.objective) {
    const p = toCanvas(state.objective.x, state.objective.z);
    drawBlip(ctx, p.x, p.y, blipR + 1, 'objective', null, time);
  }
  if (state.waypoint) {
    const p = toCanvas(state.waypoint.x, state.waypoint.z);
    drawBlip(ctx, p.x, p.y, blipR, 'waypoint', null, time);
  }
  // The player, as a white arrow pointing along the heading.
  const player = state.playerPos ?? { x: 0, z: 0 };
  const pp = toCanvas(player.x, player.z);
  const heading = state.playerHeading ?? 0;
  ctx.save();
  ctx.translate(pp.x, pp.y);
  ctx.rotate(Math.PI - heading); // arrow drawn pointing up; heading 0 = south (+Z)
  ctx.fillStyle = COLORS.player;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  return { scale, offsetX, offsetZ, width, height };
}
