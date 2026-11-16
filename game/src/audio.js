// audio.js — every sound is synthesised with WebAudio: filtered noise bursts
// for gunfire, short oscillator blips for UI, a low sine drop for explosions.
// No audio files, no network. Created lazily on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(dur, filterFreq, type, gain, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, gain, slideTo = 0, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    shot(kind) {
      // kind: 'rifle' | 'smg' | 'shotgun' | 'pistol' | 'enemy'
      if (kind === 'shotgun') noise(0.22, 900, 'lowpass', 0.9);
      else if (kind === 'pistol') noise(0.12, 1800, 'bandpass', 0.7);
      else if (kind === 'smg') noise(0.08, 2400, 'bandpass', 0.45);
      else if (kind === 'enemy') noise(0.1, 1400, 'bandpass', 0.22);
      else noise(0.14, 1600, 'bandpass', 0.65);
      tone(160, 0.08, 'square', 0.12, 60);
    },
    dryFire() {
      tone(1200, 0.03, 'square', 0.08);
    },
    reload() {
      tone(500, 0.05, 'square', 0.1);
      tone(700, 0.05, 'square', 0.1, 0, 0.18);
    },
    hit(head) {
      tone(head ? 1500 : 1100, 0.06, 'sine', 0.22);
    },
    kill() {
      tone(880, 0.09, 'sine', 0.2);
      tone(1320, 0.12, 'sine', 0.18, 0, 0.09);
    },
    hurt() {
      tone(220, 0.15, 'sawtooth', 0.16, 90);
    },
    buy() {
      tone(660, 0.06, 'sine', 0.18);
      tone(990, 0.08, 'sine', 0.18, 0, 0.06);
    },
    denied() {
      tone(180, 0.12, 'square', 0.14, 120);
    },
    plantBeep() {
      tone(1050, 0.07, 'sine', 0.2);
    },
    defuseBeep() {
      tone(1400, 0.05, 'sine', 0.15);
    },
    explosion() {
      noise(1.1, 220, 'lowpass', 1.0);
      tone(70, 0.9, 'sine', 0.5, 28);
    },
    grenadePin() {
      tone(900, 0.04, 'square', 0.1);
    },
    roundStart() {
      tone(440, 0.12, 'sine', 0.16);
      tone(660, 0.16, 'sine', 0.16, 0, 0.12);
    },
    roundEnd(win) {
      if (win) {
        tone(523, 0.14, 'sine', 0.2);
        tone(659, 0.14, 'sine', 0.2, 0, 0.14);
        tone(784, 0.22, 'sine', 0.2, 0, 0.28);
      } else {
        tone(392, 0.16, 'sine', 0.18);
        tone(311, 0.24, 'sine', 0.18, 0, 0.16);
      }
    },
  };
}
