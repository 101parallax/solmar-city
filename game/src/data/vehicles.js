// Vehicle roster for Solmar City: eleven original cars, vans and trucks.
// topSpeed is km/h, accel is m/s^2 on the same scale the arcade physics
// uses (5 for a bus, 15 for a supercar — see entities/vehicles.js), color
// is the default paint. The Vento GT is the sport coupe Rico must steal
// in mission M1.

export const VEHICLES = [
  {
    id: 'vento-gt',
    name: 'Vento GT',
    type: 'sport',
    topSpeed: 205,
    accel: 13,
    brake: 0.85,
    color: 0xd7263d,
    price: 45000,
  },
  {
    id: 'solmar-cruiser',
    name: 'Solmar Cruiser',
    type: 'sedan',
    topSpeed: 150,
    accel: 8,
    brake: 0.7,
    color: 0x2e5f8a,
    price: 12000,
  },
  {
    id: 'bayline-suv',
    name: 'Bayline SUV',
    type: 'suv',
    topSpeed: 165,
    accel: 9,
    brake: 0.65,
    color: 0x3d7a4f,
    price: 22000,
  },
  {
    id: 'harbor-van',
    name: 'Harbor Van',
    type: 'van',
    topSpeed: 130,
    accel: 6.5,
    brake: 0.6,
    color: 0xd9d9d9,
    price: 9000,
  },
  {
    id: 'coastliner-bus',
    name: 'Coastliner Bus',
    type: 'bus',
    topSpeed: 110,
    accel: 5,
    brake: 0.55,
    color: 0xe8a33d,
    price: 30000,
  },
  {
    id: 'dune-runner',
    name: 'Dune Runner',
    type: 'truck',
    topSpeed: 155,
    accel: 7,
    brake: 0.62,
    color: 0x8a5a2e,
    price: 18000,
  },
  {
    id: 'stratos-s',
    name: 'Stratos S',
    type: 'supercar',
    topSpeed: 240,
    accel: 15,
    brake: 0.95,
    color: 0xf2c230,
    price: 120000,
  },
  {
    id: 'palm-coupe',
    name: 'Palm Coupe',
    type: 'sport',
    topSpeed: 190,
    accel: 12,
    brake: 0.8,
    color: 0x7ab8c9,
    price: 38000,
  },
  {
    id: 'marina-taxi',
    name: 'Marina Taxi',
    type: 'sedan',
    topSpeed: 145,
    accel: 8,
    brake: 0.7,
    color: 0xf2d230,
    price: 11000,
  },
  {
    id: 'rustler-pickup',
    name: 'Rustler Pickup',
    type: 'truck',
    topSpeed: 150,
    accel: 7.5,
    brake: 0.6,
    color: 0x6b4f3a,
    price: 15000,
  },
  {
    id: 'city-compact',
    name: 'City Compact',
    type: 'sedan',
    topSpeed: 135,
    accel: 7,
    brake: 0.72,
    color: 0x9aa5ad,
    price: 7000,
  },
];

// Look a vehicle definition up by its display name (used by M1: "Vento GT").
export function findVehicleByName(name) {
  return VEHICLES.find((v) => v.name === name) ?? null;
}

// Look a vehicle definition up by its id (used by the save system).
export function findVehicleById(id) {
  return VEHICLES.find((v) => v.id === id) ?? null;
}
