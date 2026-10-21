import { BALANCE, EventId, type EncodedEvent } from '@shiftborn/shared';
import type { EventBatch } from '../net/messageValidation.js';
import { validateEventTuple } from '../net/eventValidation.js';
import type { RemoteTimeline } from './remoteTimeline.js';

export type LocalFeedback =
  | { readonly kind: 'vitals'; readonly tick: number; readonly hpFrac: number;
      readonly flux: number; readonly alive: boolean }
  | { readonly kind: 'damageTaken'; readonly tick: number;
      readonly projectileId: string | number; readonly ownerId: string | null;
      readonly damage: number; readonly tags: number; readonly x: number;
      readonly y: number }
  | { readonly kind: 'ownHit'; readonly tick: number;
      readonly source: 'projectile' | 'ability'; readonly targetId: string | null;
      readonly damage: number; readonly tags: number }
  | { readonly kind: 'death'; readonly tick: number;
      readonly killerId: string | null; readonly cause: string;
      readonly finalDamage: number };

export interface WorldDelivery {
  readonly tick: number;
  readonly order: number;
  readonly event: EncodedEvent;
  /** Stable identity at the event tick; never rebound to a later seat occupant. */
  readonly actorId: string | null;
  readonly projectileOwnerId: string | null;
}

const ATTRIBUTION_TICKS = BALANCE.tick.rateHz; // NETWORK_PROTOCOL §7 history horizon.
const MAX_QUEUED_EVENTS = BALANCE.tick.rateHz * BALANCE.match.seats *
  BALANCE.weapons.scatterCannon.pelletOffsetsDeg.length;

function projectileKey(id: string | number): string { return `${typeof id}:${id}`; }
function projectileId(event: EncodedEvent): string | number | null {
  switch (event[0]) {
    case EventId.ProjectileSpawn:
    case EventId.ProjectileHit:
    case EventId.ProjectileImpact:
    case EventId.ProjectileExpire:
    case EventId.Blocked: return event[1];
    default: return null;
  }
}
function actorSeat(event: EncodedEvent): number | null {
  switch (event[0]) {
    case EventId.ProjectileSpawn: return event[2];
    case EventId.ProjectileHit:
    case EventId.Blocked: return event[2];
    case EventId.ShardPickup: return event[2];
    case EventId.MorphStart:
    case EventId.MorphEnd:
    case EventId.MorphDenied:
    case EventId.AbilityStart:
    case EventId.AbilityEnd:
    case EventId.AbilityHit:
    case EventId.RailShotFired:
    case EventId.Stun:
    case EventId.Knockback:
    case EventId.Overheat:
    case EventId.Death:
    case EventId.Spawn:
    case EventId.Respawn:
    case EventId.BotReplaced: return event[1];
    default: return null;
  }
}

/** One delayed world queue with an independent immediate local delivery return. */
export class WorldEventTimeline {
  private readonly queue: WorldDelivery[] = [];
  private readonly owners = new Map<string, { readonly ownerId: string | null;
    readonly tick: number }>();
  private readonly seatTransitions = new Map<number, Array<{
    readonly id: string; readonly tick: number }>>();
  private nextOrder = 0;
  private newestTick = 0;

  constructor(private readonly remotes: RemoteTimeline) {}

  get queuedCount(): number { return this.queue.length; }
  get attributionCount(): number { return this.owners.size; }

  private identityAt(seat: number, tick: number): string | null {
    const frame = this.remotes.seatAt(seat, tick);
    const transitions = this.seatTransitions.get(seat) ?? [];
    for (let index = transitions.length - 1; index >= 0; index -= 1) {
      const transition = transitions[index];
      if (transition !== undefined && transition.tick <= tick &&
        (frame === null || transition.tick > frame.tick))
        return transition.id;
    }
    return frame?.id ?? null;
  }

