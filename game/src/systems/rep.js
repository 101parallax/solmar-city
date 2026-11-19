// Reputation: street standing that gates the shop, weapons, cars and M7.
// Five tiers from UNKNOWN to KINGPIN; crossing a tier applies its unlock,
// shows a TIER UP popup and plays the rank-up sound.

// Tier table shared by the shop, the HUD and the save system.
export const REP_TIERS = [
  { tier: 1, name: 'UNKNOWN', min: 0 },
  { tier: 2, name: 'STREET', min: 100 },
  { tier: 3, name: 'KNOWN', min: 300 },
  { tier: 4, name: 'RESPECTED', min: 600 },
  { tier: 5, name: 'KINGPIN', min: 1000 },
];

// Unlock applied when a tier is first reached (tier 2 needs no flag: the
// shop checks the tier directly before selling the Nitro Kit).
const TIER_UNLOCKS = {
  3: 'shotgun',
  4: 'supercar',
  5: 'm7',
};

export class Rep {
  constructor(game) {
    this.game = game;
  }

  // Current tier derived from reputation points (never from stored tier).
  tier() {
    const rep = this.game.state.rep || 0;
    let current = 1;
    for (const entry of REP_TIERS) {
      if (rep >= entry.min) current = entry.tier;
    }
    return current;
  }

  // Display name of the current tier, e.g. STREET or KINGPIN.
  tierName() {
    const entry = REP_TIERS.find((e) => e.tier === this.tier());
    return entry ? entry.name : 'UNKNOWN';
  }

  // Points still needed for the next tier; 0 at the top tier.
  pointsToNext() {
    const rep = this.game.state.rep || 0;
    const next = REP_TIERS.find((e) => e.min > rep);
    return next ? next.min - rep : 0;
  }

  // Progress toward the next tier as a 0..1 fraction for the HUD bar;
  // 1 when already at the top tier.
  progress() {
    const rep = this.game.state.rep || 0;
    const current = REP_TIERS.findLast((e) => e.min <= rep) ?? REP_TIERS[0];
    const next = REP_TIERS.find((e) => e.min > rep);
    if (!next) return 1;
    return Math.max(0, Math.min(1, (rep - current.min) / (next.min - current.min)));
  }

  // Recompute the stored tier from points (used after loading a save).
  syncTier() {
    this.game.state.repTier = this.tier();
    return this.game.state.repTier;
  }

  // Apply the unlock of one tier, if that tier carries one.
  applyUnlock(tierNumber) {
    const key = TIER_UNLOCKS[tierNumber];
    if (key) this.game.state.unlocks[key] = true;
    return key ?? null;
  }

  // Add reputation points. On a tier-up, apply every crossed unlock,
  // show a popup, play the rank-up sound and emit repTierUp.
  addRep(amount) {
    const state = this.game.state;
    state.rep = Math.max(0, (state.rep || 0) + amount);
    const nextTier = this.tier();
    const prevTier = state.repTier || 1;
    if (nextTier > prevTier) {
      const unlocked = [];
      for (let t = prevTier + 1; t <= nextTier; t += 1) {
        const key = this.applyUnlock(t);
        if (key) unlocked.push(key);
      }
      state.repTier = nextTier;
      this.game.hud?.showEventPopup?.(`TIER UP - ${this.tierName()}`);
      this.game.audio?.sfx?.('rank-up');
      this.game.events?.emit?.('repTierUp', { tier: nextTier, name: this.tierName(), unlocked });
    }
    return nextTier;
  }
}
