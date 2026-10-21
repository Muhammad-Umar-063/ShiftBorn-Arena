import { BALANCE, EventId, GREYBOX_V1 } from '@shiftborn/shared';
import {
  BoxGeometry, BufferGeometry, CanvasTexture,
  DoubleSide, Group, IcosahedronGeometry, InstancedMesh,
  LineDashedMaterial, LineLoop, Mesh,
  MeshBasicMaterial, Object3D, OctahedronGeometry, PlaneGeometry,
  RingGeometry, SphereGeometry, Vector3, type Camera, type Scene,
} from 'three';
import type { EventBatch } from '../net/messageValidation.js';
import type { ClusterVisual, EntitySnapshot, PlayerVisual } from './entityState.js';
import { PALETTE } from './palette.js';

export type PresentationEvent =
  | { readonly kind: 'railRelease'; readonly tick: number; readonly seat: number;
      readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
      readonly playerId?: string | null }
  | { readonly kind: 'ramImpact'; readonly tick: number; readonly seat: number;
      readonly x: number; readonly y: number; readonly playerId?: string | null };

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function seat(value: unknown): value is number { return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value < BALANCE.match.seats; }

/** Only actual authoritative releases create a Rail beam. Fixture events use the same type. */
export function decodeVisualEvents(batch: EventBatch): PresentationEvent[] {
  const result: PresentationEvent[] = [];
  for (const event of batch.events) {
    if (event[0] === EventId.RailShotFired && seat(event[1]) &&
      finite(event[2]) && finite(event[3]) && finite(event[4]) && finite(event[5]))
      result.push({ kind: 'railRelease', tick: batch.tick, seat: event[1],
        x1: event[2], y1: event[3], x2: event[4], y2: event[5] });
  }
  return result;
}

const MORPH_TICKS = BALANCE.morph.durationS * BALANCE.tick.rateHz;
const RAIL_TICKS = BALANCE.abilities.railShot.chargeS * BALANCE.tick.rateHz;
const BEAM_LIFE_TICKS = Math.ceil(0.18 * BALANCE.tick.rateHz);
const IMPACT_LIFE_TICKS = Math.ceil(0.3 * BALANCE.tick.rateHz);
const SHARD_CAPACITY = 32;

export function morphProgress(endTick: number, renderTick: number): number | null {
  const progress = (renderTick - (endTick - MORPH_TICKS)) / MORPH_TICKS;
  return endTick > 0 && progress >= 0 && progress < 1 ? progress : null;
}

export function railChargeProgress(startTick: number, endTick: number,
  renderTick: number): number | null {
  if (endTick <= renderTick || renderTick < startTick) return null;
  return Math.max(0, Math.min(1, (renderTick - startTick) / RAIL_TICKS));
}

interface PlayerEffects {
  readonly group: Group;
  readonly morph: Mesh;
  readonly protection: Mesh;
  readonly stars: readonly Mesh[];
  readonly trail: Mesh;
  readonly rail: Mesh;
  readonly playerId: string;
}

interface Flash { readonly mesh: Mesh; readonly endTick: number; readonly startTick: number }

function countdownTexture(): CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
  return new CanvasTexture(canvas);
}
function drawCountdown(texture: CanvasTexture, seconds: number): void {
  const canvas = texture.image as HTMLCanvasElement;
  const context = canvas.getContext('2d');
  if (context === null) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#b9ffca'; context.textAlign = 'center';
  context.font = 'bold 46px system-ui, sans-serif';
  context.fillText(String(seconds), 64, 47);
  texture.needsUpdate = true;
}

interface ClusterMarker { readonly group: Group; readonly label: Mesh;
  readonly texture: CanvasTexture; lastSeconds: number }

