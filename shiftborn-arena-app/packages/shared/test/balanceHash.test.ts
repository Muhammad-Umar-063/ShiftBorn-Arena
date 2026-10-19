import { describe, expect, it } from 'vitest';
import { BALANCE, balanceHash } from '../src/index.js';

describe('AT-DET-02 canonical balance hash', () => {
  it('is stable across repeated calls and the default balance', () => {
    const first = balanceHash();
    expect(balanceHash()).toBe(first);
    expect(balanceHash(BALANCE)).toBe(first);
  });

  it('ignores object key insertion order at every depth', () => {
    expect(balanceHash({ a: 1, nested: { x: 2, y: 3 } })).toBe(
      balanceHash({ nested: { y: 3, x: 2 }, a: 1 }),
    );
  });

  it('preserves array order', () => {
    expect(balanceHash({ values: [1, 2] })).not.toBe(
      balanceHash({ values: [2, 1] }),
    );
  });

  it('changes when a nested balance value changes', () => {
    const modified = {
      ...BALANCE,
      abilities: {
        ...BALANCE.abilities,
        railShot: {
          ...BALANCE.abilities.railShot,
          damage: BALANCE.abilities.railShot.damage + 1,
        },
      },
    };
    expect(balanceHash(modified)).not.toBe(balanceHash(BALANCE));
  });
});
