import { BALANCE, DERIVED, GREYBOX_V1, Mode, Phase } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { hashWorld } from '../src/hash.js';
import {
  advancePhase,
  deriveMatchId,
  setMode,
  startMatch,
} from '../src/match.js';
import { PHASE_POLICY } from '../src/phasePolicy.js';
import { createPlayer } from '../src/player.js';
import { nextInt, sfc32, shuffle, type Rng } from '../src/rng.js';
import { step } from '../src/step.js';
import { createWorld } from '../src/world.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';
import { projectileRecord } from './fixtures/projectileRecord.js';

const players = Array.from({ length: BALANCE.match.seats }, (_, seat) => ({
  id: `player-${seat}`,
  name: `Player ${seat}`,
  isBot: false,
  seat,
}));

function consumeInitialClusterChoices(rng: Rng): void {
  const remaining = GREYBOX_V1.shardPoints.map((_, index) => index);
  for (let index = 0; index < BALANCE.shards.activeClusters; index += 1) {
    remaining.splice(nextInt(rng, remaining.length), 1);
  }
}

function allZero(value: unknown): boolean {
  if (typeof value === 'number') return value === 0;
  if (value !== null && typeof value === 'object')
    return Object.values(value).every(allZero);
  return false;
}

describe('AT-MATCH-01 exact phase lifecycle', () => {
  it('D-073 executes 90/18000/450 ticks and transitions at exclusive boundaries', () => {
    const world = createWorld({
      map: GREYBOX_V1,
      roomSeed: 21,
      mode: Mode.Frenzy,
    });
    expect(world).toMatchObject({
      tick: 0,
      phase: Phase.Countdown,
      phaseEndTick: DERIVED.match.countdownTicks,
      matchIndex: 0,
      matchId: deriveMatchId(21, 0),
      pendingMode: Mode.Frenzy,
    });
    const initialId = world.matchId;
    setMode(world, Mode.ZoneFrenzy);
    expect(world.mode).toBe(Mode.Frenzy);
    expect(world.pendingMode).toBe(Mode.ZoneFrenzy);
    const pendingHash = hashWorld(world);
    setMode(world, Mode.Frenzy);
    expect(hashWorld(world)).not.toBe(pendingHash);
    setMode(world, Mode.ZoneFrenzy);
    const counts = {
      [Phase.Countdown]: 0,
      [Phase.Playing]: 0,
      [Phase.Results]: 0,
    };
    const phaseEventTicks: number[] = [];
    const total =
      DERIVED.match.countdownTicks +
      DERIVED.match.durationTicks +
      DERIVED.match.resultsTicks;
    for (let tick = 0; tick < total; tick += 1) {
      expect(world.tick).toBe(tick);
      const events = step(world, [], {});
      counts[world.phase] += 1;
      if (events.some((event) => event.type === 'phase'))
        phaseEventTicks.push(tick);
    }
    expect(counts).toEqual({ COUNTDOWN: 90, PLAYING: 18000, RESULTS: 450 });
    expect(phaseEventTicks).toEqual([
      DERIVED.match.countdownTicks,
      DERIVED.match.countdownTicks + DERIVED.match.durationTicks,
    ]);
    expect(world.tick).toBe(total);
    expect(world.phase).toBe(Phase.Results);
    expect(world.phaseEndTick).toBe(total);
    const resultEvents = step(world, [], {});
    expect(resultEvents).toEqual([
      {
        type: 'phase',
        phase: Phase.Countdown,
        phaseEndTick: total + DERIVED.match.countdownTicks,
      },
      ...world.shards.map((shard) => ({
        type: 'shardSpawn',
        shardId: shard.id,
      })),
      ...world.loot.map(item => ({ type: 'lootSpawn', lootId: item.id, gun: item.gun, x: item.x, y: item.y })),
    ]);
    expect(world.phase).toBe(Phase.Countdown);
    expect(world.tick).toBe(total + 1);
    expect(world.phaseEndTick).toBe(total + DERIVED.match.countdownTicks);
    expect(world.matchIndex).toBe(1);
    expect(world.matchId).toBe(deriveMatchId(21, 1));
    expect(world.matchId).not.toBe(initialId);
    expect(world.mode).toBe(Mode.ZoneFrenzy);
    const expectedRng = sfc32(21, 1);
    shuffle(
      expectedRng,
      GREYBOX_V1.spawnPoints.map((_, index) => index),
    );
    consumeInitialClusterChoices(expectedRng);
    expect(world.rng).toEqual(expectedRng);
  });

  it('derives repeatable match IDs without consuming world RNG', () => {
    const world = createWorld({
      map: GREYBOX_V1,
      roomSeed: -4,
      mode: Mode.Frenzy,
    });
    const before = { ...world.rng };
    expect(deriveMatchId(-4, 0)).toBe(deriveMatchId(-4, 0));
    expect(deriveMatchId(-4, 1)).not.toBe(deriveMatchId(-4, 0));
    expect(world.rng).toEqual(before);
    expect(() => deriveMatchId(0.5, 0)).toThrow(RangeError);
    expect(() => deriveMatchId(0, -1)).toThrow(RangeError);
  });

  it('keeps the first system as phase and clears projectiles on RESULTS entry', () => {
    const world = createWorld({
      map: GREYBOX_V1,
      roomSeed: 2,
      mode: Mode.Frenzy,
    });
    world.events.length = 0;
    world.tick = DERIVED.match.countdownTicks;
    advancePhase(world);
    expect(world.phase).toBe(Phase.Playing);
    world.projectiles.push(projectileRecord(1));
    world.tick = world.phaseEndTick;
    advancePhase(world);
    expect(world.phase).toBe(Phase.Results);
    expect(world.projectiles).toEqual([]);
    expect(world.events).toEqual([
      {
        type: 'phase',
        phase: Phase.Playing,
        phaseEndTick:
          DERIVED.match.countdownTicks + DERIVED.match.durationTicks,
      },
      { type: 'phase', phase: Phase.Results, phaseEndTick: world.phaseEndTick },
    ]);
  });

  it('GR-2.4 grants protection from the first PLAYING tick only', () => {
    const first = players[0];
    if (first === undefined) throw new Error('Missing fixture player');
    const world = makeTestWorld({ seed: 5, players: [first] });
    const player = world.players[0];
    if (player === null || player === undefined)
      throw new Error('Missing player');
    expect(player.protectedEndTick).toBe(0);
    while (world.tick < DERIVED.match.countdownTicks) step(world, [], {});
    expect(world.phase).toBe(Phase.Countdown);
    expect(player.protectedEndTick).toBe(0);
    const events = step(world, [], {});
    expect(events).toEqual([
      { type: 'phase', phase: Phase.Playing, phaseEndTick: world.phaseEndTick },
    ]);
    expect(world.phase).toBe(Phase.Playing);
    expect(player.protectedEndTick).toBe(
      DERIVED.match.countdownTicks + DERIVED.match.spawnProtectionTicks,
    );
  });
});

