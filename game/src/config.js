// Central configuration for Solmar City: every tunable constant lives here so
// systems agree on city size, economy, progression and controls. No other file
// should hard-code a number that belongs in CONFIG.
export const CONFIG = {
  // Seeded determinism: every random choice in the game derives from this seed.
  seed: 1,

  // City grid: 8x8 blocks of 70 m. Roads run on the grid lines from -280 to 280.
  city: {
    blocks: 8,
    blockSize: 70,
    roadWidth: 12,
    sidewalkWidth: 4,
    halfSize: 280,
    gridMin: -280,
    gridMax: 280,
    // South edge: sand strip then open ocean.
    beachZ: 210,
    sandEndZ: 292,
    waterZ: 292,
    oceanDepth: 420,
    oceanWidth: 1500,
  },

  // District accent colors (hex). Used for building tints and radar blips.
  districtColors: {
    downtown: 0x7fb2d9,
    oldtown: 0xc9a06a,
    harbor: 0x7d9b8a,
    southside: 0xd98a7f,
    marina: 0x7fd4c1,
  },

  // Player movement (metres per second) and camera.
  player: {
    walkSpeed: 6,
    sprintSpeed: 10,
    turnSpeed: 9,
    interactRange: 4,
    enterVehicleRange: 4.5,
    spawn: { x: 35, z: -35 },
    cameraHeight: 7,
    cameraDistance: 11,
    cameraLerp: 4,
  },

  // Vehicle arcade physics.
  vehicle: {
    nosMultiplier: 1.35,
    nosDrain: 34,
    nosRegen: 12,
    handbrakeGrip: 0.35,
    wreckHealth: 0,
    nearMissSpeedKmh: 80,
    nearMissDistance: 2,
    nearMissReward: 250,
    driftReward: 150,
  },

  // Wanted system: heat thresholds per star and decay.
  wanted: {
    thresholds: [0, 20, 45, 70, 90, 115],
    decayPerSecond: 1.6,
    crimeHeat: { steal: 18, shootCop: 25, killCop: 55, killPed: 30, speeding: 4 },
    maxStars: 5,
    bustRange: 6,
    bustTime: 3,
  },

  // Economy: shop prices and mission payouts live in data/missions.js; these
  // are the fixed service prices and side-job rewards.
  economy: {
    startMoney: 500,
    respray: 100,
    repair: 250,
    nitro: 3000,
    armor: 1800,
    ammo: 200,
    hospitalFee: 150,
    racePrize: 600,
    raceRep: 10,
    taxiPerMetre: 0.9,
    shellRep: 5,
  },

  // Reputation tiers: name, points threshold, unlock granted on reaching it.
  repTiers: [
    { tier: 1, name: 'UNKNOWN', points: 0, unlock: null },
    { tier: 2, name: 'STREET', points: 100, unlock: 'nitro' },
    { tier: 3, name: 'KNOWN', points: 300, unlock: 'shotgun' },
    { tier: 4, name: 'RESPECTED', points: 600, unlock: 'supercar' },
    { tier: 5, name: 'KINGPIN', points: 1000, unlock: 'm7' },
  ],

  // Weapons: damage, fire interval (s), spread (radians), pellets, start ammo.
  weapons: {
    pistol: { damage: 25, interval: 0.28, spread: 0.02, pellets: 1, ammo: 48 },
    carbine: { damage: 18, interval: 0.11, spread: 0.05, pellets: 1, ammo: 120 },
    shotgun: { damage: 12, interval: 0.7, spread: 0.16, pellets: 6, ammo: 24 },
  },

  // Ambient population and spawn distances.
  population: {
    pedestrians: 36,
    trafficCars: 12,
    spawnRadius: 120,
    despawnRadius: 180,
    pedWalkSpeed: 1.6,
    trafficSpeed: 11,
  },

  // World dressing counts (high quality; adaptive quality trims these).
  dressing: {
    palms: 650,
    streetlights: 96,
    clouds: 10,
    godRays: 4,
  },

  // Rendering quality presets.
  quality: {
    high: { pixelRatio: 2, shadows: true, palmScale: 1, fogDensity: 0.0016 },
    low: { pixelRatio: 1, shadows: false, palmScale: 0.45, fogDensity: 0.0028 },
    fpsSampleSeconds: 5,
    fpsThreshold: 30,
  },

  // Day cycle: game hours advanced per real second, and golden hour window.
  time: {
    startHour: 16.5,
    hoursPerSecond: 0.004,
    goldenStart: 16.5,
    goldenEnd: 18,
  },

  // Keyboard bindings (KeyboardEvent.code values).
  keys: {
    forward: ['KeyW', 'ArrowUp'],
    back: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    handbrake: ['Space'],
    enterVehicle: ['KeyF'],
    interact: ['KeyE'],
    shoot: ['MouseLeft'],
    weapon1: ['Digit1'],
    weapon2: ['Digit2'],
    weapon3: ['Digit3'],
    radio: ['KeyR'],
    map: ['KeyM'],
    pause: ['KeyP', 'Escape'],
  },

  // Save slot key (shared with systems/save.js).
  saveKey: 'solmar-city-save-v3',
  autosaveSeconds: 60,
};
