import { createServer as createTcpServer } from 'node:net';
import { type Client } from '@colyseus/core';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  AimSource,
  BALANCE,
  Cause,
  ClientAimSourceCode,
  ClientMessageId,
  CloseCode,
  Controller,
  DERIVED,
  EventId,
  Form,
  GREYBOX_V1,
  Mode,
  gunFor,
  Phase,
  PROTOCOL_VERSION,
  ServerMessageId,
  type EncodedEvent,
} from '@shiftborn/shared';
import {
  applyDamage,
  createWorld,
  spawnProjectile,
  type PlayerRecord,
  type SimEvent,
} from '@shiftborn/sim';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import {
  botIdentity,
  chooseHumanSeat,
  CombatActivity,
  createInitialBotIdentities,
  findLowestEmptySeat,
  isOutOfCombat,
  neutralBotFrame,
  replacementScore,
  selectReplaceableBot,
} from '../src/rooms/seats.js';
import { createServer } from '../src/server.js';

function botWorld() {
  return createWorld({
    map: GREYBOX_V1,
    roomSeed: 73,
    mode: Mode.Frenzy,
    initialPlayers: Array.from({ length: BALANCE.match.seats }, (_, seat) =>
      botIdentity(seat + 1, seat),
    ),
  });
}

function playerAt(
  players: readonly (PlayerRecord | null)[],
  seat: number,
): PlayerRecord {
  const player = players[seat];
  if (player === null || player === undefined)
    throw new Error(`missing player ${seat}`);
  return player;
}

function damage(
  attackerSeat: number,
  victimSeat: number,
): Extract<SimEvent, { type: 'damage' }> {
  return {
    type: 'damage',
    attackerId: `bot-${attackerSeat + 1}`,
    attackerSeat,
    attackerForm: Form.Runner,
    victimId: `bot-${victimSeat + 1}`,
    victimSeat,
    victimForm: Form.Runner,
    cause: Cause.PulsePistol,
    finalDamage: 1,
    tags: 0,
    incomingDir: { x: 1, y: 0 },
  };
}

