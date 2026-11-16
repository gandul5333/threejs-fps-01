// bots.js — the other seven fighters. Each bot runs a small state machine:
// route (follow the waypoint graph to an objective), hold (watch a lane),
// engage (a visible enemy: react, then fire in bursts), plant / defuse.
// They see with a raycast line-of-sight check (staggered, 6 Hz each) and
// hear gunfire, which pulls them to investigate. No allocations in step:
// one reused temp vector per bot, pooled at creation.
import * as THREE from 'three';
import { WEAPONS, createWeaponState, weaponStep, tryFire, startReload } from './weapons.js';
import { collideCircle, findRoute, nearestWaypoint } from './physics.js';
import { MAP } from './map.js';

const GUARD_NAMES = ['Bara', 'Sena', 'Tari'];
const RAIDER_NAMES = ['Raka', 'Dimas', 'Yuda', 'Eko'];
const GUARD_COLOR = 0x3f6d8e;
const RAIDER_COLOR = 0x9a4a26;
const SKIN = 0xc9a06a;

function buildBotMesh(team) {
  const group = new THREE.Group();
  const bodyColor = team === 'guard' ? GUARD_COLOR : RAIDER_COLOR;
  const torsoMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), torsoMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skinMat);
  head.position.y = 1.58;
  head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat);
  helmet.position.y = 1.62;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.22), darkMat);
  legL.position.set(-0.15, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), darkMat);
  gun.position.set(0.2, 1.25, -0.3);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.34), new THREE.MeshStandardMaterial({ color: team === 'guard' ? 0x4fc3f7 : 0xff8c2e, roughness: 0.5 }));
  stripe.position.y = 1.32;
  group.add(torso, head, helmet, legL, legR, gun, stripe);
  group.userData = { head, torso };
  return group;
}

