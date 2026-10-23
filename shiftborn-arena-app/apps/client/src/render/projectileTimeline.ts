import { BALANCE, DERIVED, EventId, Form, WeaponId,
  type EncodedEvent } from '@shiftborn/shared';
import { formStats } from '@shiftborn/sim';
import type { PredictedShotStart } from '../predict/Predictor.js';
import type { WorldDelivery } from './worldEventTimeline.js';

export interface ProjectileVisual {
  readonly visualId: number;
  readonly weapon: WeaponId;
  readonly own: boolean;
  readonly ownerId: string | null;
  readonly inputSeq: number | null;
  readonly shotIdx: number | null;
  readonly serverId: string | number | null;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly opacity: number;
}

export interface ProjectileTerminalCue {
  readonly kind: 'hit' | 'impact' | 'expire' | 'blocked';
  readonly x: number;
  readonly y: number;
  readonly own: boolean;
}

interface MutableVisual {
  visualId: number;
  weapon: WeaponId;
  own: boolean;
  ownerId: string | null;
  inputSeq: number | null;
  shotIdx: number | null;
  serverId: string | number | null;
  originX: number;
  originY: number;
  x: number;
  y: number;
  angle: number;
  bornAtMs: number | null;
  spawnTick: number | null;
  fadingAtMs: number | null;
  opacity: number;
}

const CONFIRM_MS = 500; // NETWORK_PROTOCOL §8.2.
const FADE_MS = 100; // Decorative only; the 500 ms confirmation rule is separate.
export const MAX_PROJECTILE_VISUALS = BALANCE.match.seats *
  BALANCE.weapons.scatterCannon.pelletOffsetsDeg.length *
  BALANCE.net.inputRedundancy;
const MAX_TOMBSTONES = MAX_PROJECTILE_VISUALS * BALANCE.net.inputRedundancy;

function serverKey(id: string | number): string { return `${typeof id}:${id}`; }
function shotKey(seq: number, index: number): string { return `${seq}:${index}`; }
function muzzleRadius(form: Form): number {
  return formStats(form).radiusM + BALANCE.weapons.muzzleExtraM;
}
function numbers(weapon: WeaponId): { readonly speedMps: number;
  readonly rangeM: number } {
  switch (weapon) {
    // T-058 (Codex) replaces these interim straight-line visuals for tier 2 and the dagger.
    case WeaponId.RicochetDisc: return { speedMps: BALANCE.weapons.ricochetDisc.projSpeedMps,
      rangeM: BALANCE.weapons.ricochetDisc.rangeM };
    case WeaponId.SlugCannon: return { speedMps: BALANCE.weapons.slugCannon.projSpeedMps,
      rangeM: BALANCE.weapons.slugCannon.rangeM };
    case WeaponId.ArcMortar: return { speedMps: BALANCE.weapons.arcMortar.maxRangeM /
      BALANCE.weapons.arcMortar.flightS, rangeM: BALANCE.weapons.arcMortar.maxRangeM };
    case WeaponId.Dagger: return { speedMps: 0, rangeM: 0 };
    case WeaponId.PulsePistol: return { speedMps: BALANCE.weapons.pulsePistol.projSpeedMps,
      rangeM: BALANCE.weapons.pulsePistol.rangeM };
    case WeaponId.ScatterCannon: return { speedMps: BALANCE.weapons.scatterCannon.projSpeedMps,
      rangeM: BALANCE.weapons.scatterCannon.rangeM };
    case WeaponId.RailRepeater: return { speedMps: BALANCE.weapons.railRepeater.projSpeedMps,
      rangeM: BALANCE.weapons.railRepeater.rangeM };
  }
}
function terminal(event: EncodedEvent): event is Extract<EncodedEvent,
  readonly [typeof EventId.ProjectileHit | typeof EventId.ProjectileImpact |
    typeof EventId.ProjectileExpire | typeof EventId.Blocked, ...unknown[]]> {
  return event[0] === EventId.ProjectileHit ||
    event[0] === EventId.ProjectileImpact ||
    event[0] === EventId.ProjectileExpire || event[0] === EventId.Blocked;
}

/** D-034/D-061: projectile state is event-only and never changes simulation. */
export class ProjectileTimeline {
  private readonly visuals = new Map<number, MutableVisual>();
  private readonly predicted = new Map<string, number>();
  private readonly byServerId = new Map<string, number>();
  private readonly tombstones = new Set<string>();
  private readonly seenPredicted = new Set<string>();
  private readonly timedOutPredicted = new Set<string>();
  private readonly terminalPositions = new Map<string, { x: number; y: number;
    own: boolean }>();
  private matchId = '';
  private localId = '';
  private nextVisualId = 1;
  private disposed = false;

