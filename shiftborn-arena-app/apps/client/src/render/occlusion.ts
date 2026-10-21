import type { Box } from '@shiftborn/shared';
import { Vector3, type MeshBasicMaterial } from 'three';
import type { GroundPoint } from './coordinates.js';

export interface VisiblePlayer extends GroundPoint {
  readonly radiusM?: number;
}

export interface Occluder {
  readonly id: string;
  readonly kind: 'wall' | 'cover';
  readonly box: Box;
  readonly height: number;
  readonly material: MeshBasicMaterial;
  readonly visible: boolean;
}

export interface Point3 { readonly x: number; readonly y: number; readonly z: number }

export const FADED_OPACITY = 0.3;
export const NORTH_FACE_FADE_DISTANCE_M = 2.5;

export function nearNorthFace(box: Box, player: VisiblePlayer): boolean {
  const radius = player.radiusM ?? 0;
  return player.x >= box[0] - radius && player.x <= box[2] + radius &&
    player.y >= box[3] &&
    player.y - box[3] <= NORTH_FACE_FADE_DISTANCE_M + radius;
}

/** Segment/AABB entry fraction in Three coordinates; used for occlusion and TPP collision. */
export function segmentBoxEntryFraction(
  startPoint: Point3, endPoint: Point3, box: Box,
  height: number, padding = 0,
): number | null {
  let near = 0;
  let far = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const min = axis === 0 ? box[0] - padding : axis === 1 ? -padding : -box[3] - padding;
    const max = axis === 0 ? box[2] + padding : axis === 1 ? height + padding
      : -box[1] + padding;
    const start = axis === 0 ? startPoint.x : axis === 1 ? startPoint.y : startPoint.z;
    const end = axis === 0 ? endPoint.x : axis === 1 ? endPoint.y : endPoint.z;
    const delta = end - start;
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return null;
      continue;
    }
    const first = (min - start) / delta;
    const second = (max - start) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return null;
  }
  return near <= 1 && far >= 0 ? near : null;
}

/** Segment/AABB test in Three coordinates; camera is above the map. */
export function sightlineIntersectsBox(
  camera: Point3, target: Point3,
  box: Box, height: number,
): boolean {
  return segmentBoxEntryFraction(camera, target, box, height) !== null;
}

export function shouldFadeOccluder(
  occluder: Pick<Occluder, 'box' | 'height' | 'visible'>,
  camera: Point3, localPlayer: GroundPoint,
  visiblePlayers: readonly VisiblePlayer[],
): boolean {
  if (!occluder.visible) return false;
  if (visiblePlayers.some((player) => nearNorthFace(occluder.box, player))) return true;
  const target = { x: localPlayer.x, y: 0.9, z: -localPlayer.y };
  return sightlineIntersectsBox(camera, target, occluder.box, occluder.height);
}

export class OcclusionController {
  private readonly faded = new Set<string>();
  private readonly localTarget = new Vector3();
  constructor(private readonly objects: readonly Occluder[]) {}

  update(
    camera: Readonly<Vector3>, localPlayer: GroundPoint,
    visiblePlayers: readonly VisiblePlayer[],
    enabled = true,
  ): void {
    this.localTarget.set(localPlayer.x, 0.9, -localPlayer.y);
    for (const object of this.objects) {
      const fade = enabled && object.visible &&
        (visiblePlayers.some((player) => nearNorthFace(object.box, player)) ||
          sightlineIntersectsBox(camera, this.localTarget, object.box,
            object.height));
      if (fade === this.faded.has(object.id)) continue;
      if (fade) this.faded.add(object.id);
      else this.faded.delete(object.id);
      object.material.opacity = fade ? FADED_OPACITY : 1;
      object.material.transparent = fade;
      object.material.depthWrite = !fade;
      object.material.needsUpdate = true;
    }
  }

  /** T-033 can render an entity silhouette where cover blocks this segment. */
  coverIdsBetween(camera: Point3, player: GroundPoint): readonly string[] {
    const target = { x: player.x, y: 0.9, z: -player.y };
    return this.objects.filter((object) => object.kind === 'cover' && object.visible &&
      sightlineIntersectsBox(camera, target, object.box, object.height))
      .map((object) => object.id);
  }

  coverBlocks(camera: Point3, player: GroundPoint): boolean {
    this.localTarget.set(player.x, 0.9, -player.y);
    for (const object of this.objects)
      if (object.kind === 'cover' && object.visible &&
        sightlineIntersectsBox(camera, this.localTarget, object.box, object.height))
        return true;
    return false;
  }
}