describe('AT-MATCH-02 seeded match reset', () => {
  it('uses one shuffle for eight distinct GREYBOX spawns and resets every player', () => {
    const mapBefore = JSON.stringify(GREYBOX_V1);
    const world = makeTestWorld({ seed: 43, players });
    const firstPlayer = world.players[0];
    const cover = world.cover[0];
    if (
      firstPlayer === null ||
      firstPlayer === undefined ||
      cover === undefined
    )
      throw new Error('Missing fixture data');
    firstPlayer.stats.kos = 3;
    firstPlayer.stats.shotsFired.byWeapon.pulsePistol = 8;
    firstPlayer.flux = 0;
    firstPlayer.heat = 5;
    firstPlayer.morph = { target: 'beast', endTick: 20 };
    firstPlayer.gunTimers.pulsePistol = 2;
    firstPlayer.abilityReadyTick.beast = 100;
    firstPlayer.damageLog.push({ attackerId: 'attacker', tick: 1, amount: 2 });
    firstPlayer.protectedEndTick = 300;
    cover.intact = false;
    world.projectiles.push(projectileRecord(3));
    world.events.length = 0;
    world.matchIndex = 1;
    startMatch(world);
    const expectedRng = sfc32(43, 1);
    const order = shuffle(
      expectedRng,
      GREYBOX_V1.spawnPoints.map((_, index) => index),
    );
    consumeInitialClusterChoices(expectedRng);
    const assigned = world.players.map((player) => {
      if (player === null) throw new Error('Missing player');
      return GREYBOX_V1.spawnPoints.findIndex(
        (point) => point.x === player.pos.x && point.y === player.pos.y,
      );
    });
    expect(assigned).toEqual(order.slice(0, BALANCE.match.seats));
    expect(new Set(assigned).size).toBe(BALANCE.match.seats);
    expect(world.rng).toEqual(expectedRng);
    expect(world.recentSpawns).toEqual(
      assigned.slice(-BALANCE.match.spawnExcludeRecent),
    );
    expect(world.events.filter((event) => event.type === 'spawn')).toHaveLength(
      BALANCE.match.seats,
    );
    for (const player of world.players) {
      if (player === null) throw new Error('Missing player');
      expect(player).toMatchObject({
        alive: true,
        form: 'runner',
        hpFrac: 1,
        flux: BALANCE.flux.start,
        vel: { x: 0, y: 0 },
        aim: 0,
        morph: null,
        ability: null,
        knockback: null,
        heat: 0,
        protectedEndTick: world.tick,
        respawnTick: world.tick,
      });
      expect(Object.values(player.abilityReadyTick)).toEqual([
        world.tick,
        world.tick,
        world.tick,
      ]);
      expect(Object.values(player.gunTimers)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(player.damageLog).toEqual([]);
      expect(allZero(player.stats)).toBe(true);
    }
    expect(world.cover.every((state) => state.intact)).toBe(true);
    expect(world.projectiles).toEqual([]);
    expect(JSON.stringify(GREYBOX_V1)).toBe(mapBefore);
    const equivalent = makeTestWorld({ seed: 43, players });
    equivalent.matchIndex = 1;
    startMatch(equivalent);
    expect(hashWorld(equivalent)).toBe(hashWorld(world));
  });

  it('rejects a malformed map with fewer points than occupied seats', () => {
    const map = {
      ...GREYBOX_V1,
      spawnPoints: GREYBOX_V1.spawnPoints.slice(0, 1),
    };
    const world = createWorld({ map, roomSeed: 1, mode: Mode.Frenzy });
    world.players[0] = createPlayer(
      { id: 'a', seat: 0, name: 'A', isBot: false },
      world.tick,
    );
    world.players[1] = createPlayer(
      { id: 'b', seat: 1, name: 'B', isBot: false },
      world.tick,
    );
    expect(() => startMatch(world)).toThrow(/fewer spawn points/);
  });
});

describe('AT-MATCH-03 phase policy', () => {
  it('permits movement and aim in COUNTDOWN while blocking gameplay actions', () => {
    expect(PHASE_POLICY[Phase.Countdown]).toEqual({
      input: true,
      movement: true,
      aim: true,
      fire: false,
      ability: false,
      morph: false,
      damage: false,
      fluxRegeneration: false,
      zoneScoring: false,
    });
  });

  it('permits normal gameplay in PLAYING and blocks input and gameplay in RESULTS', () => {
    expect(Object.values(PHASE_POLICY[Phase.Playing]).every(Boolean)).toBe(
      true,
    );
    expect(
      Object.values(PHASE_POLICY[Phase.Results]).every((allowed) => !allowed),
    ).toBe(true);
  });
});
