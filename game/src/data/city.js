// Solmar City layout: pure data, no rendering. The grid is 8x8 blocks of 70 m pitch
// with 9 streets per direction; the origin is the centre of the city, X east, Z south.
// Districts are a fixed 8x8 map (rows run north to south, columns west to east) and
// landmarks occupy whole blocks. Rendering lives in world/city.js, pathfinding in
// world/roadgraph.js — both read from here so the map can never drift apart.

import { CITY } from '../config.js';

/** Street centre lines, in metres: 9 per direction, 70 m apart. */
export const STREET_COORDS = [-280, -210, -140, -70, 0, 70, 140, 210, 280];

/** World X of a block column's centre. */
export function blockX(col) {
  return STREET_COORDS[col] + CITY.pitch / 2;
}

/** World Z of a block row's centre. */
export function blockZ(row) {
  return STREET_COORDS[row] + CITY.pitch / 2;
}

/** The district ids, in map order. */
export const DISTRICT_IDS = ['downtown', 'mercado', 'palmbeach', 'vistahills', 'harbor'];

/**
 * District map, 8 rows (north -> south) x 8 columns (west -> east).
 * V = Vista Hills, D = Downtown, M = Mercado, P = Palm Beach, H = Harbor.
 */
export const DISTRICT_GRID = [
  'VVVVVVPP',
  'VVVVVVPP',
  'VVVDDVPP',
  'MMMDDDPP',
  'MMMDDDPP',
  'MMMDDHHH',
  'MMHHHHHH',
  'HHHHHHHH',
];

const DISTRICT_LETTER = {
  D: 'downtown',
  M: 'mercado',
  P: 'palmbeach',
  V: 'vistahills',
  H: 'harbor',
};

/** District id of the block at (col, row). */
export function districtAt(col, row) {
  const letter = DISTRICT_GRID[row][col];
  return DISTRICT_LETTER[letter];
}

/** Human-readable district info — name, flavour and building style. */
export const DISTRICTS = {
  downtown: {
    id: 'downtown',
    name: 'Downtown',
    tagline: 'Glass towers over the bay',
    style: 'tower',
    minHeight: 30,
    maxHeight: 110,
    buildingsPerBlock: 1,
    lotInset: 6,
  },
  mercado: {
    id: 'mercado',
    name: 'Mercado',
    tagline: 'Colourful shop-houses and market stalls',
    style: 'shophouse',
    minHeight: 8,
    maxHeight: 14,
    buildingsPerBlock: 4,
    lotInset: 2,
  },
  palmbeach: {
    id: 'palmbeach',
    name: 'Palm Beach',
    tagline: 'Pastel stucco, palms and the sea',
    style: 'stucco',
    minHeight: 8,
    maxHeight: 18,
    buildingsPerBlock: 3,
    lotInset: 4,
  },
  vistahills: {
    id: 'vistahills',
    name: 'Vista Hills',
    tagline: 'Pitched roofs and front lawns',
    style: 'house',
    minHeight: 6,
    maxHeight: 10,
    buildingsPerBlock: 4,
    lotInset: 5,
  },
  harbor: {
    id: 'harbor',
    name: 'Harbor',
    tagline: 'Warehouses, containers and the docks',
    style: 'warehouse',
    minHeight: 8,
    maxHeight: 13,
    buildingsPerBlock: 2,
    lotInset: 3,
  },
};

/**
 * Landmarks: one per block, replacing the district's normal buildings.
 * col/row are block coordinates; x/z are derived world positions.
 */
