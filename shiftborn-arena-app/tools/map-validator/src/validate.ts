import { BALANCE } from '@shiftborn/shared';
import type { Box, MapData, MapPoint } from '@shiftborn/shared';
import { renderAscii } from './ascii.js';
import {
  boxBoxDistance,
  pointBoxDistance,
  pointDistance,
  rayBoxDistance,
} from './geometry.js';

type RuleId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8' | 'V9';
export interface RuleResult {
  readonly id: RuleId;
  readonly name: string;
  readonly passed: boolean;
  readonly messages: readonly string[];
}
export interface MapMetrics {
  readonly minimumClearanceM: Readonly<
    Record<'spawn' | 'shard' | 'zone' | 'crate', number | null>
  >;
  readonly maximumClearanceM: Readonly<
    Record<'spawn' | 'shard' | 'zone' | 'crate', number | null>
  >;
  readonly connectedRegions: Readonly<Record<'runner' | 'beast', number>>;
  readonly sightlines: {
    readonly intactLongestM: number;
    readonly shareOverLong: number;
    readonly shareOver30: number;
    readonly destroyedLongestM: number;
    readonly sampleCount: number;
  };
  readonly minimumSpawnSpreadM: number | null;
  readonly minimumSpawnZoneM: number | null;
  readonly zoneWalkableShare: Readonly<Record<string, number>>;
  readonly minimumCoverWallClearanceM: number | null;
  readonly totalIds: number;
  readonly uniqueIds: number;
}
export interface MapReport {
  readonly mapId: string;
  readonly passed: boolean;
  readonly rules: readonly RuleResult[];
  readonly metrics: MapMetrics;
  readonly ascii: string;
}

const GRID_M = 0.5;
const SIGHT_GRID_M = 1;
const SIGHT_OFFSET_M = 0.25;
const SIGHT_DIRECTIONS = 16;
const SIGHT_INFLATION_M = 0.15;
const SHARD_CLEARANCE_M = 2;
const SPAWN_DISTANCE_M = 10;
const ZONE_WALKABLE_SHARE = 0.7;
const COVER_WALL_CLEARANCE_M = 2.6;

function result(id: RuleId, name: string, messages: string[]): RuleResult {
  return { id, name, passed: messages.length === 0, messages };
}

function boxes(
  map: MapData,
): readonly { readonly id: string; readonly box: Box }[] {
  return [...map.walls, ...map.cover];
}

function points(map: MapData): readonly MapPoint[] {
  return [
    ...map.spawnPoints,
    ...map.shardPoints,
    ...map.zonePoints,
    ...map.cratePoints,
  ];
}

function minimumPointClearance(
  point: MapPoint,
  allBoxes: readonly Box[],
): number {
  return allBoxes.reduce(
    (minimum, box) => Math.min(minimum, pointBoxDistance(point, box)),
    Infinity,
  );
}

function finiteMinimum(values: readonly number[]): number | null {
  return values.length ? Math.min(...values) : null;
}

function finiteMaximum(values: readonly number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function validateBounds(map: MapData): RuleResult {
  const messages: string[] = [];
  const bounds = map.bounds;
  const playable = map.playable;
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) {
    messages.push('Map bounds are reversed or empty.');
  }
  if (
    playable.minX >= playable.maxX ||
    playable.minY >= playable.maxY ||
    playable.minX < bounds.minX ||
    playable.minY < bounds.minY ||
    playable.maxX > bounds.maxX ||
    playable.maxY > bounds.maxY
  ) {
    messages.push('Playable bounds are invalid or outside map bounds.');
  }
  for (const { id, box } of boxes(map)) {
    if (box[0] >= box[2] || box[1] >= box[3])
      messages.push(`${id}: reversed or empty box.`);
    if (
      box[0] < bounds.minX ||
      box[1] < bounds.minY ||
      box[2] > bounds.maxX ||
      box[3] > bounds.maxY
    ) {
      messages.push(`${id}: box outside map bounds.`);
    }
  }
  for (const point of points(map)) {
    if (
      point.x < bounds.minX ||
      point.x > bounds.maxX ||
      point.y < bounds.minY ||
      point.y > bounds.maxY
    ) {
      messages.push(`${point.id}: point outside map bounds.`);
    }
    if (
      point.x < playable.minX ||
      point.x > playable.maxX ||
      point.y < playable.minY ||
      point.y > playable.maxY
    ) {
      messages.push(`${point.id}: point outside playable bounds.`);
    }
  }
  return result('V1', 'Bounds', messages);
}

