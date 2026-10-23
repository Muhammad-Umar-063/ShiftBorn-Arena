import { BALANCE, DERIVED, Form, WeaponId } from '@shiftborn/shared';
import type { Projectile } from '../../src/projectiles.js';

export function projectileRecord(id: number): Projectile {
  return {
    id,
    ownerId: 'fixture-owner',
    ownerName: 'Fixture Owner',
    ownerSeat: 0,
    ownerForm: Form.Runner,
    weapon: WeaponId.PulsePistol,
    pos: { x: 0, y: 0 },
    dir: { x: 1, y: 0 },
    angle: 0,
    speedMPerTick: DERIVED.weapons.pulsePistol.projSpeedMPerTick,
    radiusM: BALANCE.weapons.pulsePistol.projRadiusM,
    rangeM: BALANCE.weapons.pulsePistol.rangeM,
    traveledM: 0,
    baseDamage: BALANCE.weapons.pulsePistol.damage,
    spawnTick: 0,
    inputSeq: 1,
    shotIdx: 0,
    bounces: 0,
    damageMult: 1,
    landTick: 0,
    targetX: 0,
    targetY: 0,
  };
}
