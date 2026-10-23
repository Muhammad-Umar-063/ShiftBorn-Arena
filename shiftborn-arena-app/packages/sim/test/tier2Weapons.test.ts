import { BALANCE, DERIVED, GREYBOX_V1, Form, Phase, WeaponId, type Box, type GunId } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { advanceAllProjectiles, mortarLandingPoint, spawnProjectile } from '../src/projectiles.js';
import { segmentBoxContact } from '../src/math/geometry.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

function setup(walls: Box[] = []) {
  const world = makeTestWorld({ seed: 47, map: { ...TEST_OPEN, spawnPoints: GREYBOX_V1.spawnPoints,
    walls: [...TEST_OPEN.walls, ...walls.map((box, i) => ({ id: `wall${i}`, box }))] },
    players: [0, 1].map(seat => ({ id: `p${seat}`, name: `P${seat}`, seat, isBot: false })),
    unlockAllForms: true, armAllGuns: true });
  world.phase = Phase.Playing;
  const shooter = world.players[0]; const target = world.players[1];
  if (!shooter || !target) throw new Error('missing players');
  shooter.pos = { x: 0, y: 0 }; target.pos = { x: 25, y: -25 };
  shooter.protectedEndTick = target.protectedEndTick = 0;
  world.events.length = 0;
  return { world, shooter, target };
}

function finishShot(s: ReturnType<typeof setup>, gun: GunId, angle = 0) {
  const shot = spawnProjectile(s.world, s.shooter, gun, angle, 1, 0, 0);
  if (!shot) throw new Error('muzzle obstructed');
  for (let i = 0; s.world.projectiles.length && i < 100; i++) {
    s.world.tick++; advanceAllProjectiles(s.world);
  }
  expect(s.world.projectiles).toHaveLength(0);
  return shot;
}

