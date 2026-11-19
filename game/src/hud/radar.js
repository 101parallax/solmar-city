// Radar and full map: a rotating minimap canvas in the HUD corner plus a
// full-screen map (M key) with district outlines, blips for missions,
// police, shops, taxi stands, shells, and hostiles, a mission list with
// payouts and status, and run statistics. All positions come from the
// shared city data so the map can never drift from the 3D world.

import { CITY_DATA } from '../data/city.js';
import { MISSIONS } from '../data/missions.js';

const MINIMAP_RANGE = 130;

export class Radar {
  constructor(game) {
    this.game = game;
    this.minimap = document.getElementById('minimap');
    this.miniCtx = this.minimap ? this.minimap.getContext('2d') : null;
    this.fullmap = document.getElementById('fullmap');
    this.fullCtx = this.fullmap ? this.fullmap.getContext('2d') : null;
    this.mapOpen = false;
    this._fullmapTimer = 0;
    const closeBtn = document.getElementById('btn-map-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.toggleMap());
    const mapScreen = document.getElementById('map-screen');
    if (mapScreen) mapScreen.addEventListener('close', () => { this.mapOpen = false; });
  }

  // Normalize the city bounds into { minX, maxX, minZ, maxZ }.
  _bounds() {
    const b = CITY_DATA.bounds || {};
    if (typeof b.minX === 'number') return b;
    if (typeof b.x0 === 'number') return { minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 };
    const half = (CITY_DATA.size || 560) / 2;
    return { minX: -half, maxX: half, minZ: -half, maxZ: half };
  }

  _playerPos() {
    const state = this.game.state;
    if (state.playerPos) return { x: state.playerPos.x || 0, z: state.playerPos.z || 0 };
    const player = this.game.player;
    if (player && typeof player.position === 'function') {
      const p = player.position();
      return { x: p.x || 0, z: p.z || 0 };
    }
    if (player && player.mesh) return { x: player.mesh.position.x, z: player.mesh.position.z };
    return { x: 0, z: 0 };
  }

  _heading() {
    const player = this.game.player;
    if (player && player.mesh) return player.mesh.rotation.y || 0;
    if (player && typeof player.heading === 'number') return player.heading;
    return 0;
  }

  _policePositions() {
    const police = this.game.police;
    const out = [];
    if (!police) return out;
    if (typeof police.cruiserPositions === 'function') {
      for (const p of police.cruiserPositions() || []) out.push({ x: p.x || 0, z: p.z || 0 });
      return out;
    }
    const cruisers = police.cruisers || [];
    for (const cruiser of cruisers) {
      const mesh = cruiser.mesh || cruiser;
      const pos = mesh.position || mesh;
      if (typeof pos.x === 'number') out.push({ x: pos.x, z: pos.z || 0 });
    }
    return out;
  }

  _hostilePositions() {
    const hostiles = this.game.hostiles;
    const out = [];
    if (!hostiles) return out;
    const list = hostiles.list || hostiles.hostiles || hostiles.items || [];
    for (const hostile of list) {
      if (hostile.hp != null && hostile.hp <= 0) continue;
      const mesh = hostile.mesh || hostile;
      const pos = mesh.position || hostile;
      if (typeof pos.x === 'number') out.push({ x: pos.x, z: pos.z || 0 });
    }
    return out;
  }

  _missionMarker() {
    const state = this.game.state;
    const mission = state.mission;
    if (!mission || mission.status !== 'active') return null;
    const data = mission.data || {};
    const marker = data.marker || mission.marker || data.target || null;
    if (marker && typeof marker.x === 'number') return { x: marker.x, z: marker.z || 0 };
    if (this.game.missions && typeof this.game.missions.currentMarker === 'function') {
      const current = this.game.missions.currentMarker();
      if (current && typeof current.x === 'number') return { x: current.x, z: current.z || 0 };
    }
    return null;
  }

  _remainingShells() {
    const collected = new Set((this.game.state.shellsCollected || []));
    return (CITY_DATA.shells || []).filter((shell) => !collected.has(shell.id));
  }

  update(dt) {
    // Skip canvas work while the tab is hidden; the next visible frame
    // redraws from current state.
    if (typeof document !== 'undefined' && document.hidden) return;
    this.drawMinimap();
    if (this.mapOpen) {
      this._fullmapTimer -= dt;
      if (this._fullmapTimer <= 0) {
        this._fullmapTimer = 0.25;
        this.drawFullMap();
      }
    }
  }

  toggleMap() {
    const screen = document.getElementById('map-screen');
    if (!screen) return;
    if (this.mapOpen) {
      if (screen.open) screen.close();
      this.mapOpen = false;
      return;
    }
    this.mapOpen = true;
    this.drawFullMap();
    this._fillMissionList();
    this._fillStats();
    if (!screen.open) screen.showModal();
    const closeBtn = document.getElementById('btn-map-close');
    if (closeBtn) closeBtn.focus();
  }

  _drawRoads(ctx, toMap) {
    const bounds = this._bounds();
    ctx.strokeStyle = 'rgba(200, 200, 210, 0.55)';
    ctx.lineWidth = 2;
    // City data carries the grid as roadLines (centre-line coordinates);
    // draw those first, then any explicit road segments if present.
    const lines = CITY_DATA.roadLines || [];
    for (const line of lines) {
      const a = toMap(bounds.minX, line);
      const b = toMap(bounds.maxX, line);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const c = toMap(line, bounds.minZ);
      const d = toMap(line, bounds.maxZ);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }
    const roads = CITY_DATA.roads || [];
    for (const road of roads) {
      const points = road.points || road.path || null;
      ctx.beginPath();
      if (points && points.length >= 2) {
        points.forEach((point, i) => {
          const p = toMap(point.x, point.z);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
      } else if (typeof road.x0 === 'number') {
        const a = toMap(road.x0, road.z0);
        const b = toMap(road.x1, road.z1);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
  }

  _drawWater(ctx, toMap, width, height) {
    const waterLine = CITY_DATA.waterLine;
    if (typeof waterLine !== 'number') return;
    const edge = toMap(0, waterLine);
    ctx.fillStyle = 'rgba(30, 110, 160, 0.75)';
    ctx.fillRect(0, edge.y, width, height - edge.y);
  }

  _blip(ctx, x, y, color, shape, label) {
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (shape === 'diamond') {
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (shape === 'triangle') {
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 5, y + 5);
      ctx.lineTo(x - 5, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + 0.5);
    }
  }

  _drawBlips(ctx, toMap, inRange) {
    const marker = this._missionMarker();
    if (marker && (!inRange || inRange(marker.x, marker.z))) {
      const p = toMap(marker.x, marker.z);
      this._blip(ctx, p.x, p.y, '#ffd23f', 'diamond');
    }
    for (const shop of CITY_DATA.shops || []) {
      const x = shop.x != null ? shop.x : (shop.pos ? shop.pos.x : null);
      const z = shop.z != null ? shop.z : (shop.pos ? shop.pos.z : null);
      if (x == null) continue;
      if (inRange && !inRange(x, z)) continue;
      const p = toMap(x, z);
      this._blip(ctx, p.x, p.y, '#2dd4bf', 'circle', '$');
    }
    for (const stand of CITY_DATA.taxiStands || []) {
      const x = stand.x != null ? stand.x : (stand.pos ? stand.pos.x : null);
      const z = stand.z != null ? stand.z : (stand.pos ? stand.pos.z : null);
      if (x == null) continue;
      if (inRange && !inRange(x, z)) continue;
      const p = toMap(x, z);
      this._blip(ctx, p.x, p.y, '#facc15', 'circle', 'T');
    }
    for (const shell of this._remainingShells()) {
      if (inRange && !inRange(shell.x, shell.z)) continue;
      const p = toMap(shell.x, shell.z);
      this._blip(ctx, p.x, p.y, '#fb923c', 'circle');
    }
    if (CITY_DATA.raceStart) {
      const rs = CITY_DATA.raceStart;
      if (!inRange || inRange(rs.x, rs.z)) {
        const p = toMap(rs.x, rs.z);
        this._blip(ctx, p.x, p.y, '#e879f9', 'triangle');
      }
    }
    for (const pos of this._policePositions()) {
      if (inRange && !inRange(pos.x, pos.z)) continue;
      const p = toMap(pos.x, pos.z);
      this._blip(ctx, p.x, p.y, '#3b82f6', 'circle');
    }
    for (const pos of this._hostilePositions()) {
      if (inRange && !inRange(pos.x, pos.z)) continue;
      const p = toMap(pos.x, pos.z);
      this._blip(ctx, p.x, p.y, '#ef4444', 'diamond');
    }
  }

  drawMinimap() {
    const ctx = this.miniCtx;
    const canvas = this.minimap;
    if (!ctx || !canvas) return;
    const size = canvas.width;
    const half = size / 2;
    const player = this._playerPos();
    const northUp = this.game.state.settings ? this.game.state.settings.radarNorthUp : false;
    const heading = northUp ? 0 : this._heading();
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#101c26';
    ctx.fillRect(0, 0, size, size);
    const scale = half / MINIMAP_RANGE;
    const toMap = (x, z) => {
      let dx = (x - player.x) * scale;
      let dz = (z - player.z) * scale;
      if (heading) {
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        const rx = dx * cos - dz * sin;
        const rz = dx * sin + dz * cos;
        dx = rx;
        dz = rz;
      }
      return { x: half + dx, y: half + dz };
    };
    const inRange = (x, z) => Math.hypot(x - player.x, z - player.z) <= MINIMAP_RANGE;
    this._drawWater(ctx, toMap, size, size);
    this._drawRoads(ctx, toMap);
    this._drawBlips(ctx, toMap, inRange);
    // Player arrow, always centered and pointing up the map.
    ctx.save();
    ctx.translate(half, half);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawFullMap() {
    const ctx = this.fullCtx;
    const canvas = this.fullmap;
    if (!ctx || !canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    const bounds = this._bounds();
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxZ - bounds.minZ;
    const scale = Math.min(width / worldWidth, height / worldHeight);
    const offsetX = (width - worldWidth * scale) / 2;
    const offsetY = (height - worldHeight * scale) / 2;
    const toMap = (x, z) => ({
      x: offsetX + (x - bounds.minX) * scale,
      y: offsetY + (z - bounds.minZ) * scale,
    });
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0e1a24';
    ctx.fillRect(0, 0, width, height);
    for (const district of CITY_DATA.districts || []) {
      const b = district.bounds || district;
      if (typeof b.minX !== 'number') continue;
      const a = toMap(b.minX, b.minZ);
      const c = toMap(b.maxX, b.maxZ);
      ctx.fillStyle = district.color || 'rgba(255, 255, 255, 0.06)';
      ctx.globalAlpha = 0.35;
      ctx.fillRect(a.x, a.y, c.x - a.x, c.y - a.y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(district.name || '', (a.x + c.x) / 2, (a.y + c.y) / 2);
    }
    this._drawWater(ctx, toMap, width, height);
    this._drawRoads(ctx, toMap);
    this._drawBlips(ctx, toMap, null);
    const player = this._playerPos();
    const p = toMap(player.x, player.z);
    this._blip(ctx, p.x, p.y, '#ffffff', 'triangle');
  }

  _missionStatus(mission) {
    const state = this.game.state;
    const flags = state.flags || {};
    if (flags['passed_' + mission.id]) return 'PASSED';
    if (state.mission && state.mission.id === mission.id && state.mission.status === 'active') return 'ACTIVE';
    if (mission.unlockTier && (state.repTier || 1) < mission.unlockTier) return 'LOCKED';
    return 'AVAILABLE';
  }

  _fillMissionList() {
    const container = document.getElementById('map-missions');
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    for (const mission of MISSIONS) {
      const row = document.createElement('li');
      row.className = 'map-mission';
      const name = document.createElement('span');
      name.className = 'map-mission-name';
      name.textContent = mission.id + ' — ' + mission.name;
      const payout = document.createElement('span');
      payout.className = 'map-mission-payout';
      payout.textContent = '$' + Math.floor(mission.payout || 0).toLocaleString('en-US');
      const status = document.createElement('span');
      status.className = 'map-mission-status status-' + this._missionStatus(mission).toLowerCase();
      status.textContent = this._missionStatus(mission);
      row.appendChild(name);
      row.appendChild(payout);
      row.appendChild(status);
      container.appendChild(row);
    }
  }

  _fillStats() {
    const container = document.getElementById('map-stats');
    if (!container) return;
    const state = this.game.state;
    const stats = state.stats || {};
    const lines = [
      'Money: $' + Math.floor(state.money || 0).toLocaleString('en-US'),
      'REP: ' + Math.floor(state.rep || 0) + ' (Tier ' + (state.repTier || 1) + ')',
      'Sun Shells: ' + (state.shells || 0) + '/20',
      'Completion: ' + Math.floor(state.completion || 0) + '%',
      'Day ' + (state.day || 1),
      'Cars stolen: ' + (stats.carsStolen || 0),
      'Cops lost: ' + (stats.copsLost || 0),
      'Near misses: ' + (stats.nearMiss || 0),
      'Drifts: ' + (stats.drifts || 0),
    ];
    container.textContent = lines.join('  ·  ');
  }
}
