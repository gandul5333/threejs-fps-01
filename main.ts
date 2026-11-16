// DUSTLINE — a three.js tactical FPS for make.fun's threejs-fps-02 bounty.
// The entrypoint hands the game in: it copies this directory's game/ and
// screenshots/ to /output and writes /output/dossier.json with the vendored
// make.fun library, so the judge can read the game. Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program is deterministic: two runs over the same files write the same
// bytes (copies preserve content; the dossier is built from the files only).

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function checkDir(name) {
  const dir = join(here, name);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) fail(`missing ${name}/ beside main.ts`);
  return dir;
}

function countEntries(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += 1;
    if (entry.isDirectory()) n += countEntries(join(dir, entry.name));
  }
  return n;
}

const gameDir = checkDir('game');
const shotDir = checkDir('screenshots');

// The scorer's caps, checked here first so a bad entry fails loudly at home
// instead of quietly on the server: game/ at most 993 entries and 48 MiB,
// index.html at most 1 MiB, at most 4 screenshots of at most 256 KiB each.
if (countEntries(gameDir) > 993) fail('game/ holds more than 993 files and directories');
const indexStat = statSync(join(gameDir, 'index.html'));
if (!indexStat.isFile() || indexStat.size > 1048576) fail('game/index.html is missing or over 1 MiB');
const shots = readdirSync(shotDir).filter((f) => !f.startsWith('.'));
if (shots.length < 3 || shots.length > 4) fail(`screenshots/ must hold 3 or 4 images, found ${shots.length}`);
for (const shot of shots) {
  const size = statSync(join(shotDir, shot)).size;
  if (size > 262144) fail(`screenshots/${shot} is over 256 KiB`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

// buildDossier reads game/ and screenshots/ back out of /output, so the
// dossier always describes exactly what was handed in.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

console.log(`DUSTLINE handed in to ${out} (${shots.length} screenshots, dossier written)`);
