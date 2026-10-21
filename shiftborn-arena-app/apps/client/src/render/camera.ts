import { BALANCE } from '@shiftborn/shared';
import {
  PerspectiveCamera, Raycaster, Vector2, Vector3,
} from 'three';
import type { GroundPoint } from './coordinates.js';
import { segmentBoxEntryFraction, type Occluder } from './occlusion.js';

export type CameraForm = keyof typeof BALANCE.forms;
export type CameraInputScheme = 'mouse' | 'keys';
export type CameraPerspective = 'tpp' | 'fpp';

export interface CameraViewInput {
  readonly player: GroundPoint;
  readonly aimRadians: number;
  readonly form: CameraForm;
  readonly inputScheme: CameraInputScheme;
  readonly cursorDistanceM: number;
  readonly reducedMotion: boolean;
  readonly perspective: CameraPerspective;
}

export const TPP_VERTICAL_FOV_DEG = 55;
export const FPP_VERTICAL_FOV_DEG = 65;
export const TPP_FOLLOW_DISTANCE_M = 4;
export const TPP_HEIGHT_M = 2.8;
export const FPP_EYE_HEIGHT_M = 1.6;
export const ZOOM_TRANSITION_S = 0.3;
export const LEAD_TIME_CONSTANT_S = 0.15;
export const MAX_LEAD_M = 6;
export const MOUSE_FULL_LEAD_M = 12;
export const KEYBOARD_LEAD_FRACTION = 0.6;

export function cameraZoom(form: CameraForm): number {
  return BALANCE.forms[form].cameraZoom;
}

export function leadDistance(input: Pick<CameraViewInput,
  'inputScheme' | 'cursorDistanceM'>): number {
  const factor = input.inputScheme === 'keys' ? KEYBOARD_LEAD_FRACTION
    : Math.min(1, Math.max(0, input.cursorDistanceM / MOUSE_FULL_LEAD_M));
  return MAX_LEAD_M * factor;
}

export function intersectGroundRay(
  camera: PerspectiveCamera, ndcX: number, ndcY: number,
  raycaster: Raycaster = new Raycaster(),
): GroundPoint | null {
  raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
  const direction = raycaster.ray.direction;
  if (direction.y >= 0) return null;
  const distance = -raycaster.ray.origin.y / direction.y;
  if (!Number.isFinite(distance) || distance < 0) return null;
  const point = raycaster.ray.at(distance, new Vector3());
  return { x: point.x, y: -point.z };
}

export function groundToNdc(
  camera: PerspectiveCamera, point: GroundPoint,
  target: Vector3 = new Vector3(),
): { readonly x: number; readonly y: number } {
  target.set(point.x, 0, -point.y).project(camera);
  return { x: target.x, y: target.y };
}

export interface GroundFootprint {
  readonly northSouthM: number;
  readonly eastWestThroughTargetM: number;
}

export function groundFootprint(camera: PerspectiveCamera): GroundFootprint | null {
  const top = intersectGroundRay(camera, 0, 1);
  const bottom = intersectGroundRay(camera, 0, -1);
  const left = intersectGroundRay(camera, -1, 0);
  const right = intersectGroundRay(camera, 1, 0);
  if (top === null || bottom === null || left === null || right === null) return null;
  return {
    northSouthM: Math.abs(top.y - bottom.y),
    eastWestThroughTargetM: Math.abs(right.x - left.x),
  };
}

