// Wanted level (0-5 stars) for Solmar City.
//
// Crimes add heat. A witnessed crime adds its full weight; an unwitnessed one
// adds only a third, so stealing a car with nobody watching is still risky but
// rarely stars you on the spot. The star level is the whole-number part of the
// heat, capped at 5.
//
// While the player is out of sight of every officer, a hide timer runs. Once
// it passes the hide delay the stars start flashing, then bleed away one at a
// time until the heat is gone. Being seen again resets the timer and stops the
// flashing. Respray (Chroma Auto, $250, charged by the caller) clears the heat
// instantly through clearWanted().
//
// The police manager (entities/police.js, Worker B) is injected through the
// constructor. Wanted only calls it when the method exists, so this module is
// safe to run with a null police manager in logic tests:
//   police.setPursuit(level, playerPos)  - keep `level` cruisers chasing
//   police.releaseAll()                  - stand the pursuit down
// At 1-2 stars officers try to arrest (BUSTED); at 3+ they shoot. The arrest
// itself is decided here: an officer standing next to the player on foot for
// ARREST_SECONDS raises `busted`, which main.js turns into the BUSTED screen.

export const CRIME_WEIGHT = {
  shooting: 1,
  assault: 1,
  runover: 2,
  steal: 1,
};

export const MAX_WANTED = 5;

/** Seconds out of sight before the stars start flashing. */
export const HIDE_DELAY = 12;
/** Seconds per star lost while flashing. */
export const DECAY_PER_STAR = 2;
/** Seconds an officer must stand next to the player on foot to arrest. */
export const ARREST_SECONDS = 2;

export class Wanted {
  constructor(police = null) {
    this.police = police;
    this.heat = 0;
    this.level = 0;
    this.flashing = false;
    this.busted = false;
    this._unseenTimer = 0;
    this._decayTimer = 0;
    this._arrestTimer = 0;
    this._lastNotifiedLevel = 0;
  }

  /** Register a crime. `witnessed` means a cop or a bystander saw it happen. */
  addCrime(type, pos, witnessed = true) {
    const weight = CRIME_WEIGHT[type] ?? 1;
    this.heat = Math.min(MAX_WANTED, this.heat + (witnessed ? weight : weight / 3));
    this._syncLevel();
    // A fresh crime ends any escape in progress.
    this._unseenTimer = 0;
    this._decayTimer = 0;
    this.flashing = false;
  }

  /**
   * Advance the wanted state. `policeVisible` is true while any officer or
   * cruiser can see the player. `opts` carries arrest context:
   *   { onFoot: bool, officerClose: bool }
   */
  update(dt, playerPos, policeVisible, opts = {}) {
    if (this.busted || this.level === 0) {
      this.flashing = false;
      return;
    }

    if (policeVisible) {
      this._unseenTimer = 0;
      this._decayTimer = 0;
      this.flashing = false;
    } else {
      this._unseenTimer += dt;
      if (this._unseenTimer >= HIDE_DELAY) {
        this.flashing = true;
        this._decayTimer += dt;
        if (this._decayTimer >= DECAY_PER_STAR) {
          this._decayTimer = 0;
          this.heat = Math.max(0, this.heat - 1);
          this._syncLevel();
          if (this.level === 0) {
            this.flashing = false;
            this._unseenTimer = 0;
          }
        }
      }
    }

    // Arrest: only at 1-2 stars, only on foot, only with an officer adjacent.
    if (this.level <= 2 && opts.onFoot && opts.officerClose) {
      this._arrestTimer += dt;
      if (this._arrestTimer >= ARREST_SECONDS) {
        this.busted = true;
      }
    } else {
      this._arrestTimer = 0;
    }
  }

  /** Respray / pay-off: wipe the heat and stand the pursuit down. */
  clearWanted() {
    this.heat = 0;
    this.level = 0;
    this.flashing = false;
    this._unseenTimer = 0;
    this._decayTimer = 0;
    this._arrestTimer = 0;
    this._notifyPolice(null);
  }

  /** How many cruisers the pursuit should field right now (one per star). */
  cruisersWanted() {
    return this.level;
  }

  /** Reset everything (new game, or after the BUSTED/WASTED screen). */
  reset() {
    this.clearWanted();
    this.busted = false;
  }

  _syncLevel() {
    const next = Math.min(MAX_WANTED, Math.floor(this.heat));
    if (next !== this.level) {
      this.level = next;
      this._notifyPolice();
    }
  }

  _notifyPolice(playerPos) {
    if (!this.police) return;
    if (this.level === 0) {
      if (typeof this.police.releaseAll === 'function') this.police.releaseAll();
      this._lastNotifiedLevel = 0;
      return;
    }
    if (this.level !== this._lastNotifiedLevel && typeof this.police.setPursuit === 'function') {
      this.police.setPursuit(this.level, playerPos ?? null);
      this._lastNotifiedLevel = this.level;
    }
  }
}
