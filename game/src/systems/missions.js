// MissionManager: runs the seven story missions. One mission is active at a
// time; state.mission tracks it, and each objective is checked every frame
// against the player position, the hostiles system, the wanted level, or the
// chase target. Passing pays out money + REP, updates completion, and
// autosaves. BUSTED or a wrecked mission vehicle fails the mission. Retry
// respawns the player at the giver with full health before restarting.

import { MISSIONS, missionById } from '../data/missions.js';
import { saveGame, computeCompletion } from './save.js';
import { Rep } from './rep.js';

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this._lastMissionId = null;
    this._chaseTarget = null;
    this._objectiveTimer = null;
    if (game.events) {
      game.events.on('busted', () => this._onBusted());
    }
  }

  isActive() {
    const m = this.state.mission;
    return !!m && m.status === 'active';
  }

  currentMission() {
    const m = this.state.mission;
    return m ? missionById(m.id) : null;
  }

  currentObjective() {
    const def = this.currentMission();
    const m = this.state.mission;
    if (!def || !m) return null;
    return def.objectives[m.objectiveIndex] || null;
  }

  isPassed(id) {
    return (this.state.flags.missionsPassed || []).includes(id);
  }

  passedCount() {
    return (this.state.flags.missionsPassed || []).length;
  }

  isLocked(def) {
    if (!def.unlockTier) return false;
    const tier = this.game.rep ? this.game.rep.tier() : Rep.tierFor(this.state.rep);
    return tier < def.unlockTier;
  }

  availableMissions() {
    return MISSIONS.map((def) => ({
      id: def.id,
      name: def.name,
      chapter: def.chapter,
      giver: def.giver,
      payout: def.payout,
      rep: def.rep,
      locked: this.isLocked(def),
      passed: this.isPassed(def.id),
      startPos: def.startPos,
    }));
  }

  // Live marker position for the radar / minimap: where the player must go
  // next, or null when the objective has no fixed point (escape).
  objectivePosition() {
    const obj = this.currentObjective();
    if (!obj) return null;
    if (obj.type === 'race') {
      const m = this.state.mission;
      const gate = obj.checkpoints[m.data.gateIndex || 0];
      return gate ? { x: gate.x, z: gate.z, label: obj.label } : null;
    }
    if (obj.type === 'chase' && this._chaseTarget && this._chaseTarget.vehicle) {
      const mesh = this._chaseTarget.vehicle.mesh;
      if (mesh) return { x: mesh.position.x, z: mesh.position.z, label: obj.label };
      return { x: obj.target.x, z: obj.target.z, label: obj.label };
    }
    if (typeof obj.x === 'number' && typeof obj.z === 'number') {
      return { x: obj.x, z: obj.z, label: obj.label };
    }
    return null;
  }

  startMission(id) {
    const def = missionById(id);
    if (!def) return false;
    if (this.isActive()) return false;
    if (this.isLocked(def)) {
      const tierName = Rep.tierDef(def.unlockTier).name;
      if (this.game.hud) this.game.hud.showToast(`Requires REP tier ${def.unlockTier} — ${tierName}.`);
      return false;
    }
    const mission = {
      id: def.id,
      status: 'active',
      objectiveIndex: 0,
      timer: typeof def.timeLimit === 'number' ? def.timeLimit : null,
    };
    mission.data = {};
    this.state.mission = mission;
    this._lastMissionId = def.id;
    this._chaseTarget = null;
    this._objectiveTimer = null;
    this._setupObjective(def.objectives[0], def);
    this._showDialogue(def, 0);
    if (this.game.hud) this.game.hud.showToast(`${def.name} — ${def.objectives[0].label}`);
    if (this.game.events) this.game.events.emit('missionStarted', { id: def.id });
    return true;
  }

  update(dt) {
    const m = this.state.mission;
    if (!m || m.status !== 'active') return;
    const def = missionById(m.id);
    if (!def) return;

    // BUSTED (flag fallback in case the police set a flag instead of
    // emitting the event) fails the mission without a second card: the
    // BUSTED screen is the visible outcome.
    if (this.state.flags.busted) {
      delete this.state.flags.busted;
      this._onBusted();
      return;
    }

    const missionVehicle = m.data.missionVehicle;
    if (missionVehicle && missionVehicle.health <= 0) {
      this.failMission('Mission vehicle destroyed');
      return;
    }

    if (m.timer !== null && m.timer !== undefined) {
      m.timer -= dt;
      if (m.timer <= 0) {
        this.failMission('Time ran out');
        return;
      }
    }
    if (this._objectiveTimer !== null) {
      this._objectiveTimer -= dt;
      if (this._objectiveTimer <= 0) {
        this.failMission('Time ran out');
        return;
      }
    }

    if (this._chaseTarget) {
      if (!this._updateChaseTarget(dt, def)) return;
    }

    const obj = def.objectives[m.objectiveIndex];
    if (!obj) {
      this.passMission();
      return;
    }
    if (this._objectiveComplete(obj, m)) this.advanceObjective();
  }

  advanceObjective() {
    const m = this.state.mission;
    if (!m || m.status !== 'active') return;
    const def = missionById(m.id);
    m.objectiveIndex += 1;
    this._objectiveTimer = null;
    if (this.game.events) {
      this.game.events.emit('objectiveAdvanced', { id: m.id, objectiveIndex: m.objectiveIndex });
    }
    if (m.objectiveIndex >= def.objectives.length) {
      this.passMission();
      return;
    }
    const next = def.objectives[m.objectiveIndex];
    this._setupObjective(next, def);
    this._showDialogue(def, m.objectiveIndex);
    if (this.game.hud) this.game.hud.showToast(next.label);
  }

  passMission() {
    const m = this.state.mission;
    if (!m) return;
    const def = missionById(m.id);
    if (!def) return;
    m.status = 'passed';
    this.state.money += def.payout;
    this.state.stats.missionsPassed = (this.state.stats.missionsPassed || 0) + 1;
    const passed = this.state.flags.missionsPassed || [];
    if (!passed.includes(def.id)) passed.push(def.id);
    this.state.flags.missionsPassed = passed;
    // The full map reads per-mission flags (passed_M1 ... passed_M7), so
    // keep both shapes in sync.
    this.state.flags[`passed_${def.id}`] = true;
    if (this.game.rep) this.game.rep.addRep(def.rep);
    this.state.completion = computeCompletion(this.state);
    this._cleanup();
    this._sfx('mission-passed');
    if (this.game.events) {
      this.game.events.emit('missionPassed', { id: def.id, payout: def.payout, rep: def.rep });
    }
    if (this.game.menus) {
      this.game.menus.showMissionPassed({
        mission: def,
        missionName: def.name,
        payout: def.payout,
        rep: def.rep,
        tier: this.game.rep ? this.game.rep.tierName() : '',
      });
    }
    try {
      saveGame(this.game);
    } catch (err) {
      // Autosave must never break the mission-passed flow.
    }
    this.state.mission = null;
  }

  failMission(reason) {
    const m = this.state.mission;
    if (!m || m.status !== 'active') return;
    const id = m.id;
    this._cleanup();
    this._sfx('mission-failed');
    if (this.game.events) this.game.events.emit('missionFailed', { id, reason });
    if (this.game.menus) this.game.menus.showMissionFailed(reason);
    this.state.mission = null;
  }

  abandonMission() {
    if (!this.isActive()) return;
    const id = this.state.mission.id;
    this._cleanup();
    if (this.game.events) this.game.events.emit('missionAbandoned', { id });
    if (this.game.hud) this.game.hud.showToast('Mission abandoned.');
    this.state.mission = null;
  }

  // Respawn the player at the giver with full health, clear the heat, then
  // restart the last mission. Used by the MISSION FAILED card Retry button.
  retryMission() {
    const id = this._lastMissionId;
    if (!id) return false;
    const def = missionById(id);
    if (!def) return false;
    if (this.state.playerInVehicle && this.game.vehicles) {
      this.game.vehicles.exit();
    }
    this.state.health = 100;
    if (this.game.player) {
      this.game.player.health = 100;
      if (this.game.player.mesh) {
        this.game.player.mesh.position.x = def.startPos.x;
        this.game.player.mesh.position.z = def.startPos.z;
      }
    }
    this.state.playerPos = { x: def.startPos.x, z: def.startPos.z };
    // Clear any stale busted flag or the fresh mission would fail instantly.
    delete this.state.flags.busted;
    if (this.game.wanted) this.game.wanted.clearWanted();
    if (this.game.police) this.game.police.clearPursuit();
    if (this.game.hostiles) this.game.hostiles.clear();
    this.state.mission = null;
    return this.startMission(id);
  }

  _setupObjective(obj, def) {
    if (!obj) return;
    const m = this.state.mission;
    if (obj.type === 'steal' && this.game.vehicles) {
      const vehicle = this.game.vehicles.spawn(obj.vehicle, obj.x, obj.z);
      if (vehicle) m.data.missionVehicle = vehicle;
    } else if (obj.type === 'defeat' && this.game.hostiles) {
      const count = obj.count || 1;
      const spread = obj.spread || 10;
      const positions = [];
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        positions.push({
          x: obj.x + Math.cos(angle) * spread,
          z: obj.z + Math.sin(angle) * spread,
        });
      }
      if (obj.boss) {
        this.game.hostiles.spawn(1, [positions[0]], { boss: true, hp: obj.boss.hp, name: obj.boss.name });
        if (count > 1) this.game.hostiles.spawn(count - 1, positions.slice(1), {});
      } else {
        this.game.hostiles.spawn(count, positions, {});
      }
      m.data.hostilesSpawned = count;
    } else if (obj.type === 'escape' && this.game.wanted) {
      this.game.wanted.setWanted(obj.startWanted || 3);
    } else if (obj.type === 'race') {
      m.data.gateIndex = 0;
      if (typeof obj.timeLimit === 'number') m.timer = obj.timeLimit;
    } else if (obj.type === 'chase' && this.game.vehicles) {
      const vehicle = this.game.vehicles.spawn(obj.target.type, obj.target.x, obj.target.z);
      this._chaseTarget = {
        vehicle,
        route: obj.route || [],
        waypoint: 0,
        speed: obj.speed || 16,
        caughtTime: 0,
        failOnEscape: !!obj.failOnEscape,
      };
    } else if (obj.type === 'timed' && typeof obj.timeLimit === 'number') {
      this._objectiveTimer = obj.timeLimit;
    }
  }

  _objectiveComplete(obj, m) {
    const pos = this.state.playerPos;
    const near = (x, z, radius) => {
      if (!pos) return false;
      const dx = pos.x - x;
      const dz = pos.z - z;
      return dx * dx + dz * dz < radius * radius;
    };
    if (obj.type === 'goto' || obj.type === 'timed') {
      return near(obj.x, obj.z, obj.radius || 10);
    }
    if (obj.type === 'steal') {
      return this._isTargetVehicle(this.state.playerInVehicle, obj.vehicle);
    }
    if (obj.type === 'deliver') {
      if (!near(obj.x, obj.z, obj.radius || 10)) return false;
      // Deliveries need the mission vehicle; other objectives accept any car.
      if (m.data.missionVehicle) return this.state.playerInVehicle === m.data.missionVehicle;
      return !!this.state.playerInVehicle;
    }
    if (obj.type === 'race') {
      const gate = obj.checkpoints[m.data.gateIndex || 0];
      if (!gate) return true;
      if (near(gate.x, gate.z, 12)) {
        m.data.gateIndex = (m.data.gateIndex || 0) + 1;
        this._sfx('checkpoint');
        if (this.game.hud) {
          this.game.hud.showEventPopup(`CHECKPOINT ${m.data.gateIndex}/${obj.checkpoints.length}`);
        }
        if (m.data.gateIndex >= obj.checkpoints.length) return true;
      }
      return false;
    }
    if (obj.type === 'defeat') {
      if (!this.game.hostiles || !m.data.hostilesSpawned) return false;
      return this.game.hostiles.alive() === 0;
    }
    if (obj.type === 'escape') {
      const level = this.game.wanted ? this.game.wanted.level() : this.state.wanted;
      return level === 0;
    }
    if (obj.type === 'chase') {
      if (!this._chaseTarget || !this._chaseTarget.vehicle) return false;
      if (this._chaseTarget.vehicle.health <= 0) return true;
      // Caught: stay close to the target for 3 seconds (ram it, block it,
      // or steal it — the hint shown for the M3 chase).
      return this._chaseTarget.caughtTime >= 3;
    }
    return false;
  }

  // Moves the chase target along its escape route. Returns false when the
  // mission ended inside this call (target escaped).
  _updateChaseTarget(dt, def) {
    const target = this._chaseTarget;
    const vehicle = target.vehicle;
    if (!vehicle || !vehicle.mesh) return true;
    const mesh = vehicle.mesh;
    const waypoint = target.route[target.waypoint];
    if (!waypoint) {
      if (target.failOnEscape) {
        this.failMission('The target got away');
        return false;
      }
      return true;
    }
    const dx = waypoint.x - mesh.position.x;
    const dz = waypoint.z - mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const step = target.speed * dt;
    // Snap onto the waypoint when close or when one step would overshoot
    // it — otherwise a large dt makes the target oscillate around the point.
    if (dist < 4 || step >= dist) {
      mesh.position.x = waypoint.x;
      mesh.position.z = waypoint.z;
      target.waypoint += 1;
      return true;
    }
    mesh.position.x += (dx / dist) * step;
    mesh.position.z += (dz / dist) * step;
    mesh.rotation.y = Math.atan2(dx, dz);
    if (typeof vehicle.speed === 'number') vehicle.speed = target.speed;
    const pos = this.state.playerPos;
    if (pos) {
      const pdx = pos.x - mesh.position.x;
      const pdz = pos.z - mesh.position.z;
      if (pdx * pdx + pdz * pdz < 64) {
        target.caughtTime += dt;
      } else {
        target.caughtTime = Math.max(0, target.caughtTime - dt);
      }
    }
    return true;
  }

  _isTargetVehicle(vehicle, name) {
    if (!vehicle || !name) return false;
    return vehicle.name === name
      || vehicle.type === name
      || (vehicle.def && vehicle.def.name === name);
  }

  _showDialogue(def, index) {
    if (!this.game.hud || !def.dialogue || def.dialogue.length === 0) return;
    const line = def.dialogue[Math.min(index, def.dialogue.length - 1)];
    if (line) this.game.hud.showSubtitle(line, 5);
  }

  _onBusted() {
    if (!this.isActive()) return;
    const id = this.state.mission.id;
    this._cleanup();
    if (this.game.events) this.game.events.emit('missionFailed', { id, reason: 'BUSTED' });
    this.state.mission = null;
  }

  _cleanup() {
    if (this.game.hostiles) this.game.hostiles.clear();
    this._chaseTarget = null;
    this._objectiveTimer = null;
  }

  _sfx(name) {
    try {
      if (this.game.audio) this.game.audio.sfx(name);
    } catch (err) {
      // Audio is cosmetic; a missing sound must never break a mission.
    }
  }
}
