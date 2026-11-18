// The DOM heads-up display: wanted stars, money with its green/red delta, health and
// armour bars, the weapon icon with ammo, the current vehicle and district/street, the
// mission objective subtitle, the interaction prompt, and the clock. All elements live
// in index.html; this class only updates them, and only when a value actually changes,
// so the HUD costs nothing on frames where nothing moved.
//
// Worker C (v2) additions, in their own region below the v1 elements: the car-radio
// widget (R cycles stations while driving; on foot R stays reload), the REP tier and
// Sun Shell counter (shown only when the game state carries them), the DRIFT / NEAR
// MISS event popup, and mission toasts with the giver's portrait. Worker B's panel
// response + NOS bar live in a separate region of this file — do not overlap.
//
// update(state) takes:
//   { wanted, wantedFlashing, money, moneyDelta, health, armour, weapon, ammo,
//     ammoReserve, vehicleName, district, street, speedKmh, objective, objectiveDetail,
//     prompt, clock, missionTimer, inVehicle,
//     rep?: { tierName, points } | string, shells?: { collected, total } }
//
// Worker B (v2) additions: the police response panel (hud/response.js), the
// NOS bar (a native <progress>, per the modern-web-guidance progress guide),
// the mouse-aim crosshair, the DRIFT / NEAR MISS driving popup, and the
// armour bar hiding itself at 0. All of them are created in code, not in
// index.html. (Worker C owns a separate showEventPopup in their branch; at
// merge keep ONE popup method and point main.js at it.)

import { createResponsePanel, drawResponse } from './response.js';
import { Radio } from '../data/radio.js';
import { MISSIONS } from '../data/missions.js';

const WEAPON_GLYPHS = {
  fists: '✊',
  pistol: '🔫',
  carbine: '🎯',
};

/** The crew, for mission-toast portraits (initials + role, no images). */
const CHARACTERS = {
  'Rico Vane': { initials: 'RV', role: 'The Driver', color: '#2a5f8a' },
  'Marco Salas': { initials: 'MS', role: 'The Fixer', color: '#8a6d2a' },
  'Lena Kross': { initials: 'LK', role: 'The Wheelwoman', color: '#a03a5a' },
  'Eddie Voss': { initials: 'EV', role: 'The Mark', color: '#3a3a3a' },
};