  ingest(batch: EventBatch, localId: string): LocalFeedback[] {
    if (!Number.isSafeInteger(batch.tick) || batch.tick < 0) return [];
    this.newestTick = Math.max(this.newestTick, batch.tick);
    const valid = batch.events.flatMap((event) => {
      const checked = validateEventTuple(event);
      return checked === null ? [] : [checked];
    });
    // Bot replacement precedes its same-tick spawn, possibly before a Schema patch.
    for (const event of valid) if (event[0] === EventId.BotReplaced) {
      const transitions = this.seatTransitions.get(event[1]) ?? [];
      transitions.push({ id: event[2], tick: batch.tick });
      transitions.sort((a, b) => a.tick - b.tick);
      this.seatTransitions.set(event[1], transitions);
    }
    // A spawn and its hit may share a tick. Resolve ownership before routing hits.
    for (const event of valid) if (event[0] === EventId.ProjectileSpawn) {
      this.owners.set(projectileKey(event[1]), {
        ownerId: this.identityAt(event[2], batch.tick),
        tick: batch.tick,
      });
    }
    const immediate: LocalFeedback[] = [];
    for (const event of valid) {
      const seat = actorSeat(event);
      const actorId = seat === null ? null : event[0] === EventId.BotReplaced
        ? event[2] : this.identityAt(seat, batch.tick);
      const projectile = projectileId(event);
      const projectileOwnerId = projectile === null ? null
        : this.owners.get(projectileKey(projectile))?.ownerId ?? null;
      const delivery: WorldDelivery = { tick: batch.tick,
        order: this.nextOrder++, event, actorId, projectileOwnerId };
      const insertAt = this.queue.findIndex((queued) => queued.tick > batch.tick);
      if (insertAt < 0) this.queue.push(delivery);
      else this.queue.splice(insertAt, 0, delivery);
      if (event[0] === EventId.ProjectileHit) {
        if (actorId === localId) immediate.push({ kind: 'damageTaken',
          tick: batch.tick, projectileId: event[1], ownerId: projectileOwnerId,
          damage: event[3], tags: event[4], x: event[5], y: event[6] });
        if (projectileOwnerId === localId) immediate.push({ kind: 'ownHit',
          tick: batch.tick, source: 'projectile', targetId: actorId,
          damage: event[3], tags: event[4] });
      } else if (event[0] === EventId.AbilityHit && actorId === localId) {
        immediate.push({ kind: 'ownHit', tick: batch.tick, source: 'ability',
          targetId: this.identityAt(event[3], batch.tick),
          damage: event[4], tags: event[5] });
      } else if (event[0] === EventId.Death && actorId === localId) {
        immediate.push({ kind: 'death', tick: batch.tick,
          killerId: event[2] < 0 ? null : this.identityAt(event[2], batch.tick),
          cause: event[3], finalDamage: event[6] });
      }
    }
    while (this.queue.length > MAX_QUEUED_EVENTS) this.queue.shift();
    for (const [key, owner] of this.owners)
      if (owner.tick < this.newestTick - ATTRIBUTION_TICKS) this.owners.delete(key);
    for (const [seat, transitions] of this.seatTransitions) {
      while (transitions[0] !== undefined &&
        transitions[0].tick < this.newestTick - ATTRIBUTION_TICKS)
        transitions.shift();
      if (transitions.length === 0) this.seatTransitions.delete(seat);
    }
    return immediate;
  }

  due(renderTick: number): WorldDelivery[] {
    const result: WorldDelivery[] = [];
    if (!Number.isFinite(renderTick)) return result;
    while (this.queue[0] !== undefined && this.queue[0].tick <= renderTick) {
      const entry = this.queue.shift();
      if (entry !== undefined) result.push(entry);
    }
    return result;
  }

  clear(): void {
    this.queue.length = 0; this.owners.clear(); this.seatTransitions.clear();
    this.nextOrder = 0; this.newestTick = 0;
  }
}
