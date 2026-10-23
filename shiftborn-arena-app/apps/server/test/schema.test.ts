import { Decoder, Encoder, Metadata } from '@colyseus/schema';
import { describe, expect, it } from 'vitest';
import {
  ArenaState,
  ClusterAnnounce,
  CoverState,
  PlayerState, LocomotionState, LootState,
  RoomSettings,
  ShardState,
  ZoneState,
} from '../src/rooms/schema.js';

describe('T-021 NETWORK_PROTOCOL §4.2 schema', () => {
  it('uses the documented wire widths and collection types', () => {
    expect(Metadata.getFields(ArenaState)).toMatchObject({
      tick: 'uint32',
      phase: 'uint8',
      phaseEndTick: 'uint32',
      mode: 'uint8',
      matchId: 'string',
      matchIndex: 'uint16',
      hostId: 'string',
      settings: RoomSettings,
      players: { map: PlayerState },
      shards: { map: ShardState },
      loot: { map: LootState },
      clusterAnnounces: { array: ClusterAnnounce },
      cover: { array: CoverState },
      zone: ZoneState,
    });
    expect(Metadata.getFields(RoomSettings)).toEqual({
      botFill: 'boolean',
      botDifficulty: 'uint8',
      nextMode: 'uint8',
    });
    expect(Metadata.getFields(PlayerState)).toMatchObject({ locomotion: LocomotionState,
      seat: 'uint8',
      controller: 'uint8',
      connected: 'boolean',
      x: 'float32',
      morphTarget: 'int8',
      abilityId: 'int8',
      abilityPhase: 'uint8',
      abilityEndTick: 'uint32',
      damageDealt: 'float32',
      lastInputSeq: 'uint32',
      aimSource: 'uint8',
    });
    expect(Metadata.getFields(ShardState)).toEqual({
      x: 'float32',
      y: 'float32',
      value: 'uint8',
      kind: 'uint8',
      expiresTick: 'uint32',
    });
    expect(Metadata.getFields(ClusterAnnounce)).toEqual({
      pointIndex: 'uint8',
      spawnTick: 'uint32',
    });
    expect(Metadata.getFields(CoverState)).toEqual({
      intact: 'boolean',
      rebuildTick: 'uint32',
    });
    expect(Metadata.getFields(ZoneState)).toEqual({
      active: 'boolean',
      point: 'int8',
      nextPoint: 'int8',
      moveTick: 'uint32',
      state: 'uint8',
      holderId: 'string',
    });
  });

  it('has sentinels and fresh nested objects per room', () => {
    const first = new ArenaState();
    const second = new ArenaState();
    expect(first.settings).not.toBe(second.settings);
    expect(first.players).not.toBe(second.players);
    expect(first.shards).not.toBe(second.shards);
    expect(first.clusterAnnounces).not.toBe(second.clusterAnnounces);
    expect(first.cover).not.toBe(second.cover);
    expect(first.zone).not.toBe(second.zone);
    expect(first.zone.point).toBe(-1);
    expect(first.zone.nextPoint).toBe(-1);
    const player = new PlayerState();
    expect(player.morphTarget).toBe(-1);
    expect(player.abilityId).toBe(-1);
    expect(player.abilityPhase).toBe(0);
    expect(player.lastInputSeq).toBe(0);
    expect(first.hostId).toBe('');
  });

  it('round-trips nested schema state', () => {
    const source = new ArenaState();
    source.tick = 42;
    source.players.set('p', new PlayerState({ id: 'p', x: 1.25 }));
    const decoded = new ArenaState();
    new Decoder(decoded).decode(new Encoder(source).encodeAll());
    expect(decoded.tick).toBe(42);
    expect(decoded.players.get('p')?.x).toBeCloseTo(1.25, 5);
  });
});