function validateClearance(map: MapData): {
  rule: RuleResult;
  minima: MapMetrics['minimumClearanceM'];
  maxima: MapMetrics['maximumClearanceM'];
} {
  const allBoxes = boxes(map).map(({ box }) => box);
  const messages: string[] = [];
  const categories = {
    spawn: map.spawnPoints,
    shard: map.shardPoints,
    zone: map.zonePoints,
    crate: map.cratePoints,
  };
  const minima: Record<keyof typeof categories, number | null> = {
    spawn: null,
    shard: null,
    zone: null,
    crate: null,
  };
  const maxima: Record<keyof typeof categories, number | null> = {
    spawn: null,
    shard: null,
    zone: null,
    crate: null,
  };
  for (const [category, categoryPoints] of Object.entries(categories) as [
    keyof typeof categories,
    readonly MapPoint[],
  ][]) {
    const distances = categoryPoints.map((point) => {
      const distance = minimumPointClearance(point, allBoxes);
      const limit =
        category === 'shard'
          ? SHARD_CLEARANCE_M
          : BALANCE.mapRules.minPointClearanceM;
      if (distance < limit)
        messages.push(
          `${point.id}: ${category} clearance ${distance.toFixed(2)} m < ${limit} m.`,
        );
      return distance;
    });
    minima[category] = finiteMinimum(distances);
    maxima[category] = finiteMaximum(distances);
  }
  return { rule: result('V2', 'Point clearance', messages), minima, maxima };
}

interface Grid {
  readonly columns: number;
  readonly rows: number;
  readonly walkable: Uint8Array;
  readonly region: Int32Array;
  readonly regionCount: number;
}

function makeGrid(
  map: MapData,
  radius: number,
  allBoxes: readonly Box[],
): Grid {
  const columns = Math.max(
    0,
    Math.floor((map.playable.maxX - map.playable.minX) / GRID_M),
  );
  const rows = Math.max(
    0,
    Math.floor((map.playable.maxY - map.playable.minY) / GRID_M),
  );
  const walkable = new Uint8Array(columns * rows);
  const region = new Int32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = {
        id: '',
        x: map.playable.minX + (column + 0.5) * GRID_M,
        y: map.playable.minY + (row + 0.5) * GRID_M,
      };
      walkable[row * columns + column] =
        minimumPointClearance(point, allBoxes) >= radius ? 1 : 0;
    }
  }
  let regionCount = 0;
  for (let start = 0; start < walkable.length; start += 1) {
    if (!walkable[start] || region[start]) continue;
    regionCount += 1;
    region[start] = regionCount;
    const queue = [start];
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      if (index === undefined) continue;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const neighbours = [
        column > 0 ? index - 1 : -1,
        column + 1 < columns ? index + 1 : -1,
        row > 0 ? index - columns : -1,
        row + 1 < rows ? index + columns : -1,
      ];
      for (const next of neighbours) {
        if (next < 0 || !walkable[next] || region[next]) continue;
        region[next] = regionCount;
        queue.push(next);
      }
    }
  }
  return { columns, rows, walkable, region, regionCount };
}

function pointRegion(map: MapData, point: MapPoint, grid: Grid): number {
  const column = Math.floor((point.x - map.playable.minX) / GRID_M);
  const row = Math.floor((point.y - map.playable.minY) / GRID_M);
  if (column < 0 || column >= grid.columns || row < 0 || row >= grid.rows)
    return 0;
  return grid.region[row * grid.columns + column] ?? 0;
}

function validateConnectivity(
  map: MapData,
  allBoxes: readonly Box[],
): {
  rule: RuleResult;
  grids: { runner: Grid; beast: Grid };
} {
  const grids = {
    runner: makeGrid(map, BALANCE.forms.runner.radiusM, allBoxes),
    beast: makeGrid(map, BALANCE.forms.beast.radiusM, allBoxes),
  };
  const messages: string[] = [];
  for (const [form, grid] of Object.entries(grids) as [
    keyof typeof grids,
    Grid,
  ][]) {
    if (grid.regionCount !== 1)
      messages.push(
        `${form}: ${grid.regionCount} connected walkable regions, expected 1.`,
      );
    for (const point of [
      ...map.spawnPoints,
      ...map.shardPoints,
      ...map.zonePoints,
    ]) {
      if (pointRegion(map, point, grid) !== 1)
        messages.push(
          `${form}: ${point.id} is outside the connected walkable region.`,
        );
    }
  }
  return { rule: result('V3', 'Connectivity', messages), grids };
}

