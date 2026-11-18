// Every tuning number for Solmar City in one place. All distances are metres, all
// speeds are metres per second, all times are seconds. The city is centred on the
// origin: X east, Z south, Y up.

/** Fixed simulation step: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The seed every system shares unless a shot or save overrides it. */
export const CITY_SEED = 1;

export const CITY = {
  /** Blocks per side of the grid. */
  blocks: 8,
  /** Centre-to-centre distance between parallel streets. */
  pitch: 70,
  /** Width of a street, kerb to kerb (two 3.5 m lanes + parking strips). */
  roadWidth: 12,
  /** Sidewalk height above the road surface. */
  sidewalkHeight: 0.3,
  /** How far the sea plane and the beach extend past the last street. */
  seaMargin: 320,
  /** City half-extent (last street centre + half a road). */
  halfExtent: 286,
};

export const DAY = {
  /** Golden hour: the default clock for screenshots and new games. */
  startHour: 16.5,
  /** In-game minutes that pass per real second (a full day in 24 real minutes). */
  minutesPerSecond: 1,
  sunrise: 6.2,
  sunset: 18.8,
};

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 7.5,
  /** Radius used for building / vehicle collision. */
  radius: 0.45,
  maxHealth: 100,
  maxArmour: 100,
  /** How close the player must be to a car door to steal it. */
  stealRange: 3.2,
  punchDamage: 12,
  punchRange: 2.2,
  punchCooldown: 0.45,
};

export const CAR = {
  /** Arcade bicycle model, tuned per vehicle class in data/vehicles.js. */
  accel: 14,
  brake: 26,
  reverseAccel: 8,
  maxSpeed: 34,
  maxReverseSpeed: 9,
  drag: 0.35,
  rollingDrag: 0.6,
  /** Steering angle at standstill, radians; shrinks with speed. */
  steerMax: 0.55,
  steerSpeed: 3.2,
  grip: 8.5,
  /** Handbrake cuts grip and adds sideways slide. */
  handbrakeGrip: 2.2,
  /** Visual body roll, radians per unit of lateral acceleration. */
  bodyRoll: 0.012,
  wheelRadius: 0.34,
  /** Collision radius of an average car (length/width come from the vehicle def). */
  hitRadius: 2.4,
};

export const TRAFFIC = {
  /** Active AI cars at once; the pool streams in and out of view. */
  activeCars: 20,
  cruiseSpeed: 11,
  cruiseJitter: 3,
  cornerSpeed: 5,
  /** Cars despawn past this distance from the player, spawn just inside it. */
  despawnDistance: 220,
  spawnDistance: 180,
  followGap: 7,
  /** Parked cars placed along kerbs at city build time. */
  parkedCars: 26,
};

export const PEDS = {
  active: 36,
  walkSpeed: 1.35,
  walkJitter: 0.45,
  fleeSpeed: 5.2,
  /** A gunshot or a fast car closer than this makes a pedestrian flee. */
  scareRadius: 18,
  despawnDistance: 160,
};

export const WANTED = {
  maxStars: 5,
  /** Crime weights, in stars, before the witness multiplier. */
  crime: {
    shoot: 1,
    punchPed: 1,
    runOverPed: 2,
    stealCar: 1,
    killCop: 2,
    shootCop: 1,
  },
  /** Crimes unseen by police or witnesses count for half (rounded down, min 0). */
  unseenFactor: 0.5,
  /** Seconds out of every cop's sight before stars start blinking out. */
  loseSightSeconds: 12,
  blinkSeconds: 6,
  /** Cruisers per star while the player is driving; on foot, officers instead. */
  cruisersPerStar: 1,
  officersOnFoot: 2,
  /** At 1-2 stars cops arrest; at 3+ they shoot on sight. */
  shootFromStars: 3,
  arrestRange: 2.4,
  arrestSeconds: 1.6,
  resprayCost: 250,
  hospitalCost: 150,
  /** Heat decays this many stars per second once blinking. */
  decayRate: 0.25,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 60,
  pistolCooldown: 0.28,
  pistolMag: 12,
  rifleDamage: 52,
  rifleRange: 90,
  rifleCooldown: 0.12,
  rifleMag: 30,
  /** Soft lock-on cone, radians off the aim direction. */
  lockCone: 0.35,
  lockRange: 45,
};

export const MISSIONS = {
  raceCheckpoints: 9,
  raceTimeLimit: 95,
  /** Payouts in dollars, in mission order. */
  payout: [800, 1500, 2500],
  startMoney: 120,
};

export const ECONOMY = {
  taxiFare: 45,
  carSaleFraction: 0.4,
};

export const AUDIO = {
  masterVolume: 0.6,
  engineBaseHz: 55,
  sirenHz: [660, 880],
};

/** Third-person camera tuning (player.js + shots.js read these). */
export const CAMERA = {
  fov: 55,
  /** Chase cam while driving: distance behind, height above, look-ahead. */
  chaseDistance: 9.5,
  chaseHeight: 3.6,
  chaseLookAhead: 8,
  /** On-foot orbit cam. */
  orbitDistance: 6.5,
  orbitHeight: 3.0,
  /** How fast the camera eases toward its target (per second). */
  smoothing: 6,
};

/** Radar / minimap tuning (hud/radar.js reads these). */
export const RADAR = {
  /** World metres shown across the radar's diameter. */
  range: 220,
  size: 200,
  blipPolice: '#3b82f6',
  blipMission: '#f2c94c',
  blipWaypoint: '#a855f7',
  blipRespray: '#f59e0b',
  blipHospital: '#ff5d5d',
};

/** District palettes: wall tints, roof tones and accent colours for props. */
export const PALETTE = {
  asphalt: 0x2e2f33,
  asphaltLine: 0xf2c94c,
  sidewalk: 0xb9b3a6,
  kerb: 0x8f8a7e,
  grass: 0x5d8a4a,
  sand: 0xe3d3a4,
  sea: 0x2e7f9e,
  skyDay: 0x87bfe8,
  skyDusk: 0xf2a65a,
  skyNight: 0x0d1526,
  sunDay: 0xfff2d8,
  sunDusk: 0xffb36b,
  districts: {
    downtown: { wall: [0xd8dee6, 0xb9c6d4, 0x9fb4c8, 0xc7ccd4], roof: 0x4a4f57, accent: 0x38e1ff },
    mercado: { wall: [0xe8a33d, 0xd96c4f, 0x4fae8f, 0xe8d44d, 0xc95f7e], roof: 0x8a5a3b, accent: 0xff5a3c },
    palmbeach: { wall: [0xf2e3c9, 0xe8c9a8, 0xf7d7d7, 0xd9e8d0], roof: 0xb5654a, accent: 0x2ec4b6 },
    vistahills: { wall: [0xf0e6d2, 0xe0d3b8, 0xd8e2e8, 0xead9c2], roof: 0x7a4a3a, accent: 0x7fb069 },
    harbor: { wall: [0x9aa3ab, 0x8a9299, 0x7d8a94, 0xa8a29a], roof: 0x5a636b, accent: 0xe07b39 },
  },
};

/** Where the save lives (this browser only). */
export const SAVE_KEY = 'solmar-city.save.v1';

export const FONT_FAMILY = {
  display: '"Titan One", "Arial Black", sans-serif',
  money: '"Passion One", "Arial Narrow", sans-serif',
  text: '"Barlow", "Segoe UI", sans-serif',
};
