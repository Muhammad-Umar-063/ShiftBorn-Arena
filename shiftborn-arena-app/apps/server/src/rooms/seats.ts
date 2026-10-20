import {
  AimSource,
  Controller,
  DERIVED,
  EventId,
  Mode,
  type EncodedEvent,
  type InputFrame,
} from '@shiftborn/shared';
import {
  addPlayer,
  handoffPlayerToBot,
  removePlayer,
  type PlayerIdentity,
  type PlayerRecord,
  type SimEvent,
  type World,
} from '@shiftborn/sim';
import { encodeSimEvents } from './eventBatcher.js';

export function findLowestEmptySeat(
  players: readonly (PlayerRecord | null)[],
): number | null {
  const seat = players.findIndex((player) => player === null);
  return seat < 0 ? null : seat;
}

/** D-038: successful internal damage marks both seats at the event's tick. */
export class CombatActivity {
  private readonly lastCombatTickBySeat: (number | undefined)[];

  constructor(seats: number) {
    this.lastCombatTickBySeat = Array.from({ length: seats });
  }

  observe(events: readonly SimEvent[], tick: number): void {
    for (const event of events) {
      if (event.type !== 'damage') continue;
      this.lastCombatTickBySeat[event.attackerSeat] = tick;
      this.lastCombatTickBySeat[event.victimSeat] = tick;
    }
  }

  snapshot(): readonly (number | undefined)[] {
    return [...this.lastCombatTickBySeat];
  }
}

export function isOutOfCombat(
  lastCombatTick: number | undefined,
  currentTick: number,
): boolean {
  return (
    lastCombatTick === undefined ||
    currentTick - lastCombatTick >= DERIVED.backfill.outOfCombatTicks
  );
}

export function replacementScore(player: PlayerRecord, mode: Mode): number {
  return mode === Mode.Frenzy ? player.stats.kos : player.stats.points;
}

/** NETWORK_PROTOCOL §3.5: idle first, then score ascending, then seat descending. */
export function selectReplaceableBot(
  world: Pick<World, 'players' | 'mode'>,
  lastCombatTickBySeat: readonly (number | undefined)[],
  currentTick: number,
): PlayerRecord | null {
  let best: PlayerRecord | null = null;
  let bestIdle = false;
  let bestScore = Infinity;
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (
      player === null ||
      player === undefined ||
      player.isBot !== true ||
      player.controller !== Controller.Bot ||
      player.seat !== seat ||
      typeof player.id !== 'string' ||
      player.id.length === 0 ||
      !player.stats
    )
      continue;
    const score = replacementScore(player, world.mode);
    if (!Number.isFinite(score)) continue;
    const idle = isOutOfCombat(lastCombatTickBySeat[seat], currentTick);
    if (
      best === null ||
      (idle && !bestIdle) ||
      (idle === bestIdle &&
        (score < bestScore || (score === bestScore && seat > best.seat)))
    ) {
      best = player;
      bestIdle = idle;
      bestScore = score;
    }
  }
  return best;
}

export function botIdentity(serial: number, seat: number): PlayerIdentity {
  return { id: `bot-${serial}`, name: `Bot ${serial}`, isBot: true, seat };
}

/** Initial identities are prepared before one canonical seeded startMatch. */
export function createInitialBotIdentities(
  players: readonly (PlayerRecord | null)[],
  firstSerial: number,
): { readonly bots: PlayerIdentity[]; readonly nextSerial: number } {
  const bots: PlayerIdentity[] = [];
  let serial = firstSerial;
  for (let seat = 0; seat < players.length; seat += 1) {
    if (players[seat] !== null) continue;
    bots.push(botIdentity(serial, seat));
    serial += 1;
  }
  return { bots, nextSerial: serial };
}

export function neutralBotFrame(player: PlayerRecord, seq: number): InputFrame {
  return {
    seq,
    moveX: 0,
    moveY: 0,
    aim: player.aim,
    buttons: 0,
    aimSource: AimSource.Bot,
  };
}

export type HumanSeatChoice =
  | { readonly kind: 'empty'; readonly seat: number }
  | { readonly kind: 'replace'; readonly seat: number; readonly botId: string };

export function chooseHumanSeat(
  world: World,
  lastCombatTickBySeat: readonly (number | undefined)[],
): HumanSeatChoice | null {
  const empty = findLowestEmptySeat(world.players);
  if (empty !== null) return { kind: 'empty', seat: empty };
  const bot = selectReplaceableBot(world, lastCombatTickBySeat, world.tick);
  return bot === null
    ? null
    : { kind: 'replace', seat: bot.seat, botId: bot.id };
}

/** D-038: one same-tick transition, with botReplaced before terminal events. */
export function assignHumanSeat(
  world: World,
  choice: HumanSeatChoice,
  human: Pick<PlayerIdentity, 'id' | 'name'>,
  waitForNextMatch = false,
): EncodedEvent[] {
  const before = world.events.length;
  if (choice.kind === 'replace') {
    const occupant = world.players[choice.seat];
    if (occupant?.id !== choice.botId || !occupant.isBot)
      throw new Error('selected bot changed before replacement');
    removePlayer(world, choice.botId);
  }
  addPlayer(
    world,
    { ...human, isBot: false, seat: choice.seat },
    {
      waitForNextMatch,
    },
  );
  const events = encodeSimEvents(world.events.slice(before));
  return choice.kind === 'replace'
    ? [[EventId.BotReplaced, choice.seat, human.id], ...events]
    : events;
}

/** Final departure leaves an empty seat or transfers the current life. */
export function releaseHumanSeat(
  world: World,
  humanId: string,
  bot: Pick<PlayerIdentity, 'id' | 'name'> | null,
): EncodedEvent[] {
  const before = world.events.length;
  if (bot === null) removePlayer(world, humanId);
  else handoffPlayerToBot(world, humanId, bot);
  return encodeSimEvents(world.events.slice(before));
}