function rayClearance(
  x: number,
  y: number,
  dx: number,
  dy: number,
  allBoxes: readonly Box[],
): number {
  let nearest = Infinity;
  for (const box of allBoxes) {
    nearest = Math.min(
      nearest,
      rayBoxDistance(x, y, dx, dy, box, SIGHT_INFLATION_M),
    );
  }
  return nearest;
}

function measureSightlines(map: MapData): MapMetrics['sightlines'] {
  const walls = map.walls.map(({ box }) => box);
  const intact = [...walls, ...map.cover.map(({ box }) => box)];
  let intactLongestM = 0;
  let destroyedLongestM = 0;
  let overLong = 0;
  let over30 = 0;
  let sampleCount = 0;
  for (
    let y = map.playable.minY + SIGHT_OFFSET_M;
    y < map.playable.maxY;
    y += SIGHT_GRID_M
  ) {
    for (
      let x = map.playable.minX + SIGHT_OFFSET_M;
      x < map.playable.maxX;
      x += SIGHT_GRID_M
    ) {
      const sample = { id: '', x, y };
      if (minimumPointClearance(sample, intact) === 0) continue;
      for (let direction = 0; direction < SIGHT_DIRECTIONS; direction += 1) {
        // Forward/backward rays make each orientation an undirected line.
        const angle = (direction * Math.PI) / SIGHT_DIRECTIONS;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const intactLength =
          rayClearance(x, y, dx, dy, intact) +
          rayClearance(x, y, -dx, -dy, intact);
        const destroyedLength =
          rayClearance(x, y, dx, dy, walls) +
          rayClearance(x, y, -dx, -dy, walls);
        intactLongestM = Math.max(intactLongestM, intactLength);
        destroyedLongestM = Math.max(destroyedLongestM, destroyedLength);
        if (intactLength > BALANCE.mapRules.longSightlineM) overLong += 1;
        if (intactLength > 30) over30 += 1;
        sampleCount += 1;
      }
    }
  }
  return {
    intactLongestM,
    shareOverLong: sampleCount ? overLong / sampleCount : 0,
    shareOver30: sampleCount ? over30 / sampleCount : 0,
    destroyedLongestM,
    sampleCount,
  };
}

function validateSightlines(metrics: MapMetrics['sightlines']): RuleResult {
  const messages: string[] = [];
  if (metrics.sampleCount === 0) messages.push('No free sightline samples.');
  if (metrics.intactLongestM > BALANCE.mapRules.maxSightlineM) {
    messages.push(
      `Longest intact sightline ${metrics.intactLongestM.toFixed(2)} m exceeds ${BALANCE.mapRules.maxSightlineM} m.`,
    );
  }
  if (metrics.shareOverLong > BALANCE.mapRules.maxShareOverLong) {
    messages.push(
      `Share over ${BALANCE.mapRules.longSightlineM} m is ${(metrics.shareOverLong * 100).toFixed(2)}%, exceeding ${(BALANCE.mapRules.maxShareOverLong * 100).toFixed(2)}%.`,
    );
  }
  return result('V4', 'Sightlines', messages);
}

function minimumPairDistance(
  a: readonly MapPoint[],
  b?: readonly MapPoint[],
): number | null {
  let minimum = Infinity;
  for (let index = 0; index < a.length; index += 1) {
    const first = a[index];
    if (!first) continue;
    for (let other = b ? 0 : index + 1; other < (b ?? a).length; other += 1) {
      const second = (b ?? a)[other];
      if (second) minimum = Math.min(minimum, pointDistance(first, second));
    }
  }
  return Number.isFinite(minimum) ? minimum : null;
}

function zoneShares(
  map: MapData,
  allBoxes: readonly Box[],
): Record<string, number> {
  const shares: Record<string, number> = {};
  for (const zone of map.zonePoints) {
    let total = 0;
    let walkable = 0;
    const radius = BALANCE.zoneFrenzy.zoneRadiusM;
    const minX = Math.ceil((zone.x - radius) / GRID_M);
    const maxX = Math.floor((zone.x + radius) / GRID_M);
    const minY = Math.ceil((zone.y - radius) / GRID_M);
    const maxY = Math.floor((zone.y + radius) / GRID_M);
    // Zone samples use the world-aligned 0.5 m lattice from MAP_SPEC §10.2.
    for (let row = minY; row <= maxY; row += 1) {
      const y = row * GRID_M;
      for (let column = minX; column <= maxX; column += 1) {
        const x = column * GRID_M;
        if (Math.hypot(x - zone.x, y - zone.y) > BALANCE.zoneFrenzy.zoneRadiusM)
          continue;
        total += 1;
        if (
          x >= map.playable.minX &&
          x <= map.playable.maxX &&
          y >= map.playable.minY &&
          y <= map.playable.maxY &&
          minimumPointClearance({ id: '', x, y }, allBoxes) >=
            BALANCE.forms.runner.radiusM
        ) {
          walkable += 1;
        }
      }
    }
    shares[zone.id] = total ? walkable / total : 0;
  }
  return shares;
}

