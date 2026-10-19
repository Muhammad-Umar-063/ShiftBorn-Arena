import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  DERIVED,
  degreesToRadians,
  millisecondsToTicks,
  perSecondToPerTick,
  secondsToTicks,
  weaponIntervalS,
} from '../src/index.js';

describe('AT-DET-01 GR-1.4 D-046 derived human units', () => {
  it('rounds documented durations to whole ticks', () => {
    expect(secondsToTicks(0.5)).toBe(15);
    expect(secondsToTicks(0.15)).toBe(5);
    expect(secondsToTicks(0.4)).toBe(12);
    expect(secondsToTicks(0.6)).toBe(18);
    expect(secondsToTicks(3)).toBe(90);
    expect(secondsToTicks(45)).toBe(1350);

    expect(DERIVED.morph.durationTicks).toBe(15);
    expect(DERIVED.abilities.ramCharge.windupTicks).toBe(5);
    expect(DERIVED.abilities.ramCharge.wallStunTicks).toBe(12);
    expect(DERIVED.abilities.railShot.chargeTicks).toBe(18);
    expect(DERIVED.match.countdownTicks).toBe(90);
    expect(DERIVED.zoneFrenzy.moveEveryTicks).toBe(1350);
  });

  it('converts milliseconds and per-second values without duplicating balance', () => {
    expect(millisecondsToTicks(BALANCE.weapons.spawnAdvanceMaxMs)).toBe(3);
    expect(DERIVED.flux.regenPerTick).toBe(
      perSecondToPerTick(BALANCE.flux.regenPerS),
    );
  });

  it('caps Turret turning at four degrees per tick in radians', () => {
    expect(DERIVED.forms.turret.turnRateRadPerTick).toBeCloseTo(
      degreesToRadians(4),
      12,
    );
  });

  it('converts all Scatter Cannon offsets to radians in their original order', () => {
    expect(DERIVED.weapons.scatterCannon.pelletOffsetsRad).toEqual(
      BALANCE.weapons.scatterCannon.pelletOffsetsDeg.map(degreesToRadians),
    );
    expect(DERIVED.weapons.scatterCannon.pelletOffsetsRad).toEqual(
      [-12, -8, -4, 0, 4, 8, 12].map(degreesToRadians),
    );
  });

  it('uses one over rate for every weapon firing interval', () => {
    expect(DERIVED.weapons.pulsePistol.intervalS).toBe(
      weaponIntervalS(BALANCE.weapons.pulsePistol.ratePerS),
    );
    expect(DERIVED.weapons.scatterCannon.intervalS).toBe(
      weaponIntervalS(BALANCE.weapons.scatterCannon.ratePerS),
    );
    expect(DERIVED.weapons.railRepeater.intervalS).toBe(
      weaponIntervalS(BALANCE.weapons.railRepeater.ratePerS),
    );
  });
});
