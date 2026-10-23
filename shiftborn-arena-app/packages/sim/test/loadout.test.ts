import {
  AimSource,
  BALANCE,
  Cause,
  DERIVED,
  Form,
  GREYBOX_V1,
  GUN_IDS,
  InputButton,
  MorphDenialReason,
  Phase,
  WeaponId,
  type GunId,
  type InputFrame,
  type MapData,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { applyDamage } from '../src/damage.js';
import { gunNumbers, gunForm } from '../src/loadout.js';
import { spawnProjectile } from '../src/projectiles.js';
import { step } from '../src/step.js';
import type { SimEvent } from '../src/events.js';
import type { PlayerRecord, World } from '../src/world.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

const map: MapData = { ...TEST_OPEN, spawnPoints: GREYBOX_V1.spawnPoints };
const specs = [
  { id: 'a', name: 'A', isBot: false, seat: 0 },
  { id: 'b', name: 'B', isBot: false, seat: 1 },
  { id: 'c', name: 'C', isBot: false, seat: 2 },
];

function seat(world: World, index: number): PlayerRecord {
  const record = world.players[index];
  if (record === null || record === undefined) throw new Error('missing player');
  return record;
}

function playing(count = 2, selectedMap: MapData = map): World {
  const world = makeTestWorld({
    seed: 41, map: selectedMap, players: specs.slice(0, count), unlockAllForms: true,
  });
  world.phase = Phase.Playing;
  world.phaseEndTick = world.tick + DERIVED.match.durationTicks;
  world.events.length = 0;
  for (let index = 0; index < count; index += 1) {
    const record = seat(world, index);
    record.protectedEndTick = world.tick;
    record.pos = { x: -20 + index * 10, y: 0 };
    record.flux = BALANCE.flux.max;
  }
  return world;
}

/** Test-only ownership; D-075 loot grants guns in play (AT-LOOT tests). */
function give(player: PlayerRecord, gun: GunId,
  mag = gunNumbers(gun).magazine, reserve = gunNumbers(gun).reserveMax): void {
  player.guns[gun] = { owned: true, mag, reserve };
  const form = gunForm(gun);
  if (player.selectedTier[form] === 0)
    player.selectedTier[form] = gun === WeaponId.PulsePistol ||
      gun === WeaponId.ScatterCannon || gun === WeaponId.RailRepeater ? 1 : 2;
}

let sequence = 1;
function frame(buttons = 0, aim = 0): InputFrame {
  sequence += 1;
  return { aimDist: 120, seq: sequence, moveX: 0, moveY: 0, aim, buttons, aimSource: AimSource.Mouse };
}

/** Steps with seat 0 pressing `buttons`; other seats send neutral frames. */
function tick(world: World, buttons = 0, aim = 0): SimEvent[] {
  const inputs = world.players.map((_, index) => frame(index === 0 ? buttons : 0, aim));
  return [...step(world, inputs, {})];
}

function ofType<T extends SimEvent['type']>(events: readonly SimEvent[], type: T) {
  return events.filter((event): event is Extract<SimEvent, { type: T }> =>
    event.type === type);
}

function encodeAim(radians: number): number {
  return Math.round((radians / (2 * Math.PI)) * 65536) & 0xffff;
}

describe('GR-7.15 to GR-7.20 gun state, ammunition and reloads (D-076)', () => {
  it('AT-LOAD-01 starts with no guns, no selections and the dagger on fire', () => {
    const world = playing(1);
    const player = seat(world, 0);
    for (const gun of GUN_IDS)
      expect(player.guns[gun]).toEqual({ owned: false, mag: 0, reserve: 0 });
    expect(player.selectedTier).toEqual({ runner: 0, beast: 0, turret: 0 });
    const start = world.tick;
    const events = tick(world, InputButton.Fire);
    expect(ofType(events, 'meleeStart')).toEqual([{ type: 'meleeStart', seat: 0,
      strikeTick: start + DERIVED.weapons.dagger.windupTicks,
      endTick: start + DERIVED.weapons.dagger.windupTicks +
        DERIVED.weapons.dagger.recoveryTicks }]);
    expect(ofType(events, 'projectileSpawn')).toEqual([]);
  });

  it('AT-AMMO-05 GR-7.18 uses one round per attack and stops at an empty gun', () => {
    const world = playing(1);
    const player = seat(world, 0);
    give(player, WeaponId.ScatterCannon, 8, 0);
    player.form = Form.Beast;
    const events = tick(world, InputButton.Fire);
    expect(ofType(events, 'projectileSpawn')).toHaveLength(
      BALANCE.weapons.scatterCannon.pelletOffsetsDeg.length);
    expect(player.guns.scatterCannon.mag).toBe(7);

    const runnerWorld = playing(1);
    const runner = seat(runnerWorld, 0);
    give(runner, WeaponId.PulsePistol, 2, 0);
    let shots = 0;
    let strikes = 0;
    for (let index = 0; index < 30; index += 1) {
      const result = tick(runnerWorld, InputButton.Fire);
      shots += ofType(result, 'projectileSpawn').length;
      strikes += ofType(result, 'meleeStart').length;
    }
    expect(shots).toBe(2);
    expect(runner.guns.pulsePistol).toEqual({ owned: true, mag: 0, reserve: 0 });
    // GR-7.17: an empty gun with no reserve falls back to the dagger.
    expect(strikes).toBeGreaterThan(0);
  });

  it('AT-AMMO-04 GR-7.19 reloads exactly, automatically when empty, and never without need', () => {
    const world = playing(1);
    const player = seat(world, 0);
    give(player, WeaponId.PulsePistol, 5, 10);
    const start = world.tick;
    const pressed = tick(world, InputButton.Reload);
    expect(ofType(pressed, 'reloadStart')).toEqual([{ type: 'reloadStart', seat: 0,
      gun: WeaponId.PulsePistol, endTick: start + DERIVED.weapons.pulsePistol.reloadTicks }]);
    while (world.tick < start + DERIVED.weapons.pulsePistol.reloadTicks) {
      expect(player.guns.pulsePistol).toEqual({ owned: true, mag: 5, reserve: 10 });
      tick(world);
    }
    const done = tick(world);
    expect(ofType(done, 'reloadEnd')).toEqual([{ type: 'reloadEnd', seat: 0,
      gun: WeaponId.PulsePistol, completed: 1 }]);
    expect(player.guns.pulsePistol).toEqual({ owned: true, mag: 15, reserve: 0 });
    tick(world);
    expect(ofType(tick(world, InputButton.Reload), 'reloadStart')).toEqual([]);

    give(player, WeaponId.PulsePistol, 20, 50);
    tick(world);
    expect(ofType(tick(world, InputButton.Reload), 'reloadStart')).toEqual([]);

    give(player, WeaponId.PulsePistol, 1, 50);
    tick(world);
    const empties = tick(world, InputButton.Fire);
    expect(ofType(empties, 'projectileSpawn')).toHaveLength(1);
    expect(ofType(empties, 'reloadStart')).toHaveLength(1);
    expect(player.guns.pulsePistol.mag).toBe(0);
  });

  it('AT-AMMO-03 GR-7.20 morph, swap, dagger and ability cancel a reload; knockback does not; stored guns never reload', () => {
    const cases: { name: string; act: (world: World, player: PlayerRecord) => SimEvent[] }[] = [
      { name: 'morph', act: (world) => tick(world, InputButton.MorphBeast) },
      { name: 'swap', act: (world) => tick(world, InputButton.Swap) },
      { name: 'dagger', act: (world) => tick(world, InputButton.Dagger) },
      { name: 'ability', act: (world) => tick(world, InputButton.Ability) },
    ];
    for (const entry of cases) {
      const world = playing(1);
      const player = seat(world, 0);
      give(player, WeaponId.PulsePistol, 5, 50);
      give(player, WeaponId.RicochetDisc, 8, 0);
      tick(world, InputButton.Reload);
      expect(player.reload?.gun, entry.name).toBe(WeaponId.PulsePistol);
      tick(world);
      const events = entry.act(world, player);
      expect(ofType(events, 'reloadEnd'), entry.name).toEqual([{ type: 'reloadEnd',
        seat: 0, gun: WeaponId.PulsePistol, completed: 0 }]);
      expect(player.reload, entry.name).toBeNull();
      expect(player.guns.pulsePistol, entry.name).toEqual({ owned: true, mag: 5, reserve: 50 });
    }

    const world = playing(1);
    const player = seat(world, 0);
    give(player, WeaponId.PulsePistol, 5, 50);
    tick(world, InputButton.Reload);
    player.knockback = { vel: { x: 1, y: 0 }, endTick: world.tick + 10 };
    for (let index = 0; index < DERIVED.weapons.pulsePistol.reloadTicks; index += 1)
      tick(world);
    expect(player.guns.pulsePistol).toEqual({ owned: true, mag: 20, reserve: 35 });

    const stored = playing(1);
    const morpher = seat(stored, 0);
    give(morpher, WeaponId.PulsePistol, 5, 50);
    tick(stored, InputButton.Reload);
    tick(stored, InputButton.MorphTurret);
    expect(morpher.reload).toBeNull();
    for (let index = 0; index < 200; index += 1) tick(stored);
    expect(morpher.form).toBe(Form.Turret);
    expect(morpher.guns.pulsePistol).toEqual({ owned: true, mag: 5, reserve: 50 });
  });

  it('AT-AMMO-06 GR-7.16 swaps the form\'s two guns with a 12-tick block and ignores one-gun forms', () => {
    const world = playing(1);
    const player = seat(world, 0);
    give(player, WeaponId.PulsePistol);
    give(player, WeaponId.RicochetDisc);
    const start = world.tick;
    const swapped = tick(world, InputButton.Swap | InputButton.Fire);
    expect(ofType(swapped, 'weaponSwap')).toEqual([{ type: 'weaponSwap', seat: 0,
      gun: WeaponId.RicochetDisc, readyTick: start + DERIVED.weapons.swapTicks }]);
    expect(ofType(swapped, 'projectileSpawn')).toEqual([]);
    let firstShot = -1;
    while (firstShot < 0 && world.tick < start + 40) {
      const at = world.tick;
      const events = tick(world, InputButton.Fire);
      if (ofType(events, 'projectileSpawn').length > 0) {
        firstShot = at;
        expect(ofType(events, 'projectileSpawn')[0]?.weapon).toBe(WeaponId.RicochetDisc);
      }
    }
    expect(firstShot).toBe(start + DERIVED.weapons.swapTicks);
    tick(world);
    expect(ofType(tick(world, InputButton.Swap), 'weaponSwap')[0]?.gun)
      .toBe(WeaponId.PulsePistol);

    const single = playing(1);
    const one = seat(single, 0);
    give(one, WeaponId.PulsePistol);
    const readyBefore = one.swapReadyTick;
    expect(ofType(tick(single, InputButton.Swap), 'weaponSwap')).toEqual([]);
    expect(one.swapReadyTick).toBe(readyBefore);
    expect(one.selectedTier.runner).toBe(1);
  });

  it('AT-AMMO-07 GR-7.17 falls back to dagger strikes every 18 ticks, or reloads when a reserve exists', () => {
    const world = playing(1);
    const starts: number[] = [];
    for (let index = 0; index < 40; index += 1) {
      const at = world.tick;
      if (ofType(tick(world, InputButton.Fire), 'meleeStart').length > 0) starts.push(at);
    }
    const cycle = DERIVED.weapons.dagger.windupTicks + DERIVED.weapons.dagger.recoveryTicks;
    expect(cycle).toBe(18);
    expect(starts).toEqual([starts[0], (starts[0] ?? 0) + cycle, (starts[0] ?? 0) + 2 * cycle]);

    const reloadWorld = playing(1);
    const player = seat(reloadWorld, 0);
    give(player, WeaponId.PulsePistol, 0, 10);
    const events = tick(reloadWorld, InputButton.Fire);
    expect(ofType(events, 'reloadStart')).toHaveLength(1);
    expect(ofType(events, 'meleeStart')).toEqual([]);
  });

  it('AT-WPN-16 fires only the current form\'s selected gun; stored guns keep ammunition and timers', () => {
    const world = playing(1);
    const player = seat(world, 0);
    give(player, WeaponId.PulsePistol);
    give(player, WeaponId.ScatterCannon, 6, 4);
    player.gunTimers.scatterCannon = 0.5;
    const events = tick(world, InputButton.Fire);
    expect(ofType(events, 'projectileSpawn').map((event) => event.weapon))
      .toEqual([WeaponId.PulsePistol]);
    expect(player.guns.scatterCannon).toEqual({ owned: true, mag: 6, reserve: 4 });
    expect(player.gunTimers.scatterCannon).toBeCloseTo(0.5 - DERIVED.tick.secondsPerTick, 12);
    tick(world, InputButton.MorphBeast);
    for (let index = 0; index < DERIVED.morph.durationTicks + 30; index += 1) tick(world);
    expect(player.form).toBe(Form.Beast);
    const beastShot = tick(world, InputButton.Fire);
    expect(ofType(beastShot, 'projectileSpawn').every((event) =>
      event.weapon === WeaponId.ScatterCannon)).toBe(true);
    expect(player.guns.scatterCannon.mag).toBe(5);
  });

  it('AT-AMMO-01 D-076 keeps every gun\'s exact ammunition and selection through death and respawn', () => {
    const world = playing(2);
    const victim = seat(world, 0);
    const killer = seat(world, 1);
    give(victim, WeaponId.PulsePistol, 7, 33);
    give(victim, WeaponId.RicochetDisc, 2, 0);
    give(victim, WeaponId.SlugCannon, 1, 9);
    give(victim, WeaponId.ArcMortar, 3, 12);
    victim.selectedTier.runner = 2;
    const before = structuredClone(victim.guns);
    const selection = structuredClone(victim.selectedTier);
    applyDamage(world, { id: killer.id, seat: killer.seat, name: killer.name, form: killer.form },
      victim, 1000, 1, { x: -1, y: 0 }, Cause.PulsePistol);
    tick(world);
    expect(victim.alive).toBe(false);
    world.tick = victim.respawnTick;
    tick(world);
    expect(victim.alive).toBe(true);
    expect(victim.form).toBe(Form.Runner);
    expect(victim.guns).toEqual(before);
    expect(victim.selectedTier).toEqual(selection);
    expect(victim.reload).toBeNull();
    expect(victim.melee).toBeNull();
  });

  it('AT-AMMO-02 death during a reload moves nothing; a reload due on the death tick completes first; a shot on the death tick stays spent', () => {
    const world = playing(2);
    const victim = seat(world, 0);
    const killer = seat(world, 1);
    give(victim, WeaponId.PulsePistol, 4, 30);
    tick(world, InputButton.Reload);
    tick(world);
    applyDamage(world, { id: killer.id, seat: killer.seat, name: killer.name, form: killer.form },
      victim, 1000, 1, { x: -1, y: 0 }, Cause.PulsePistol);
    const deathEvents = tick(world);
    expect(ofType(deathEvents, 'reloadEnd')).toEqual([{ type: 'reloadEnd', seat: 0,
      gun: WeaponId.PulsePistol, completed: 0 }]);
    expect(victim.guns.pulsePistol).toEqual({ owned: true, mag: 4, reserve: 30 });

    const due = playing(2);
    const reloader = seat(due, 0);
    const shooter = seat(due, 1);
    give(reloader, WeaponId.PulsePistol, 4, 30);
    give(shooter, WeaponId.PulsePistol);
    reloader.reload = { gun: WeaponId.PulsePistol, endTick: due.tick };
    reloader.hpFrac = 0.01;
    shooter.pos = { x: reloader.pos.x + 1.5, y: 0 };
    expect(spawnProjectile(due, shooter, WeaponId.PulsePistol, Math.PI, 1, 0, 0)).not.toBeNull();
    const raced = tick(due);
    const order = raced.map((event) => event.type);
    expect(order.indexOf('reloadEnd')).toBeLessThan(order.indexOf('projectileHit'));
    expect(reloader.alive).toBe(false);
    expect(reloader.guns.pulsePistol).toEqual({ owned: true, mag: 20, reserve: 14 });

    const spent = playing(2);
    const firer = seat(spent, 0);
    const enemy = seat(spent, 1);
    give(firer, WeaponId.PulsePistol, 10, 0);
    give(enemy, WeaponId.PulsePistol);
    firer.hpFrac = 0.01;
    enemy.pos = { x: firer.pos.x + 1.5, y: 0 };
    expect(spawnProjectile(spent, enemy, WeaponId.PulsePistol, Math.PI, 1, 0, 0)).not.toBeNull();
    const fatal = tick(spent, InputButton.Fire, encodeAim(Math.PI / 2));
    expect(ofType(fatal, 'projectileSpawn').some((event) => event.ownerSeat === 0)).toBe(true);
    expect(firer.alive).toBe(false);
    expect(firer.guns.pulsePistol.mag).toBe(9);
  });
});

function strikeEvents(world: World): SimEvent[] {
  const events = tick(world, InputButton.Dagger);
  for (let index = 0; index < DERIVED.weapons.dagger.windupTicks; index += 1)
    events.push(...tick(world));
  return events;
}

describe('GR-7.30 to GR-7.32 dagger', () => {
  function strikeWorld(targetX: number, targetY = 0, selectedMap: MapData = map) {
    const world = playing(2, selectedMap);
    const attacker = seat(world, 0);
    const target = seat(world, 1);
    attacker.pos = { x: 0, y: 0 };
    target.pos = { x: targetX, y: targetY };
    return { world, attacker, target };
  }

  function strike(world: World): SimEvent[] {
    const events = tick(world, InputButton.Dagger);
    for (let index = 0; index < DERIVED.weapons.dagger.windupTicks; index += 1)
      events.push(...tick(world));
    return events;
  }

  it('AT-MELEE-01 GR-7.31 hits a target within 0.35 m of the 1.4 m segment and misses just beyond', () => {
    const reach = BALANCE.forms.runner.radiusM + BALANCE.weapons.dagger.reachM;
    const limit = reach + BALANCE.weapons.dagger.widthM / 2 + BALANCE.forms.runner.radiusM;
    expect(reach).toBeCloseTo(1.4, 12);
    const near = strikeWorld(limit - 0.01);
    const hit = ofType(strike(near.world), 'meleeStrike');
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ seat: 0, targetSeat: 1, damage: BALANCE.weapons.dagger.damage });
    expect(near.target.hpFrac).toBeCloseTo(
      1 - BALANCE.weapons.dagger.damage / BALANCE.forms.runner.maxHp, 12);
    const far = strikeWorld(limit + 0.01);
    expect(ofType(strike(far.world), 'meleeStrike')[0]).toMatchObject({ targetSeat: -1, damage: 0 });
    expect(far.target.hpFrac).toBe(1);
    const behind = strikeWorld(-0.9);
    expect(ofType(strike(behind.world), 'meleeStrike')[0]?.targetSeat).toBe(-1);
  });

  it('AT-MELEE-02 GR-7.31 walls and intact cover stop the strike, including its width', () => {
    const walled: MapData = { ...map, walls: [...map.walls,
      { id: 'thin', box: [1.0, -2, 1.2, 2] }] };
    const { world, target } = strikeWorld(1.81, 0, walled);
    const result = ofType(strike(world), 'meleeStrike')[0];
    expect(result?.targetSeat).toBe(-1);
    expect(result?.x2).toBeCloseTo(1.0, 12);
    expect(target.hpFrac).toBe(1);
    const covered: MapData = { ...map, cover: [{ id: 'crate', box: [1.0, -2, 1.2, 2] }] };
    const intact = strikeWorld(1.81, 0, covered);
    expect(ofType(strike(intact.world), 'meleeStrike')[0]?.targetSeat).toBe(-1);
    const broken = strikeWorld(1.81, 0, covered);
    const cover = broken.world.cover[0];
    if (cover === undefined) throw new Error('missing cover');
    cover.intact = false;
    expect(ofType(strike(broken.world), 'meleeStrike')[0]?.targetSeat).toBe(1);
  });

  it('AT-MELEE-03 GR-7.31 to GR-7.32 picks the first target along the strike and blocks other actions through recovery', () => {
    const world = playing(3);
    const attacker = seat(world, 0);
    attacker.pos = { x: 0, y: 0 };
    seat(world, 1).pos = { x: 2.0, y: 0 };
    seat(world, 2).pos = { x: 1.6, y: 0.3 };
    give(attacker, WeaponId.PulsePistol, 5, 30);
    const start = world.tick;
    const begin = tick(world, InputButton.Dagger);
    expect(ofType(begin, 'meleeStart')[0]).toMatchObject({ strikeTick: start + 3, endTick: start + 18 });
    const timeline: SimEvent[] = [];
    for (let at = start + 1; at < start + 18; at += 1) {
      const buttons = at % 2 === 0
        ? InputButton.Fire | InputButton.Ability | InputButton.Reload
        : InputButton.MorphBeast | InputButton.Dagger;
      timeline.push(...tick(world, buttons));
    }
    expect(ofType(timeline, 'meleeStrike')).toEqual([expect.objectContaining({ targetSeat: 2 })]);
    expect(ofType(timeline, 'projectileSpawn')).toEqual([]);
    expect(ofType(timeline, 'abilityStart')).toEqual([]);
    expect(ofType(timeline, 'reloadStart')).toEqual([]);
    expect(ofType(timeline, 'meleeStart')).toEqual([]);
    const denials = ofType(timeline, 'morphDenied');
    expect(denials.length).toBeGreaterThan(0);
    expect(denials.every((event) => event.reason === MorphDenialReason.Busy)).toBe(true);
    expect(world.tick).toBe(start + 18);
    const after = tick(world, InputButton.Fire);
    expect(ofType(after, 'projectileSpawn')).toHaveLength(1);

    // The candidate reached earlier along the strike wins over a closer-centred one.
    const ordered = playing(3);
    seat(ordered, 0).pos = { x: 0, y: 0 };
    seat(ordered, 1).pos = { x: 1.5, y: 0 };
    seat(ordered, 2).pos = { x: 1.0, y: 0.5 };
    expect(ofType(strikeEvents(ordered), 'meleeStrike')[0]?.targetSeat).toBe(2);
  });
});
