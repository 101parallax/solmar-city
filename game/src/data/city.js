// Static city data for Solmar City: districts, the road grid, landmarks,
// shops, taxi stands, the street-race start and the 20 hidden Sun Shells.
// Coordinates are world metres: x east, z south. The ocean lies south of the
// water line; the beach is the strip between the city edge and the water.

// Playable bounds (half-extent of the ground plane).
export const bounds = { minX: -290, maxX: 290, minZ: -290, maxZ: 290 };

// South of this z the world is water. Beach runs from bounds.maxZ to here.
export const waterLine = 315;

export const CITY_DATA = {
  bounds,
  waterLine,
  blockSize: 70,
  roadWidth: 14,
  // Road centre lines: -280, -210, ..., 280 in both axes (9 lines each).
  roadLines: [-280, -210, -140, -70, 0, 70, 140, 210, 280],

  districts: [
    {
      id: 'downtown',
      name: 'Downtown',
      bounds: { minX: -140, maxX: 140, minZ: -140, maxZ: 140 },
      color: 0x3d6ea5,
      description: 'Glass towers, neon and the busiest streets in Solmar.',
    },
    {
      id: 'harborfront',
      name: 'Harborfront',
      bounds: { minX: -290, maxX: 290, minZ: 140, maxZ: 290 },
      color: 0x2e8b8b,
      description: 'Warehouses, the pier and the lighthouse over the bay.',
    },
    {
      id: 'westMarina',
      name: 'West Marina',
      bounds: { minX: -290, maxX: -140, minZ: -290, maxZ: 140 },
      color: 0x7a9e4f,
      description: 'Leafy avenues, villas and the marina boardwalk.',
    },
    {
      id: 'northHills',
      name: 'North Hills',
      bounds: { minX: -140, maxX: 290, minZ: -290, maxZ: -140 },
      color: 0x9e7a4f,
      description: 'Hillside homes and quiet streets above the city.',
    },
    {
      id: 'oldTown',
      name: 'Old Town',
      bounds: { minX: 140, maxX: 290, minZ: -140, maxZ: 140 },
      color: 0xa55a3d,
      description: 'Brick lanes, markets and the oldest buildings in town.',
    },
  ],

  landmarks: [
    { id: 'lighthouse', name: 'Solmar Lighthouse', x: 0, z: 382, kind: 'lighthouse' },
    { id: 'pier', name: 'Harbor Pier', x: 0, z: 330, kind: 'pier' },
    { id: 'ferris', name: 'Marina Wheel', x: -210, z: 245, kind: 'ferris' },
    { id: 'arena', name: 'Solmar Arena', x: 245, z: 105, kind: 'arena' },
    { id: 'tower', name: 'Aurora Tower', x: -35, z: -105, kind: 'tower' },
    { id: 'fountain', name: 'Central Fountain', x: 35, z: 35, kind: 'fountain' },
    { id: 'fort', name: 'Old Fort', x: 245, z: -245, kind: 'fort' },
    { id: 'market', name: 'Old Market Hall', x: 175, z: -35, kind: 'market' },
  ],

  shops: [
    { id: 'chroma', name: 'Chroma Auto', type: 'respray', x: -105, z: 35 },
    { id: 'ironworks', name: 'Ironworks Gun Shop', type: 'guns', x: 105, z: -105 },
    { id: 'hospital', name: 'Solmar General Hospital', type: 'hospital', x: -35, z: -175 },
    { id: 'pdhq', name: 'Harbor PD Headquarters', type: 'police', x: 175, z: 175 },
  ],

  // Taxi stands sit ON road intersections so a player can always reach
  // them (block centres hide inside building colliders). These four match
  // the stands systems/sidejobs.js starts fares from, id for id.
  taxiStands: [
    { id: 'stand-downtown', name: 'Downtown', x: 0, z: 0 },
    { id: 'stand-harbor', name: 'Harbor', x: -210, z: -140 },
    { id: 'stand-beach', name: 'Beachfront', x: -70, z: 280 },
    { id: 'stand-uptown', name: 'Uptown', x: 210, z: -210 },
  ],

  // Street-race start: on the road at the M2 start line, facing east down
  // the z=210 straight where the Harbor Run checkpoints run.
  raceStart: { id: 'race-harbor', name: 'Harbor Sprint', x: -210, z: 210, heading: Math.PI / 2 },

  // Parked-car spots along road edges (used by the vehicle manager to place
  // the 11 stealable cars; each spot sits just off a road centre line).
  parking: [
    { x: 7, z: -35 },
    { x: -63, z: 105 },
    { x: 77, z: -175 },
    { x: -133, z: -35 },
    { x: 147, z: 35 },
    { x: -203, z: 175 },
    { x: 217, z: -105 },
    { x: -35, z: 217 },
    { x: 105, z: -273 },
    { x: -175, z: -133 },
    { x: 35, z: 147 },
    { x: -273, z: -203 },
  ],

  // Twenty Sun Shells, fixed positions: beach, parks, alleys and rooftops.
  // Every shell sits on a road line or the open beach — never at a block
  // centre, where building colliders would make it unreachable.
  shells: [
    { id: 'shell-01', x: -260, z: 300 },
    { id: 'shell-02', x: -180, z: 305 },
    { id: 'shell-03', x: -100, z: 298 },
    { id: 'shell-04', x: -20, z: 308 },
    { id: 'shell-05', x: 60, z: 302 },
    { id: 'shell-06', x: 140, z: 296 },
    { id: 'shell-07', x: 220, z: 306 },
    { id: 'shell-08', x: 272, z: 300 },
    { id: 'shell-09', x: -245, z: -210 },
    { id: 'shell-10', x: -175, z: -70 },
    { id: 'shell-11', x: -105, z: 210 },
    { id: 'shell-12', x: -35, z: 0 },
    { id: 'shell-13', x: 35, z: 70 },
    { id: 'shell-14', x: 105, z: -210 },
    { id: 'shell-15', x: 175, z: 140 },
    { id: 'shell-16', x: 245, z: 210 },
    { id: 'shell-17', x: 245, z: -140 },
    { id: 'shell-18', x: 35, z: -140 },
    { id: 'shell-19', x: -245, z: 70 },
    { id: 'shell-20', x: 105, z: 210 },
  ],

  // Mission giver meeting points (mirrors data/missions.js start positions).
  givers: [
    { id: 'marco', name: 'Marco', x: -105, z: -35 },
    { id: 'lena', name: 'Lena', x: -175, z: 175 },
    { id: 'vesper', name: 'Vesper Kane', x: 175, z: -175 },
  ],
};
