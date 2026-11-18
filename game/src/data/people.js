// The people of Solmar City: story characters with a line or two of dialogue
// each, plus a pool of pedestrian names for ambient flavor. All names are
// original.
export const CHARACTERS = [
  {
    id: 'rico', name: 'Rico Vane', role: 'Protagonist',
    color: 0x3498db,
    lines: [
      'Solmar owes me a living. Time to collect.',
      'One more job and I am out of the red for good.',
    ],
  },
  {
    id: 'marco', name: 'Marco', role: 'Fixer',
    color: 0xe67e22,
    lines: [
      'Rico! You need work, I got work. You need wheels, I know wheels.',
      'Do this clean and the whole city starts learning your name.',
    ],
  },
  {
    id: 'lena', name: 'Lena', role: 'Wheelwoman',
    color: 0xe84393,
    lines: [
      'You drive like the road owes you money. I like it.',
      'Keep up with me through the harbor and we will talk about the big jobs.',
    ],
  },
  {
    id: 'silas', name: 'Silas Kane', role: 'Boss',
    color: 0x2d3436,
    lines: [
      'Solmar runs on my schedule, boy. You are just visiting.',
      'You want the last job? Then you take it from me.',
    ],
  },
  {
    id: 'priya', name: 'Priya Nair', role: 'Mechanic',
    color: 0x00b894,
    lines: [
      'Bring it in bent, take it out better than new. That is the deal.',
      'Nitro is not a toy, Rico. Respect the bottle.',
    ],
  },
  {
    id: 'eddie', name: 'Eddie Sol', role: 'Taxi dispatcher',
    color: 0xfdcb6e,
    lines: [
      'Fares are waiting at every stand, friend. Easy money.',
      'Drive smooth, tip big. That is the Solmar way.',
    ],
  },
];

export const PED_NAMES = [
  'Ana', 'Ben', 'Carmen', 'Dario', 'Elena', 'Felix', 'Greta', 'Hugo',
  'Ines', 'Jorge', 'Kira', 'Luis', 'Marta', 'Nico', 'Olga', 'Pablo',
  'Quinn', 'Rosa', 'Sami', 'Tara', 'Umar', 'Vera', 'Walt', 'Yara',
];

export function characterById(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

export function randomPedName(rng) {
  return rng.pick(PED_NAMES);
}
