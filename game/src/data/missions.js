// Mission definitions for Solmar City: seven story missions in four chapters,
// all characters, places and vehicles original. Positions are world coordinates
// in metres on the city grid (streets sit on multiples of 70; the city spans
// -280..280 on both axes), so every mission point lands on a road intersection
// whatever the final district layout is.
//
// Objective types (handled by systems/missions.js):
//   goto       - reach a point on foot or in any vehicle
//   steal      - get into the target vehicle (objective.vehicleId)
//   deliver    - reach a point while driving the stolen vehicle
//   checkpoint - race gates, completed in order while the mission timer runs
//   defeat     - defeat `count` hostiles (state.defeatedCount, fed by combat)
//   chase      - catch the fleeing target vehicle (close + slow, or wrecked)
//   escape     - lose the cops: reach 3 stars, then get back to 0
//   return     - reach a point (the giver) to close the mission
//
// `chapter` / `stage` order the story; `rep` is the reputation awarded on a
// pass (systems/rep.js). `requiresTier` gates a mission behind a REP tier
// (M7 needs tier 5, KINGPIN). `hostiles` lists the guards a defeat objective
// spawns (health / shootDamage / shirt override the defaults); chase and
// steal objectives carry `vehicleType` / `vehicleColor` for the mission car.

export const MISSIONS = [
  {
    id: 'm1',
    name: 'The Pickup',
    chapter: 'Chapter 1 · The Debt',
    stage: 1,
    giver: "Marco Salas",
    giverBlip: 'M',
    giverPos: { x: -140, z: 70 },
    district: 'Mercado',
    reward: 800,
    rep: 20,
    intro: [
      { speaker: 'Marco Salas', text: 'Rico. You still owe me twelve thousand, and my patience is thinner than your wallet.' },
      { speaker: 'Rico Vane', text: 'I am working on it, Marco. The cab business is slow this month.' },
      { speaker: 'Marco Salas', text: 'Then work faster. A Vento GT is parked outside the Halcyon tower in Downtown. Bring it to my garage in one piece and I will knock eight hundred off your debt.' },
      { speaker: 'Rico Vane', text: 'Steal a car in broad daylight? The cops will be all over me.' },
      { speaker: 'Marco Salas', text: 'That is your problem, Rico. Drive careful, or do not get caught. Your choice.' },
    ],
    objectives: [
      {
        type: 'goto',
        label: 'Go to the Vento GT in Downtown',
        pos: { x: 140, z: -140 },
        radius: 14,
      },
      {
        type: 'steal',
        label: 'Steal the Vento GT',
        vehicleId: 'm1-target',
        vehicleName: 'Vento GT',
        vehicleType: 'sports',
        vehicleColor: 0xd21f2b,
        pos: { x: 140, z: -140 },
        radius: 14,
      },
      {
        type: 'deliver',
        label: 'Deliver the Vento GT to the Salas garage',
        pos: { x: -210, z: 140 },
        radius: 16,
        requiresVehicle: 'm1-target',
      },
    ],
    passedLine: 'Marco Salas: Clean work, Rico. Eight hundred off the books. Do not spend it all at once.',
    failedLine: 'Marco Salas: You had one job, Rico. One car. We will talk about this later.',
  },
  {
    id: 'm2',
    name: 'Harbor Run',
    chapter: 'Chapter 1 · The Debt',
    stage: 2,
    giver: 'Lena Kross',
    giverBlip: 'L',
    giverPos: { x: -210, z: -140 },
    district: 'Harbor',
    reward: 1200,
    rep: 20,
    timeLimit: 60,
    intro: [
      { speaker: 'Lena Kross', text: 'Rico! You still drive that cab like your grandmother? I have a race tonight. Harbor loop, nine gates, sixty seconds.' },
      { speaker: 'Rico Vane', text: 'Racing is not my thing, Lena. I drive people to the airport.' },
      { speaker: 'Lena Kross', text: 'Twelve hundred says it is your thing tonight. My regular driver broke his wrist. You, me, and a very fast car. Say yes.' },
      { speaker: 'Rico Vane', text: 'Twelve hundred? Fine. But if I wreck it, the debt is yours.' },
      { speaker: 'Lena Kross', text: 'Deal. Hit every gate in order. Miss one and the run is dead. Go!' },
    ],
    objectives: [
      { type: 'checkpoint', label: 'Checkpoint 1 of 9', pos: { x: -210, z: -140 }, radius: 12 },
      { type: 'checkpoint', label: 'Checkpoint 2 of 9', pos: { x: -210, z: -70 }, radius: 12 },
      { type: 'checkpoint', label: 'Checkpoint 3 of 9', pos: { x: -140, z: -70 }, radius: 12 },
      { type: 'checkpoint', label: 'Checkpoint 4 of 9', pos: { x: -70, z: -70 }, radius: 12 },
      { type: 'checkpoint', label: 'Checkpoint 5 of 9', pos: { x: -70, z: 0 }, radius: 12 },
      { type: 'checkpoint', label: 'Checkpoint 6 of 9', pos: { x: 0, z: 0 }, radius: 12 },
      { type: 'checkpoint', label: 'Checkpoint 7 of 9', pos: { x: 70, z: 0 }, radius: 12 },
      { type: 'checkpoint', label: 'Checkpoint 8 of 9', pos: { x: 140, z: 0 }, radius: 12 },
      { type: 'checkpoint', label: 'Checkpoint 9 of 9', pos: { x: 140, z: 70 }, radius: 12 },
    ],
    passedLine: 'Lena Kross: Sixty seconds and you made it look easy! The twelve hundred is yours, cabbie.',
    failedLine: 'Lena Kross: Too slow, Rico. The harbor eats slow drivers. Come back when your foot is heavier.',
  },
  {
    id: 'm3',
    name: 'The Collection',
    chapter: 'Chapter 2 · The Collection',
    stage: 1,
    giver: 'Marco Salas',
    giverBlip: 'M',
    giverPos: { x: -210, z: 70 },
    district: 'Mercado',
    reward: 1500,
    rep: 30,
    hostiles: [
      { x: 206, z: 206 },
      { x: 214, z: 208 },
      { x: 210, z: 216 },
    ],
    intro: [
      { speaker: 'Marco Salas', text: 'Eddie Voss owes me money and stopped answering his phone. He is hiding in Vista Hills with his friends.' },
      { speaker: 'Rico Vane', text: 'You want me to collect? I am a driver, Marco, not muscle.' },
      { speaker: 'Marco Salas', text: 'Today you are both. His guards will try to stop you. Eddie will run the second he sees you. Bring me the money, Rico.' },
      { speaker: 'Rico Vane', text: 'And if Eddie does not want to pay?' },
      { speaker: 'Marco Salas', text: 'Then convince him. Fifteen hundred for you when it is done. No excuses this time.' },
    ],
    objectives: [
      {
        type: 'goto',
        label: "Go to Eddie Voss's house in Vista Hills",
        pos: { x: 210, z: 210 },
        radius: 16,
      },
      {
        type: 'defeat',
        label: "Deal with Eddie's guards",
        pos: { x: 210, z: 210 },
        radius: 30,
        count: 3,
      },
      {
        type: 'chase',
        label: 'Catch Eddie before he escapes',
        hint: 'Ram it, block it, or steal it',
        vehicleId: 'm3-target',
        vehicleName: "Eddie's coupe",
        vehicleType: 'sports',
        vehicleColor: 0x1f6fd2,
        // 40 m north of the house, on the same street: the catch check
        // (within 12 m, speed < 2) would fire instantly if the car waited
        // beside the guard fight, so Eddie gets a head start down the road.
        pos: { x: 210, z: 170 },
        radius: 60,
      },
      {
        type: 'return',
        label: 'Bring the money back to Marco',
        pos: { x: -210, z: 70 },
        radius: 14,
      },
    ],
    passedLine: 'Marco Salas: Fifteen hundred, as promised. Eddie sends his regards. He will not be late again.',
    failedLine: 'Marco Salas: Eddie is still out there laughing at me, Rico. Fix this, or I find someone who can.',
  },
  {
    id: 'm4',
    name: 'Dockside Run',
    chapter: 'Chapter 2 · The Collection',
    stage: 2,
    giver: 'Dante Reyes',
    giverBlip: 'D',
    giverPos: { x: 140, z: 210 },
    district: 'Harbor',
    reward: 1000,
    rep: 25,
    timeLimit: 65,
    intro: [
      { speaker: 'Dante Reyes', text: 'Rico, right? Marco says you can drive. I have a package on the South Docks that needs to be in Downtown before the buyer changes his mind.' },
      { speaker: 'Rico Vane', text: 'What is in the package, Dante?' },
      { speaker: 'Dante Reyes', text: 'Nothing you need to know. Sixty-five seconds from the moment you grab it. The buyer does not wait, and neither do I.' },
      { speaker: 'Rico Vane', text: 'Sixty-five seconds across the whole city? You are joking.' },
      { speaker: 'Dante Reyes', text: 'One thousand says I am not. Grab the package and drive like the dock is on fire.' },
    ],
    objectives: [
      {
        type: 'goto',
        label: 'Pick up the package at the South Docks',
        pos: { x: 140, z: 280 },
        radius: 14,
      },
      {
        type: 'goto',
        label: 'Deliver the package to the Halcyon loading bay',
        pos: { x: 140, z: -140 },
        radius: 14,
      },
    ],
    passedLine: 'Dante Reyes: On time, in one piece. The buyer is happy, which means I am happy. A thousand, as agreed.',
    failedLine: 'Dante Reyes: Too slow. The buyer walked. Do not come back to my dock until you can drive.',
  },
  {
    id: 'm5',
    name: 'Turf War',
    chapter: 'Chapter 3 · Turf',
    stage: 1,
    giver: 'Nadia Ferro',
    giverBlip: 'N',
    giverPos: { x: -70, z: -70 },
    district: 'Downtown',
    reward: 1800,
    rep: 30,
    hostiles: [
      { x: -8, z: -8 },
      { x: 8, z: -8 },
      { x: -8, z: 8 },
      { x: 8, z: 8 },
      { x: -12, z: 0, shootDamage: 10 },
      { x: 12, z: 0, shootDamage: 10 },
    ],
    intro: [
      { speaker: 'Nadia Ferro', text: 'The Harbor crew is moving onto Central Street, Rico. Six of them, right in the open, like they own the place.' },
      { speaker: 'Rico Vane', text: 'And that is my problem because?' },
      { speaker: 'Nadia Ferro', text: 'Because Marco pays me to keep this street clean, and I pay you to help me keep it that way. Eighteen hundred. No witnesses, no survivors standing.' },
      { speaker: 'Rico Vane', text: 'Six against one. Those are not odds, Nadia, that is a funeral.' },
      { speaker: 'Nadia Ferro', text: 'Then make it theirs, not yours. Go.' },
    ],
    objectives: [
      {
        type: 'goto',
        label: 'Reach the turf on Central St',
        pos: { x: 0, z: 0 },
        radius: 16,
      },
      {
        type: 'defeat',
        label: 'Take down the Harbor crew',
        pos: { x: 0, z: 0 },
        radius: 30,
        count: 6,
      },
    ],
    passedLine: 'Nadia Ferro: Central Street is ours again. Eighteen hundred, and the crew will think twice before coming back.',
    failedLine: 'Nadia Ferro: The crew is still standing, Rico. So much for Marco’s best driver.',
  },
  {
    id: 'm6',
    name: 'The Escape',
    chapter: 'Chapter 3 · Turf',
    stage: 2,
    giver: 'Lena Kross',
    giverBlip: 'L',
    giverPos: { x: 70, z: -210 },
    district: 'Vista Hills',
    reward: 1500,
    rep: 30,
    intro: [
      { speaker: 'Lena Kross', text: 'Rico, I need you to do something stupid for me. The PD has a new pursuit captain and I want to know how good he really is.' },
      { speaker: 'Rico Vane', text: 'Lena, no. The last time you said that, I spent a night in a cell.' },
      { speaker: 'Lena Kross', text: 'Three stars, Rico. That is all I am asking. Get their attention, then lose them. If you can shake a full pursuit, I will know the new captain is all talk.' },
      { speaker: 'Rico Vane', text: 'And if I get caught?' },
      { speaker: 'Lena Kross', text: 'Then you owe me fifteen hundred instead of the other way around. Go make some noise.' },
    ],
    objectives: [
      {
        type: 'escape',
        label: 'Lose the cops',
        hint: 'Break line of sight — hide until the stars fade',
      },
    ],
    passedLine: 'Lena Kross: You shook a full pursuit! The new captain is all talk. Fifteen hundred, and I owe you a drink.',
    failedLine: 'Lena Kross: Caught already? The captain sends his regards, Rico.',
  },
  {
    id: 'm7',
    name: 'The Last Job',
    chapter: 'Chapter 4 · The Last Job',
    stage: 1,
    giver: 'Marco Salas',
    giverBlip: 'M',
    giverPos: { x: -210, z: 140 },
    district: 'Mercado',
    reward: 4000,
    rep: 50,
    requiresTier: 5,
    hostiles: [
      { x: 206, z: -206, health: 250, shootDamage: 12, shirt: 0x7a1f1f },
      { x: 214, z: -208 },
      { x: 210, z: -216 },
    ],
    intro: [
      { speaker: 'Marco Salas', text: 'This is it, Rico. Viktor Hale holds the ledger for every debt in this city — including yours. Twelve thousand, gone, if you bring me that book.' },
      { speaker: 'Rico Vane', text: 'Hale has guards, Marco. And he does not miss.' },
      { speaker: 'Marco Salas', text: 'That is why I am sending my best. His penthouse, Vista Hills north. His guards first, then Hale himself. He will run — he always runs.' },
      { speaker: 'Rico Vane', text: 'And when I bring you the ledger?' },
      { speaker: 'Marco Salas', text: 'Then you are free, Rico. Four thousand in your pocket and the whole city knowing your name. The last job. Make it count.' },
    ],
    objectives: [
      {
        type: 'goto',
        label: "Reach Viktor Hale's penthouse",
        pos: { x: 210, z: -210 },
        radius: 16,
      },
      {
        type: 'defeat',
        label: 'Take down Hale and his guards',
        pos: { x: 210, z: -210 },
        radius: 30,
        count: 3,
      },
      {
        type: 'chase',
        label: 'Catch Viktor Hale before he escapes',
        hint: 'Ram it, block it, or steal it',
        vehicleId: 'm7-target',
        vehicleName: "Hale's coupe",
        vehicleType: 'sports',
        vehicleColor: 0x111111,
        // 40 m south of the penthouse, on the same street: the catch check
        // (within 12 m, speed < 2) would fire instantly if the car waited
        // beside the boss arena, so Hale gets a head start down the road.
        pos: { x: 210, z: -170 },
        radius: 60,
      },
      {
        type: 'return',
        label: 'Bring the ledger back to Marco',
        pos: { x: -210, z: 140 },
        radius: 14,
      },
    ],
    passedLine: 'Marco Salas: The ledger is mine and your debt is gone, Rico. Four thousand, and the city is yours now. Kingpin.',
    failedLine: 'Marco Salas: Hale is still out there with my ledger, Rico. The last job is still waiting.',
  },
];

/** Look a mission definition up by id; returns null for an unknown id. */
export function getMission(id) {
  return MISSIONS.find((m) => m.id === id) ?? null;
}

/** Mission ids in story order. */
export const MISSION_ORDER = MISSIONS.map((m) => m.id);
