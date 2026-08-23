// Small random-number helpers used throughout the game engine.
// Centralized here so the "randomness surface" is easy to find.
//
// Backed by a seedable deterministic PRNG (mulberry32) rather than raw
// Math.random(). Every exported function keeps its original signature, so
// nothing elsewhere in the engine had to change to pick this up — normal
// play self-seeds from real entropy at module load (see below) and behaves
// exactly as before. seedRng() lets a caller reset the sequence to a known
// starting point, which is what makes the Daily Challenge mode (see
// game/dailyChallenge.js) work: every player who plays "today's challenge"
// gets the identical weather timeline, fortune-card draws, and price-drift
// noise, so differences in the final score come from player choices, not
// random luck.
//
// TWO independent streams, not one — this is the part that actually makes
// that fairness guarantee hold. The "environment" stream (weather duration,
// price drift noise, fortune-card draws — see weather.js/market.js/decks.js)
// is what every player's Daily Challenge run must share bit-for-bit. The
// default stream (business income rolls, robot decision-making, R&D
// payoffs, ...) is everything that stems from PLAYER CHOICES, which are
// allowed — expected — to differ. Once economy features let one player's
// choices affect another player's cash (Tree House rent depends on how
// much of it the WHOLE TABLE owns, not just one player — see players.js's
// effectiveRentPerUnit), a robot's cash trajectory can differ depending on
// what a human bought, which changes how many decision-rolls that robot's
// AI makes on its turn. If that consumed the SAME stream the environment
// draws from, two players' "identical" Daily Challenge environments would
// silently drift apart the moment their in-game choices diverged — exactly
// the bug a single shared stream can't avoid. Splitting the streams means a
// robot's own randomness can wobble around as much as it wants without ever
// touching the sequence weather/prices/cards are drawn from.
function seedFromEntropy() {
  // No Math.random() ban here — this is the one place in the whole engine
  // that's allowed to touch real entropy, since it's just picking an
  // unpredictable STARTING point for the deterministic generator below, not
  // generating gameplay outcomes directly.
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

/** A tiny mulberry32 generator instance — small, fast, good-enough-for-a-
 * kids'-board-game PRNG. Each stream below is one of these, independently
 * seeded and advanced. */
function createGenerator(seed) {
  let state = seed >>> 0;

  function nextUint32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  function next() {
    return nextUint32() / 4294967296;
  }

  return {
    reseed(newSeed) {
      state = (Math.floor(newSeed) || 0) >>> 0;
      // Run forward once so a seed of 0 (or any value that would otherwise
      // produce a degenerate first output) still mixes properly.
      nextUint32();
    },
    randomInt(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    randomFloat(min, max) {
      return next() * (max - min) + min;
    },
    noise(magnitude) {
      return this.randomFloat(-magnitude, magnitude);
    },
    chance(p) {
      return next() < p;
    },
    weightedPick(weights) {
      const entries = Object.entries(weights);
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [key, w] of entries) {
        roll -= w;
        if (roll <= 0) return key;
      }
      return entries[entries.length - 1][0];
    },
    pickRandom(arr) {
      return arr[this.randomInt(0, arr.length - 1)];
    },
  };
}

const defaultGen = createGenerator(seedFromEntropy());
const envGen = createGenerator(seedFromEntropy());

/** Reset BOTH streams to known, independent starting points derived from
 * one seed (e.g. a hash of today's date — see game/dailyChallenge.js). The
 * environment stream and the default stream get different derived seeds
 * (simple, deterministic, and independent enough for a kids' board game —
 * this doesn't need to be cryptographically robust) so they don't happen to
 * produce the same sequence. */
export function seedRng(seed) {
  const base = (Math.floor(seed) || 0) >>> 0;
  defaultGen.reseed(base);
  envGen.reseed((base ^ 0x9e3779b9) >>> 0);
}

export function randomInt(min, max) {
  return defaultGen.randomInt(min, max);
}

export function randomFloat(min, max) {
  return defaultGen.randomFloat(min, max);
}

export function noise(magnitude) {
  return defaultGen.noise(magnitude);
}

export function chance(p) {
  return defaultGen.chance(p);
}

export function weightedPick(weights) {
  return defaultGen.weightedPick(weights);
}

export function pickRandom(arr) {
  return defaultGen.pickRandom(arr);
}

// The environment stream — weather duration rolls (weather.js), price-drift
// noise (market.js), and fortune-card draws (decks.js) ONLY. Nothing that
// stems from a player's own choices should ever call these; see the module
// comment above for why that boundary is what keeps Daily Challenge fair.
export const envRandomInt = (min, max) => envGen.randomInt(min, max);
export const envRandomFloat = (min, max) => envGen.randomFloat(min, max);
export const envNoise = (magnitude) => envGen.noise(magnitude);
export const envChance = (p) => envGen.chance(p);
export const envWeightedPick = (weights) => envGen.weightedPick(weights);
export const envPickRandom = (arr) => envGen.pickRandom(arr);
