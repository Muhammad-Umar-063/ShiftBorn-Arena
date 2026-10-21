import type { PlayerVisual } from './entityState.js';

// AT-NET-08: non-respawn rendered movement stays within 0.6 m per frame.
// Keep a 1 mm arithmetic margin under the acceptance limit after 3D transforms.
const MAX_FRAME_DELTA_M = 0.599;
const TELEPORT_DISTANCE_M = 5; // NETWORK_PROTOCOL §7.

/** Only changes the displayed remote pose; authoritative samples stay intact. */
export function capRemoteCatchup(previous: PlayerVisual | undefined,
  sampled: PlayerVisual): PlayerVisual {
  if (previous === undefined || previous.id !== sampled.id ||
    !previous.alive || !sampled.alive) return sampled;
  const dx = sampled.x - previous.x;
  const dy = sampled.y - previous.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= MAX_FRAME_DELTA_M || distance > TELEPORT_DISTANCE_M)
    return sampled;
  const scale = MAX_FRAME_DELTA_M / distance;
  return { ...sampled, x: previous.x + dx * scale,
    y: previous.y + dy * scale };
}
