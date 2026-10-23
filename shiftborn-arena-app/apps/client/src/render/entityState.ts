import { BALANCE, GREYBOX_V1 } from '@shiftborn/shared';
import type { AuthoritativeRead, PlayerRead } from '../net/messageValidation.js';

export interface PlayerVisual extends PlayerRead {
  readonly vx: number;
  readonly vy: number;
  readonly morphTarget: number;
  readonly morphEndTick: number;
  readonly abilityId: number;
  readonly abilityPhase: number;
  readonly abilityStartTick: number;
  readonly abilityEndTick: number;
  readonly stunEndTick: number;
  readonly knockbackEndTick: number;
  readonly protectedEndTick: number;
}
export interface ShardVisual { readonly id: string; readonly x: number; readonly y: number; readonly kind: 0 | 1 }
export interface ClusterVisual { readonly pointIndex: number; readonly spawnTick: number }
export interface CoverVisual { readonly id: string; readonly intact: boolean; readonly rebuildTick: number }
export interface EntitySnapshot {
  readonly tick: number;
  readonly matchId: string;
  readonly localPlayerId: string;
  readonly players: readonly PlayerVisual[];
  readonly shards: readonly ShardVisual[];
  readonly clusters: readonly ClusterVisual[];
  readonly cover: readonly CoverVisual[];
  readonly zoneFrenzy?: boolean;
  readonly zonePoint?: number | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function tick(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }

/** Detached, validated projection of Schema JSON; no server package enters the client. */
export function readEntitySnapshot(state: AuthoritativeRead, localPlayerId: string): EntitySnapshot {
  const rawPlayers = record(state.full.players) ? state.full.players : {};
  const players = Object.values(state.players).flatMap((player): PlayerVisual[] => {
    const candidate = rawPlayers[player.id];
    if (!record(candidate)) return [];
    const vx = candidate.vx;
    const vy = candidate.vy;
    if (!finite(vx) || !finite(vy)) return [];
    const raw = candidate;
    return [{
      ...player,
      vx, vy,
      morphTarget: raw.morphTarget === 0 || raw.morphTarget === 1 || raw.morphTarget === 2 ? raw.morphTarget : -1,
      morphEndTick: tick(raw.morphEndTick),
      abilityId: raw.abilityId === 0 || raw.abilityId === 1 || raw.abilityId === 2 ? raw.abilityId : -1,
      abilityPhase: tick(raw.abilityPhase), abilityStartTick: tick(raw.abilityStartTick),
      abilityEndTick: tick(raw.abilityEndTick), stunEndTick: tick(raw.stunEndTick),
      knockbackEndTick: tick(raw.knockbackEndTick), protectedEndTick: tick(raw.protectedEndTick),
    }];
  });
  const shards: ShardVisual[] = [];
  if (record(state.full.shards)) for (const [id, value] of Object.entries(state.full.shards)) {
    if (record(value) && finite(value.x) && finite(value.y) &&
      (value.kind === 0 || value.kind === 1 || value.kind === 2))
      shards.push({ id, x: value.x, y: value.y,
        kind: value.kind === 1 || (value.kind === 2 &&
          finite(value.value) && value.value >= BALANCE.flux.largeShard) ? 1 : 0 });
  }
  const clusters: ClusterVisual[] = [];
  if (Array.isArray(state.full.clusterAnnounces)) for (const value of state.full.clusterAnnounces as unknown[]) {
    if (record(value) && Number.isInteger(value.pointIndex) &&
      typeof value.pointIndex === 'number' && value.pointIndex >= 0 &&
      value.pointIndex < GREYBOX_V1.shardPoints.length)
      clusters.push({ pointIndex: value.pointIndex, spawnTick: tick(value.spawnTick) });
  }
  const cover: CoverVisual[] = [];
  if (Array.isArray(state.full.cover)) for (const [index, definition] of GREYBOX_V1.cover.entries()) {
    const value: unknown = state.full.cover[index];
    if (record(value) && typeof value.intact === 'boolean')
      cover.push({ id: definition.id, intact: value.intact, rebuildTick: tick(value.rebuildTick) });
  }
  const zone = record(state.full.zone) ? state.full.zone : null;
  const zonePoint = zone?.active === true && typeof zone.point === 'number' &&
    Number.isInteger(zone.point) && zone.point >= 0 &&
    zone.point < GREYBOX_V1.zonePoints.length ? zone.point : null;
  return { tick: state.tick, matchId: state.matchId, localPlayerId, players,
    shards, clusters, cover, zoneFrenzy: state.full.mode === 1, zonePoint };
}
