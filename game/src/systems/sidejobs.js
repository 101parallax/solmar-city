// Side jobs: a street race and taxi fares for cash between story missions.
// Only one job runs at a time, and no side job starts while a story
// mission is active. Race wins and fares feed the completion total.

import { CITY_DATA } from '../data/city.js';
import { computeCompletion } from './save.js';

const RACE_REWARD = 600;
const RACE_REP = 10;
const RACE_TIME_LIMIT = 75;
const GATE_RADIUS = 14;
const FARE_REP = 5;
const FARE_BASE = 25;
const FARE_PER_METER = 0.4;
const DEST_RADIUS = 12;

export class SideJobs {
  // One race route: five gates west to east along the 70 road.
  static RACE_GATES = [
    { x: -210, z: 70 },
    { x: -140, z: 70 },
    { x: -70, z: 70 },
    { x: 0, z: 70 },
    { x: 70, z: 70 },
  ];

  // Four taxi stands across the city, taken from the shared city data so
  // the radar blips, the map and the fares all point at the same places.
  // The static list below is only a fallback when the city data is absent.
  static TAXI_STANDS = Array.isArray(CITY_DATA?.taxiStands) && CITY_DATA.taxiStands.length > 0
    ? CITY_DATA.taxiStands.map((stand) => ({ ...stand }))
    : [
        { id: 'stand-downtown', name: 'Downtown', x: 0, z: 0 },
        { id: 'stand-harbor', name: 'Harbor', x: -210, z: -140 },
        { id: 'stand-beach', name: 'Beachfront', x: -70, z: 280 },
        { id: 'stand-uptown', name: 'Uptown', x: 210, z: -210 },
      ];

  // Possible fare destinations, spread to the far corners.
  static FARE_DESTS = [
    { x: -210, z: -210 },
    { x: 210, z: -210 },
    { x: -210, z: 210 },
    { x: 210, z: 210 },
    { x: 0, z: -210 },
    { x: 0, z: 210 },
    { x: -280, z: 0 },
    { x: 280, z: 0 },
  ];

  constructor(game) {
    this.game = game;
    this.job = null;
  }

  // The active job, or null when free.
  active() {
    return this.job;
  }

  // Copies of the taxi stands (for the radar and the map).
  stands() {
    return SideJobs.TAXI_STANDS.map((stand) => ({ ...stand }));
  }

  // A job may start only outside story missions and with no job running.
  canStart() {
    return !this.game.state.mission && !this.job;
  }

  // Start the street race: five gates against the clock.
  startRace() {
    if (!this.canStart()) return false;
    this.job = { kind: 'race', gateIndex: 0, timer: RACE_TIME_LIMIT };
    this.game.hud?.showSubtitle?.('Street race - hit every gate before time runs out.', 4);
    this.game.events?.emit?.('sideJobStarted', { kind: 'race' });
    return true;
  }

  // Start a taxi fare from one stand. The destination is picked with
  // the seeded game RNG and the fare scales with the trip distance.
  startFare(standId) {
    if (!this.canStart()) return false;
    const stand = SideJobs.TAXI_STANDS.find((entry) => entry.id === standId);
    if (!stand) return false;
    const far = SideJobs.FARE_DESTS.filter(
      (dest) => Math.hypot(dest.x - stand.x, dest.z - stand.z) > 70,
    );
    const pool = far.length > 0 ? far : SideJobs.FARE_DESTS;
    const dest = this.game.rng?.pick?.(pool) ?? pool[0];
    const distance = Math.hypot(dest.x - stand.x, dest.z - stand.z);
    const fare = Math.round(FARE_BASE + distance * FARE_PER_METER);
    this.job = { kind: 'taxi', standId, dest: { ...dest }, fare, hintShown: false };
    this.game.hud?.showSubtitle?.(`Taxi fare - drive your passenger to the marker. Pays $${fare}.`, 4);
    this.game.events?.emit?.('sideJobStarted', { kind: 'taxi', standId, fare });
    return true;
  }

  // Advance the active job: race gates and timer, or fare delivery.
  update(dt) {
    if (!this.job || this.game.state.paused) return;
    if (this.job.kind === 'race') this.updateRace(dt);
    else if (this.job.kind === 'taxi') this.updateFare();
  }

  // Race: count the timer down, advance gates, pay out on the last gate.
  updateRace(dt) {
    const state = this.game.state;
    const job = this.job;
    job.timer -= dt;
    if (job.timer <= 0) {
      job.timer = 0;
      this.job = null;
      this.game.hud?.showToast?.('Race failed - time ran out.');
      this.game.events?.emit?.('raceFailed', {});
      return;
    }
    const gates = SideJobs.RACE_GATES;
    const gate = gates[job.gateIndex];
    if (!gate) return;
    const pos = state.playerPos;
    if (!pos) return;
    const dx = gate.x - pos.x;
    const dz = gate.z - pos.z;
    if (dx * dx + dz * dz > GATE_RADIUS * GATE_RADIUS) return;
    job.gateIndex += 1;
    this.game.audio?.sfx?.('checkpoint');
    if (job.gateIndex < gates.length) {
      this.game.hud?.showEventPopup?.(`GATE ${job.gateIndex} / ${gates.length}`);
      return;
    }
    state.money += RACE_REWARD;
    state.flags.raceWon = true;
    state.completion = computeCompletion(state);
    this.job = null;
    this.game.rep?.addRep?.(RACE_REP);
    this.game.hud?.showEventPopup?.(`Race won +$${RACE_REWARD}`);
    this.game.audio?.sfx?.('money');
    this.game.events?.emit?.('raceWon', { reward: RACE_REWARD });
  }

  // Taxi fare: pay out only when the passenger arrives by car. On foot
  // at the marker, show one hint instead of completing the fare.
  updateFare() {
    const state = this.game.state;
    const job = this.job;
    const pos = state.playerPos;
    if (!pos) return;
    const dx = job.dest.x - pos.x;
    const dz = job.dest.z - pos.z;
    if (dx * dx + dz * dz > DEST_RADIUS * DEST_RADIUS) return;
    if (!state.playerInVehicle) {
      if (!job.hintShown) {
        job.hintShown = true;
        this.game.hud?.showToast?.('Your passenger needs a car - get in a vehicle.');
      }
      return;
    }
    state.money += job.fare;
    state.flags.faresDone = (state.flags.faresDone || 0) + 1;
    state.completion = computeCompletion(state);
    const paid = job.fare;
    this.job = null;
    this.game.rep?.addRep?.(FARE_REP);
    this.game.hud?.showEventPopup?.(`Fare complete +$${paid}`);
    this.game.audio?.sfx?.('money');
    this.game.events?.emit?.('fareDone', { fare: paid });
  }

  // Map marker for the active job (next race gate or fare destination),
  // or null when no job is running. Used by the radar and the full map.
  currentTarget() {
    if (!this.job) return null;
    if (this.job.kind === 'race') {
      const gate = SideJobs.RACE_GATES[this.job.gateIndex];
      if (!gate) return null;
      return { x: gate.x, z: gate.z, label: `Gate ${this.job.gateIndex + 1} / ${SideJobs.RACE_GATES.length}` };
    }
    return { x: this.job.dest.x, z: this.job.dest.z, label: `Taxi fare $${this.job.fare}` };
  }

  // Cancel the active job. Returns false when nothing was running.
  cancel() {
    if (!this.job) return false;
    this.job = null;
    return true;
  }
}
