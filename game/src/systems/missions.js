// Mission engine for Solmar City: runs one mission at a time through its
// objective list, in order. DOM-free and render-free, so it can be driven by
// logic tests without a browser.
//
// update(dt, state) reads the world through `state`:
//   state.player = { pos: {x, z}, vehicleId: string|null }
//   state.defeatedCount = number of mission hostiles defeated so far
//   state.targetVehicle = { pos: {x, z}, speed, wrecked } | null (chase target)
//   state.playerDead = bool (health 0 -> the mission fails)
//   state.wantedLevel = current wanted stars (escape objectives)
//
// The HUD (Worker D) reads getObjectiveText() for the subtitle line and
// getObjectiveMarker() for the GPS target + radar blip. getTimeLeft() feeds
// the race timer; getProgress() feeds checkpoint counters. getNextObjective()
// feeds the "NEXT" line under the current objective; getDialog() feeds the
// intro subtitles main.js shows when a mission starts.

import { getMission } from '../data/missions.js';

export class MissionManager {
  constructor() {
    this.mission = null;
    this.status = 'idle'; // 'idle' | 'active' | 'passed' | 'failed'
    this.objectiveIndex = 0;
    this.timeLeft = 0;
    this.failReason = '';
    this._defeatedSoFar = 0;
    this._escapePeak = 0;
    this.completedIds = [];
  }

  /** Begin a mission by id. Returns false for an unknown id. */
  start(id) {
    const mission = getMission(id);
    if (!mission) return false;
    this.mission = mission;
    this.status = 'active';
    this.objectiveIndex = 0;
    this.timeLeft = mission.timeLimit ?? 0;
    this.failReason = '';
    this._defeatedSoFar = 0;
    this._escapePeak = 0;
    return true;
  }

  /** The objective the player is currently working on, or null. */
  currentObjective() {
    if (!this.mission || this.status !== 'active') return null;
    return this.mission.objectives[this.objectiveIndex] ?? null;
  }

  /** The objective after the current one, or null when this is the last. */
  nextObjective() {
    if (!this.mission || this.status !== 'active') return null;
    return this.mission.objectives[this.objectiveIndex + 1] ?? null;
  }

