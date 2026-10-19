import { GREYBOX_V1 } from '@shiftborn/shared';
import type { MapData } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { runValidationCli, validateMap } from '../src/index.js';

function changed(changes: Partial<MapData>): MapData {
  return { ...GREYBOX_V1, ...changes };
}

function ruleFails(map: MapData, id: string): boolean {
  return (
    validateMap(map).rules.find((rule) => rule.id === id)?.passed === false
  );
}

describe('AT-MAP-01 validator', () => {
  it('passes every rule for GREYBOX_V1', () => {
    const report = validateMap(GREYBOX_V1);
    expect(report.passed).toBe(true);
    expect(report.rules.map((rule) => rule.id)).toEqual([
      'V1',
      'V2',
      'V3',
      'V4',
      'V5',
      'V6',
      'V7',
      'V8',
      'V9',
    ]);
    expect(report.rules.every((rule) => rule.passed)).toBe(true);
  });

  it('calculates the rounded MAP_SPEC section 10.2 measurements', () => {
    const metrics = validateMap(GREYBOX_V1).metrics;
    expect(metrics.connectedRegions).toEqual({ runner: 1, beast: 1 });
    expect(metrics.sightlines.intactLongestM.toFixed(1)).toBe('33.2');
    expect((metrics.sightlines.shareOverLong * 100).toFixed(1)).toBe('3.3');
    expect((metrics.sightlines.shareOver30 * 100).toFixed(1)).toBe('0.2');
    expect(metrics.sightlines.destroyedLongestM.toFixed(1)).toBe('35.7');
    expect(metrics.minimumClearanceM.spawn).toBe(3);
    expect(metrics.minimumClearanceM.shard).toBe(2.5);
    expect(metrics.minimumClearanceM.crate).toBe(2);
    expect(metrics.minimumSpawnSpreadM?.toFixed(1)).toBe('14.0');
    expect(metrics.minimumSpawnZoneM?.toFixed(1)).toBe('14.9');
    expect(
      Object.entries(metrics.zoneWalkableShare).map(([id, share]) => [
        id,
        Math.round(share * 100),
      ]),
    ).toEqual([
      ['Z-0', 73],
      ['Z-1', 80],
      ['Z-2', 80],
      ['Z-3', 80],
      ['Z-4', 80],
    ]);
    expect(metrics.totalIds).toBe(79);
    expect(metrics.uniqueIds).toBe(79);
  });

  it('renders exactly the 64 by 32 ASCII block in MAP_SPEC section 11', () => {
    const expected = `################################################################
#...P...............##...P.............P..##................P..#
#.................*.##....................##.........c.........#
#...................##....................##...................#
##############......##......########......##......##############
##############......##....................##......##############
########............##....%...####...%....##............########
########.......Z.%........%...####...%........%..Z......########
########.........%........%...####...%........%.........########
#....c..............#####..............#####...................#
#......##################.......*......##################..*...#
#......###############...##############...###############......#
#...P......*........##...##############...##.........*.........#
#...................##.c..................##...................#
##############......##....##........##....##......##############
##############...%........##....Z...##........%...##############
##############...%........##........##........%...##############
##############......##....##........##....##......##############
#..........*........##..................c.##.........*......P..#
#...................##...##############...##...................#
#......###############...##############...###############......#
#....*.##################.......*......##################..c...#
#...................#####..............#####...................#
########.........%........%...####...%........%.........########
########.......Z.%........%...####...%........%..Z......########
########............##....%...####...%....##............########
##############......##....................##......##############
##############......##......########......##......##############
#...................##....................##..*................#
#...P......c........##...P.............P..##................P..#
#...................##....................##...................#
################################################################`;
    const ascii = validateMap(GREYBOX_V1).ascii;
    expect(ascii).toBe(expected);
    expect(ascii.split('\n')).toHaveLength(32);
    expect(ascii.split('\n').every((row) => row.length === 64)).toBe(true);
  });

  it('fails V1 for a box outside bounds', () => {
    expect(
      ruleFails(
        changed({
          walls: [...GREYBOX_V1.walls, { id: 'OUT', box: [31, 0, 33, 1] }],
        }),
        'V1',
      ),
    ).toBe(true);
  });

  it('fails V2 for a blocked point', () => {
    expect(
      ruleFails(
        changed({
          spawnPoints: [
            { id: 'SP-1', x: -20, y: 22 },
            ...GREYBOX_V1.spawnPoints.slice(1),
          ],
        }),
        'V2',
      ),
    ).toBe(true);
  });

  it('fails V3 when a wall splits the arena', () => {
    expect(
      ruleFails(
        changed({
          walls: [
            ...GREYBOX_V1.walls,
            { id: 'SPLIT', box: [-0.25, -31, 0.25, 31] },
          ],
        }),
        'V3',
      ),
    ).toBe(true);
  });

  it('fails V4 when removing the sightline-blocking cover', () => {
    expect(ruleFails(changed({ cover: [] }), 'V4')).toBe(true);
  });

  it('fails V5 for close spawns', () => {
    expect(
      ruleFails(
        changed({
          spawnPoints: [
            ...GREYBOX_V1.spawnPoints.slice(0, 1),
            { id: 'SP-2', x: -27, y: 28 },
            ...GREYBOX_V1.spawnPoints.slice(2),
          ],
        }),
        'V5',
      ),
    ).toBe(true);
  });

  it('fails V6 for a spawn on a zone', () => {
    expect(
      ruleFails(
        changed({
          spawnPoints: [
            { id: 'SP-1', x: -17, y: 17 },
            ...GREYBOX_V1.spawnPoints.slice(1),
          ],
        }),
        'V6',
      ),
    ).toBe(true);
  });

  it('fails V7 for an obstructed zone', () => {
    expect(
      ruleFails(
        changed({
          walls: [
            ...GREYBOX_V1.walls,
            { id: 'ZONE-BLOCK', box: [-5, -5, 5, 5] },
          ],
        }),
        'V7',
      ),
    ).toBe(true);
  });

  it('fails V8 for cover against a wall', () => {
    expect(
      ruleFails(
        changed({
          cover: [
            { id: 'DC-1', box: [-30, 15, -29, 18] },
            ...GREYBOX_V1.cover.slice(1),
          ],
        }),
        'V8',
      ),
    ).toBe(true);
  });

  it('fails V9 for duplicate IDs and wrong point counts', () => {
    const report = validateMap(
      changed({
        spawnPoints: GREYBOX_V1.spawnPoints.map((point, index) =>
          index === 0 ? { ...point, id: 'B-N' } : point,
        ),
        cratePoints: GREYBOX_V1.cratePoints.slice(1),
      }),
    );
    expect(report.rules.find((rule) => rule.id === 'V9')?.passed).toBe(false);
    expect(report.metrics.uniqueIds).toBeLessThan(report.metrics.totalIds);
  });

  it('returns a non-zero CLI code and names the failing map and rule', () => {
    const output: string[] = [];
    const code = runValidationCli(
      [
        changed({
          id: 'broken',
          walls: [...GREYBOX_V1.walls, { id: 'OUT', box: [31, 0, 33, 1] }],
        }),
      ],
      (message) => output.push(message),
    );
    expect(code).toBe(1);
    expect(output.join('\n')).toContain('Map broken: FAIL');
    expect(output.join('\n')).toContain('V1 Bounds: FAIL');
  });

  it('produces identical metrics and ASCII on repeated runs', () => {
    const first = validateMap(GREYBOX_V1);
    const second = validateMap(GREYBOX_V1);
    expect(second.metrics).toEqual(first.metrics);
    expect(second.ascii).toBe(first.ascii);
  });
});
