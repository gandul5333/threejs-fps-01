// hud.js — every DOM element the player sees: health, ammo, money, timer,
// score, alive counts, kill feed, crosshair, damage vignette, and the three
// overlays (menu, buy, round end). The 3D scene never touches the DOM.
import { WEAPONS, GRENADE } from './weapons.js';

const BUY_ITEMS = [
  { id: 'pistol', key: '1', name: 'P-9 SIDEARM', desc: 'Pistol cadangan — murah, akurat', price: 300 },
  { id: 'smg', key: '2', name: 'KILAT-9 SMG', desc: 'Tembakan cepat jarak dekat', price: 1500 },
  { id: 'shotgun', key: '3', name: 'GUNTUR-12', desc: '8 peluru sekali tembak', price: 1700 },
  { id: 'rifle', key: '4', name: 'BADAI-7 RIFLE', desc: 'Rifle utama — sakit, stabil', price: 2700 },
  { id: 'grenade', key: '5', name: 'PETASAN FRAG', desc: 'Granat ledak, tombol G', price: 300 },
  { id: 'armor', key: '6', name: 'ROMPI ANTI PELURU', desc: 'Serap 50% damage sampai habis', price: 650 },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    health: $('health-num'), healthBar: $('health-bar'), armor: $('armor-num'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weaponName: $('weapon-name'),
    grenades: $('grenade-num'), money: $('money-num'), timer: $('timer-num'),
    scoreGuard: $('score-guard'), scoreRaider: $('score-raider'), roundNum: $('round-num'),
    aliveGuard: $('alive-guard'), aliveRaider: $('alive-raider'),
    feed: $('feed'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    vignette: $('vignette'), charge: $('charge-status'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    playBtn: $('play'), buyPanel: $('buy-panel'), buyGrid: $('buy-grid'),
    buyMoney: $('buy-money'), centerMsg: $('center-msg'),
  };

  let onPlay = null;
  let onBuy = null;
  let onNextRound = null;
  let hitTimer = 0;
  let msgTimer = 0;

  // Build the buy grid once.
  for (const item of BUY_ITEMS) {
    const btn = document.createElement('button');
    btn.className = 'buy-item';
    btn.type = 'button';
    btn.dataset.id = item.id;
    btn.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    btn.addEventListener('click', () => {
      if (onBuy) onBuy(item.id);
    });
    els.buyGrid.appendChild(btn);
  }

  els.playBtn.addEventListener('click', () => {
    if (onPlay) onPlay();
  });

  function setOverlay(kind, data) {
    els.overlay.hidden = false;
    els.buyPanel.hidden = true;
    if (kind === 'start') {
      els.overlayTitle.textContent = 'DUSTLINE';
      els.overlayCopy.textContent = 'Tembak-menembak taktis di Pelabuhan Tua. Penjaga vs Penyusup — 5 ronde pertama menang. Plant charge di Site A atau B, atau habisi semua musuh.';
      els.playBtn.textContent = 'Klik untuk main';
    } else if (kind === 'paused') {
      els.overlayTitle.textContent = 'Jeda';
      els.overlayCopy.textContent = 'Klik untuk lanjut. WASD gerak, mouse bidik, B beli senjata, G granat, E plant/defuse.';
      els.playBtn.textContent = 'Lanjut main';
    } else if (kind === 'roundEnd') {
      els.overlayTitle.textContent = data.win ? 'RONDE MENANG' : 'RONDE KALAH';
      els.overlayCopy.textContent = `${data.reason} — Skor ${data.scoreGuard} : ${data.scoreRaider}. Ronde ${data.round} berikutnya dimulai otomatis.`;
      els.playBtn.textContent = 'Siap — ronde berikutnya';
    } else if (kind === 'matchEnd') {
      els.overlayTitle.textContent = data.win ? 'MENANG — PELABUHAN AMAN' : 'KALAH — PELABUHAN JATUH';
      els.overlayCopy.textContent = `${data.reason} Skor akhir ${data.scoreGuard} : ${data.scoreRaider}. Klik untuk main lagi dari ronde 1.`;
      els.playBtn.textContent = 'Main lagi';
    } else if (kind === 'dead') {
      els.overlayTitle.textContent = 'KAMU GUGUR';
      els.overlayCopy.textContent = 'Tunggu rekan setim menyelesaikan ronde ini. Ronde berikutnya kamu respawn.';
      els.playBtn.textContent = 'Tonton dari sini';
    }
  }

  return {
    onPlay(fn) { onPlay = fn; },
    onBuy(fn) { onBuy = fn; },
    onNextRound(fn) { onNextRound = fn; },
    showOverlay(kind, data) { setOverlay(kind, data || {}); },
    hideOverlay() { els.overlay.hidden = true; },
    overlayVisible() { return !els.overlay.hidden; },
    setHealth(h, armor) {
      els.health.textContent = Math.max(0, Math.ceil(h));
      els.healthBar.style.width = `${Math.max(0, h)}%`;
      els.healthBar.classList.toggle('low', h <= 30);
      els.armor.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
    },
    setAmmo(mag, reserve, name, grenadeCount) {
      els.ammoMag.textContent = mag;
      els.ammoReserve.textContent = `/ ${reserve}`;
      els.weaponName.textContent = name;
      els.grenades.textContent = `G x${grenadeCount}`;
      els.ammoMag.parentElement.classList.toggle('empty', mag === 0);
    },
    setMoney(m) {
      els.money.textContent = `$${m}`;
      els.buyMoney.textContent = `$${m}`;
      for (const btn of els.buyGrid.children) {
        const item = BUY_ITEMS.find((i) => i.id === btn.dataset.id);
        btn.classList.toggle('cant', m < item.price);
      }
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      els.timer.classList.toggle('low', s <= 15);
    },
    setScore(g, r, round) {
      els.scoreGuard.textContent = g;
      els.scoreRaider.textContent = r;
      els.roundNum.textContent = `RONDE ${round}`;
    },
    setAlive(g, r) {
      els.aliveGuard.textContent = `PENJAGA ${g}`;
      els.aliveRaider.textContent = `PENYUSUP ${r}`;
    },
    setCharge(text, cls) {
      els.charge.textContent = text;
      els.charge.className = cls || '';
    },
    feed(text, cls) {
      const div = document.createElement('div');
      div.className = `feed-line ${cls || ''}`;
      div.textContent = text;
      els.feed.prepend(div);
      while (els.feed.children.length > 5) els.feed.removeChild(els.feed.lastChild);
    },
    hitmarker(head, kill) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('head', !!head);
      els.hitmarker.classList.toggle('kill', !!kill);
      hitTimer = kill ? 0.3 : 0.12;
    },
    damageFlash() {
      els.vignette.classList.add('on');
      window.setTimeout(() => els.vignette.classList.remove('on'), 180);
    },
    centerMessage(text, seconds) {
      els.centerMsg.textContent = text;
      els.centerMsg.hidden = false;
      msgTimer = seconds || 2.5;
    },
    crosshairSpread(px) {
      const gap = 5 + px;
      els.crosshair.style.setProperty('--gap', `${gap}px`);
    },
    showBuy(open) {
      els.buyPanel.hidden = !open;
      if (open) els.overlay.hidden = true;
    },
    buyVisible() {
      return !els.buyPanel.hidden;
    },
    tick(dt) {
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) els.hitmarker.classList.remove('on', 'head', 'kill');
      }
      if (msgTimer > 0) {
        msgTimer -= dt;
        if (msgTimer <= 0) els.centerMsg.hidden = true;
      }
    },
  };
}
