// Seeded randomness for the whole game: every random choice in gameplay, bot
// behaviour and screenshot staging comes from one mulberry32 stream, so a run
// with the same seed plays the same way. Nothing in the game uses an
// unseeded random source.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(random, min, max) {
  return min + random() * (max - min);
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

export function chance(random, p) {
  return random() < p;
}
