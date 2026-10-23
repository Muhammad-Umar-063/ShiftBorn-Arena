import {
  AimSource,
  BALANCE,
  Cause,
  Controller,
  DERIVED,
  Form,
  GREYBOX_V1,
  InputButton,
  Phase,
  type InputFrame,
  type MapData,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { applyDamage } from '../src/damage.js';
import { startDash } from '../src/ability.js';
import { counterForm, finalizeDeaths } from '../src/death.js';
import {
  grantSpawnProtection,
  endSpawnProtection,
  isSpawnProtected,
} from '../src/protection.js';
import { advanceAllProjectiles, spawnProjectile } from '../src/projectiles.js';
import { respawnDuePlayers, respawnPlayer } from '../src/respawn.js';
import { step } from '../src/step.js';
import type { PlayerRecord, World } from '../src/world.js';
import { makeTestWorld, tier1Gun } from './fixtures/makeTestWorld.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

const map: MapData = { ...TEST_OPEN, spawnPoints: GREYBOX_V1.spawnPoints };
const specs = [
  { id: 'killer', name: 'Killer', isBot: false, seat: 0 },
  { id: 'victim', name: 'Victim', isBot: false, seat: 1 },
  { id: 'assist', name: 'Assist', isBot: false, seat: 2 },
];

function player(world: World, seat: number): PlayerRecord {
  const record = world.players[seat];
  if (record === null || record === undefined)
    throw new Error('missing player');
  return record;
}

function setup(count = 3): World {
  const world = makeTestWorld({
    seed: 17,
    map,
    players: specs.slice(0, count),
  });
  world.phase = Phase.Playing;
  world.phaseEndTick = 10_000;
  world.events.length = 0;
  for (let seat = 0; seat < count; seat += 1) {
    const record = player(world, seat);
    record.protectedEndTick = world.tick;
    record.pos = { x: seat * 4, y: 0 };
  }
  return world;
}

function hit(
  world: World,
  source: PlayerRecord,
  victim: PlayerRecord,
  base = 1,
) {
  return applyDamage(
    world,
    { id: source.id, seat: source.seat, name: source.name, form: source.form },
    victim,
    base,
    1,
    { x: -1, y: 0 },
    Cause.PulsePistol,
  );
}

function lethal(
  world: World,
  source: PlayerRecord,
  victim: PlayerRecord,
  base = 2,
) {
  victim.hpFrac = 1e-3;
  return hit(world, source, victim, base);
}

function frame(seq: number, buttons = 0): InputFrame {
  return { aimDist: 120,
    seq,
    moveX: 0,
    moveY: 0,
    aim: 0,
    buttons,
    aimSource: AimSource.Mouse,
  };
}

function deaths(world: World) {
  return world.events.filter((event) => event.type === 'death');
}

describe('T-017 death, credit, respawn and protection', () => {
  it('AT-DEATH-01 gives the threshold-crossing attacker exactly one KO', () => {
    const world = setup();
    const killer = player(world, 0);
    const victim = player(world, 1);
    const assister = player(world, 2);
    hit(world, assister, victim, 1);
    expect(lethal(world, killer, victim).lethal).toBe(true);
    expect(hit(world, assister, victim).applied).toBe(false);
    expect(world.pendingDeaths).toHaveLength(1);
    expect(Object.isFrozen(world.pendingDeaths[0])).toBe(true);
    finalizeDeaths(world);
    finalizeDeaths(world);
    expect(killer.stats.kos).toBe(1);
    expect(victim.stats.deaths).toBe(1);
    expect(assister.stats.kos).toBe(0);
    expect(assister.stats.assists).toBe(1);
    expect(deaths(world)).toHaveLength(1);
  });

  it('AT-DEATH-02 includes the 150-tick boundary, excludes older hits, deduplicates, and credits dead assisters', () => {
    const world = setup();
    const killer = player(world, 0);
    const victim = player(world, 1);
    const assister = player(world, 2);
    world.tick = 200;
    victim.damageLog = [
      { attackerId: assister.id, tick: 47, amount: 1 }, // 5.1 seconds
      { attackerId: assister.id, tick: 50, amount: 1 }, // inclusive 150
      { attackerId: assister.id, tick: 53, amount: 1 }, // 4.9 seconds
      { attackerId: assister.id, tick: 53, amount: 1 },
    ];
    assister.alive = false;
    lethal(world, killer, victim);
    finalizeDeaths(world);
    expect(assister.stats.assists).toBe(1);
    expect(deaths(world)[0]).toMatchObject({
      assisters: [{ id: assister.id, seat: 2 }],
    });

    const oldWorld = setup();
    oldWorld.tick = 200;
    player(oldWorld, 1).damageLog = [
      { attackerId: 'assist', tick: 47, amount: 1 },
    ];
    lethal(oldWorld, player(oldWorld, 0), player(oldWorld, 1));
    finalizeDeaths(oldWorld);
    expect(player(oldWorld, 2).stats.assists).toBe(0);
  });

  it('orders distinct assisters by seat regardless of hit order', () => {
    const world = makeTestWorld({
      seed: 18,
      map,
      players: [
        ...specs,
        { id: 'fourth', name: 'Fourth', isBot: false, seat: 3 },
      ],
    });
    world.phase = Phase.Playing;
    world.tick = 200;
    const victim = player(world, 1);
    victim.protectedEndTick = world.tick;
    victim.damageLog = [
      { attackerId: 'fourth', tick: 199, amount: 1 },
      { attackerId: 'assist', tick: 198, amount: 1 },
    ];
    lethal(world, player(world, 0), victim);
    finalizeDeaths(world);
    expect(deaths(world)[0]).toMatchObject({
      assisters: [
        { id: 'assist', seat: 2 },
        { id: 'fourth', seat: 3 },
      ],
    });
    expect(player(world, 2).stats.assists).toBe(1);
    expect(player(world, 3).stats.assists).toBe(1);
  });

  it('AT-DEATH-03 same-tick projectiles let both owners die and earn a KO; later hits are ignored', () => {
    const world = setup(2);
    const first = player(world, 0);
    const second = player(world, 1);
    first.pos = { x: -2, y: 0 };
    second.pos = { x: 2, y: 0 };
    first.hpFrac = second.hpFrac = 1e-3;
    first.aim = 0;
    second.aim = Math.PI;
    expect(spawnProjectile(world, first, tier1Gun(first.form), 0, 1, 0, 0)).not.toBeNull();
    expect(spawnProjectile(world, second, tier1Gun(second.form), Math.PI, 1, 0, 0)).not.toBeNull();
    expect(spawnProjectile(world, first, tier1Gun(first.form), 0, 1, 1, 0)).not.toBeNull();
    while (first.alive || second.alive) advanceAllProjectiles(world);
    expect(world.pendingDeaths).toHaveLength(2);
    const damageCount = world.events.filter(
      (event) => event.type === 'damage',
    ).length;
    advanceAllProjectiles(world);
    expect(
      world.events.filter((event) => event.type === 'damage'),
    ).toHaveLength(damageCount);
    finalizeDeaths(world);
    expect(first.stats).toMatchObject({ kos: 1, deaths: 1 });
    expect(second.stats).toMatchObject({ kos: 1, deaths: 1 });
    expect(deaths(world).map((event) => event.victimSeat)).toEqual([0, 1]);
    expect(
      world.events.findIndex((event) => event.type === 'death'),
    ).toBeGreaterThan(
      world.events.map((event) => event.type).lastIndexOf('damage'),
    );
  });

  it('AT-DEATH-04 waits 90 ticks, then respawns exactly once', () => {
    const world = setup(2);
    const victim = player(world, 1);
    lethal(world, player(world, 0), victim);
    step(world, [], {});
    expect(victim.respawnTick).toBe(DERIVED.match.respawnTicks);
    while (world.tick < victim.respawnTick) {
      expect(victim.alive).toBe(false);
      expect(
        step(world, [], {}).filter((event) => event.type === 'respawn'),
      ).toEqual([]);
    }
    expect(world.tick).toBe(90);
    const events = step(world, [], {});
    expect(events.filter((event) => event.type === 'respawn')).toHaveLength(1);
    expect(victim.alive).toBe(true);
    expect(
      step(world, [], {}).filter((event) => event.type === 'respawn'),
    ).toEqual([]);
  });

  it('AT-DEATH-05 respawn reuses recent exclusion, farthest choice, and seeded fallback', () => {
    const lineMap = {
      ...TEST_OPEN,
      spawnPoints: Array.from({ length: 6 }, (_, i) => ({
        id: `S${i}`,
        x: i * 10 - 25,
        y: 0,
      })),
    };
    const world = makeTestWorld({ seed: 17, map: lineMap, players: specs });
    world.phase = Phase.Playing;
    world.tick = 30;
    world.recentSpawns = [2, 3];
    const victim = player(world, 0);
    victim.alive = false;
    victim.respawnTick = world.tick;
    player(world, 1).pos = { x: -25, y: 0 };
    player(world, 2).pos = { x: 25, y: 0 };
    respawnDuePlayers(world);
    expect(victim.pos).toEqual({ x: -15, y: 0 }); // indexes 1 and 4 tie
    expect(world.recentSpawns).toEqual([3, 1]);
    const fallbackA = setup(2);
    const fallbackB = setup(2);
    for (const candidate of [fallbackA, fallbackB]) {
      candidate.tick = 30;
      for (const record of candidate.players)
        if (record !== null) record.alive = false;
      player(candidate, 0).respawnTick = 30;
      player(candidate, 1).respawnTick = 31;
    }
    respawnDuePlayers(fallbackA);
    respawnDuePlayers(fallbackB);
    expect(player(fallbackA, 0).pos).toEqual(player(fallbackB, 0).pos);
    expect(fallbackA.rng).toEqual(fallbackB.rng);
  });

  it('AT-DEATH-06 resets life state while preserving identity, stats, Flux and input state', () => {
    const world = setup(2);
    const victim = player(world, 1);
    victim.alive = false;
    victim.form = Form.Beast;
    victim.morph = { target: Form.Turret, endTick: 90 };
    victim.morphReadyTick = 400;
    victim.flux = 23;
    victim.ability = startDash(world.tick, { x: 1, y: 0 });
    victim.abilityReadyTick = { runner: 400, beast: 400, turret: 400 };
    victim.gunTimers.pulsePistol = 4;
    victim.heat = 9;
    victim.overheatEndTick = 400;
    victim.stunEndTick = 400;
    victim.ccImmuneEndTick = 400;
    victim.knockback = { vel: { x: 1, y: 2 }, endTick: 400 };
    victim.damageLog = [{ attackerId: 'killer', tick: 0, amount: 1 }];
    victim.stats.deaths = 3;
    victim.controller = Controller.Proxy;
    victim.lastInputSeq = 42;
    victim.lastButtonInputSeq = 43;
    victim.lastShotInputSeq = 44;
    victim.nextShotIdx = 5;
    world.tick = 90;
    victim.respawnTick = 90;
    respawnDuePlayers(world);
    const { x, y } = victim.pos;
    const expectedAngle = Math.atan2(-y, -x);
    expect(victim).toMatchObject({
      id: 'victim',
      seat: 1,
      name: 'Victim',
      alive: true,
      vel: { x: 0, y: 0 },
      form: Form.Runner,
      morph: null,
      morphReadyTick: 90,
      hpFrac: 1,
      flux: 23,
      ability: null,
      abilityReadyTick: { runner: 90, beast: 90, turret: 90 },
      gunTimers: {
        pulsePistol: 0, ricochetDisc: 0, scatterCannon: 0,
        slugCannon: 0, railRepeater: 0, arcMortar: 0,
      },
      reload: null,
      melee: null,
      swapReadyTick: 90,
      heat: 0,
      overheatEndTick: 90,
      stunEndTick: 90,
      ccImmuneEndTick: 90,
      knockback: null,
      damageLog: [],
      protectedEndTick: 90 + DERIVED.match.spawnProtectionTicks,
      stats: { deaths: 3 },
      controller: Controller.Proxy,
      lastInputSeq: 42,
      lastButtonInputSeq: 43,
      lastShotInputSeq: 44,
      nextShotIdx: 5,
    });
    expect(victim.aim).toBe(
      expectedAngle < 0 ? expectedAngle + 2 * Math.PI : expectedAngle,
    );
    expect(victim.aim).toBeGreaterThanOrEqual(0);
    expect(victim.aim).toBeLessThan(2 * Math.PI);
    expect(world.events.filter((event) => event.type === 'respawn')).toEqual([
      {
        type: 'respawn',
        seat: 1,
        pos: { x, y },
        protectedEndTick: victim.protectedEndTick,
      },
    ]);
    respawnPlayer(victim, 100, { x: 1, y: 0 }, { x: 0, y: 0 }, 41);
    expect(victim.flux).toBe(41); // explicit T-018 insertion seam
  });

  it('AT-DEATH-07 skips respawn in RESULTS and resets on next COUNTDOWN', () => {
    const world = setup(2);
    const victim = player(world, 1);
    lethal(world, player(world, 0), victim);
    world.phaseEndTick = 1;
    step(world, [], {});
    expect(victim.alive).toBe(false);
    const resultsEvents = step(world, [], {});
    expect(world.phase).toBe(Phase.Results);
    expect(resultsEvents.some((event) => event.type === 'respawn')).toBe(false);
    world.tick = victim.respawnTick;
    world.phaseEndTick = world.tick + 1;
    expect(step(world, [], {}).some((event) => event.type === 'respawn')).toBe(
      false,
    );
    step(world, [], {});
    expect(world.phase).toBe(Phase.Countdown);
    expect(victim.alive).toBe(true);
    expect(victim.stats.deaths).toBe(0);
  });

  it('AT-DEATH-08 captures recap for all forms before later morph/death; cleanup does not refund', () => {
    for (const [form, counter] of [
      [Form.Runner, Form.Beast],
      [Form.Beast, Form.Turret],
      [Form.Turret, Form.Runner],
    ] as const) {
      const world = setup(2);
      const killer = player(world, 0);
      const victim = player(world, 1);
      const balanceBefore = structuredClone(BALANCE);
      killer.form = form;
      victim.form = Form.Beast;
      victim.morph = { target: Form.Turret, endTick: 20 };
      const oldFlux = victim.flux;
      const base = 2.125;
      const result = lethal(world, killer, victim, base);
      killer.form = Form.Runner;
      killer.alive = false;
      victim.ability = startDash(world.tick, { x: 1, y: 0 });
      victim.knockback = { vel: { x: 1, y: 1 }, endTick: 20 };
      victim.stunEndTick = 20;
      finalizeDeaths(world);
      expect(counterForm(form)).toBe(counter);
      expect(deaths(world)[0]).toMatchObject({
        victimId: victim.id,
        victimSeat: 1,
        victimForm: Form.Beast,
        killerId: killer.id,
        killerSeat: 0,
        killerName: killer.name,
        killerForm: form,
        cause: Cause.PulsePistol,
        finalDamage: result.finalDamage,
        counterForm: counter,
      });
      expect(victim.morph).toBeNull();
      expect(victim.ability).toBeNull();
      expect(victim.knockback).toBeNull();
      expect(victim.stunEndTick).toBe(world.tick);
      expect(victim.flux).toBe(oldFlux);
      expect(killer.stats.kos).toBe(1);
      expect(BALANCE).toEqual(balanceBefore);
    }
  });

  it('AT-STS-05 has an exact 60-tick boundary and central early-end seam', () => {
    const world = setup(2);
    const subject = player(world, 0);
    world.phase = Phase.Countdown;
    world.phaseEndTick = 10;
    expect(isSpawnProtected(subject, 9)).toBe(false);
    world.tick = 10;
    step(world, [], {});
    expect(subject.protectedEndTick).toBe(
      10 + DERIVED.match.spawnProtectionTicks,
    );
    expect(isSpawnProtected(subject, 69)).toBe(true);
    expect(isSpawnProtected(subject, 70)).toBe(false);
    subject.morph = { target: Form.Beast, endTick: 90 };
    expect(isSpawnProtected(subject, 11)).toBe(true);
    subject.morph = null;
    endSpawnProtection(subject, 11); // future successful ability start
    expect(isSpawnProtected(subject, 11)).toBe(false);
    grantSpawnProtection(subject, 20);
    expect(isSpawnProtected(subject, 79)).toBe(true);
    expect(isSpawnProtected(subject, 80)).toBe(false);
  });

  it('AT-STS-05 blocked fire leaves protection, successful fire ends it before same-tick hit', () => {
    const blocked = setup(2);
    const blockedShooter = player(blocked, 0);
    blockedShooter.protectedEndTick = 60;
    blockedShooter.stunEndTick = 20;
    step(blocked, [frame(1, InputButton.Fire)], {});
    expect(blockedShooter.protectedEndTick).toBe(60);
    const world = setup(2);
    const shooter = player(world, 0);
    const enemy = player(world, 1);
    shooter.protectedEndTick = 60;
    shooter.pos = { x: 0, y: 0 };
    enemy.pos = { x: 1.8, y: 0 };
    enemy.aim = Math.PI;
    expect(spawnProjectile(world, enemy, tier1Gun(enemy.form), Math.PI, 1, 0, 0)).not.toBeNull();
    const events = step(world, [frame(1, InputButton.Fire)], {});
    expect(shooter.protectedEndTick).toBe(0);
    expect(
      events.some(
        (event) => event.type === 'damage' && event.victimId === shooter.id,
      ),
    ).toBe(true);
  });

  it('AT-DMG-06 protected projectile blocks without damage, death or damage log', () => {
    const world = setup(2);
    const shooter = player(world, 0);
    const target = player(world, 1);
    target.protectedEndTick = 60;
    target.pos = { x: 4, y: 0 };
    const projectile = spawnProjectile(world, shooter, tier1Gun(shooter.form), 0, 1, 0, 0);
    expect(projectile).not.toBeNull();
    while (world.projectiles.length > 0) advanceAllProjectiles(world);
    expect(
      world.events.some(
        (event) => event.type === 'blocked' && event.targetSeat === 1,
      ),
    ).toBe(true);
    expect(target.hpFrac).toBe(1);
    expect(target.damageLog).toEqual([]);
    expect(world.pendingDeaths).toEqual([]);
    expect(world.projectiles).toEqual([]);
  });

  it('AT-WPN-13 surviving projectile gives its dead owner the KO', () => {
    const world = setup(2);
    const killer = player(world, 0);
    const victim = player(world, 1);
    victim.pos = { x: 4, y: 0 };
    victim.hpFrac = 1e-3;
    expect(spawnProjectile(world, killer, tier1Gun(killer.form), 0, 1, 0, 0)).not.toBeNull();
    killer.alive = false;
    killer.form = Form.Beast;
    while (world.projectiles.length > 0) advanceAllProjectiles(world);
    finalizeDeaths(world);
    expect(victim.alive).toBe(false);
    expect(killer.stats.kos).toBe(1);
    expect(deaths(world)[0]).toMatchObject({
      killerForm: Form.Runner,
      killerName: 'Killer',
    });
  });

  it('processes simultaneous respawns by seat so the first is a living spawn opponent', () => {
    const lineMap = {
      ...TEST_OPEN,
      spawnPoints: Array.from({ length: 6 }, (_, index) => ({
        id: `S${index}`,
        x: index * 10 - 25,
        y: 0,
      })),
    };
    const world = makeTestWorld({
      seed: 19,
      map: lineMap,
      players: specs.slice(0, 2),
    });
    world.tick = 90;
    world.phase = Phase.Playing;
    world.recentSpawns = [0, 1];
    for (const record of world.players) {
      if (record === null) continue;
      record.alive = false;
      record.respawnTick = 90;
    }
    respawnDuePlayers(world);
    const first = player(world, 0);
    const second = player(world, 1);
    expect(first.alive && second.alive).toBe(true);
    expect(first.pos).not.toEqual(second.pos);
    const firstIndex = lineMap.spawnPoints.findIndex(
      (point) => point.x === first.pos.x,
    );
    const candidates = lineMap.spawnPoints
      .map((point, index) => ({ point, index }))
      .filter(({ index }) => index !== 1 && index !== firstIndex);
    const expected = candidates.reduce((best, candidate) => {
      const distance = Math.abs(candidate.point.x - first.pos.x);
      return distance > Math.abs(best.point.x - first.pos.x) ? candidate : best;
    });
    expect(second.pos).toEqual({ x: expected.point.x, y: expected.point.y });
    expect(
      world.events
        .filter((event) => event.type === 'respawn')
        .map((event) => event.seat),
    ).toEqual([0, 1]);
  });
});
