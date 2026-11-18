// Seven story missions for Solmar City. Coordinates sit on the road grid
// (multiples of 70, city spans -280..280). Every mission has a giver, a
// payout, REP, ordered objectives and subtitle dialogue shown as each
// objective starts. M7 stays locked until REP tier 5 (KINGPIN).

export const MISSIONS = [
  {
    id: 'M1',
    name: 'First Wheels',
    chapter: 'Chapter 1 — New in Town',
    giver: 'Marco',
    payout: 800,
    rep: 50,
    startPos: { x: -70, z: -70 },
    objectives: [
      { type: 'goto', label: 'Meet Marco', x: -70, z: -70, radius: 10 },
      { type: 'steal', label: 'Steal the Vento GT', vehicle: 'Vento GT', x: 70, z: -140, radius: 14 },
      { type: 'deliver', label: 'Deliver the Vento GT to the garage', x: -210, z: -70, radius: 12 },
    ],
    dialogue: [
      'MARCO: Rico! Fresh off the ferry and already looking for work. I like that.',
      'MARCO: There is a Vento GT parked uptown. Bring it to my garage, no scratches.',
      'RICO: No scratches? In this city? I will do my best.',
      'MARCO: Best is good enough. The keys are in it. Go.',
    ],
  },
  {
    id: 'M2',
    name: 'Harbor Run',
    chapter: 'Chapter 1 — New in Town',
    giver: 'Lena',
    payout: 1200,
    rep: 80,
    startPos: { x: -210, z: 210 },
    objectives: [
      {
        type: 'race',
        label: 'Harbor Run — 9 checkpoints',
        timeLimit: 90,
        checkpoints: [
          { x: -140, z: 210 }, { x: -70, z: 210 }, { x: 0, z: 210 },
          { x: 70, z: 210 }, { x: 140, z: 210 }, { x: 210, z: 210 },
          { x: 210, z: 140 }, { x: 210, z: 70 }, { x: 140, z: 70 },
        ],
      },
    ],
    dialogue: [
      'LENA: Harbor Run. Nine gates, ninety seconds. Think you can drive?',
      'RICO: Ninety seconds? That is generous.',
      'LENA: Talk is cheap. The clock is not. Go!',
    ],
  },
  {
    id: 'M3',
    name: 'The Shipment',
    chapter: 'Chapter 2 — The Harbor Job',
    giver: 'Marco',
    payout: 1500,
    rep: 100,
    startPos: { x: -140, z: 70 },
    objectives: [
      { type: 'goto', label: 'Reach the warehouse', x: 210, z: -140, radius: 12 },
      { type: 'defeat', label: 'Clear the warehouse guards (0/3)', count: 3, x: 210, z: -140, spread: 12 },
      {
        type: 'chase',
        label: 'Stop the courier car',
        hint: 'Ram it, block it, or steal it',
        target: { type: 'sport', x: 210, z: -210 },
        route: [
          { x: 140, z: -210 }, { x: 0, z: -210 }, { x: -140, z: -210 }, { x: -210, z: -210 },
        ],
        speed: 16,
        failOnEscape: true,
      },
    ],
    dialogue: [
      'MARCO: A shipment of mine is sitting in a warehouse. Guards all over it.',
      'MARCO: Clear them out, then stop the courier car before it leaves the harbor.',
      'RICO: Quiet or loud?',
      'MARCO: Loud is fine. Just do not let that car get away.',
    ],
  },
  {
    id: 'M4',
    name: 'Dockside Run',
    chapter: 'Chapter 2 — The Harbor Job',
    giver: 'Lena',
    payout: 1000,
    rep: 70,
    timeLimit: 120,
    startPos: { x: 70, z: 140 },
    objectives: [
      { type: 'goto', label: 'Pick up the crates at the pier', x: 140, z: 210, radius: 10 },
      { type: 'deliver', label: 'Deliver package 1 of 3', x: -70, z: 210, radius: 10 },
      { type: 'deliver', label: 'Deliver package 2 of 3', x: -210, z: 70, radius: 10 },
      { type: 'deliver', label: 'Deliver package 3 of 3', x: 0, z: -210, radius: 10 },
    ],
    dialogue: [
      'LENA: Three packages, three drop-offs, two minutes. The docks do not wait.',
      'RICO: Two minutes for three stops? You are testing me.',
      'LENA: I am timing you. Pick up the crates at the pier first.',
    ],
  },
  {
    id: 'M5',
    name: 'Turf War',
    chapter: 'Chapter 3 — Holding Ground',
    giver: 'Marco',
    payout: 2000,
    rep: 150,
    startPos: { x: -210, z: 0 },
    objectives: [
      { type: 'goto', label: 'Reach the market turf', x: -140, z: 140, radius: 14 },
      { type: 'defeat', label: 'Drive the Vipers off the turf (0/6)', count: 6, x: -140, z: 140, spread: 16 },
    ],
    dialogue: [
      'MARCO: The Vipers are pushing into my streets. Six of them, near the market.',
      'MARCO: Send them a message they cannot ignore.',
      'RICO: Six against one. Fair odds.',
      'MARCO: Come back in one piece, Rico.',
    ],
  },
  {
    id: 'M6',
    name: 'The Escape',
    chapter: 'Chapter 3 — Holding Ground',
    giver: 'Lena',
    payout: 1800,
    rep: 120,
    startPos: { x: 140, z: 70 },
    objectives: [
      { type: 'escape', label: 'Lose the cops', startWanted: 3 },
    ],
    dialogue: [
      'LENA: The harbor cops are all over me. Three stars and climbing.',
      'LENA: Take the heat, lose them, and meet me when the streets are quiet.',
      'RICO: Lose three stars? I will need a fast car and a quiet corner.',
    ],
  },
  {
    id: 'M7',
    name: 'The Last Job',
    chapter: 'Chapter 4 — The Last Job',
    giver: 'Vesper Kane',
    payout: 5000,
    rep: 300,
    unlockTier: 5,
    startPos: { x: 0, z: -70 },
    objectives: [
      { type: 'goto', label: 'Reach the old compound', x: -210, z: -210, radius: 14 },
      {
        type: 'defeat',
        label: 'Take down Dario Voss and his guards',
        count: 3,
        x: -210,
        z: -210,
        spread: 14,
        boss: { name: 'Dario Voss', hp: 250 },
      },
      {
        type: 'chase',
        label: 'Run down the boss car',
        hint: 'Ram it, block it, or steal it',
        target: { type: 'supercar', x: -210, z: -210 },
        route: [
          { x: -140, z: -210 }, { x: 0, z: -140 }, { x: 70, z: 0 },
          { x: 140, z: 140 }, { x: 210, z: 210 },
        ],
        speed: 18,
        failOnEscape: true,
      },
    ],
    dialogue: [
      'VESPER: Rico Vane. You have made quite a name on my streets.',
      'VESPER: One last job. My old partner took what was mine. Take it back.',
      'RICO: And then?',
      'VESPER: Then Solmar is yours. Finish it.',
    ],
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}