  get count(): number { return this.visuals.size; }
  get predictedCount(): number { return this.predicted.size; }
  get linkedCount(): number { return this.byServerId.size; }
  get tombstoneCount(): number { return this.tombstones.size; }
  get context(): { readonly matchId: string; readonly localId: string } {
    return { matchId: this.matchId, localId: this.localId };
  }
  entries(): IterableIterator<ProjectileVisual> { return this.visuals.values(); }
  get(visualId: number): ProjectileVisual | null {
    return this.visuals.get(visualId) ?? null;
  }
  getByServerId(serverId: string | number): ProjectileVisual | null {
    const visualId = this.byServerId.get(serverKey(serverId));
    return visualId === undefined ? null : this.get(visualId);
  }

  setContext(matchId: string, localId: string): void {
    if (this.disposed || (this.matchId === matchId && this.localId === localId)) return;
    this.clear(); this.matchId = matchId; this.localId = localId;
  }

  startPredicted(shots: readonly PredictedShotStart[], atMs: number): number[] {
    if (this.disposed || this.matchId === '' || this.localId === '' ||
      !Number.isFinite(atMs)) return [];
    const ids: number[] = [];
    for (const shot of shots) {
      const key = shotKey(shot.inputSeq, shot.shotIdx);
      if (this.seenPredicted.has(key)) continue;
      this.remember(this.seenPredicted, key);
      const weapon = shot.weapon;
      const offset = muzzleRadius(shot.form);
      const visual = this.add({ weapon, own: true, ownerId: this.localId,
        inputSeq: shot.inputSeq, shotIdx: shot.shotIdx, serverId: null,
        originX: shot.x + Math.cos(shot.angle) * offset,
        originY: shot.y + Math.sin(shot.angle) * offset,
        angle: shot.angle, bornAtMs: atMs, spawnTick: null });
      if (visual !== null) {
        this.predicted.set(key, visual.visualId);
        ids.push(visual.visualId);
      }
    }
    return ids;
  }

  /** Called at receipt. A match keeps its existing visual and trajectory. */
  onReceipt(delivery: WorldDelivery, atMs: number): number | null {
    if (this.disposed || !Number.isFinite(atMs)) return null;
    const event = delivery.event;
    if (event[0] === EventId.ProjectileSpawn &&
      delivery.projectileOwnerId === this.localId) {
      const idKey = serverKey(event[1]);
      if (this.tombstones.has(idKey)) return null;
      const already = this.byServerId.get(idKey);
      if (already !== undefined) return already;
      const key = shotKey(event[9], event[10]);
      if (this.timedOutPredicted.has(key)) {
        const expiredId = this.predicted.get(key);
        if (expiredId !== undefined) this.remove(expiredId, false);
        this.rememberTerminal(idKey);
        return null;
      }
      const predictedId = this.predicted.get(key);
      const visual = predictedId === undefined ? undefined : this.visuals.get(predictedId);
      if (visual === undefined || visual.ownerId !== this.localId ||
        visual.weapon !== event[3]) return null;
      if (visual.bornAtMs !== null && atMs - visual.bornAtMs >= CONFIRM_MS) {
        this.remember(this.timedOutPredicted, key);
        this.remove(visual.visualId, false);
        this.rememberTerminal(idKey);
        return null;
      }
      visual.serverId = event[1];
      visual.fadingAtMs = null;
      visual.opacity = 1;
      this.predicted.delete(key);
      this.byServerId.set(idKey, visual.visualId);
      return visual.visualId;
    }
    // Local confirmed shots may end before the delayed world event is rendered.
    if (terminal(event)) {
      const idKey = serverKey(event[1]);
      const id = this.byServerId.get(idKey);
      const visual = id === undefined ? undefined : this.visuals.get(id);
      if (id !== undefined && visual?.own) {
        this.terminalPositions.set(idKey, { x: visual.x, y: visual.y,
          own: true });
        while (this.terminalPositions.size > MAX_TOMBSTONES) {
          const oldest = this.terminalPositions.keys().next().value as string | undefined;
          if (oldest === undefined) break;
          this.terminalPositions.delete(oldest);
        }
        this.remove(id, true);
      }
    }
    return null;
  }