export const LANDMARKS = [
  {
    id: 'hospital',
    name: 'St. Marina General',
    short: 'Hospital',
    type: 'hospital',
    col: 5,
    row: 1,
    blip: 'H',
    color: '#ff5d5d',
    description: 'Respawn point when wasted. The white tower with the red cross.',
  },
  {
    id: 'police',
    name: 'Solmar PD HQ',
    short: 'Police HQ',
    type: 'police',
    col: 3,
    row: 5,
    blip: 'P',
    color: '#3b82f6',
    description: 'Headquarters of the Solmar Police Department.',
  },
  {
    id: 'respray',
    name: 'Chroma Auto',
    short: 'Respray',
    type: 'respray',
    col: 1,
    row: 6,
    blip: 'R',
    color: '#f59e0b',
    description: 'Respray and repair. Clears your wanted level for $250.',
  },
  {
    id: 'gas',
    name: 'SolFuel',
    short: 'Gas Station',
    type: 'gas',
    col: 6,
    row: 3,
    blip: 'G',
    color: '#22c55e',
    description: 'Fuel stop on the Palm Beach strip.',
  },
  {
    id: 'park',
    name: 'Plaza del Sol',
    short: 'Park',
    type: 'park',
    col: 2,
    row: 2,
    blip: 'T',
    color: '#4ade80',
    description: 'Fountain plaza in the old quarter. Pigeons, palms and benches.',
  },
];

/** Landmark occupying the block at (col, row), or null. */
export function landmarkAt(col, row) {
  return LANDMARKS.find((l) => l.col === col && l.row === row) || null;
}

/** World position of a landmark's block centre. */
export function landmarkPos(landmark) {
  return { x: blockX(landmark.col), z: blockZ(landmark.row) };
}

/**
 * Nearest landmark to a world position, optionally filtered by type
 * ('hospital' | 'police' | 'respray' | 'gas' | 'park'). Returns the landmark
 * record with world x/z and the distance, or null when filtered out.
 */
export function nearestLandmark(x, z, type = null) {
  let best = null;
  let bestDist = Infinity;
  for (const landmark of LANDMARKS) {
    if (type && landmark.type !== type) continue;
    const p = landmarkPos(landmark);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = { ...landmark, x: p.x, z: p.z, distance: d };
    }
  }
  return best;
}

/** Named streets: avenues run north-south (X), streets run east-west (Z). */
export const AVENUES = [
  'Harbor Ave',
  'Mercado Ave',
  'Calle Luna',
  'Solmar Blvd',
  'Marina Ave',
  'Palm Row',
  'Vista Ave',
  'Ocean Ave',
  'Boardwalk',
];

export const STREETS = [
  'Northgate St',
  'Hillcrest St',
  'Plaza St',
  'Central St',
  'Sunset St',
  'Foundry St',
  'Dockside St',
  'Pier St',
  'Southgate St',
];

/** Nearest named street to a world position, for the HUD location readout. */
export function streetNameAt(x, z) {
  let bestAvenue = 0;
  let bestStreet = 0;
  let bestAvenueDist = Infinity;
  let bestStreetDist = Infinity;
  for (let i = 0; i < STREET_COORDS.length; i++) {
    const dx = Math.abs(x - STREET_COORDS[i]);
    const dz = Math.abs(z - STREET_COORDS[i]);
    if (dx < bestAvenueDist) {
      bestAvenueDist = dx;
      bestAvenue = i;
    }
    if (dz < bestStreetDist) {
      bestStreetDist = dz;
      bestStreet = i;
    }
  }
  return bestAvenueDist < bestStreetDist ? AVENUES[bestAvenue] : STREETS[bestStreet];
}

/** District id at a world position (clamped to the city edge). */
export function districtAtPos(x, z) {
  const col = Math.max(0, Math.min(7, Math.floor((x + 280) / CITY.pitch)));
  const row = Math.max(0, Math.min(7, Math.floor((z + 280) / CITY.pitch)));
  return districtAt(col, row);
}

/** World-space bounds of each district, for the radar and the pause map. */
export function districtBounds() {
  const out = {};
  for (const id of DISTRICT_IDS) {
    out[id] = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  }
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const b = out[districtAt(col, row)];
      const x0 = STREET_COORDS[col];
      const z0 = STREET_COORDS[row];
      b.minX = Math.min(b.minX, x0);
      b.maxX = Math.max(b.maxX, x0 + CITY.pitch);
      b.minZ = Math.min(b.minZ, z0);
      b.maxZ = Math.max(b.maxZ, z0 + CITY.pitch);
    }
  }
  return out;
}