/** Local presentation camera. TPP follows behind aim; FPP sits at eye height. */
export class ArenaCamera {
  readonly camera: PerspectiveCamera;
  private initialized = false;
  private form: CameraForm = 'runner';
  private zoom = cameraZoom('runner');
  private zoomFrom = this.zoom;
  private zoomTo = this.zoom;
  private zoomElapsedS = ZOOM_TRANSITION_S;
  private leadX = 0;
  private leadY = 0;
  private leadVelocityX = 0;
  private leadVelocityY = 0;
  private readonly target = new Vector3();
  private readonly anchor = new Vector3();
  private readonly desired = new Vector3();
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private obstacles: readonly Pick<Occluder, 'box' | 'height' | 'visible'>[] = [];

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(TPP_VERTICAL_FOV_DEG, aspect, 0.1, 160);
    this.update({ player: { x: 0, y: 0 }, aimRadians: 0, form: 'runner',
      inputScheme: 'mouse', cursorDistanceM: 0, reducedMotion: true,
      perspective: 'tpp' }, 0);
  }

  get currentZoom(): number { return this.zoom; }
  get lead(): GroundPoint { return { x: this.leadX, y: this.leadY }; }

  setObstacles(obstacles: readonly Pick<Occluder, 'box' | 'height' | 'visible'>[]): void {
    this.obstacles = obstacles;
  }

  resize(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(input: CameraViewInput, deltaS: number): void {
    const dt = Math.max(0, Math.min(0.25, Number.isFinite(deltaS) ? deltaS : 0));
    if (!this.initialized) {
      this.initialized = true;
      this.form = input.form;
      this.zoom = cameraZoom(input.form);
      this.zoomFrom = this.zoom;
      this.zoomTo = this.zoom;
    } else if (input.form !== this.form) {
      this.form = input.form;
      this.zoomFrom = this.zoom;
      this.zoomTo = cameraZoom(input.form);
      this.zoomElapsedS = 0;
    }
    this.zoomElapsedS = Math.min(ZOOM_TRANSITION_S, this.zoomElapsedS + dt);
    this.zoom = this.zoomFrom + (this.zoomTo - this.zoomFrom) *
      (this.zoomElapsedS / ZOOM_TRANSITION_S);

    const distance = leadDistance(input);
    const targetX = Math.cos(input.aimRadians) * distance;
    const targetY = Math.sin(input.aimRadians) * distance;
    if (input.reducedMotion) {
      this.leadX = targetX;
      this.leadY = targetY;
      this.leadVelocityX = 0;
      this.leadVelocityY = 0;
    } else {
      const omega = 1 / LEAD_TIME_CONSTANT_S;
      const decay = Math.exp(-omega * dt);
      const errorX = this.leadX - targetX;
      const stepX = (this.leadVelocityX + omega * errorX) * dt;
      this.leadX = targetX + (errorX + stepX) * decay;
      this.leadVelocityX = (this.leadVelocityX - omega * stepX) * decay;
      const errorY = this.leadY - targetY;
      const stepY = (this.leadVelocityY + omega * errorY) * dt;
      this.leadY = targetY + (errorY + stepY) * decay;
      this.leadVelocityY = (this.leadVelocityY - omega * stepY) * decay;
    }
    const dirX = Math.cos(input.aimRadians);
    const dirZ = -Math.sin(input.aimRadians);
    const playerZ = -input.player.y;
    if (input.perspective === 'fpp') {
      this.camera.position.set(input.player.x, FPP_EYE_HEIGHT_M, playerZ);
      this.target.set(input.player.x + dirX * 10, FPP_EYE_HEIGHT_M,
        playerZ + dirZ * 10);
    } else {
      this.anchor.set(input.player.x, FPP_EYE_HEIGHT_M, playerZ);
      this.desired.set(input.player.x - dirX * TPP_FOLLOW_DISTANCE_M * this.zoom,
        TPP_HEIGHT_M * this.zoom,
        playerZ - dirZ * TPP_FOLLOW_DISTANCE_M * this.zoom);
      let closest = 1;
      for (const obstacle of this.obstacles) {
        if (!obstacle.visible) continue;
        const entry = segmentBoxEntryFraction(this.anchor, this.desired,
          obstacle.box, obstacle.height, 0.2);
        if (entry !== null && entry < closest) closest = entry;
      }
      const length = this.anchor.distanceTo(this.desired);
      const safeFraction = closest === 1 ? 1
        : Math.max(0, closest - 0.25 / length);
      this.camera.position.copy(this.anchor).lerp(this.desired, safeFraction);
      const forwardLead = Math.max(0, this.leadX * dirX - this.leadY * dirZ);
      const lookAhead = 2 + forwardLead / 3;
      this.target.set(input.player.x + dirX * lookAhead, 1.2,
        playerZ + dirZ * lookAhead);
    }
    const fieldOfView = input.perspective === 'fpp'
      ? FPP_VERTICAL_FOV_DEG / this.zoom : TPP_VERTICAL_FOV_DEG;
    if (this.camera.fov !== fieldOfView) {
      this.camera.fov = fieldOfView;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  groundAtNdc(x: number, y: number): GroundPoint | null {
    this.raycaster.setFromCamera(this.ndc.set(x, y), this.camera);
    const ray = this.raycaster.ray;
    if (ray.direction.y >= 0) return null;
    const distance = -ray.origin.y / ray.direction.y;
    return Number.isFinite(distance) && distance >= 0
      ? { x: ray.origin.x + ray.direction.x * distance,
        y: -(ray.origin.z + ray.direction.z * distance) } : null;
  }
}