  /** Called only when T-036's delayed world timeline reaches the event tick. */
  onWorld(delivery: WorldDelivery): ProjectileTerminalCue | null {
    if (this.disposed) return null;
    const event = delivery.event;
    if (event[0] === EventId.ProjectileSpawn) {
      const idKey = serverKey(event[1]);
      if (this.tombstones.has(idKey) || this.byServerId.has(idKey)) return null;
      const own = delivery.projectileOwnerId === this.localId;
      if (own && this.timedOutPredicted.has(shotKey(event[9], event[10]))) {
        this.rememberTerminal(idKey);
        return null;
      }
      const visual = this.add({ weapon: event[3], own,
        ownerId: delivery.projectileOwnerId, inputSeq: event[9],
        shotIdx: event[10], serverId: event[1],
        // GR-7.5: producer sends the original muzzle point. advancedTicks
        // already affected only the server simulation; never add them here.
        originX: event[4], originY: event[5], angle: event[6],
        bornAtMs: null, spawnTick: event[7] });
      if (visual !== null) this.byServerId.set(idKey, visual.visualId);
    } else if (terminal(event)) {
      const idKey = serverKey(event[1]);
      const id = this.byServerId.get(idKey);
      const visual = id === undefined ? null : this.get(id);
      const previous = this.terminalPositions.get(idKey);
      const cue = visual === null && previous === undefined ? null : {
        kind: event[0] === EventId.ProjectileHit ? 'hit' as const
          : event[0] === EventId.ProjectileImpact ? 'impact' as const
            : event[0] === EventId.Blocked ? 'blocked' as const
              : 'expire' as const,
        x: event[0] === EventId.ProjectileHit ? event[5]
          : event[0] === EventId.ProjectileImpact ? event[2]
            : visual?.x ?? previous?.x ?? 0,
        y: event[0] === EventId.ProjectileHit ? event[6]
          : event[0] === EventId.ProjectileImpact ? event[3]
            : visual?.y ?? previous?.y ?? 0,
        own: visual?.own ?? previous?.own ?? false,
      };
      if (id !== undefined) this.remove(id, true);
      else this.rememberTerminal(idKey);
      this.terminalPositions.delete(idKey);
      return cue;
    }
    return null;
  }

  advance(atMs: number, renderTick: number): void {
    if (this.disposed) return;
    for (const visual of this.visuals.values()) {
      const config = numbers(visual.weapon);
      if (visual.bornAtMs !== null) {
        if (visual.serverId === null && atMs - visual.bornAtMs >= CONFIRM_MS &&
          visual.fadingAtMs === null) {
          visual.fadingAtMs = visual.bornAtMs + CONFIRM_MS;
          if (visual.inputSeq !== null && visual.shotIdx !== null)
            this.remember(this.timedOutPredicted,
              shotKey(visual.inputSeq, visual.shotIdx));
        }
        if (visual.fadingAtMs !== null) {
          visual.opacity = Math.max(0, 1 - (atMs - visual.fadingAtMs) / FADE_MS);
          if (visual.opacity <= 0) {
            this.remove(visual.visualId, false);
            continue;
          }
        }
      }
      const ageS = visual.bornAtMs !== null
        ? Math.max(0, atMs - visual.bornAtMs) / 1000
        : Math.max(0, renderTick - (visual.spawnTick ?? renderTick)) *
          DERIVED.tick.secondsPerTick;
      const distance = Math.min(config.rangeM, ageS * config.speedMps);
      visual.x = visual.originX + Math.cos(visual.angle) * distance;
      visual.y = visual.originY + Math.sin(visual.angle) * distance;
    }
  }

  clear(): void {
    this.visuals.clear(); this.predicted.clear(); this.byServerId.clear();
    this.tombstones.clear(); this.seenPredicted.clear();
    this.timedOutPredicted.clear(); this.terminalPositions.clear();
    this.nextVisualId = 1;
  }
  dispose(): void {
    this.clear(); this.matchId = ''; this.localId = ''; this.disposed = true;
  }

  private add(initial: Omit<MutableVisual, 'visualId' | 'x' | 'y' |
    'fadingAtMs' | 'opacity'>): MutableVisual | null {
    while (this.visuals.size >= MAX_PROJECTILE_VISUALS) {
      const oldest = this.visuals.keys().next().value as number | undefined;
      if (oldest === undefined) return null;
      this.remove(oldest, true);
    }
    const visual: MutableVisual = { ...initial, visualId: this.nextVisualId++,
      x: initial.originX, y: initial.originY, fadingAtMs: null, opacity: 1 };
    this.visuals.set(visual.visualId, visual);
    return visual;
  }
  private remove(id: number, terminalEvent: boolean): void {
    const visual = this.visuals.get(id);
    if (visual === undefined) return;
    this.visuals.delete(id);
    if (visual.inputSeq !== null && visual.shotIdx !== null)
      this.predicted.delete(shotKey(visual.inputSeq, visual.shotIdx));
    if (visual.serverId !== null) {
      const key = serverKey(visual.serverId);
      this.byServerId.delete(key);
      if (terminalEvent) this.rememberTerminal(key);
    }
  }
  private rememberTerminal(key: string): void {
    this.remember(this.tombstones, key);
  }
  private remember(collection: Set<string>, key: string): void {
    collection.add(key);
    while (collection.size > MAX_TOMBSTONES) {
      const first = collection.values().next().value as string | undefined;
      if (first === undefined) break;
      collection.delete(first);
    }
  }
}
