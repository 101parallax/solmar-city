// Heat and wanted level: crimes add heat, heat decays when the player lies
// low and no police unit is close. Levels run 0-5, one star per 20 heat.
// Killing a cop weighs far more than stealing a car; shooting mission
// hostiles adds no heat at all.
export class Wanted {
  constructor(game) {
    this.game = game;
    this.heat = game.state?.heat ?? 0;
    this.levelValue = game.state?.wanted ?? 0;
    this.timeSinceCrime = 99;
  }

  addHeat(amount) {
    const previous = this.levelValue;
    this.heat = Math.max(0, Math.min(100, this.heat + amount));
    const level = this.heat <= 0 ? 0 : Math.min(5, Math.floor(this.heat / 20) + 1);
    this.levelValue = level;
    if (this.game.state) {
      this.game.state.heat = this.heat;
      this.game.state.wanted = level;
    }
    if (level !== previous) {
      this.game.events?.emit?.('wantedChanged', { level, previous });
    }
  }

  addCrime(type) {
    const weights = {
      steal: 15, speeding: 5, shootCop: 25, killCop: 50,
      killPed: 30, shootPed: 3, shootHostile: 0,
    };
    const weight = weights[type] ?? 10;
    if (weight > 0) this.timeSinceCrime = 0;
    this.addHeat(weight);
  }

  decay(dt) {
    this.timeSinceCrime += dt;
    if (this.heat <= 0 || this.timeSinceCrime < 5) return;
    // Heat only cools off when no police unit is watching.
    const nearest = this.game.police?.nearestUnitDistance?.() ?? Infinity;
    if (nearest < 30) return;
    this.addHeat(-1.6 * dt);
  }

  update(dt) {
    this.decay(dt);
  }

  setWanted(level) {
    const clamped = Math.max(0, Math.min(5, Math.round(level)));
    const previous = this.levelValue;
    // A freshly raised wanted level gets a grace period before it can decay,
    // so staged states (missions, screenshots) do not cool off instantly.
    if (clamped > previous) this.timeSinceCrime = 0;
    this.heat = clamped === 0 ? 0 : (clamped - 1) * 20 + 10;
    this.levelValue = clamped;
    if (this.game.state) {
      this.game.state.heat = this.heat;
      this.game.state.wanted = clamped;
    }
    if (clamped !== previous) {
      this.game.events?.emit?.('wantedChanged', { level: clamped, previous });
    }
  }

  clearWanted() {
    const previous = this.levelValue;
    this.heat = 0;
    this.levelValue = 0;
    if (this.game.state) {
      this.game.state.heat = 0;
      this.game.state.wanted = 0;
    }
    if (previous !== 0) {
      this.game.events?.emit?.('wantedChanged', { level: 0, previous });
    }
  }

  level() {
    return this.levelValue;
  }
}
