import { BALANCE, displayDamage, displayHealth } from '../src/index.js';
import { describe, expect, it } from 'vitest';

describe('GR-6.8 presentation formulas', () => {
  it('AT-DMG-04 rounds living health up without changing its fraction', () => {
    const fraction = 0.0001;
    expect(displayHealth(fraction, BALANCE.forms.runner.maxHp, true)).toBe(1);
    expect(fraction).toBe(0.0001);
    expect(displayHealth(1, BALANCE.forms.runner.maxHp, true)).toBe(
      BALANCE.forms.runner.maxHp,
    );
    expect(displayHealth(0.5, BALANCE.forms.beast.maxHp, true)).toBe(70);
    expect(displayHealth(1e-12, BALANCE.forms.runner.maxHp, true)).toBe(1);
    expect(displayHealth(0, BALANCE.forms.runner.maxHp, true)).toBe(0);
    expect(displayHealth(0.5, BALANCE.forms.runner.maxHp, false)).toBe(0);
  });

  it('AT-DMG-04 rounds damage to a minimum of one', () => {
    expect(displayDamage(0.3)).toBe(1);
    expect(displayDamage(31.25)).toBe(31);
    expect(displayDamage(0)).toBe(1);
  });
});
