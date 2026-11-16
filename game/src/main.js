// main.js — boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. ?shot=start|play|buy|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and
// sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState } from './state.js';
import { createMap, MAP } from './map.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createSim } from './sim.js';
import { WEAPONS, buildViewModel } from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);
Math.random = random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(0x4a3540), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const state = createState();
const map = createMap(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(map.colliders);
const bots = createBots(scene, map.colliders);
bots.makeSquads();
const shootables = map.shootables.concat(bots.hitMeshes);

const deps = {
  scene, camera, player, bots, effects, audio, hud, state,
  shootables,
  viewModel: null,
  setViewModel(id) {
    if (deps.viewModel) camera.remove(deps.viewModel);
    const vm = buildViewModel(WEAPONS[id]);
    camera.add(vm);
    deps.viewModel = vm;
  },
};
const input = createInput(renderer.domElement, onLockChange);
const sim = createSim({ ...deps, input });
sim.setRandom(random);
deps.setViewModel('pistol');

const body = player.state;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();

hud.setHealth(100, 0);
hud.setAmmo(12, 36, 'P-9 SIDEARM', 0);
hud.setMoney(800);
hud.setScore(0, 0, 1);
hud.setTimer(100);
hud.setAlive(4, 4);
hud.setCharge('DUSTLINE — PELABUHAN TUA', '');
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === 'menu') {
    sim.startMatch();
    hud.hideOverlay();
    input.requestLock();
  } else if (state.phase === 'matchEnd') {
    sim.startMatch();
    hud.hideOverlay();
    input.requestLock();
  } else if (state.phase === 'roundEnd') {
    hud.hideOverlay();
    input.requestLock();
  } else if (!player.state.alive) {
    hud.hideOverlay();
  } else {
    input.requestLock();
  }
});
hud.onBuy((id) => sim.buy(id));

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.showBuy(false);
  } else if (state.phase === 'round' || state.phase === 'buy') {
    if (hud.buyVisible()) hud.showBuy(false);
    else if (player.state.alive) hud.showOverlay('paused', {});
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + body.recoilPitch, body.yaw + body.recoilYaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) sim.step(FIXED_STEP);
}

function nearestVisibleBot() {
  let best = null;
  let bestD = Infinity;
  for (const b of bots.bots) {
    if (!b.alive || b.team !== 'raider') continue;
    const d = Math.hypot(b.pos.x - body.position.x, b.pos.z - body.position.z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function runShot(name) {
  hud.hideOverlay();
  input.state.locked = true;
  if (name === 'start') {
    body.position.set(0, 0, 16);
    body.yaw = Math.PI;
    body.pitch = 0;
    settle(150);
    aimAt(new THREE.Vector3(0, 1.6, -10));
    hud.showOverlay('start', {});
  } else if (name === 'buy') {
    sim.startMatch();
    settle(30);
    body.position.set(0, 0, 14);
    body.yaw = Math.PI;
    settle(10);
    hud.showBuy(true);
    hud.setMoney(3250);
  } else if (name === 'play') {
    sim.startMatch();
    settle(600); // buy time passes, round starts
    settle(240); // bots spread out through the lanes
    const bot = nearestVisibleBot();
    if (bot) {
      // Walk the player to mid so a raider is in the open, then fire.
      body.position.set(2, 0, 6);
      settle(30);
      const target = bots.bots.find((b) => b.alive && b.team === 'raider');
      if (target) {
        aimAt(new THREE.Vector3(target.pos.x, target.pos.y + 1.3, target.pos.z));
        input.state.firing = true;
        settle(6);
        input.state.firing = false;
        settle(4);
        aimAt(new THREE.Vector3(target.pos.x, target.pos.y + 1.3, target.pos.z));
      }
    }
  } else if (name === 'end') {
    sim.startMatch();
    settle(600);
    settle(60);
    sim.endRound('guard', 'Semua Penyusup dihabisi');
    settle(5);
  }
  syncCamera();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (input.state.locked) player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      sim.step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    // Crosshair follows the live spread of the current weapon.
    const w = sim.loadout.owned[sim.loadout.current];
    if (w) {
      const base = w.def.baseSpread + w.def.moveSpread * Math.min(player.groundSpeed() / 5, 1);
      hud.crosshairSpread(base * 900);
    }
    syncCamera();
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
