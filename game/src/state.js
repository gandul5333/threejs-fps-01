// state.js — the single place the whole match lives. Every module reads or
// mutates this one object (or a slice of it handed to it at creation); nothing
// else keeps match truth. Rendering reads it, the simulation writes it.
export function createState() {
  return {
    // Match flow: 'menu' | 'buy' | 'round' | 'roundEnd' | 'matchEnd'
    phase: 'menu',
    round: 1,
    roundsToWin: 5,
    roundTime: 100, // seconds left in the round
    roundTimer: 100,
    score: { guard: 0, raider: 0 }, // guard = player's team (Penjaga), raider = Penyusup
    money: 800,
    // Bomb/charge: 'idle' | 'carried' | 'planted' | 'defused' | 'exploded'
    charge: 'idle',
    chargeSite: null, // 'A' | 'B'
    chargeTimer: 35, // seconds from plant to explosion
    defuseTimer: 0, // seconds of defuse progress (needs 5)
    defusing: false,
    // Round end info for the overlay
    roundWinner: null, // 'guard' | 'raider' | null
    roundReason: '',
    matchWinner: null,
    // Player + bots are entities in sim.js; this is the shared clock.
    time: 0,
    kills: 0,
    deaths: 0,
    // Kill feed lines, newest first, capped by hud.
    feed: [],
    // Last damage direction (radians, relative to player yaw) for the HUD indicator.
    damageFrom: 0,
    damageFlash: 0,
  };
}

export const TEAM = { GUARD: 'guard', RAIDER: 'raider' };
export const TEAM_NAME = { guard: 'PENJAGA', raider: 'PENYUSUP' };
export const SITE_NAME = { A: 'SITE A — DERMAGA', B: 'SITE B — GUDANG' };
