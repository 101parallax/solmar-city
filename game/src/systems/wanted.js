// Wanted: heat-based police attention. Crimes add heat, heat maps to a
// 0-5 wanted level, and heat decays over time when the player lays low.
// All timers run on accumulated dt, never on wall-clock time.
export class Wanted {
  constructor(game) {
    this.game = game;
    this.crimeCooldown = 0;
    this.levelThresholds = [10, 30, 50, 70, 90];
    this.crimeWeights = {
      steal: 12,
      shootCop: 6,
      killCop: 45,
      killPed: 30,
      speeding: 4,
      shootHostile: 0,
      assault: 8,
    };
  }

  level() {
    return this.game.state.wanted || 0;
  }

  levelForHeat(heat) {
    let level = 0;
    for (let i = 0; i < this.levelThresholds.length; i++) {
      if (heat >= this.levelThresholds[i]) level = i + 1;
    }
    return level;
  }

  syncLevel() {
    const state = this.game.state;
    const next = this.levelForHeat(state.heat);
    if (next !== state.wanted) {
      const previous = state.wanted;
      state.wanted = next;
      this.game.events?.emit('wantedChanged', {
        level: next,
        heat: state.heat,
      });
      // Siren blip only when heat rises, not when it cools off.
      if (next > previous) this.game.audio?.sfx?.('sirenBlip');
    }
  }

  addHeat(n) {
    const state = this.game.state;
    state.heat = Math.max(0, Math.min(100, state.heat + n));
    this.crimeCooldown = 8;
    this.syncLevel();
  }

  addCrime(type) {
    const weight = this.crimeWeights[type] ?? 5;
    if (weight === 0) return;
    this.addHeat(weight);
  }

  decay(dt) {
    const state = this.game.state;
    if (state.heat <= 0) return;
    if (this.crimeCooldown > 0) {
      this.crimeCooldown -= dt;
      return;
    }
    // Heat cools faster when no police unit is close enough to see the
    // player; otherwise it cools slowly so a chase does not end by itself.
    const nearest = this.game.police?.nearestUnitDistance?.() ?? Infinity;
    const rate = nearest > 60 ? 4 : 1.2;
    state.heat = Math.max(0, state.heat - rate * dt);
    this.syncLevel();
    if (state.wanted === 0 && state.heat === 0) {
      this.game.events?.emit('wantedCleared', {});
    }
  }

  update(dt) {
    this.decay(dt);
  }

  setWanted(n) {
    const clamped = Math.max(0, Math.min(5, Math.round(n)));
    const state = this.game.state;
    if (clamped === 0) {
      state.heat = 0;
    } else {
      // Put heat in the middle of the target level band so it is stable.
      const low = this.levelThresholds[clamped - 1];
      const high = clamped < 5 ? this.levelThresholds[clamped] : 100;
      state.heat = (low + high) / 2;
    }
    this.crimeCooldown = 8;
    this.syncLevel();
  }

  clearWanted() {
    const state = this.game.state;
    state.heat = 0;
    state.wanted = 0;
    this.crimeCooldown = 0;
    this.game.events?.emit('wantedChanged', { level: 0, heat: 0 });
    this.game.events?.emit('wantedCleared', {});
  }
}
