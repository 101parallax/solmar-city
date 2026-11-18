// The 11 drivable vehicles of Solmar City. All names are original. Speeds
// are in metres per second (top speed) and metres per second squared
// (acceleration); sizes are in metres and drive the procedural mesh.
export const VEHICLES = [
  {
    id: 'vento-gt', name: 'Vento GT', type: 'sport',
    topSpeed: 62, accel: 22, grip: 1.15,
    colors: [0xc0392b, 0x2c3e50, 0xf1c40f],
    price: 45000, size: { length: 4.4, width: 1.9, height: 1.25 },
  },
  {
    id: 'halcyon', name: 'Halcyon Sedan', type: 'sedan',
    topSpeed: 42, accel: 13, grip: 0.95,
    colors: [0xbdc3c7, 0x34495e, 0x7f8c8d],
    price: 12000, size: { length: 4.7, width: 1.85, height: 1.45 },
  },
  {
    id: 'marlin', name: 'Marlin SUV', type: 'SUV',
    topSpeed: 45, accel: 14, grip: 0.9,
    colors: [0x1a5276, 0x922b21, 0x6e2c00],
    price: 22000, size: { length: 4.9, width: 2.0, height: 1.8 },
  },
  {
    id: 'driftwood', name: 'Driftwood Van', type: 'van',
    topSpeed: 36, accel: 10, grip: 0.8,
    colors: [0xf5f5f5, 0x5d6d7e, 0x935116],
    price: 9000, size: { length: 5.2, width: 2.0, height: 2.1 },
  },
  {
    id: 'harbor-bus', name: 'Harbor Bus', type: 'bus',
    topSpeed: 30, accel: 7, grip: 0.7,
    colors: [0x2e86c1, 0x148f77, 0xb7950b],
    price: 30000, size: { length: 9.5, width: 2.5, height: 2.9 },
  },
  {
    id: 'titan-hauler', name: 'Titan Hauler', type: 'truck',
    topSpeed: 32, accel: 8, grip: 0.75,
    colors: [0x7b241c, 0x1e8449, 0x5b2c6f],
    price: 28000, size: { length: 7.5, width: 2.4, height: 2.6 },
  },
  {
    id: 'stratos-x', name: 'Stratos X', type: 'supercar',
    topSpeed: 74, accel: 30, grip: 1.3,
    colors: [0x000000, 0xeaf2f8, 0x8e44ad],
    price: 120000, size: { length: 4.5, width: 2.0, height: 1.15 },
  },
  {
    id: 'coral-coupe', name: 'Coral Coupe', type: 'sport',
    topSpeed: 55, accel: 19, grip: 1.1,
    colors: [0xe74c3c, 0x16a085, 0xf39c12],
    price: 32000, size: { length: 4.3, width: 1.85, height: 1.3 },
  },
  {
    id: 'palmetto', name: 'Palmetto Pickup', type: 'truck',
    topSpeed: 40, accel: 12, grip: 0.85,
    colors: [0x7e5109, 0x212f3c, 0x7d6608],
    price: 18000, size: { length: 5.3, width: 2.0, height: 1.75 },
  },
  {
    id: 'lumen-taxi', name: 'Lumen Taxi', type: 'sedan',
    topSpeed: 44, accel: 14, grip: 0.95,
    colors: [0xf7dc6f, 0xf7dc6f, 0x2c3e50],
    price: 11000, size: { length: 4.6, width: 1.85, height: 1.45 },
  },
  {
    id: 'galleon', name: 'Galleon Cruiser', type: 'SUV',
    topSpeed: 47, accel: 15, grip: 0.9,
    colors: [0x0e6655, 0x4d5656, 0x6c3483],
    price: 26000, size: { length: 5.0, width: 2.05, height: 1.85 },
  },
];

export function vehicleById(id) {
  return VEHICLES.find((v) => v.id === id) || VEHICLES[1];
}

export function vehiclesByType(type) {
  return VEHICLES.filter((v) => v.type === type);
}
