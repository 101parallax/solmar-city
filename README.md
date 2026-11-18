# solmar-city

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/101parallax/solmar-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/101parallax/solmar-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLMAR CITY — an open-world crime game for make.fun gta6-01 ("Make GTA 6").
Rico Vane, a cab driver in debt to the wrong people, works his way through a
sun-soaked coastal city: steal cars, outrun the Solmar PD, and run three story
missions to pay it all off — or take the city for yourself.

## What is in the game

- **A city to explore** — 8×8 blocks, five districts (Downtown glass towers,
  Mercado shop-houses, Palm Beach, Vista Hills, Harbor), a beach and the sea,
  a hospital, police HQ, a Respray garage, a gas station and a fountain plaza.
- **On foot and by car** — walk, sprint, drive 11 vehicle types with arcade
  handling, handbrake drifts, visual damage and spinning/steering wheels.
- **Traffic + pedestrians** — AI cars follow the road graph; pedestrians walk
  the sidewalks, flee gunshots and fast cars, and fall (then get up and run)
  when hit.
- **Car theft** — press F near a car: the driver is dragged out and runs.
- **Wanted 0–5 stars** — crimes witnessed by cops or bystanders raise the
  heat; cruisers chase and ram, officers arrest on foot at 1–2 stars and shoot
  at 3+. Hide long enough and the stars blink out, or pay $250 at Chroma Auto.
- **Three story missions** — The Pickup (steal a Vortex GT), Harbor Run (nine
  checkpoints, 95 seconds), The Collection (collect a debt, then catch the
  runner). Title cards, objective subtitles, MISSION PASSED / FAILED.
- **Combat** — fists, a P9 pistol and a VK-7 carbine with soft lock-on,
  tracers, health and armour.
- **HUD + minimap** — wanted stars, cash with green/red deltas, health/armour
  bars, weapon + ammo, vehicle and district/street readout, a rotating radar
  with a yellow GPS route to the objective and a purple route to your waypoint.
- **Menus + save** — start screen (New / Continue / How to Play), pause menu
  with a full clickable map, mission brief, stats and settings; progress saves
  to localStorage. WASTED respawns at the hospital, BUSTED at the PD HQ.
- **Sound, 100% synthesised** — WebAudio gunshots, engine RPM, sirens,
  explosions and UI jingles. No audio files.
- **Day/night** — a full cycle; new games start at golden hour (16:30).

Everything is original: the city, characters, vehicles, names, story, art and
sound are our own. No Rockstar Games names, characters, maps or assets.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. Keyboard + mouse, no network requests.

## Controls

- WASD / arrows — walk · drive when in a car
- Shift — sprint on foot
- Space — handbrake / drift
- F — enter / steal the nearest car
- Mouse — aim · click — shoot / punch · drag — orbit camera
- 1 / 2 / 3 — fists · pistol · carbine · R — reload
- E — talk / interact · M — mission brief · Tab — full map · Esc / P — pause

## Screenshots

Deterministic scenes, staged by `game/src/shots.js` from the real rules:

- `?shot=chase&seed=1` — golden-hour police pursuit (cover)
- `?shot=street&seed=1` — walking through Downtown
- `?shot=race&seed=1` — the Harbor Run race mission
- `?shot=map&seed=1` — the pause menu's full map

`?demo=1` plays an attract mode with the autopilot driving.

## Entry

Built for the make.fun gta6-01 bounty. The entry program is `main.ts`
(Node 22, stdlib only): it copies `game/` + `screenshots/` to `/output` and
writes `/output/dossier.json`.
