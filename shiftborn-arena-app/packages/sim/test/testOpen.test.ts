import { describe, expect, it } from 'vitest';
import { GREYBOX_V1 } from '../../shared/src/index.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

describe('AT-MAP-02 test_open fixture', () => {
  it('uses a 64 by 64 box with the same four outer walls', () => {
    expect(TEST_OPEN.id).toBe('test_open');
    expect(TEST_OPEN.bounds).toEqual({
      minX: -32,
      minY: -32,
      maxX: 32,
      maxY: 32,
    });
    expect(TEST_OPEN.playable).toEqual({
      minX: -31,
      minY: -31,
      maxX: 31,
      maxY: 31,
    });
    expect(TEST_OPEN.walls).toEqual(GREYBOX_V1.walls.slice(0, 4));
  });

  it('contains no cover or gameplay points', () => {
    expect(TEST_OPEN.cover).toEqual([]);
    expect(TEST_OPEN.spawnPoints).toEqual([]);
    expect(TEST_OPEN.shardPoints).toEqual([]);
    expect(TEST_OPEN.zonePoints).toEqual([]);
    expect(TEST_OPEN.cratePoints).toEqual([]);
  });
});
