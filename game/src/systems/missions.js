// Story mission manager: runs the seven jobs from start to payout.
// Tracks the active objective, mission timers, chase targets and the
// pass/fail flow. Passed missions are recorded twice: in
// flags.missionsPassed and in flags.passed_M1..M7, because the map reads
// the per-mission flags. Shots fired at mission hostiles never raise
// wanted level (the combat system scores those hits at zero heat).

import { MISSIONS, missionById } from '../data/missions.js';
import { computeCompletion } from './save.js';

const GOTO_RADIUS = 12;
const CHECKPOINT_RADIUS = 14;
const CHASE_SPEED = 18;
const CHASE_ESCAPE_TIME = 30;
const WAYPOINT_ARRIVE = 4;

// Deep-copy plain values with structuredClone, falling back to a JSON
// round trip when the platform lacks it or the value cannot clone.
function clonePlain(value, fallback) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (err) {
      // Fall through to the JSON copy below.
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return fallback;
  }
}

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.lastMissionId = null;
    this.chaseWaypointIndex = 0;
    // Getting busted fails the mission, but the BUSTED screen speaks
    // for itself, so no MISSION FAILED card is shown for it.
    this.game.events?.on?.('busted', () => this.handleBusted());
  }

  // Definition of the active mission, or null when free roaming.
  currentMission() {
    const mission = this.game.state.mission;
    return mission ? missionById(mission.id) : null;
  }

  // The objective the player is working on right now, or null.
  currentObjective() {
    const mission = this.game.state.mission;
    if (!mission) return null;
    return mission.data.objectives[mission.objectiveIndex] ?? null;
  }

  // True when a story mission is running.
  isActive() {
    return !!this.game.state.mission;
  }

  // True when the mission id is recorded as passed.
  isPassed(id) {
    return this.game.state.flags[`passed_${id}`] === true;
  }

  // True when the mission is still locked by reputation (or unknown).
  // The map screen uses this to grey out locked jobs.
  isLocked(id) {
    const def = missionById(id);
    if (!def) return true;
    const tier = this.game.rep?.tier?.() ?? this.game.state.repTier ?? 1;
    return def.unlockTier > tier;
  }

  // Missions the player may start: unlocked by reputation, not passed,
  // sorted by chapter so the earliest job comes first.
  availableMissions() {
    const tier = this.game.rep?.tier?.() ?? this.game.state.repTier ?? 1;
    return MISSIONS
      .filter((m) => m.unlockTier <= tier && !this.isPassed(m.id))
      .toSorted((a, b) => a.chapter - b.chapter || a.id.localeCompare(b.id));
  }

  // Start one mission. Returns false when the mission is unknown, locked
  // by reputation, or another mission is already running.
  startMission(id) {
    const def = missionById(id);
    const state = this.game.state;
    if (!def || state.mission) return false;
    if (this.isLocked(id)) {
      this.game.hud?.showToast?.(`Requires REP tier ${def.unlockTier} - ${def.name} is locked.`);
      return false;
    }
    // Clone the objectives so progress never mutates the shared data.
    const objectives = clonePlain(def.objectives, []);
    const mission = { id: def.id, status: 'active', objectiveIndex: 0, timer: null };
    mission.timer = typeof def.timeLimit === 'number' ? def.timeLimit : null;
    mission.data = { objectives, checkpointIndex: 0, chaseTimer: 0 };
    state.mission = mission;
    this.lastMissionId = id;
    this.chaseWaypointIndex = 0;
    this.showLine(def, 0);
    this.setupObjective(def, objectives[0]);
    this.game.events?.emit?.('missionStarted', { id: def.id });
    return true;
  }

  // Prepare one objective: spawn its vehicle, hostiles, chase target,
  // race timer or wanted level as the objective type demands.
  setupObjective(def, objective) {
    if (!objective) return;
    const state = this.game.state;
    const mission = state.mission;
    if (objective.type === 'steal') {
      const vehicle = this.game.vehicles?.spawn?.(
        objective.vehicle, objective.x ?? def.startPos.x, objective.z ?? def.startPos.z,
      );
      if (vehicle) {
        mission.data.missionVehicle = vehicle;
        // The steal target must be enterable with F, and F only enters
        // parked cars — so park it (entering it then counts as a theft,
        // exactly as stealing it should).
        vehicle.parked = true;
        this.game.vehicles?.parked?.push?.(vehicle);
      }
    } else if (objective.type === 'race') {
      mission.timer = objective.timeLimit ?? null;
      mission.data.checkpointIndex = 0;
    } else if (objective.type === 'defeat') {
      const positions = objective.positions ?? [def.startPos];
      const count = objective.count ?? positions.length;
      this.game.hostiles?.spawn?.(count, positions, {});
      if (objective.boss) {
        const bossPos = { x: objective.boss.x ?? def.startPos.x, z: objective.boss.z ?? def.startPos.z };
        this.game.hostiles?.spawn?.(1, [bossPos], { boss: true, hp: objective.boss.hp, name: objective.boss.name });
      }
    } else if (objective.type === 'escape') {
      const wanted = objective.startWanted ?? 3;
      this.game.wanted?.setWanted?.(wanted);
      state.wanted = wanted;
      state.heat = 60;
    } else if (objective.type === 'chase') {
      const spawn = objective.spawn ?? def.startPos;
      const target = this.game.vehicles?.spawn?.(objective.vehicle ?? 'sedan', spawn.x, spawn.z);
      if (target) mission.data.chaseTarget = target;
      mission.data.chaseTimer = objective.escapeTime ?? CHASE_ESCAPE_TIME;
      mission.data.chaseWaypoints = clonePlain(objective.waypoints ?? [], []);
      this.chaseWaypointIndex = 0;
    }
  }

  // Show one dialogue line as a subtitle (line per objective index).
  showLine(def, index) {
    const lines = def?.dialogue;
    if (!Array.isArray(lines) || lines.length === 0) return;
    const line = lines[Math.min(index, lines.length - 1)];
    if (line) this.game.hud?.showSubtitle?.(line, 4);
  }

  // Distance check against the player position (squared, no sqrt).
  near(x, z, radius) {
    const pos = this.game.state.playerPos;
    if (!pos) return false;
    const dx = x - pos.x;
    const dz = z - pos.z;
    return dx * dx + dz * dz <= radius * radius;
  }

  // Advance the mission each frame: timers, wrecked mission vehicles,
  // and the completion rule of the active objective type.
  update(dt) {
    const state = this.game.state;
    const mission = state.mission;
    if (!mission || mission.status !== 'active') return;
    const def = missionById(mission.id);
    if (!def) return;

    if (typeof mission.timer === 'number') {
      mission.timer -= dt;
      if (mission.timer <= 0) {
        mission.timer = 0;
        this.failMission('Time ran out');
        return;
      }
    }

    // A wrecked mission vehicle fails the job when the objective needs it.
    const missionVehicle = mission.data.missionVehicle;
    if (missionVehicle && typeof missionVehicle.health === 'number' && missionVehicle.health <= 0) {
      const current = this.currentObjective();
      if (current && (current.type === 'steal' || current.type === 'deliver')) {
        this.failMission('Mission vehicle destroyed');
        return;
      }
    }

    const objective = this.currentObjective();
    if (!objective) {
      this.passMission();
      return;
    }

    if (objective.type === 'goto' || objective.type === 'deliver' || objective.type === 'timed') {
      if (this.near(objective.x, objective.z, GOTO_RADIUS)) this.advanceObjective();
    } else if (objective.type === 'steal') {
      const ride = state.playerInVehicle;
      if (ride && (ride === missionVehicle || ride.name === objective.vehicle || ride.type === objective.vehicle)) {
        this.advanceObjective();
      }
    } else if (objective.type === 'race') {
      this.updateRace(objective);
    } else if (objective.type === 'defeat') {
      const alive = this.game.hostiles?.alive?.() ?? 0;
      if (alive <= 0) this.advanceObjective();
    } else if (objective.type === 'escape') {
      const level = this.game.wanted?.level?.() ?? state.wanted;
      if (level <= 0) this.advanceObjective();
    } else if (objective.type === 'chase') {
      this.updateChase(dt, objective);
    }
  }

  // Race objective: pass each checkpoint in order before the timer ends.
  updateRace(objective) {
    const mission = this.game.state.mission;
    const checkpoints = objective.checkpoints ?? [];
    const index = mission.data.checkpointIndex || 0;
    const checkpoint = checkpoints[index];
    if (!checkpoint) {
      this.advanceObjective();
      return;
    }
    if (!this.near(checkpoint.x, checkpoint.z, CHECKPOINT_RADIUS)) return;
    mission.data.checkpointIndex = index + 1;
    this.game.audio?.sfx?.('checkpoint');
    if (index + 1 >= checkpoints.length) {
      this.advanceObjective();
      return;
    }
    this.game.hud?.showEventPopup?.(`CHECKPOINT ${index + 1} / ${checkpoints.length}`);
    this.game.events?.emit?.('checkpointReached', { mission: mission.id, index: index + 1 });
  }

  // Chase objective: destroy the target to pass; the target escapes
  // when its timer runs out. The manager drives the target itself
  // along the mission waypoints.
  updateChase(dt, objective) {
    const mission = this.game.state.mission;
    const target = mission.data.chaseTarget;
    if (target && typeof target.health === 'number' && target.health <= 0) {
      this.advanceObjective();
      return;
    }
    this.driveChaseTarget(dt);
    mission.data.chaseTimer -= dt;
    if (mission.data.chaseTimer <= 0) {
      this.failMission('The target got away');
    }
  }

  // Drive the chase target toward the current waypoint at chase speed,
  // looping the route until the target is stopped or escapes.
  driveChaseTarget(dt) {
    const mission = this.game.state.mission;
    const target = mission?.data.chaseTarget;
    const waypoints = mission?.data.chaseWaypoints;
    if (!target?.mesh?.position || !Array.isArray(waypoints) || waypoints.length === 0) return;
    const pos = target.mesh.position;
    let waypoint = waypoints[this.chaseWaypointIndex % waypoints.length];
    let dx = waypoint.x - pos.x;
    let dz = waypoint.z - pos.z;
    let distance = Math.hypot(dx, dz);
    if (distance < WAYPOINT_ARRIVE) {
      this.chaseWaypointIndex += 1;
      waypoint = waypoints[this.chaseWaypointIndex % waypoints.length];
      dx = waypoint.x - pos.x;
      dz = waypoint.z - pos.z;
      distance = Math.hypot(dx, dz);
    }
    if (distance <= 0) return;
    const step = Math.min(CHASE_SPEED * dt, distance);
    pos.x += (dx / distance) * step;
    pos.z += (dz / distance) * step;
    if (target.mesh.rotation) target.mesh.rotation.y = Math.atan2(dx, dz);
    if (typeof target.speed === 'number') target.speed = CHASE_SPEED * 3.6;
  }

  // Move to the next objective, or pass the mission when none remain.
  advanceObjective() {
    const state = this.game.state;
    const mission = state.mission;
    if (!mission) return;
    const def = missionById(mission.id);
    mission.objectiveIndex += 1;
    this.game.events?.emit?.('objectiveAdvanced', { id: mission.id, objectiveIndex: mission.objectiveIndex });
    if (mission.objectiveIndex >= mission.data.objectives.length) {
      this.passMission();
      return;
    }
    this.showLine(def, mission.objectiveIndex);
    this.setupObjective(def, mission.data.objectives[mission.objectiveIndex]);
  }

  // Pay out, grant reputation, record the pass twice, show the card,
  // autosave and emit missionPassed.
  passMission() {
    const state = this.game.state;
    const mission = state.mission;
    if (!mission) return;
    const def = missionById(mission.id);
    const payout = def?.payout ?? 0;
    const repGain = def?.rep ?? 0;
    state.money += payout;
    state.stats.missionsPassed = (state.stats.missionsPassed || 0) + 1;
    if (!Array.isArray(state.flags.missionsPassed)) state.flags.missionsPassed = [];
    if (!state.flags.missionsPassed.includes(mission.id)) {
      state.flags.missionsPassed.push(mission.id);
    }
    state.flags[`passed_${mission.id}`] = true;
    state.completion = computeCompletion(state);
    state.mission = null;
    this.game.hostiles?.clear?.();
    this.game.rep?.addRep?.(repGain);
    this.game.audio?.sfx?.('mission-passed');
    this.game.events?.emit?.('missionPassed', { id: mission.id, payout, rep: repGain });
    this.game.menus?.showMissionPassed?.({
      id: mission.id,
      name: def?.name ?? mission.id,
      payout,
      rep: repGain,
      completion: state.completion,
    });
    this.game.save?.saveNow?.();
  }

  // Fail the mission with a reason. Silent failures (busted) clear the
  // mission and emit the event without the MISSION FAILED card or sound.
  failMission(reason, options = {}) {
    const state = this.game.state;
    const mission = state.mission;
    if (!mission) return;
    const id = mission.id;
    this.lastMissionId = id;
    state.mission = null;
    this.game.hostiles?.clear?.();
    this.game.events?.emit?.('missionFailed', { id, reason });
    if (!options.silent) {
      this.game.audio?.sfx?.('mission-failed');
      this.game.menus?.showMissionFailed?.(reason);
    }
  }

  // Busted by the police: the mission fails silently because the
  // BUSTED screen already tells the player what happened.
  handleBusted() {
    if (this.game.state.mission) this.failMission('Busted', { silent: true });
  }

  // Walk away from the mission back to free roam, keeping retry open.
  abandonMission() {
    const state = this.game.state;
    if (!state.mission) return false;
    const id = state.mission.id;
    this.lastMissionId = id;
    state.mission = null;
    this.game.hostiles?.clear?.();
    this.game.hud?.showToast?.('Mission abandoned.');
    this.game.events?.emit?.('missionAbandoned', { id });
    return true;
  }

  // Restart the last failed mission: respawn at the giver, restore
  // full health, clear wanted level, then start the mission again.
  retryMission() {
    const id = this.lastMissionId;
    if (!id) return false;
    const def = missionById(id);
    if (!def) return false;
    const state = this.game.state;
    const start = def.startPos ?? { x: 0, z: 0 };
    state.playerPos = { x: start.x, z: start.z };
    if (state.playerInVehicle) {
      this.game.vehicles?.exit?.();
      state.playerInVehicle = null;
    }
    state.health = 100;
    const player = this.game.player;
    if (player) {
      player.health = 100;
      if (player.mesh?.position) {
        player.mesh.position.x = start.x;
        player.mesh.position.y = 0;
        player.mesh.position.z = start.z;
      }
      if (typeof player.teleport === 'function') {
        try {
          player.teleport(start.x, start.z);
        } catch (err) {
          // Teleport is optional; the position above already moved.
        }
      }
    }
    this.game.wanted?.clearWanted?.();
    state.wanted = 0;
    state.heat = 0;
    return this.startMission(id);
  }

  // Map marker for the active objective (for the radar and full map),
  // or null when free roaming or the objective has no fixed point.
  currentMarker() {
    const objective = this.currentObjective();
    if (!objective) return null;
    const mission = this.game.state.mission;
    if (objective.type === 'goto' || objective.type === 'deliver' || objective.type === 'timed') {
      return { x: objective.x, z: objective.z, label: objective.label ?? '' };
    }
    if (objective.type === 'steal') {
      const vehicle = mission.data.missionVehicle;
      if (vehicle?.mesh?.position) {
        return { x: vehicle.mesh.position.x, z: vehicle.mesh.position.z, label: objective.label ?? '' };
      }
      return { x: objective.x ?? 0, z: objective.z ?? 0, label: objective.label ?? '' };
    }
    if (objective.type === 'race') {
      const checkpoint = (objective.checkpoints ?? [])[mission.data.checkpointIndex || 0];
      if (!checkpoint) return null;
      return { x: checkpoint.x, z: checkpoint.z, label: objective.label ?? '' };
    }
    if (objective.type === 'defeat') {
      const first = (objective.positions ?? [])[0];
      if (!first) return null;
      return { x: first.x, z: first.z, label: objective.label ?? '' };
    }
    if (objective.type === 'chase') {
      const target = mission.data.chaseTarget;
      if (target?.mesh?.position) {
        return { x: target.mesh.position.x, z: target.mesh.position.z, label: objective.label ?? '' };
      }
      return null;
    }
    return null;
  }
}
