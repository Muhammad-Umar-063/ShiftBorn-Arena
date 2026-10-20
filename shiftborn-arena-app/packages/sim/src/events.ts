import type {
  Cause,
  Form,
  MorphDenialReason,
  WeaponId,
} from '@shiftborn/shared';
import type { Vec2 } from './math/vec2.js';
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
  | 'morphStart'
  | 'morphEnd'
  | 'morphDenied'
  | 'damage'
  | 'projectileSpawn'
  | 'projectileHit'
  | 'projectileImpact'
  | 'projectileExpire'
  | 'blocked'
  | 'overheat'
  | 'death'
  | 'respawn'
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
      readonly type: 'death';
      readonly victimId: string;
      readonly victimSeat: number;
      readonly victimForm: Form;
      readonly killerId: string;
      readonly killerSeat: number;
      readonly killerName: string;
      readonly killerForm: Form;
      readonly cause: Cause;
      readonly finalDamage: number;
      readonly counterForm: Form;
      readonly assisters: readonly {
        readonly id: string;
        readonly seat: number;
      }[];
    }
  | {
      readonly type: 'respawn';
      readonly seat: number;
      readonly pos: Vec2;
      readonly protectedEndTick: number;
    }
  | {
      readonly type: 'morphDenied';
      readonly seat: number;
      readonly target: Form;
      readonly reason: MorphDenialReason;
    }
  | {
      readonly type: 'damage';
      readonly attackerId: string;
      readonly attackerSeat: number;
      readonly attackerForm: Form;
      readonly victimId: string;
      readonly victimSeat: number;
      readonly victimForm: Form;
      readonly cause: Cause;
      readonly finalDamage: number;
      readonly tags: number;
      readonly incomingDir: Vec2;
    }
  | {
      readonly type: 'projectileSpawn';
      readonly id: number;
      readonly ownerSeat: number;
      readonly weapon: WeaponId;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly spawnTick: number;
      readonly advancedTicks: number;
      readonly inputSeq: number;
      readonly shotIdx: number;
    }
  | {
      readonly type: 'projectileHit';
      readonly id: number;
      readonly targetSeat: number;
      readonly damage: number;
      readonly tags: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'projectileImpact';
      readonly id: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'projectileExpire'; readonly id: number }
  | {
      readonly type: 'blocked';
      readonly id: number;
      readonly targetSeat: number;
    }
  | {
      readonly type: 'overheat';
      readonly seat: number;
      readonly endTick: number;
    };

export function emitEvent(world: World, event: SimEvent): void {
  world.events.push(event);
}
