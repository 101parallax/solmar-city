// The screenshot scenes behind ?shot=chase|street|race|combat. Each one stages a real
// game state (a wanted chase at golden hour, a walk through Downtown, the harbor
// race, the M3 firefight), then plays the real rules forward for a fixed number of
// steps steered by an autopilot that drives the road graph like a player would, so
// the frame is what a short game really looks like and the same seed always gives
// the same frame. main.js runs the steps, expires the toast, paints twice and sets
// window.__shotReady.
//
// stageShot(name, game) returns { steps, drive, screen, settle }: `drive(stepIndex,
// camYaw)` yields a virtual input for that step ({ move: {x, y}, run, brake,
// shooting }) or null for no input, `screen` is 'play' or 'pause', and
// `settle(game)` optionally dresses the final frame (roadblocks, parked cars)
// after the steps. AutoDriver is also used by main.js for ?demo=1 attract mode.

import { STEP } from './config.js';
import { angleDiff, clamp } from './entities/graph.js';

export const SHOT_NAMES = ['chase', 'street', 'race', 'combat'];

const CHASE_SECONDS = 8;
const STREET_SECONDS = 5;
const RACE_SECONDS = 6;
const COMBAT_SECONDS = 6;

/** Re-plan the driving route at most this often (steps). */
const REPLAN_EVERY = 90;

/**
 * An autopilot that follows the road graph. driveTo() steers a car along the
 * shortest route to a target (pure pursuit with a lookahead point); walkTo()
 * steers a pedestrian straight at the target in player-local space.
 */
export class AutoDriver {
  constructor(game) {
    this.game = game;
    this.route = null;
    this.routeTarget = null;
    this.replanIn = 0;
  }

  _routeTo(target) {
    if (
      this.route &&
      this.routeTarget &&
      this.routeTarget.x === target.x &&
      this.routeTarget.z === target.z &&
      this.replanIn > 0
    ) {
      this.replanIn -= 1;
      return this.route;
    }
    this.route = this.game.routeTo(target) ?? [target];
    this.routeTarget = { x: target.x, z: target.z };
    this.replanIn = REPLAN_EVERY;
    return this.route;
  }

  /** True when another vehicle sits in the lane ahead (for overtaking). */
  _obstacleAhead() {
    const player = this.game.player;
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    const rx = -fz;
    const rz = fx;
    for (const v of this.game.allVehicles()) {
      if (v === player.vehicle) continue;
      const dx = v.x - player.x;
      const dz = v.z - player.z;
      const fwd = dx * fx + dz * fz;
      const lat = Math.abs(dx * rx + dz * rz);
      if (fwd > 0 && fwd < 16 && lat < 2.6) return true;
    }
    return false;
  }

  /** Virtual input driving the player's car toward `target`. */
  driveTo(target) {
    const game = this.game;
    const player = game.player;
    const route = this._routeTo(target);
    // Aim selection is stateless (a replan must never re-aim at a passed
    // node): find the route node nearest the car, then aim at the first node
    // AFTER it that is far enough ahead to steer at. Nodes are 70 m apart,
    // so the car is always closest to the node it just left or approaches.
    let closest = 0;
    let closestD = Infinity;
    for (let i = 0; i < route.length; i += 1) {
      const d = Math.hypot(route[i].x - player.x, route[i].z - player.z);
      if (d < closestD) {
        closestD = d;
        closest = i;
      }
    }
    let aim = route[route.length - 1];
    for (let i = closest + 1; i < route.length; i += 1) {
      if (Math.hypot(route[i].x - player.x, route[i].z - player.z) > 14) {
        aim = route[i];
        break;
      }
    }
    // Blocked by slower traffic? Shift the aim into the left lane to overtake.
    if (this._obstacleAhead()) {
      const h = player.heading;
      aim = { x: aim.x + Math.cos(h) * 4.5, z: aim.z - Math.sin(h) * 4.5 };
    }
    const dx = aim.x - player.x;
    const dz = aim.z - player.z;
    const want = Math.atan2(dx, dz);
    const diff = angleDiff(want, player.heading);
    // NOTE the minus: Player negates move.x into the steering angle
    // (steer: -move.x), so a positive heading error needs a negative input.
    const steer = clamp(diff * 2.4, -1, 1);
    const speed = Math.abs(player.speed ?? 0);
    const sharp = Math.abs(diff) > 0.9;
    // Brake for a sharp turn only at speed: a car steers with its wheels, so
    // braking to a standstill in front of a corner would never turn at all.
    const braking = sharp && speed > 8;
    return {
      move: { x: -steer, y: braking ? 0 : 1 },
      run: false,
      brake: braking,
      shooting: false,
      actions: 0,
    };
  }

