import type { Form, MorphDenialReason } from '@shiftborn/shared';
import type { World } from './world.js';

// GR-17: these are internal sim events, not encoded network event tuples.
export const SIM_EVENT_NAMES = [
  'phase',
  'spawn',
  'respawn',
  'death',
  'morphStart',
  'morphEnd',
  'morphDenied',
  'abilityStart',
  'abilityEnd',
  'abilityHit',
  'railShotFired',
  'projectileSpawn',
  'projectileHit',
  'projectileImpact',
  'projectileExpire',
  'blocked',
  'damage',
  'stun',
  'knockback',
  'overheat',
  'shardSpawn',
  'shardPickup',
  'shardExpire',
  'clusterAnnounce',
  'coverDestroyed',
  'coverRebuilt',
  'zoneAnnounce',
  'zoneMoved',
  'zoneState',
  'score',
  'matchEnd',
  'positionClamped',
] as const;

export type SimEventName = (typeof SIM_EVENT_NAMES)[number];
type SimpleEventName = Exclude<
  SimEventName,
  'morphStart' | 'morphEnd' | 'morphDenied'
>;
export type SimEvent =
  | { [Name in SimpleEventName]: { readonly type: Name } }[SimpleEventName]
  | {
      readonly type: 'morphStart';
      readonly seat: number;
      readonly from: Form;
      readonly to: Form;
      readonly endTick: number;
    }
  | { readonly type: 'morphEnd'; readonly seat: number; readonly form: Form }
  | {
      readonly type: 'morphDenied';
      readonly seat: number;
      readonly target: Form;
      readonly reason: MorphDenialReason;
    };

export function emitEvent(world: World, event: SimEvent): void {
  world.events.push(event);
}