describe('AT-NET-10 pure seat rules', () => {
  it('takes the lowest empty seat and excludes humans, proxies, malformed records', () => {
    const world = botWorld();
    expect(findLowestEmptySeat(world.players)).toBeNull();
    world.players[2] = null;
    world.players[5] = null;
    expect(findLowestEmptySeat(world.players)).toBe(2);
    expect(chooseHumanSeat(world, [])).toEqual({ kind: 'empty', seat: 2 });
    world.players[2] = playerAt(botWorld().players, 2);
    world.players[5] = playerAt(botWorld().players, 5);
    world.players[7] = { ...playerAt(world.players, 7), isBot: false };
    world.players[6] = {
      ...playerAt(world.players, 6),
      controller: Controller.Proxy,
    };
    world.players[5] = { ...playerAt(world.players, 5), id: '' };
    world.players[4] = { ...playerAt(world.players, 4), seat: 3 };
    for (const seat of [0, 1, 2, 3])
      playerAt(world.players, seat).stats.kos = 10;
    expect(selectReplaceableBot(world, [], 0)?.seat).toBe(3);
    for (let seat = 0; seat < world.players.length; seat += 1)
      world.players[seat] = { ...playerAt(world.players, seat), isBot: false };
    expect(selectReplaceableBot(world, [], 0)).toBeNull();
    expect(chooseHumanSeat(world, [])).toBeNull();
  });

  it('tracks applied attacker and victim damage and uses the inclusive idle boundary', () => {
    const activity = new CombatActivity(BALANCE.match.seats);
    expect(isOutOfCombat(undefined, DERIVED.backfill.outOfCombatTicks)).toBe(
      true,
    );
    activity.observe(
      [{ type: 'blocked', id: 1, targetSeat: 2 }, damage(1, 2)],
      20,
    );
    const last = activity.snapshot();
    expect(last[1]).toBe(20);
    expect(last[2]).toBe(20);
    expect(last[3]).toBeUndefined();
    expect(
      isOutOfCombat(last[1], 20 + DERIVED.backfill.outOfCombatTicks - 1),
    ).toBe(false);
    expect(isOutOfCombat(last[2], 20 + DERIVED.backfill.outOfCombatTicks)).toBe(
      true,
    );
  });

  it('prefers idle, then actual mode score, then highest seat, without mutation', () => {
    const world = botWorld();
    for (const player of world.players)
      if (player !== null) player.stats.kos = 10;
    playerAt(world.players, 3).stats.kos = 1;
    playerAt(world.players, 6).stats.kos = 0;
    const active = Array.from(
      { length: BALANCE.match.seats },
      () => undefined as number | undefined,
    );
    active[6] = 20;
    const before = JSON.stringify(world.players);
    const activityBefore = JSON.stringify(active);
    expect(selectReplaceableBot(world, active, 20)?.seat).toBe(3);
    expect(JSON.stringify(world.players)).toBe(before);
    expect(JSON.stringify(active)).toBe(activityBefore);
    for (let seat = 0; seat < active.length; seat += 1) active[seat] = 20;
    expect(selectReplaceableBot(world, active, 20)?.seat).toBe(6);
    playerAt(world.players, 6).stats.kos = 10;
    playerAt(world.players, 7).stats.kos = 2;
    expect(selectReplaceableBot(world, active, 20)?.seat).toBe(3);
    playerAt(world.players, 7).stats.kos = 1;
    expect(selectReplaceableBot(world, active, 20)?.seat).toBe(7);
    world.mode = Mode.ZoneFrenzy;
    for (const player of world.players)
      if (player !== null) player.stats.points = 10;
    playerAt(world.players, 1).stats.points = 0;
    expect(replacementScore(playerAt(world.players, 1), world.mode)).toBe(0);
    expect(selectReplaceableBot(world, active, 20)?.seat).toBe(1);
  });

  it('makes unique placeholder identities and neutral input without consuming world RNG', () => {
    const world = botWorld();
    const before = JSON.stringify(world.rng);
    const made = createInitialBotIdentities(
      world.players.map((player, seat) => (seat === 3 ? null : player)),
      9,
    );
    expect(made).toEqual({ bots: [botIdentity(9, 3)], nextSerial: 10 });
    expect(botIdentity(10, 3)).toEqual({
      id: 'bot-10',
      name: 'Bot 10',
      isBot: true,
      seat: 3,
    });
    const frame = neutralBotFrame(playerAt(world.players, 0), 4);
    expect(frame).toEqual({ aimDist: 120,
      seq: 4,
      moveX: 0,
      moveY: 0,
      aim: playerAt(world.players, 0).aim,
      buttons: 0,
      aimSource: AimSource.Bot,
    });
    expect(JSON.stringify(world.rng)).toBe(before);
  });
});

class SeatHarnessRoom extends ArenaRoom {
  readonly welcomes: { playerId: string; seat: number }[] = [];

  get testWorld() {
    return this.world;
  }

  stopTestLoop(): void {
    this.fixedLoop.stop();
  }

  advanceTestTick(): void {
    this.runSimulationStep();
  }

  setPlaying(): void {
    this.world.phase = Phase.Playing;
    this.world.phaseEndTick = this.world.tick + DERIVED.match.durationTicks;
    this.mirrorNow();
  }

  applyTestDamage(attackerSeat: number, victimSeat: number): void {
    const attacker = playerAt(this.world.players, attackerSeat);
    const victim = playerAt(this.world.players, victimSeat);
    const before = this.world.events.length;
    const result = applyDamage(
      this.world,
      attacker,
      victim,
      1,
      1,
      { x: 1, y: 0 },
      Cause.PulsePistol,
    );
    if (!result.applied) throw new Error('test damage was not applied');
    this.recordCombatEvents(this.world.events.slice(before), this.world.tick);
  }

  spawnTestProjectile(seat: number) {
    const shooter = playerAt(this.world.players, seat);
    const projectile = spawnProjectile(
      this.world,
      shooter,
      gunFor(shooter.form, 1),
      0,
      1,
      0,
      0,
    );
    if (projectile === null) throw new Error('projectile did not spawn');
    return projectile;
  }

