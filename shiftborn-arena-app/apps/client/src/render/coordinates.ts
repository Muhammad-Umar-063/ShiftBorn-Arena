import type { Box } from '@shiftborn/shared';

export interface GroundPoint { readonly x: number; readonly y: number }
export interface WorldGroundPoint { readonly x: number; readonly z: number }

/** D-046: sim north (+y) is Three.js north (-z). */
export function simToWorld(point: GroundPoint): WorldGroundPoint {
  return { x: point.x, z: -point.y };
}

export function worldToSim(point: WorldGroundPoint): GroundPoint {
  return { x: point.x, y: -point.z };
}

export interface BoxPlacement {
  readonly centerX: number;
  readonly centerZ: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/** A shared map box remains the only source of its footprint. */
export function boxPlacement(box: Box, height: number): BoxPlacement {
  return {
    centerX: (box[0] + box[2]) / 2,
    centerZ: -(box[1] + box[3]) / 2,
    width: box[2] - box[0],
    depth: box[3] - box[1],
    height,
  };
}
