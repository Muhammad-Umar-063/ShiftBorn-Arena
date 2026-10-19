import { expect, it } from 'vitest';
import { BALANCE, DERIVED, Form, balanceHash } from '../src/index.js';

it('AT-DET-01 shared package exposes the balance and derived public API', () => {
  expect(BALANCE.version).toBe('proto-1');
  expect(DERIVED.tick.secondsPerTick).toBe(1 / BALANCE.tick.rateHz);
  expect(Form.Runner).toBe('runner');
  expect(balanceHash()).toBe(balanceHash(BALANCE));
});