  update(dt, state) {
    if (this.status !== 'active' || !this.mission) return;
    if (state.playerDead) {
      this._fail('Rico is down. The mission is over.');
      return;
    }

    // Race clock: the timer only runs on timed missions.
    if (this.mission.timeLimit) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this._fail('Out of time.');
        return;
      }
    }

    const objective = this.currentObjective();
    if (!objective) {
      this._pass();
      return;
    }
    // Escape objectives track the highest wanted level reached while they
    // run: the player must first be hot (3 stars) and then go cold (0).
    if (objective.type === 'escape') {
      this._escapePeak = Math.max(this._escapePeak, state.wantedLevel ?? 0);
    }
    if (this._objectiveDone(objective, state)) {
      this.objectiveIndex += 1;
      this._escapePeak = 0;
      if (this.objectiveIndex >= this.mission.objectives.length) {
        this._pass();
      }
    }
  }

  /** Fail the active mission from outside the engine (busted, wrecked car). */
  failMission(reason) {
    if (this.status !== 'active') return false;
    this._fail(reason);
    return true;
  }

  /** Walk away from the active mission: no pass, no fail, no penalty. */
  abandon() {
    if (this.status !== 'active') return false;
    this.mission = null;
    this.status = 'idle';
    this.objectiveIndex = 0;
    this.timeLeft = 0;
    this.failReason = '';
    this._defeatedSoFar = 0;
    this._escapePeak = 0;
    return true;
  }

  /** Subtitle line for the HUD, with progress where it applies. */
  getObjectiveText() {
    if (this.status === 'passed') return 'MISSION PASSED';
    if (this.status === 'failed') return 'MISSION FAILED';
    const objective = this.currentObjective();
    if (!objective) return '';
    let text = objective.label;
    if (objective.type === 'checkpoint') {
      const total = this.mission.objectives.length;
      text += `  (${this.objectiveIndex + 1}/${total})`;
    }
    if (objective.type === 'defeat') {
      text += `  (${Math.min(this._defeatedSoFar, objective.count)}/${objective.count})`;
    }
    if (objective.type === 'escape') {
      text += this._escapePeak >= 3 ? '  (stay hidden…)' : '  (get hot first)';
    }
    return text;
  }

  /** "NEXT — <label>" for the HUD line under the current objective. */
  getNextObjectiveText() {
    const next = this.nextObjective();
    return next ? `NEXT — ${next.label}` : '';
  }

  /** The current objective's hint, if the designer wrote one. */
  getObjectiveHint() {
    return this.currentObjective()?.hint ?? '';
  }

  /** "Chapter 1 · The Debt — Stage 2" for the HUD detail line. */
  getChapterLabel() {
    if (!this.mission) return '';
    const chapter = this.mission.chapter ?? '';
    const stage = this.mission.stage ? ` — Stage ${this.mission.stage}` : '';
    return `${chapter}${stage}`;
  }

  /** GPS target for the radar + minimap route, or null when there is none. */
  getObjectiveMarker() {
    const objective = this.currentObjective();
    if (!objective || !objective.pos) return null;
    return { x: objective.pos.x, z: objective.pos.z };
  }

  /** Seconds left on a timed mission, or 0 when the mission has no timer. */
  getTimeLeft() {
    return this.mission?.timeLimit ? Math.max(0, this.timeLeft) : 0;
  }

  /** { done, total } for checkpoint races; null for other missions. */
  getProgress() {
    if (!this.mission || !this.mission.timeLimit) return null;
    return { done: this.objectiveIndex, total: this.mission.objectives.length };
  }

  /** Intro dialog lines for the mission card (array of {speaker, text}). */
  getDialog() {
    return this.mission?.intro ?? [];
  }

  /** Closing line shown on the PASSED/FAILED card. */
  getClosingLine() {
    if (!this.mission) return '';
    return this.status === 'passed' ? this.mission.passedLine : this.mission.failedLine;
  }

  /** Cash awarded on pass (0 unless the mission just passed). */
  getReward() {
    return this.status === 'passed' ? this.mission.reward : 0;
  }

  /** Reputation awarded on pass (0 unless the mission just passed). */
  getRepReward() {
    return this.status === 'passed' ? (this.mission.rep ?? 0) : 0;
  }

  /** REP tier required to start this mission (1 when the mission is open). */
  getRequiredTier() {
    return this.mission?.requiresTier ?? 1;
  }

  _objectiveDone(objective, state) {
    const player = state.player ?? {};
    const pos = player.pos ?? { x: 0, z: 0 };
    switch (objective.type) {
      case 'goto':
      case 'return':
        return distance(pos, objective.pos) <= objective.radius;
      case 'steal':
        // The player is in the target vehicle (entities layer sets vehicleId).
        return player.vehicleId === objective.vehicleId;
      case 'deliver':
        return (
          player.vehicleId === objective.requiresVehicle &&
          distance(pos, objective.pos) <= objective.radius
        );
      case 'checkpoint':
        return distance(pos, objective.pos) <= objective.radius;
      case 'defeat': {
        this._defeatedSoFar = state.defeatedCount ?? 0;
        return this._defeatedSoFar >= objective.count;
      }
      case 'chase': {
        const target = state.targetVehicle;
        if (!target) return false;
        // Caught: alongside it while it is barely moving, or it is wrecked.
        if (target.wrecked) return true;
        return distance(pos, target.pos) <= 12 && target.speed < 2;
      }
      case 'escape': {
        // Hot first (3 stars seen), then cold (0 stars): the pursuit is lost.
        return this._escapePeak >= 3 && (state.wantedLevel ?? 0) === 0;
      }
      default:
        return false;
    }
  }

  _pass() {
    this.status = 'passed';
    if (this.mission && !this.completedIds.includes(this.mission.id)) {
      this.completedIds.push(this.mission.id);
    }
  }

  _fail(reason) {
    this.status = 'failed';
    this.failReason = reason;
  }
}


function distance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

