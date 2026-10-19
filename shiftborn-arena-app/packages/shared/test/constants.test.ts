import { describe, expect, it } from 'vitest';
import {
  AbilityId,
  AimSource,
  Cause,
  Controller,
  Form,
  Mode,
  Phase,
  WeaponId,
} from '../src/index.js';
import type { Form as FormType } from '../src/index.js';

describe('GR-2.2 GR-11.8 shared constants', () => {
  it('uses the exact form, phase and mode strings', () => {
    const runner: FormType = Form.Runner;
    expect(runner).toBe('runner');
    expect(Object.values(Form)).toEqual(['runner', 'beast', 'turret']);
    expect(Object.values(Phase)).toEqual(['COUNTDOWN', 'PLAYING', 'RESULTS']);
    expect(Object.values(Mode)).toEqual(['frenzy', 'zoneFrenzy']);
  });

  it('uses the documented ability, weapon and death cause strings', () => {
    expect(Object.values(AbilityId)).toEqual(['dash', 'ramCharge', 'railShot']);
    expect(Object.values(WeaponId)).toEqual([
      'pulsePistol',
      'scatterCannon',
      'railRepeater',
    ]);
    expect(Object.values(Cause)).toEqual([
      'pulsePistol',
      'scatterCannon',
      'railRepeater',
      'ramCharge',
      'railShot',
    ]);
  });

  it('includes bot and reserved input sources without adding gameplay states', () => {
    expect(Object.values(AimSource)).toEqual([
      'mouse',
      'keys',
      'lock',
      'bot',
      'touch',
      'pad',
    ]);
    expect(Object.values(Controller)).toEqual(['human', 'bot', 'proxy']);
  });
});
