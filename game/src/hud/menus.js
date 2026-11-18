// The full-screen menus: the start screen (New / Continue / How to Play), the pause
// menu with its MAP / BRIEF / STATS / SETTINGS tabs, the MISSION PASSED / FAILED card,
// and the WASTED / BUSTED card. The pause map is the full-city canvas from radar.js;
// clicking it drops a waypoint (purple) that the radar and the GPS route follow.
//
// Callbacks (passed to the constructor):
//   { onNew, onContinue, onHowTo, onResume, onQuitToTitle, onRestartMission,
//     onWaypoint: ({x, z}) => void, onSetting: (key, value) => void }
// showPause(state) takes the same state shape as drawFullMap plus:
//   { brief: [{title, done}], stats: {money, missionsDone, ...}, settings: {...} }

import { drawFullMap } from './radar.js';

const TABS = ['map', 'brief', 'stats', 'settings'];

export class Menus {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    const $ = (id) => document.getElementById(id);
    this.el = {
      start: $('menu-start'),
      howto: $('menu-howto'),
      pause: $('menu-pause'),
      mission: $('menu-mission'),
      missionTitle: $('mission-title'),
      missionText: $('mission-text'),
      dead: $('menu-dead'),
      deadTitle: $('dead-title'),
      deadText: $('dead-text'),
      mapCanvas: $('pause-map'),
      mapLegend: $('pause-map-legend'),
      briefList: $('brief-list'),
      statsList: $('stats-list'),
      continueBtn: $('btn-continue'),
      tabButtons: {},
      tabPanels: {},
    };
    for (const tab of TABS) {
      this.el.tabButtons[tab] = $(`tab-${tab}`);
      this.el.tabPanels[tab] = $(`panel-${tab}`);
    }
    this.mapTransform = null;
    this.activeTab = 'map';
    this.pauseState = null;
    this.waypoint = null;
    this.bind();
  }

  bind() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    on('btn-new', () => this.cb.onNew?.());
    on('btn-continue', () => this.cb.onContinue?.());
    on('btn-howto', () => this.showHowTo());
    on('btn-howto-back', () => this.showStart());
    on('btn-resume', () => this.cb.onResume?.());
    on('btn-quit-title', () => this.cb.onQuitToTitle?.());
    on('btn-mission-continue', () => this.hideMission());
    on('btn-mission-retry', () => this.cb.onRestartMission?.());
    on('btn-dead-continue', () => this.cb.onResume?.());
    for (const tab of TABS) {
      const btn = this.el.tabButtons[tab];
      if (btn) btn.addEventListener('click', () => this.selectTab(tab));
    }
    // Settings toggles report back through onSetting.
    for (const input of document.querySelectorAll('#panel-settings input, #panel-settings select')) {
      input.addEventListener('change', () => {
        const value = input.type === 'checkbox' ? input.checked : input.value;
        this.cb.onSetting?.(input.dataset.setting, value);
      });
    }
    // Click the pause map to drop (or move) a waypoint; the transform from the last
    // drawFullMap call turns the click back into world coordinates.
    if (this.el.mapCanvas) {
      this.el.mapCanvas.addEventListener('click', (event) => {
        if (!this.mapTransform) return;
        const rect = this.el.mapCanvas.getBoundingClientRect();
        const px = (event.clientX - rect.left) * (this.el.mapCanvas.width / rect.width);
        const py = (event.clientY - rect.top) * (this.el.mapCanvas.height / rect.height);
        const { scale, offsetX, offsetZ } = this.mapTransform;
        const waypoint = { x: (px - offsetX) / scale, z: (py - offsetZ) / scale };
        this.waypoint = waypoint;
        this.cb.onWaypoint?.(waypoint);
        if (this.pauseState) this.drawMap(this.pauseState);
      });
    }
  }

  hideAll() {
    for (const key of ['start', 'howto', 'pause', 'mission', 'dead']) {
      if (this.el[key]) this.el[key].style.display = 'none';
    }
  }

  /** Start screen. `hasSave` enables the Continue button. */
  showStart(hasSave = false) {
    this.hideAll();
    if (this.el.start) this.el.start.style.display = '';
    if (this.el.continueBtn) this.el.continueBtn.disabled = !hasSave;
  }

  showHowTo() {
    this.hideAll();
    if (this.el.howto) this.el.howto.style.display = '';
  }

  /** Pause menu; `state` feeds the map, the brief and the stats tabs. */
  showPause(state) {
    this.hideAll();
    this.pauseState = state;
    if (this.el.pause) this.el.pause.style.display = '';
    this.selectTab(this.activeTab);
    this.drawMap(state);
    this.fillBrief(state);
    this.fillStats(state);
  }

  hidePause() {
    if (this.el.pause) this.el.pause.style.display = 'none';
  }

  selectTab(tab) {
    this.activeTab = tab;
    for (const t of TABS) {
      this.el.tabButtons[t]?.classList.toggle('active', t === tab);
      if (this.el.tabPanels[t]) this.el.tabPanels[t].style.display = t === tab ? '' : 'none';
    }
    if (tab === 'map' && this.pauseState) this.drawMap(this.pauseState);
  }

  drawMap(state) {
    const canvas = this.el.mapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mapState = { ...state, waypoint: this.waypoint ?? state.waypoint };
    this.mapTransform = drawFullMap(ctx, mapState, canvas.width, canvas.height);
  }

  fillBrief(state) {
    const list = this.el.briefList;
    if (!list) return;
    const brief = state.brief ?? [];
    if (brief.length === 0) {
      list.innerHTML = '<li class="muted">No missions yet. Find the yellow <b>M</b> on the radar to start one.</li>';
      return;
    }
    list.innerHTML = brief.map((m) => (
      `<li class="${m.done ? 'done' : m.active ? 'active' : ''}">${m.done ? '✓ ' : ''}${m.title}${m.active ? ' — in progress' : ''}</li>`
    )).join('');
  }

  fillStats(state) {
    const list = this.el.statsList;
    if (!list) return;
    const s = state.stats ?? {};
    const rows = [
      ['Cash', `$${(s.money ?? 0).toLocaleString('en-US')}`],
      ['Missions completed', `${s.missionsDone ?? 0} / 3`],
      ['Cars stolen', `${s.carsStolen ?? 0}`],
      ['Times busted', `${s.busted ?? 0}`],
      ['Times wasted', `${s.wasted ?? 0}`],
      ['Distance driven', `${((s.distanceDriven ?? 0) / 1000).toFixed(1)} km`],
      ['Play time', `${Math.floor((s.playTime ?? 0) / 60)} min`],
    ];
    list.innerHTML = rows.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
  }

  /** Apply saved settings to the controls (checked boxes, selects). */
  applySettings(settings = {}) {
    for (const input of document.querySelectorAll('#panel-settings input, #panel-settings select')) {
      const value = settings[input.dataset.setting];
      if (value === undefined) continue;
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = String(value);
    }
  }

  /** The MISSION PASSED / FAILED card. `passed` picks the title; `text` is the detail. */
  showMission(passed, text, reward) {
    this.hideAll();
    if (!this.el.mission) return;
    this.el.mission.style.display = '';
    if (this.el.missionTitle) {
      this.el.missionTitle.textContent = passed ? 'MISSION PASSED' : 'MISSION FAILED';
      this.el.missionTitle.className = passed ? 'mission-title passed' : 'mission-title failed';
    }
    if (this.el.missionText) {
      this.el.missionText.textContent = text ?? '';
    }
    const retry = document.getElementById('btn-mission-retry');
    if (retry) retry.style.display = passed ? 'none' : '';
    const rewardEl = document.getElementById('mission-reward');
    if (rewardEl) {
      rewardEl.textContent = passed && reward ? `Reward: $${reward.toLocaleString('en-US')}` : '';
      rewardEl.style.display = passed && reward ? '' : 'none';
    }
  }

  hideMission() {
    if (this.el.mission) this.el.mission.style.display = 'none';
  }

  /** The WASTED / BUSTED card after death or arrest. */
  showDead(kind, text) {
    this.hideAll();
    if (!this.el.dead) return;
    this.el.dead.style.display = '';
    if (this.el.deadTitle) this.el.deadTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    if (this.el.deadText) this.el.deadText.textContent = text ?? '';
  }

  hideDead() {
    if (this.el.dead) this.el.dead.style.display = 'none';
  }
}
