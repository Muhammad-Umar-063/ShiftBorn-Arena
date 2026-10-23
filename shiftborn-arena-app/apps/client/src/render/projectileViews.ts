import { BALANCE, WeaponId } from '@shiftborn/shared';
import { BoxGeometry, Color, DoubleSide, InstancedMesh, MeshBasicMaterial,
  Object3D, RingGeometry, SphereGeometry, type Scene } from 'three';
import type { PredictedShotStart } from '../predict/Predictor.js';
import type { WorldDelivery } from './worldEventTimeline.js';
import { PALETTE } from './palette.js';
import { MAX_PROJECTILE_VISUALS, ProjectileTimeline,
  type ProjectileVisual } from './projectileTimeline.js';

type ShotGroup = { readonly weapon: WeaponId; readonly own: boolean;
  readonly mesh: InstancedMesh; readonly color: Color };
interface Flash { readonly x: number; readonly y: number;
  readonly kind: 'hit' | 'impact' | 'expire' | 'blocked';
  readonly own: boolean; readonly atMs: number }
const FLASH_MS = 150; // Decorative event presentation, not a gameplay timer.

function radius(weapon: WeaponId): number {
  switch (weapon) {
    // T-058 (Codex) adds tier 2 groups; until then these radii only size interim visuals.
    case WeaponId.RicochetDisc: return BALANCE.weapons.ricochetDisc.projRadiusM;
    case WeaponId.SlugCannon: return BALANCE.weapons.slugCannon.projRadiusM;
    case WeaponId.ArcMortar: return BALANCE.weapons.arcMortar.blastRadiusM;
    case WeaponId.Dagger: return 0;
    case WeaponId.PulsePistol: return BALANCE.weapons.pulsePistol.projRadiusM;
    case WeaponId.ScatterCannon: return BALANCE.weapons.scatterCannon.projRadiusM;
    case WeaponId.RailRepeater: return BALANCE.weapons.railRepeater.projRadiusM;
  }
}
function groupName(weapon: WeaponId, own: boolean): string {
  return `projectiles-${own ? 'own' : 'enemy'}-${weapon}`;
}

/** Reuses six fixed instanced draws and one event-only presentation model. */
export class ProjectileViews {
  readonly timeline = new ProjectileTimeline();
  private readonly sphere = new SphereGeometry(1, 8, 6);
  private readonly bolt = new BoxGeometry(1, 1, 1);
  private readonly flashGeometry = new RingGeometry(0.65, 1, 16);
  private readonly material = new MeshBasicMaterial({ color: 0xffffff });
  private readonly flashMaterial = new MeshBasicMaterial({ color: 0xffffff,
    side: DoubleSide, depthWrite: false });
  readonly flashMesh = new InstancedMesh(this.flashGeometry, this.flashMaterial,
    MAX_PROJECTILE_VISUALS);
  private readonly groups: ShotGroup[] = [];
  private readonly flashes: Flash[] = [];
  private readonly dummy = new Object3D();
  private readonly scratchColor = new Color();
  private disposed = false;

  constructor(private readonly scene: Scene) {
    this.flashMesh.name = 'projectile-terminal-effects';
    this.flashMesh.count = 0;
    this.flashMesh.frustumCulled = false;
    this.scene.add(this.flashMesh);
    for (const weapon of [WeaponId.PulsePistol, WeaponId.ScatterCannon,
      WeaponId.RailRepeater]) for (const own of [true, false]) {
      const mesh = new InstancedMesh(weapon === WeaponId.RailRepeater
        ? this.bolt : this.sphere, this.material, MAX_PROJECTILE_VISUALS);
      mesh.name = groupName(weapon, own);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.groups.push({ weapon, own, mesh,
        color: new Color(own ? PALETTE.ownRail : PALETTE.enemyRail) });
    }
  }

  get count(): number { return this.timeline.count; }

  setContext(matchId: string, localId: string): void {
    const previous = this.timeline.context;
    if (previous.matchId === matchId && previous.localId === localId) return;
    this.timeline.setContext(matchId, localId);
    this.flashes.length = 0;
    this.clearDraws();
  }