  /**
   * Virtual input walking the player toward `target`. On foot the player
   * moves relative to the orbit camera, so the world direction is rotated
   * into camera space with `camYaw` (the player's camera yaw, which only
   * moves on mouse drags — shots never drag, so it stays at the spawn heading).
   */
  walkTo(target, camYaw = 0) {
    const player = this.game.player;
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) return { move: { x: 0, y: 0 }, run: false, brake: false, shooting: false, actions: 0 };
    const ux = dx / dist;
    const uz = dz / dist;
    // World direction -> camera-relative: forward = (sin yaw, cos yaw),
    // right = (-cos yaw, sin yaw).
    const forward = ux * Math.sin(camYaw) + uz * Math.cos(camYaw);
    const strafe = ux * -Math.cos(camYaw) + uz * Math.sin(camYaw);
    return {
      move: { x: clamp(strafe * 1.5, -1, 1), y: clamp(forward * 1.5, -1, 1) },
      run: dist > 25,
      brake: false,
      shooting: false,
      actions: 0,
    };
  }
}

/** Move a vehicle (and its mesh) to a staged pose. No sim step runs after. */
function placeVehicle(v, x, z, heading) {
  v.x = x;
  v.z = z;
  v.heading = heading;
  v.speed = 0;
  v.slide = 0;
  v.mesh.position.set(x, 0, z);
  v.mesh.rotation.y = heading;
}

/** Move a pedestrian (and its mesh) to a staged pose. No sim step runs after. */
function placePed(p, x, z, heading) {
  p.x = x;
  p.z = z;
  p.heading = heading;
  p.mesh.position.set(x, 0, z);
  p.mesh.rotation.y = heading;
}

/**
 * Stage the named scene on a fresh game and return how to run it. Any unknown
 * name falls back to the street scene. The game is reset first so every shot
 * starts from the same deterministic state.
 */
