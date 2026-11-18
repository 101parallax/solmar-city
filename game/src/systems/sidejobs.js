// SideJobs: two repeatable activities outside the story missions — a street
// race (one fixed route, 5 gates, timed) and taxi fares (pick a passenger up
// at a stand, drop them at a marker, paid by distance). Both are blocked
// while a story mission is active so objective markers never clash.

import { CITY_DATA } from '../data/city.js';
import { computeCompletion } from './save.js';

export class SideJobs {
  static RACE_TIME = 75;
  static RACE_REWARD = 600;
  static RACE_REP = 10;
  static RACE_GATES = [
    { x: -140, z: -210 }, { x: -70, z: -210 }, { x: 0, z: -210 },
    { x: 70, z: -210 }, { x: 140, z: -210 },
  ];
  static TAXI_BASE_FARE = 20;
  static TAXI_PER_METER = 0.35;

  static FALLBACK_STANDS = [
    { id: 'stand-downtown', x: -70, z: -70 },
    { id: 'stand-harbor', x: 140, z: 210 },
    { id: 'stand-market', x: -140, z: 140 },
    { id: 'stand-north', x: 70, z: -210 },
  ];

  static DROP_POINTS = [
    { x: 210, z: 210 }, { x: -210, z: -210 }, { x: 0, z: 0 }, { x: 210, z: -70 },
    { x: -70, z: 210 }, { x: 140, z: -140 }, { x: -210, z: 70 }, { x: 70, z: 140 },
  ];

  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.job = null;
    this._hintShown = false;
  }

  stands() {
    const fromCity = CITY_DATA && CITY_DATA.taxiStands;
    return Array.isArray(fromCity) && fromCity.length > 0 ? fromCity : SideJobs.FALLBACK_STANDS;
  }

  raceStart() {
    const fromCity = CITY_DATA && CITY_DATA.raceStart;
    return fromCity || { x: -210, z: -210 };
  }

  active() {
    return this.job;
  }

  cancel() {
    if (!this.job) return false;
    const kind = this.job.kind;
    this.job = null;
    if (this.game.events) this.game.events.emit('sideJobFailed', { kind, cancelled: true });
    return true;
  }

  startRace() {
    if (this.job) return false;
    if (this.game.missions && this.game.missions.isActive()) return false;
    this.job = {
      kind: 'race',
      gateIndex: 0,
      timer: SideJobs.RACE_TIME,
      gates: SideJobs.RACE_GATES,
    };
    if (this.game.hud) this.game.hud.showToast('Street Race — 5 gates, 75 seconds!');
    if (this.game.events) this.game.events.emit('sideJobStarted', { kind: 'race' });
    return true;
  }

  startFare(standId) {
    if (this.job) return false;
    if (this.game.missions && this.game.missions.isActive()) return false;
    const stands = this.stands();
    const stand = stands.find((s) => s.id === standId) || stands[0];
    const drops = SideJobs.DROP_POINTS;
    const dest = this.game.rng
      ? this.game.rng.pick(drops)
      : drops[(this.state.flags.faresDone || 0) % drops.length];
    const dist = Math.hypot(dest.x - stand.x, dest.z - stand.z);
    const fare = Math.round(SideJobs.TAXI_BASE_FARE + dist * SideJobs.TAXI_PER_METER);
    this.job = { kind: 'taxi', standId: stand.id, dest, fare };
    this._hintShown = false;
    if (this.game.hud) this.game.hud.showToast(`Taxi fare — drop the passenger at the marker ($${fare})`);
    if (this.game.events) this.game.events.emit('sideJobStarted', { kind: 'taxi', fare });
    return true;
  }

  update(dt) {
    if (!this.job) return;
    if (this.job.kind === 'race') this._updateRace(dt);
    else if (this.job.kind === 'taxi') this._updateTaxi();
  }

  _updateRace(dt) {
    const job = this.job;
    job.timer -= dt;
    if (job.timer <= 0) {
      this.job = null;
      if (this.game.hud) this.game.hud.showToast('Race failed — time ran out.');
      if (this.game.events) this.game.events.emit('sideJobFailed', { kind: 'race' });
      return;
    }
    const pos = this.state.playerPos;
    if (!pos) return;
    const gate = job.gates[job.gateIndex];
    if (!gate) return;
    const dx = pos.x - gate.x;
    const dz = pos.z - gate.z;
    if (dx * dx + dz * dz < 144) {
      job.gateIndex += 1;
      this._sfx('checkpoint');
      if (job.gateIndex >= job.gates.length) {
        this.state.money += SideJobs.RACE_REWARD;
        if (this.game.rep) this.game.rep.addRep(SideJobs.RACE_REP);
        this.state.flags.raceWon = true;
        this.state.completion = computeCompletion(this.state);
        if (this.game.hud) this.game.hud.showEventPopup(`RACE WON +$${SideJobs.RACE_REWARD}`);
        if (this.game.events) this.game.events.emit('sideJobPassed', { kind: 'race' });
        this.job = null;
      } else if (this.game.hud) {
        this.game.hud.showEventPopup(`GATE ${job.gateIndex}/${job.gates.length}`);
      }
    }
  }

  _updateTaxi() {
    const job = this.job;
    const pos = this.state.playerPos;
    if (!pos) return;
    const dx = pos.x - job.dest.x;
    const dz = pos.z - job.dest.z;
    if (dx * dx + dz * dz >= 100) return;
    if (!this.state.playerInVehicle) {
      if (!this._hintShown) {
        this._hintShown = true;
        if (this.game.hud) this.game.hud.showToast('Get in your car to drop off the passenger.');
      }
      return;
    }
    this.state.money += job.fare;
    this.state.flags.faresDone = (this.state.flags.faresDone || 0) + 1;
    this.state.completion = computeCompletion(this.state);
    if (this.game.hud) this.game.hud.showEventPopup(`FARE COMPLETE +$${job.fare}`);
    this._sfx('money');
    if (this.game.events) this.game.events.emit('sideJobPassed', { kind: 'taxi', fare: job.fare });
    this.job = null;
  }

  _sfx(name) {
    try {
      if (this.game.audio) this.game.audio.sfx(name);
    } catch (err) {
      // Audio is cosmetic; a missing sound must never break a side job.
    }
  }
}