  startPredicted(shots: readonly PredictedShotStart[], atMs: number): number[] {
    return this.timeline.startPredicted(shots, atMs);
  }

  onReceipt(delivery: WorldDelivery, atMs: number): number | null {
    return this.timeline.onReceipt(delivery, atMs);
  }

  onWorld(delivery: WorldDelivery, atMs: number): void {
    const cue = this.timeline.onWorld(delivery);
    if (cue !== null) {
      if (this.flashes.length >= MAX_PROJECTILE_VISUALS) this.flashes.shift();
      this.flashes.push({ ...cue, atMs });
    }
  }

  update(atMs: number, renderTick: number): void {
    if (this.disposed) return;
    this.timeline.advance(atMs, renderTick);
    for (const group of this.groups) {
      let count = 0;
      for (const shot of this.timeline.entries()) {
        if (shot.weapon !== group.weapon || shot.own !== group.own) continue;
        this.writeInstance(group, count, shot);
        count += 1;
      }
      group.mesh.count = count;
      if (count > 0) {
        group.mesh.instanceMatrix.needsUpdate = true;
        if (group.mesh.instanceColor !== null)
          group.mesh.instanceColor.needsUpdate = true;
      }
    }
    let flashCount = 0;
    for (let index = 0; index < this.flashes.length;) {
      const flash = this.flashes[index];
      if (flash === undefined) break;
      const age = atMs - flash.atMs;
      if (age >= FLASH_MS) { this.flashes.splice(index, 1); continue; }
      const fade = Math.max(0, 1 - age / FLASH_MS);
      this.dummy.position.set(flash.x, 0.48, -flash.y);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      const scale = (flash.kind === 'hit' ? 0.5 : flash.kind === 'blocked'
        ? 0.35 : flash.kind === 'impact' ? 0.4 : 0.25) *
        (1 + (1 - fade) * 0.5);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.flashMesh.setMatrixAt(flashCount, this.dummy.matrix);
      const color = flash.kind === 'blocked' ? PALETTE.stun
        : flash.own ? PALETTE.ownRail : PALETTE.enemyRail;
      this.scratchColor.set(color).multiplyScalar(fade);
      this.flashMesh.setColorAt(flashCount, this.scratchColor);
      flashCount += 1;
      index += 1;
    }
    this.flashMesh.count = flashCount;
    if (flashCount > 0) {
      this.flashMesh.instanceMatrix.needsUpdate = true;
      if (this.flashMesh.instanceColor !== null)
        this.flashMesh.instanceColor.needsUpdate = true;
    }
  }

  clear(): void { this.timeline.clear(); this.flashes.length = 0; this.clearDraws(); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.timeline.dispose();
    this.flashes.length = 0;
    this.flashMesh.removeFromParent(); this.flashMesh.dispose();
    for (const group of this.groups) {
      group.mesh.removeFromParent(); group.mesh.dispose();
    }
    this.groups.length = 0;
    this.sphere.dispose(); this.bolt.dispose(); this.material.dispose();
    this.flashGeometry.dispose(); this.flashMaterial.dispose();
  }

  private clearDraws(): void {
    for (const group of this.groups) group.mesh.count = 0;
    this.flashMesh.count = 0;
  }

  private writeInstance(group: ShotGroup, index: number,
    shot: ProjectileVisual): void {
    const size = radius(shot.weapon);
    this.dummy.position.set(shot.x, size + 0.45, -shot.y);
    this.dummy.rotation.set(0, shot.angle, 0);
    const fade = 0.5 + shot.opacity * 0.5;
    if (shot.weapon === WeaponId.RailRepeater)
      this.dummy.scale.set(size * 4 * fade, size * 2 * fade,
        size * 2 * fade);
    else this.dummy.scale.setScalar(size * fade);
    this.dummy.updateMatrix();
    group.mesh.setMatrixAt(index, this.dummy.matrix);
    this.scratchColor.copy(group.color).multiplyScalar(shot.opacity);
    group.mesh.setColorAt(index, this.scratchColor);
  }
}
