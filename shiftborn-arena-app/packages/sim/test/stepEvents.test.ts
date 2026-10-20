import { AimSource, Mode, type InputFrame } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { TEST_OPEN } from './fixtures/testOpen.js';
import { emitEvent, SIM_EVENT_NAMES, type SimEvent } from '../src/events.js';
import { step, TICK_SYSTEMS } from '../src/step.js';
import { createWorld } from '../src/world.js';

const eventNames = [
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

describe('GR-17 sim events', () => {
  it('has exactly the named internal event kinds and emits them in order', () => {
    expect(SIM_EVENT_NAMES).toEqual(eventNames);
    const world = createWorld({
      map: TEST_OPEN,
      roomSeed: 1,
      mode: Mode.Frenzy,
    });
    // Each literal name is a valid discriminant; the loop widens it to their union.
    for (const type of eventNames) emitEvent(world, { type } as SimEvent);
    expect(world.events.map((event) => event.type)).toEqual(eventNames);
  });
});

describe('GR-15 tick skeleton', () => {
  it('runs the actual descriptor in the exact 15-step order', () => {
    expect(TICK_SYSTEMS.map((system) => system.name)).toEqual([
      'phase',
      'inputs',
      'morph',
      'abilityStart',
      'abilityUpdate',
      'movement',
      'weapons',
      'projectiles',
      'deaths',
      'respawns',
      'statusTimers',
      'fluxAndShards',
      'zone',
      'cover',
      'output',
    ]);
  });

  it('clears old events, accepts seat inputs, and advances tick once', () => {
    const world = createWorld({
      map: TEST_OPEN,
      roomSeed: 1,
      mode: Mode.Frenzy,
    });
    const input: InputFrame = {
      seq: 0,
      moveX: 0,
      moveY: 0,
      aim: 0,
      buttons: 0,
      aimSource: AimSource.Mouse,
    };
    emitEvent(world, { type: 'spawn' });
    expect(step(world, [input], {})).toEqual([]);
    expect(world.events).toEqual([]);
    expect(world.tick).toBe(1);
    expect(input.seq).toBe(0);
  });

  it('runs 1,000 no-player ticks without gameplay events', () => {
    const world = createWorld({
      map: TEST_OPEN,
      roomSeed: 1,
      mode: Mode.Frenzy,
    });
    for (let count = 0; count < 1000; count += 1) {
      expect(step(world, [], {}).every((event) => event.type === 'phase')).toBe(true);
    }
    expect(world.tick).toBe(1000);
    expect(world.players.every((player) => player === null)).toBe(true);
  });
});