export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $('hud'),
      stars: $('hud-stars'),
      money: $('hud-money'),
      moneyDelta: $('hud-money-delta'),
      healthBar: $('hud-health-fill'),
      armourBar: $('hud-armour-fill'),
      healthWrap: $('hud-bars'),
      weapon: $('hud-weapon'),
      ammo: $('hud-ammo'),
      vehicle: $('hud-vehicle'),
      district: $('hud-district'),
      speed: $('hud-speed'),
      objective: $('hud-objective'),
      objectiveDetail: $('hud-objective-detail'),
      missionTimer: $('hud-mission-timer'),
      prompt: $('hud-prompt'),
      clock: $('hud-clock'),
      toast: $('hud-toast'),
      toastPortrait: $('hud-toast-portrait'),
      toastText: $('hud-toast-text'),
      toastSub: $('hud-toast-sub'),
      // Worker C (v2) elements.
      radio: $('hud-radio'),
      radioStation: $('hud-radio-station'),
      radioTrack: $('hud-radio-track'),
      rep: $('hud-rep'),
      shells: $('hud-shells'),
      eventPopup: $('hud-event-popup'),
      status: $('status'),
    };
    this.last = {};
    this.toastUntil = 0;
    this.deltaUntil = 0;
    this.drivePopupUntil = 0;

    // --- Worker B (v2): response panel, NOS bar, crosshair, driving popup ---
    // Created in code, not in index.html, so they never collide with other
    // workers' elements.
    this.responseEl = this.el.root ? createResponsePanel(this.el.root) : null;
    // The DRIFT / NEAR MISS popup. Same element id as Worker C's popup
    // (#hud-event-popup) so their index.html CSS applies at merge; fully
    // styled inline here so it works standalone on v1 markup too.
    this.drivePopup = document.createElement('div');
    this.drivePopup.id = 'hud-event-popup';
    this.drivePopup.setAttribute('aria-hidden', 'true');
    this.drivePopup.style.cssText = [
      'position:absolute',
      'top:18%',
      'left:50%',
      'transform:translateX(-50%)',
      'font-size:28px',
      'font-weight:800',
      'color:#ffd23f',
      'text-shadow:0 2px 6px rgba(0,0,0,0.8)',
      'pointer-events:none',
      'display:none',
    ].join(';');
    if (this.el.root) this.el.root.appendChild(this.drivePopup);
    // The NOS bar — a native <progress> (implicit progressbar role,
    // announced values) slotted into the bottom-right cluster above the
    // speedometer. Limited styling only: accent-color + width.
    this.nosWrap = document.createElement('div');
    this.nosWrap.id = 'hud-nos-wrap';
    this.nosWrap.style.cssText = 'display:none;text-align:right;margin-bottom:2px';
    const nosLabel = document.createElement('span');
    nosLabel.textContent = 'NOS ';
    nosLabel.style.cssText = 'font-size:14px;font-weight:700;color:#ffd23f;margin-right:6px';
    this.nosBar = document.createElement('progress');
    this.nosBar.id = 'hud-nos';
    this.nosBar.setAttribute('aria-label', 'Nitrous boost remaining');
    this.nosBar.max = 1;
    this.nosBar.value = 1;
    this.nosBar.style.cssText = 'width:200px;accent-color:#ffd23f;vertical-align:middle';
    this.nosWrap.append(nosLabel, this.nosBar);
    if (this.el.speed && this.el.speed.parentElement) {
      this.el.speed.parentElement.insertBefore(this.nosWrap, this.el.speed);
    }
    // The mouse-aim crosshair — a ring + dot positioned with transform
    // (compositor-only, no layout work per frame) and hidden on menus.
    this.crosshair = document.createElement('div');
    this.crosshair.id = 'hud-crosshair';
    this.crosshair.setAttribute('aria-hidden', 'true');
    this.crosshair.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:28px',
      'height:28px',
      'margin:-14px 0 0 -14px',
      'border:2px solid rgba(255,255,255,0.9)',
      'border-radius:50%',
      'box-shadow:0 0 0 1px rgba(0,0,0,0.5)',
      'mix-blend-mode:difference',
      'pointer-events:none',
      'display:none',
    ].join(';');
    const dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;top:50%;left:50%;width:4px;height:4px;margin:-2px 0 0 -2px;background:#fff;border-radius:50%';
    this.crosshair.appendChild(dot);
    if (this.el.root) this.el.root.appendChild(this.crosshair);

    this.eventPopupUntil = 0;

    // --- Car radio (v2, Worker C) ---
    // R cycles stations, but only while driving: on foot R is reload and
    // input.js owns it. The HUD is hidden on menu screens, so the key does
    // nothing there either. Station changes are announced through the page's
    // single polite live region (#status), never a second one.
    this.radio = new Radio();
    this.radio.onTrackChange = () => this._renderRadio(true);
    this._inVehicle = false;
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyR' || event.repeat) return;
      if (!this._inVehicle) return;
      if (this.el.root && this.el.root.style.display === 'none') return;
      this.radio.next();
      this._renderRadio(true);
    });
  }

  /** Show or hide the whole HUD (hidden on the start screen, shown in play). */
  setVisible(visible) {
    if (this.el.root) this.el.root.style.display = visible ? '' : 'none';
  }

  /** A centred toast line (mission title card, pickups) that fades after a few seconds. */
  toast(text, seconds = 3) {
    if (!this.el.toast) return;
    if (this.el.toastText) this.el.toastText.textContent = text;
    else this.el.toast.textContent = text;
    // A mission title card shows its giver: portrait, name and role.
    const mission = MISSIONS.find((m) => m.name === text);
    const character = mission ? CHARACTERS[mission.giver] : null;
    if (this.el.toastPortrait) {
      if (character) {
        this.el.toastPortrait.textContent = character.initials;
        this.el.toastPortrait.style.background = character.color;
        this.el.toastPortrait.style.display = '';
      } else {
        this.el.toastPortrait.style.display = 'none';
      }
    }
    if (this.el.toastSub) {
      if (character) {
        this.el.toastSub.textContent = `${mission.giver} · ${character.role}`;
        this.el.toastSub.style.display = '';
      } else {
        this.el.toastSub.style.display = 'none';
      }
    }
    this.el.toast.style.display = '';
    this.el.toast.style.opacity = '1';
    this.toastUntil = performance.now() + seconds * 1000;
  }

  /** Hide the toast at once (screenshot staging: the toast runs on wall-clock time). */
  clearToast() {
    if (!this.el.toast) return;
    this.el.toast.style.opacity = '0';
    this.el.toast.style.display = 'none';
    this.toastUntil = 0;
  }

  /** The one-line interaction prompt ("Press F to enter the Comet"), or null to hide it. */
  setPrompt(text) {
    if (!this.el.prompt) return;
    if (this.last.prompt === text) return;
    this.last.prompt = text;
    this.el.prompt.textContent = text ?? '';
    this.el.prompt.style.display = text ? '' : 'none';
  }

  setObjective(text, detail) {
    if (this.el.objective && this.last.objective !== text) {
      this.last.objective = text;
      this.el.objective.textContent = text ?? '';
      this.el.objective.style.display = text ? '' : 'none';
    }
    if (this.el.objectiveDetail && this.last.objectiveDetail !== detail) {
      this.last.objectiveDetail = detail;
      this.el.objectiveDetail.textContent = detail ?? '';
      this.el.objectiveDetail.style.display = detail ? '' : 'none';
    }
  }

  // --- Worker B (v2): response panel, NOS bar, crosshair, driving popup ---

  /** The police response panel — units from Police.responseUnits(). */
  updateResponse(units) {
    drawResponse(this.responseEl, units);
  }

  /** The NOS bar. `nos` is 0..1, or null when the player is on foot. */
  updateNos(nos, boosting = false) {
    if (!this.nosWrap || !this.nosBar) return;
    if (nos === null || nos === undefined) {
      if (this.last.nosVisible !== false) {
        this.last.nosVisible = false;
        this.nosWrap.style.display = 'none';
      }
      return;
    }
    if (this.last.nosVisible !== true) {
      this.last.nosVisible = true;
      this.nosWrap.style.display = '';
    }
    const value = Math.max(0, Math.min(1, nos));
    if (this.last.nos !== value) {
      this.last.nos = value;
      this.nosBar.value = value;
    }
    if (this.last.nosBoosting !== boosting) {
      this.last.nosBoosting = boosting;
      this.nosBar.style.accentColor = boosting ? '#ff8c1a' : '#ffd23f';
    }
  }

  /** The mouse-aim crosshair follows the pointer while on foot with a gun. */
  setCrosshair(pointer, visible) {
    if (!this.crosshair) return;
    const show = Boolean(visible && pointer && (pointer.x !== 0 || pointer.y !== 0));
    if (this.last.crosshairVisible !== show) {
      this.last.crosshairVisible = show;
      this.crosshair.style.display = show ? '' : 'none';
    }
    if (show) {
      this.crosshair.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;
    }
  }

  /** A gold driving popup ("DRIFT +$150", "NEAR MISS +$250") that fades by itself. */
  showDrivingPopup(text, seconds = 2.5) {
    if (!this.drivePopup) return;
    this.drivePopup.textContent = text;
    this.drivePopup.style.display = '';
    this.drivePopup.style.opacity = '1';
    this.drivePopupUntil = performance.now() + seconds * 1000;
  }


  // --- Worker C (v2): radio, REP, shells, event popup ---

  /** Force a radio station without starting audio (screenshot staging). */
  setRadioStation(index) {
    this.radio.setStation(index, false);
    this._renderRadio(false);
  }

  /** A gold event popup ("DRIFT +$25", "NEAR MISS +$10") that fades by itself. */
  showEventPopup(text, seconds = 2.5) {
    if (!this.el.eventPopup) return;
    this.el.eventPopup.textContent = text;
    this.el.eventPopup.style.display = '';
    this.el.eventPopup.style.opacity = '1';
    this.eventPopupUntil = performance.now() + seconds * 1000;
  }

  /** Refresh the radio widget from the radio state; announce on real changes. */
  _renderRadio(announceChange) {
    const current = this._inVehicle ? this.radio.current() : null;
    const key = current ? `${current.station.id}:${current.track.title}` : '';
    if (this.last.radio === key) return;
    this.last.radio = key;
    if (this.el.radio) this.el.radio.style.display = current ? '' : 'none';
    if (current) {
      if (this.el.radioStation) {
        this.el.radioStation.textContent = `♪ ${current.station.name} · ${current.station.tagline}`;
      }
      if (this.el.radioTrack) {
        this.el.radioTrack.textContent = `"${current.track.title}" — ${current.track.artist}`;
      }
      if (announceChange && this.el.status) {
        this.el.status.textContent = `Now playing ${current.track.title} by ${current.track.artist} on ${current.station.name}.`;
      }
    } else if (announceChange && this.el.status) {
      this.el.status.textContent = 'Radio off.';
    }
  }

  update(state) {
    const now = performance.now();
    if (this.el.toast && this.toastUntil && now > this.toastUntil) {
      this.el.toast.style.opacity = '0';
      this.toastUntil = 0;
    }
    if (this.el.moneyDelta && this.deltaUntil && now > this.deltaUntil) {
      this.el.moneyDelta.textContent = '';
      this.deltaUntil = 0;
    }
    if (this.drivePopup && this.drivePopupUntil && now > this.drivePopupUntil) {
      this.drivePopup.style.opacity = '0';
      this.drivePopupUntil = 0;
    }
    if (this.el.eventPopup && this.eventPopupUntil && now > this.eventPopupUntil) {
      this.el.eventPopup.style.opacity = '0';
      this.eventPopupUntil = 0;
    }

    // Radio follows the car: leaving it pauses the sound and hides the
    // widget, getting back in resumes both.
    const inVehicle = Boolean(state.inVehicle);
    if (inVehicle !== this._inVehicle) {
      this._inVehicle = inVehicle;
      if (!inVehicle) this.radio.pause();
      else this.radio.resume();
      this._renderRadio(false);
    }

    // Wanted stars: filled gold stars for the level, dim outlines for the rest; the
    // whole row flashes while the heat is cooling off.
    if (this.el.stars) {
      const level = state.wanted ?? 0;
      const key = `${level}:${state.wantedFlashing ? 1 : 0}`;
      if (this.last.stars !== key) {
        this.last.stars = key;
        let html = '';
        for (let i = 0; i < 5; i += 1) {
          html += `<span class="star${i < level ? ' on' : ''}">★</span>`;
        }
        this.el.stars.innerHTML = html;
        this.el.stars.classList.toggle('flashing', Boolean(state.wantedFlashing));
        this.el.stars.style.display = level > 0 ? '' : 'none';
      }
    }

    // Money, with a floating green/red delta when it changes.
    if (this.el.money) {
      const money = state.money ?? 0;
      if (this.last.money !== money) {
        if (this.last.money !== undefined && this.el.moneyDelta) {
          const delta = money - this.last.money;
          if (delta !== 0) {
            this.el.moneyDelta.textContent = `${delta > 0 ? '+' : '−'}$${Math.abs(delta).toLocaleString('en-US')}`;
            this.el.moneyDelta.className = delta > 0 ? 'delta gain' : 'delta loss';
            this.deltaUntil = now + 2500;
          }
        }
        this.last.money = money;
        this.el.money.textContent = `$${money.toLocaleString('en-US')}`;
      }
    }

    // REP tier (v2): shown only when the game state carries reputation.
    if (this.el.rep) {
      const rep = state.rep;
      let repText = '';
      if (typeof rep === 'string') repText = rep;
      else if (rep && typeof rep === 'object') {
        const tier = rep.tierName ?? rep.tier ?? '';
        const points = rep.points ?? rep.score;
        if (tier) repText = `REP · ${tier}${points != null ? ` · ${points}` : ''}`;
      }
      if (this.last.rep !== repText) {
        this.last.rep = repText;
        this.el.rep.textContent = repText;
        this.el.rep.style.display = repText ? '' : 'none';
      }
    }

    // Sun Shell counter (v2): shown only when the game state carries it.
    if (this.el.shells) {
      const shells = state.shells;
      const shellsText = shells && typeof shells.collected === 'number' && typeof shells.total === 'number'
        ? `🐚 ${shells.collected}/${shells.total}`
        : '';
      if (this.last.shells !== shellsText) {
        this.last.shells = shellsText;
        this.el.shells.textContent = shellsText;
        this.el.shells.style.display = shellsText ? '' : 'none';
      }
    }

    // Health / armour bars (0..100 each).
    if (this.el.healthBar) {
      const health = Math.max(0, Math.min(100, state.health ?? 100));
      if (this.last.health !== health) {
        this.last.health = health;
        this.el.healthBar.style.width = `${health}%`;
        this.el.healthBar.classList.toggle('low', health <= 25);
      }
    }
    if (this.el.armourBar) {
      const armour = Math.max(0, Math.min(100, state.armour ?? 0));
      if (this.last.armour !== armour) {
        this.last.armour = armour;
        this.el.armourBar.style.width = `${armour}%`;
        // v2 (Worker B): the armour bar hides itself at 0 instead of sitting
        // empty in every screenshot; it appears when armour is picked up.
        const bar = this.el.armourBar.parentElement;
        if (bar) bar.style.display = armour > 0 ? '' : 'none';
      }
    }
    if (this.el.healthWrap) {
      // The health bar is always drawn; only the armour bar hides at 0.
      this.el.healthWrap.style.display = '';
    }

    // Weapon icon + ammo (fists show no ammo count).
    if (this.el.weapon) {
      const weapon = state.weapon ?? 'fists';
      if (this.last.weapon !== weapon) {
        this.last.weapon = weapon;
        this.el.weapon.textContent = WEAPON_GLYPHS[weapon] ?? '✊';
      }
    }
    if (this.el.ammo) {
      const ammoText = state.weapon === 'fists'
        ? ''
        : `${state.ammo ?? 0} / ${state.ammoReserve ?? 0}`;
      if (this.last.ammo !== ammoText) {
        this.last.ammo = ammoText;
        this.el.ammo.textContent = ammoText;
      }
    }

    // Vehicle name + speed, or "On foot" when walking.
    if (this.el.vehicle) {
      const vehicle = state.inVehicle ? (state.vehicleName ?? 'Vehicle') : 'On foot';
      if (this.last.vehicle !== vehicle) {
        this.last.vehicle = vehicle;
        this.el.vehicle.textContent = vehicle;
      }
    }
    if (this.el.speed) {
      const speed = state.inVehicle ? `${Math.round(state.speedKmh ?? 0)} km/h` : '';
      if (this.last.speed !== speed) {
        this.last.speed = speed;
        this.el.speed.textContent = speed;
      }
    }
    if (this.el.district) {
      const place = [state.district, state.street].filter(Boolean).join(' — ');
      if (this.last.place !== place) {
        this.last.place = place;
        this.el.district.textContent = place;
      }
    }

    // Mission countdown, shown only while a timed mission runs.
    if (this.el.missionTimer) {
      const timer = state.missionTimer == null
        ? ''
        : `${Math.floor(state.missionTimer / 60)}:${String(Math.floor(state.missionTimer % 60)).padStart(2, '0')}`;
      if (this.last.timer !== timer) {
        this.last.timer = timer;
        this.el.missionTimer.textContent = timer;
        this.el.missionTimer.style.display = timer ? '' : 'none';
        this.el.missionTimer.classList.toggle('urgent', (state.missionTimer ?? 99) <= 10);
      }
    }

    // In-game clock (24 h).
    if (this.el.clock) {
      const clock = state.clock ?? '';
      if (this.last.clock !== clock) {
        this.last.clock = clock;
        this.el.clock.textContent = clock;
      }
    }

    if (state.objective !== undefined || state.objectiveDetail !== undefined) {
      this.setObjective(state.objective, state.objectiveDetail);
    }
    if (state.prompt !== undefined) this.setPrompt(state.prompt);
  }
}
