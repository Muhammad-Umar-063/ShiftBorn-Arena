import { BALANCE, GREYBOX_V1, type Box, type MapData } from '@shiftborn/shared';
import {
  BoxGeometry, CanvasTexture, CircleGeometry, GridHelper, Group,
  InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, PlaneGeometry, RingGeometry, BufferGeometry,
  Float32BufferAttribute, type Scene,
} from 'three';
import { boxPlacement } from './coordinates.js';
import type { Occluder } from './occlusion.js';
import { PALETTE } from './palette.js';

export const WALL_HEIGHT_M = 3;
export const COVER_HEIGHT_M = 1.2;

export interface MapBoxDescription {
  readonly id: string;
  readonly kind: 'wall' | 'cover';
  readonly box: Box;
  readonly centerX: number;
  readonly centerZ: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export function describeMapBoxes(map: MapData = GREYBOX_V1): readonly MapBoxDescription[] {
  return [
    ...map.walls.map(({ id, box }) => ({ id, kind: 'wall' as const, box,
      ...boxPlacement(box, WALL_HEIGHT_M) })),
    ...map.cover.map(({ id, box }) => ({ id, kind: 'cover' as const, box,
      ...boxPlacement(box, COVER_HEIGHT_M) })),
  ];
}

function textTexture(label: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Canvas 2D unavailable');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#d5e0df';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 78px system-ui, sans-serif';
  context.fillText(label, canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = 'srgb';
  return texture;
}

function crackGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -0.42, 0.505, -0.42, 0.06, 0.505, -0.05,
    0.06, 0.505, -0.05, -0.08, 0.505, 0.15,
    -0.08, 0.505, 0.15, 0.40, 0.505, 0.43,
  ], 3));
  return geometry;
}

/** One owned, disposable static scene; no map coordinates are copied here. */
export class ArenaMap {
  readonly group = new Group();
  readonly occluders: readonly Occluder[];
  readonly boxes: readonly MapBoxDescription[];
  private readonly covers = new Map<string, Mesh<BoxGeometry, MeshBasicMaterial>>();
  private readonly rubble = new Map<string, Mesh>();
  private readonly rebuildTicks = new Map<string, number>();
  private readonly resources: Array<{ dispose(): void }> = [];
  private readonly zoneGroup = new Group();
  private readonly shardDots: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  private readonly shardMatrix = new Matrix4();
  private visibleShardIds: readonly string[] = [];
  private disposed = false;

