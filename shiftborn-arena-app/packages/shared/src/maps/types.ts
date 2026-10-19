export type Box = readonly [
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
];
export interface MapPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}
export interface MapData {
  readonly id: string;
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };
  readonly playable: { minX: number; minY: number; maxX: number; maxY: number };
  readonly walls: readonly { id: string; box: Box }[];
  readonly cover: readonly { id: string; box: Box }[];
  readonly spawnPoints: readonly MapPoint[];
  readonly shardPoints: readonly MapPoint[];
  readonly zonePoints: readonly MapPoint[];
  readonly cratePoints: readonly MapPoint[];
}
