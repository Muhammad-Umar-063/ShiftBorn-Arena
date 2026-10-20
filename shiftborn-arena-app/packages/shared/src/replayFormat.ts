import type { Controller, Mode } from './constants.js';
import type { InputFrame } from './protocol.js';

/** Internal match replay format; independent of the network protocol. */
export const REPLAY_FORMAT_VERSION = 1;

export interface ReplayHeader {
  readonly kind: 'header';
  readonly version: typeof REPLAY_FORMAT_VERSION;
  readonly matchId: string;
  readonly mapId: string;
  readonly roomSeed: number;
  readonly matchIndex: number;
  readonly mode: Mode;
  readonly initialSnapshot: unknown;
  readonly initialHash: string;
  readonly balanceVersion: string;
  readonly balanceHash: string;
  readonly buildId: string;
}

export interface ReplayCheckpoint {
  readonly kind: 'checkpoint';
  readonly t: number;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly snapshot: unknown;
}

export interface ReplayTick {
  readonly kind: 'tick';
  readonly t: number;
  readonly inputs: readonly (InputFrame | null)[];
  readonly controllers: readonly (Controller | null)[];
  readonly inputPressedButtonsBySeat: readonly (number | null)[];
  readonly spawnAdvanceTicksBySeat: readonly number[];
  readonly hash: string;
}

export interface ReplayEnd {
  readonly kind: 'end';
  readonly t: number;
  readonly finalHash: string;
  readonly natural: boolean;
}

export type ReplayRecord = ReplayHeader | ReplayCheckpoint | ReplayTick | ReplayEnd;