/** Read-only effects projection driven by explicit server ticks and presentation fixtures. */
export class ArenaEffects {
  private readonly players = new Map<string, PlayerEffects>();
  private readonly seenPlayers = new Set<string>();
  private readonly seenClusters = new Set<number>();
  private readonly clusters = new Map<number, ClusterMarker>();
  private readonly flashes: Flash[] = [];
  private readonly owned: Array<{ dispose(): void }> = [];
  private shardMesh: InstancedMesh;
  private shardCapacity = SHARD_CAPACITY;
  private readonly shardDummy = new Object3D();
  private readonly shardGeometry = new OctahedronGeometry(1);
  private readonly shardMaterial = new MeshBasicMaterial({ color: PALETTE.shardPoint });
  private readonly morphGeometry = new RingGeometry(0.2, 0.32, 24);
  private readonly morphMaterial = new MeshBasicMaterial({ color: PALETTE.morph, transparent: true,
    opacity: 0.8, side: DoubleSide, depthWrite: false });
  private readonly bubbleGeometry = new SphereGeometry(1, 14, 10);
  private readonly bubbleMaterial = new MeshBasicMaterial({ color: PALETTE.protection,
    transparent: true, opacity: 0.16, depthWrite: false });
  private readonly starGeometry = new IcosahedronGeometry(0.13, 0);
  private readonly starMaterial = new MeshBasicMaterial({ color: PALETTE.stun });
  private readonly trailGeometry = new BoxGeometry(0.8, 0.2, 0.22);
  private readonly trailMaterial = new MeshBasicMaterial({ color: PALETTE.localPlayer,
    transparent: true, opacity: 0.42, depthWrite: false });
  private readonly railGeometry = new BoxGeometry(1, 0.045, 0.045);
  private readonly ownRailMaterial = new MeshBasicMaterial({ color: PALETTE.ownRail,
    transparent: true, opacity: 0.5, depthWrite: false });
  private readonly enemyRailMaterial = new MeshBasicMaterial({ color: PALETTE.enemyRail,
    transparent: true, opacity: 0.5, depthWrite: false });
  private readonly flashGeometry = new BoxGeometry(1, 0.16, 0.16);
  private readonly impactGeometry = new RingGeometry(0.45, 0.6, 24);
  private readonly impactMaterial = new MeshBasicMaterial({ color: PALETTE.morph,
    transparent: true, opacity: 0.8, side: DoubleSide, depthWrite: false });
  private readonly clusterGeometry: BufferGeometry;
  private readonly clusterMaterial = new LineDashedMaterial({ color: PALETTE.shardPoint,
    dashSize: 0.42, gapSize: 0.28 });
  private disposed = false;

  constructor(private readonly scene: Scene) {
    this.shardMesh = this.makeShardMesh(this.shardCapacity);
    const points: Vector3[] = [];
    for (let i = 0; i < 49; i += 1) {
      const a = i * Math.PI * 2 / 48;
      points.push(new Vector3(Math.cos(a) * BALANCE.shards.clusterOffsetM * 1.5,
        0.035, Math.sin(a) * BALANCE.shards.clusterOffsetM * 1.5));
    }
    this.clusterGeometry = new BufferGeometry().setFromPoints(points);
    this.owned.push(this.shardGeometry, this.shardMaterial, this.morphGeometry,
      this.morphMaterial, this.bubbleGeometry, this.bubbleMaterial, this.starGeometry,
      this.starMaterial, this.trailGeometry, this.trailMaterial, this.railGeometry,
      this.ownRailMaterial, this.enemyRailMaterial, this.flashGeometry,
      this.impactGeometry, this.impactMaterial, this.clusterGeometry, this.clusterMaterial);
  }

  private makeShardMesh(capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(this.shardGeometry, this.shardMaterial, capacity);
    mesh.count = 0;
    mesh.name = 'active-shards';
    this.scene.add(mesh);
    return mesh;
  }

  private playerEffects(id: string): PlayerEffects {
    const group = new Group(); group.name = `effects-${id}`;
    const morph = new Mesh(this.morphGeometry, this.morphMaterial);
    morph.rotation.x = -Math.PI / 2; morph.position.y = 0.08;
    const protection = new Mesh(this.bubbleGeometry, this.bubbleMaterial);
    protection.position.y = 0.9;
    const stars = Array.from({ length: 3 }, () => new Mesh(this.starGeometry, this.starMaterial));
    const trail = new Mesh(this.trailGeometry, this.trailMaterial);
    const rail = new Mesh(this.railGeometry, this.ownRailMaterial);
    group.add(morph, protection, trail, rail, ...stars);
    this.scene.add(group);
    const effects = { group, morph, protection, stars, trail, rail, playerId: id };
    this.players.set(id, effects);
    return effects;
  }

