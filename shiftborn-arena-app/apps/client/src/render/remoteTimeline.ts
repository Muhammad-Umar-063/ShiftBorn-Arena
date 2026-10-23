import { BALANCE } from '@shiftborn/shared';
import type { EntitySnapshot, PlayerVisual } from './entityState.js';

const HISTORY_TICKS = BALANCE.tick.rateHz; // NETWORK_PROTOCOL §7: one second.
const EXTRAPOLATION_TICKS = BALANCE.tick.rateHz * 0.1; // §7: 100 ms.
const TELEPORT_DISTANCE_M = 5; // §7: strictly greater than five metres.

export interface RemoteSample {
  readonly tick: number;
  readonly receivedAtMs: number;
  readonly player: PlayerVisual;
}
interface WorldFrame {
  readonly tick: number;
  readonly receivedAtMs: number;
  readonly snapshot: EntitySnapshot;
}

function validTick(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
function validPlayer(player: PlayerVisual): boolean {
  return typeof player.id === 'string' && player.id.length > 0 &&
    Number.isInteger(player.seat) && player.seat >= 0 &&
    player.seat < BALANCE.match.seats && typeof player.alive === 'boolean' &&
    Number.isFinite(player.x) && Number.isFinite(player.y) &&
    Number.isFinite(player.vx) && Number.isFinite(player.vy) &&
    Number.isFinite(player.aim) && Number.isInteger(player.form) &&
    player.form >= 0 && player.form <= 2 &&
    Number.isInteger(player.morphTarget) && player.morphTarget >= -1 &&
    player.morphTarget <= 2 && validTick(player.morphEndTick) &&
    Number.isInteger(player.abilityId) && player.abilityId >= -1 &&
    player.abilityId <= 2 && validTick(player.abilityPhase) &&
    validTick(player.abilityStartTick) && validTick(player.abilityEndTick) &&
    validTick(player.stunEndTick) && validTick(player.knockbackEndTick) &&
    validTick(player.protectedEndTick);
}
function insert<T extends { readonly tick: number }>(history: T[], entry: T): void {
  const index = history.findIndex((sample) => sample.tick >= entry.tick);
  if (index < 0) history.push(entry);
  else if (history[index]?.tick === entry.tick) history[index] = entry;
  else history.splice(index, 0, entry);
}
function latestAt<T extends { readonly tick: number }>(history: readonly T[],
  renderTick: number): T | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry !== undefined && entry.tick <= renderTick) return entry;
  }
  return null;
}

/** Detached, tick-keyed remote and world history. No Schema object is retained. */
export class RemoteTimeline {
  private readonly players = new Map<string, RemoteSample[]>();
  private readonly world: WorldFrame[] = [];
  private latest: EntitySnapshot | null = null;

  get newestTick(): number | null { return this.latest?.tick ?? null; }
  get historySize(): number { return this.world.length; }
  get bufferDepthTicks(): number | null {
    const oldest = this.world[0];
    const newest = this.world.at(-1);
    return oldest === undefined || newest === undefined ? null : newest.tick - oldest.tick;
  }
  samples(id: string): readonly RemoteSample[] { return this.players.get(id) ?? []; }

