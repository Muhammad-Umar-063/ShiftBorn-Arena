import { BALANCE } from '@shiftborn/shared';
import {
  BackSide, BoxGeometry, BufferGeometry, CanvasTexture, CapsuleGeometry,
  CircleGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Euler, Group,
  Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, RingGeometry,
  SphereGeometry, Vector3, type Camera, type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlayerVisual } from './entityState.js';
import { PALETTE } from './palette.js';

const BODY_HEIGHT = 1.45;
const RING_INNER_FRACTION = 0.88;
const OUTLINE_SCALE = 1.07;

export function playerYaw(aimRadians: number): number { return aimRadians; }

function labelTexture(name: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Canvas 2D unavailable');
  context.clearRect(0, 0, 256, 64);
  context.fillStyle = '#ff8d79';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = 'bold 33px system-ui, sans-serif';
  // Canvas text never interprets names as HTML.
  context.fillText(name.slice(0, 16), 128, 32, 248);
  return new CanvasTexture(canvas);
}

function addMesh(group: Group, geometry: Mesh['geometry'], material: MeshBasicMaterial,
  x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

export class PlayerView {
  readonly root = new Group();
  readonly id: string;
  private readonly silhouette = new Group();
  private readonly label: Mesh | null;
  private readonly ring: Mesh | null;
  private form = -1;
  private readonly owned: Array<{ dispose(): void }> = [];
  private readonly bodyMaterial: MeshBasicMaterial;
  private readonly outlineMaterial: MeshBasicMaterial | null;
  private readonly wedgeMaterial: MeshBasicMaterial;
  private covered = false;
  private readonly local: boolean;

  constructor(scene: Scene, player: PlayerVisual, local: boolean) {
    this.id = player.id;
    this.local = local;
    this.root.name = `player-${player.id}`;
    this.root.add(this.silhouette);
    this.bodyMaterial = new MeshBasicMaterial({ color: local ? PALETTE.localPlayer : PALETTE.enemyPlayer });
    this.outlineMaterial = local ? null : new MeshBasicMaterial({ color: PALETTE.enemyOutline,
      side: BackSide, depthTest: true });
    this.wedgeMaterial = new MeshBasicMaterial({ color: PALETTE.enemyOutline,
      transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false });
    this.owned.push(this.bodyMaterial, this.wedgeMaterial);
    if (this.outlineMaterial !== null) this.owned.push(this.outlineMaterial);
    if (local) {
      const geometry = new RingGeometry(BALANCE.forms.runner.radiusM * RING_INNER_FRACTION,
        BALANCE.forms.runner.radiusM, 32);
      geometry.rotateX(-Math.PI / 2);
      const material = new MeshBasicMaterial({ color: PALETTE.localRing, side: DoubleSide });
      this.ring = addMesh(this.root, geometry, material, 0, 0.025, 0);
      this.owned.push(geometry, material);
      this.label = null;
    } else {
      const texture = labelTexture(player.name);
      const geometry = new PlaneGeometry(2.7, 0.55);
      const material = new MeshBasicMaterial({ map: texture, transparent: true,
        depthTest: false, depthWrite: false, side: DoubleSide });
      this.label = addMesh(this.root, geometry, material, 0, 2.3, 0);
      this.owned.push(texture, geometry, material);
      this.ring = null;
    }
    scene.add(this.root);
    this.update(player, true, false, 0);
  }

  update(player: PlayerVisual, visible: boolean, coverBlocked: boolean,
    renderTick: number, camera?: Camera): void {
    if (player.form !== this.form) this.setForm(player.form);
    this.root.position.set(player.x, 0, -player.y);
    this.root.visible = player.alive && visible;
    this.silhouette.rotation.y = playerYaw(player.aim);
    this.silhouette.scale.y = player.abilityId === 1 && player.abilityPhase === 1 &&
      player.abilityEndTick > renderTick ? 0.75 : 1;
    // A solid foreground silhouette makes a covered enemy readable in TPP.
    if (coverBlocked !== this.covered) {
      this.covered = coverBlocked;
      this.bodyMaterial.depthTest = !coverBlocked;
      this.bodyMaterial.depthWrite = !coverBlocked;
      this.bodyMaterial.needsUpdate = true;
      if (this.outlineMaterial !== null) {
        this.outlineMaterial.depthTest = !coverBlocked;
        this.outlineMaterial.depthWrite = !coverBlocked;
        this.outlineMaterial.needsUpdate = true;
      }
    }
    if (this.label !== null && camera !== undefined) this.label.quaternion.copy(camera.quaternion);
  }

  private setForm(form: number): void {
    this.clearForm();
    this.form = form;
    const radius = form === 1 ? BALANCE.forms.beast.radiusM : form === 2
      ? BALANCE.forms.turret.radiusM : BALANCE.forms.runner.radiusM;
    if (this.ring !== null) {
      this.ring.scale.setScalar(radius / BALANCE.forms.runner.radiusM);
    }
    const parts: BufferGeometry[] = [];
    const part = (geometry: BufferGeometry, x: number, y: number, z: number,
      rotationZ = 0, sx = 1, sy = 1, sz = 1): void => {
      geometry.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z),
        new Quaternion().setFromEuler(new Euler(0, 0, rotationZ)),
        new Vector3(sx, sy, sz)));
      parts.push(geometry);
    };
    if (form === 0) {
      // Runner: board, capsule and a nose arrow, all pointing along local +X.
      part(new BoxGeometry(radius * 2.3, 0.1, radius * 1.25), 0, 0.1, 0);
      part(new CapsuleGeometry(radius * 0.65, 0.75, 4, 8), 0, 0.82, 0);
      part(new ConeGeometry(0.22, 0.46, 3), radius, 0.33, 0, -Math.PI / 2);
    } else if (form === 1) {
      // Rounded body with two distinct horns.
      part(new SphereGeometry(radius, 10, 8), 0, 1.02, 0, 0, 1, 0.7, 0.83);
      for (const z of [-0.52, 0.52]) {
        part(new ConeGeometry(0.22, 0.75, 6), 0.53, 1.93, z, -0.35);
      }
    } else {
      part(new CylinderGeometry(radius * 0.76, radius, BODY_HEIGHT, 12), 0, 0.77, 0);
      part(new BoxGeometry(radius * 1.9, 0.22, 0.26), radius, 1.18, 0);
      const wedge = new CircleGeometry(radius * 1.35, 24,
        -BALANCE.forms.turret.frontArcDeg * Math.PI / 360,
        BALANCE.forms.turret.frontArcDeg * Math.PI / 180);
      wedge.rotateX(-Math.PI / 2);
      addMesh(this.silhouette, wedge, this.wedgeMaterial, 0, 0.019, 0);
    }
    const merged = mergeGeometries(parts);
    for (const geometry of parts) geometry.dispose();
    if (merged === null) throw new Error('Could not merge greybox form geometry');
    const body = addMesh(this.silhouette, merged, this.bodyMaterial, 0, 0, 0);
    body.name = form === 2 ? 'turret-body-and-barrel' : form === 1 ? 'beast-body-and-horns'
      : 'runner-board-and-nose';
    if (this.outlineMaterial !== null) {
      const outline = addMesh(this.silhouette, merged, this.outlineMaterial, 0, 0, 0);
      outline.scale.setScalar(OUTLINE_SCALE);
    }
  }

  private clearForm(): void {
    const geometries = new Set<Mesh['geometry']>();
    for (const child of [...this.silhouette.children]) {
      this.silhouette.remove(child);
      if (child instanceof Mesh) geometries.add(child.geometry);
    }
    for (const geometry of geometries) geometry.dispose();
  }

  dispose(): void {
    this.root.removeFromParent();
    this.clearForm();
    for (const resource of this.owned) resource.dispose();
    this.owned.length = 0;
  }
}

export class EntityViews {
  private readonly views = new Map<string, PlayerView>();
  private readonly seen = new Set<string>();
  constructor(private readonly scene: Scene) {}
  update(players: readonly PlayerVisual[], localId: string, perspective: 'tpp' | 'fpp',
    coverBlocked: (player: PlayerVisual) => boolean, camera: Camera,
    renderTick: number): void {
    this.seen.clear();
    for (const player of players) this.seen.add(player.id);
    for (const [id, view] of this.views) if (!this.seen.has(id)) {
      view.dispose(); this.views.delete(id);
    }
    for (const player of players) {
      const local = player.id === localId;
      let view = this.views.get(player.id);
      if (view === undefined) {
        view = new PlayerView(this.scene, player, local);
        this.views.set(player.id, view);
      }
      view.update(player, !local || perspective === 'tpp', !local && coverBlocked(player),
        renderTick, camera);
    }
  }
  get size(): number { return this.views.size; }
  get(id: string): PlayerView | undefined { return this.views.get(id); }
  clear(): void { for (const view of this.views.values()) view.dispose(); this.views.clear(); }
  dispose(): void { this.clear(); }
}
