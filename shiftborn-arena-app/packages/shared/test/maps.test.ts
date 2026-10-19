import { describe, expect, it } from 'vitest';
import { GREYBOX_V1 } from '../src/index.js';

describe('AT-MAP-02 greybox_v1 map data', () => {
  it('uses the specified map id and bounds', () => {
    expect(GREYBOX_V1.id).toBe('greybox_v1');
    expect(GREYBOX_V1.bounds).toEqual({
      minX: -32,
      minY: -32,
      maxX: 32,
      maxY: 32,
    });
    expect(GREYBOX_V1.playable).toEqual({
      minX: -31,
      minY: -31,
      maxX: 31,
      maxY: 31,
    });
  });

  it('has the specified wall, cover and point counts', () => {
    expect(GREYBOX_V1.walls).toHaveLength(38);
    expect(GREYBOX_V1.cover).toHaveLength(10);
    expect(GREYBOX_V1.spawnPoints).toHaveLength(10);
    expect(GREYBOX_V1.shardPoints).toHaveLength(10);
    expect(GREYBOX_V1.zonePoints).toHaveLength(5);
    expect(GREYBOX_V1.cratePoints).toHaveLength(6);
  });

  it('has 79 globally unique entity ids', () => {
    const collections: ReadonlyArray<ReadonlyArray<{ readonly id: string }>> = [
      GREYBOX_V1.walls,
      GREYBOX_V1.cover,
      GREYBOX_V1.spawnPoints,
      GREYBOX_V1.shardPoints,
      GREYBOX_V1.zonePoints,
      GREYBOX_V1.cratePoints,
    ];
    const ids = collections.flatMap((collection) =>
      collection.map(({ id }) => id),
    );
    expect(ids).toHaveLength(79);
    expect(new Set(ids).size).toBe(79);
  });

  it('preserves the specified array order', () => {
    expect(GREYBOX_V1.walls.map(({ id }) => id)).toEqual([
      'B-N',
      'B-S',
      'B-W',
      'B-E',
      'DW-1',
      'DW-2',
      'DW-3',
      'DW-4',
      'DE-1',
      'DE-2',
      'DE-3',
      'DE-4',
      'M-1',
      'M-2',
      'M-3',
      'M-4',
      'M-5',
      'M-6',
      'M-7',
      'S-1',
      'S-2',
      'S-3',
      'S-4',
      'S-5',
      'S-6',
      'S-7',
      'R-1',
      'R-2',
      'R-3',
      'R-4',
      'R-5',
      'R-6',
      'R-7',
      'R-8',
      'R-9',
      'R-10',
      'R-P1',
      'R-P2',
    ]);
    expect(GREYBOX_V1.cover.map(({ id }) => id)).toEqual([
      'DC-1',
      'DC-2',
      'DC-3',
      'DC-4',
      'DC-5',
      'DC-6',
      'DC-7',
      'DC-8',
      'DC-9',
      'DC-10',
    ]);
    expect(GREYBOX_V1.spawnPoints.map(({ id }) => id)).toEqual([
      'SP-1',
      'SP-2',
      'SP-3',
      'SP-4',
      'SP-5',
      'SP-6',
      'SP-7',
      'SP-8',
      'SP-9',
      'SP-10',
    ]);
    expect(GREYBOX_V1.shardPoints.map(({ id }) => id)).toEqual([
      'SH-1',
      'SH-2',
      'SH-3',
      'SH-4',
      'SH-5',
      'SH-6',
      'SH-7',
      'SH-8',
      'SH-9',
      'SH-10',
    ]);
    expect(GREYBOX_V1.zonePoints.map(({ id }) => id)).toEqual([
      'Z-0',
      'Z-1',
      'Z-2',
      'Z-3',
      'Z-4',
    ]);
    expect(GREYBOX_V1.cratePoints.map(({ id }) => id)).toEqual([
      'CR-1',
      'CR-2',
      'CR-3',
      'CR-4',
      'CR-5',
      'CR-6',
    ]);
  });
});
