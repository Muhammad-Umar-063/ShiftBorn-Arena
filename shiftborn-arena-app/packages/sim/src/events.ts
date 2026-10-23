import type {
  AbilityId,
  Cause,
  Form,
  GunId,
  MorphDenialReason,
  Phase,
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
  'formUnlocked',
  'reloadStart',
  'reloadEnd',
  'weaponSwap',
  'meleeStart',
  'meleeStrike',
  'projectileBounce',
  'mortarBlast',
  'lootSpawn',
  'lootPickup',
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
  | 'shardSpawn'
  | 'shardPickup'
  | 'shardExpire'
  | 'clusterAnnounce'
  | 'abilityStart'
  | 'abilityEnd'
  | 'phase'
  | 'spawn'
  | 'formUnlocked'
  | 'reloadStart'
  | 'reloadEnd'
  | 'weaponSwap'
  | 'meleeStart'
  | 'meleeStrike'
  | 'projectileBounce'
  | 'mortarBlast'
  | 'lootSpawn'
  | 'lootPickup'
>;
export type SimEvent =
  | { [Name in SimpleEventName]: { readonly type: Name } }[SimpleEventName]
  | {
      readonly type: 'phase';
      readonly phase: Phase;
      readonly phaseEndTick: number;
    }
  | {
      readonly type: 'spawn';
      readonly seat: number;
      readonly x: number;
      readonly y: number;
      readonly protectedEndTick: number;
    }
  | {
      readonly type: 'abilityStart';
      readonly seat: number;
      readonly ability: typeof AbilityId.Dash;
      readonly startTick: number;
      readonly endTick: number;
      readonly dirX: number;
      readonly dirY: number;
    }
  | {
      readonly type: 'abilityEnd';
      readonly seat: number;
      readonly ability: typeof AbilityId.Dash;
      readonly cancelled: 0 | 1;
    }
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
  | { readonly type: 'shardSpawn'; readonly shardId: number }
  | {
      readonly type: 'shardPickup';
      readonly shardId: number;
      readonly seat: number;
      readonly value: number;
    }
  | { readonly type: 'shardExpire'; readonly shardId: number }
  | {
      readonly type: 'clusterAnnounce';
      readonly pointIndex: number;
      readonly spawnTick: number;
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
      readonly weapon: GunId;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly spawnTick: number;
      readonly advancedTicks: number;
      readonly inputSeq: number;
      readonly shotIdx: number;
      /** GR-7.27: Arc Mortar landing; 0 for direct-fire guns. */
      readonly landTick: number;
      readonly targetX: number;
      readonly targetY: number;
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
    }
  | { readonly type: 'formUnlocked'; readonly seat: number; readonly form: Form }
  | {
      readonly type: 'reloadStart';
      readonly seat: number;
      readonly gun: GunId;
      readonly endTick: number;
    }
  | {
      readonly type: 'reloadEnd';
      readonly seat: number;
      readonly gun: GunId;
      readonly completed: 0 | 1;
    }
  | {
      readonly type: 'weaponSwap';
      readonly seat: number;
      readonly gun: GunId;
      readonly readyTick: number;
    }
  | {
      readonly type: 'meleeStart';
      readonly seat: number;
      readonly strikeTick: number;
      readonly endTick: number;
    }
  | {
      readonly type: 'meleeStrike';
      readonly seat: number;
      readonly targetSeat: number;
      readonly damage: number;
      readonly tags: number;
      readonly x2: number;
      readonly y2: number;
    }
  | {
      readonly type: 'projectileBounce';
      readonly id: number;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
    }
  | {
      readonly type: 'mortarBlast';
      readonly id: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'lootSpawn';
      readonly lootId: number;
      readonly gun: GunId;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'lootPickup';
      readonly lootId: number;
      readonly seat: number;
      readonly gun: GunId;
      readonly kind: 0 | 1;
    };

export function emitEvent(world: World, event: SimEvent): void {
  world.events.push(event);
}