describe('T-047 tier 2 contract', () => {
  it('AT-WPN-17 BALANCE §9.5 higher damage per attack and at least 10% burst DPS', () => {
    const w = BALANCE.weapons;
    const pairs = [
      [w.pulsePistol.damage, w.pulsePistol.ratePerS, w.ricochetDisc.damage, w.ricochetDisc.ratePerS],
      [w.scatterCannon.damagePerPellet * w.scatterCannon.pelletOffsetsDeg.length, w.scatterCannon.ratePerS, w.slugCannon.damage, w.slugCannon.ratePerS],
      [w.railRepeater.damage, w.railRepeater.ratePerS, w.arcMortar.damage, w.arcMortar.ratePerS],
    ];
    for (const [damage1 = 0, rate1 = 0, damage2 = 0, rate2 = 0] of pairs) {
      expect(damage2).toBeGreaterThan(damage1);
      expect(damage2 * rate2).toBeGreaterThanOrEqual(damage1 * rate1 * 1.1);
    }
  });

  it.each([
    [WeaponId.RicochetDisc, Form.Runner, Form.Runner, 4],
    [WeaponId.SlugCannon, Form.Beast, Form.Beast, 3],
    [WeaponId.ArcMortar, Form.Turret, Form.Beast, 2],
  ] as const)('AT-WPN-18 %s kills on the specified hit', (gun, attacker, defender, hits) => {
    const s = setup(); s.shooter.form = attacker; s.target.form = defender;
    s.target.pos = { x: 12, y: 0 }; s.shooter.aimDistM = 12;
    for (let hit = 1; hit <= hits; hit++) {
      finishShot(s, gun);
      expect(s.target.alive).toBe(hit < hits);
    }
  });

  it('AT-WPN-19 reflects 30° to 150°, uses remaining tick distance, deals 30 after bouncing', () => {
    const s = setup([[3, -10, 4, 10]]);
    const angle = Math.PI / 6;
    const shot = spawnProjectile(s.world, s.shooter, WeaponId.RicochetDisc, angle, 1, 0, 0);
    if (!shot) throw new Error('missing shot');
    while (shot.bounces === 0) { s.world.tick++; advanceAllProjectiles(s.world); }
    expect(shot.angle).toBeCloseTo(5 * Math.PI / 6, 10);
    expect(shot.traveledM).toBeCloseTo(s.world.tick * DERIVED.weapons.ricochetDisc.projSpeedMPerTick, 10);
    s.target.pos = { x: shot.pos.x + shot.dir.x, y: shot.pos.y + shot.dir.y };
    advanceAllProjectiles(s.world);
    expect(s.world.events.find(e => e.type === 'projectileHit')).toMatchObject({ damage: 30 });
    expect(s.world.events.filter(e => e.type === 'projectileBounce')).toHaveLength(1);
  });

  it('AT-WPN-19 corner reverses both axes; receding face does not collide', () => {
    expect(segmentBoxContact({ x: 0, y: 0 }, { x: 4, y: 4 }, [2, 2, 3, 3]))
      .toEqual({ t: 0.5, normalX: -1, normalY: -1 });
    expect(segmentBoxContact({ x: 2, y: 2 }, { x: 1, y: 1 }, [2, 2, 3, 3])).toBeNull();
    const s = setup([[3, 3, 4, 4]]);
    const shot = finishShot(s, WeaponId.RicochetDisc, Math.PI / 4);
    expect(shot.dir.x).toBeLessThan(0); expect(shot.dir.y).toBeLessThan(0);
    expect(shot.traveledM).toBe(20);
    expect(s.shooter.hpFrac).toBe(1);
  });

  it('AT-WPN-19 second wall destroys the disc; total path never exceeds 20 m', () => {
    const s = setup([[3, -10, 4, 10], [-3, -10, -2, 10]]);
    const shot = finishShot(s, WeaponId.RicochetDisc);
    expect(shot.bounces).toBe(1); expect(shot.traveledM).toBeLessThanOrEqual(20);
    expect(s.world.events.filter(e => e.type === 'projectileImpact')).toHaveLength(1);
  });

  it('AT-WPN-20 clamps landing distance and nudges out of wall and intact cover', () => {
    const s = setup([[11.8, -1, 12.2, 1]]);
    const landing = (distance: number) => mortarLandingPoint(s.world.map, s.world.cover, s.shooter.pos, 0, distance);
    expect(landing(5)).toEqual({ x: 8, y: 0 });
    expect(landing(30)).toEqual({ x: 20, y: 0 });
    expect(landing(12).x).toBeCloseTo(11.7, 8);
    expect(landing(12).y).toBe(0);
  });

  it.each([0, 2.5, 2.51])('AT-WPN-21 blast edge distance %s', edge => {
    const s = setup(); s.shooter.form = Form.Turret; s.target.form = Form.Turret;
    s.target.aim = 0; s.shooter.aimDistM = 12;
    s.target.pos = { x: 12 + (edge === 0 ? 0 : BALANCE.forms.turret.radiusM + edge), y: 0 };
    finishShot(s, WeaponId.ArcMortar);
    const hit = s.world.events.find(e => e.type === 'projectileHit');
    if (edge > 2.5) expect(hit).toBeUndefined();
    else expect(hit).toMatchObject({ damage: edge === 0 ? 75 : 37.5 });
  });

  it('AT-WPN-21 flight crosses walls, lands exactly after 30 ticks and blast is occluded', () => {
    const s = setup([[4, -5, 5, 5], [13, -5, 13.2, 5]]);
    s.shooter.form = Form.Turret; s.shooter.aimDistM = 12;
    s.target.pos = { x: 14, y: 0 };
    const shot = spawnProjectile(s.world, s.shooter, WeaponId.ArcMortar, 0, 1, 0, 0);
    expect(shot?.landTick).toBe(30);
    for (s.world.tick = 0; s.world.tick < 30; s.world.tick++) {
      advanceAllProjectiles(s.world); expect(s.world.projectiles).toHaveLength(1);
    }
    advanceAllProjectiles(s.world);
    expect(s.world.projectiles).toHaveLength(0);
    expect(s.world.events.find(e => e.type === 'mortarBlast')).toMatchObject({ x: 12, y: 0 });
    expect(s.target.hpFrac).toBe(1);
  });

  it('AT-WPN-21 blast excludes the owner and protects spawn shields', () => {
    const s = setup(); s.shooter.form = Form.Turret; s.shooter.aimDistM = 12;
    s.target.pos = { x: 12, y: 0 }; s.target.protectedEndTick = 100;
    spawnProjectile(s.world, s.shooter, WeaponId.ArcMortar, 0, 1, 0, 0);
    s.shooter.pos = { x: 12, y: 0 }; s.world.tick = 30; advanceAllProjectiles(s.world);
    expect(s.shooter.hpFrac).toBe(1); expect(s.target.hpFrac).toBe(1);
    expect(s.world.events.find(e => e.type === 'blocked')).toMatchObject({ targetSeat: 1 });
  });

  it('AT-WPN-22 Slug deals 50 at 11 m with no falloff and expires at 12 m', () => {
    const s = setup(); s.shooter.form = s.target.form = Form.Beast;
    s.target.pos = { x: 11, y: 0 };
    finishShot(s, WeaponId.SlugCannon);
    expect(s.world.events.find(e => e.type === 'projectileHit')).toMatchObject({ damage: 50 });
    s.target.pos = { x: 25, y: 0 };
    expect(finishShot(s, WeaponId.SlugCannon).traveledM).toBe(12);
    expect(s.world.events.find(e => e.type === 'projectileExpire')).toBeDefined();
  });
});
