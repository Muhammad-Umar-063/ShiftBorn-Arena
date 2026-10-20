import { BALANCE, DERIVED, type Controller, type InputFrame } from '@shiftborn/shared';
import { hashWorld, type SimEvent, type World } from '@shiftborn/sim';

export interface MatchRecord {
  readonly t: number;
  readonly type: 'match_start' | 'morph' | 'damage' | 'death' | 'match_end' | 'client_stats';
  readonly [field: string]: unknown;
}

export interface MatchMetadata {
  readonly roomId: string;
  readonly roomCode: string;
  readonly buildId: string;
  readonly botDifficulty: number;
  readonly inputSchemes: ReadonlyMap<string, 'mouse' | 'keys' | null>;
}

export function matchStartRecord(world: World, metadata: MatchMetadata): MatchRecord {
  return {
    t: world.tick,
    type: 'match_start',
    matchId: world.matchId,
    roomId: metadata.roomId,
    roomCode: metadata.roomCode,
    mode: world.mode,
    roomSeed: world.roomSeed,
    matchIndex: world.matchIndex,
    balanceVersion: BALANCE.version,
    mapId: world.map.id,
    buildId: metadata.buildId,
    seats: world.players.map((player) => player === null ? null : {
      id: player.id,
      name: player.name,
      isBot: player.isBot,
      controller: player.controller,
      inputScheme: player.isBot ? null : metadata.inputSchemes.get(player.id) ?? null,
    }),
    botDifficulty: metadata.botDifficulty,
  };
}

export interface PreStepTelemetry {
  readonly phase: World['phase'];
  readonly players: readonly ({ readonly id: string; readonly flux: number; readonly hpFrac: number } | null)[];
}

export function capturePreStepTelemetry(world: World): PreStepTelemetry {
  return {
    phase: world.phase,
    players: world.players.map((player) => player === null ? null : {
      id: player.id, flux: player.flux, hpFrac: player.hpFrac,
    }),
  };
}

/** GR-17: project only the Stage A event subset, preserving sim event order. */
export function projectMatchEvents(
  eventTick: number,
  events: readonly SimEvent[],
  world: World,
  before: PreStepTelemetry,
): MatchRecord[] {
  const records: MatchRecord[] = [];
  for (const event of events) {
    if (event.type === 'morphStart') {
      const player = before.players[event.seat];
      if (player === null || player === undefined) throw new Error('missing morph actor');
      records.push({
        t: eventTick, type: 'morph', playerId: player.id,
        from: event.from, to: event.to, fluxBefore: player.flux,
        hpFrac: player.hpFrac, phase: before.phase,
      });
    } else if (event.type === 'damage') {
      records.push({
        t: eventTick, type: 'damage', attackerId: event.attackerId,
        victimId: event.victimId, attackerForm: event.attackerForm,
        victimForm: event.victimForm, cause: event.cause,
        amount: event.finalDamage, tags: event.tags,
      });
    } else if (event.type === 'death') {
      const victim = world.players[event.victimSeat];
      if (victim?.id !== event.victimId) throw new Error('missing death victim');
      records.push({
        t: eventTick, type: 'death', victimId: event.victimId,
        killerId: event.killerId,
        assisters: event.assisters.map((assister) => assister.id),
        killerForm: event.killerForm, victimForm: event.victimForm,
        cause: event.cause,
        position: { x: victim.pos.x, y: victim.pos.y },
      });
    }
  }
  return records;
}

export interface ClientStatsValue {
  readonly fpsMedian: number;
  readonly fpsP5: number;
  readonly rttMs: number;
  readonly corrections: number;
  readonly inputScheme: 'mouse' | 'keys';
  readonly windowW: number;
  readonly windowH: number;
  readonly browser: string;
  readonly hiddenMs: number;
  readonly errors: number;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function count(value: unknown): value is number {
  return nonnegative(value) && Number.isSafeInteger(value);
}

/** NETWORK_PROTOCOL §5.1: client statistics are informational, never authority. */
export function decodeClientStats(value: unknown): ClientStatsValue | null {
  if (!object(value)) return null;
  const {
    fpsMedian, fpsP5, rttMs, corrections, inputScheme, windowW, windowH,
    browser, hiddenMs, errors,
  } = value;
  if (!nonnegative(fpsMedian) || !nonnegative(fpsP5) ||
    !nonnegative(rttMs) || !count(corrections) ||
    (inputScheme !== 'mouse' && inputScheme !== 'keys') ||
    !count(windowW) || !count(windowH) || typeof browser !== 'string' ||
    !nonnegative(hiddenMs) || !count(errors)) return null;
  return {
    fpsMedian, fpsP5, rttMs, corrections, inputScheme, windowW, windowH,
    browser, hiddenMs, errors,
  };
}

export function clientStatsRecord(
  tick: number, playerId: string, stats: ClientStatsValue,
): MatchRecord {
  return {
    t: tick, type: 'client_stats', playerId,
    fpsMedian: stats.fpsMedian, fpsP5: stats.fpsP5, rttMs: stats.rttMs,
    corrections: stats.corrections, inputScheme: stats.inputScheme,
    windowSize: { width: stats.windowW, height: stats.windowH },
    browser: stats.browser, hiddenMs: stats.hiddenMs, errors: stats.errors,
  };
}

export function matchEndRecord(world: World, eventTick: number): MatchRecord {
  const players = world.players.filter((player) => player !== null);
  return {
    t: eventTick, type: 'match_end', finalHash: hashWorld(world),
    durationTicks: DERIVED.match.durationTicks,
    humans: players.filter((player) => !player.isBot).length,
    bots: players.filter((player) => player.isBot).length,
    playerStats: players.map((player) => ({
      playerId: player.id,
      stats: JSON.parse(JSON.stringify(player.stats)) as unknown,
    })),
  };
}

export function appliedControllers(world: World): readonly (Controller | null)[] {
  return world.players.map((player) => player?.controller ?? null);
}

export function copyAppliedInputs(
  inputs: readonly (InputFrame | undefined)[],
  seats: number,
): readonly (InputFrame | null)[] {
  return Array.from({ length: seats }, (_, seat) => {
    const input = inputs[seat];
    return input === undefined ? null : { ...input };
  });
}