  update(snapshot: EntitySnapshot, renderTick: number, camera: Camera): void {
    if (this.disposed) return;
    this.seenPlayers.clear();
    for (const player of snapshot.players) this.seenPlayers.add(player.id);
    for (const [id, effects] of this.players) if (!this.seenPlayers.has(id)) {
      effects.group.removeFromParent(); this.players.delete(id);
    }
    for (const player of snapshot.players) {
      const fx = this.players.get(player.id) ?? this.playerEffects(player.id);
      this.updatePlayer(fx, player, snapshot.localPlayerId, renderTick);
    }
    this.updateShards(snapshot.shards, renderTick);
    this.updateClusters(snapshot.clusters, renderTick, camera);
    this.updateFlashes(renderTick);
  }

  private updatePlayer(fx: PlayerEffects, player: PlayerVisual, localId: string,
    renderTick: number): void {
    fx.group.position.set(player.x, 0, -player.y);
    fx.group.visible = player.alive;
    const progress = morphProgress(player.morphEndTick, renderTick);
    fx.morph.visible = player.morphTarget >= 0 && progress !== null;
    if (progress !== null) fx.morph.scale.setScalar(0.5 + progress * 5);
    fx.protection.visible = player.protectedEndTick > renderTick;
    const radius = player.form === 1 ? BALANCE.forms.beast.radiusM : player.form === 2
      ? BALANCE.forms.turret.radiusM : BALANCE.forms.runner.radiusM;
    fx.protection.scale.setScalar(radius * 1.35);
    const stunned = player.stunEndTick > renderTick;
    for (const [index, star] of fx.stars.entries()) {
      star.visible = stunned;
      const angle = renderTick * 0.15 + index * Math.PI * 2 / 3;
      star.position.set(Math.cos(angle) * radius, 2.12, -Math.sin(angle) * radius);
    }
    const dash = player.abilityId === 0 && player.abilityEndTick > renderTick;
    const ram = player.abilityId === 1 && player.abilityEndTick > renderTick;
    fx.trail.visible = dash || (ram && player.abilityPhase > 1) || player.knockbackEndTick > renderTick;
    fx.trail.position.set(-Math.cos(player.aim) * radius, 0.6,
      Math.sin(player.aim) * radius);
    fx.trail.rotation.y = player.aim;
    // T-041 supplies Ram state; PlayerView owns the windup body squash.
    const chargeProgress = railChargeProgress(player.abilityStartTick,
      player.abilityEndTick, renderTick);
    const charging = player.abilityId === 2 && chargeProgress !== null;
    fx.rail.visible = charging;
    if (charging) {
      const material = player.id === localId ? this.ownRailMaterial : this.enemyRailMaterial;
      fx.rail.material = material;
      material.opacity = 0.25 + (chargeProgress ?? 0) * 0.7;
      fx.rail.scale.x = BALANCE.abilities.railShot.rangeM;
      fx.rail.position.set(Math.cos(player.aim) * BALANCE.abilities.railShot.rangeM / 2,
        1.15, -Math.sin(player.aim) * BALANCE.abilities.railShot.rangeM / 2);
      fx.rail.rotation.y = player.aim;
    }
  }

  private updateShards(shards: EntitySnapshot['shards'], renderTick: number): void {
    if (shards.length > this.shardCapacity) {
      this.shardMesh.removeFromParent();
      this.shardMesh.dispose();
      this.shardCapacity = Math.max(shards.length, this.shardCapacity * 2);
      this.shardMesh = this.makeShardMesh(this.shardCapacity);
    }
    for (const [index, shard] of shards.entries()) {
      const size = shard.kind === 1 ? 0.5 : 0.3;
      this.shardDummy.position.set(shard.x,
        0.35 + 0.08 * Math.sin(renderTick * 0.09 + index), -shard.y);
      this.shardDummy.rotation.set(0, renderTick * 0.025 + index, 0);
      this.shardDummy.scale.setScalar(size / 2);
      this.shardDummy.updateMatrix();
      this.shardMesh.setMatrixAt(index, this.shardDummy.matrix);
    }
    this.shardMesh.count = shards.length;
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }

