// Deterministic seeded shuffle.
//
// Why this matters for concurrency: instead of storing a mutable "shuffled
// bag" that multiple requests could read-modify-write at once (a race
// condition), every request only needs one atomic Redis INCR to get a unique
// ticket number. Everything else -- which draft that ticket maps to -- is a
// pure function of (salt, round number). Two requests arriving at the exact
// same instant just get two different ticket numbers from INCR; there is
// nothing else shared to race over.

// xmur3 hashes a string into a 32-bit seed.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

// mulberry32 is a small, fast, deterministic PRNG seeded by a 32-bit int.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle of [0..n-1], driven by a PRNG seeded from seedStr.
// Same seedStr always produces the same order.
function seededShuffle(seedStr, n) {
  const seedFn = xmur3(String(seedStr));
  const rand = mulberry32(seedFn());
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Maps a 0-indexed ticket number to a draft index, guaranteeing every draft
// is used once per "round" of n drafts before any repeat, with random order
// each round, and no back-to-back repeat across a round boundary.
function draftIndexForTicket(ticketIndex0, n, salt) {
  const round = Math.floor(ticketIndex0 / n);
  const pos = ticketIndex0 % n;
  const order = seededShuffle(`${salt}:${round}`, n);

  if (pos === 0 && round > 0 && n > 1) {
    const prevOrder = seededShuffle(`${salt}:${round - 1}`, n);
    const prevLast = prevOrder[n - 1];
    if (order[0] === prevLast) {
      [order[0], order[1]] = [order[1], order[0]];
    }
  }

  return order[pos];
}

module.exports = { seededShuffle, draftIndexForTicket };
