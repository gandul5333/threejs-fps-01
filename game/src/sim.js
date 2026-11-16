// sim.js — the match simulation, stepped at a fixed 60 Hz from main.js.
// Owns round flow (buy -> round -> round end -> match end), the economy,
// hitscan shooting, grenades, the charge plant/defuse, and every win check.
// Rendering only reads the state this module writes.
import * as THREE from 'three';
import { WEAPONS, GRENADE, createWeaponState, weaponStep, tryFire, releaseTrigger, startReload, currentSpread } from './weapons.js';
import { MAP } from './map.js';
import { TEAM_NAME } from './state.js';

const BUY_SECONDS = 10;
const ROUND_SECONDS = 100;
const PLANT_SECONDS = 3.5;
const DEFUSE_SECONDS = 5;
const CHARGE_SECONDS = 35;

export function createSim(deps) {
  const { scene, camera, player, bots, effects, audio, hud, state, input } = deps;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const tmpDir = new THREE.Vector3();
  const tmpVec = new THREE.Vector3();
  const tmpMuzzle = new THREE.Vector3();
  const tmpHit = new THREE.Vector3();

  // Player loadout: owned weapons + grenades, kept across rounds.
  const loadout = {
    owned: { pistol: createWeaponState(WEAPONS.pistol) },
    current: 'pistol',
    grenades: 0,
  };

  const grenade = { active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0 };
  let buyTimer = 0;
  let endTimer = 0;
  let defuseProgress = 0;
  let plantAnnounced = false;
  let random = Math.random;

  const shootables = deps.shootables; // map meshes + bot hit meshes (updated live)

  function fighters() {
    const list = [];
    if (player.state.alive) {
      list.push({ kind: 'player', team: 'guard', alive: true, pos: player.state.position, eye: player.state.eye, ref: player.state, name: 'Kamu' });
    }
    for (const b of bots.bots) {
      list.push({ kind: 'bot', team: b.team, alive: b.alive, pos: b.pos, eye: 1.55, ref: b, name: b.name });
    }
    return list;
  }

  function canSee(from, to) {
    tmpDir.subVectors(to, from);
    const dist = tmpDir.length();
    if (dist < 0.01) return true;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return !hit || hit.distance > dist - 0.4;
  }

  function feed(text, cls) {
    hud.feed(text, cls);
    state.feed.unshift(text);
    if (state.feed.length > 8) state.feed.pop();
  }

  function damageFighter(target, amount, isHead, attackerName, attackerTeam) {
    if (!target.alive) return;
    let dealt = amount;
    if (target.kind === 'player') {
      dealt = player.damage(amount);
      state.damageFlash = 1;
      hud.damageFlash();
      audio.hurt();
    } else {
      const bot = target.ref;
      bot.health -= dealt;
      if (bot.health <= 0) {
        bot.health = 0;
        bot.alive = false;
        bot.mode = 'dead';
        feed(`${attackerName} menghabisi ${bot.name}`, attackerTeam === 'guard' ? 'good' : 'bad');
        if (attackerTeam === 'guard') {
          state.money += 300;
          state.kills += 1;
          hud.setMoney(state.money);
          audio.kill();
          if (bot.hasCharge) {
            bot.hasCharge = false;
            // Charge drops where the carrier fell; another raider picks it up.
            const other = bots.bots.find((b) => b.alive && b.team === 'raider');
            if (other) {
              other.hasCharge = true;
              feed(`${other.name} mengambil charge`, 'bad');
            }
          }
        }
      }
    }
    if (target.kind === 'player' && !player.state.alive) {
      state.deaths += 1;
      feed(`${attackerName} menghabisi Kamu`, 'bad');
      input.releaseLock();
      if (state.phase === 'round') hud.showOverlay('dead', {});
    }
  }

  function muzzlePoint(out) {
    camera.getWorldPosition(out);
    camera.getWorldDirection(tmpDir);
    out.addScaledVector(tmpDir, 0.5);
    out.y -= 0.12;
    return out;
  }

  function shootFrom(origin, dir, spread, weapon, attackerName, attackerTeam, isPlayer) {
    // One trigger pull = pellets rays. Returns true if anything was hit.
    let anyHit = false;
    for (let p = 0; p < weapon.def.pellets; p += 1) {
      tmpDir.copy(dir);
      tmpDir.x += (random() * 2 - 1) * spread;
      tmpDir.y += (random() * 2 - 1) * spread;
      tmpDir.z += (random() * 2 - 1) * spread;
      tmpDir.normalize();
      raycaster.set(origin, tmpDir);
      raycaster.far = weapon.def.range;
      const hits = raycaster.intersectObjects(shootables, false);
      const hit = hits[0];
      if (!hit) {
        tmpHit.copy(origin).addScaledVector(tmpDir, weapon.def.range);
        effects.tracer(origin, tmpHit);
        continue;
      }
      effects.tracer(origin, hit.point);
      const ud = hit.object.userData || {};
      if (ud.bot && ud.bot.alive) {
        const isHead = ud.part === 'head';
        const dist = hit.distance;
        const falloff = Math.max(0.5, 1 - dist / 90);
        const dmg = weapon.def.damage * (isHead ? weapon.def.headMult : 1) * falloff;
        const target = { kind: 'bot', team: ud.bot.team, alive: true, pos: ud.bot.pos, ref: ud.bot, name: ud.bot.name };
        damageFighter(target, dmg, isHead, attackerName, attackerTeam);
        if (isPlayer) {
          hud.hitmarker(isHead, !ud.bot.alive);
          audio.hit(isHead);
        }
        anyHit = true;
      } else {
        effects.spark(hit.point);
        anyHit = true;
      }
    }
    return anyHit;
  }

  function playerShoot() {
    const w = loadout.owned[loadout.current];
    const wantFire = input.state.firing;
    const res = tryFire(w, wantFire);
    if (res === 'dry') {
      audio.dryFire();
      return;
    }
    if (res !== 'shot') return;
    camera.getWorldDirection(tmpDir);
    const spread = currentSpread(w, player.groundSpeed(), player.state.crouched);
    const origin = muzzlePoint(tmpMuzzle);
    shootFrom(origin, tmpDir, spread, w, 'Kamu', 'guard', true);
    player.recoil(w.def.recoil * 1.6, (random() * 2 - 1) * w.def.recoil * 0.5);
    audio.shot(w.def.kind);
    bots.hearShot(player.state.position.x, player.state.position.z, 'guard');
    // Muzzle flash on the view model.
    const vm = deps.viewModel;
    if (vm) {
      vm.userData.flashMat.opacity = 0.95;
      vm.userData.flash.rotation.z = random() * Math.PI;
      vm.userData.kick = w.def.kick;
    }
    hud.setAmmo(w.mag, w.reserve, w.def.name, loadout.grenades);
    hud.crosshairSpread(spread * 900);
  }

  function botShoot(bot, enemy, dist) {
    // Bot accuracy: closer and slower targets are easier; bots miss on purpose.
    const targetSpeed = enemy.kind === 'player' ? player.groundSpeed() : 3;
    let chance = 0.52 - dist * 0.007 - targetSpeed * 0.03;
    chance = Math.max(0.08, Math.min(0.72, chance));
    const muzzle = tmpMuzzle.set(bot.pos.x, bot.pos.y + 1.35, bot.pos.z);
    const aim = tmpVec.set(enemy.pos.x, enemy.pos.y + (enemy.eye || 1.4) - 0.15, enemy.pos.z);
    const dir = tmpDir.subVectors(aim, muzzle).normalize();
    const spread = 0.02 + dist * 0.0009;
    // Enemy tracers are quieter.
    audio.shot('enemy');
    bots.hearShot(bot.pos.x, bot.pos.z, bot.team);
    if (random() < chance) {
      const isHead = random() < 0.1;
      const falloff = Math.max(0.5, 1 - dist / 90);
      const dmg = bot.weapon.def.damage * (isHead ? bot.weapon.def.headMult : 1) * falloff;
      const target = { kind: enemy.kind, team: enemy.team, alive: enemy.alive, pos: enemy.pos, ref: enemy.ref, name: enemy.name };
      damageFighter(target, dmg, isHead, bot.name, bot.team);
      effects.tracer(muzzle, aim);
    } else {
      const miss = tmpHit.copy(aim);
      miss.x += (random() * 2 - 1) * 1.4;
      miss.y += (random() * 2 - 1) * 0.8;
      miss.z += (random() * 2 - 1) * 1.4;
      effects.tracer(muzzle, miss);
    }
  }

  function throwGrenade() {
    if (loadout.grenades <= 0 || grenade.active) return;
    loadout.grenades -= 1;
    camera.getWorldDirection(tmpDir);
    grenade.pos.copy(camera.position).addScaledVector(tmpDir, 0.5);
    grenade.vel.copy(tmpDir).multiplyScalar(17);
    grenade.vel.y += 3.5;
    grenade.fuse = GRENADE.fuse;
    grenade.active = true;
    effects.showGrenade(grenade.pos);
    audio.grenadePin();
    hud.setAmmo(loadout.owned[loadout.current].mag, loadout.owned[loadout.current].reserve, loadout.owned[loadout.current].def.name, loadout.grenades);
  }

  function explodeGrenade() {
    grenade.active = false;
    effects.hideGrenade();
    effects.explosion(grenade.pos);
    audio.explosion();
    for (const f of fighters()) {
      const d = Math.hypot(f.pos.x - grenade.pos.x, f.pos.z - grenade.pos.z) + Math.abs((f.pos.y + 1) - grenade.pos.y) * 0.5;
      if (d > GRENADE.radius) continue;
      const dmg = GRENADE.damage * (1 - d / (GRENADE.radius * 1.2));
      damageFighter(f, dmg, false, 'Kamu', 'guard');
    }
    bots.hearShot(grenade.pos.x, grenade.pos.z, 'guard');
  }

  function buy(itemId) {
    const price = itemId === 'grenade' ? GRENADE.price : itemId === 'armor' ? 650 : WEAPONS[itemId].price;
    if (state.money < price) {
      audio.denied();
      hud.centerMessage('Uang tidak cukup!', 1.5);
      return;
    }
    if (itemId === 'grenade') {
      if (loadout.grenades >= 3) {
        audio.denied();
        return;
      }
      loadout.grenades += 1;
    } else if (itemId === 'armor') {
      if (player.state.armor >= 100) {
        audio.denied();
        return;
      }
      player.state.armor = 100;
    } else {
      if (!loadout.owned[itemId]) loadout.owned[itemId] = createWeaponState(WEAPONS[itemId]);
      loadout.current = itemId;
      const w = loadout.owned[itemId];
      w.mag = w.def.magSize;
      w.reserve = w.def.reserveMax;
      deps.setViewModel(itemId);
    }
    state.money -= price;
    audio.buy();
    hud.setMoney(state.money);
    const w = loadout.owned[loadout.current];
    hud.setAmmo(w.mag, w.reserve, w.def.name, loadout.grenades);
    hud.setHealth(player.state.health, player.state.armor);
  }

  function switchWeapon(id) {
    if (!loadout.owned[id] || loadout.current === id) return;
    loadout.current = id;
    releaseTrigger(loadout.owned[id]);
    deps.setViewModel(id);
    const w = loadout.owned[id];
    hud.setAmmo(w.mag, w.reserve, w.def.name, loadout.grenades);
  }

  function siteAt(x, z) {
    const a = MAP.siteA;
    const b = MAP.siteB;
    if (x > a.minX && x < a.maxX && z > a.minZ && z < a.maxZ) return 'A';
    if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return 'B';
    return null;
  }

  function startRound() {
    state.phase = 'buy';
    state.roundTimer = BUY_SECONDS;
    buyTimer = BUY_SECONDS;
    state.charge = 'idle';
    state.chargeSite = null;
    state.chargeTimer = CHARGE_SECONDS;
    state.defusing = false;
    defuseProgress = 0;
    plantAnnounced = false;
    effects.hideCharge();
    player.reset(MAP.guardSpawn.x, MAP.guardSpawn.z, MAP.guardSpawn.yaw);
    bots.resetPositions(state);
    // Refill owned weapons each round.
    for (const id of Object.keys(loadout.owned)) {
      const w = loadout.owned[id];
      w.mag = w.def.magSize;
      w.reserve = w.def.reserveMax;
      w.reloading = 0;
      w.cooldown = 0;
    }
    deps.setViewModel(loadout.current);
    const w = loadout.owned[loadout.current];
    hud.setAmmo(w.mag, w.reserve, w.def.name, loadout.grenades);
    hud.setHealth(100, player.state.armor);
    hud.setMoney(state.money);
    hud.setScore(state.score.guard, state.score.raider, state.round);
    hud.setTimer(BUY_SECONDS);
    hud.setCharge('BELI SENJATA — tekan B', 'buy');
    hud.setAlive(4, 4);
    audio.roundStart();
    hud.centerMessage(`RONDE ${state.round} — BELI SENJATA (B)`, 3);
  }

  function endRound(winner, reason) {
    if (state.phase !== 'round' && state.phase !== 'buy') return;
    state.phase = 'roundEnd';
    state.roundWinner = winner;
    state.roundReason = reason;
    state.score[winner] += 1;
    endTimer = 4.5;
    const playerWon = winner === 'guard';
    state.money += playerWon ? 3250 : 1900;
    hud.setMoney(state.money);
    hud.setScore(state.score.guard, state.score.raider, state.round);
    audio.roundEnd(playerWon);
    feed(reason, playerWon ? 'good' : 'bad');
    if (state.score.guard >= state.roundsToWin || state.score.raider >= state.roundsToWin) {
      state.phase = 'matchEnd';
      state.matchWinner = state.score.guard > state.score.raider ? 'guard' : 'raider';
      hud.showOverlay('matchEnd', {
        win: state.matchWinner === 'guard',
        reason: state.matchWinner === 'guard' ? 'Penjaga mempertahankan pelabuhan.' : 'Penyusup menguasai pelabuhan.',
        scoreGuard: state.score.guard,
        scoreRaider: state.score.raider,
      });
      input.releaseLock();
      return;
    }
    hud.showOverlay('roundEnd', {
      win: playerWon,
      reason,
      scoreGuard: state.score.guard,
      scoreRaider: state.score.raider,
      round: state.round,
    });
    input.releaseLock();
  }

  function startMatch() {
    state.score.guard = 0;
    state.score.raider = 0;
    state.round = 1;
    state.money = 800;
    state.kills = 0;
    state.deaths = 0;
    state.matchWinner = null;
    loadout.owned = { pistol: createWeaponState(WEAPONS.pistol) };
    loadout.current = 'pistol';
    loadout.grenades = 0;
    player.state.armor = 0;
    startRound();
  }

  function checkWinConditions() {
    const guardsAlive = (player.state.alive ? 1 : 0) + bots.aliveCount('guard');
    const raidersAlive = bots.aliveCount('raider');
    if (state.charge === 'planted') {
      if (raidersAlive === 0 && guardsAlive > 0) {
        // Nobody left to stop the defuse — guards just need to finish it.
        return;
      }
      if (guardsAlive === 0) {
        endRound('raider', 'Semua Penjaga gugur — charge meledak tanpa perlawanan');
      }
      return;
    }
    if (raidersAlive === 0) {
      endRound('guard', 'Semua Penyusup dihabisi');
      return;
    }
    if (guardsAlive === 0) {
      endRound('raider', 'Semua Penjaga gugur');
      return;
    }
    if (state.roundTimer <= 0) {
      endRound('guard', 'Waktu habis — Penyusup gagal plant charge');
    }
  }

  const botCtx = {
    state,
    tmpVec,
    fighters,
    canSee,
    botShoot,
    onPlanted(site, bot) {
      state.charge = 'planted';
      state.chargeSite = site;
      state.chargeTimer = CHARGE_SECONDS;
      const s = site === 'A' ? MAP.siteA : MAP.siteB;
      effects.showCharge({ x: s.cx, z: s.cz });
      feed(`Charge ditanam di SITE ${site}! Defuse dengan E!`, 'bad');
      hud.centerMessage(`CHARGE DITANAM — SITE ${site}`, 3);
      audio.plantBeep();
      hud.setCharge(`CHARGE SITE ${site} — ${CHARGE_SECONDS}s`, 'planted');
    },
    onDefuseTick(bot, progress) {
      // A guard bot defusing counts as the team's defuse.
      hud.setCharge(`DEFUSE... ${Math.ceil(DEFUSE_SECONDS - progress)}s`, 'defusing');
    },
    onDefused(bot) {
      state.charge = 'defused';
      state.money += 300;
      hud.setMoney(state.money);
      effects.hideCharge();
      endRound('guard', `${bot.name} berhasil menjinakkan charge`);
    },
  };

  function step(dt) {
    state.time += dt;
    hud.tick(dt);

    if (state.phase === 'menu' || state.phase === 'matchEnd') {
      // Idle scene behind the overlay: bots wander the yard.
      if (state.phase === 'menu') {
        bots.stepAll(dt, botCtx);
      }
      return;
    }

    if (state.phase === 'roundEnd') {
      endTimer -= dt;
      bots.stepAll(dt, botCtx);
      if (endTimer <= 0) {
        state.round += 1;
        hud.hideOverlay();
        startRound();
      }
      return;
    }

    if (state.phase === 'buy') {
      buyTimer -= dt;
      state.roundTimer = buyTimer;
      hud.setTimer(buyTimer);
      player.step(dt, input.state.keys);
      if (input.pressed('KeyB')) hud.showBuy(!hud.buyVisible());
      if (hud.buyVisible()) {
        if (input.pressed('Digit1')) buy('pistol');
        if (input.pressed('Digit2')) buy('smg');
        if (input.pressed('Digit3')) buy('shotgun');
        if (input.pressed('Digit4')) buy('rifle');
        if (input.pressed('Digit5')) buy('grenade');
        if (input.pressed('Digit6')) buy('armor');
      }
      if (buyTimer <= 0) {
        state.phase = 'round';
        state.roundTimer = ROUND_SECONDS;
        hud.showBuy(false);
        hud.setCharge('CARI & HABISI PENYUSUP', '');
        hud.centerMessage('RONDE DIMULAI — JAGA SITE!', 2.5);
      }
      return;
    }

    // --- phase 'round' ---
    state.roundTimer -= dt;
    hud.setTimer(state.roundTimer);
    if (state.charge === 'planted') {
      state.chargeTimer -= dt;
      hud.setCharge(`CHARGE SITE ${state.chargeSite} — ${Math.max(0, Math.ceil(state.chargeTimer))}s`, 'planted');
      if (state.chargeTimer <= 0) {
        state.charge = 'exploded';
        const s = state.chargeSite === 'A' ? MAP.siteA : MAP.siteB;
        effects.explosion({ x: s.cx, y: 1, z: s.cz });
        audio.explosion();
        effects.hideCharge();
        endRound('raider', `Charge meledak di SITE ${state.chargeSite}`);
        return;
      }
    }

    // Player movement + look + actions.
    if (player.state.alive) {
      player.step(dt, input.state.keys);
      const w = loadout.owned[loadout.current];
      weaponStep(w, dt);
      if (input.pressed('KeyR')) {
        if (startReload(w)) audio.reload();
      }
      if (input.pressed('Digit1')) switchWeapon('pistol');
      if (input.pressed('Digit2')) switchWeapon('smg');
      if (input.pressed('Digit3')) switchWeapon('shotgun');
      if (input.pressed('Digit4')) switchWeapon('rifle');
      if (input.pressed('KeyG')) throwGrenade();
      if (input.pressed('KeyB')) hud.showBuy(!hud.buyVisible());
      if (hud.buyVisible()) {
        if (input.pressed('Digit5')) buy('grenade');
        if (input.pressed('Digit6')) buy('armor');
      }
      if (input.state.firing && input.state.locked) playerShoot();
      if (!input.state.firing) releaseTrigger(w);

      // Defuse: hold E near the planted charge.
      if (state.charge === 'planted' && state.chargeSite) {
        const s = state.chargeSite === 'A' ? MAP.siteA : MAP.siteB;
        const near = player.state.position.x > s.minX && player.state.position.x < s.maxX
          && player.state.position.z > s.minZ && player.state.position.z < s.maxZ;
        if (near && input.state.keys.has('KeyE')) {
          defuseProgress += dt;
          state.defusing = true;
          hud.setCharge(`DEFUSE... ${Math.max(0, DEFUSE_SECONDS - defuseProgress).toFixed(1)}s — TAHAN E`, 'defusing');
          if (Math.floor(defuseProgress * 4) !== Math.floor((defuseProgress - dt) * 4)) audio.defuseBeep();
          if (defuseProgress >= DEFUSE_SECONDS) {
            state.charge = 'defused';
            state.money += 300;
            hud.setMoney(state.money);
            effects.hideCharge();
            endRound('guard', 'Kamu menjinakkan charge!');
            return;
          }
        } else {
          if (defuseProgress > 0) hud.setCharge(`CHARGE SITE ${state.chargeSite} — ${Math.max(0, Math.ceil(state.chargeTimer))}s`, 'planted');
          defuseProgress = 0;
          state.defusing = false;
        }
      }
    } else if (input.pressed('KeyB')) {
      hud.showBuy(false);
    }

    // Grenade physics.
    if (grenade.active) {
      grenade.fuse -= dt;
      grenade.vel.y -= 12 * dt;
      grenade.pos.addScaledVector(grenade.vel, dt);
      if (grenade.pos.y < 0.09) {
        grenade.pos.y = 0.09;
        grenade.vel.y *= -0.45;
        grenade.vel.x *= 0.7;
        grenade.vel.z *= 0.7;
      }
      if (grenade.pos.x < -27.4 || grenade.pos.x > 27.4) grenade.vel.x *= -0.5;
      if (grenade.pos.z < -19.4 || grenade.pos.z > 19.4) grenade.vel.z *= -0.5;
      effects.showGrenade(grenade.pos);
      if (grenade.fuse <= 0) explodeGrenade();
    }

    bots.stepAll(dt, botCtx);

    // View-model kick + flash decay.
    const vm = deps.viewModel;
    if (vm) {
      vm.userData.kick *= Math.pow(0.001, dt);
      vm.position.z = -0.4 + vm.userData.kick;
      vm.userData.flashMat.opacity *= Math.pow(0.0001, dt);
      if (vm.userData.flashMat.opacity < 0.02) vm.userData.flashMat.opacity = 0;
    }

    hud.setHealth(player.state.health, player.state.armor);
    hud.setAlive((player.state.alive ? 1 : 0) + bots.aliveCount('guard'), bots.aliveCount('raider'));
    if (state.charge === 'planted' && !plantAnnounced) {
      plantAnnounced = true;
    }
    checkWinConditions();
  }

  return {
    step,
    startMatch,
    startRound,
    endRound,
    buy,
    loadout,
    fighters,
    setRandom(fn) { random = fn; },
  };
}