  finalizeTestClient(client: Client): void {
    this.finalizePlayerLeave(client);
  }

  protected override sendWelcome(
    client: Client,
    binding: { readonly playerId: string; readonly seat: number },
  ): void {
    this.welcomes.push({ playerId: binding.playerId, seat: binding.seat });
    super.sendWelcome(client, binding);
  }
}

class EmptySeatHarnessRoom extends SeatHarnessRoom {
  protected override botFillEnabled = false;
}

async function freePort(): Promise<number> {
  const socket = createTcpServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (typeof address !== 'object' || address === null)
    throw new Error('port missing');
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return address.port;
}

async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for socket');
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

async function withRoom<T extends SeatHarnessRoom>(
  roomClass: typeof SeatHarnessRoom,
  test: (room: T, server: ColyseusTestServer) => Promise<void>,
): Promise<void> {
  const port = await freePort();
  const server = createServer(
    { ...loadServerConfig({}), port },
    pino({ level: 'silent' }),
    roomClass,
  );
  let testServer: ColyseusTestServer | undefined;
  try {
    await server.listen(port, '127.0.0.1');
    testServer = new ColyseusTestServer(server);
    const room = await testServer.createRoom<T>('arena', { code: 'ABC234' });
    room.stopTestLoop();
    await test(room, testServer);
  } finally {
    await testServer?.cleanup();
    await testServer?.shutdown();
  }
}

