import { BALANCE, EventId, GREYBOX_V1, type MapData } from '@shiftborn/shared';
import {
  Color, Scene, Vector2, WebGLRenderer,
} from 'three';
import type { EventBatch } from '../net/messageValidation.js';
import { advanceFixedSteps } from '../input/fixedSteps.js';
import { ArenaMap } from './arenaMap.js';
import { ArenaCamera, type CameraViewInput } from './camera.js';
import type { GroundPoint } from './coordinates.js';
import { ArenaEffects, decodeVisualEvents, type PresentationEvent } from './effects.js';
import { EntityViews } from './entityViews.js';
import type { EntitySnapshot, PlayerVisual } from './entityState.js';
import { OcclusionController, type VisiblePlayer } from './occlusion.js';
import { PALETTE } from './palette.js';
import type { LocalPresentation } from '../predict/Predictor.js';
import { RemoteTimeline } from './remoteTimeline.js';
import { WorldEventTimeline, type LocalFeedback,
  type WorldDelivery } from './worldEventTimeline.js';
import { capRemoteCatchup } from './remoteCatchup.js';
import { ProjectileViews } from './projectileViews.js';
import type { PredictedShotStart } from '../predict/Predictor.js';
import { HitboxView } from '../debug/HitboxView.js';

function formCode(form: LocalPresentation['form']): number {
  return form === 'beast' ? 1 : form === 'turret' ? 2 : 0;
}
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface RenderView {
  readonly camera: CameraViewInput;
  readonly visiblePlayers: readonly VisiblePlayer[];
}

export interface RendererStatistics {
  readonly calls: number;
  readonly triangles: number;
  readonly pixelRatio: number;
  readonly width: number;
  readonly height: number;
}

