// Radar for Solmar City: a rotating minimap canvas plus the full-screen map.
// The minimap rotates with the player's heading (or stays north-up when the
// setting says so) and shows blips for the mission target, police, shops,
// taxi stands, uncollected Sun Shells and hostiles. The full map adds a
// legend, the mission list with payouts and status, statistics and the
// completion percentage.

import { CITY_DATA } from '../data/city.js';
import { MISSIONS } from '../data/missions.js';

const MINIMAP_RANGE = 130; // metres shown from edge to edge
const COLORS = {
  bg: '#0b1526',
  road: '#3d4a63',
  water: '#0e4d6e',
  sand: '#c9a86a',
  player: '#ffffff',
  mission: '#ffd23f',
  police: '#4da3ff',
  policeHot: '#ff5252',
  shop: '#2dd4bf',
  taxi: '#ffd23f',
  shell: '#ff9f43',
  hostile: '#ff5252',
  pickup: '#7CFC9A',
};

export class Radar {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.fullCanvas = document.getElementById('fullmap');
    this.fullCtx = this.fullCanvas ? this.fullCanvas.getContext('2d') : null;
    this.mapOpen = false;
    this._heading = 0;
    this._city = CITY_DATA || {};
    this._bounds = this._city.bounds || { minX: -280, maxX: 280, minZ: -280, maxZ: 280 };
  }

  get state() {
    return this.game.state;
  }

  _playerHeading() {
    const player = this.game.player;
    if (player && player.mesh) return -player.mesh.rotation.y;
    return this._heading;
  }

  _worldToMinimap(wx, wz, cx, cz, scale, rotate) {
    let dx = wx - cx;
    let dz = wz - cz;
    if (rotate) {
      const a = this._playerHeading();
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      dx = rx;
      dz = rz;
    }
    return { x: dx * scale, y: dz * scale };
  }

  _blip(ctx, x, y, color, shape, size) {
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (shape === 'diamond') {
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
    } else if (shape === 'square') {
      ctx.rect(x - size, y - size, size * 2, size * 2);
    } else {
      ctx.arc(x, y, size, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }

  _drawRoads(ctx, cx, cz, scale, rotate, size) {
    // CITY_DATA.roads is { vertical: [...x], horizontal: [...z] }.
    const roads = this._city.roads || {};
    ctx.strokeStyle = COLORS.road;
    ctx.lineWidth = Math.max(2, 7 * scale);
    ctx.lineCap = 'round';
    for (const at of roads.vertical || []) {
      const p = this._worldToMinimap(at, cz, cx, cz, scale, rotate);
      ctx.beginPath();
      ctx.moveTo(size / 2 + p.x, 0);
      ctx.lineTo(size / 2 + p.x, size);
      ctx.stroke();
    }
    for (const at of roads.horizontal || []) {
      const p = this._worldToMinimap(cx, at, cx, cz, scale, rotate);
      ctx.beginPath();
      ctx.moveTo(0, size / 2 + p.y);
      ctx.lineTo(size, size / 2 + p.y);
      ctx.stroke();
    }
  }

  _missionTarget() {
    const mission = this.state.mission;
    if (!mission || mission.status !== 'active') return null;
    // Live objective position (race gate, chase target, marker) when the
    // mission manager can provide one; fall back to the mission start.
    if (this.game.missions && typeof this.game.missions.objectivePosition === 'function') {
      const live = this.game.missions.objectivePosition();
      if (live) return live;
    }
    const def = MISSIONS.find((m) => m.id === mission.id);
    if (!def) return null;
    if (def.startPos && mission.objectiveIndex === 0) return { x: def.startPos.x, z: def.startPos.z };
    if (mission.data && mission.data.targetPos) return mission.data.targetPos;
    if (def.startPos) return { x: def.startPos.x, z: def.startPos.z };
    return null;
  }

  _policePositions() {
    const police = this.game.police;
    if (!police) return [];
    if (typeof police.cruiserPositions === 'function') return police.cruiserPositions();
    const out = [];
    const cruisers = police.cruisers || police.unitsList || [];
    for (const unit of cruisers) {
      if (unit.mesh) out.push({ x: unit.mesh.position.x, z: unit.mesh.position.z, hot: this.state.wanted >= 3 });
      else if (typeof unit.x === 'number') out.push({ x: unit.x, z: unit.z, hot: this.state.wanted >= 3 });
    }
    return out;
  }

  _hostilePositions() {
    const hostiles = this.game.hostiles;
    if (!hostiles) return [];
    const list = hostiles.list || hostiles.hostiles || [];
    const out = [];
    for (const hostile of list) {
      if (hostile.mesh && hostile.hp > 0) out.push({ x: hostile.mesh.position.x, z: hostile.mesh.position.z });
    }
    return out;
  }

  _shellPositions() {
    const collected = new Set(this.state.shellsCollected || []);
    const collectibles = this.game.collectibles;
    if (collectibles && typeof collectibles.positions === 'function') {
      return collectibles.positions().filter((p) => !collected.has(p.id));
    }
    return (this._city.shells || []).filter((p) => !collected.has(p.id));
  }

  drawMinimap() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const size = this.canvas.width;
    const half = size / 2;
    const pos = this.state.playerPos || { x: 0, z: 0 };
    const northUp = this.state.settings && this.state.settings.radarNorthUp;
    const rotate = !northUp;
    const scale = size / MINIMAP_RANGE;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, size, size);
    // Water along the south edge of the city. Sampled on a coarse grid
    // (12 px cells) so the per-frame cost stays small.
    if (this.game.city && typeof this.game.city.isWater === 'function') {
      ctx.fillStyle = COLORS.water;
      for (let gx = -half; gx < half; gx += 12) {
        for (let gz = -half; gz < half; gz += 12) {
          const wx = pos.x + gx / scale;
          const wz = pos.z + gz / scale;
          if (this.game.city.isWater(wx, wz)) ctx.fillRect(half + gx, half + gz, 12, 12);
        }
      }
    }
    this._drawRoads(ctx, pos.x, pos.z, scale, rotate, size);
    const plot = (wx, wz, color, shape, pxSize) => {
      const p = this._worldToMinimap(wx, wz, pos.x, pos.z, scale, rotate);
      if (Math.abs(p.x) > half || Math.abs(p.y) > half) return;
      this._blip(ctx, half + p.x, half + p.y, color, shape, pxSize);
    };
    // Shops (teal $) and taxi stands (yellow T) as lettered dots.
    for (const shop of this._city.shops || []) plot(shop.x, shop.z, COLORS.shop, 'circle', 5);
    for (const stand of this._city.taxiStands || []) plot(stand.x, stand.z, COLORS.taxi, 'square', 5);
    for (const shell of this._shellPositions()) plot(shell.x, shell.z, COLORS.shell, 'circle', 3);
    const pickups = this.game.pickups;
    if (pickups && typeof pickups.positions === 'function') {
      for (const pickup of pickups.positions()) plot(pickup.x, pickup.z, COLORS.pickup, 'circle', 4);
    }
    for (const cruiser of this._policePositions()) {
      plot(cruiser.x, cruiser.z, cruiser.hot ? COLORS.policeHot : COLORS.police, 'circle', 5);
    }
    for (const hostile of this._hostilePositions()) {
      plot(hostile.x, hostile.z, COLORS.hostile, 'diamond', 5);
    }
    const target = this._missionTarget();
    if (target) plot(target.x, target.z, COLORS.mission, 'diamond', 7);
    // Player arrow, always centred.
    ctx.save();
    ctx.translate(half, half);
    if (northUp) ctx.rotate(this._playerHeading());
    ctx.fillStyle = COLORS.player;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
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
    // Rim.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawFullMap() {
    if (!this.fullCtx || !this.fullCanvas) return;
    const ctx = this.fullCtx;
    const size = this.fullCanvas.width;
    const b = this._bounds;
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;
    const scale = size / Math.max(spanX, spanZ);
    const toMap = (wx, wz) => ({
      x: (wx - b.minX) * scale,
      y: (wz - b.minZ) * scale,
    });
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, size, size);
    // Districts as soft tinted blocks.
    for (const district of this._city.districts || []) {
      if (!district.bounds) continue;
      const topLeft = toMap(district.bounds.minX, district.bounds.minZ);
      ctx.fillStyle = district.color || 'rgba(255,255,255,0.04)';
      ctx.globalAlpha = 0.16;
      ctx.fillRect(topLeft.x, topLeft.y, (district.bounds.maxX - district.bounds.minX) * scale, (district.bounds.maxZ - district.bounds.minZ) * scale);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '600 13px Barlow, sans-serif';
      ctx.fillText(district.name, topLeft.x + 6, topLeft.y + 18);
    }
    // Water strip along the south edge.
    ctx.fillStyle = COLORS.water;
    const waterTop = toMap(0, this._city.waterLine !== undefined ? this._city.waterLine : b.maxZ - 24).y;
    ctx.fillRect(0, waterTop, size, size - waterTop);
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, waterTop - 4 * scale, size, 4 * scale);
    // Roads.
    ctx.strokeStyle = COLORS.road;
    ctx.lineWidth = Math.max(2, 7 * scale);
    const roads = this._city.roads || {};
    for (const at of roads.vertical || []) {
      const p = toMap(at, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, size);
      ctx.stroke();
    }
    for (const at of roads.horizontal || []) {
      const p = toMap(0, at);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(size, p.y);
      ctx.stroke();
    }
    const plot = (wx, wz, color, shape, pxSize) => {
      const p = toMap(wx, wz);
      this._blip(ctx, p.x, p.y, color, shape, pxSize);
    };
    for (const shop of this._city.shops || []) plot(shop.x, shop.z, COLORS.shop, 'circle', 7);
    for (const stand of this._city.taxiStands || []) plot(stand.x, stand.z, COLORS.taxi, 'square', 7);
    for (const shell of this._shellPositions()) plot(shell.x, shell.z, COLORS.shell, 'circle', 4);
    for (const cruiser of this._policePositions()) {
      plot(cruiser.x, cruiser.z, cruiser.hot ? COLORS.policeHot : COLORS.police, 'circle', 6);
    }
    for (const hostile of this._hostilePositions()) {
      plot(hostile.x, hostile.z, COLORS.hostile, 'diamond', 6);
    }
    const target = this._missionTarget();
    if (target) plot(target.x, target.z, COLORS.mission, 'diamond', 10);
    const pos = this.state.playerPos || { x: 0, z: 0 };
    const pp = toMap(pos.x, pos.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(this._playerHeading());
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this._fillMapPanels();
  }

  _missionStatus(mission) {
    const active = this.state.mission;
    if (active && active.id === mission.id && active.status === 'active') return 'ACTIVE';
    const passed = this.state.flags && this.state.flags['passed_' + mission.id];
    if (passed) return 'PASSED';
    return 'AVAILABLE';
  }

  _fillMapPanels() {
    const legend = document.getElementById('map-legend');
    if (legend) {
      legend.innerHTML = '';
      const entries = [
        ['White arrow', 'You'],
        ['Yellow diamond', 'Mission target'],
        ['Blue dot', 'Police'],
        ['Red dot', 'Hostile / hot pursuit'],
        ['Teal dot', 'Shop'],
        ['Yellow square', 'Taxi stand'],
        ['Orange dot', 'Sun Shell'],
        ['Green dot', 'Pickup'],
      ];
      for (const [icon, label] of entries) {
        const item = document.createElement('li');
        item.textContent = icon + ' — ' + label;
        legend.appendChild(item);
      }
    }
    const list = document.getElementById('map-missions');
    if (list) {
      list.innerHTML = '';
      for (const mission of MISSIONS) {
        const item = document.createElement('li');
        const status = this._missionStatus(mission);
        item.textContent = mission.id + ' · ' + mission.name + ' · $'
          + Math.floor(mission.payout).toLocaleString('en-US') + ' · ' + status;
        if (status === 'ACTIVE') item.classList.add('is-active');
        if (status === 'PASSED') item.classList.add('is-passed');
        list.appendChild(item);
      }
    }
    const stats = document.getElementById('map-stats');
    if (stats) {
      const s = this.state.stats || {};
      const lines = [
        'Completion: ' + Math.floor(this.state.completion) + '%',
        'Money: $' + Math.floor(this.state.money).toLocaleString('en-US'),
        'Reputation: ' + Math.floor(this.state.rep) + ' (Tier ' + this.state.repTier + ')',
        'Sun Shells: ' + this.state.shells + '/20',
        'Missions passed: ' + (s.missionsPassed || 0) + '/7',
        'Cars stolen: ' + (s.carsStolen || 0),
        'Cops lost: ' + (s.copsLost || 0),
        'Drifts: ' + (s.drifts || 0) + ' · Near misses: ' + (s.nearMiss || 0),
        'Shots fired: ' + (s.shotsFired || 0),
        'Time played: ' + Math.floor((s.timePlayed || 0) / 60) + ' min · Day ' + this.state.day,
      ];
      stats.textContent = lines.join('  ·  ');
    }
  }

  toggleMap() {
    if (this.mapOpen) this.closeMap();
    else this.openMap();
  }

  openMap() {
    const dialog = document.getElementById('map-screen');
    if (!dialog) return;
    this.mapOpen = true;
    this.state.paused = true;
    this.drawFullMap();
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    const closeBtn = document.getElementById('btn-map-close');
    if (closeBtn) closeBtn.focus();
  }

  closeMap() {
    const dialog = document.getElementById('map-screen');
    if (dialog && dialog.open) dialog.close();
    this.mapOpen = false;
    this.state.paused = false;
  }

  update(dt) {
    this.drawMinimap();
    if (this.mapOpen) this.drawFullMap();
  }
}