  constructor(private readonly scene: Scene, readonly map: MapData = GREYBOX_V1) {
    this.boxes = describeMapBoxes(map);
    const occluders: Occluder[] = [];
    scene.add(this.group);

    const width = map.bounds.maxX - map.bounds.minX;
    const depth = map.bounds.maxY - map.bounds.minY;
    const west = map.walls.filter((wall) => wall.id.startsWith('DW-'));
    const east = map.walls.filter((wall) => wall.id.startsWith('DE-'));
    if (west.length === 0 || east.length === 0)
      throw new Error('Map lane divider missing');
    const westSplit = (west[0]?.box[0] ?? 0) +
      ((west[0]?.box[2] ?? 0) - (west[0]?.box[0] ?? 0)) / 2;
    const eastSplit = (east[0]?.box[0] ?? 0) +
      ((east[0]?.box[2] ?? 0) - (east[0]?.box[0] ?? 0)) / 2;
    const lanes = [
      { min: map.bounds.minX, max: westSplit, color: PALETTE.floorMarket,
        label: 'MARKET' },
      { min: westSplit, max: eastSplit, color: PALETTE.floorCore,
        label: 'CORE' },
      { min: eastSplit, max: map.bounds.maxX, color: PALETTE.floorScrapyard,
        label: 'SCRAPYARD' },
    ] as const;
    for (const lane of lanes) {
      const geometry = new PlaneGeometry(lane.max - lane.min, depth);
      const material = new MeshBasicMaterial({ color: lane.color });
      const floor = new Mesh(geometry, material);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((lane.min + lane.max) / 2, -0.012,
        -(map.bounds.minY + map.bounds.maxY) / 2);
      this.group.add(floor);
      this.resources.push(geometry, material);
    }
    const grid = new GridHelper(width, width, PALETTE.grid, PALETTE.grid);
    grid.position.set((map.bounds.minX + map.bounds.maxX) / 2, 0.005,
      -(map.bounds.minY + map.bounds.maxY) / 2);
    const gridMaterial = grid.material as LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.16;
    this.group.add(grid);
    this.resources.push(grid.geometry, gridMaterial);

    const labelPlane = new PlaneGeometry(1, 1);
    this.resources.push(labelPlane);
    for (const lane of lanes) {
      const texture = textTexture(lane.label);
      const material = new MeshBasicMaterial({ map: texture, transparent: true,
        depthWrite: false, opacity: 0.58 });
      const label = new Mesh(labelPlane, material);
      label.rotation.x = -Math.PI / 2;
      label.scale.set(lane.label === 'SCRAPYARD' ? 8 : 6, 1.5, 1);
      // The center band north of the middle doorway is open in all three lanes.
      label.position.set((lane.min + lane.max) / 2, 0.018, -5);
      this.group.add(label);
      this.resources.push(texture, material);
    }

    const boxGeometry = new BoxGeometry(1, 1, 1);
    const cracks = crackGeometry();
    const crackMaterial = new LineBasicMaterial({ color: PALETTE.crack });
    this.resources.push(boxGeometry, cracks, crackMaterial);
    for (const description of this.boxes) {
      const material = new MeshBasicMaterial({ color: description.kind === 'wall'
        ? PALETTE.wall : PALETTE.cover });
      const mesh = new Mesh(boxGeometry, material);
      mesh.name = description.id;
      mesh.scale.set(description.width, description.height, description.depth);
      mesh.position.set(description.centerX, description.height / 2,
        description.centerZ);
      this.group.add(mesh);
      this.resources.push(material);
      if (description.kind === 'cover') {
        const crack = new LineSegments(cracks, crackMaterial);
        mesh.add(crack);
        this.covers.set(description.id, mesh);
        const rubbleGeometry = new RingGeometry(Math.min(description.width, description.depth) * 0.35,
          Math.min(description.width, description.depth) * 0.48, 4);
        rubbleGeometry.rotateX(-Math.PI / 2);
        const rubbleMaterial = new MeshBasicMaterial({ color: PALETTE.rubble,
          transparent: true, opacity: 0.65, side: 2 });
        const rubble = new Mesh(rubbleGeometry, rubbleMaterial);
        rubble.position.set(description.centerX, 0.03, description.centerZ);
        rubble.visible = false;
        this.group.add(rubble);
        this.rubble.set(description.id, rubble);
        this.resources.push(rubbleGeometry, rubbleMaterial);
      }
      occluders.push({
        id: description.id, kind: description.kind,
        box: description.box, height: description.height, material,
        get visible() { return mesh.visible; },
      });
    }
    this.occluders = occluders;

    const shardGeometry = new CircleGeometry(0.13, 12);
    shardGeometry.rotateX(-Math.PI / 2);
    const shardMaterial = new MeshBasicMaterial({ color: PALETTE.shardPoint,
      transparent: true, opacity: 0.48, side: 2 });
    this.shardDots = new InstancedMesh(shardGeometry, shardMaterial,
      map.shardPoints.length);
    this.shardDots.name = 'shard-points';
    this.group.add(this.shardDots);
    this.resources.push(shardGeometry, shardMaterial);
    this.setActiveShardPoints([]);

    const zoneGeometry = new RingGeometry(0.54, 0.62, 24);
    zoneGeometry.rotateX(-Math.PI / 2);
    const zoneMaterial = new MeshBasicMaterial({ color: PALETTE.zonePoint,
      transparent: true, opacity: 0.72, side: 2 });
    const zoneRings = new InstancedMesh(zoneGeometry, zoneMaterial,
      map.zonePoints.length);
    const matrix = new Matrix4();
    for (const [index, point] of map.zonePoints.entries()) {
      matrix.makeTranslation(point.x, 0.029, -point.y);
      zoneRings.setMatrixAt(index, matrix);
      const texture = textTexture(point.id);
      const material = new MeshBasicMaterial({ map: texture, transparent: true,
        depthWrite: false });
      const label = new Mesh(labelPlane, material);
      label.rotation.x = -Math.PI / 2;
      label.scale.set(1.25, 0.42, 1);
      label.position.set(point.x + 1.15, 0.033, -point.y);
      this.zoneGroup.add(label);
      this.resources.push(texture, material);
    }
    zoneRings.instanceMatrix.needsUpdate = true;
    this.zoneGroup.add(zoneRings);
    this.zoneGroup.visible = false;
    this.group.add(this.zoneGroup);
    this.resources.push(zoneGeometry, zoneMaterial);
  }

  setCoverIntact(id: string, intact: boolean, rebuildTick = 0): boolean {
    const mesh = this.covers.get(id);
    if (mesh === undefined) return false;
    mesh.visible = intact;
    const rubble = this.rubble.get(id);
    if (rubble !== undefined) rubble.visible = !intact;
    this.rebuildTicks.set(id, rebuildTick);
    return true;
  }

  updateRubble(renderTick: number): void {
    for (const [id, rubble] of this.rubble) {
      if (!rubble.visible) continue;
      const remaining = (this.rebuildTicks.get(id) ?? 0) - renderTick;
      const material = rubble.material as MeshBasicMaterial;
      // Presentation pulse only; the authoritative intact flag rebuilds cover.
      material.opacity = remaining > 0 && remaining <= 3 * BALANCE.tick.rateHz
        ? 0.42 + 0.4 * (0.5 + 0.5 * Math.sin(renderTick * 0.55)) : 0.65;
    }
  }

  coverIsVisible(id: string): boolean | undefined { return this.covers.get(id)?.visible; }

  setZoneMarkersVisible(visible: boolean): void { this.zoneGroup.visible = visible; }
  get zoneMarkersVisible(): boolean { return this.zoneGroup.visible; }

  setActiveShardPoints(activeIds: readonly string[]): void {
    const active = new Set(activeIds);
    let count = 0;
    const visibleIds: string[] = [];
    for (const point of this.map.shardPoints) {
      if (active.has(point.id)) continue;
      this.shardMatrix.makeTranslation(point.x, 0.025, -point.y);
      this.shardDots.setMatrixAt(count, this.shardMatrix);
      visibleIds.push(point.id);
      count += 1;
    }
    this.visibleShardIds = visibleIds;
    this.shardDots.count = count;
    this.shardDots.instanceMatrix.needsUpdate = true;
  }

  get visibleShardPointIds(): readonly string[] {
    return [...this.visibleShardIds];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.group);
    for (const resource of this.resources) resource.dispose();
    this.group.clear();
    this.covers.clear();
    this.rubble.clear();
    this.rebuildTicks.clear();
  }
}
