import * as THREE from 'three';
import { Vehicle, pointBlocked, wrapAngle } from './vehicles.js';
import { VEHICLES } from '../data/vehicles.js';
import { RoadGraph } from '../world/roadgraph.js';
import { CITY_DATA } from '../data/city.js';

// Ambient traffic: a dozen AI cars cruising the road network on random
// routes. Each car brakes for the player or another car ahead of it, shows
// brake lights while stopped, and reroutes itself if it ever gets stuck.
export class Traffic {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.graph = null;
    try {
      this.graph = new RoadGraph(CITY_DATA);
    } catch {
      this.graph = null;
    }
    const rng = game.rng;
    const busDef = VEHICLES.find((v) => v.type === 'bus');
    for (let i = 0; i < 12; i++) {
      const def = i === 3 && busDef ? busDef : rng.pick(VEHICLES);
      // Never spawn a car on top of the player at game start.
      let spot = this._randomRoadPoint();
      let guard = 0;
      while (Math.hypot(spot.x, spot.z) < 15 && guard < 6) {
        spot = this._randomRoadPoint();
        guard++;
      }
      const vehicle = new Vehicle(
        game, def, spot.x, spot.z, rng.next() * Math.PI * 2, { parked: false },
      );
      this.cars.push({
        vehicle,
        route: this._newRoute(spot),
        wp: 0,
        cruise: 8 + rng.range(0, 5),
        stuck: 0,
      });
    }
  }

  _randomRoadPoint() {
    const rng = this.game.rng;
    for (let tries = 0; tries < 12; tries++) {
      const x = rng.range(-260, 260);
      const z = rng.range(-260, 260);
      if (this.game.city?.isRoad?.(x, z) && !pointBlocked(this.game, x, z, 1.5)) {
        return { x, z };
      }
    }
    return { x: 0, z: -70 * Math.floor(rng.range(0, 4)) };
  }

  _newRoute(from) {
    if (this.graph?.randomRoute) {
      try {
        const route = this.graph.randomRoute(this.game.rng);
        if (Array.isArray(route) && route.length > 1) return route;
      } catch {
        // Fall through to the grid route below.
      }
    }
    // Axis-aligned grid fallback: drive along streets, turning at
    // intersections, so traffic still works without a road graph.
    const rng = this.game.rng;
    const points = [];
    let x = from.x;
    let z = from.z;
    for (let i = 0; i < 4; i++) {
      if (rng.chance(0.5)) {
        x = THREE.MathUtils.clamp(x + rng.pick([-1, 1]) * 70 * rng.int(1, 3), -260, 260);
      } else {
        z = THREE.MathUtils.clamp(z + rng.pick([-1, 1]) * 70 * rng.int(1, 3), -260, 260);
      }
      points.push({ x, z });
    }
    return points;
  }

  update(dt) {
    const state = this.game.state;
    const playerPos = state.playerPos;
    const playerVehicle = state.playerInVehicle;
    for (const car of this.cars) {
      const vehicle = car.vehicle;
      if (vehicle.wrecked) continue;
      const pos = vehicle.mesh.position;
      const target = car.route[car.wp];
      if (!target) {
        car.route = this._newRoute({ x: pos.x, z: pos.z });
        car.wp = 0;
        continue;
      }
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        car.wp++;
        if (car.wp >= car.route.length) {
          car.route = this._newRoute({ x: pos.x, z: pos.z });
          car.wp = 0;
        }
        continue;
      }
      const desired = Math.atan2(dx, dz);
      const diff = wrapAngle(desired - vehicle.heading);
      // Stop for the player, the player's car, or another car ahead.
      const fx = Math.sin(vehicle.heading);
      const fz = Math.cos(vehicle.heading);
      const ahead = (ox, oz, range) => {
        const oxd = ox - pos.x;
        const ozd = oz - pos.z;
        const d = Math.hypot(oxd, ozd);
        return d < range && d > 0.01 && ((oxd * fx + ozd * fz) / d) > 0.6;
      };
      let blocked = ahead(playerPos.x, playerPos.z, 9);
      if (!blocked && playerVehicle && playerVehicle !== vehicle) {
        blocked = ahead(playerVehicle.mesh.position.x, playerVehicle.mesh.position.z, 9);
      }
      if (!blocked) {
        for (const other of this.cars) {
          if (other === car || other.vehicle.wrecked) continue;
          if (ahead(other.vehicle.mesh.position.x, other.vehicle.mesh.position.z, 8)) {
            blocked = true;
            break;
          }
        }
      }
      vehicle.setBrakeLights(blocked);
      const throttle = blocked ? 0 : (Math.abs(diff) > 1.1 ? 0.25 : 1);
      const steer = THREE.MathUtils.clamp(diff * 2.2, -1, 1);
      const controls = {
        throttle: vehicle.speed >= car.cruise ? 0 : throttle,
        brake: blocked ? 1 : 0,
        steer,
        handbrake: false,
        nos: false,
      };
      vehicle.update(dt, controls);
      // Stuck against something: pick a fresh route after 3 seconds.
      if (throttle > 0 && Math.abs(vehicle.speed) < 0.4) {
        car.stuck += dt;
        if (car.stuck > 3) {
          car.route = this._newRoute({ x: pos.x, z: pos.z });
          car.wp = 0;
          car.stuck = 0;
        }
      } else {
        car.stuck = 0;
      }
    }
  }

  count() {
    return this.cars.filter((car) => !car.vehicle.wrecked).length;
  }
}
