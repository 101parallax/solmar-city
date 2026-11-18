// Pedestrian archetypes and original names for Solmar City. No real people;
// names are invented from common local-sounding first/last name pools.

export const FIRST_NAMES = [
  'Marco', 'Lena', 'Diego', 'Sofia', 'Ravi', 'Mina', 'Carlos', 'Ana',
  'Tomas', 'Priya', 'Jonas', 'Luz', 'Omar', 'Nina', 'Felix', 'Rosa',
  'Ivan', 'Maya', 'Pedro', 'Elena', 'Kofi', 'Sara', 'Hugo', 'Ines',
  'Dante', 'Lila', 'Bruno', 'Celia', 'Mateo', 'Aisha', 'Ruben', 'Tara',
];

export const LAST_NAMES = [
  'Vane', 'Costa', 'Marin', 'Solano', 'Reyes', 'Delgado', 'Ferro',
  'Luna', 'Prado', 'Silva', 'Ortega', 'Vega', 'Mora', 'Castillo',
  'Navarro', 'Rios', 'Santos', 'Pena', 'Fuentes', 'Barros',
];

/** Archetype: look + walking pace. Colors are hex numbers for MeshLambertMaterial. */
export const PED_TYPES = {
  commuter: {
    id: 'commuter', walkSpeed: 1.5, runSpeed: 5.5, height: 1.75,
    shirts: [0x3a5f8a, 0x5f5f5f, 0x8a3a3a, 0x2a2a2a, 0x7a6a3a],
    pants: [0x2a2f36, 0x3a3f4a, 0x1f1f1f, 0x4a3a2a],
    skins: [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0, 0x6a4030],
    weight: 30,
  },
  tourist: {
    id: 'tourist', walkSpeed: 1.2, runSpeed: 5.0, height: 1.7,
    shirts: [0xe86a5a, 0x5ac8e8, 0xf2c94c, 0x9ac85a, 0xe85ac8, 0xffffff],
    pants: [0x5a8ac8, 0xc8a05a, 0x2a5f5f, 0xe8e8e8, 0x8a5a3a],
    skins: [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0, 0x6a4030],
    weight: 22,
  },
  worker: {
    id: 'worker', walkSpeed: 1.6, runSpeed: 5.8, height: 1.78,
    shirts: [0xe88a1f, 0x3a7a3a, 0x2a5f8a, 0x8a8a2a],
    pants: [0x2a2f36, 0x3a3f4a, 0x4a3a2a],
    skins: [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0, 0x6a4030],
    weight: 18,
  },
  jogger: {
    id: 'jogger', walkSpeed: 2.6, runSpeed: 7.0, height: 1.72,
    shirts: [0xd21f2b, 0x1f6fd2, 0x2ad27a, 0xf2a007, 0x111111],
    pants: [0x1f1f1f, 0x2a2f36, 0x5f1f2a],
    skins: [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0, 0x6a4030],
    weight: 10,
  },
  senior: {
    id: 'senior', walkSpeed: 0.9, runSpeed: 3.5, height: 1.65,
    shirts: [0x8a8a8a, 0x6a7a8a, 0xa88a6a, 0x7a5a7a],
    pants: [0x3a3f4a, 0x4a3a2a, 0x2a2f36],
    skins: [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0],
    weight: 12,
  },
  kid: {
    id: 'kid', walkSpeed: 1.7, runSpeed: 6.2, height: 1.25,
    shirts: [0xf25a5a, 0x5ad2f2, 0x8ad25a, 0xf2d25a, 0xd25ad2],
    pants: [0x2a5fc8, 0xc85a5a, 0x2a2f36],
    skins: [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0, 0x6a4030],
    weight: 8,
  },
};

export const PED_TYPE_LIST = Object.values(PED_TYPES);

export function randomPedType(rng) {
  let total = 0;
  for (const t of PED_TYPE_LIST) total += t.weight;
  let roll = rng() * total;
  for (const t of PED_TYPE_LIST) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return PED_TYPES.commuter;
}

export function randomName(rng) {
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

export function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}
