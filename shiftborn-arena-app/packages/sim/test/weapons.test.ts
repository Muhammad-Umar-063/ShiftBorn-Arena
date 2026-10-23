import {
  AimSource,
  BALANCE,
  Controller,
  DERIVED,
  Form,
  GREYBOX_V1,
  InputButton,
  GUN_FORM,
  GUN_IDS,
  GUN_TIER,
  Phase,
  WeaponId,
  gunFor,
  type InputFrame,
  type MapData,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { advancePhase, startMatch } from '../src/match.js';
import { removePlayer } from '../src/player.js';
import {
  advanceAllProjectiles,
  advanceProjectile,
  clearProjectiles,
  fireProjectiles,
  removeOwnedProjectiles,
  spawnProjectile,
} from '../src/projectiles.js';
import { step } from '../src/step.js';
import {
  advanceTurretHeat,
  advanceGunTimers,
  canFireGun,
  railDistanceMul,
  scatterAngles,
  scatterDistanceMul,
} from '../src/weaponRules.js';
import { startDash } from '../src/ability.js';
import { zeroGunTimers } from '../src/loadout.js';
import type { PlayerRecord, World } from '../src/world.js';
import { makeTestWorld, tier1Gun } from './fixtures/makeTestWorld.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

const openMap: MapData = { ...TEST_OPEN, spawnPoints: GREYBOX_V1.spawnPoints };
const shooterSpec = { id: 'shooter', name: 'Shooter', seat: 0, isBot: false };
const targetSpec = { id: 'target', name: 'Target', seat: 1, isBot: false };
const twoPlayers = [shooterSpec, targetSpec];

function setup(players = twoPlayers, map: MapData = openMap) {
  const world = makeTestWorld({
    seed: 16, map, players, unlockAllForms: true, armAllGuns: true,
  });
  world.phase = Phase.Playing;
  world.phaseEndTick = world.tick + DERIVED.match.durationTicks;
  world.events.length = 0;
  for (const player of world.players)
    if (player !== null) player.protectedEndTick = world.tick;
  const shooter = world.players[0];
  if (shooter === null || shooter === undefined)
    throw new Error('missing shooter');
  shooter.pos = { x: 0, y: 0 };
  return { world, shooter };
}

function frame(seq: number, buttons = 0, aim = 0): InputFrame {
  return { aimDist: 120, seq, moveX: 0, moveY: 0, aim, buttons, aimSource: AimSource.Mouse };
}

function tick(world: World, buttons = 0, aim = 0, context = {}) {
  return step(world, [frame(world.tick + 1, buttons, aim)], context);
}

function target(world: World): PlayerRecord {
  const player = world.players[1];
  if (player === null || player === undefined)
    throw new Error('missing target');
  return player;
}

describe('GR-7 pure weapon rules', () => {
  it('GR-7.1 GR-7.25 maps each form to its tier 1 and tier 2 guns and exact Scatter angles', () => {
    expect(gunFor(Form.Runner, 1)).toBe(WeaponId.PulsePistol);
    expect(gunFor(Form.Runner, 2)).toBe(WeaponId.RicochetDisc);
    expect(gunFor(Form.Beast, 1)).toBe(WeaponId.ScatterCannon);
    expect(gunFor(Form.Beast, 2)).toBe(WeaponId.SlugCannon);
    expect(gunFor(Form.Turret, 1)).toBe(WeaponId.RailRepeater);
    expect(gunFor(Form.Turret, 2)).toBe(WeaponId.ArcMortar);
    for (const gun of GUN_IDS) expect(gunFor(GUN_FORM[gun], GUN_TIER[gun])).toBe(gun);
    expect(scatterAngles(0)).toEqual(
      DERIVED.weapons.scatterCannon.pelletOffsetsRad,
    );
    expect(scatterAngles(1)).toEqual(
      DERIVED.weapons.scatterCannon.pelletOffsetsRad.map(
        (offset) => 1 + offset,
      ),
    );
  });

  it('AT-WPN-03 GR-7.2 advances inactive timers and prevents banking after release', () => {
    const timers = {
      ...zeroGunTimers(),
      pulsePistol: DERIVED.weapons.pulsePistol.intervalS,
      scatterCannon: DERIVED.weapons.scatterCannon.intervalS,
      railRepeater: DERIVED.weapons.railRepeater.intervalS,
    };
    const before = structuredClone(timers);
    const advanced = advanceGunTimers(timers, WeaponId.PulsePistol, true, true);
    expect(timers).toEqual(before);
    expect(advanced.fired).toBe(false);
    expect(advanced.timers.scatterCannon).toBe(
      timers.scatterCannon - DERIVED.tick.secondsPerTick,
    );
    let state = advanced.timers;
    for (let count = 0; count < 2 * BALANCE.tick.rateHz; count += 1)
      state = advanceGunTimers(state, WeaponId.PulsePistol, false, true).timers;
    expect(state.pulsePistol).toBe(0);
    const pressed = advanceGunTimers(state, WeaponId.PulsePistol, true, true);
    expect(pressed.fired).toBe(true);
    expect(
      advanceGunTimers(pressed.timers, WeaponId.PulsePistol, true, true).fired,
    ).toBe(false);
    expect(advanceGunTimers(state, null, true, true).fired).toBe(false);
  });

  it('AT-WPN-08 GR-7.11 and AT-WPN-09 GR-7.13 apply exact distance boundaries', () => {
    const scatter = BALANCE.weapons.scatterCannon;
    expect(scatter.damagePerPellet * scatterDistanceMul(3)).toBe(5);
    expect(scatter.damagePerPellet * scatterDistanceMul(6.5)).toBe(3.75);
    expect(scatter.damagePerPellet * scatterDistanceMul(scatter.rangeM)).toBe(
      2.5,
    );
    expect(BALANCE.weapons.railRepeater.damage * railDistanceMul(3)).toBe(8);
    expect(BALANCE.weapons.railRepeater.damage * railDistanceMul(4)).toBe(16);
    expect(BALANCE.weapons.railRepeater.damage * railDistanceMul(5)).toBe(16);
  });

  it('AT-WPN-10/11 GR-7.14 overheats on held tick 210 and cools 3 s in 1.5 s', () => {
    let state = { heat: 0, overheatEndTick: 0, overheated: false };
    for (
      let tickIndex = 0;
      tickIndex < DERIVED.weapons.railRepeater.heatMaxTicks;
      tickIndex += 1
    ) {
      state = advanceTurretHeat(
        state.heat,
        state.overheatEndTick,
        tickIndex,
        true,
      );
      expect(state.overheated).toBe(
        tickIndex === DERIVED.weapons.railRepeater.heatMaxTicks - 1,
      );
    }
    expect(state.heat).toBe(0);
    expect(state.overheatEndTick).toBe(
      DERIVED.weapons.railRepeater.heatMaxTicks +
        DERIVED.weapons.railRepeater.overheatTicks,
    );
    let cooling = {
      heat: BALANCE.weapons.railRepeater.heatMaxS - 4,
      overheatEndTick: 0,
      overheated: false,
    };
    for (let i = 0; i < BALANCE.tick.rateHz * 1.5; i += 1)
      cooling = advanceTurretHeat(
        cooling.heat,
        cooling.overheatEndTick,
        i,
        false,
      );
    expect(cooling.heat).toBe(0);
  });

  it('AT-WPN-12 GR-7.3 blocks abilities, status, ammunition and commitments but ignores knockback', () => {
    const { shooter } = setup();
    expect(canFireGun(shooter, Phase.Playing, 0)).toBe(WeaponId.PulsePistol);
    shooter.ability = startDash(0, { x: 1, y: 0 });
    expect(canFireGun(shooter, Phase.Playing, 0)).toBeNull();
    shooter.ability = null;
    shooter.knockback = { vel: { x: 1, y: 0 }, endTick: 10 };
    expect(canFireGun(shooter, Phase.Playing, 0)).toBe(WeaponId.PulsePistol);
    shooter.stunEndTick = 1;
    expect(canFireGun(shooter, Phase.Playing, 0)).toBeNull();
    expect(canFireGun(shooter, Phase.Playing, 1)).toBe(WeaponId.PulsePistol);
    shooter.morph = { target: Form.Beast, endTick: 10 };
    expect(canFireGun(shooter, Phase.Playing, 1)).toBeNull();
    shooter.morph = null;
    shooter.alive = false;
    expect(canFireGun(shooter, Phase.Playing, 1)).toBeNull();
    shooter.alive = true;
    expect(canFireGun(shooter, Phase.Countdown, 1)).toBeNull();
    expect(canFireGun(shooter, Phase.Results, 1)).toBeNull();
    shooter.reload = { gun: WeaponId.PulsePistol, endTick: 50 };
    expect(canFireGun(shooter, Phase.Playing, 1)).toBeNull();
    shooter.reload = null;
    shooter.swapReadyTick = 5;
    expect(canFireGun(shooter, Phase.Playing, 4)).toBeNull();
    expect(canFireGun(shooter, Phase.Playing, 5)).toBe(WeaponId.PulsePistol);
    shooter.melee = { startTick: 5, strikeTick: 8, endTick: 23 };
    expect(canFireGun(shooter, Phase.Playing, 22)).toBeNull();
    expect(canFireGun(shooter, Phase.Playing, 23)).toBe(WeaponId.PulsePistol);
    shooter.melee = null;
    shooter.guns.pulsePistol.mag = 0;
    expect(canFireGun(shooter, Phase.Playing, 23)).toBeNull();
    shooter.selectedTier.runner = 0;
    expect(canFireGun(shooter, Phase.Playing, 23)).toBeNull();
    shooter.form = Form.Turret;
    shooter.overheatEndTick = 30;
    expect(canFireGun(shooter, Phase.Playing, 29)).toBeNull();
    expect(canFireGun(shooter, Phase.Playing, 30)).toBe(WeaponId.RailRepeater);
    shooter.selectedTier.turret = 2;
    expect(canFireGun(shooter, Phase.Playing, 29)).toBe(WeaponId.ArcMortar);
  });
});

describe('GR-7 firing and projectile simulation', () => {
  it('AT-WPN-01 D-076 fires one 20-round magazine exactly 5 ticks apart, then reloads', () => {
    const { world, shooter } = setup([shooterSpec]);
    const magazine = BALANCE.weapons.pulsePistol.magazine;
    const spawnTicks: number[] = [];
    let reloadStart = -1;
    for (let index = 0; index < 150; index += 1) {
      const events = tick(world, InputButton.Fire);
      for (const event of events) {
        if (event.type === 'projectileSpawn') spawnTicks.push(event.spawnTick);
        if (event.type === 'reloadStart' && reloadStart < 0) reloadStart = world.tick - 1;
      }
    }
    // GR-7.2: the -dt floor credits the first shot one tick, then 5 ticks each.
    expect(spawnTicks.slice(0, magazine).map((value, index) =>
      index === 0 ? 0 : value - (spawnTicks[index - 1] ?? 0))).toEqual(
      [0, 4, ...Array.from({ length: magazine - 2 }, () => 5)]);
    expect(reloadStart).toBe((spawnTicks[magazine - 1] ?? -1));
    expect(spawnTicks[magazine]).toBe(
      reloadStart + DERIVED.weapons.pulsePistol.reloadTicks);
    expect(shooter.guns.pulsePistol.reserve).toBe(
      BALANCE.weapons.pulsePistol.reserveMax - magazine);
  });

  it('AT-WPN-02 fires 14 or 15 Rail bolts in 120 held ticks', () => {
    const { world, shooter } = setup([shooterSpec]);
    shooter.form = Form.Turret;
    for (let index = 0; index < 120; index += 1) tick(world, InputButton.Fire);
    expect([14, 15]).toContain(world.nextProjectileId);
  });

  it('AT-WPN-03 represses immediately after two seconds and observes the interval', () => {
    const { world } = setup([shooterSpec]);
    tick(world, InputButton.Fire);
    for (let count = 0; count < 2 * BALANCE.tick.rateHz; count += 1)
      tick(world);
    expect(world.nextProjectileId).toBe(1);
    tick(world, InputButton.Fire);
    expect(world.nextProjectileId).toBe(2);
    for (
      let count = 0;
      count < BALANCE.tick.rateHz / BALANCE.weapons.pulsePistol.ratePerS - 1;
      count += 1
    )
      tick(world, InputButton.Fire);
    expect(world.nextProjectileId).toBe(3);
  });

  it('AT-WPN-04 expires at exactly 14 m and keeps travel capped', () => {
    const { world, shooter } = setup([shooterSpec]);
    const projectile = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    if (projectile === null) throw new Error('unexpected muzzle impact');
    expect(advanceProjectile(world, projectile)).toBe(true);
    while (world.projectiles.length > 0) advanceAllProjectiles(world);
    expect(projectile.traveledM).toBeCloseTo(
      BALANCE.weapons.pulsePistol.rangeM,
      10,
    );
    expect(world.events.at(-1)).toEqual({
      type: 'projectileExpire',
      id: projectile.id,
    });
  });

  it('AT-WPN-05 AT-WPN-06 impacts at the wall face and immediately at an overlapping muzzle', () => {
    const wallMap: MapData = {
      ...openMap,
      walls: [{ id: 'near', box: [3, -5, 4, 5] }],
    };
    const { world, shooter } = setup([shooterSpec], wallMap);
    const first = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    if (first === null) throw new Error('unexpected muzzle impact');
    advanceAllProjectiles(world);
    advanceAllProjectiles(world);
    expect(world.events.at(-1)).toEqual({
      type: 'projectileImpact',
      id: first.id,
      x: 3,
      y: 0,
    });
    shooter.pos = { x: 3 - BALANCE.forms.runner.radiusM, y: 0 };
    const second = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 2, 0, 0);
    expect(second).toBeNull();
    expect(world.events.slice(-2).map((event) => event.type)).toEqual([
      'projectileSpawn',
      'projectileImpact',
    ]);
    expect(world.projectiles).toEqual([]);
  });

  it('AT-WPN-07 creates seven ordered Scatter pellets without RNG', () => {
    const { world, shooter } = setup([shooterSpec]);
    shooter.form = Form.Beast;
    const rngBefore = structuredClone(world.rng);
    const fired = fireProjectiles(world, shooter, tier1Gun(shooter.form), 17, 0, 0);
    expect(fired).toHaveLength(
      DERIVED.weapons.scatterCannon.pelletOffsetsRad.length,
    );
    expect(fired.map((projectile) => projectile.angle)).toEqual(
      DERIVED.weapons.scatterCannon.pelletOffsetsRad,
    );
    expect(fired.map((projectile) => projectile.id)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(fired.map((projectile) => projectile.shotIdx)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(world.rng).toEqual(rngBefore);
  });

  it('GR-7.4 ends protection on a fired muzzle-impact shot', () => {
    const wallMap: MapData = {
      ...openMap,
      walls: [{ id: 'near', box: [3, -5, 4, 5] }],
    };
    const { world, shooter } = setup([shooterSpec], wallMap);
    shooter.pos = { x: 3 - BALANCE.forms.runner.radiusM, y: 0 };
    shooter.protectedEndTick = 100;
    tick(world, InputButton.Fire);
    expect(shooter.protectedEndTick).toBe(0);
    expect(world.projectiles).toEqual([]);
  });

  it('AT-WPN-10 blocks Rail firing for overheat and resumes at the end tick', () => {
    const { world, shooter } = setup([shooterSpec]);
    shooter.form = Form.Turret;
    let overheatCount = 0;
    for (
      let count = 0;
      count < DERIVED.weapons.railRepeater.heatMaxTicks;
      count += 1
    )
      overheatCount += tick(world, InputButton.Fire).filter(
        (event) => event.type === 'overheat',
      ).length;
    expect(overheatCount).toBe(1);
    const overheat = world.events.find((event) => event.type === 'overheat');
    expect(overheat).toEqual({
      type: 'overheat',
      seat: 0,
      endTick:
        DERIVED.weapons.railRepeater.heatMaxTicks +
        DERIVED.weapons.railRepeater.overheatTicks,
    });
    expect(shooter.heat).toBe(0);
    const count = world.nextProjectileId;
    for (
      let blocked = 0;
      blocked < DERIVED.weapons.railRepeater.overheatTicks;
      blocked += 1
    )
      overheatCount += tick(world, InputButton.Fire).filter(
        (event) => event.type === 'overheat',
      ).length;
    expect(world.nextProjectileId).toBe(count);
    expect(overheatCount).toBe(1);
    tick(world, InputButton.Fire);
    expect(world.nextProjectileId).toBeGreaterThan(count);
  });

  it('AT-WPN-11 cools accumulated heat while in another form', () => {
    const { world, shooter } = setup([shooterSpec]);
    shooter.form = Form.Turret;
    for (let count = 0; count < 3 * BALANCE.tick.rateHz; count += 1)
      tick(world, InputButton.Fire);
    expect(shooter.heat).toBeCloseTo(3, 12);
    shooter.form = Form.Runner;
    const overheatEndTick = shooter.overheatEndTick;
    for (let count = 0; count < BALANCE.tick.rateHz * 1.5; count += 1)
      tick(world);
    expect(shooter.heat).toBe(0);
    expect(shooter.overheatEndTick).toBe(overheatEndTick);
  });

  it('GR-7.1 OQ-015 allocates shot indexes in firing order for a repeated input sequence', () => {
    const { world } = setup([shooterSpec]);
    const repeated = frame(1, InputButton.Fire);
    const spawns = [];
    for (
      let count = 0;
      count < BALANCE.tick.rateHz / BALANCE.weapons.pulsePistol.ratePerS + 1;
      count += 1
    )
      spawns.push(
        ...step(world, [repeated], {}).filter(
          (event) => event.type === 'projectileSpawn',
        ),
      );
    expect(spawns).toMatchObject([
      { inputSeq: 1, shotIdx: 0 },
      { inputSeq: 1, shotIdx: 1 },
    ]);
    for (
      let count = 0;
      count < BALANCE.tick.rateHz / BALANCE.weapons.pulsePistol.ratePerS;
      count += 1
    )
      spawns.push(
        ...step(world, [frame(2, InputButton.Fire)], {}).filter(
          (event) => event.type === 'projectileSpawn',
        ),
      );
    expect(spawns.at(-1)).toMatchObject({ inputSeq: 2, shotIdx: 0 });
  });

  it('AT-WPN-12 actual morph, stun, COUNTDOWN, RESULTS block fire; knockback permits it', () => {
    const { world, shooter } = setup([shooterSpec]);
    shooter.flux = BALANCE.morph.costBeast;
    expect(
      tick(world, InputButton.Fire | InputButton.MorphBeast).some(
        (event) => event.type === 'projectileSpawn',
      ),
    ).toBe(false);
    expect(shooter.morph).not.toBeNull();
    tick(world, InputButton.Fire);
    expect(world.nextProjectileId).toBe(0);
    shooter.morph = null;
    shooter.stunEndTick = world.tick + 1;
    tick(world, InputButton.Fire);
    expect(world.nextProjectileId).toBe(0);
    shooter.knockback = { vel: { x: 0, y: 0 }, endTick: world.tick + 10 };
    tick(world, InputButton.Fire);
    expect(world.nextProjectileId).toBe(1);
    world.phase = Phase.Countdown;
    world.phaseEndTick = world.tick + 10;
    tick(world, InputButton.Fire);
    expect(world.nextProjectileId).toBe(1);
    world.phase = Phase.Results;
    world.phaseEndTick = world.tick + 10;
    tick(world, InputButton.Fire);
    expect(world.nextProjectileId).toBe(1);
  });
});

describe('GR-7 projectile contacts and lifecycle', () => {
  it('GR-7.6 chooses a wall over an equal player contact', () => {
    const map: MapData = {
      ...openMap,
      walls: [{ id: 'tie', box: [3, -1, 4, 1] }],
    };
    const { world, shooter } = setup(twoPlayers, map);
    target(world).pos = { x: 3 + BALANCE.forms.runner.radiusM, y: 0 };
    const projectile = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    if (projectile === null) throw new Error('missing projectile');
    advanceAllProjectiles(world);
    advanceAllProjectiles(world);
    expect(world.events.at(-1)?.type).toBe('projectileImpact');
    expect(target(world).hpFrac).toBe(1);
  });

  it('GR-7.7 blocks a protected target without applying damage', () => {
    const { world, shooter } = setup();
    target(world).pos = { x: 3, y: 0 };
    target(world).protectedEndTick = 100;
    const projectile = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    if (projectile === null) throw new Error('missing projectile');
    advanceAllProjectiles(world);
    advanceAllProjectiles(world);
    expect(world.events.at(-1)).toEqual({
      type: 'blocked',
      id: projectile.id,
      targetSeat: 1,
    });
    expect(world.events.some((event) => event.type === 'damage')).toBe(false);
    expect(target(world).hpFrac).toBe(1);
  });

  it('GR-14.1 intact cover blocks and destroyed cover does not', () => {
    const map: MapData = {
      ...openMap,
      cover: [{ id: 'cover', box: [3, -1, 4, 1] }],
    };
    const { world, shooter } = setup(twoPlayers, map);
    target(world).pos = { x: 6, y: 0 };
    const first = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    if (first === null) throw new Error('missing projectile');
    while (world.projectiles.length > 0) advanceAllProjectiles(world);
    expect(world.events.at(-1)?.type).toBe('projectileImpact');
    expect(target(world).hpFrac).toBe(1);
    const cover = world.cover[0];
    if (cover === undefined) throw new Error('missing cover');
    cover.intact = false;
    const second = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 2, 0, 0);
    if (second === null) throw new Error('missing projectile');
    while (world.projectiles.length > 0) advanceAllProjectiles(world);
    expect(world.events.at(-1)?.type).toBe('projectileHit');
    expect(target(world).hpFrac).toBeLessThan(1);
  });

  it('GR-7.6 excludes the owner, dead players, and selects the lower seat on equal contact', () => {
    const participants = [
      ...twoPlayers,
      { id: 'third', name: 'Third', seat: 2, isBot: false },
    ];
    const { world, shooter } = setup(participants);
    const first = target(world);
    const second = world.players[2];
    if (second === null || second === undefined)
      throw new Error('missing player');
    first.pos = { x: 4, y: 0 };
    second.pos = { x: 4, y: 0 };
    const projectile = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    if (projectile === null) throw new Error('missing projectile');
    while (world.projectiles.length > 0) advanceAllProjectiles(world);
    expect(first.hpFrac).toBeLessThan(1);
    expect(second.hpFrac).toBe(1);
    first.alive = false;
    const next = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 2, 0, 0);
    if (next === null) throw new Error('missing projectile');
    while (world.projectiles.length > 0) advanceAllProjectiles(world);
    expect(second.hpFrac).toBeLessThan(1);
  });

  it('AT-WPN-13 GR-7.8 preserves firing form and projectile after owner death, and removes it on leave', () => {
    const { world, shooter } = setup();
    target(world).form = Form.Turret;
    target(world).pos = { x: 4, y: 0 };
    const first = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    if (first === null) throw new Error('missing projectile');
    shooter.form = Form.Beast;
    shooter.alive = false;
    while (world.projectiles.length > 0) advanceAllProjectiles(world);
    const hit = world.events.find((event) => event.type === 'projectileHit');
    expect(hit).toMatchObject({
      damage:
        BALANCE.weapons.pulsePistol.damage * BALANCE.matchup.runner.turret,
    });
    expect(world.events.find((event) => event.type === 'damage')).toMatchObject(
      { attackerForm: Form.Runner },
    );
    const second = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 2, 0, 0);
    if (second === null) throw new Error('missing projectile');
    expect(world.projectiles).toHaveLength(1);
    removePlayer(world, shooter.id);
    expect(world.projectiles).toEqual([]);
    expect(world.projectilePool).toContain(second);
  });

  it('GR-7.12 lets several Scatter pellets damage one surviving player', () => {
    const { world, shooter } = setup();
    shooter.form = Form.Beast;
    target(world).form = Form.Beast;
    target(world).pos = { x: 3, y: 0 };
    fireProjectiles(world, shooter, tier1Gun(shooter.form), 1, 0, 0);
    while (world.projectiles.length > 0) advanceAllProjectiles(world);
    expect(
      world.events.filter((event) => event.type === 'projectileHit'),
    ).toHaveLength(7);
    expect(target(world).damageLog).toHaveLength(7);
    expect(target(world).hpFrac).toBeCloseTo(
      1 -
        (7 * BALANCE.weapons.scatterCannon.damagePerPellet) /
          BALANCE.forms.beast.maxHp,
      12,
    );
  });

  it('AT-WPN-08/09 applies Scatter falloff and Rail arming at swept contact distance', () => {
    function hitDamage(
      form: Form,
      distanceM: number,
    ): { damage: number; traveled: number } {
      const { world, shooter } = setup();
      shooter.form = form;
      const projectile = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
      if (projectile === null) throw new Error('missing projectile');
      const victim = target(world);
      victim.pos = {
        x:
          projectile.pos.x +
          distanceM +
          BALANCE.forms.runner.radiusM +
          projectile.radiusM,
        y: 0,
      };
      while (world.projectiles.length > 0) advanceAllProjectiles(world);
      const hit = world.events.find((event) => event.type === 'projectileHit');
      if (hit?.type !== 'projectileHit') throw new Error('missing hit');
      return { damage: hit.damage, traveled: projectile.traveledM };
    }
    for (const [distance, expected] of [
      [3, 5],
      [6.5, 3.75],
      [9, 2.5],
    ] as const) {
      const hit = hitDamage(Form.Beast, distance);
      expect(hit.traveled).toBeCloseTo(distance, 10);
      expect(hit.damage / BALANCE.matchup.beast.runner).toBeCloseTo(
        expected,
        10,
      );
    }
    for (const [distance, expected] of [
      [3, 8],
      [4, 16],
      [5, 16],
    ] as const) {
      const hit = hitDamage(Form.Turret, distance);
      expect(hit.traveled).toBeCloseTo(distance, 10);
      expect(hit.damage).toBe(expected);
    }
  });

  it('GR-7.6 exact range endpoint collision wins over expiry', () => {
    const { world, shooter } = setup();
    const projectile = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    if (projectile === null) throw new Error('missing projectile');
    const victim = target(world);
    victim.pos = {
      x:
        projectile.pos.x +
        projectile.rangeM +
        BALANCE.forms.runner.radiusM +
        projectile.radiusM,
      y: 0,
    };
    while (world.projectiles.length > 0) advanceAllProjectiles(world);
    expect(world.events.at(-1)?.type).toBe('projectileHit');
  });

  it('AT-WPN-14 advances a human exactly three steps with checks and never advances a bot', () => {
    const { world } = setup([shooterSpec]);
    const input = Object.freeze(frame(1, InputButton.Fire));
    const advance = Object.freeze([DERIVED.weapons.spawnAdvanceMaxTicks]);
    const context = Object.freeze({ spawnAdvanceTicksBySeat: advance });
    const events = step(world, [input], context);
    expect(
      events.find((event) => event.type === 'projectileSpawn'),
    ).toMatchObject({
      x: BALANCE.forms.runner.radiusM + BALANCE.weapons.muzzleExtraM,
      advancedTicks: DERIVED.weapons.spawnAdvanceMaxTicks,
      inputSeq: 1,
      shotIdx: 0,
    });
    expect(world.projectiles[0]?.traveledM).toBeCloseTo(
      (DERIVED.weapons.spawnAdvanceMaxTicks + 1) *
        DERIVED.weapons.pulsePistol.projSpeedMPerTick,
      12,
    );
    expect(input).toEqual(frame(1, InputButton.Fire));
    expect(context.spawnAdvanceTicksBySeat).toEqual(advance);
    const wallMap: MapData = {
      ...openMap,
      walls: [{ id: 'advance-wall', box: [3, -1, 4, 1] }],
    };
    const blocked = setup([shooterSpec], wallMap);
    const wallEvents = step(
      blocked.world,
      [frame(1, InputButton.Fire)],
      context,
    );
    expect(wallEvents.some((event) => event.type === 'projectileImpact')).toBe(
      true,
    );
    expect(blocked.world.projectiles).toEqual([]);
    const bot = setup([{ ...shooterSpec, isBot: true }]);
    step(bot.world, [frame(1, InputButton.Fire)], context);
    expect(bot.world.projectiles[0]?.traveledM).toBe(
      DERIVED.weapons.pulsePistol.projSpeedMPerTick,
    );
    const proxy = setup([shooterSpec]);
    proxy.shooter.controller = Controller.Proxy;
    step(proxy.world, [frame(1, InputButton.Fire)], context);
    expect(proxy.world.projectiles[0]?.traveledM).toBe(
      DERIVED.weapons.pulsePistol.projSpeedMPerTick,
    );
    const capped = setup([shooterSpec]);
    step(capped.world, [frame(1, InputButton.Fire)], {
      spawnAdvanceTicksBySeat: [DERIVED.weapons.spawnAdvanceMaxTicks + 10],
    });
    expect(capped.world.projectiles[0]?.traveledM).toBe(
      (DERIVED.weapons.spawnAdvanceMaxTicks + 1) *
        DERIVED.weapons.pulsePistol.projSpeedMPerTick,
    );
  });

  it('GR-7.9 spawns both valid shots before advanced damage resolves', () => {
    const { world, shooter } = setup();
    const victim = target(world);
    shooter.pos = { x: -1, y: 0 };
    victim.pos = { x: 1, y: 0 };
    shooter.hpFrac =
      BALANCE.weapons.pulsePistol.damage / BALANCE.forms.runner.maxHp;
    victim.hpFrac = shooter.hpFrac;
    const events = step(
      world,
      [frame(1, InputButton.Fire), frame(1, InputButton.Fire, 32768)],
      {
        spawnAdvanceTicksBySeat: [
          DERIVED.weapons.spawnAdvanceMaxTicks,
          DERIVED.weapons.spawnAdvanceMaxTicks,
        ],
      },
    );
    expect(
      events.filter((event) => event.type === 'projectileSpawn'),
    ).toHaveLength(2);
    expect(shooter.alive).toBe(false);
    expect(victim.alive).toBe(false);
  });

  it('GR-7.5 pool reuse overwrites stale data and active ids remain ordered', () => {
    const { world, shooter } = setup([shooterSpec]);
    const first = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    if (first === null) throw new Error('missing projectile');
    first.traveledM = 10;
    clearProjectiles(world);
    expect(world.projectilePool).toHaveLength(1);
    shooter.form = Form.Turret;
    shooter.pos = { x: 2, y: 2 };
    const second = spawnProjectile(world, shooter, tier1Gun(shooter.form), Math.PI / 2, 2, 4, 0);
    if (second === null) throw new Error('missing projectile');
    expect(second).toBe(first);
    expect(second).toMatchObject({
      id: 1,
      ownerForm: Form.Turret,
      traveledM: 0,
      inputSeq: 2,
      shotIdx: 4,
    });
    expect(second.pos.x).toBeCloseTo(2, 12);
    expect(second.dir.y).toBe(1);
    const third = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 2, 5, 0);
    if (third === null) throw new Error('missing projectile');
    expect(world.projectiles.map((projectile) => projectile.id)).toEqual([
      1, 2,
    ]);
    removeOwnedProjectiles(world, shooter.id);
    expect(world.projectiles).toEqual([]);
  });

  it('GR-2.7 match transition clears active projectiles without resetting id', () => {
    const { world, shooter } = setup([shooterSpec]);
    spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    const nextId = world.nextProjectileId;
    world.tick = world.phaseEndTick;
    advancePhase(world);
    expect(world.phase).toBe(Phase.Results);
    expect(world.projectiles).toEqual([]);
    expect(world.nextProjectileId).toBe(nextId);
    world.matchIndex += 1;
    startMatch(world);
    expect(world.projectiles).toEqual([]);
    expect(world.nextProjectileId).toBe(nextId);
  });

  it('AT-WPN-15 kills Runner with Pulse hit 9, Runner with Scatter shot 2, Beast with armed Rail hit 7', () => {
    function kills(
      shooterForm: Form,
      victimForm: Form,
      distance: number,
    ): { hits: number; shots: number } {
      const { world, shooter } = setup();
      const victim = target(world);
      shooter.form = shooterForm;
      victim.form = victimForm;
      victim.pos = { x: distance, y: 0 };
      let hits = 0;
      let shots = 0;
      for (
        let count = 0;
        count < DERIVED.match.durationTicks && victim.alive;
        count += 1
      ) {
        const events = tick(world, InputButton.Fire);
        hits += events.filter((event) => event.type === 'projectileHit').length;
        shots +=
          events.filter((event) => event.type === 'projectileSpawn').length /
          (shooterForm === Form.Beast
            ? DERIVED.weapons.scatterCannon.pelletOffsetsRad.length
            : 1);
      }
      expect(victim.alive).toBe(false);
      return { hits, shots };
    }
    expect(kills(Form.Runner, Form.Runner, 8).hits).toBe(9);
    expect(kills(Form.Beast, Form.Runner, 3).shots).toBe(2);
    expect(kills(Form.Turret, Form.Beast, 8).hits).toBe(7);
  });
});
