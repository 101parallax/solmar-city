// Sun Shells for Solmar City: 20 collectibles at fixed, reachable spots —
// the boardwalk, the docks, the park, the rooftops' streets. Pure logic, no
// DOM: main.js owns the 3D markers and the radar blips, and calls pickup()
// every step. Collected ids persist in the save file.
//
// Completion (systems/save.js) counts shells as 25 of the 100 points, so a
// player who finds them all is a quarter of the way to 100% before the last
// mission even starts.

export const SHELL_TOTAL = 20;

/** Fixed shell positions: {x, z} on streets or open ground, all reachable. */
export const SHELL_POSITIONS = [
  { x: 280, z: -210 }, // Boardwalk, north end
  { x: 280, z: -70 }, // Boardwalk, Marina Ave
  { x: 280, z: 70 }, // Boardwalk, Sunset St
  { x: 280, z: 210 }, // Boardwalk, south end
  { x: 210, z: 280 }, // South docks, east
  { x: 0, z: 280 }, // Southgate St
  { x: -210, z: 280 }, // South docks, west
  { x: -280, z: 140 }, // Foundry St, west end
  { x: -280, z: -140 }, // Hillcrest St, west end
  { x: -140, z: -280 }, // Northgate St
  { x: 70, z: -280 }, // Northgate St, east
  { x: 210, z: -210 }, // Vista Hills, north-east corner
  { x: -105, z: -105 }, // Plaza del Sol park
  { x: 0, z: 0 }, // Central St crossing
  { x: 140, z: 140 }, // Downtown south
  { x: -70, z: -70 }, // Mercado / Downtown border
  { x: 70, z: 0 }, // Marina Ave
  { x: -210, z: 0 }, // Mercado Ave
  { x: 140, z: -140 }, // Halcyon tower
  { x: -140, z: 140 }, // Mercado south
];

export class Collectibles {
  constructor(collected = []) {
    this.collected = new Set(collected.filter((id) => Number.isInteger(id) && id >= 0 && id < SHELL_TOTAL));
  }

  /** Shells found so far. */
  get count() {
    return this.collected.size;
  }

  /** Shells in the world. */
  get total() {
    return SHELL_TOTAL;
  }

  /** Positions of the shells still out there, with their ids. */
  remaining() {
    const out = [];
    for (let i = 0; i < SHELL_POSITIONS.length; i += 1) {
      if (!this.collected.has(i)) out.push({ id: i, ...SHELL_POSITIONS[i] });
    }
    return out;
  }

  /**
   * Pick up any shell within `radius` metres of `pos`. Returns the id of the
   * shell collected, or null when nothing is in reach.
   */
  pickup(pos, radius = 3) {
    for (const shell of this.remaining()) {
      const dx = pos.x - shell.x;
      const dz = pos.z - shell.z;
      if (dx * dx + dz * dz <= radius * radius) {
        this.collected.add(shell.id);
        return shell.id;
      }
    }
    return null;
  }

  /** True when every shell is collected. */
  get complete() {
    return this.collected.size >= SHELL_TOTAL;
  }

  /** Plain array of collected ids, for the save file. */
  serialize() {
    return [...this.collected].sort((a, b) => a - b);
  }
}
