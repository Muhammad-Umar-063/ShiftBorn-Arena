import type { InputFrame } from '@shiftborn/shared';
import type { PlayerRecord } from './player.js';

type InputHistory = Pick<
  PlayerRecord,
  'lastInputSeq' | 'lastButtonInputSeq' | 'lastHeldButtons'
>;

/** NETWORK_PROTOCOL §5.4: repeated frames keep held controls but add no edges. */
export function advanceInputHistory(
  player: InputHistory,
  frame: InputFrame,
  pressedOverride?: number,
): { accepted: boolean; pressed: number } {
  if (frame.seq < Math.max(player.lastInputSeq, player.lastButtonInputSeq))
    return { accepted: false, pressed: 0 };
  if (frame.seq === player.lastButtonInputSeq)
    return { accepted: true, pressed: 0 };
  const pressed = pressedOverride ?? (frame.buttons & ~player.lastHeldButtons);
  player.lastHeldButtons = frame.buttons;
  player.lastButtonInputSeq = frame.seq;
  return { accepted: true, pressed };
}
