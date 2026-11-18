// Vehicle types for Solmar City. All names are original — no real-world brands.
// Stats are arcade-tuned: speeds in m/s, accel in m/s^2. Dimensions in meters;
// the mesh is built facing +Z, so length runs along Z and width along X.

export const VEHICLE_TYPES = {
  sedan: {
    id: 'sedan', name: 'Solmar Comet', kind: 'car',
    length: 4.6, width: 1.8, height: 1.35, wheelBase: 2.7,
    topSpeed: 38, accel: 9, brake: 18, reverseSpeed: 10,
    maxSteer: 0.55, grip: 8, spawnWeight: 22,
    colors: [0x8a8f98, 0x2b2f36, 0xb8bcc2, 0x7a1f1f, 0x1f3a5f, 0x3a5f2a],
  },
  sports: {
    id: 'sports', name: 'Vento GT', kind: 'car',
    length: 4.4, width: 1.9, height: 1.15, wheelBase: 2.6,
    topSpeed: 52, accel: 14, brake: 22, reverseSpeed: 11,
    maxSteer: 0.5, grip: 10, spawnWeight: 10,
    colors: [0xd21f2b, 0xf2a007, 0x1f6fd2, 0xe8e8e8, 0x222222],
  },
  supercar: {
    id: 'supercar', name: 'Apex Stradale', kind: 'car',
    length: 4.5, width: 2.0, height: 1.05, wheelBase: 2.7,
    topSpeed: 62, accel: 18, brake: 26, reverseSpeed: 12,
    maxSteer: 0.45, grip: 12, spawnWeight: 3,
    colors: [0xffd400, 0x00b3a6, 0xd21f2b, 0x111111, 0xffffff],
  },
  suv: {
    id: 'suv', name: 'Terra Bronco', kind: 'car',
    length: 4.8, width: 1.95, height: 1.75, wheelBase: 2.8,
    topSpeed: 36, accel: 8, brake: 16, reverseSpeed: 9,
    maxSteer: 0.55, grip: 7, spawnWeight: 12,
    colors: [0x4a4a4a, 0xd8d3c8, 0x2a4a2a, 0x5f1f2a, 0x1f2a5f],
  },
  pickup: {
    id: 'pickup', name: 'Rancho Hauler', kind: 'car',
    length: 5.2, width: 1.95, height: 1.7, wheelBase: 3.1,
    topSpeed: 34, accel: 8, brake: 15, reverseSpeed: 9,
    maxSteer: 0.55, grip: 7, spawnWeight: 9,
    colors: [0x8a2f1f, 0x2f4a6a, 0xc8c8c8, 0x3a3a3a, 0x6a5a1f],
  },
  van: {
    id: 'van', name: 'Marina Courier', kind: 'van',
    length: 5.0, width: 2.0, height: 2.1, wheelBase: 3.0,
    topSpeed: 30, accel: 6.5, brake: 14, reverseSpeed: 8,
    maxSteer: 0.6, grip: 6, spawnWeight: 8,
    colors: [0xe8e8e8, 0x9a9a9a, 0x2a5f8a, 0x8a5f1f],
  },
  taxi: {
    id: 'taxi', name: 'Solmar Cab', kind: 'car', taxi: true,
    length: 4.6, width: 1.8, height: 1.4, wheelBase: 2.7,
    topSpeed: 38, accel: 9, brake: 18, reverseSpeed: 10,
    maxSteer: 0.55, grip: 8, spawnWeight: 8,
    colors: [0xf2c200],
  },
  police: {
    id: 'police', name: 'SPD Interceptor', kind: 'car', police: true,
    length: 4.8, width: 1.9, height: 1.4, wheelBase: 2.8,
    topSpeed: 50, accel: 13, brake: 22, reverseSpeed: 11,
    maxSteer: 0.55, grip: 10, spawnWeight: 0,
    colors: [0x111111],
  },
  ambulance: {
    id: 'ambulance', name: 'St. Marina Medic', kind: 'van', emergency: true,
    length: 5.2, width: 2.0, height: 2.3, wheelBase: 3.0,
    topSpeed: 36, accel: 8, brake: 16, reverseSpeed: 8,
    maxSteer: 0.6, grip: 6, spawnWeight: 2,
    colors: [0xf5f5f0],
  },
  bus: {
    id: 'bus', name: 'Solmar Transit', kind: 'bus',
    length: 11.0, width: 2.5, height: 3.0, wheelBase: 6.5,
    topSpeed: 24, accel: 5, brake: 12, reverseSpeed: 6,
    maxSteer: 0.5, grip: 5, spawnWeight: 3,
    colors: [0x2a7a8a, 0xe8e8e8],
  },
  motorcycle: {
    id: 'motorcycle', name: 'Duna 650', kind: 'bike',
    length: 2.2, width: 0.8, height: 1.1, wheelBase: 1.45,
    topSpeed: 48, accel: 15, brake: 20, reverseSpeed: 4,
    maxSteer: 0.4, grip: 9, spawnWeight: 5,
    colors: [0xd21f2b, 0x1f1f1f, 0x1f6fd2, 0xf2a007],
  },
};

/** Civilian types the traffic spawner may pick, weighted by spawnWeight. */
export const TRAFFIC_TYPES = Object.values(VEHICLE_TYPES).filter((t) => t.spawnWeight > 0);

export function vehicleType(id) {
  return VEHICLE_TYPES[id] || VEHICLE_TYPES.sedan;
}

/** Pick a traffic type with the seeded RNG (mulberry32 function). */
export function randomTrafficType(rng) {
  let total = 0;
  for (const t of TRAFFIC_TYPES) total += t.spawnWeight;
  let roll = rng() * total;
  for (const t of TRAFFIC_TYPES) {
    roll -= t.spawnWeight;
    if (roll <= 0) return t;
  }
  return VEHICLE_TYPES.sedan;
}

export function randomColor(type, rng) {
  return type.colors[Math.floor(rng() * type.colors.length)];
}
