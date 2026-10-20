import type { Client } from '@colyseus/core';
import {
  BALANCE,
  DERIVED,
  Phase,
  type ClientInputFrame,
} from '@shiftborn/shared';
import type { InputQueue } from '../net/inputQueue.js';

export type ProxyReason = 'drop' | 'hidden' | 'afk' | null;

/** One durable identity across transport replacement. */
export interface HumanSession {
  readonly id: string;
  readonly seat: number;
  readonly queue: InputQueue;
  client: Client | null;
  connected: boolean;
  hidden: boolean;
  proxyReason: ProxyReason;
  lastMeaningfulInputTick: number;
  afkWarned: boolean;
}

export function decodeVisibility(value: unknown): boolean | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  if (value[0] === 0) return false;
  if (value[0] === 1) return true;
  return null;
}

const FULL_TURN = 2 * Math.PI;
const AIM_STEPS = 2 ** 16;

export function shortestAimChangeRad(
  previous: number,
  current: number,
): number {
  const difference = Math.abs(current - previous) % FULL_TURN;
  return Math.min(difference, FULL_TURN - difference);
}

/** NETWORK_PROTOCOL §9.4: strict threshold, including uint16 wraparound. */
export function isMeaningfulInput(
  frame: Pick<ClientInputFrame, 'moveX' | 'moveY' | 'buttons' | 'aim'>,
  previousEncodedAim: number,
): boolean {
  if (frame.moveX !== 0 || frame.moveY !== 0 || frame.buttons !== 0)
    return true;
  return (
    shortestAimChangeRad(
      (previousEncodedAim / AIM_STEPS) * FULL_TURN,
      (frame.aim / AIM_STEPS) * FULL_TURN,
    ) > DERIVED.net.afkAimThresholdRad
  );
}

export type AfkAction = 'warn' | 'proxy' | null;

export function afkAction(session: HumanSession, tick: number): AfkAction {
  if (!session.connected || session.hidden || session.proxyReason !== null)
    return null;
  const idleTicks = tick - session.lastMeaningfulInputTick;
  if (idleTicks >= DERIVED.net.afkBotTicks) return 'proxy';
  if (idleTicks >= DERIVED.net.afkWarnTicks && !session.afkWarned)
    return 'warn';
  return null;
}

export function rebaseAfk(session: HumanSession, tick: number): void {
  session.lastMeaningfulInputTick = tick;
  session.afkWarned = false;
}

export const SHUTDOWN_RESULTS_MAX_MS = 10_000;

export function shutdownResultsWaitMs(
  phase: Phase,
  phaseEndTick: number,
  tick: number,
): number {
  if (phase !== Phase.Results) return 0;
  const remainingMs =
    (Math.max(0, phaseEndTick - tick) / BALANCE.tick.rateHz) * 1000;
  return Math.min(remainingMs, SHUTDOWN_RESULTS_MAX_MS);
}