export function stageShot(name, game) {
  game.reset();
  const driver = new AutoDriver(game);

  if (name === 'chase') {
    // Cover: golden-hour pursuit in Downtown — the player in a red Vento GT,
    // three stars, mission 3 active, cruisers closing in from behind. The run
    // starts at the north edge and stays on the Downtown avenue, so the frame
    // shows glass towers, not Harbor warehouses.
    game.setTimeOfDay(16.5);
    game.putPlayerInCar('sports', 0xd21f2b, 0, -280, 0);
    game.startMission('m3');
    game.addWantedStars(3);
    const steps = Math.round(CHASE_SECONDS / STEP);
    return {
      steps,
      screen: 'play',
      drive: () => driver.driveTo({ x: 0, z: 70 }),
      settle: () => {
        // The pursuit reads only if police are IN the frame: the chase camera
        // looks forward, so the trailing cruisers sit behind it. Stage all
        // three: one roadblock across the avenue ahead, one pulling alongside,
        // one more facing the player further up the road.
        const p = game.player;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const rx = -fz;
        const rz = fx;
        const [block, wing, facing] = game.police.cruisers;
        if (block) {
          // 20 m ahead, sideways across the avenue.
          placeVehicle(block.vehicle, p.x + fx * 20, p.z + fz * 20, p.heading + Math.PI / 2);
        }
        if (wing) {
          // Overtaking on the wrong side, as pursuit drivers do.
          placeVehicle(
            wing.vehicle,
            p.x - rx * 5 + fx * 12,
            p.z - rz * 5 + fz * 12,
            p.heading,
          );
        }
        if (facing) {
          // Headed straight at the player, 26 m up the avenue.
          placeVehicle(
            facing.vehicle,
            p.x + rx * 4 + fx * 26,
            p.z + rz * 4 + fz * 26,
            p.heading + Math.PI,
          );
        }
        // The car radio is on in the cover: station + track in the widget.
        game.hud.setRadioStation(0);
      },
    };
  }

  if (name === 'race') {
    // The Harbor Run: race timer ticking, the next checkpoint ahead.
    game.setTimeOfDay(16.5);
    game.putPlayerInCar('sports', 0x1f6fd2, -210, -140, 0);
    game.startMission('m2');
    const steps = Math.round(RACE_SECONDS / STEP);
    return {
      steps,
      screen: 'play',
      drive: () => {
        const target = game.objectiveMarker() ?? { x: -210, z: -70 };
        return driver.driveTo(target);
      },
      settle: () => {
        // The race frame shows the driving-event popup the race earns. The
        // long timeout is staging only: screenshot capture is slow, and the
        // gameplay default (2.5 s) would fade before the capture lands.
        game.hud.showEventPopup('DRIFT  +$25', 30);
      },
    };
  }

  if (name === 'combat') {
    // The M3 firefight: Rico on foot outside Eddie's house, guards in frame,
    // tracers in the air, pistol HUD, health already dented. The player walks
    // down the street to the house (completing the goto objective, which
    // spawns the guards), then stands and shoots for the last second while
    // the guards shoot back — their tracers persist to the paint, because
    // tracers only decay in render, never during the steps.
    game.setTimeOfDay(16.5);
    game.placePlayerOnFoot(210, 186, 0);
    game.combat.switchWeapon('pistol');
    game.startMission('m3');
    const steps = Math.round(COMBAT_SECONDS / STEP);
    const shootFrom = steps - 60;
    return {
      steps,
      screen: 'play',
      drive: (step, camYaw) => {
        if (step < shootFrom) return driver.walkTo({ x: 210, z: 202 }, camYaw);
        return { move: { x: 0, y: 0 }, run: false, brake: false, shooting: true, actions: 0 };
      },
      settle: () => {
        // Health visibly dented, but never near death: the frame should read
        // as a fight in progress, not a loss.
        if (game.player.health > 75) game.player.health = 62;
        else if (game.player.health < 35) game.player.health = 45;
        // Guarantee at least one tracer in the frame.
        if (game.tracers.length === 0) {
          const guard = (game.hostiles ?? []).find((h) => h.alive);
          if (guard) {
            game.addTracer(
              { x: game.player.x, z: game.player.z },
              { x: guard.x, z: guard.z },
            );
          }
        }
      },
    };
  }

  // 'street' (and any unknown name): a midday walk through Downtown, on foot,
  // on the sidewalk with peds and traffic around, towers overhead.
  game.setTimeOfDay(11);
  game.placePlayerOnFoot(77.2, -70, 0);
  const steps = Math.round(STREET_SECONDS / STEP);
  return {
    steps,
    screen: 'play',
    drive: (_step, camYaw) => driver.walkTo({ x: 77.2, z: 30 }, camYaw),
    settle: () => {
      // Dress the street so it reads as lived-in: peds on both sidewalks
      // ahead of the player, parked cars on the avenue, one car coming.
      // (Mission cars are never moved: they belong to their missions.)
      const p = game.player;
      const peds = game.peds?.peds ?? [];
      const pedSpots = [
        { x: 77.2, z: p.z + 12, heading: Math.PI },
        { x: 62.8, z: p.z + 20, heading: 0 },
        { x: 77.2, z: p.z + 28, heading: 0 },
        { x: 62.8, z: p.z + 34, heading: Math.PI },
      ];
      pedSpots.forEach((s, i) => {
        if (peds[i]) placePed(peds[i], s.x, s.z, s.heading);
      });
      const parked = game.traffic.parked.filter(
        (v) => v.id !== 'm1-target' && v.id !== 'm3-target',
      );
      if (parked[0]) placeVehicle(parked[0], 66, p.z + 28, 0);
      if (parked[1]) placeVehicle(parked[1], 74, p.z + 45, Math.PI);
      if (parked[2]) placeVehicle(parked[2], 66, p.z + 62, 0);
      const oncoming = game.traffic?.cars?.[0]?.vehicle;
      if (oncoming) placeVehicle(oncoming, 70, p.z + 80, Math.PI);
    },
  };
}
