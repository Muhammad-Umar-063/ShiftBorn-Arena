import {
  AbilityId,
  Cause,
  EventId,
  Form,
  MorphDenialReason,
  Phase,
  WeaponId,
  type EncodedEvent,
} from '@shiftborn/shared';
import type { SimEvent } from '@shiftborn/sim';
import { describe, expect, it } from 'vitest';
import {
  createEventBatch,
  encodeSimEvent,
  encodeSimEvents,
} from '../src/rooms/eventBatcher.js';

const cases: readonly { source: SimEvent; encoded: EncodedEvent }[] = [
  {
    source: {
      type: 'projectileSpawn',
      id: 4,
      ownerSeat: 2,
      weapon: WeaponId.PulsePistol,
      x: 1,
      y: 2,
      angle: 3,
      spawnTick: 10,
      advancedTicks: 1,
      inputSeq: 7,
      shotIdx: 0,
    },
    encoded: [
      EventId.ProjectileSpawn,
      4,
      2,
      WeaponId.PulsePistol,
      1,
      2,
      3,
      10,
      1,
      7,
      0,
    ],
  },
  {
    source: {
      type: 'projectileHit',
      id: 4,
      targetSeat: 1,
      damage: 12,
      tags: 3,
      x: 1,
      y: 2,
    },
    encoded: [EventId.ProjectileHit, 4, 1, 12, 3, 1, 2],
  },
  {
    source: { type: 'projectileImpact', id: 4, x: 1, y: 2 },
    encoded: [EventId.ProjectileImpact, 4, 1, 2],
  },
  {
    source: { type: 'projectileExpire', id: 4 },
    encoded: [EventId.ProjectileExpire, 4],
  },
  {
    source: { type: 'blocked', id: 4, targetSeat: 1 },
    encoded: [EventId.Blocked, 4, 1],
  },
  {
    source: {
      type: 'morphStart',
      seat: 1,
      from: Form.Runner,
      to: Form.Beast,
      endTick: 20,
    },
    encoded: [EventId.MorphStart, 1, Form.Runner, Form.Beast, 20],
  },
  {
    source: { type: 'morphEnd', seat: 1, form: Form.Beast },
    encoded: [EventId.MorphEnd, 1, Form.Beast],
  },
  {
    source: {
      type: 'morphDenied',
      seat: 1,
      target: Form.Turret,
      reason: MorphDenialReason.Cooldown,
    },
    encoded: [EventId.MorphDenied, 1, Form.Turret, MorphDenialReason.Cooldown],
  },
  {
    source: {
      type: 'abilityStart',
      seat: 1,
      ability: AbilityId.Dash,
      startTick: 5,
      endTick: 11,
      dirX: 0.5,
      dirY: 0.5,
    },
    encoded: [EventId.AbilityStart, 1, AbilityId.Dash, 5, 11, 0.5, 0.5],
  },
  {
    source: {
      type: 'abilityEnd',
      seat: 1,
      ability: AbilityId.Dash,
      cancelled: 1,
    },
    encoded: [EventId.AbilityEnd, 1, AbilityId.Dash, 1],
  },
  {
    source: { type: 'overheat', seat: 2, endTick: 45 },
    encoded: [EventId.Overheat, 2, 45],
  },
  {
    source: {
      type: 'death',
      victimId: 'v',
      victimSeat: 1,
      victimForm: Form.Beast,
      killerId: 'k',
      killerSeat: 2,
      killerName: 'K',
      killerForm: Form.Runner,
      cause: Cause.PulsePistol,
      finalDamage: 27,
      counterForm: Form.Runner,
      assisters: [
        { id: 'a', seat: 3 },
        { id: 'b', seat: 0 },
      ],
    },
    encoded: [
      EventId.Death,
      1,
      2,
      Cause.PulsePistol,
      Form.Runner,
      Form.Beast,
      27,
      Form.Runner,
      3,
      0,
    ],
  },
  {
    source: { type: 'spawn', seat: 2, x: 4, y: 5, protectedEndTick: 0 },
    encoded: [EventId.Spawn, 2, 4, 5, 0],
  },
  {
    source: {
      type: 'respawn',
      seat: 2,
      pos: { x: 4, y: 5 },
      protectedEndTick: 30,
    },
    encoded: [EventId.Respawn, 2, 4, 5, 30],
  },
  {
    source: { type: 'shardSpawn', shardId: 8 },
    encoded: [EventId.ShardSpawn, 8],
  },
  {
    source: { type: 'shardPickup', shardId: 8, seat: 1, value: 20 },
    encoded: [EventId.ShardPickup, 8, 1, 20],
  },
  {
    source: { type: 'shardExpire', shardId: 8 },
    encoded: [EventId.ShardExpire, 8],
  },
  {
    source: { type: 'clusterAnnounce', pointIndex: 3, spawnTick: 90 },
    encoded: [EventId.ClusterAnnounce, 3, 90],
  },
  {
    source: { type: 'phase', phase: Phase.Playing, phaseEndTick: 5400 },
    encoded: [EventId.Phase, Phase.Playing, 5400],
  },
];

describe('T-023 NETWORK_PROTOCOL §5.3 event batching', () => {
  it.each(cases)(
    'encodes current $source.type tuple exactly',
    ({ source, encoded }) => {
      expect(encodeSimEvent(source)).toEqual(encoded);
    },
  );

  it('filters internal and payload-incomplete future markers', () => {
    const internal: SimEvent[] = [
      { type: 'score' },
      { type: 'positionClamped' },
      { type: 'abilityHit' },
      { type: 'railShotFired' },
      { type: 'stun' },
      { type: 'knockback' },
      { type: 'coverDestroyed' },
      { type: 'coverRebuilt' },
      { type: 'zoneAnnounce' },
      { type: 'zoneMoved' },
      { type: 'zoneState' },
      { type: 'matchEnd' },
    ];
    expect(encodeSimEvents(internal)).toEqual([]);
    expect(createEventBatch(10, encodeSimEvents(internal))).toBeNull();
    expect(createEventBatch(10, [])).toBeNull();
  });

  it('preserves event order and source values across separate tick batches', () => {
    const events: SimEvent[] = [
      { type: 'projectileExpire', id: 1 },
      { type: 'positionClamped' },
      { type: 'morphEnd', seat: 0, form: Form.Beast },
    ];
    const before = JSON.stringify(events);
    const first = createEventBatch(12, encodeSimEvents(events));
    const next = createEventBatch(
      13,
      encodeSimEvents([
        { type: 'phase', phase: Phase.Results, phaseEndTick: 99 },
      ]),
    );
    expect(first).toEqual([
      12,
      [EventId.ProjectileExpire, 1],
      [EventId.MorphEnd, 0, Form.Beast],
    ]);
    expect(next).toEqual([13, [EventId.Phase, Phase.Results, 99]]);
    expect(JSON.stringify(events)).toBe(before);
  });
});
