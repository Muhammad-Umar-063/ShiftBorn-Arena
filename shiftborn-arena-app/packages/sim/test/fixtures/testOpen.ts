import type { MapData } from '@shiftborn/shared';

// AT-MAP-02: an obstacle-free sim fixture with the same boundary as greybox_v1.
export const TEST_OPEN: MapData = {
  id: 'test_open',
  bounds: { minX: -32, minY: -32, maxX: 32, maxY: 32 },
  playable: { minX: -31, minY: -31, maxX: 31, maxY: 31 },
  walls: [
    { id: 'B-N', box: [-32, 31, 32, 32] },
    { id: 'B-S', box: [-32, -32, 32, -31] },
    { id: 'B-W', box: [-32, -32, -31, 32] },
    { id: 'B-E', box: [31, -32, 32, 32] },
  ],
  cover: [],
  spawnPoints: [],
  shardPoints: [],
  zonePoints: [],
  cratePoints: [],
};
