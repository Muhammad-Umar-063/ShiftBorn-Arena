import { EventId, type EncodedEvent } from '@shiftborn/shared';
import type { SimEvent } from '@shiftborn/sim';

export type EventBatch = readonly [tick: number, ...events: EncodedEvent[]];

/** NETWORK_PROTOCOL §5.3: preserve protocol string values and event order. */
export function encodeSimEvent(event: SimEvent): EncodedEvent | null {
  switch (event.type) {
    case 'projectileSpawn':
      return [
        EventId.ProjectileSpawn,
        event.id,
        event.ownerSeat,
        event.weapon,
        event.x,
        event.y,
        event.angle,
        event.spawnTick,
        event.advancedTicks,
        event.inputSeq,
        event.shotIdx,
        event.landTick,
        event.targetX,
        event.targetY,
      ];
    case 'projectileHit':
      return [
        EventId.ProjectileHit,
        event.id,
        event.targetSeat,
        event.damage,
        event.tags,
        event.x,
        event.y,
      ];
    case 'projectileImpact':
      return [EventId.ProjectileImpact, event.id, event.x, event.y];
    case 'projectileExpire':
      return [EventId.ProjectileExpire, event.id];
    case 'blocked':
      return [EventId.Blocked, event.id, event.targetSeat];
    case 'morphStart':
      return [
        EventId.MorphStart,
        event.seat,
        event.from,
        event.to,
        event.endTick,
      ];
    case 'morphEnd':
      return [EventId.MorphEnd, event.seat, event.form];
    case 'morphDenied':
      return [EventId.MorphDenied, event.seat, event.target, event.reason];
    case 'abilityStart':
      return [
        EventId.AbilityStart,
        event.seat,
        event.ability,
        event.startTick,
        event.endTick,
        event.dirX,
        event.dirY,
      ];
    case 'abilityEnd':
      return [EventId.AbilityEnd, event.seat, event.ability, event.cancelled];
    case 'overheat':
      return [EventId.Overheat, event.seat, event.endTick];
    case 'death':
      return [
        EventId.Death,
        event.victimSeat,
        event.killerSeat,
        event.cause,
        event.killerForm,
        event.victimForm,
        event.finalDamage,
        event.counterForm,
        ...event.assisters.map((assistant) => assistant.seat),
      ];
    case 'spawn':
      return [
        EventId.Spawn,
        event.seat,
        event.x,
        event.y,
        event.protectedEndTick,
      ];
    case 'respawn':
      return [
        EventId.Respawn,
        event.seat,
        event.pos.x,
        event.pos.y,
        event.protectedEndTick,
      ];
    case 'shardSpawn':
      return [EventId.ShardSpawn, event.shardId];
    case 'shardPickup':
      return [EventId.ShardPickup, event.shardId, event.seat, event.value];
    case 'shardExpire':
      return [EventId.ShardExpire, event.shardId];
    case 'clusterAnnounce':
      return [EventId.ClusterAnnounce, event.pointIndex, event.spawnTick];
    case 'phase':
      return [EventId.Phase, event.phase, event.phaseEndTick];
    case 'formUnlocked':
      return [EventId.FormUnlocked, event.seat, event.form];
    case 'reloadStart':
      return [EventId.ReloadStart, event.seat, event.gun, event.endTick];
    case 'reloadEnd':
      return [EventId.ReloadEnd, event.seat, event.gun, event.completed];
    case 'weaponSwap':
      return [EventId.WeaponSwap, event.seat, event.gun, event.readyTick];
    case 'meleeStart':
      return [EventId.MeleeStart, event.seat, event.strikeTick, event.endTick];
    case 'meleeStrike':
      return [
        EventId.MeleeStrike,
        event.seat,
        event.targetSeat,
        event.damage,
        event.tags,
        event.x2,
        event.y2,
      ];
    case 'projectileBounce':
      return [EventId.ProjectileBounce, event.id, event.x, event.y, event.angle];
    case 'mortarBlast':
      return [EventId.MortarBlast, event.id, event.x, event.y];
    case 'lootSpawn':
      return [EventId.LootSpawn, event.lootId, event.gun, event.x, event.y];
    case 'lootPickup':
      return [EventId.LootPickup, event.lootId, event.seat, event.gun, event.kind];
    // Internal-only events and future event producers have no complete wire tuple.
    case 'damage':
    case 'score':
    case 'positionClamped':
    case 'abilityHit':
    case 'railShotFired':
    case 'stun':
    case 'knockback':
    case 'coverDestroyed':
    case 'coverRebuilt':
    case 'zoneAnnounce':
    case 'zoneMoved':
    case 'zoneState':
    case 'matchEnd':
      return null;
  }
}

export function encodeSimEvents(events: readonly SimEvent[]): EncodedEvent[] {
  const encoded: EncodedEvent[] = [];
  for (const event of events) {
    const tuple = encodeSimEvent(event);
    if (tuple !== null) encoded.push(tuple);
  }
  return encoded;
}

/** Empty or network-empty ticks do not create a message. */
export function createEventBatch(
  tick: number,
  events: readonly EncodedEvent[],
): EventBatch | null {
  return events.length === 0 ? null : [tick, ...events];
}
