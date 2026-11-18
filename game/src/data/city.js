// Static city dataset — districts, road grid, landmarks, shops, taxi stands,
// race start and the 20 Sun Shell collectibles. Coordinates are in metres on
// the XZ ground plane; the road grid runs every 70 m from -280 to 280, and
// the ocean starts at z = 292 on the south edge.
export const CITY_DATA = {
  // Whole-city bounds (metres) and the south water line, for the radar,
  // the full map and screenshot staging.
  bounds: { minX: -280, maxX: 280, minZ: -280, maxZ: 280 },
  waterLine: 292,

  districts: [
    {
      id: 'downtown',
      name: 'Downtown',
      bounds: { minX: -140, maxX: 140, minZ: -280, maxZ: -70 },
      color: 0x7fb2d9,
      style: 'towers',
      description: 'Glass towers, corporate plazas and the densest traffic in Solmar.',
    },
    {
      id: 'oldtown',
      name: 'Old Town',
      bounds: { minX: 140, maxX: 280, minZ: -280, maxZ: -70 },
      color: 0xc9a06a,
      style: 'brick',
      description: 'Brick walk-ups, corner bodegas and narrow streets from the old port days.',
    },
    {
      id: 'harbor',
      name: 'Harbor',
      bounds: { minX: -280, maxX: -140, minZ: -70, maxZ: 210 },
      color: 0x7d9b8a,
      style: 'warehouse',
      description: 'Container yards, warehouses and the working docks on the west edge.',
    },
    {
      id: 'southside',
      name: 'Southside',
      bounds: { minX: -140, maxX: 140, minZ: -70, maxZ: 210 },
      color: 0xd98a7f,
      style: 'midrise',
      description: 'Sun-faded apartments, murals and the street life that runs the city.',
    },
    {
      id: 'marina',
      name: 'Marina',
      bounds: { minX: 140, maxX: 280, minZ: -70, maxZ: 210 },
      color: 0x7fd4c1,
      style: 'hotel',
      description: 'Beachfront hotels, palm boulevards and the pier with the lighthouse.',
    },
  ],

  // Grid roads: vertical lines run north-south at these x values, horizontal
  // lines east-west at these z values. Road width is 12 m (see CONFIG).
  roads: {
    vertical: [-280, -210, -140, -70, 0, 70, 140, 210, 280],
    horizontal: [-280, -210, -140, -70, 0, 70, 140, 210, 280],
  },

  landmarks: [
    { id: 'lighthouse', name: 'Solmar Lighthouse', x: 200, z: 322, type: 'lighthouse' },
    { id: 'pier', name: 'Marina Pier', x: 200, z: 300, type: 'pier' },
    { id: 'cityhall', name: 'City Hall', x: -35, z: -245, type: 'civic' },
    { id: 'stadium', name: 'Solmar Arena', x: 245, z: -245, type: 'arena' },
    { id: 'plaza', name: 'Founders Plaza', x: 35, z: -105, type: 'plaza' },
    { id: 'containeryard', name: 'Harbor Container Yard', x: -245, z: 35, type: 'yard' },
  ],

  // Shops and services the player can walk up to and use with E.
  shops: [
    { id: 'chroma-auto', name: 'Chroma Auto', type: 'garage', x: 105, z: -35 },
    { id: 'ironworks', name: 'Ironworks Arms', type: 'gunshop', x: -35, z: 105 },
    { id: 'hospital', name: 'Solmar General', type: 'hospital', x: -105, z: -175 },
    { id: 'pd-hq', name: 'Solmar PD HQ', type: 'police', x: 35, z: -175 },
  ],

  taxiStands: [
    { id: 'taxi-downtown', x: -210, z: -210 },
    { id: 'taxi-oldtown', x: 210, z: -210 },
    { id: 'taxi-harbor', x: -210, z: 140 },
    { id: 'taxi-marina', x: 210, z: 140 },
  ],

  raceStart: { x: -210, z: 70, heading: 0 },

  // Where the player starts a new game: Founders Plaza, Downtown edge.
  playerSpawn: { x: 35, z: -35 },

  // 20 Sun Shells at fixed spots: six on the beach, the rest tucked around
  // plazas, parks, docks and rooftops-side sidewalks across all districts.
  shells: [
    { id: 'shell-01', x: -245, z: 262 },
    { id: 'shell-02', x: -175, z: 252 },
    { id: 'shell-03', x: -105, z: 268 },
    { id: 'shell-04', x: -35, z: 254 },
    { id: 'shell-05', x: 105, z: 262 },
    { id: 'shell-06', x: 245, z: 256 },
    { id: 'shell-07', x: 35, z: -105 },
    { id: 'shell-08', x: -35, z: -245 },
    { id: 'shell-09', x: 245, z: -245 },
    { id: 'shell-10', x: -245, z: 35 },
    { id: 'shell-11', x: -210, z: -70 },
    { id: 'shell-12', x: 210, z: -70 },
    { id: 'shell-13', x: -70, z: 175 },
    { id: 'shell-14', x: 70, z: 175 },
    { id: 'shell-15', x: -175, z: -175 },
    { id: 'shell-16', x: 175, z: -175 },
    { id: 'shell-17', x: -105, z: 35 },
    { id: 'shell-18', x: 105, z: 35 },
    { id: 'shell-19', x: 200, z: 288 },
    { id: 'shell-20', x: -245, z: -245 },
  ],
};

// District lookup helper used by the world builder and the radar.
export function districtAt(x, z) {
  return CITY_DATA.districts.find(
    (d) => x >= d.bounds.minX && x < d.bounds.maxX && z >= d.bounds.minZ && z < d.bounds.maxZ,
  ) || null;
}
