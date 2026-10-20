import { Phase } from '@shiftborn/shared';

/** GR-2.2: permissions consumed by later movement and gameplay systems. */
export const PHASE_POLICY = {
  [Phase.Countdown]: {
    input: true,
    movement: true,
    aim: true,
    fire: false,
    ability: false,
    morph: false,
    damage: false,
    fluxRegeneration: false,
    zoneScoring: false,
  },
  [Phase.Playing]: {
    input: true,
    movement: true,
    aim: true,
    fire: true,
    ability: true,
    morph: true,
    damage: true,
    fluxRegeneration: true,
    zoneScoring: true,
  },
  [Phase.Results]: {
    input: false,
    movement: false,
    aim: false,
    fire: false,
    ability: false,
    morph: false,
    damage: false,
    fluxRegeneration: false,
    zoneScoring: false,
  },
} as const;
