// Mission definitions for Solmar City: three story missions, all characters,
// places and vehicles original. Positions are world coordinates in metres on the
// city grid (streets sit on multiples of 70; the city spans -280..280 on both
// axes), so every mission point lands on a road intersection whatever the final
// district layout is.
//
// Objective types (handled by systems/missions.js):
//   goto       - reach a point on foot or in any vehicle
//   steal      - get into the target vehicle (objective.vehicleId)
//   deliver    - reach a point while driving the stolen vehicle
//   checkpoint - race gates, completed in order while the mission timer runs
//   defeat     - defeat `count` hostiles (state.defeatedCount, fed by combat)
//   chase      - catch the fleeing target vehicle (close + slow, or wrecked)
//   return     - reach a point (the giver) to close the mission

export const MISSIONS = [
  {
    id: 'm1',
    name: 'The Pickup',
    giver: "Marco Salas",
    giverBlip: 'M',
    giverPos: { x: -140, z: 70 },
    district: 'Mercado',
    reward: 800,
    intro: [
      { speaker: 'Marco Salas', text: 'Rico. You still owe me twelve thousand, and my patience is thinner than your wallet.' },
      { speaker: 'Rico Vane', text: 'I am working on it, Marco. The cab business is slow this month.' },
      { speaker: 'Marco Salas', text: 'Then work faster. A Vortex GT is parked outside the Halcyon tower in Downtown. Bring it to my garage in one piece and I will knock eight hundred off your debt.' },
      { speaker: 'Rico Vane', text: 'Steal a car in broad daylight? The cops will be all over me.' },
      { speaker: 'Marco Salas', text: 'That is your problem, Rico. Drive careful, or do not get caught. Your choice.' },
    ],
    objectives: [
      {
        type: 'goto',
        label: 'Go to the Vortex GT in Downtown',
        pos: { x: 140, z: -140 },
        radius: 14,
      },
      {
        type: 'steal',
        label: 'Steal the Vortex GT',
        vehicleId: 'm1-target',
        vehicleName: 'Vortex GT',
        pos: { x: 140, z: -140 },
        radius: 14,
      },
      {
        type: 'deliver',
        label: 'Deliver the Vortex GT to the Salas garage',
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
    giver: 'Lena Kross',
    giverBlip: 'L',
    giverPos: { x: -210, z: -140 },
    district: 'Harbor',
    reward: 1200,
    timeLimit: 95,
    intro: [
      { speaker: 'Lena Kross', text: 'Rico! You still drive that cab like your grandmother? I have a race tonight. Harbor loop, nine gates, ninety-five seconds.' },
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
    passedLine: 'Lena Kross: Ninety-five seconds and you made it look easy! The twelve hundred is yours, cabbie.',
    failedLine: 'Lena Kross: Too slow, Rico. The harbor eats slow drivers. Come back when your foot is heavier.',
  },
  {
    id: 'm3',
    name: 'The Collection',
    giver: 'Marco Salas',
    giverBlip: 'M',
    giverPos: { x: -140, z: 70 },
    district: 'Mercado',
    reward: 1500,
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
        vehicleId: 'm3-target',
        vehicleName: "Eddie's coupe",
        pos: { x: 210, z: 210 },
        radius: 60,
      },
      {
        type: 'return',
        label: 'Bring the money back to Marco',
        pos: { x: -140, z: 70 },
        radius: 14,
      },
    ],
    passedLine: 'Marco Salas: Fifteen hundred, as promised. Eddie sends his regards. He will not be late again.',
    failedLine: 'Marco Salas: Eddie is still out there laughing at me, Rico. Fix this, or I find someone who can.',
  },
];

/** Look a mission definition up by id; returns null for an unknown id. */
export function getMission(id) {
  return MISSIONS.find((m) => m.id === id) ?? null;
}

/** Mission ids in story order. */
export const MISSION_ORDER = MISSIONS.map((m) => m.id);
