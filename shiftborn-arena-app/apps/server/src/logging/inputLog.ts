import {
  BALANCE, REPLAY_FORMAT_VERSION, balanceHash,
  type Controller, type InputFrame, type ReplayCheckpoint,
  type ReplayEnd, type ReplayHeader, type ReplayRoomState, type ReplayTick,
} from '@shiftborn/shared';
import { hashWorld, snapshotWorld, type World } from '@shiftborn/sim';
import { copyAppliedInputs } from './matchLog.js';

export function replayHeader(world: World, buildId: string): ReplayHeader {
  return {
    kind: 'header', version: REPLAY_FORMAT_VERSION,
    matchId: world.matchId, mapId: world.map.id,
    roomSeed: world.roomSeed, matchIndex: world.matchIndex, mode: world.mode,
    initialSnapshot: snapshotWorld(world), initialHash: hashWorld(world),
    balanceVersion: BALANCE.version, balanceHash: balanceHash(), buildId,
  };
}

export function replayCheckpoint(
  world: World, beforeHash: string, roomState?: ReplayRoomState,
): ReplayCheckpoint {
  return {
    kind: 'checkpoint', t: world.tick, beforeHash,
    afterHash: hashWorld(world), snapshot: snapshotWorld(world),
    ...(roomState === undefined ? {} : { roomState }),
  };
}

export function replayTick(
  tick: number,
  inputs: readonly (InputFrame | undefined)[],
  controllers: readonly (Controller | null)[],
  pressed: readonly (number | undefined)[],
  spawnAdvance: readonly number[],
  postHash: string,
): ReplayTick {
  const seats = BALANCE.match.seats;
  return {
    kind: 'tick', t: tick,
    inputs: copyAppliedInputs(inputs, seats),
    controllers: Array.from({ length: seats }, (_, seat) => controllers[seat] ?? null),
    inputPressedButtonsBySeat: Array.from(
      { length: seats }, (_, seat) => pressed[seat] ?? null,
    ),
    spawnAdvanceTicksBySeat: Array.from(
      { length: seats }, (_, seat) => spawnAdvance[seat] ?? 0,
    ),
    hash: postHash,
  };
}

export function replayEnd(world: World, natural: boolean): ReplayEnd {
  return { kind: 'end', t: world.tick, finalHash: hashWorld(world), natural };
}
