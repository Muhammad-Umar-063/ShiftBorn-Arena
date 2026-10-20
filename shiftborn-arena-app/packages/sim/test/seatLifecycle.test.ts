import {
  AimSource,
  BALANCE,
  Controller,
  Form,
  GREYBOX_V1,
  Mode,
  Phase,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { handoffPlayerToBot, removePlayer } from '../src/player.js';
import { removeOwnedProjectiles, spawnProjectile } from '../src/projectiles.js';
import { createWorld } from '../src/world.js';
import { projectileRecord } from './fixtures/projectileRecord.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';

describe('GR-2.4 and BOT_SPEC §9 initial seat lifecycle', () => {
  it('starts all initial seats with one seeded shuffle and one match initialization', () => {
    const initialPlayers = Array.from(
      { length: BALANCE.match.seats },
      (_, seat) => ({
        id: `bot-${seat + 1}`,
        name: `Bot ${seat + 1}`,
        isBot: true,
        seat,
      }),
    );
    const world = createWorld({
      map: GREYBOX_V1,
      roomSeed: 91,
      mode: Mode.Frenzy,
      initialPlayers,
    });
    const again = createWorld({
      map: GREYBOX_V1,
      roomSeed: 91,
      mode: Mode.Frenzy,
      initialPlayers,
    });
    expect(world.matchIndex).toBe(0);
    expect(world.matchId).toBe('match:91:0');
    expect(world.phase).toBe(Phase.Countdown);
    expect(world.players.map((player) => player?.pos)).toEqual(
      again.players.map((player) => player?.pos),
    );
    expect(
      new Set(
        world.players.map((player) => `${player?.pos.x},${player?.pos.y}`),
      ).size,
    ).toBe(BALANCE.match.seats);
    expect(world.events.filter((event) => event.type === 'spawn')).toHaveLength(
      BALANCE.match.seats,
    );
    expect(
      world.players.every(
        (player) =>
          player?.alive &&
          player.hpFrac === 1 &&
          player.flux === BALANCE.flux.start &&
          player.form === Form.Runner &&
          player.protectedEndTick === world.tick,
      ),
    ).toBe(true);
    expect(world.recentSpawns).toHaveLength(2);
    const first = initialPlayers[0];
    if (first === undefined) throw new Error('initial player missing');
    expect(() =>
      createWorld({
        map: GREYBOX_V1,
        roomSeed: 91,
        mode: Mode.Frenzy,
        initialPlayers: [...initialPlayers, first],
      }),
    ).toThrow(RangeError);
  });

  it('GR-7.8 emits sorted owner-only projectile expiry on removal and retains pool reuse', () => {
    const world = makeTestWorld({
      seed: 92,
      players: [
        { id: 'human', name: 'Human', isBot: false, seat: 0 },
        { id: 'other', name: 'Other', isBot: false, seat: 1 },
      ],
    });
    const owner = world.players[0];
    if (owner === null || owner === undefined) throw new Error('owner missing');
    world.phase = Phase.Playing;
    world.events.length = 0;
    const records = [
      projectileRecord(9),
      projectileRecord(3),
      projectileRecord(5),
      projectileRecord(4),
    ];
    records[0]!.ownerId = 'human';
    records[1]!.ownerId = 'other';
    records[2]!.ownerId = 'human';
    records[3]!.ownerId = 'human';
    world.projectiles.push(...records);
    world.nextProjectileId = 10;
    owner.stats.damageTaken = 7;
    removePlayer(world, 'human');
    expect(world.projectiles.map((item) => item.id)).toEqual([3]);
    expect(
      world.projectilePool.map((item) => item.id).sort((a, b) => a - b),
    ).toEqual([4, 5, 9]);
    expect(world.events).toEqual([
      { type: 'projectileExpire', id: 4 },
      { type: 'projectileExpire', id: 5 },
      { type: 'projectileExpire', id: 9 },
    ]);
    expect(
      world.events.some((event) =>
        ['death', 'shardSpawn', 'projectileImpact', 'projectileHit'].includes(
          event.type,
        ),
      ),
    ).toBe(false);
    expect(owner.stats.damageTaken).toBe(7);
    removeOwnedProjectiles(world, 'human');
    expect(world.events).toHaveLength(3);
    const survivor = world.players[1];
    if (survivor === null || survivor === undefined)
      throw new Error('survivor missing');
    const recycled = spawnProjectile(world, survivor, 0, 6, 2, 0);
    expect(recycled).not.toBeNull();
    expect(recycled?.id).toBe(10);
    expect(recycled?.ownerId).toBe('other');
    expect(recycled?.ownerName).toBe('Other');
    expect(recycled?.ownerSeat).toBe(1);
    expect(recycled?.ownerForm).toBe(survivor.form);
    expect(recycled?.inputSeq).toBe(6);
    expect(recycled?.shotIdx).toBe(2);
    expect(recycled?.traveledM).toBe(0);
    expect(recycled?.spawnTick).toBe(world.tick);
  });

  it('keeps an alive or dead human life and stats when transferring identity to a bot', () => {
    const world = makeTestWorld({
      seed: 93,
      players: [{ id: 'human', name: 'Human', isBot: false, seat: 2 }],
    });
    const human = world.players[2];
    if (human === null || human === undefined) throw new Error('human missing');
    human.pos = { x: 3, y: 4 };
    human.vel = { x: 0.5, y: -0.5 };
    human.morph = { target: Form.Beast, endTick: 50 };
    human.stats.hits.byWeapon.pulsePistol = 3;
    human.lastHeldButtons = 1;
    world.events.length = 0;
    const bot = handoffPlayerToBot(world, 'human', {
      id: 'bot-9',
      name: 'Bot 9',
    });
    expect(bot).toMatchObject({
      id: 'bot-9',
      seat: 2,
      isBot: true,
      controller: Controller.Bot,
      aimSource: AimSource.Bot,
      pos: { x: 3, y: 4 },
      vel: { x: 0.5, y: -0.5 },
      morph: { target: Form.Beast, endTick: 50 },
      lastHeldButtons: 0,
    });
    expect(bot.stats.hits.byWeapon.pulsePistol).toBe(3);
    expect(bot.stats).not.toBe(human.stats);
    expect(bot.pos).not.toBe(human.pos);
    expect(bot.morph).not.toBe(human.morph);
    expect(world.events).toEqual([]);
    const deadWorld = makeTestWorld({
      seed: 94,
      players: [{ id: 'dead-human', name: 'Dead', isBot: false, seat: 2 }],
    });
    const deadHuman = deadWorld.players[2];
    if (deadHuman === null || deadHuman === undefined)
      throw new Error('dead human missing');
    deadHuman.alive = false;
    deadHuman.respawnTick = 100;
    deadWorld.events.length = 0;
    const deadBot = handoffPlayerToBot(deadWorld, deadHuman.id, {
      id: 'bot-10',
      name: 'Bot 10',
    });
    expect(deadBot.alive).toBe(false);
    expect(deadBot.respawnTick).toBe(100);
    expect(deadWorld.events).toEqual([]);
  });
});
