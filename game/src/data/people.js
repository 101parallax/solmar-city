// People of Solmar City: the story cast and the names pedestrians answer to.
// All characters are original. Rico Vane is the protagonist; Marco fixes jobs,
// Lena drives, Vesper Kane hands out the final job, and Dario Voss — the boss
// of mission M7 — stands in the way of it.

export const CHARACTERS = [
  {
    id: 'rico',
    name: 'Rico Vane',
    role: 'protagonist',
    color: 0x3d6ea5,
    dialogue: [
      'Solmar owes me a living. Time to collect.',
      'One more job, then I am out. That is what I keep telling myself.',
    ],
  },
  {
    id: 'marco',
    name: 'Marco',
    role: 'fixer',
    color: 0x8a6d2e,
    dialogue: [
      'Rico! Good. I have work, and work pays. Listen close.',
      'You want a name in this town? Start by not getting caught.',
    ],
  },
  {
    id: 'lena',
    name: 'Lena',
    role: 'wheelwoman',
    color: 0xa53d6e,
    dialogue: [
      'You drive like my grandmother. Lucky for you, I am driving.',
      'Harbor run, ninety seconds. Do not scratch the paint. Scratch theirs.',
    ],
  },
  {
    id: 'dario',
    name: 'Dario Voss',
    role: 'boss',
    color: 0x5a1f1f,
    dialogue: [
      'You walk into my harbor like you own it. You own nothing.',
      'Vesper sent a child to do a kingpin\'s work. How sad.',
    ],
  },
  {
    id: 'vesper',
    name: 'Vesper Kane',
    role: 'giver',
    color: 0x2e6b5a,
    dialogue: [
      'One last job, Rico. Voss took what is mine. Take it back.',
      'Do this clean and the whole city is yours. Do it loud and it still is.',
    ],
  },
];

// Names the pedestrian system draws from (seeded, see entities/pedestrians.js).
export const PED_NAMES = [
  'Ana',
  'Ben',
  'Carla',
  'Dmitri',
  'Elena',
  'Felix',
  'Greta',
  'Hugo',
  'Ines',
  'Jonas',
  'Kira',
  'Leo',
  'Mara',
  'Nils',
  'Olga',
  'Pablo',
  'Quinn',
  'Rosa',
  'Stefan',
  'Tania',
  'Umar',
  'Vera',
  'Wes',
  'Yuki',
  'Zoe',
  'Andre',
  'Bianca',
  'Casper',
  'Dana',
  'Emil',
];

// Look a character up by id (used by missions and dialogue).
export function findCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) ?? null;
}

// A seeded random pedestrian name (used when pedestrians spawn).
export function randomPedName(rng) {
  return rng.pick(PED_NAMES);
}
