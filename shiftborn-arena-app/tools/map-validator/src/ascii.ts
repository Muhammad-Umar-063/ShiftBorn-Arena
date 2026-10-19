import type { Box, MapData, MapPoint } from '@shiftborn/shared';

const WIDTH = 64;
const HEIGHT = 32;
const CELL_WIDTH_M = 1;
const CELL_HEIGHT_M = 2;

function paintBoxes(
  cells: string[][],
  boxes: readonly { readonly box: Box }[],
  symbol: string,
  map: MapData,
): void {
  for (const { box } of boxes) {
    for (let row = 0; row < HEIGHT; row += 1) {
      const yTop = map.bounds.maxY - row * CELL_HEIGHT_M;
      const yBottom = yTop - CELL_HEIGHT_M;
      if (box[1] >= yTop || box[3] <= yBottom) continue;
      for (let column = 0; column < WIDTH; column += 1) {
        const xLeft = map.bounds.minX + column * CELL_WIDTH_M;
        if (box[0] >= xLeft + CELL_WIDTH_M || box[2] <= xLeft) continue;
        const line = cells[row];
        if (line && line[column] !== '#') line[column] = symbol;
      }
    }
  }
}

function paintPoints(
  cells: string[][],
  points: readonly MapPoint[],
  symbol: string,
  map: MapData,
): void {
  for (const point of points) {
    const column = Math.floor((point.x - map.bounds.minX) / CELL_WIDTH_M);
    // At a horizontal cell boundary, the northern row owns the point.
    const row = Math.ceil((map.bounds.maxY - point.y) / CELL_HEIGHT_M) - 1;
    if (row < 0 || row >= HEIGHT || column < 0 || column >= WIDTH) continue;
    const line = cells[row];
    if (line && line[column] === '.') line[column] = symbol;
  }
}

// MAP_SPEC §11: rasterize geometry from north to south, then overlay points.
export function renderAscii(map: MapData): string {
  const cells = Array.from({ length: HEIGHT }, () =>
    Array<string>(WIDTH).fill('.'),
  );
  paintBoxes(cells, map.walls, '#', map);
  paintBoxes(cells, map.cover, '%', map);
  paintPoints(cells, map.spawnPoints, 'P', map);
  paintPoints(cells, map.shardPoints, '*', map);
  paintPoints(cells, map.zonePoints, 'Z', map);
  paintPoints(cells, map.cratePoints, 'c', map);
  return cells.map((line) => line.join('')).join('\n');
}
