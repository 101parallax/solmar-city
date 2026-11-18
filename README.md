# Solmar City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/101parallax/solmar-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/101parallax/solmar-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-city driving game: steal cars, outrun the law, and climb
from unknown wheelman to kingpin of a sun-soaked coastal city.

## The game

You are Rico Vane, a wheelman new to Solmar City. Marco the fixer has jobs
for you, Lena the wheelwoman runs the races, and the Solmar City police
have five stars worth of patience. Seven story missions take you from
your first stolen car to the last job — with a money economy, a reputation
ladder, shops, collectibles and side work along the way.

## Systems

- **7 story missions** — M1 First Wheels, M2 Harbor Run, M3 The Shipment,
  M4 Dockside Run, M5 Turf War, M6 The Escape, M7 The Last Job — with
  named givers, dialogue subtitles and pass/fail cards.
- **Economy + shops** — earn mission payouts, spend them on Respray
  (clears wanted), Repair, Nitro, Armor and Ammo.
- **REP tiers** — UNKNOWN, STREET, KNOWN, RESPECTED, KINGPIN, each with
  unlocks (Nitro in shops, shotgun, supercar spawn, M7 access).
- **20 Sun Shells** to collect, plus completion % and statistics.
- **5-star wanted system** — named police response units (seabird and
  coastal-fish callsigns), cruisers, roadblocks, officers on foot and a
  police helicopter with a searchlight from 3 stars up.
- **Combat** — pistol, carbine and shotgun with mouse aim, tracers and
  floating damage numbers.
- **Driving** — 11 original vehicles, NOS boost, DRIFT and NEAR MISS
  bonuses, AI traffic and 36 pedestrians.
- **Radio** — two synthesized stations (SOLMAR FM 88.5 Sunset Drive,
  COAST 92.1 Night Tide) generated live with WebAudio, plus beach
  ambience: waves and gulls. No audio files are shipped.
- **Save/load** — autosave after every mission and every 60 seconds,
  stored locally in the browser.
- **Maps** — rotating minimap (or north-up) and a full map with legend,
  mission list with payouts and status, statistics and completion.
- **Side jobs** — street races and taxi fares.
- **A living city** — 5 districts, beach, ocean, palms, pier and
  lighthouse, golden-hour sky.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Drive or walk |
| Shift | NOS boost (car) / sprint (on foot) |
| F | Enter, exit or steal a car |
| E | Interact (missions, shops, taxi, races) |
| Space | Handbrake |
| Click | Shoot (aim with the mouse) |
| 1 / 2 / 3 | Pistol / carbine / shotgun |
| R | Change radio station |
| M | Full map |
| P / Esc | Pause |

## How to play

Serve the `game/` directory with any static file server (ES modules and
the import map need real file serving — opening the HTML file directly
from disk is blocked by browser module CORS rules) and open
`index.html`, then press New Game. Follow the yellow diamond to your
next job. Lose the cops to clear your wanted level — or pay for a
Respray. Collect all 20 Sun Shells to reach 100% completion.

## Screenshots

Staged shots are driven by URL parameters (see `shots.json`):

- `?shot=chase&seed=1` — golden-hour police chase with helicopter (cover)
- `?shot=street&seed=1` — street life on foot in Downtown
- `?shot=race&seed=1` — the Harbor Run race mission
- `?shot=combat&seed=1` — combat in The Shipment

Every screenshot is a frame of the game being played.

## Tech notes

- Three.js for the 3D city; all textures are procedural canvas art.
- All sound is synthesized live with the WebAudio API — no audio files.
- A seeded RNG drives placement and radio so runs are deterministic.
- Menus use native `<dialog>` elements and toasts use `popover="manual"`
  with a class-based fallback for older browsers.

## Originality

Solmar City is an original work: every character, vehicle, radio station,
song and street name was invented for this game. No assets, names or
trademarks from any existing game or franchise are used.

## License

MIT.
