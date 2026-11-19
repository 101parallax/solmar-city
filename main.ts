// Solmar City — entrypoint for the make.fun hand-in.
//
// The game is the static game/ folder beside this file: an open-world crime
// game with seven story missions, a living five-district city with a beach and
// a lighthouse, police pursuit with a helicopter, three weapons, an economy
// with shops and reputation, side jobs, collectibles and a save system — all
// playable offline in a desktop browser from game/index.html.
//
// This program hands the entry in: it copies game/ and screenshots/ into the
// output directory (MAKEFUN_OUTPUT_DIR outside the grader, /output inside it)
// and writes dossier.json with the vendored make.fun library, using the same
// caps the scorer applies so a hand-in this program refuses is one the scorer
// would refuse too. Run it with plain Node, no flags, no install:
//
//   node main.ts
//
// To check the hand-in locally first:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Directory holding this file; game/ and screenshots/ sit beside it.
const here = fileURLToPath(new URL('.', import.meta.url));

// Output directory: the grader's /output, or MAKEFUN_OUTPUT_DIR locally.
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Caps from the competition gate: the text budget shapes the dossier bytes;
// the rest refuse an entry the scorer would refuse (too many or too large
// screenshots, too many game files or bytes, an over-long game path).
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(from: string, to: string): void {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

// Fail fast with a clear message when the game folder is missing, instead of
// letting the dossier builder report a bare missing directory.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html not found beside main.ts: nothing to hand in');
}

mkdirSync(out, { recursive: true });
copyTree(join(here, 'game'), join(out, 'game'));
copyTree(join(here, 'screenshots'), join(out, 'screenshots'));

writeFileSync(join(out, 'dossier.json'), buildDossier(out, caps));
