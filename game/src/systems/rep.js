// Rep: named reputation tiers with one unlock per tier. Tier is derived from
// state.rep, never stored as the source of truth, so loading a save can never
// desync it. Tier 2 makes Nitro purchasable in the shop (the shop gates on
// tier); unlocks.nitro itself means Nitro is installed, set by the purchase.

export class Rep {
  static TIERS = [
    { tier: 1, name: 'UNKNOWN', min: 0, unlock: null, unlockLabel: null },
    { tier: 2, name: 'STREET', min: 100, unlock: null, unlockLabel: 'Nitro now in stock at Chroma Auto' },
    { tier: 3, name: 'KNOWN', min: 300, unlock: 'shotgun', unlockLabel: 'Shotgun unlocked' },
    { tier: 4, name: 'RESPECTED', min: 600, unlock: 'supercar', unlockLabel: 'Supercar now spawns in the city' },
    { tier: 5, name: 'KINGPIN', min: 1000, unlock: 'm7', unlockLabel: 'The Last Job unlocked' },
  ];

  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.sync();
  }

  static tierFor(points) {
    let tier = 1;
    for (const def of Rep.TIERS) {
      if (points >= def.min) tier = def.tier;
    }
    return tier;
  }

  static tierDef(tier) {
    return Rep.TIERS.find((t) => t.tier === tier) || Rep.TIERS[0];
  }

  tier() {
    return Rep.tierFor(this.state.rep);
  }

  tierName() {
    return Rep.tierDef(this.tier()).name;
  }

  pointsToNext() {
    const next = Rep.TIERS.find((t) => t.min > this.state.rep);
    return next ? next.min - this.state.rep : 0;
  }

  // Re-derive the tier mirror and re-apply every unlock the current tier
  // grants. Called on load so a save can never lose an earned unlock.
  sync() {
    const tier = this.tier();
    this.state.repTier = tier;
    for (let t = 2; t <= tier; t++) this._applyUnlock(t);
    return tier;
  }

  addRep(n) {
    if (!Number.isFinite(n)) return this.tier();
    const before = this.tier();
    this.state.rep = Math.max(0, this.state.rep + n);
    const after = this.tier();
    this.state.repTier = after;
    if (after > before) {
      for (let t = before + 1; t <= after; t++) this._applyUnlock(t);
      const def = Rep.tierDef(after);
      const label = def.unlockLabel ? ` — ${def.unlockLabel}` : '';
      if (this.game.hud) this.game.hud.showEventPopup(`REP TIER UP — ${def.name}${label}`);
      this._sfx('rank-up');
      if (this.game.events) this.game.events.emit('repTierUp', { tier: after, name: def.name });
    }
    return after;
  }

  _applyUnlock(tier) {
    const def = Rep.tierDef(tier);
    if (def.unlock) this.state.unlocks[def.unlock] = true;
  }

  _sfx(name) {
    try {
      if (this.game.audio) this.game.audio.sfx(name);
    } catch (err) {
      // Audio is cosmetic; a missing sound must never break progression.
    }
  }
}
