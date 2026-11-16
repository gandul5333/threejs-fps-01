// weapons.js — the armoury. Data for every gun, plus the per-weapon runtime
// (magazine, reserve, fire timer, reload timer). Hitscan resolution lives in
// sim.js; this module only decides whether a trigger pull makes a shot.
import * as THREE from 'three';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P-9 SIDEARM', price: 300, kind: 'pistol',
    damage: 34, headMult: 2.5, magSize: 12, reserveMax: 36,
    fireInterval: 0.16, auto: false, reloadTime: 1.1,
    baseSpread: 0.006, moveSpread: 0.028, recoil: 0.011, range: 45,
    pellets: 1, kick: 0.05,
  },
  smg: {
    id: 'smg', name: 'KILAT-9 SMG', price: 1500, kind: 'smg',
    damage: 22, headMult: 2.5, magSize: 30, reserveMax: 120,
    fireInterval: 0.075, auto: true, reloadTime: 1.6,
    baseSpread: 0.013, moveSpread: 0.034, recoil: 0.007, range: 38,
    pellets: 1, kick: 0.03,
  },
  rifle: {
    id: 'rifle', name: 'BADAI-7 RIFLE', price: 2700, kind: 'rifle',
    damage: 36, headMult: 2.5, magSize: 30, reserveMax: 90,
    fireInterval: 0.11, auto: true, reloadTime: 2.2,
    baseSpread: 0.008, moveSpread: 0.036, recoil: 0.015, range: 60,
    pellets: 1, kick: 0.06,
  },
  shotgun: {
    id: 'shotgun', name: 'GUNTUR-12', price: 1700, kind: 'shotgun',
    damage: 14, headMult: 2.0, magSize: 6, reserveMax: 24,
    fireInterval: 0.9, auto: false, reloadTime: 2.6,
    baseSpread: 0.05, moveSpread: 0.05, recoil: 0.05, range: 22,
    pellets: 8, kick: 0.16,
  },
};

export const GRENADE = { id: 'grenade', name: 'PETASAN FRAG', price: 300, fuse: 1.6, radius: 7.5, damage: 115 };

// A weapon's live state. One instance per fighter (player or bot).
export function createWeaponState(def) {
  return {
    def,
    mag: def.magSize,
    reserve: def.reserveMax,
    cooldown: 0,
    reloading: 0, // seconds left; 0 = not reloading
    triggerHeld: false,
    firedThisPress: false,
  };
}

export function weaponStep(w, dt) {
  if (w.cooldown > 0) w.cooldown -= dt;
  if (w.reloading > 0) {
    w.reloading -= dt;
    if (w.reloading <= 0) {
      const need = w.def.magSize - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take;
      w.reserve -= take;
      w.reloading = 0;
    }
  }
}

// Returns 'shot' | 'dry' | 'none'. Caller performs the hitscan.
export function tryFire(w, wantFire) {
  if (w.reloading > 0 || w.cooldown > 0) return 'none';
  if (!w.def.auto) {
    if (!wantFire || w.firedThisPress) return 'none';
    w.firedThisPress = true;
  } else if (!wantFire) {
    return 'none';
  }
  if (w.mag <= 0) return 'dry';
  w.mag -= 1;
  w.cooldown = w.def.fireInterval;
  return 'shot';
}

export function releaseTrigger(w) {
  w.firedThisPress = false;
}

export function startReload(w) {
  if (w.reloading > 0 || w.mag >= w.def.magSize || w.reserve <= 0) return false;
  w.reloading = w.def.reloadTime;
  return true;
}

// Spread in radians: still + crouched is tight, moving or airborne is wide.
export function currentSpread(w, speed, crouched) {
  const move = Math.min(speed / 5, 1);
  let s = w.def.baseSpread + w.def.moveSpread * move;
  if (crouched) s *= 0.6;
  return s;
}

// --- View model: a simple stylised gun built from boxes, parented to the camera.
export function buildViewModel(def) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.5, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a2f24, roughness: 0.85, metalness: 0.05 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff8c2e, roughness: 0.5, metalness: 0.3 });
  const long = def.kind === 'rifle' || def.kind === 'smg';
  const barrelLen = def.kind === 'shotgun' ? 0.62 : long ? 0.55 : 0.26;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, barrelLen), dark);
  body.position.set(0, 0, -barrelLen / 2);
  group.add(body);
  const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), grip);
  gripMesh.position.set(0, -0.11, 0.02);
  gripMesh.rotation.x = 0.25;
  group.add(gripMesh);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), dark);
  mag.position.set(0, -0.1, -0.12);
  group.add(mag);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.015, barrelLen * 0.5), accent);
  stripe.position.set(0, 0.052, -barrelLen * 0.3);
  group.add(stripe);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.04, 0.02), dark);
  sight.position.set(0, 0.07, -barrelLen + 0.03);
  group.add(sight);
  if (def.kind === 'shotgun') {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.2), grip);
    pump.position.set(0, -0.06, -0.42);
    group.add(pump);
  }
  // Muzzle flash quad, hidden until a shot.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0, 0.01, -barrelLen - 0.06);
  group.add(flash);
  group.position.set(0.24, -0.22, -0.4);
  group.userData = { flash, flashMat, barrelLen, kick: 0 };
  return group;
}