function validateIds(map: MapData): {
  rule: RuleResult;
  total: number;
  unique: number;
} {
  const messages: string[] = [];
  const collections = [
    ['walls', map.walls],
    ['cover', map.cover],
    ['spawns', map.spawnPoints],
    ['shards', map.shardPoints],
    ['zones', map.zonePoints],
    ['crates', map.cratePoints],
  ] as const;
  const ids = collections.flatMap(([name, entries]) => {
    if (entries.length === 0) messages.push(`${name}: collection is empty.`);
    return entries.map(({ id }) => id);
  });
  const unique = new Set(ids);
  if (unique.size !== ids.length)
    messages.push(`${ids.length - unique.size} duplicate entity id(s).`);
  for (const [name, actual, expected] of [
    ['spawns', map.spawnPoints.length, 10],
    ['shards', map.shardPoints.length, 10],
    ['zones', map.zonePoints.length, 5],
  ] as const) {
    if (actual !== expected)
      messages.push(`${name}: expected ${expected}, found ${actual}.`);
  }
  return {
    rule: result('V9', 'Ids and counts', messages),
    total: ids.length,
    unique: unique.size,
  };
}

export function validateMap(map: MapData): MapReport {
  const allBoxes = boxes(map).map(({ box }) => box);
  const bounds = validateBounds(map);
  const clearance = validateClearance(map);
  const connectivity = validateConnectivity(map, allBoxes);
  const sightlines = measureSightlines(map);
  const spawnSpread = minimumPairDistance(map.spawnPoints);
  const spawnZone = minimumPairDistance(map.spawnPoints, map.zonePoints);
  const shares = zoneShares(map, allBoxes);
  const coverWallDistances = map.cover.map(({ box }) =>
    Math.min(...map.walls.map((wall) => boxBoxDistance(box, wall.box))),
  );
  const minimumCoverWallClearanceM = finiteMinimum(coverWallDistances);
  const ids = validateIds(map);
  const rules = [
    bounds,
    clearance.rule,
    connectivity.rule,
    validateSightlines(sightlines),
    result(
      'V5',
      'Spawn spread',
      spawnSpread !== null && spawnSpread >= SPAWN_DISTANCE_M
        ? []
        : [
            `Minimum spawn distance ${spawnSpread ?? 'n/a'} m is below ${SPAWN_DISTANCE_M} m.`,
          ],
    ),
    result(
      'V6',
      'Spawn to zone',
      spawnZone !== null && spawnZone >= SPAWN_DISTANCE_M
        ? []
        : [
            `Minimum spawn-to-zone distance ${spawnZone ?? 'n/a'} m is below ${SPAWN_DISTANCE_M} m.`,
          ],
    ),
    result(
      'V7',
      'Zone floor',
      map.zonePoints.flatMap((zone) =>
        (shares[zone.id] ?? 0) >= ZONE_WALKABLE_SHARE
          ? []
          : [
              `${zone.id}: walkable floor ${((shares[zone.id] ?? 0) * 100).toFixed(1)}% is below ${ZONE_WALKABLE_SHARE * 100}%.`,
            ],
      ),
    ),
    result(
      'V8',
      'Cover clearance',
      map.cover.flatMap((cover, index) =>
        (coverWallDistances[index] ?? 0) >= COVER_WALL_CLEARANCE_M
          ? []
          : [
              `${cover.id}: wall clearance ${(coverWallDistances[index] ?? 0).toFixed(2)} m is below ${COVER_WALL_CLEARANCE_M} m.`,
            ],
      ),
    ),
    ids.rule,
  ];
  return {
    mapId: map.id,
    passed: rules.every((rule) => rule.passed),
    rules,
    metrics: {
      minimumClearanceM: clearance.minima,
      maximumClearanceM: clearance.maxima,
      connectedRegions: {
        runner: connectivity.grids.runner.regionCount,
        beast: connectivity.grids.beast.regionCount,
      },
      sightlines,
      minimumSpawnSpreadM: spawnSpread,
      minimumSpawnZoneM: spawnZone,
      zoneWalkableShare: shares,
      minimumCoverWallClearanceM,
      totalIds: ids.total,
      uniqueIds: ids.unique,
    },
    ascii: renderAscii(map),
  };
}
