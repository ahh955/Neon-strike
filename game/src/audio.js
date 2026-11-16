import { mulberry32 } from './rng.js';

// Synthesized sound effects: every sound is built from oscillators and
// filtered noise at run time, so the game ships no audio files. The context
// is created on the first user gesture; until then every call is a no-op.
// Even the noise is seeded, so the game never uses an unseeded source.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  const random = mulberry32(0x5eed);

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = random() * 2 - 1;
    return buffer;
  }

  function burst({ frequency = 1200, duration = 0.08, type = 'lowpass', gain = 0.5, slideTo = null, when = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, t0);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, t0);
    envelope.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(t0);
    source.stop(t0 + duration + 0.05);
  }

  function tone({ frequency = 440, end = null, duration = 0.15, type = 'sine', gain = 0.3, when = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, t0);
    envelope.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(envelope);
    envelope.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  const SHOT_TONE = { pistol: 900, rifle: 700, smg: 1100, sniper: 380 };

  return {
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
    },
    isMuted() {
      return muted;
    },
    shot(id, distant = false) {
      if (!ensure()) return;
      const base = SHOT_TONE[id] ?? 800;
      const gain = distant ? 0.12 : 0.5;
      burst({ frequency: base * 2, duration: 0.09, gain, slideTo: 180 });
      tone({ frequency: base / 4, end: 55, duration: 0.1, type: 'triangle', gain: gain * 0.8 });
    },
    dryFire() {
      tone({ frequency: 1800, duration: 0.04, type: 'square', gain: 0.12 });
    },
    throwGrenade() {
      burst({ frequency: 900, duration: 0.18, gain: 0.2, slideTo: 300 });
    },
    reload() {
      tone({ frequency: 900, duration: 0.05, type: 'square', gain: 0.15 });
      tone({ frequency: 620, duration: 0.05, type: 'square', gain: 0.15, when: 0.16 });
      tone({ frequency: 1200, duration: 0.06, type: 'square', gain: 0.18, when: 0.34 });
    },
    hit(kill) {
      tone({ frequency: kill ? 1320 : 990, duration: 0.07, type: 'sine', gain: 0.25 });
      if (kill) tone({ frequency: 1760, duration: 0.12, type: 'sine', gain: 0.2, when: 0.07 });
    },
    hurt() {
      burst({ frequency: 300, duration: 0.12, gain: 0.35, slideTo: 90 });
    },
    buy() {
      tone({ frequency: 880, duration: 0.08, type: 'sine', gain: 0.2 });
      tone({ frequency: 1320, duration: 0.12, type: 'sine', gain: 0.2, when: 0.08 });
    },
    denied() {
      tone({ frequency: 220, duration: 0.12, type: 'square', gain: 0.15 });
    },
    plant() {
      for (let i = 0; i < 3; i += 1) tone({ frequency: 660, duration: 0.06, type: 'square', gain: 0.2, when: i * 0.14 });
    },
    beep(fast) {
      tone({ frequency: fast ? 1560 : 1180, duration: 0.06, type: 'square', gain: 0.22 });
    },
    defuse() {
      tone({ frequency: 520, duration: 0.1, type: 'sine', gain: 0.2 });
      tone({ frequency: 780, duration: 0.14, type: 'sine', gain: 0.2, when: 0.12 });
    },
    explosion() {
      burst({ frequency: 500, duration: 0.9, gain: 0.8, slideTo: 40 });
      tone({ frequency: 90, end: 28, duration: 0.8, type: 'sine', gain: 0.7 });
    },
    roundWin() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ frequency: f, duration: 0.22, type: 'triangle', gain: 0.25, when: i * 0.11 }));
    },
    roundLose() {
      [392, 330, 262, 196].forEach((f, i) => tone({ frequency: f, duration: 0.24, type: 'triangle', gain: 0.22, when: i * 0.12 }));
    },
    step() {
      burst({ frequency: 500, duration: 0.05, gain: 0.06, slideTo: 200 });
    },
  };
}
