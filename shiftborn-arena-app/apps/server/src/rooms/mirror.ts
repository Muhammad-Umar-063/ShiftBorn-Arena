import {
  AbilityId,
  AimSource,
  Controller,
  Form,
  Mode,
  Phase,
} from '@shiftborn/shared';
import type { PlayerRecord, World } from '@shiftborn/sim';
import {
  ClusterAnnounce,
  CoverState,
  PlayerState,
  ShardState,
  type ArenaStateRecord,
  type PlayerStateRecord,
} from './schema.js';

// NETWORK_PROTOCOL §4.2: named conversions keep the wire codes explicit.
export function phaseCode(value: Phase): number {
  switch (value) {
    case Phase.Countdown:
      return 0;
    case Phase.Playing:
      return 1;
    case Phase.Results:
      return 2;
  }
}

export function modeCode(value: Mode): number {
  return value === Mode.Frenzy ? 0 : 1;
}

export function controllerCode(value: Controller): number {
  switch (value) {
    case Controller.Human:
      return 0;
    case Controller.Bot:
      return 1;
    case Controller.Proxy:
      return 2;
  }
}

export function formCode(value: Form): number {
  switch (value) {
    case Form.Runner:
      return 0;
    case Form.Beast:
      return 1;
    case Form.Turret:
      return 2;
  }
}

export function abilityCode(value: AbilityId | null): number {
  switch (value) {
    case null:
      return -1;
    case AbilityId.Dash:
      return 0;
    case AbilityId.RamCharge:
      return 1;
    case AbilityId.RailShot:
      return 2;
  }
}

export function abilityPhaseCode(value: 'none' | 'windup' | 'active'): number {
  switch (value) {
    case 'none':
      return 0;
    case 'windup':
      return 1;
    case 'active':
      return 2;
  }
}

export function zoneStateCode(value: 'empty' | 'held' | 'contested'): number {
  switch (value) {
    case 'empty':
      return 0;
    case 'held':
      return 1;
    case 'contested':
      return 2;
  }
}

export function aimSourceCode(value: AimSource): number | null {
  switch (value) {
    case AimSource.Mouse:
      return 0;
    case AimSource.Keys:
      return 1;
    case AimSource.Lock:
      return 2;
    case AimSource.Touch:
      return 3;
    case AimSource.Pad:
      return 4;
    // Bot is server-only and has no documented uint8 wire code yet.
    case AimSource.Bot:
      return null;
  }
}

export interface MirrorContext {
  readonly connectedIds?: ReadonlySet<string>;
  readonly hostId?: string;
  readonly settings?: {
    readonly botFill?: boolean;
    readonly nextMode?: Mode;
  };
}

function assign<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
): number {
  if (Object.is(target[key], value)) return 0;
  target[key] = value;
  return 1;
}

function mirrorPlayer(
  player: PlayerRecord,
  target: PlayerStateRecord,
  connected: boolean,
): number {
  let changed = 0;
  changed += assign(target, 'id', player.id);
  changed += assign(target, 'name', player.name);
  changed += assign(target, 'seat', player.seat);
  changed += assign(target, 'isBot', player.isBot);
  changed += assign(target, 'controller', controllerCode(player.controller));
  changed += assign(target, 'connected', connected);
  changed += assign(target, 'alive', player.alive);
  changed += assign(target, 'x', player.pos.x);
  changed += assign(target, 'y', player.pos.y);
  changed += assign(target, 'vx', player.vel.x);
  changed += assign(target, 'vy', player.vel.y);
  changed += assign(target, 'aim', player.aim);
  changed += assign(target, 'form', formCode(player.form));
  changed += assign(
    target,
    'morphTarget',
    player.morph === null ? -1 : formCode(player.morph.target),
  );
  changed += assign(target, 'morphEndTick', player.morph?.endTick ?? 0);
  changed += assign(target, 'morphReadyTick', player.morphReadyTick);
  changed += assign(target, 'hpFrac', player.hpFrac);
  changed += assign(target, 'flux', player.flux);
  changed += assign(
    target,
    'abilityId',
    abilityCode(player.ability?.id ?? null),
  );
  changed += assign(
    target,
    'abilityPhase',
    abilityPhaseCode(player.ability === null ? 'none' : 'active'),
  );
  changed += assign(target, 'abilityStartTick', player.ability?.startTick ?? 0);
  changed += assign(target, 'abilityEndTick', player.ability?.endTick ?? 0);
  changed += assign(target, 'abilityDirX', player.ability?.dirX ?? 0);
  changed += assign(target, 'abilityDirY', player.ability?.dirY ?? 0);
  changed += assign(
    target,
    'abilityReadyRunner',
    player.abilityReadyTick[Form.Runner],
  );
  changed += assign(
    target,
    'abilityReadyBeast',
    player.abilityReadyTick[Form.Beast],
  );
  changed += assign(
    target,
    'abilityReadyTurret',
    player.abilityReadyTick[Form.Turret],
  );
  changed += assign(target, 'heat', player.heat);
  changed += assign(target, 'overheatEndTick', player.overheatEndTick);
  changed += assign(target, 'stunEndTick', player.stunEndTick);
  changed += assign(target, 'knockbackEndTick', player.knockback?.endTick ?? 0);
  changed += assign(target, 'kbvx', player.knockback?.vel.x ?? 0);
  changed += assign(target, 'kbvy', player.knockback?.vel.y ?? 0);
  changed += assign(target, 'protectedEndTick', player.protectedEndTick);
  changed += assign(target, 'respawnTick', player.respawnTick);
  changed += assign(target, 'kos', player.stats.kos);
  changed += assign(target, 'deaths', player.stats.deaths);
  changed += assign(target, 'assists', player.stats.assists);
  changed += assign(target, 'points', player.stats.points);
  changed += assign(
    target,
    'damageDealt',
    player.stats.damageDealtByForm[Form.Runner] +
      player.stats.damageDealtByForm[Form.Beast] +
      player.stats.damageDealtByForm[Form.Turret],
  );
  changed += assign(target, 'lastInputSeq', Math.max(0, player.lastInputSeq));
  const source = aimSourceCode(player.aimSource);
  if (source !== null) changed += assign(target, 'aimSource', source);
  return changed;
}

