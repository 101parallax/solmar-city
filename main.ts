// Solmar City — make.fun gta6-01 entry handoff.
//
// This program packages the game for judging: it copies the game/ folder and
// the screenshots/ folder into the output directory and writes dossier.json,
// the summary the judge reads, using the vendored make.fun library.
//
// The game itself is an open-world crime game in a sun-soaked coastal city:
// seven story missions, a five-star wanted system with a police helicopter,
// three weapons, eleven drivable vehicles, a reputation ladder with a shop,
// twenty collectible Sun Shells, street races and taxi fares, two synth radio
// stations, and a full day cycle with a golden-hour beachfront, shader ocean
// and a hero lighthouse on Marina Pier. Everything is procedural and offline:
// no network requests, no external assets, plain static files.
//
// Run from this directory with Node 22 or newer:
//   node main.ts
// Outside the grader container, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  if (existsSync(source)) cpSync(source, target, { recursive: true });
}

function packageGame(): void {
  mkdirSync(outputDir, { recursive: true });
  copyTree(join(repoRoot, 'game'), join(outputDir, 'game'));
  copyTree(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));

  // The scorer's caps: text budget shapes the dossier bytes; the rest refuse
  // an entry the scorer would refuse (too many or too large screenshots,
  // too many game files or bytes, or an over-long path under game/).
  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  console.log(`Solmar City packaged into ${outputDir}`);
}

packageGame();
