// Traffic: ambient AI cars that follow the road graph, brake for the player
// ahead of them, and show brake lights. RoadGraph construction is guarded:
// when it fails, cars fall back to the plain street grid.
import { Vehicle } from './vehicles.js';
import { RoadGraph } from '../world/roadgraph.js';
import { CITY_DATA } from '../data/city.js';

const TRAFFIC_COUNT = 12;
const CITY_HALF = 280;
const BLOCK = 70;
const CRUISE_MIN = 8;
const CRUISE_MAX = 12;

export class Traffic {
  constructor(game) {
    this.game = game;
    this.rng = game.rng || {
      next: () => 0.5,
      range: (a, b) => (a + b) / 2,
      int: (a) => a,
      pick: (arr) => arr[0],
      chance: () => false,
    };
    // Reuse the shared road graph built by main.js (new RoadGraph(game)
    // would throw: the constructor needs city data, not the game object).
    this.roadGraph = game.roadGraph || null;
    if (!this.roadGraph) {
      try {
        this.roadGraph = new RoadGraph(CITY_DATA);
      } catch (err) {
        this.roadGraph = null;
      }
    }
    this.cars = [];
    const defs = [
      { name: 'Marina LX', type: 'sedan', topSpeed: 165, accel: 9, color: 0x3a6ea5 },
      { name: 'Palma Sedan', type: 'sedan', topSpeed: 160, accel: 9, color: 0x9aa5ad },
      { name: 'Duna SUV', type: 'suv', topSpeed: 175, accel: 10, color: 0x5b7a4d },
      { name: 'Brisa Van', type: 'van', topSpeed: 140, accel: 7, color: 0xe8e3d3 },
      { name: 'Coral Coupe', type: 'sport', topSpeed: 205, accel: 12, color: 0xff8c42 },
    ];
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      const def = defs[i % defs.length];
      const start = this.randomRoadPoint();
      const vehicle = new Vehicle(game, def, start.x, start.z, 0);
      vehicle.mesh.userData.hit = { kind: 'traffic', ref: vehicle };
      this.cars.push({
        vehicle,
        route: this.newRoute(start),
        waypointIndex: 0,
        cruiseSpeed: this.rng.range(CRUISE_MIN, CRUISE_MAX),
        braking: false,
      });
    }
  }

  get vehicles() {
    return this.cars.map((car) => car.vehicle);
  }

  count() {
    return this.cars.length;
  }

  gridLine() {
    // Street grid lines run every 70 m across the 560 m city.
    const steps = Math.floor((CITY_HALF * 2) / BLOCK);
    return -CITY_HALF + this.rng.int(0, steps) * BLOCK;
  }

  randomRoadPoint() {
    if (this.rng.chance(0.5)) {
      return { x: this.gridLine(), z: this.rng.range(-CITY_HALF + 10, CITY_HALF - 10) };
    }
    return { x: this.rng.range(-CITY_HALF + 10, CITY_HALF - 10), z: this.gridLine() };
  }

  gridRoute(from) {
    // Fallback route: walk the street grid, turning at intersections.
    const route = [];
    let x = from.x;
    let z = from.z;
    let horizontal = this.rng.chance(0.5);
    for (let i = 0; i < 6; i++) {
      if (horizontal) {
        x = this.gridLine();
      } else {
        z = this.gridLine();
      }
      horizontal = !horizontal;
      route.push({ x, z });
    }
    return route;
  }

  newRoute(from) {
    if (this.roadGraph && typeof this.roadGraph.randomRoute === 'function') {
      try {
        const route = this.roadGraph.randomRoute(this.rng);
        if (Array.isArray(route) && route.length > 0) return route;
      } catch (ignored) {
        // Fall through to the grid route below.
      }
    }
    if (this.roadGraph && typeof this.roadGraph.route === 'function') {
      try {
        const target = this.randomRoadPoint();
        const route = this.roadGraph.route(from, target);
        if (Array.isArray(route) && route.length > 0) return route;
      } catch (ignored) {
        // Fall through to the grid route below.
      }
    }
    return this.gridRoute(from);
  }

  playerAhead(car) {
    const vehicle = car.vehicle;
    const playerPos = this.game.state.playerPos;
    if (!playerPos) return false;
    const dx = playerPos.x - vehicle.mesh.position.x;
    const dz = playerPos.z - vehicle.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 10 || dist < 0.5) return false;
    // Only brake when the player is in front of the car.
    const forwardX = Math.sin(vehicle.heading);
    const forwardZ = Math.cos(vehicle.heading);
    const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ;
    return dot > 0.5;
  }

  update(dt) {
    for (const car of this.cars) {
      const vehicle = car.vehicle;
      if (vehicle.wrecked) continue;
      const pos = vehicle.mesh.position;
      if (car.waypointIndex >= car.route.length) {
        car.route = this.newRoute({ x: pos.x, z: pos.z });
        car.waypointIndex = 0;
      }
      const target = car.route[car.waypointIndex];
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 5) {
        car.waypointIndex++;
        continue;
      }
      const targetHeading = Math.atan2(dx, dz);
      car.braking = this.playerAhead(car);
      vehicle.setBrakeLights(car.braking);
      vehicle.driveAI(dt, targetHeading, car.braking ? 0 : car.cruiseSpeed);
    }
  }
}
