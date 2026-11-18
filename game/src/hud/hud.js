// HUD for Solmar City: every on-screen readout is refreshed from the shared
// game state each frame. Transient elements (toast, event popup, subtitle)
// run on simulation time so screenshots can expire them deterministically,
// and clearTransients() removes all of them at once for staged shots.

import { MISSIONS } from '../data/missions.js';

const WEAPON_NAMES = { pistol: 'PISTOL', carbine: 'CARBINE', shotgun: 'SHOTGUN' };

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {};
    const ids = [
      'hud-money', 'hud-health', 'hud-health-bar', 'hud-armour', 'hud-armour-bar',
      'hud-wanted', 'hud-rep', 'hud-rep-tier', 'hud-shells', 'hud-speed',
      'hud-nos', 'hud-nos-bar', 'hud-weapon', 'hud-ammo', 'hud-radio',
      'hud-objective', 'hud-subtitle', 'hud-popup', 'hud-toast', 'hud-announcer',
      'hud-time', 'hud-completion', 'crosshair', 'hud-damage-layer',
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this._toastTimer = 0;
    this._popupTimer = 0;
    this._subtitleTimer = 0;
    this._toastVisible = false;
    this._lastObjective = '';
    this._lastMoney = null;
    this._supportsPopover = typeof HTMLElement !== 'undefined'
      && Object.hasOwn(HTMLElement.prototype, 'popover');
  }

  get state() {
    return this.game.state;
  }

  _setText(id, text) {
    const node = this.el[id];
    if (node && node.textContent !== text) node.textContent = text;
  }

  _setBar(id, fraction) {
    const node = this.el[id];
    if (!node) return;
    const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
    const value = pct + '%';
    if (node.style.width !== value) node.style.width = value;
  }

  _show(node, visible) {
    if (!node) return;
    node.classList.toggle('is-hidden', !visible);
  }

  _announce(text) {
    // Screen-reader announcement: prefer the ariaNotify API when present,
    // fall back to the polite live region that exists in the shell.
    try {
      if (typeof document.ariaNotify === 'function') {
        document.ariaNotify(text);
        return;
      }
    } catch (err) { /* fall through to the live region */ }
    const region = this.el['hud-announcer'];
    if (region) region.textContent = text;
  }

  showToast(text) {
    const toast = this.el['hud-toast'];
    if (!toast) return;
    toast.textContent = text;
    this._toastTimer = 4;
    if (this._supportsPopover) {
      try {
        if (!this._toastVisible) toast.showPopover();
      } catch (err) { /* popover unsupported at runtime; use class fallback */ }
      toast.classList.remove('is-hidden');
    } else {
      toast.classList.remove('is-hidden');
    }
    this._toastVisible = true;
    this._announce(text);
  }

  _hideToast() {
    const toast = this.el['hud-toast'];
    if (!toast || !this._toastVisible) return;
    if (this._supportsPopover) {
      try { toast.hidePopover(); } catch (err) { /* already hidden */ }
    }
    toast.classList.add('is-hidden');
    this._toastVisible = false;
  }

  showEventPopup(text) {
    const popup = this.el['hud-popup'];
    if (!popup) return;
    popup.textContent = text;
    popup.classList.remove('is-hidden');
    // Restart the pop animation by re-triggering the class.
    popup.classList.remove('pop-anim');
    void popup.offsetWidth;
    popup.classList.add('pop-anim');
    this._popupTimer = 2.5;
    this._announce(text);
  }

  showSubtitle(text, seconds = 4) {
    const sub = this.el['hud-subtitle'];
    if (!sub) return;
    sub.textContent = text;
    sub.classList.remove('is-hidden');
    this._subtitleTimer = seconds;
  }

  // Remove every transient element immediately. Shots call this before
  // marking the frame ready so no toast, popup or subtitle leaks into a
  // screenshot.
  clearTransients() {
    this._hideToast();
    this._toastTimer = 0;
    this._popupTimer = 0;
    this._subtitleTimer = 0;
    const popup = this.el['hud-popup'];
    if (popup) popup.classList.add('is-hidden');
    const sub = this.el['hud-subtitle'];
    if (sub) sub.classList.add('is-hidden');
  }

  _objectiveText() {
    const mission = this.state.mission;
    if (!mission || mission.status !== 'active') return '';
    const def = MISSIONS.find((m) => m.id === mission.id);
    const objective = def && def.objectives ? def.objectives[mission.objectiveIndex] : null;
    let text = def ? def.name.toUpperCase() : mission.id;
    if (objective) text += ' · ' + this._describeObjective(objective, mission);
    if (mission.timer !== null && mission.timer !== undefined) {
      text += ' · ' + Math.max(0, Math.ceil(mission.timer)) + 's';
    }
    return text;
  }

  _describeObjective(objective, mission) {
    const data = mission.data || {};
    switch (objective.type) {
      case 'goto':
        // Labels are full instructions ("Meet Marco", "Reach the
        // warehouse"): prefixing "GO TO " would read "GO TO Meet Marco".
        return (objective.label || 'THE MARKER').toUpperCase();
      case 'steal':
        return 'STEAL THE ' + (objective.vehicle || 'TARGET CAR');
      case 'deliver':
        // Same: the label already says "Deliver ... to the garage".
        return (objective.label || 'THE DROP-OFF').toUpperCase();
      case 'race': {
        const total = objective.checkpoints ? objective.checkpoints.length : (objective.count || 0);
        // MissionManager tracks race progress as gateIndex.
        const done = data.gateIndex !== undefined ? data.gateIndex : (data.checkpointIndex || 0);
        return total ? 'CHECKPOINT ' + (done + 1) + '/' + total : 'RACE THE COURSE';
      }
      case 'defeat': {
        const total = objective.count || 0;
        // Live count from the hostiles system; fall back to staged data.
        const alive = this.game.hostiles && typeof this.game.hostiles.alive === 'function'
          ? this.game.hostiles.alive()
          : undefined;
        const left = alive !== undefined ? alive : (data.remaining !== undefined ? data.remaining : total);
        return 'DEFEAT HOSTILES · ' + left + ' LEFT';
      }
      case 'escape':
        return 'LOSE THE COPS';
      case 'chase':
        return 'STOP THE TARGET VEHICLE';
      case 'timed':
        return 'DELIVER BEFORE TIME RUNS OUT';
      default:
        return 'NEXT OBJECTIVE';
    }
  }

  _formatTime() {
    const hours = Math.floor(this.state.timeOfDay) % 24;
    const minutes = Math.floor((this.state.timeOfDay % 1) * 60);
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return hh + ':' + mm + ' · DAY ' + this.state.day;
  }

  _radioText() {
    if (!this.state.radioOn) return 'RADIO OFF · PRESS R';
    const audio = this.game.audio;
    if (audio && typeof audio.currentTrack === 'function') {
      const track = audio.currentTrack();
      return track.station + ' — ' + track.title + ' · ' + track.artist;
    }
    return 'RADIO ON · PRESS R';
  }

  update(dt) {
    const s = this.state;
    // Money (only touch the DOM when it changed).
    if (s.money !== this._lastMoney) {
      this._setText('hud-money', '$' + Math.floor(s.money).toLocaleString('en-US'));
      this._lastMoney = s.money;
    }
    this._setBar('hud-health-bar', s.health / 100);
    const healthWrap = this.el['hud-health'];
    if (healthWrap) healthWrap.classList.toggle('is-low', s.health <= 25);
    // Armour bar stays hidden until the player actually has armour.
    this._show(this.el['hud-armour'], s.armour > 0);
    if (s.armour > 0) this._setBar('hud-armour-bar', s.armour / 100);
    // Wanted stars: filled for the current level, hollow above it.
    let stars = '';
    for (let i = 1; i <= 5; i++) stars += i <= s.wanted ? '★' : '☆';
    this._setText('hud-wanted', stars);
    const wantedEl = this.el['hud-wanted'];
    if (wantedEl) wantedEl.classList.toggle('is-hot', s.wanted > 0);
    // Reputation points + tier name.
    this._setText('hud-rep', 'REP ' + Math.floor(s.rep));
    let tierName = 'TIER ' + s.repTier;
    if (this.game.rep && typeof this.game.rep.tierName === 'function') {
      tierName = this.game.rep.tierName().toUpperCase();
    }
    this._setText('hud-rep-tier', tierName);
    this._setText('hud-shells', 'SHELLS ' + s.shells + '/20');
    // Speed and NOS only make sense inside a vehicle.
    const vehicle = s.playerInVehicle;
    const showSpeed = s.settings && s.settings.showSpeed !== false;
    if (vehicle && showSpeed) {
      const kmh = Math.round((vehicle.speed || 0) * 3.6);
      this._setText('hud-speed', kmh + ' KM/H');
      this._show(this.el['hud-speed'], true);
    } else {
      this._show(this.el['hud-speed'], false);
    }
    const hasNos = Boolean(vehicle && s.unlocks && s.unlocks.nitro);
    this._show(this.el['hud-nos'], hasNos);
    if (hasNos) this._setBar('hud-nos-bar', (vehicle.nos || 0) / 100);
    // Weapon + ammo.
    const weaponName = WEAPON_NAMES[s.weapon] || String(s.weapon).toUpperCase();
    this._setText('hud-weapon', weaponName);
    const ammo = s.ammo ? s.ammo[s.weapon] : 0;
    this._setText('hud-ammo', String(ammo !== undefined ? ammo : 0));
    const ammoEl = this.el['hud-ammo'];
    if (ammoEl) ammoEl.classList.toggle('is-low', (ammo || 0) <= 6);
    this._setText('hud-radio', this._radioText());
    // Objective line: only when a mission or side job is active.
    const objective = this._objectiveText();
    if (objective !== this._lastObjective) {
      this._setText('hud-objective', objective ? 'NEXT: ' + objective : '');
      this._lastObjective = objective;
    }
    this._show(this.el['hud-objective'], objective.length > 0);
    this._setText('hud-time', this._formatTime());
    this._setText('hud-completion', Math.floor(s.completion) + '% COMPLETE');
    // Crosshair is only relevant on foot with a weapon out.
    this._show(this.el['crosshair'], !vehicle);
    // Transient timers run on simulation time.
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this._hideToast();
    }
    if (this._popupTimer > 0) {
      this._popupTimer -= dt;
      if (this._popupTimer <= 0) {
        const popup = this.el['hud-popup'];
        if (popup) popup.classList.add('is-hidden');
      }
    }
    if (this._subtitleTimer > 0) {
      this._subtitleTimer -= dt;
      if (this._subtitleTimer <= 0) {
        const sub = this.el['hud-subtitle'];
        if (sub) sub.classList.add('is-hidden');
      }
    }
  }
}
