// The minimap (radar) and the full pause-menu map, both drawn in 2D canvas from the
// same city data the 3D world uses: dark blocks, light roads, blue water, green
// parks. The radar is a circle rotating with the player (heading up, or north up),
// player as a white arrow in the middle, blips for missions, Respray, hospital and
// police, a yellow GPS route to the objective and a purple route to the waypoint.
// The full map is the same drawing north-up at city scale, with district names —
// plus a side panel (v2) listing missions with payout + status, progress stats,
// and a legend of the blip kinds actually on the map.
//
// State shape (from main.js):
//   { city, graph, playerPos: {x, z}, playerHeading, objective, waypoint,
//     route, waypointRoute, blips: [{x, z, kind, label}], police: [{x, z}],
//     northUp, time,
//     brief?: [{title, done, active}], stats?: {money, missionsDone, ...},
//     shells?: {collected, total, positions?} }
// city: { bounds: {minX, maxX, minZ, maxZ}, districts: [{name, kind, bounds}],
//         water: [{minX, maxX, minZ, maxZ}] }
// Heading: forward = (sin h, cos h) in (x, z), so 0 = south (+Z). The radar
// rotates by (heading - PI) so the player's heading points up on the disc.

import { MISSIONS } from '../data/missions.js';

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
  } else if (kind === 'race') {
    // Checkered flag: 2x2 black/white squares.
    const s = radius * 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-s, -s, s, s);
    ctx.fillRect(0, 0, s, s);
  } else if (kind === 'shell') {
    ctx.fillStyle = '#f2a6c0';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'safehouse') {
    ctx.fillStyle = '#7dd87d';
    ctx.fillRect(-radius * 0.8, -radius * 0.2, radius * 1.6, radius);
    ctx.beginPath();
    ctx.moveTo(-radius, -radius * 0.2);
    ctx.lineTo(0, -radius);
    ctx.lineTo(radius, -radius * 0.2);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'gunshop') {
    ctx.fillStyle = '#ff9d5c';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
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

/** Legend labels for the blip kinds the full map can show. */
const BLIP_LABELS = {
  mission: 'Mission giver',
  objective: 'Objective',
  waypoint: 'Waypoint',
  respray: 'Respray',
  hospital: 'Hospital',
  police: 'Police',
  race: 'Street race',
  shell: 'Sun Shell',
  safehouse: 'Safehouse',
  gunshop: 'Gun shop',
};

/** Mission status from the pause brief: 'done' | 'active' | 'locked'. */
function missionStatus(mission, brief, index) {
  const entry = brief?.[index];
  if (entry && typeof entry.title === 'string' && entry.title.startsWith(mission.name)) {
    if (entry.done) return 'done';
    if (entry.active) return 'active';
    return 'locked';
  }
  const found = (brief ?? []).find(
    (b) => typeof b.title === 'string' && b.title.startsWith(mission.name),
  );
  if (!found) return 'locked';
  if (found.done) return 'done';
  if (found.active) return 'active';
  return 'locked';
}

function formatPlayTime(seconds) {
  const mins = Math.floor((seconds ?? 0) / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

/**
 * The full map's side panel: missions with payout + status, progress stats,
 * and a legend of the blip kinds on the map. It sits over the sea on the
 * map's east edge, so it hides no streets.
 */
function drawMapPanel(ctx, state, allBlips, width) {
  const time = state.time ?? 0;
  const brief = state.brief ?? [];
  const stats = state.stats ?? {};
  const statuses = MISSIONS.map((m, i) => missionStatus(m, brief, i));
  const doneCount = statuses.filter((s) => s === 'done').length;
  const shells = state.shells;
  let completePct = MISSIONS.length ? Math.round((doneCount / MISSIONS.length) * 100) : 0;
  if (shells && typeof shells.total === 'number' && shells.total > 0) {
    const got = typeof shells.collected === 'number' ? shells.collected : 0;
    completePct = Math.round(((doneCount + got) / (MISSIONS.length + shells.total)) * 100);
  }
  const statRows = [
    ['Complete', `${completePct}%`],
    ['Time played', formatPlayTime(stats.playTime)],
    ['Cars stolen', `${stats.carsStolen ?? 0}`],
    ['Cash', `$${(stats.money ?? 0).toLocaleString('en-US')}`],
  ];
  if (shells && typeof shells.total === 'number' && shells.total > 0) {
    statRows.push(['Sun Shells', `${shells.collected ?? 0}/${shells.total}`]);
  }
  // Legend: only the kinds actually on this map.
  const kinds = [];
  const seen = new Set();
  const addKind = (kind) => {
    if (kind && BLIP_LABELS[kind] && !seen.has(kind)) {
      seen.add(kind);
      kinds.push(kind);
    }
  };
  for (const b of allBlips) addKind(b.kind);
  if ((state.police ?? []).length > 0) addKind('police');
  if (state.objective) addKind('objective');
  if (state.waypoint) addKind('waypoint');

  const panelW = 212;
  const rowH = 17;
  const panelH = 12 + 18 + MISSIONS.length * rowH + 8 + 18 + statRows.length * 16
    + 8 + 18 + kinds.length * rowH + 10;
  const x = width - panelW - 10;
  const y = 10;
  ctx.save();
  ctx.fillStyle = 'rgba(8,14,22,0.85)';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, panelW, panelH, 6);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, panelW, panelH);
    ctx.strokeRect(x, y, panelW, panelH);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let cy = y + 12;
  const header = (text) => {
    cy += 9;
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(text, x + 12, cy);
    cy += 9;
  };
  header('MISSIONS');
  ctx.font = '12px sans-serif';
  MISSIONS.forEach((m, i) => {
    const status = statuses[i];
    const glyph = status === 'done' ? '✓' : status === 'active' ? '▶' : '○';
    ctx.fillStyle = status === 'done' ? '#7dd87d' : status === 'active' ? '#ffd23f' : '#9aa5b1';
    ctx.fillText(`${glyph} ${m.name} — $${m.reward.toLocaleString('en-US')}`, x + 12, cy + rowH / 2);
    cy += rowH;
  });
  cy += 8;
  header('PROGRESS');
  ctx.font = '12px sans-serif';
  for (const [label, value] of statRows) {
    ctx.fillStyle = '#cfd6de';
    ctx.fillText(label, x + 12, cy + 8);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(value, x + panelW - 12, cy + 8);
    ctx.textAlign = 'left';
    cy += 16;
  }
  cy += 8;
  header('LEGEND');
  for (const kind of kinds) {
    drawBlip(ctx, x + 20, cy + rowH / 2, 5, kind, kind === 'mission' ? 'M' : null, time);
    ctx.fillStyle = '#cfd6de';
    ctx.font = '12px sans-serif';
    ctx.fillText(BLIP_LABELS[kind], x + 32, cy + rowH / 2);
    cy += rowH;
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

  // Blips the radar state does not carry: the Harbor Run start doubles as the
  // street-race marker once Lena's mission blip is gone (active or done), and
  // uncollected Sun Shells show when the game state carries them.
  const allBlips = [...(state.blips ?? [])];
  const m2Index = MISSIONS.findIndex((m) => m.id === 'm2');
  if (m2Index >= 0) {
    const m2 = MISSIONS[m2Index];
    if (missionStatus(m2, state.brief, m2Index) !== 'locked') {
      allBlips.push({ x: m2.giverPos.x, z: m2.giverPos.z, kind: 'race', label: null });
    }
  }
  const shellPositions = state.shells?.positions ?? state.collectibles?.positions ?? null;
  if (Array.isArray(shellPositions)) {
    const collected = state.shells?.collected ?? state.collectibles?.collected;
    const isCollected = (i) => {
      if (collected && typeof collected.has === 'function') return collected.has(i);
      if (Array.isArray(collected)) return collected.includes(i);
      return false;
    };
    shellPositions.forEach((pos, i) => {
      if (pos && typeof pos.x === 'number' && typeof pos.z === 'number' && !isCollected(i)) {
        allBlips.push({ x: pos.x, z: pos.z, kind: 'shell', label: null });
      }
    });
  }

  const blipR = 6;
  for (const blip of allBlips) {
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

  drawMapPanel(ctx, state, allBlips, width);

  return { scale, offsetX, offsetZ, width, height };
}
