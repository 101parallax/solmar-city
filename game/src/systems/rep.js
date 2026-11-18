// Reputation for Solmar City: named tiers the player climbs by finishing jobs.
// REP is the progression spine of v2 — every story mission pays REP, and each
// tier unlocks exactly one thing, so the player always sees what the next tier
// is for. Pure logic, no DOM: main.js owns the toasts and the unlock effects.
//
//   Tier 1 UNKNOWN   (0 REP)   — where Rico starts.
//   Tier 2 STREET    (25 REP)  — Nitro in stock at Chroma Auto.
//   Tier 3 KNOWN     (60 REP)  — the Kestrel 12 Scattergun is yours.
//   Tier 4 RESPECTED (100 REP) — an Apex Stradale waits at the Salas garage.
//   Tier 5 KINGPIN   (150 REP) — The Last Job opens.
// The six open missions pay 20 + 20 + 30 + 25 + 30 + 30 = 155 REP, so M7 opens
// exactly when the rest of the story is done.

export const REP_TIERS = [
  { tier: 1, name: 'UNKNOWN', min: 0, unlock: '' },
  { tier: 2, name: 'STREET', min: 25, unlock: 'Nitro now in stock at Chroma Auto' },
  { tier: 3, name: 'KNOWN', min: 60, unlock: 'Scattergun unlocked — press 3 to switch' },
  { tier: 4, name: 'RESPECTED', min: 100, unlock: 'Apex Stradale parked at the Salas garage' },
  { tier: 5, name: 'KINGPIN', min: 150, unlock: 'The Last Job is open — see Marco' },
];

/** The tier record for a points total (highest tier whose threshold is met). */
export function tierFor(points) {
  let current = REP_TIERS[0];
  for (const tier of REP_TIERS) {
    if (points >= tier.min) current = tier;
  }
  return current;
}

export class Rep {
  constructor(points = 0) {
    this.points = Math.max(0, points);
  }

  /** Current tier number (1..5). */
  get tier() {
    return tierFor(this.points).tier;
  }

  /** Current tier name ("UNKNOWN" .. "KINGPIN"). */
  get tierName() {
    return tierFor(this.points).name;
  }

  /** The unlock text of the current tier ('' for tier 1). */
  get unlock() {
    return tierFor(this.points).unlock;
  }

  /** Points still needed for the next tier (0 at the top). */
  pointsToNext() {
    const next = REP_TIERS.find((t) => t.min > this.points);
    return next ? next.min - this.points : 0;
  }

  /** True when the player meets a mission's tier requirement. */
  meetsTier(requiredTier) {
    return this.tier >= (requiredTier ?? 1);
  }

  /**
   * Add REP. Returns { gained, tierUp, newTier, unlock }: `tierUp` is true
   * when the gain crossed a tier boundary, `newTier` the tier record reached.
   */
  add(amount) {
    const before = this.tier;
    this.points = Math.max(0, this.points + amount);
    const after = this.tier;
    return {
      gained: amount,
      tierUp: after > before,
      newTier: tierFor(this.points),
      unlock: after > before ? tierFor(this.points).unlock : '',
    };
  }

  /** Plain value for the save file. */
  serialize() {
    return this.points;
  }
}
