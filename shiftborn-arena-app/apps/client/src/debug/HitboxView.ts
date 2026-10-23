import { BALANCE, WeaponId, type MapData } from '@shiftborn/shared';
import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments,
  Mesh, MeshBasicMaterial, RingGeometry, type Scene } from 'three';
import type { MapBoxDescription } from '../render/arenaMap.js';
import type { EntitySnapshot, PlayerVisual } from '../render/entityState.js';
import type { ProjectileVisual } from '../render/projectileTimeline.js';

function playerRadius(player: PlayerVisual): number {
  return player.form === 1 ? BALANCE.forms.beast.radiusM :
    player.form === 2 ? BALANCE.forms.turret.radiusM : BALANCE.forms.runner.radiusM;
}
function projectileRadius(weapon: WeaponId): number {
  return weapon === WeaponId.ScatterCannon ? BALANCE.weapons.scatterCannon.projRadiusM :
    weapon === WeaponId.RailRepeater ? BALANCE.weapons.railRepeater.projRadiusM :
      BALANCE.weapons.pulsePistol.projRadiusM;
}

/** Debug-only collision geometry. Resources are reused and never enter the sim. */
export class HitboxView {
  readonly group = new Group();
  private readonly circleGeometry = new RingGeometry(0.985, 1.015, 40);
  private readonly circleMaterial = new MeshBasicMaterial({ color: 0x43e6ac,
    depthTest: false, depthWrite: false, side: 2 });
  private readonly projectileMaterial = new MeshBasicMaterial({ color: 0xffdc66,
    depthTest: false, depthWrite: false, side: 2 });
  private readonly zoneMaterial = new MeshBasicMaterial({ color: 0xc78bff,
    depthTest: false, depthWrite: false, side: 2 });
  private readonly boxGeometry = new BoxGeometry(1, 0.01, 1);
  private readonly edgeGeometry = new EdgesGeometry(this.boxGeometry);
  private readonly wallMaterial = new LineBasicMaterial({ color: 0x68b8ff,
    depthTest: false });
  private readonly coverMaterial = new LineBasicMaterial({ color: 0xff8a66,
    depthTest: false });
  private readonly railMaterial = new LineBasicMaterial({ color: 0xff5cdd,
    depthTest: false });
  private readonly playerMeshes: Mesh[] = [];
  private readonly projectileMeshes: Mesh[] = [];
  private readonly railMeshes: LineSegments[] = [];
  private readonly coverMeshes = new Map<string, LineSegments>();
  private readonly zone = new Mesh(this.circleGeometry, this.zoneMaterial);
  private disposed = false;

  constructor(scene: Scene, boxes: readonly MapBoxDescription[],
    private readonly zonePoints: MapData['zonePoints']) {
    this.group.name = 'debug-hitboxes';
    this.group.visible = false;
    scene.add(this.group);
    for (const box of boxes) {
      const outline = new LineSegments(this.edgeGeometry,
        box.kind === 'cover' ? this.coverMaterial : this.wallMaterial);
      outline.name = `hitbox-${box.id}`;
      outline.scale.set(box.width, 1, box.depth);
      outline.position.set(box.centerX, 0.08, box.centerZ);
      this.group.add(outline);
      if (box.kind === 'cover') this.coverMeshes.set(box.id, outline);
    }
    this.zone.name = 'hitbox-zone';
    this.zone.rotation.x = -Math.PI / 2;
    this.zone.visible = false;
    this.group.add(this.zone);
  }

  get visible(): boolean { return this.group.visible; }
  setVisible(visible: boolean): void { this.group.visible = visible && !this.disposed; }

  update(snapshot: EntitySnapshot | null,
    projectiles: Iterable<ProjectileVisual>): void {
    if (!this.group.visible || this.disposed) return;
    const players = snapshot?.players.filter((player) => player.alive) ?? [];
    for (let index = 0; index < players.length; index += 1) {
      const player = players[index]!;
      const mesh = this.playerMeshes[index] ?? this.addCircle(this.playerMeshes,
        this.circleMaterial, 'hitbox-player');
      const radius = playerRadius(player);
      mesh.position.set(player.x, 0.11, -player.y);
      mesh.scale.setScalar(radius);
      mesh.visible = true;
      const rail = this.railMeshes[index] ?? this.addRail();
      rail.visible = player.abilityId === 2 && player.abilityPhase > 0;
      if (rail.visible) {
        rail.scale.set(BALANCE.abilities.railShot.rangeM, 1,
          BALANCE.abilities.railShot.widthM);
        rail.position.set(player.x + Math.cos(player.aim) *
          BALANCE.abilities.railShot.rangeM / 2, 0.14,
          -player.y - Math.sin(player.aim) * BALANCE.abilities.railShot.rangeM / 2);
        rail.rotation.y = player.aim;
      }
    }
    for (let index = players.length; index < this.playerMeshes.length; index += 1)
      this.playerMeshes[index]!.visible = false;
    for (let index = players.length; index < this.railMeshes.length; index += 1)
      this.railMeshes[index]!.visible = false;
    let count = 0;
    for (const shot of projectiles) {
      const mesh = this.projectileMeshes[count] ?? this.addCircle(
        this.projectileMeshes, this.projectileMaterial, 'hitbox-projectile');
      mesh.position.set(shot.x, 0.13, -shot.y);
      mesh.scale.setScalar(projectileRadius(shot.weapon));
      mesh.visible = true;
      count += 1;
    }
    for (let index = count; index < this.projectileMeshes.length; index += 1)
      this.projectileMeshes[index]!.visible = false;
    for (const [id, mesh] of this.coverMeshes)
      mesh.visible = snapshot?.cover.find((cover) => cover.id === id)?.intact ?? true;
    const point = snapshot?.zonePoint === null || snapshot?.zonePoint === undefined ?
      undefined : this.zonePoints[snapshot.zonePoint];
    this.zone.visible = point !== undefined;
    if (point !== undefined) {
      this.zone.position.set(point.x, 0.12, -point.y);
      this.zone.scale.setScalar(BALANCE.zoneFrenzy.zoneRadiusM);
    }
  }

  private addCircle(pool: Mesh[], material: MeshBasicMaterial, name: string): Mesh {
    const mesh = new Mesh(this.circleGeometry, material);
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 90;
    this.group.add(mesh); pool.push(mesh);
    return mesh;
  }
  private addRail(): LineSegments {
    const mesh = new LineSegments(this.edgeGeometry, this.railMaterial);
    mesh.name = 'hitbox-rail-width';
    mesh.renderOrder = 90;
    this.group.add(mesh); this.railMeshes.push(mesh);
    return mesh;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.circleGeometry.dispose(); this.edgeGeometry.dispose(); this.boxGeometry.dispose();
    this.circleMaterial.dispose(); this.projectileMaterial.dispose();
    this.zoneMaterial.dispose(); this.wallMaterial.dispose();
    this.coverMaterial.dispose(); this.railMaterial.dispose();
  }
}
