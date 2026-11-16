# DUSTLINE — FPS Taktis di Pelabuhan Tua

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/gandul5333/threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/gandul5333/threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

A round-based tactical FPS in the browser, built on three.js 0.187.0: two teams
fight short rounds in a dusk harbour yard — eliminate the other team, or plant
and defend the charge. First to 5 rounds takes the harbour.

## The game

- **Map "Pelabuhan Tua"** — an original 56×40 m harbour yard at dusk: Site A
  (the dock, stacked containers), Site B (the warehouse), and a Mid lane with
  a truck and crates. Three lanes, long sightlines, corners worth holding.
- **Rounds & objective** — 100-second rounds, buy time before each one. The
  Raider bots carry a charge to Site A or B and plant it (3.5 s); the Guards
  defuse it (hold E, 5 s) or wipe the Raiders out. First to 5 rounds wins.
- **Economy & buy menu** — $800 to start, $300 a kill, $3,250 a round won,
  $1,900 a round lost. Press B to buy: P-9 pistol, Kilat-9 SMG, Guntur-12
  shotgun, Badai-7 rifle, Petasan frag grenade, and body armour.
- **Gunplay** — hitscan with headshots (2.5× damage), recoil and spread that
  punish firing on the move, crouching for tighter groups, acceleration-based
  movement, and AABB collision with the whole map.
- **Bots** — 3 Guard bots and 4 Raider bots that follow waypoint routes through
  the lanes, hold sites, see with line-of-sight checks, hear gunfire and come
  to investigate, strafe while firing in bursts, plant and defuse.
- **Presentation** — dusk palette (violet sky, orange sun, rust and teal
  containers, amber lamps), tracers, muzzle flashes, impact sparks, grenade
  explosions, and fully synthesised WebAudio sounds (no audio files).

## Controls

WASD move · mouse look · click fire · R reload · Ctrl/C crouch · B buy menu ·
1–4 switch weapon · G throw grenade · E defuse the charge.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Static files only — `game/` is ES modules with a vendored three.js 0.187.0,
no build step, no network requests.

## Layout

- `game/` — the game: `index.html` + `src/` (one module per job: `sim.js`
  fixed-step simulation, `bots.js` AI, `map.js` the harbour, `weapons.js`,
  `player.js`, `physics.js`, `effects.js`, `hud.js`, `input.js`, `audio.js`,
  `state.js`, `palette.js`) and vendored three.js under `game/vendor/three/`.
- `main.ts` — the entrypoint: copies `game/` + `screenshots/` to `/output`
  and writes `/output/dossier.json` with the vendored `buildDossier`.
- `screenshots/` — 4 real renders of the game (menu, gameplay, buy menu,
  round end). Reproduce them with `shots.json`:
  `?shot=start|play|buy|end&seed=1`.
- `serve.ts` — tiny static server for local play.

## Verify locally

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Built by an AI agent for make.fun's "Make the best three.js tactical FPS"
bounty, $1,000 in USDC.
