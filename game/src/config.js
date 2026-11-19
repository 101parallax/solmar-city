// Solmar City — central configuration. Every tunable number in the game lives
// here so systems, entities and the world agree on one set of constants. The
// city is an 8x8 grid of 70 m blocks with 14 m roads, bounded at +/-290 m; the
// ocean starts south of the water line. All money values are in dollars.

export const CONFIG = {
  // Deterministic seed for the whole game world (see random.js).
  seed: 1,

  // City layout: 8x8 blocks, each 70 m, roads 14 m wide on a 70 m pitch.
  city: {
    blocks: 8,
    blockSize: 70,
    roadWidth: 14,
    sidewalkWidth: 4,
    // Road centre lines run from -280 to +280 in both axes.
    roadMin: -280,
    roadMax: 280,
    roadPitch: 70,
    // Playable bounds (half-extent of the ground plane).
    bounds: { minX: -290, maxX: 290, minZ: -290, maxZ: 290 },
    // South of this z the ground gives way to beach, then open water.
    waterLine: 315,
    beachStart: 290,
    // Player spawn point (downtown block centre, on a sidewalk corner).
    spawn: { x: 35, z: -35 },
  },

  // District accent colours (hex) used by buildings, the radar and the map.
  districts: {
    downtown: 0x3d6ea5,
    harborfront: 0x2e8b8b,
    westMarina: 0x7a9e4f,
    northHills: 0x9e7a4f,
    oldTown: 0xa55a3d,
  },

  // Shop prices (see systems/shop.js for the item list).
  shop: {
    respray: 100,
    repair: 250,
    nitro: 3000,
    armour: 1800,
    ammo: 200,
    hospitalFee: 150,
  },

  // Economy rewards outside mission payouts.
  economy: {
    nearMissReward: 250,
    nearMissRep: 5,
    driftReward: 100,
    shellRep: 10,
    racePrize: 600,
    raceRep: 10,
    taxiBaseFare: 40,
    taxiPerMetre: 0.5,
    startMoney: 500,
  },

  // Reputation tiers: name, minimum points, and what the tier unlocks.
  repTiers: [
    { tier: 1, name: 'UNKNOWN', min: 0, unlock: null },
    { tier: 2, name: 'STREET', min: 100, unlock: 'nitro' },
    { tier: 3, name: 'KNOWN', min: 300, unlock: 'shotgun' },
    { tier: 4, name: 'RESPECTED', min: 600, unlock: 'supercar' },
    { tier: 5, name: 'KINGPIN', min: 1000, unlock: 'm7' },
  ],

  // Vehicle physics constants shared by entities/vehicles.js.
  vehicles: {
    // Top speed multiplier while the nitrous boost is active.
    nosMultiplier: 1.35,
    // Aerodynamic drag while boosting (low: the boost must feel fast).
    nosDrag: 0.12,
    // Grip retained while the handbrake is held (0.9 = mild drift).
    handbrakeGrip: 0.9,
    // Speed in km/h above which a close pass counts as a near miss.
    nearMissSpeed: 80,
    // Lateral distance in metres for a near miss.
    nearMissDistance: 2,
    // How far parked cars may spawn from the player.
    spawnRadius: 220,
    // Fallback spawn when no parked car is near the player.
    fallbackSpawn: { x: 0, z: -70 },
  },

  // Combat constants shared by systems/combat.js.
  combat: {
    weapons: {
      pistol: { damage: 25, fireRate: 0.25, spread: 0.01, pellets: 1, range: 120 },
      carbine: { damage: 18, fireRate: 0.09, spread: 0.03, pellets: 1, range: 150 },
      shotgun: { damage: 12, fireRate: 0.7, spread: 0.09, pellets: 6, range: 45 },
    },
    startAmmo: { pistol: 48, carbine: 120, shotgun: 24 },
  },

  // Police pursuit tuning (see entities/police.js).
  police: {
    // Cruisers per wanted level, index 0 unused.
    cruisersPerStar: [0, 1, 2, 3, 4, 5],
    helicopterAtStars: 3,
    // Heat added per crime type (see systems/wanted.js).
    heat: { steal: 12, shootCop: 25, killCop: 45, killPed: 20, speeding: 2, hostile: 0 },
    // Heat lost per second while unseen and crime-free.
    decayPerSecond: 1.5,
    // Heat thresholds that raise the wanted level.
    starThresholds: [0, 15, 35, 60, 85, 110],
  },

  // World ambience: golden hour window and day length.
  world: {
    startTimeOfDay: 16.5,
    goldenHourStart: 16.5,
    goldenHourEnd: 18.0,
    // Game hours per real second (a full day lasts 24 minutes).
    hoursPerSecond: 1 / 60,
    palmCount: 650,
    trafficCars: 12,
    pedestrians: 36,
  },

  // Save + autosave.
  save: {
    key: 'solmar-city-save-v4',
    autosaveInterval: 60,
  },

  // Adaptive quality: FPS sampled over the first seconds of play.
  quality: {
    sampleSeconds: 5,
    lowFpsThreshold: 30,
    mediumFpsThreshold: 45,
    lowPixelRatio: 1,
    lowPalmScale: 0.5,
    mediumPixelRatio: 1.25,
    mediumPalmScale: 0.75,
  },

  // Keyboard bindings (event.code values). See input.js.
  keys: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    up: 'ArrowUp',
    down: 'ArrowDown',
    turnLeft: 'ArrowLeft',
    turnRight: 'ArrowRight',
    boost: 'ShiftLeft',
    boostAlt: 'ShiftRight',
    enterVehicle: 'KeyF',
    interact: 'KeyE',
    handbrake: 'Space',
    weapon1: 'Digit1',
    weapon2: 'Digit2',
    weapon3: 'Digit3',
    radio: 'KeyR',
    map: 'KeyM',
    pause: 'KeyP',
    pauseAlt: 'Escape',
  },
};
