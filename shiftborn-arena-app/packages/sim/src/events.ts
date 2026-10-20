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
export type SimEvent = {
  [Name in SimEventName]: { readonly type: Name };
}[SimEventName];

export function emitEvent(world: World, event: SimEvent): void {
  world.events.push(event);
}
