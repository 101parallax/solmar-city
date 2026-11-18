# solmar-city

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/101parallax/solmar-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/101parallax/solmar-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLMAR CITY — an open-world crime game for make.fun gta6-01. A sun-soaked coastal
city to explore on foot and by car: traffic, pedestrians, car theft, wanted levels,
police chases, missions and a story, combat, a HUD with a minimap, and a save.

Everything is original: the city, characters, vehicles, names, story, art, sound
and music are our own. No Rockstar Games names, characters, maps or assets.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. Keyboard + mouse, no network requests.

## Controls

- WASD / arrows — move on foot, drive when in a car
- E — enter / steal a car
- Space — brake / handbrake
- Mouse — aim, click — shoot
- M — missions, Esc — pause

## Entry

Built for the make.fun gta6-01 bounty ("Make GTA 6"). The entry program is
`main.ts` (Node 22, stdlib only): it copies `game/` + `screenshots/` to
`/output` and writes `/output/dossier.json`.