  ingest(snapshot: EntitySnapshot, receivedAtMs: number): boolean {
    if (!validTick(snapshot.tick) || !Number.isFinite(receivedAtMs) ||
      receivedAtMs < 0 || typeof snapshot.matchId !== 'string' ||
      snapshot.matchId.length === 0) return false;
    if (this.latest !== null && this.latest.matchId !== snapshot.matchId)
      this.clear();
    const newest = this.latest?.tick ?? snapshot.tick;
    if (snapshot.tick < newest - HISTORY_TICKS) return false;
    const players = snapshot.players.filter(validPlayer).map((player) => ({ ...player }));
    const detached: EntitySnapshot = { ...snapshot, players,
      shards: snapshot.shards.map((shard) => ({ ...shard })),
      clusters: snapshot.clusters.map((cluster) => ({ ...cluster })),
      cover: snapshot.cover.map((cover) => ({ ...cover })) };
    insert(this.world, { tick: snapshot.tick, receivedAtMs, snapshot: detached });
    if (this.latest === null || snapshot.tick >= this.latest.tick) this.latest = detached;
    for (const player of players) {
      if (player.id === snapshot.localPlayerId) continue;
      let history = this.players.get(player.id);
      if (history === undefined) {
        history = [];
        this.players.set(player.id, history);
      }
      insert(history, { tick: snapshot.tick, receivedAtMs, player });
    }
    const cutoff = (this.latest?.tick ?? snapshot.tick) - HISTORY_TICKS;
    while (this.world[0] !== undefined && this.world[0].tick < cutoff)
      this.world.shift();
    for (const [id, history] of this.players) {
      while (history[0] !== undefined && history[0].tick < cutoff)
        history.shift();
      if (history.length === 0) this.players.delete(id);
    }
    return true;
  }

  /** Missing samples stay hidden until their first authoritative timeline tick. */
  sample(renderTick: number): EntitySnapshot | null {
    const latest = this.latest;
    if (latest === null) return null;
    const target = Number.isFinite(renderTick) ? renderTick : latest.tick;
    const frame = latestAt(this.world, target);
    const local = latest.players.find((player) => player.id === latest.localPlayerId);
    const players: PlayerVisual[] = local === undefined ? [] : [{ ...local }];
    if (frame !== null) for (const remote of frame.snapshot.players) {
      if (remote.id === latest.localPlayerId) continue;
      const sampled = this.samplePlayer(remote.id, target);
      if (sampled !== null) players.push(sampled);
    }
    return { tick: target, matchId: latest.matchId,
      localPlayerId: latest.localPlayerId, players,
      shards: frame?.snapshot.shards ?? [], clusters: frame?.snapshot.clusters ?? [],
      cover: frame?.snapshot.cover ?? [], zoneFrenzy: frame?.snapshot.zoneFrenzy ?? false,
      zonePoint: frame?.snapshot.zonePoint ?? null };
  }

  samplePlayer(id: string, renderTick: number): PlayerVisual | null {
    const history = this.players.get(id);
    if (history === undefined || history.length === 0 || !Number.isFinite(renderTick))
      return null;
    const before = latestAt(history, renderTick);
    if (before === null) return null;
    const after = history.find((sample) => sample.tick > renderTick);
    if (after !== undefined) {
      const distance = Math.hypot(after.player.x - before.player.x,
        after.player.y - before.player.y);
      if (distance > TELEPORT_DISTANCE_M ||
        (!before.player.alive && after.player.alive)) return { ...before.player };
      const fraction = (renderTick - before.tick) / (after.tick - before.tick);
      const turn = Math.atan2(Math.sin(after.player.aim - before.player.aim),
        Math.cos(after.player.aim - before.player.aim));
      return { ...before.player,
        x: before.player.x + (after.player.x - before.player.x) * fraction,
        y: before.player.y + (after.player.y - before.player.y) * fraction,
        aim: before.player.aim + turn * fraction };
    }
    const seconds = Math.min(Math.max(0, renderTick - before.tick),
      EXTRAPOLATION_TICKS) / BALANCE.tick.rateHz;
    return { ...before.player,
      x: before.player.x + (before.player.alive ? before.player.vx * seconds : 0),
      y: before.player.y + (before.player.alive ? before.player.vy * seconds : 0) };
  }

  seatAt(seat: number, tick: number): { readonly id: string;
    readonly tick: number } | null {
    const frame = latestAt(this.world, tick);
    const id = frame?.snapshot.players.find((player) => player.seat === seat)?.id;
    return frame === null || id === undefined ? null : { id, tick: frame.tick };
  }

  playerIdAtSeat(seat: number, tick: number): string | null {
    return this.seatAt(seat, tick)?.id ?? null;
  }

  clear(): void {
    this.players.clear(); this.world.length = 0; this.latest = null;
  }
}