  private updateClusters(clusters: readonly ClusterVisual[], renderTick: number,
    camera: Camera): void {
    this.seenClusters.clear();
    for (const cluster of clusters) this.seenClusters.add(cluster.pointIndex);
    for (const [index, marker] of this.clusters) if (!this.seenClusters.has(index)) {
      marker.group.removeFromParent(); marker.texture.dispose();
      (marker.label.geometry as PlaneGeometry).dispose();
      (marker.label.material as MeshBasicMaterial).dispose();
      this.clusters.delete(index);
    }
    for (const cluster of clusters) {
      const point = GREYBOX_V1.shardPoints[cluster.pointIndex];
      if (point === undefined) continue;
      let marker = this.clusters.get(cluster.pointIndex);
      if (marker === undefined) {
        const group = new Group();
        const line = new LineLoop(this.clusterGeometry, this.clusterMaterial);
        line.computeLineDistances(); group.add(line);
        const texture = countdownTexture();
        const label = new Mesh(new PlaneGeometry(1.4, 0.7),
          new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
        label.position.y = 1.15; group.add(label);
        group.position.set(point.x, 0, -point.y);
        this.scene.add(group);
        marker = { group, label, texture, lastSeconds: -1 };
        this.clusters.set(cluster.pointIndex, marker);
      }
      const seconds = Math.max(0, Math.ceil((cluster.spawnTick - renderTick) /
        BALANCE.tick.rateHz));
      if (seconds !== marker.lastSeconds) {
        drawCountdown(marker.texture, seconds); marker.lastSeconds = seconds;
      }
      marker.label.quaternion.copy(camera.quaternion);
    }
  }

  ingest(events: readonly PresentationEvent[], localId: string,
    players: readonly PlayerVisual[]): void {
    for (const event of events) {
      const owner = players.find((player) => player.seat === event.seat);
      if (event.kind === 'railRelease') {
        const length = Math.hypot(event.x2 - event.x1, event.y2 - event.y1);
        if (length <= 0) continue;
        const own = event.playerId === undefined ? owner?.id === localId
          : event.playerId === localId;
        const material = new MeshBasicMaterial({ color: own
          ? PALETTE.ownRail : PALETTE.enemyRail,
          transparent: true, opacity: 0.95, depthWrite: false });
        const mesh = new Mesh(this.flashGeometry, material);
        mesh.position.set((event.x1 + event.x2) / 2, 1.15,
          -(event.y1 + event.y2) / 2);
        mesh.rotation.y = Math.atan2(event.y2 - event.y1, event.x2 - event.x1);
        mesh.scale.x = length;
        this.scene.add(mesh);
        this.flashes.push({ mesh, startTick: event.tick,
          endTick: event.tick + BEAM_LIFE_TICKS });
      } else {
        const mesh = new Mesh(this.impactGeometry, this.impactMaterial);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(event.x, 0.06, -event.y);
        this.scene.add(mesh);
        this.flashes.push({ mesh, startTick: event.tick,
          endTick: event.tick + IMPACT_LIFE_TICKS });
      }
    }
  }

  private updateFlashes(renderTick: number): void {
    for (let index = this.flashes.length - 1; index >= 0; index -= 1) {
      const flash = this.flashes[index];
      if (flash === undefined) continue;
      if (renderTick >= flash.endTick) {
        flash.mesh.removeFromParent();
        if (flash.mesh.material !== this.impactMaterial)
          (flash.mesh.material as MeshBasicMaterial).dispose();
        this.flashes.splice(index, 1);
      } else if (flash.mesh.geometry === this.impactGeometry) {
        flash.mesh.scale.setScalar(1 + 2 * (renderTick - flash.startTick) /
          (flash.endTick - flash.startTick));
      }
    }
  }

  get shardCount(): number { return this.shardMesh.count; }
  get clusterCount(): number { return this.clusters.size; }
  get flashCount(): number { return this.flashes.length; }
  getPlayerEffects(id: string): PlayerEffects | undefined { return this.players.get(id); }

  clear(): void {
    for (const effect of this.players.values()) effect.group.removeFromParent();
    this.players.clear();
    for (const marker of this.clusters.values()) {
      marker.group.removeFromParent(); marker.texture.dispose();
      (marker.label.geometry as PlaneGeometry).dispose();
      (marker.label.material as MeshBasicMaterial).dispose();
    }
    this.clusters.clear();
    for (const flash of this.flashes) {
      flash.mesh.removeFromParent();
      if (flash.mesh.material !== this.impactMaterial)
        (flash.mesh.material as MeshBasicMaterial).dispose();
    }
    this.flashes.length = 0;
    this.shardMesh.count = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.shardMesh.removeFromParent();
    this.shardMesh.dispose();
    for (const resource of this.owned) resource.dispose();
  }
}
