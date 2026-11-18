// The DOM heads-up display: wanted stars, money with its green/red delta, health and
// armour bars, the weapon icon with ammo, the current vehicle and district/street, the
// mission objective subtitle, the interaction prompt, and the clock. All elements live
// in index.html; this class only updates them, and only when a value actually changes,
// so the HUD costs nothing on frames where nothing moved.
//
// update(state) takes:
//   { wanted, wantedFlashing, money, moneyDelta, health, armour, weapon, ammo,
//     ammoReserve, vehicleName, district, street, speedKmh, objective, objectiveDetail,
//     prompt, clock, missionTimer, inVehicle }

const WEAPON_GLYPHS = {
  fists: '✊',
  pistol: '🔫',
  carbine: '🎯',
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
    };
    this.last = {};
    this.toastUntil = 0;
    this.deltaUntil = 0;
  }

  /** Show or hide the whole HUD (hidden on the start screen, shown in play). */
  setVisible(visible) {
    if (this.el.root) this.el.root.style.display = visible ? '' : 'none';
  }

  /** A centred toast line (mission title card, pickups) that fades after a few seconds. */
  toast(text, seconds = 3) {
    if (!this.el.toast) return;
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastUntil = performance.now() + seconds * 1000;
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
      }
    }
    if (this.el.healthWrap) {
      // The armour bar is always drawn (empty at 0) so the bar pair never jumps.
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
