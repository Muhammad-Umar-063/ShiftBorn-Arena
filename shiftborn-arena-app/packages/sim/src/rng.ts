export interface Rng {
  a: number;
  b: number;
  c: number;
  d: number;
}

const WORD_MASK = 0xffffffffn;
const WORD_RANGE = 0x1_0000_0000;

// SplitMix32 finalizer. These constants mix seed bits; they are not game balance.
function splitmix32(value: number): number {
  let mixed = (value + 0x9e3779b9) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function integerBits(value: number, name: string): readonly [number, number] {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer`);
  }
  const bits = BigInt(value);
  return [Number(bits & WORD_MASK), Number((bits >> 32n) & WORD_MASK)];
}

// GR-1.5: each seed component occupies its own 32-bit lanes before mixing.
// XOR domain constants keep the four lanes distinct. State is plain serializable data.
export function sfc32(roomSeed: number, matchIndex: number): Rng {
  const [roomLow, roomHigh] = integerBits(roomSeed, 'roomSeed');
  const [matchLow, matchHigh] = integerBits(matchIndex, 'matchIndex');
  return {
    a: splitmix32(roomLow ^ 0x243f6a88),
    b: splitmix32(roomHigh ^ 0x85a308d3),
    c: splitmix32(matchLow ^ 0x13198a2e),
    d: splitmix32(matchHigh ^ 0x03707344),
  };
}

// The canonical sfc32 transition returns a float in [0, 1).
export function nextFloat(rng: Rng): number {
  let result = (rng.a + rng.b) >>> 0;
  rng.a = (rng.b ^ (rng.b >>> 9)) >>> 0;
  rng.b = (rng.c + (rng.c << 3)) >>> 0;
  rng.c = ((rng.c << 21) | (rng.c >>> 11)) >>> 0;
  rng.d = (rng.d + 1) >>> 0;
  result = (result + rng.d) >>> 0;
  rng.c = (rng.c + result) >>> 0;
  return result / WORD_RANGE;
}

// Rejection sampling avoids modulo bias for every supported bound.
export function nextInt(rng: Rng, n: number): number {
  if (!Number.isSafeInteger(n) || n < 1 || n > WORD_RANGE) {
    throw new RangeError(
      'nextInt bound must be a positive integer at most 2^32',
    );
  }
  const limit = Math.floor(WORD_RANGE / n) * n;
  let sample: number;
  do {
    sample = Math.floor(nextFloat(rng) * WORD_RANGE);
  } while (sample >= limit);
  return sample % n;
}

// Fisher-Yates mutates the supplied array and returns that same array.
export function shuffle<T>(rng: Rng, array: T[]): T[] {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const otherIndex = nextInt(rng, index + 1);
    // Both indexes are within array bounds, including when T itself is undefined.
    const current = array[index] as T;
    array[index] = array[otherIndex] as T;
    array[otherIndex] = current;
  }
  return array;
}

export function pick<T>(rng: Rng, array: readonly T[]): T {
  if (array.length === 0) {
    throw new RangeError('pick requires a non-empty array');
  }
  // nextInt returns an index within the non-empty array.
  return array[nextInt(rng, array.length)] as T;
}
