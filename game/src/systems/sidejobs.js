// Side activities for Solmar City: a street race and taxi fares. Both run
// outside the story missions (one job at a time, never during a mission), pay
// cash plus a little REP, and feed the HUD objective line while they run.
// Pure logic, no DOM: main.js owns the prompts, the markers and the rewards.
//
// Street race: a fixed 5-gate Downtown loop from the start flag on Solmar
// Blvd, 75 seconds, $600 + 10 REP. Taxi fares: four stands around the city;
// pick a passenger up, drive them to their destination (fixed rotation, so
// the fares are deterministic), $40–$90 by distance + 2 REP.

export const RACE_START = { x: 0, z: -140 };
export const RACE_TIME = 75;
export const RACE_REWARD = 600;
export const RACE_REP = 10;

export const RACE_GATES = [
  { x: 0, z: -140 },
  { x: 140, z: -140 },
  { x: 140, z: 0 },
  { x: 0, z: 0 },
  { x: 0, z: -140 },
];

export const FARE_STANDS = [
  { x: -210, z: 210, name: 'South Docks stand' },
  { x: 210, z: -140, name: 'Halcyon stand' },
  { x: 0, z: 70, name: 'Central St stand' },
  { x: -70, z: -210, name: 'Northgate stand' },
];

/** Fare destinations, taken in rotation (deterministic, no RNG). */
export const FARE_DESTINATIONS = [
  { x: 210, z: 210, name: 'Vista Hills' },
  { x: -210, z: -140, name: 'Harbor' },
  { x: 140, z: 70, name: 'Downtown' },
  { x: -140, z: 140, name: 'Mercado' },
  { x: 70, z: 280, name: 'Southgate' },
  { x: -70, z: -70, name: 'Plaza del Sol' },
];

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class SideJobs {
  constructor() {
    this.job = null; // { kind: 'race' | 'taxi', ... } while one runs
    this.fareIndex = 0;
    this.completed = 0;
  }

  get active() {
    return this.job !== null;
  }

  /** Start the street race. Returns false when a job is already running. */
  startRace() {
    if (this.job) return false;
    this.job = {
      kind: 'race',
      gateIndex: 0,
      timeLeft: RACE_TIME,
      failed: false,
    };
    return true;
  }

  /** Pick up a fare from a stand. Returns false when a job is running. */
  startFare(fromPos) {
    if (this.job) return false;
    const dest = FARE_DESTINATIONS[this.fareIndex % FARE_DESTINATIONS.length];
    this.fareIndex += 1;
    // $40 base + $1 per 8 metres, rounded to the nearest $5.
    const fare = Math.max(40, Math.round((40 + distance(fromPos, dest) / 8) / 5) * 5);
    this.job = {
      kind: 'taxi',
      dest: { x: dest.x, z: dest.z },
      destName: dest.name,
      fare,
    };
    return true;
  }

  /**
   * Advance the active job. Returns a result object when the job ends this
   * step — { kind, passed, reward, rep, reason } — or null while it runs.
   */
  update(dt, state) {
    if (!this.job) return null;
    const pos = state.playerPos ?? { x: 0, z: 0 };
    if (this.job.kind === 'race') {
      this.job.timeLeft -= dt;
      if (this.job.timeLeft <= 0) {
        this.job = null;
        return { kind: 'race', passed: false, reward: 0, rep: 0, reason: 'Out of time.' };
      }
      const gate = RACE_GATES[this.job.gateIndex];
      if (gate && distance(pos, gate) <= 12) {
        this.job.gateIndex += 1;
        if (this.job.gateIndex >= RACE_GATES.length) {
          this.job = null;
          this.completed += 1;
          return { kind: 'race', passed: true, reward: RACE_REWARD, rep: RACE_REP, reason: '' };
        }
      }
      return null;
    }
    // Taxi fare: reach the destination to get paid.
    if (distance(pos, this.job.dest) <= 12) {
      const { fare } = this.job;
      this.job = null;
      this.completed += 1;
      return { kind: 'taxi', passed: true, reward: fare, rep: 2, reason: '' };
    }
    return null;
  }

  /** Cancel the active job (player walked away / started a mission). */
  cancel() {
    this.job = null;
  }

  /** HUD objective line for the active job, or ''. */
  getObjectiveText() {
    if (!this.job) return '';
    if (this.job.kind === 'race') {
      return `Street Race — Gate ${Math.min(this.job.gateIndex + 1, RACE_GATES.length)} of ${RACE_GATES.length}`;
    }
    return `Taxi fare — drop off at ${this.job.destName}`;
  }

  /** GPS target for the active job, or null. */
  getObjectiveMarker() {
    if (!this.job) return null;
    if (this.job.kind === 'race') return RACE_GATES[this.job.gateIndex] ?? null;
    return this.job.dest;
  }

  /** Seconds left on a timed job (race), or 0. */
  getTimeLeft() {
    return this.job?.kind === 'race' ? Math.max(0, this.job.timeLeft) : 0;
  }
}
