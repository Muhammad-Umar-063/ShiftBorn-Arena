import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, pick, sfc32, shuffle } from '../src/rng.js';

describe('AT-DET-03 deterministic sfc32', () => {
  it('produces the same first 1,000 values and serializable state for the same seed pair', () => {
    const first = sfc32(12345, 7);
    const second = sfc32(12345, 7);
    const values = Array.from({ length: 1000 }, () => nextFloat(first));
    expect(values.slice(0, 5)).toEqual([
      0.7304366396274418, 0.3395155747421086, 0.25412045349366963,
      0.49862072919495404, 0.27816384215839207,
    ]);
    expect(values).toEqual(
      Array.from({ length: 1000 }, () => nextFloat(second)),
    );
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('changes sequence when either roomSeed or matchIndex changes', () => {
    const sequence = (roomSeed: number, matchIndex: number) => {
      const rng = sfc32(roomSeed, matchIndex);
      return Array.from({ length: 32 }, () => nextFloat(rng));
    };
    expect(sequence(100, 0)).not.toEqual(sequence(101, 0));
    expect(sequence(100, 0)).not.toEqual(sequence(100, 1));
  });

  it('rejects non-integer or unsafe seed components', () => {
    expect(() => sfc32(0.5, 0)).toThrow(/roomSeed/);
    expect(() => sfc32(0, Number.MAX_SAFE_INTEGER + 1)).toThrow(/matchIndex/);
  });

  it('nextInt stays in range and rejects invalid bounds', () => {
    const rng = sfc32(5, 0);
    expect(Array.from({ length: 100 }, () => nextInt(rng, 1))).toEqual(
      Array(100).fill(0),
    );
    expect(
      Array.from({ length: 1000 }, () => nextInt(rng, 7)).every(
        (value) => Number.isInteger(value) && value >= 0 && value < 7,
      ),
    ).toBe(true);
    const state = { ...rng };
    for (const bound of [
      0,
      -1,
      1.5,
      2 ** 32 + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => nextInt(rng, bound)).toThrow(/positive integer/);
    }
    expect(rng).toEqual(state);
  });

  it('shuffle mutates the same array deterministically and preserves a permutation', () => {
    const first = ['a', 'b', 'c', 'd', 'e'];
    const second = [...first];
    const returned = shuffle(sfc32(77, 1), first);
    shuffle(sfc32(77, 1), second);
    expect(returned).toBe(first);
    expect(first).toEqual(second);
    expect([...first].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('pick selects a member and rejects an empty array', () => {
    const rng = sfc32(4, 2);
    expect(['a', 'b', 'c']).toContain(pick(rng, ['a', 'b', 'c']));
    const state = { ...rng };
    expect(() => pick(rng, [])).toThrow(/non-empty/);
    expect(rng).toEqual(state);
  });
});