/** One-way projection. The count includes collection changes and changed fields. */
export function mirrorWorld(
  world: World,
  state: ArenaStateRecord,
  context: MirrorContext = {},
): number {
  let changed = 0;
  changed += assign(state, 'tick', world.tick);
  changed += assign(state, 'phase', phaseCode(world.phase));
  changed += assign(state, 'phaseEndTick', world.phaseEndTick);
  changed += assign(state, 'mode', modeCode(world.mode));
  changed += assign(state, 'matchId', world.matchId);
  changed += assign(state, 'matchIndex', world.matchIndex);
  changed += assign(state, 'hostId', context.hostId ?? '');
  changed += assign(
    state.settings,
    'botFill',
    context.settings?.botFill ?? false,
  );
  changed += assign(
    state.settings,
    'nextMode',
    modeCode(context.settings?.nextMode ?? Mode.Frenzy),
  );

  const activePlayers = new Set<string>();
  for (const player of world.players) {
    if (player === null) continue;
    activePlayers.add(player.id);
    let target = state.players.get(player.id);
    if (target === undefined) {
      target = new PlayerState();
      state.players.set(player.id, target);
      changed += 1;
    }
    changed += mirrorPlayer(
      player,
      target,
      context.connectedIds?.has(player.id) ?? false,
    );
  }
  for (const id of state.players.keys()) {
    if (!activePlayers.has(id)) {
      state.players.delete(id);
      changed += 1;
    }
  }

  const activeShards = new Set<string>();
  for (const shard of world.shards) {
    const id = String(shard.id);
    activeShards.add(id);
    let target = state.shards.get(id);
    if (target === undefined) {
      target = new ShardState();
      state.shards.set(id, target);
      changed += 1;
    }
    changed += assign(target, 'x', shard.x);
    changed += assign(target, 'y', shard.y);
    changed += assign(target, 'value', shard.value);
    changed += assign(target, 'kind', shard.kind);
    changed += assign(target, 'expiresTick', shard.expiresTick);
  }
  for (const id of state.shards.keys()) {
    if (!activeShards.has(id)) {
      state.shards.delete(id);
      changed += 1;
    }
  }

  for (let index = 0; index < world.cover.length; index += 1) {
    const cover = world.cover[index];
    if (cover === undefined) continue;
    let target = state.cover[index];
    if (target === undefined) {
      target = new CoverState();
      state.cover.push(target);
      changed += 1;
    }
    changed += assign(target, 'intact', cover.intact);
  }
  if (state.cover.length > world.cover.length) {
    state.cover.splice(world.cover.length);
    changed += 1;
  }

  const announcements = world.clusters
    .filter((cluster) => cluster.state === 'announced')
    .sort((left, right) => left.id - right.id);
  for (let index = 0; index < announcements.length; index += 1) {
    const announcement = announcements[index];
    if (announcement === undefined) continue;
    let target = state.clusterAnnounces[index];
    if (target === undefined) {
      target = new ClusterAnnounce();
      state.clusterAnnounces.push(target);
      changed += 1;
    }
    changed += assign(target, 'pointIndex', announcement.pointIndex);
    changed += assign(target, 'spawnTick', announcement.spawnTick);
  }
  if (state.clusterAnnounces.length > announcements.length) {
    state.clusterAnnounces.splice(announcements.length);
    changed += 1;
  }
  // Zone Frenzy and cover rebuilding are future tasks. Defaults are inactive.
  return changed;
}