export function createBots(scene, colliders) {
  const bots = [];
  const hitMeshes = [];
  let seq = 0;

  function spawn(team, index, weaponId) {
    const name = team === 'guard' ? GUARD_NAMES[index] : RAIDER_NAMES[index];
    const mesh = buildBotMesh(team);
    scene.add(mesh);
    const bot = {
      id: `bot-${seq}`,
      seq: seq,
      name,
      team,
      mesh,
      pos: new THREE.Vector3(0, 0, team === 'guard' ? 16 : -16),
      yaw: team === 'guard' ? Math.PI : 0,
      health: 100,
      armor: 0,
      alive: true,
      weapon: createWeaponState(WEAPONS[weaponId]),
      mode: 'route',
      route: [],
      routeIndex: 0,
      holdUntil: 0,
      targetSite: null,
      enemy: null, // { kind: 'player'|'bot', ref, pos: Vector3, eye: number }
      lastSeen: new THREE.Vector3(),
      lastSeenAt: -99,
      reaction: 0,
      burstLeft: 0,
      burstTimer: 0,
      thinkTimer: Math.random() * 0.15,
      investigate: null, // {x, z} heard position
      hasCharge: false,
      actionProgress: 0, // plant/defuse progress seconds
      speed: 3.4,
      strafe: 1,
      strafeTimer: 0,
      tmp: new THREE.Vector3(),
      deadTimer: 0,
    };
    seq += 1;
    mesh.userData.head.userData = { bot, part: 'head' };
    mesh.userData.torso.userData = { bot, part: 'body' };
    hitMeshes.push(mesh.userData.head, mesh.userData.torso);
    bots.push(bot);
    return bot;
  }

  function makeSquads() {
    spawn('guard', 0, 'rifle');
    spawn('guard', 1, 'smg');
    spawn('guard', 2, 'rifle');
    spawn('raider', 0, 'rifle');
    spawn('raider', 1, 'smg');
    spawn('raider', 2, 'rifle');
    spawn('raider', 3, 'shotgun');
    bots[3].hasCharge = true; // Raka carries the charge
  }

  function resetPositions(state) {
    const guardSpots = [[-2, 16], [0, 16], [2, 16]];
    const raiderSpots = [[-3, -16], [-1, -16], [1, -16], [3, -16]];
    for (const bot of bots) {
      const spots = bot.team === 'guard' ? guardSpots : raiderSpots;
      const idx = bot.team === 'guard' ? GUARD_NAMES.indexOf(bot.name) : RAIDER_NAMES.indexOf(bot.name);
      const s = spots[idx] || spots[0];
      bot.pos.set(s[0], 0, s[1]);
      bot.yaw = bot.team === 'guard' ? Math.PI : 0;
      bot.health = 100;
      bot.armor = bot.team === 'guard' ? 0 : 0;
      bot.alive = true;
      bot.mode = 'route';
      bot.route = [];
      bot.routeIndex = 0;
      bot.holdUntil = 0;
      bot.enemy = null;
      bot.lastSeenAt = -99;
      bot.investigate = null;
      bot.hasCharge = bot.team === 'raider' && bot.name === 'Raka' && state.charge === 'idle';
      bot.actionProgress = 0;
      bot.deadTimer = 0;
      bot.weapon = createWeaponState(bot.weapon.def);
      bot.mesh.visible = true;
      bot.mesh.rotation.set(0, bot.yaw, 0);
      bot.mesh.position.copy(bot.pos);
    }
  }

  function pickObjective(bot, state) {
    const r = Math.random();
    if (bot.team === 'raider') {
      bot.targetSite = r < 0.5 ? 'A' : 'B';
      const dest = bot.targetSite === 'A' ? 'aSite' : 'bSite';
      const lane = r < 0.33 ? (bot.targetSite === 'A' ? 'aLong' : 'bLong') : r < 0.66 ? 'mid' : dest;
      const from = nearestWaypoint(MAP.waypoints, bot.pos.x, bot.pos.z);
      bot.route = findRoute(MAP.waypoints, from, lane);
      if (lane !== dest) bot.route = bot.route.concat(findRoute(MAP.waypoints, lane, dest));
      bot.routeIndex = 0;
      bot.mode = 'route';
    } else {
      // Guards hold: a site, the other site, or mid.
      const dest = r < 0.4 ? 'aSite' : r < 0.8 ? 'bSite' : 'mid';
      const from = nearestWaypoint(MAP.waypoints, bot.pos.x, bot.pos.z);
      bot.route = findRoute(MAP.waypoints, from, dest);
      bot.routeIndex = 0;
      bot.mode = 'route';
    }
  }

  function nearestWaypointPos(id) {
    const w = MAP.waypoints.find((wp) => wp.id === id);
    return w;
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const stepLen = Math.min(d, speed * dt);
    bot.pos.x += (dx / d) * stepLen;
    bot.pos.z += (dz / d) * stepLen;
    bot.yaw = Math.atan2(dx, dz);
    collideCircle(bot.pos, 0.38, colliders);
    return d - stepLen < 0.8;
  }

  function step(bot, dt, ctx) {
    if (!bot.alive) {
      bot.deadTimer += dt;
      return;
    }
    weaponStep(bot.weapon, dt);
    bot.thinkTimer -= dt;

    // --- Perception (staggered): pick the nearest visible enemy. Bots only
    // fight during a live round — never in the menu or after a round ends.
    if (bot.thinkTimer <= 0) {
      bot.thinkTimer = 0.16;
      bot.enemy = null;
      if (ctx.state.phase === 'round') {
        let bestD = 46;
      const eye = bot.tmp.set(bot.pos.x, bot.pos.y + 1.55, bot.pos.z);
      const candidates = ctx.fighters();
      for (let i = 0; i < candidates.length; i += 1) {
        const f = candidates[i];
        if (f.team === bot.team || !f.alive) continue;
        const dx = f.pos.x - bot.pos.x;
        const dz = f.pos.z - bot.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > bestD) continue;
        const to = ctx.tmpVec.set(f.pos.x, f.pos.y + (f.eye || 1.4), f.pos.z);
        if (ctx.canSee(eye, to)) {
          bestD = d;
          bot.enemy = f;
          bot.lastSeen.set(f.pos.x, f.pos.y, f.pos.z);
          bot.lastSeenAt = ctx.state.time;
          if (bot.reaction <= 0) bot.reaction = 0.35 + Math.random() * 0.35;
        }
      }
        if (!bot.enemy && ctx.state.time - bot.lastSeenAt > 4) {
          bot.lastSeenAt = -99;
        }
      }
    }

    const state = ctx.state;
    // --- Charge logic overrides movement.
    if (bot.team === 'raider' && bot.hasCharge && state.charge === 'idle' && bot.targetSite) {
      const site = bot.targetSite === 'A' ? MAP.siteA : MAP.siteB;
      if (bot.pos.x > site.minX && bot.pos.x < site.maxX && bot.pos.z > site.minZ && bot.pos.z < site.maxZ) {
        bot.mode = 'plant';
      }
    }
    if (bot.team === 'guard' && state.charge === 'planted' && state.chargeSite) {
      const site = state.chargeSite === 'A' ? MAP.siteA : MAP.siteB;
      if (bot.pos.x > site.minX && bot.pos.x < site.maxX && bot.pos.z > site.minZ && bot.pos.z < site.maxZ) {
        bot.mode = 'defuse';
      }
    }

    if (bot.mode === 'plant') {
      bot.actionProgress += dt;
      if (bot.actionProgress >= 3.5) {
        bot.actionProgress = 0;
        bot.mode = 'route';
        ctx.onPlanted(bot.targetSite, bot);
      }
      return;
    }
    if (bot.mode === 'defuse') {
      bot.actionProgress += dt;
      ctx.onDefuseTick(bot, bot.actionProgress);
      if (bot.actionProgress >= 5) {
        bot.actionProgress = 0;
        bot.mode = 'route';
        ctx.onDefused(bot);
      }
      return;
    }

    // --- Combat.
    if (bot.enemy && bot.enemy.alive) {
      const e = bot.enemy;
      const dx = e.pos.x - bot.pos.x;
      const dz = e.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      bot.yaw = Math.atan2(dx, dz);
      bot.mode = 'engage';
      if (bot.reaction > 0) {
        bot.reaction -= dt;
        return;
      }
      // Strafe sideways while firing, changing direction every ~1s.
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = 0.8 + Math.random() * 0.8;
        bot.strafe = Math.random() < 0.5 ? -1 : 1;
      }
      const sx = Math.cos(bot.yaw) * bot.strafe;
      const sz = -Math.sin(bot.yaw) * bot.strafe;
      bot.pos.x += sx * 1.4 * dt;
      bot.pos.z += sz * 1.4 * dt;
      collideCircle(bot.pos, 0.38, colliders);
      if (bot.burstLeft <= 0) {
        bot.burstTimer -= dt;
        if (bot.burstTimer <= 0) {
          bot.burstLeft = 3 + Math.floor(Math.random() * 3);
          bot.burstTimer = 0.7 + Math.random() * 0.6;
        }
      } else if (bot.weapon.mag <= 0) {
        startReload(bot.weapon);
      } else {
        const res = tryFire(bot.weapon, true);
        if (res === 'shot') {
          bot.burstLeft -= 1;
          ctx.botShoot(bot, e, dist);
        } else if (res === 'dry') {
          startReload(bot.weapon);
        }
      }
      return;
    }

    // --- Movement: follow route, then hold, then pick a new objective.
    bot.mode = 'route';
    if (bot.investigate) {
      const arrived = moveToward(bot, bot.investigate.x, bot.investigate.z, dt, 4.4);
      if (arrived) bot.investigate = null;
      return;
    }
    if (bot.route.length === 0) {
      if (bot.holdUntil > state.time) return;
      pickObjective(bot, state);
      return;
    }
    const wp = nearestWaypointPos(bot.route[bot.routeIndex]);
    if (!wp) {
      bot.route = [];
      return;
    }
    const arrived = moveToward(bot, wp.x, wp.z, dt, bot.team === 'raider' ? 4.2 : 3.4);
    if (arrived) {
      bot.routeIndex += 1;
      if (bot.routeIndex >= bot.route.length) {
        bot.route = [];
        bot.holdUntil = state.time + 2 + Math.random() * 3;
        // Raiders who reached their site without the charge wait for the carrier.
        if (bot.team === 'raider' && bot.targetSite) {
          const site = bot.targetSite === 'A' ? MAP.siteA : MAP.siteB;
          if (bot.pos.x > site.minX - 2 && bot.pos.x < site.maxX + 2 && bot.pos.z > site.minZ - 2 && bot.pos.z < site.maxZ + 2) {
            bot.holdUntil = state.time + 4 + Math.random() * 4;
          }
        }
      }
    }
  }

  function syncMeshes() {
    for (const bot of bots) {
      bot.mesh.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
      if (bot.alive) {
        bot.mesh.rotation.set(0, bot.yaw, 0);
      } else {
        bot.mesh.rotation.set(0, bot.yaw, Math.PI / 2);
        bot.mesh.position.y = -0.35;
      }
    }
  }

  return {
    bots,
    hitMeshes,
    makeSquads,
    resetPositions,
    pickObjective,
    stepAll(dt, ctx) {
      for (const bot of bots) step(bot, dt, ctx);
      syncMeshes();
    },
    hearShot(x, z, team) {
      for (const bot of bots) {
        if (!bot.alive || bot.team === team || bot.enemy) continue;
        const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
        if (d < 26) {
          bot.investigate = { x, z };
          bot.route = [];
        }
      }
    },
    aliveCount(team) {
      let n = 0;
      for (const bot of bots) if (bot.alive && bot.team === team) n += 1;
      return n;
    },
    carrier() {
      return bots.find((b) => b.hasCharge && b.alive) || null;
    },
  };
}
