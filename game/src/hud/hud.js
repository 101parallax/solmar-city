// HUD controller: refreshes every on-screen readout from the shared game
// state each frame (money, vitals, wanted stars, REP, shells, speed, NOS,
// weapon, radio, objective, clock) and owns the transient messages
// (event popups, subtitles, toasts, floating damage numbers). Transient
// messages run on game-time countdowns so they expire deterministically
// before screenshots are taken.

import { RADIO_STATIONS, stationLabel, currentSong } from '../data/radio.js';

const WEAPON_NAMES = {
  pistol: 'PISTOL',
  carbine: 'CARBINE',
  shotgun: 'SHOTGUN',
};

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {};
    const ids = [
      'hud-money', 'hud-health', 'hud-health-bar', 'hud-armour', 'hud-armour-bar',
      'hud-wanted', 'hud-rep', 'hud-rep-tier', 'hud-shells', 'hud-speed',
      'hud-nos', 'hud-nos-bar', 'hud-weapon', 'hud-ammo', 'hud-radio',
      'hud-objective', 'hud-subtitle', 'hud-popup', 'hud-time', 'hud-completion',
      'crosshair', 'hud-damage-layer', 'hud-toast',
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this._toastLeft = 0;
    this._popupLeft = 0;
    this._subtitleLeft = 0;
    this._damageNodes = [];
    this._lastObjective = '';
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

  _setHidden(id, hidden) {
    const node = this.el[id];
    if (node) node.hidden = hidden;
  }

  update(dt) {
    const state = this.game.state;
    if (!state) return;
    this._tickTransients(dt);

    this._setText('hud-money', '$' + Math.floor(state.money).toLocaleString('en-US'));
    this._setText('hud-health', Math.ceil(state.health) + '');
    this._setBar('hud-health-bar', state.health / 100);
    const hasArmour = (state.armour || 0) > 0;
    this._setHidden('hud-armour', !hasArmour);
    if (hasArmour) {
      // NOTE: #hud-armour is the bar wrapper, so the number goes into its
      // .bar-value child; writing textContent on the wrapper would wipe
      // the bar track out of the DOM.
      const valueNode = this.el['hud-armour']
        ? this.el['hud-armour'].querySelector('.bar-value')
        : null;
      if (valueNode) valueNode.textContent = Math.ceil(state.armour) + '';
      this._setBar('hud-armour-bar', state.armour / 100);
    }

    const wanted = Math.max(0, Math.min(5, state.wanted || 0));
    this._setText('hud-wanted', '★'.repeat(wanted) + '☆'.repeat(5 - wanted));
    if (this.el['hud-wanted']) {
      this.el['hud-wanted'].classList.toggle('wanted-hot', wanted >= 3);
    }

    this._setText('hud-rep', Math.floor(state.rep || 0) + ' REP');
    const tierName = this.game.rep && typeof this.game.rep.tierName === 'function'
      ? this.game.rep.tierName()
      : 'TIER ' + (state.repTier || 1);
    this._setText('hud-rep-tier', tierName);
    this._setText('hud-shells', '◉ ' + (state.shells || 0) + '/20');
    this._setText('hud-completion', Math.floor(state.completion || 0) + '%');

    const hours = Math.floor(state.timeOfDay || 0) % 24;
    const minutes = Math.floor(((state.timeOfDay || 0) % 1) * 60);
    const clock = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
    this._setText('hud-time', clock + ' · DAY ' + (state.day || 1));

    const vehicle = state.playerInVehicle || null;
    const showSpeed = state.settings ? state.settings.showSpeed !== false : true;
    this._setHidden('hud-speed', !vehicle || !showSpeed);
    if (vehicle && showSpeed) {
      const kmh = Math.round(Math.abs(vehicle.speed || 0) * 3.6);
      this._setText('hud-speed', kmh + ' km/h');
    }
    const showNos = Boolean(vehicle && state.unlocks && state.unlocks.nitro);
    this._setHidden('hud-nos', !showNos);
    if (showNos) this._setBar('hud-nos-bar', (vehicle.nos || 0) / 100);

    const weapon = state.weapon || 'pistol';
    this._setText('hud-weapon', WEAPON_NAMES[weapon] || weapon.toUpperCase());
    const ammo = state.ammo ? state.ammo[weapon] : 0;
    this._setText('hud-ammo', String(ammo == null ? 0 : ammo));

    if (state.muted) {
      this._setText('hud-radio', 'MUTED');
    } else if (!state.radioOn) {
      this._setText('hud-radio', 'RADIO OFF');
    } else {
      const station = RADIO_STATIONS[state.radioStation || 0] || RADIO_STATIONS[0];
      this._setText('hud-radio', stationLabel(state.radioStation || 0) + ' · ' + currentSong(state.radioStation || 0, state.timeOfDay || 0));
    }

    const objective = this._objectiveText(state);
    if (objective !== this._lastObjective) {
      this._lastObjective = objective;
      this._setText('hud-objective', objective);
    }

    const inMenu = Boolean(state.paused) || Boolean(document.querySelector('dialog[open]'));
    this._setHidden('crosshair', Boolean(vehicle) || inMenu);
  }

  _objectiveText(state) {
    const mission = state.mission;
    if (!mission || mission.status !== 'active') return 'FREE ROAM — Explore Solmar City';
    const data = mission.data || {};
    if (typeof data.objectiveText === 'string' && data.objectiveText) {
      return 'NEXT: ' + data.objectiveText;
    }
    const objectives = mission.objectives || data.objectives || [];
    const current = objectives[mission.objectiveIndex || 0];
    if (current) {
      const label = current.label || current.text || current.type || '';
      const timer = typeof mission.timer === 'number' && mission.timer > 0
        ? ' · ' + Math.ceil(mission.timer) + 's'
        : '';
      return 'NEXT: ' + label + timer;
    }
    return 'NEXT: ' + (mission.name || mission.id || 'Mission');
  }

  _tickTransients(dt) {
    if (this._toastLeft > 0) {
      this._toastLeft -= dt;
      if (this._toastLeft <= 0) this._setHidden('hud-toast', true);
    }
    if (this._popupLeft > 0) {
      this._popupLeft -= dt;
      if (this._popupLeft <= 0) this._setHidden('hud-popup', true);
    }
    if (this._subtitleLeft > 0) {
      this._subtitleLeft -= dt;
      if (this._subtitleLeft <= 0) this._setHidden('hud-subtitle', true);
    }
    for (let i = this._damageNodes.length - 1; i >= 0; i -= 1) {
      const entry = this._damageNodes[i];
      entry.left -= dt;
      if (entry.left <= 0) {
        entry.node.remove();
        this._damageNodes.splice(i, 1);
      }
    }
  }

  // Big center-screen event banner (DRIFT, NEAR MISS, CHECKPOINT...).
  showEventPopup(text) {
    this._setText('hud-popup', text);
    this._setHidden('hud-popup', false);
    this._popupLeft = 4;
  }

  showSubtitle(text, seconds) {
    this._setText('hud-subtitle', text);
    this._setHidden('hud-subtitle', false);
    this._subtitleLeft = typeof seconds === 'number' ? seconds : 4;
  }

  // Toasts are transient status messages: they expire on their own, are
  // announced once through the polite live region, and never steal focus.
  showToast(text) {
    this._setText('hud-toast', text);
    this._setHidden('hud-toast', false);
    this._toastLeft = 3;
    this._announce(text);
  }

  _announce(text) {
    if (typeof document.ariaNotify === 'function') {
      try {
        document.ariaNotify(text);
        return;
      } catch (err) {
        // Fall through to the live-region fallback.
      }
    }
    const region = document.getElementById('sr-announcer');
    if (region) region.textContent = text;
  }

  // Floating damage number at screen coordinates (percent of viewport).
  addDamageNumber(text, xPercent, yPercent) {
    const layer = this.el['hud-damage-layer'];
    if (!layer) return;
    const node = document.createElement('span');
    node.className = 'damage-number';
    node.textContent = text;
    node.style.left = (xPercent == null ? 50 : xPercent) + '%';
    node.style.top = (yPercent == null ? 42 : yPercent) + '%';
    layer.appendChild(node);
    this._damageNodes.push({ node, left: 1.1 });
  }

  // Remove every transient message at once. Called by shots.js right
  // before a screenshot is marked ready so no toast, popup, subtitle, or
  // damage number can leak into the frame.
  clearTransients() {
    this._toastLeft = 0;
    this._popupLeft = 0;
    this._subtitleLeft = 0;
    this._setHidden('hud-toast', true);
    this._setHidden('hud-popup', true);
    this._setHidden('hud-subtitle', true);
    for (const entry of this._damageNodes) entry.node.remove();
    this._damageNodes = [];
  }
}
