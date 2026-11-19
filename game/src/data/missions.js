// Solmar City story missions: seven hand-authored jobs across five chapters.
// Every mission carries its payout, reputation reward, ordered objectives,
// subtitle dialogue, giver start position and required reputation tier.
// All coordinates sit on the road grid (multiples of 70) inside -280..280.

export const MISSIONS = [
  {
    id: 'M1',
    name: 'First Wheels',
    chapter: 1,
    giver: 'Marco',
    payout: 800,
    rep: 50,
    unlockTier: 1,
    startPos: { x: -70, z: -70 },
    objectives: [
      { type: 'goto', x: -70, z: -70, label: 'Meet Marco on Meridian Row' },
      { type: 'steal', vehicle: 'Vento GT', x: -140, z: -70, label: 'Steal the Vento GT' },
      { type: 'deliver', x: -210, z: -70, label: 'Deliver the Vento GT to the garage' },
    ],
    dialogue: [
      'Marco: Rico. You need wheels that do not ask questions.',
      'Marco: The Vento GT, silver, parked on Meridian Row. Take it.',
      'Marco: Bring her to the garage in one piece. Scratch her and you pay.',
      'Marco: Do this clean and there is more work where it came from.',
    ],
  },
  {
    id: 'M2',
    name: 'Harbor Run',
    chapter: 1,
    giver: 'Lena',
    payout: 1200,
    rep: 80,
    unlockTier: 1,
    startPos: { x: -210, z: 210 },
    objectives: [
      {
        type: 'race',
        timeLimit: 90,
        label: 'Win the Harbor Run',
        checkpoints: [
          { x: -140, z: 210 },
          { x: -70, z: 210 },
          { x: 0, z: 210 },
          { x: 70, z: 210 },
          { x: 140, z: 210 },
          { x: 210, z: 210 },
          { x: 210, z: 140 },
          { x: 210, z: 70 },
          { x: 210, z: 0 },
        ],
      },
    ],
    dialogue: [
      'Lena: Harbor Run. Nine gates, ninety seconds. No excuses.',
      'Lena: Cut the corners tight and keep your foot down.',
      'Lena: The harbor crowd loves a winner. Do not keep them waiting.',
    ],
  },
  {
    id: 'M3',
    name: 'The Shipment',
    chapter: 2,
    giver: 'Marco',
    payout: 1500,
    rep: 100,
    unlockTier: 1,
    startPos: { x: 210, z: -140 },
    objectives: [
      { type: 'goto', x: 210, z: -140, label: 'Reach the warehouse' },
      {
        type: 'defeat',
        count: 3,
        label: 'Clear the warehouse guards',
        positions: [
          { x: 140, z: -140 },
          { x: 210, z: -140 },
          { x: 280, z: -140 },
        ],
      },
      {
        type: 'chase',
        vehicle: 'van',
        label: 'Stop the courier van',
        spawn: { x: 210, z: -70 },
        escapeTime: 30,
        waypoints: [
          { x: 210, z: 0 },
          { x: 140, z: 0 },
          { x: 70, z: 0 },
          { x: 0, z: 0 },
          { x: -70, z: 0 },
          { x: -140, z: 0 },
          { x: -210, z: 0 },
        ],
      },
    ],
    dialogue: [
      'Marco: A shipment came in at the warehouse. Guards on the door.',
      'Marco: Clear them out, then stop the courier van before it leaves town.',
      'Marco: The cargo is ours. The van is not invited.',
      'Marco: Move fast. The harbor never sleeps and neither do they.',
    ],
  },
  {
    id: 'M4',
    name: 'Dockside Run',
    chapter: 2,
    giver: 'Lena',
    payout: 1000,
    rep: 70,
    unlockTier: 1,
    timeLimit: 120,
    startPos: { x: 70, z: 140 },
    objectives: [
      { type: 'deliver', x: -70, z: 210, label: 'Deliver package 1 of 3' },
      { type: 'deliver', x: 210, z: 210, label: 'Deliver package 2 of 3' },
      { type: 'deliver', x: -210, z: -210, label: 'Deliver package 3 of 3' },
    ],
    dialogue: [
      'Lena: Three packages, three drop points, two minutes on the clock.',
      'Lena: Dockside Run. Every second you waste is money gone.',
      'Lena: Deliver them all and the docks will know your name.',
    ],
  },
  {
    id: 'M5',
    name: 'Turf War',
    chapter: 3,
    giver: 'Marco',
    payout: 2000,
    rep: 150,
    unlockTier: 1,
    startPos: { x: 140, z: 210 },
    objectives: [
      { type: 'goto', x: 140, z: 210, label: 'Reach the disputed corner' },
      {
        type: 'defeat',
        count: 6,
        label: 'Take the street back',
        positions: [
          { x: 70, z: 210 },
          { x: 140, z: 210 },
          { x: 210, z: 210 },
          { x: 70, z: 140 },
          { x: 140, z: 140 },
          { x: 210, z: 140 },
        ],
      },
    ],
    dialogue: [
      'Marco: The Vipers are pushing into our turf. Push back.',
      'Marco: Six of them holding the corner. Take the street back.',
      'Marco: No half measures, Rico. They leave or they fall.',
    ],
  },
  {
    id: 'M6',
    name: 'The Escape',
    chapter: 4,
    giver: 'Lena',
    payout: 1800,
    rep: 120,
    unlockTier: 1,
    startPos: { x: -140, z: 210 },
    objectives: [
      { type: 'escape', startWanted: 3, label: 'Lose the cops' },
    ],
    dialogue: [
      'Lena: Three stars and the whole city on your tail. Lose them.',
      'Lena: Break line of sight, switch streets, stay cool.',
      'Lena: Get clean and meet me when the heat is gone.',
    ],
  },
  {
    id: 'M7',
    name: 'The Last Job',
    chapter: 5,
    giver: 'Vesper Kane',
    payout: 5000,
    rep: 300,
    unlockTier: 5,
    startPos: { x: 210, z: 210 },
    objectives: [
      { type: 'goto', x: 210, z: 210, label: 'Reach the Voss compound' },
      {
        type: 'defeat',
        count: 2,
        label: 'Take down Dario Voss',
        boss: { name: 'Dario Voss', hp: 250, x: 210, z: 210 },
        positions: [
          { x: 140, z: 210 },
          { x: 280, z: 210 },
        ],
      },
      {
        type: 'chase',
        vehicle: 'sport',
        label: 'Run down the fleeing boss car',
        spawn: { x: 210, z: 140 },
        escapeTime: 30,
        waypoints: [
          { x: 210, z: 70 },
          { x: 210, z: 0 },
          { x: 140, z: 0 },
          { x: 70, z: 0 },
          { x: 0, z: 0 },
          { x: -70, z: 0 },
        ],
      },
    ],
    dialogue: [
      'Vesper Kane: Dario Voss ends tonight. Everything leads to this.',
      'Vesper Kane: His guards first. Then the man himself.',
      'Vesper Kane: He will run when he breaks. Do not let him.',
      'Vesper Kane: Finish this and Solmar City is yours, Rico.',
    ],
  },
];

// Look up one mission definition by id, or null when unknown.
export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? null;
}

// Ordered mission ids, used by the map screen and completion tracking.
export const MISSION_IDS = MISSIONS.map((m) => m.id);

// Story totals, shown on the map screen and the title progress line.
export const MISSION_TOTAL_PAYOUT = MISSIONS.reduce((sum, m) => sum + m.payout, 0);
export const MISSION_TOTAL_REP = MISSIONS.reduce((sum, m) => sum + m.rep, 0);
