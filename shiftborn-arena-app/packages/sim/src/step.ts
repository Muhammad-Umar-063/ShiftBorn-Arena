import type { InputFrame } from '@shiftborn/shared';
import type { SimEvent } from './events.js';
import type { World } from './world.js';

export interface StepContext {
  readonly spawnAdvanceTicksBySeat?: readonly number[];
}

type System = (world: World, context: StepContext) => void;
const emptySystem: System = () => undefined;
const outputSystem: System = (world) => {
  world.tick += 1;
};

// GR-15: step executes this same descriptor that tests inspect.
export const TICK_SYSTEMS = [
  { name: 'phase', run: emptySystem },
  { name: 'inputs', run: emptySystem },
  { name: 'morph', run: emptySystem },
  { name: 'abilityStart', run: emptySystem },
  { name: 'abilityUpdate', run: emptySystem },
  { name: 'movement', run: emptySystem },
  { name: 'weapons', run: emptySystem },
  { name: 'projectiles', run: emptySystem },
  { name: 'deaths', run: emptySystem },
  { name: 'respawns', run: emptySystem },
  { name: 'statusTimers', run: emptySystem },
  { name: 'fluxAndShards', run: emptySystem },
  { name: 'zone', run: emptySystem },
  { name: 'cover', run: emptySystem },
  { name: 'output', run: outputSystem },
] as const;

export function step(
  world: World,
  inputs: readonly InputFrame[],
  context: StepContext,
): SimEvent[] {
  // Input application belongs to later tasks; accepting frames preserves the API.
  void inputs;
  world.events.length = 0;
  for (const system of TICK_SYSTEMS) system.run(world, context);
  return world.events;
}