/** Owns exactly one WebGL context, scene, map, frame loop and canvas. */
export class ArenaRenderer {
  readonly scene = new Scene();
  readonly camera: ArenaCamera;
  readonly map: ArenaMap;
  readonly occlusion: OcclusionController;
  readonly entities: EntityViews;
  readonly effects: ArenaEffects;
  readonly projectiles = new ProjectileViews(this.scene);
  readonly hitboxes: HitboxView;
  readonly renderer: WebGLRenderer;
  readonly remoteTimeline = new RemoteTimeline();
  readonly worldTimeline = new WorldEventTimeline(this.remoteTimeline);
  private snapshot: EntitySnapshot | null = null;
  private readonly presentedPlayers: PlayerVisual[] = [];
  private readonly renderedRemotes = new Map<string, PlayerVisual>();
  private presentedLocal: Mutable<PlayerVisual> | null = null;
  private readonly visibleScratch: Array<{ x: number; y: number }> = [];
  private clockEstimate: (() => number | null) | null = null;
  private readonly worldListeners = new Set<(event: WorldDelivery) => void>();
  private lastSampledRenderTick: number | null = null;
  private projectilesEnabled = false;
  private fixedStep: (() => void) | null = null;
  private fixedAccumulatorMs = 0;
  private earlyInputSamples = 0;
  private localPresentation: (() => LocalPresentation | null) | null = null;
  private readonly observer: ResizeObserver | null;
  private view: RenderView | null = null;
  private readonly size = new Vector2();
  private frameHandle: number | null = null;
  private lastFrameAt = 0;
  private frameObserver: ((atMs: number, frameMs: number | null) => void) | null = null;
  private disposed = false;
  private readonly onWindowResize = (): void => this.resize();
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.fail();
  };
  private readonly frame = (at: number): void => {
    if (this.disposed) return;
    try {
      const deltaS = this.lastFrameAt === 0 ? 0 : Math.max(0, (at - this.lastFrameAt) / 1000);
      this.lastFrameAt = at;
      if (this.fixedStep !== null) {
        this.fixedAccumulatorMs = advanceFixedSteps(this.fixedAccumulatorMs,
          deltaS * 1000, () => {
            if (this.earlyInputSamples > 0) this.earlyInputSamples -= 1;
            else this.fixedStep?.();
          });
      }
      const view = this.view;
      const localPose = this.localPresentation?.() ?? null;
      const snapshot = this.snapshot;
      const clockTick = this.clockEstimate?.() ?? null;
      const renderTick = snapshot === null ? null :
        clockTick !== null && Number.isFinite(clockTick)
          ? clockTick - BALANCE.net.interpDelayMs * BALANCE.tick.rateHz / 1000
          : snapshot.tick - (this.clockEstimate === null ? 0
            : BALANCE.net.interpDelayMs * BALANCE.tick.rateHz / 1000);
      this.lastSampledRenderTick = renderTick;
      const sampled = renderTick === null ? null : this.remoteTimeline.sample(renderTick);
      this.presentedPlayers.length = 0;
      if (sampled !== null) for (const player of sampled.players) {
        if (player.id === sampled.localPlayerId) {
          this.presentedPlayers.push(this.presentedLocal ?? player);
        } else {
          const displayed = capRemoteCatchup(
            this.renderedRemotes.get(player.id), player);
          this.presentedPlayers.push(displayed);
          this.renderedRemotes.set(player.id, displayed);
        }
      }
      for (const id of this.renderedRemotes.keys())
        if (!this.presentedPlayers.some((player) => player.id === id))
          this.renderedRemotes.delete(id);
      const players = this.presentedPlayers;
      if (localPose !== null && this.presentedLocal !== null) {
        const local = this.presentedLocal;
        local.x = localPose.x; local.y = localPose.y;
        local.aim = localPose.aim; local.form = formCode(localPose.form);
        local.alive = localPose.alive;
        local.morphTarget = localPose.morph === null ? -1
          : formCode(localPose.morph.target);
        local.morphEndTick = localPose.morph?.endTick ?? 0;
        local.abilityId = localPose.ability === null ? -1 : 0;
        local.abilityPhase = localPose.ability === null ? 0 : 2;
        local.abilityStartTick = localPose.ability?.startTick ?? 0;
        local.abilityEndTick = localPose.ability?.endTick ?? 0;
        local.stunEndTick = localPose.stunEndTick;
        local.knockbackEndTick = localPose.knockbackEndTick;
        local.protectedEndTick = localPose.protectedEndTick;
      }
      if (view !== null) {
        if (localPose !== null) {
          const camera = view.camera as Mutable<CameraViewInput> & {
            player: { x: number; y: number } };
          camera.player.x = localPose.x; camera.player.y = localPose.y;
          camera.aimRadians = localPose.aim; camera.form = localPose.form;
        }
        let count = 0;
        for (const player of players) {
          if (!player.alive) continue;
          const entry = this.visibleScratch[count];
          if (entry === undefined) this.visibleScratch.push({ x: player.x, y: player.y });
          else { entry.x = player.x; entry.y = player.y; }
          count += 1;
        }
        this.visibleScratch.length = count;
        this.camera.update(view.camera, deltaS);
        this.occlusion.update(this.camera.camera.position, view.camera.player,
          this.visibleScratch, view.camera.perspective === 'tpp');
      }
      if (sampled !== null && view !== null && renderTick !== null) {
        for (const cover of sampled.cover)
          this.map.setCoverIntact(cover.id, cover.intact, cover.rebuildTick);
        this.map.setZoneMarkersVisible(sampled.zoneFrenzy === true);
        for (const delivery of this.worldTimeline.due(renderTick)) {
          if (this.projectilesEnabled) this.projectiles.onWorld(delivery, at);
          const visuals = decodeVisualEvents({ tick: delivery.tick,
            events: [delivery.event] }).map((event) => ({ ...event,
              playerId: delivery.actorId }));
          this.effects.ingest(visuals, sampled.localPlayerId, players);
          for (const listener of this.worldListeners) listener(delivery);
        }
        this.entities.update(players, sampled.localPlayerId,
          view.camera.perspective,
          (player) => view.camera.perspective === 'tpp' &&
            this.occlusion.coverBlocks(this.camera.camera.position, player),
          this.camera.camera, renderTick);
        this.effects.update({ ...sampled, players }, renderTick, this.camera.camera);
        this.map.updateRubble(renderTick);
      }
      if (renderTick !== null) this.projectiles.update(at, renderTick);
      this.hitboxes.update(sampled === null ? null : { ...sampled,
        players }, this.projectiles.timeline.entries());
      this.renderer.render(this.scene, this.camera.camera);
      this.frameObserver?.(at, deltaS > 0 ? deltaS * 1000 : null);
      this.frameHandle = requestAnimationFrame(this.frame);
    } catch {
      this.fail();
    }
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly onFailure: () => void,
    mapData: MapData = GREYBOX_V1,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.domElement.className = 'arena-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.scene.background = new Color(PALETTE.background);
    this.camera = new ArenaCamera(1);
    try {
      this.map = new ArenaMap(this.scene, mapData);
    } catch (error) {
      this.renderer.dispose();
      throw error;
    }
    this.occlusion = new OcclusionController(this.map.occluders);
    this.entities = new EntityViews(this.scene);
    this.effects = new ArenaEffects(this.scene);
    this.hitboxes = new HitboxView(this.scene, this.map.boxes, mapData.zonePoints);
    this.camera.setObstacles(this.map.occluders);
    this.container.prepend(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.observer = typeof ResizeObserver === 'undefined' ? null
      : new ResizeObserver(() => this.resize());
    this.observer?.observe(this.container);
    window.addEventListener('resize', this.onWindowResize);
    this.resize();
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  setView(view: RenderView): void {
    this.view = {
      camera: { ...view.camera, player: { ...view.camera.player } },
      visiblePlayers: view.visiblePlayers.map((player) => ({ ...player })),
    };
  }

  setFixedStep(callback: (() => void) | null): void {
    this.fixedStep = callback;
    this.fixedAccumulatorMs = 0;
    this.earlyInputSamples = 0;
  }

  /** Sample the next 30 Hz slot early for AT-NET-06, then consume that slot in RAF. */
  sampleInputNow(): void {
    if (this.disposed || this.fixedStep === null) return;
    this.fixedStep();
    this.earlyInputSamples += 1;
  }

  setLocalPresentation(provider: (() => LocalPresentation | null) | null): void {
    this.localPresentation = provider;
  }

  /** Connection owns correction; the renderer only reads its estimated tick. */
  setClockEstimate(provider: (() => number | null) | null): void {
    this.clockEstimate = provider;
  }

  get displayedRenderTick(): number | null { return this.lastSampledRenderTick; }
  get debugCounts(): { readonly players: number; readonly shards: number;
    readonly projectiles: number; readonly bufferDepthTicks: number | null } {
    return { players: this.presentedPlayers.length,
      shards: this.snapshot?.shards.length ?? 0,
      projectiles: this.projectiles.count,
      bufferDepthTicks: this.remoteTimeline.bufferDepthTicks };
  }
  setFrameObserver(observer: ((atMs: number, frameMs: number | null) => void) | null): void {
    this.frameObserver = observer;
  }

  subscribeWorldEvent(listener: (event: WorldDelivery) => void): () => void {
    this.worldListeners.add(listener);
    return () => { this.worldListeners.delete(listener); };
  }

  setLocalAim(radians: number, cursorDistanceM: number): void {
    if (this.view === null || !Number.isFinite(radians) ||
      !Number.isFinite(cursorDistanceM)) return;
    this.view = { ...this.view, camera: { ...this.view.camera,
      aimRadians: radians, cursorDistanceM } };
  }

  setEntities(snapshot: EntitySnapshot): void {
    if (this.snapshot !== null && this.snapshot.matchId !== snapshot.matchId) {
      this.resetTimeline();
    }
    this.snapshot = snapshot;
    this.projectiles.setContext(snapshot.matchId, snapshot.localPlayerId);
    this.presentedLocal = null;
    for (const player of snapshot.players) {
      if (player.id === snapshot.localPlayerId) {
        this.presentedLocal = { ...player };
        break;
      }
    }
    this.remoteTimeline.ingest(snapshot, performance.now());
  }

  ingestEventBatch(batch: EventBatch,
    onLocalShotConfirmed?: (inputSeq: number) => void): readonly LocalFeedback[] {
    if (this.snapshot === null) return [];
    return this.worldTimeline.ingest(batch, this.snapshot.localPlayerId,
      (delivery) => {
        if (this.projectilesEnabled) {
          this.projectiles.onReceipt(delivery, performance.now());
          if (delivery.event[0] === EventId.ProjectileSpawn &&
            delivery.projectileOwnerId === this.snapshot?.localPlayerId)
            onLocalShotConfirmed?.(delivery.event[9]);
        }
      });
  }

  startPredictedShots(shots: readonly PredictedShotStart[], atMs: number): number[] {
    return this.projectilesEnabled ? this.projectiles.startPredicted(shots, atMs) : [];
  }

  setProjectilesEnabled(enabled: boolean): void {
    if (!enabled) this.projectiles.clear();
    this.projectilesEnabled = enabled;
  }

  ingestVisualEvents(events: readonly PresentationEvent[]): void {
    if (this.snapshot === null) return;
    this.effects.ingest(events, this.snapshot.localPlayerId, this.snapshot.players);
  }

  resetTimeline(): void {
    this.remoteTimeline.clear(); this.worldTimeline.clear();
    this.snapshot = null; this.presentedLocal = null;
    this.presentedPlayers.length = 0; this.visibleScratch.length = 0;
    this.renderedRemotes.clear();
    this.lastSampledRenderTick = null;
    this.entities.clear(); this.effects.clear();
    this.projectiles.clear();
    for (const box of this.map.boxes)
      if (box.kind === 'cover') this.map.setCoverIntact(box.id, true);
    this.map.setZoneMarkersVisible(false);
  }

  setCoverIntact(id: string, intact: boolean): boolean {
    return this.map.setCoverIntact(id, intact);
  }

  setZoneMarkersVisible(visible: boolean): void {
    this.map.setZoneMarkersVisible(visible);
  }

  setActiveShardPoints(ids: readonly string[]): void {
    this.map.setActiveShardPoints(ids);
  }

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.resize(width / height);
  }

  get statistics(): RendererStatistics {
    const size = this.renderer.getSize(this.size);
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      pixelRatio: this.renderer.getPixelRatio(),
      width: size.x, height: size.y,
    };
  }

  /** T-033 uses this for solid silhouettes when a cover box blocks a player. */
  coverIdsBetweenCameraAnd(player: GroundPoint): readonly string[] {
    return this.occlusion.coverIdsBetween(this.camera.camera.position, player);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.fixedStep = null;
    this.earlyInputSamples = 0;
    this.localPresentation = null;
    this.frameObserver = null;
    this.clockEstimate = null;
    this.worldListeners.clear();
    this.remoteTimeline.clear(); this.worldTimeline.clear();
    this.presentedPlayers.length = 0;
    this.renderedRemotes.clear();
    this.visibleScratch.length = 0;
    this.presentedLocal = null;
    this.observer?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.map.dispose();
    this.entities.dispose();
    this.effects.dispose();
    this.projectiles.dispose();
    this.hitboxes.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private fail(): void {
    if (this.disposed) return;
    this.dispose();
    this.onFailure();
  }
}