describe('AT-NET-10 real room seat lifecycle', () => {
  it('starts eight unique idle bots in one canonical COUNTDOWN and feeds neutral frames', async () => {
    await withRoom<SeatHarnessRoom>(SeatHarnessRoom, async (room, server) => {
      const world = room.testWorld;
      expect(world.players).toHaveLength(BALANCE.match.seats);
      expect(
        world.players.every(
          (player) => player?.isBot && player.controller === Controller.Bot,
        ),
      ).toBe(true);
      expect(
        world.players.every(
          (player) =>
            player !== null &&
            Object.values(player.abilityReadyTick).every(
              (tick) => tick === 0,
            ) &&
            Object.values(player.gunTimers).every((timer) => timer === 0) &&
            player.heat === 0 &&
            player.morph === null &&
            player.ability === null,
        ),
      ).toBe(true);
      expect(world.players.map((player) => player?.seat)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7,
      ]);
      expect(new Set(world.players.map((player) => player?.id)).size).toBe(
        BALANCE.match.seats,
      );
      expect(world.players.map((player) => player?.name)).toEqual([
        'Bot 1',
        'Bot 2',
        'Bot 3',
        'Bot 4',
        'Bot 5',
        'Bot 6',
        'Bot 7',
        'Bot 8',
      ]);
      expect(world.matchIndex).toBe(0);
      expect(world.matchId).toBe(`match:${world.roomSeed}:0`);
      expect(world.phase).toBe(Phase.Countdown);
      expect(
        world.players.every(
          (player) =>
            player?.alive &&
            player.form === Form.Runner &&
            player.hpFrac === 1 &&
            player.flux === BALANCE.flux.start &&
            player.aimSource === AimSource.Bot &&
            player.protectedEndTick === 0,
        ),
      ).toBe(true);
      expect(
        new Set(
          world.players.map((player) => `${player?.pos.x},${player?.pos.y}`),
        ).size,
      ).toBe(BALANCE.match.seats);
      expect(world.recentSpawns).toHaveLength(2);
      expect(world.events).toEqual([]);
      expect(room.state.settings.botFill).toBe(true);
      expect(
        [...room.state.players.values()].every(
          (player) => player.connected === false && player.controller === 1,
        ),
      ).toBe(true);
      const positions = world.players.map((player) => ({ ...player?.pos }));
      const aims = world.players.map((player) => player?.aim);
      for (let tick = 1; tick <= 3; tick += 1) {
        room.advanceTestTick();
        expect(world.players.map((player) => player?.lastInputSeq)).toEqual(
          Array.from({ length: BALANCE.match.seats }, () => tick),
        );
      }
      expect(world.players.map((player) => player?.pos)).toEqual(positions);
      expect(world.players.map((player) => player?.aim)).toEqual(aims);
      expect(world.projectiles).toHaveLength(0);
      expect(
        world.events.filter((event) =>
          ['morphStart', 'abilityStart', 'projectileSpawn'].includes(
            event.type,
          ),
        ),
      ).toEqual([]);
      const first = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: 'ABC234',
        name: 'Alice',
      });
      expect(world.events.some((event) => event.type === 'shardSpawn')).toBe(
        false,
      );
      await first.leave(true);
    });
  }, 10000);

  it('AT-NET-10 AT-LOAD-07 replaces the idle lowest scorer in the same tick with ordered terminal events', async () => {
    await withRoom<SeatHarnessRoom>(SeatHarnessRoom, async (room, server) => {
      const observer = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: 'ABC234',
        name: 'Observer',
      });
      expect(room.testWorld.players[7]?.id).toBe(observer.sessionId);
      const batches: unknown[] = [];
      observer.onMessage(ServerMessageId.Ev, (payload: unknown) =>
        batches.push(payload),
      );
      room.setPlaying();
      for (const player of room.testWorld.players)
        if (player?.isBot) player.stats.kos = 10;
      playerAt(room.testWorld.players, 5).stats.kos = 1;
      playerAt(room.testWorld.players, 5).unlocked = {
        [Form.Runner]: true, [Form.Beast]: true, [Form.Turret]: true,
      };
      playerAt(room.testWorld.players, 6).stats.kos = 0;
      room.applyTestDamage(6, 4);
      const removedBotId = playerAt(room.testWorld.players, 5).id;
      const projectile = room.spawnTestProjectile(5);
      const otherProjectile = room.spawnTestProjectile(3);
      const otherIds = room.testWorld.players.map((player) => player?.id);
      const tick = room.testWorld.tick;
      const human = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: 'ABC234',
        name: ' Human ',
      });
      await until(() => batches.length === 1);
      expect(room.testWorld.tick).toBe(tick);
      expect(room.testWorld.players[5]).toMatchObject({
        id: human.sessionId,
        name: 'Human',
        seat: 5,
        isBot: false,
        controller: Controller.Human,
      });
      expect(room.state.players.get(human.sessionId)).toMatchObject({
        connected: true,
        seat: 5,
        isBot: false,
      });
      expect(room.state.players.has(removedBotId)).toBe(false);
      // GR-18.5: the joining human never inherits the replaced bot's progress.
      expect(playerAt(room.testWorld.players, 5).unlocked).toEqual({
        [Form.Runner]: true, [Form.Beast]: false, [Form.Turret]: false,
      });
      expect(playerAt(room.testWorld.players, 5).stats.kos).toBe(0);
      expect(room.state.players.get(human.sessionId)?.unlockedMask).toBe(1);
      expect(
        room.testWorld.projectiles.some((item) => item.id === projectile.id),
      ).toBe(false);
      expect(
        room.testWorld.projectiles.some(
          (item) => item.id === otherProjectile.id,
        ),
      ).toBe(true);
      for (let seat = 0; seat < 8; seat += 1)
        if (seat !== 5)
          expect(room.testWorld.players[seat]?.id).toBe(otherIds[seat]);
      expect(room.welcomes.at(-1)).toEqual({
        playerId: human.sessionId,
        seat: 5,
      });
      const batch = batches[0] as [number, ...EncodedEvent[]];
      expect(batch[0]).toBe(tick);
      expect(batch.slice(1, 3)).toEqual([
        [EventId.BotReplaced, 5, human.sessionId],
        [EventId.ProjectileExpire, projectile.id],
      ]);
      expect(batch[3]?.[0]).toBe(EventId.Spawn);
      expect(batch).toHaveLength(4);
      expect(room.testWorld.players[5]?.protectedEndTick).toBe(
        tick + DERIVED.match.spawnProtectionTicks,
      );
      expect(room.testWorld.players[5]?.stats.kos).toBe(0);
      expect(
        room.testWorld.events.filter((event) =>
          ['death', 'shardSpawn'].includes(event.type),
        ),
      ).toEqual([]);
      human.send(ClientMessageId.Input, [
        1,
        0,
        0,
        0,
        0,
        ClientAimSourceCode.Mouse,
        120, ...Array(8).fill(0),
      ]);
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      room.advanceTestTick();
      expect(room.testWorld.players[5]?.lastInputSeq).toBe(1);
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      expect(batches).toHaveLength(1);
      await human.leave(true);
      await observer.leave(true);
    });
  }, 10000);

  it('falls back to active bots and rejects a ninth human with 4001', async () => {
    await withRoom<SeatHarnessRoom>(SeatHarnessRoom, async (room, server) => {
      const world = room.testWorld;
      room.setPlaying();
      for (let seat = 0; seat < BALANCE.match.seats; seat += 1) {
        playerAt(world.players, seat).stats.kos = 10;
      }
      playerAt(world.players, 2).stats.kos = 0;
      for (let seat = 0; seat < BALANCE.match.seats; seat += 1)
        room.applyTestDamage(seat, (seat + 1) % BALANCE.match.seats);
      const clients = [];
      for (let seat = 0; seat < BALANCE.match.seats; seat += 1) {
        clients.push(
          await server.connectTo(room, {
            protocolVersion: PROTOCOL_VERSION,
            code: 'ABC234',
          }),
        );
      }
      expect(clients[0]?.sessionId).toBe(world.players[2]?.id);
      expect(
        world.players.every((player) => player !== null && !player.isBot),
      ).toBe(true);
      await expect(
        server.connectTo(room, {
          protocolVersion: PROTOCOL_VERSION,
          code: 'ABC234',
        }),
      ).rejects.toMatchObject({ code: CloseCode.RoomFull });
      expect(
        world.players.every((player) => player !== null && !player.isBot),
      ).toBe(true);
      for (const client of clients) await client.leave(true);
    });
  }, 10000);

  it('final leave transfers the same life to a fresh bot and is idempotent', async () => {
    await withRoom<SeatHarnessRoom>(SeatHarnessRoom, async (room, server) => {
      const first = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: 'ABC234',
        name: 'Alice',
      });
      const observer = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: 'ABC234',
        name: 'Bob',
      });
      const seat = room.testWorld.players.findIndex(
        (player) => player?.id === first.sessionId,
      );
      const human = playerAt(room.testWorld.players, seat);
      room.setPlaying();
      const projectile = room.spawnTestProjectile(seat);
      human.pos = { x: 1, y: 2 };
      human.vel = { x: 0.4, y: 0.2 };
      human.aim = 1.2;
      human.form = Form.Beast;
      human.hpFrac = 0.5;
      human.flux = 23;
      human.morph = { target: Form.Turret, endTick: room.testWorld.tick + 10 };
      human.morphReadyTick = 90;
      human.gunTimers.scatterCannon = 3;
      human.guns.slugCannon = { owned: true, mag: 2, reserve: 8 };
      human.selectedTier.beast = 2;
      human.unlocked.beast = true;
      human.abilityReadyTick.beast = 120;
      human.stunEndTick = 50;
      human.knockback = { vel: { x: 1, y: 0 }, endTick: 15 };
      human.stats.kos = 4;
      human.stats.hits.byWeapon.scatterCannon = 2;
      human.lastHeldButtons = 1;
      const batches: unknown[] = [];
      observer.onMessage(ServerMessageId.Ev, (payload: unknown) =>
        batches.push(payload),
      );
      const life = JSON.parse(JSON.stringify(human)) as PlayerRecord;
      const serverFirst = room.clients.find(
        (client) => client.sessionId === first.sessionId,
      );
      if (serverFirst === undefined) throw new Error('missing server client');
      await first.leave(true);
      const bot = playerAt(room.testWorld.players, seat);
      expect(bot).toMatchObject({
        id: 'bot-9',
        name: 'Bot 9',
        isBot: true,
        controller: Controller.Bot,
        aimSource: AimSource.Bot,
        alive: true,
      });
      for (const field of [
        'pos',
        'vel',
        'aim',
        'form',
        'hpFrac',
        'flux',
        'morph',
        'morphReadyTick',
        'gunTimers',
        'guns',
        'selectedTier',
        'unlocked',
        'abilityReadyTick',
        'stunEndTick',
        'knockback',
        'stats',
      ] as const)
        expect(bot[field]).toEqual(life[field]);
      expect(bot.stats).not.toBe(human.stats);
      expect(bot.lastHeldButtons).toBe(0);
      expect(room.state.players.has(first.sessionId)).toBe(false);
      expect(room.state.players.get(bot.id)?.connected).toBe(false);
      expect(
        room.testWorld.projectiles.some((item) => item.id === projectile.id),
      ).toBe(false);
      await until(() => batches.length === 1);
      expect(batches[0]).toEqual([
        room.testWorld.tick,
        [EventId.ProjectileExpire, projectile.id],
      ]);
      room.finalizeTestClient(serverFirst);
      expect(room.testWorld.players[seat]?.id).toBe(bot.id);
      room.advanceTestTick();
      expect(bot.lastInputSeq).toBeGreaterThan(life.lastInputSeq);
      expect(room.testWorld.projectiles).toHaveLength(0);
      expect(
        room.testWorld.events.some((event) =>
          ['death', 'spawn', 'respawn'].includes(event.type),
        ),
      ).toBe(false);
      for (const other of room.testWorld.players)
        if (other?.isBot && other.id !== bot.id) other.stats.kos = 10;
      const replacement = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: 'ABC234',
        name: 'Carol',
      });
      expect(room.testWorld.players[seat]?.id).toBe(replacement.sessionId);
      await replacement.leave(true);
      expect(room.testWorld.players[seat]?.id).toBe('bot-10');
      await observer.leave(true);
    });
  }, 10000);

  it('spawns a countdown join without protection and defers a results join', async () => {
    await withRoom<SeatHarnessRoom>(SeatHarnessRoom, async (room, server) => {
      const first = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: 'ABC234',
      });
      const countdownSeat = room.testWorld.players.findIndex(
        (player) => player?.id === first.sessionId,
      );
      expect(room.testWorld.players[countdownSeat]?.alive).toBe(true);
      expect(room.testWorld.players[countdownSeat]?.protectedEndTick).toBe(
        room.testWorld.tick,
      );
      room.testWorld.phase = Phase.Results;
      room.testWorld.phaseEndTick =
        room.testWorld.tick + DERIVED.match.resultsTicks;
      const next = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: 'ABC234',
      });
      const resultsSeat = room.testWorld.players.findIndex(
        (player) => player?.id === next.sessionId,
      );
      expect(room.testWorld.players[resultsSeat]?.alive).toBe(false);
      expect(
        room.testWorld.events.some(
          (event) => event.type === 'spawn' && event.seat === resultsSeat,
        ),
      ).toBe(false);
      await next.leave(true);
      await first.leave(true);
    });
  }, 10000);

  it('leaves bot-fill-off seats empty and reuses the lowest available seat', async () => {
    await withRoom<EmptySeatHarnessRoom>(
      EmptySeatHarnessRoom,
      async (room, server) => {
        expect(room.state.settings.botFill).toBe(false);
        expect(room.testWorld.players.every((player) => player === null)).toBe(
          true,
        );
        const first = await server.connectTo(room, {
          protocolVersion: PROTOCOL_VERSION,
          code: 'ABC234',
        });
        const observer = await server.connectTo(room, {
          protocolVersion: PROTOCOL_VERSION,
          code: 'ABC234',
        });
        expect(room.testWorld.players[0]?.id).toBe(first.sessionId);
        await first.leave(true);
        expect(room.testWorld.players[0]).toBeNull();
        const next = await server.connectTo(room, {
          protocolVersion: PROTOCOL_VERSION,
          code: 'ABC234',
        });
        expect(room.testWorld.players[0]?.id).toBe(next.sessionId);
        await next.leave(true);
        await observer.leave(true);
      },
    );
  }, 10000);
});
