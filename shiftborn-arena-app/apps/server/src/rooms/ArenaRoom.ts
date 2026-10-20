import { ErrorCode, Room, ServerError, type Client } from '@colyseus/core';
import {
  BALANCE,
  balanceHash,
  ClientMessageId,
  CloseCode,
  Controller,
  GREYBOX_V1,
  Mode,
  PROTOCOL_VERSION,
  ServerMessageId,
  type EncodedEvent,
  type InputFrame,
} from '@shiftborn/shared';
import { createWorld, step, type SimEvent, type World } from '@shiftborn/sim';
import pino from 'pino';
import { InputQueue } from '../net/inputQueue.js';
import {
  authenticatePlayer,
  authenticatedPlayer,
  type AuthenticatedPlayer,
} from './auth.js';
import { createEventBatch, encodeSimEvents } from './eventBatcher.js';
import { FixedStepLoop, type TickMetrics } from './fixedStep.js';
import { mirrorWorld, type MirrorContext } from './mirror.js';
import { createRoomSeed } from './roomSeed.js';
import { ArenaState, type ArenaStateRecord } from './schema.js';
import {
  assignHumanSeat,
  botIdentity,
  chooseHumanSeat,
  CombatActivity,
  createInitialBotIdentities,
  neutralBotFrame,
  releaseHumanSeat,
} from './seats.js';

interface InputBinding {
  readonly sessionId: string;
  readonly playerId: string;
  readonly seat: number;
  readonly queue: InputQueue;
}

/** D-061: authoritative room with a narrow human input source seam. */
export class ArenaRoom extends Room<{ state: ArenaStateRecord }> {
  protected world!: World;
  protected fixedLoop!: FixedStepLoop;
  protected mirrorContext: MirrorContext = {};
  private readonly inputBySession = new Map<string, InputBinding>();
  private readonly inputBySeat = new Map<number, InputBinding>();
  private readonly connectedIds = new Set<string>();
  private readonly botSequences = new Map<string, number>();
  private combatActivity = new CombatActivity(BALANCE.match.seats);
  private nextBotSerial = 1;
  private readonly warningLogger = pino({ name: 'arena-room' });
  private trustedBuildId = '';
  protected roomCode = '';
  protected botFillEnabled = true;

  static override async onAuth(
    token: string,
    options: unknown,
  ): Promise<AuthenticatedPlayer> {
    // The pinned declaration says string; unauthenticated SDK joins send none.
    return authenticatePlayer(options, typeof token === 'string' ? token : '');
  }

  onCreate(options: { readonly trustedBuildId: string }): void {
    this.trustedBuildId = options.trustedBuildId;
    // One temporary reservation lets onJoin return project code 4001 when
    // all eight seats hold humans; no ninth player is ever added to the sim.
    this.maxClients = BALANCE.match.seats + 1;
    this.patchRate = 1000 / BALANCE.tick.patchRateHz;
    const initial = this.botFillEnabled
      ? createInitialBotIdentities(
          Array.from({ length: BALANCE.match.seats }, () => null),
          this.nextBotSerial,
        )
      : { bots: [], nextSerial: this.nextBotSerial };
    this.nextBotSerial = initial.nextSerial;
    this.world = createWorld({
      map: GREYBOX_V1,
      roomSeed: createRoomSeed(),
      mode: Mode.Frenzy,
      initialPlayers: initial.bots,
    });
    // Initial spawn and shard events predate all clients. The first tick or
    // join must not broadcast them as lifecycle events.
    this.world.events.length = 0;
    this.mirrorContext = {
      connectedIds: this.connectedIds,
      settings: { botFill: this.botFillEnabled },
    };
    this.state = new ArenaState();
    this.mirrorNow();
    this.onMessage(ClientMessageId.Input, (client, payload: unknown) => {
      const queue = this.inputBySession.get(client.sessionId)?.queue;
      if (queue?.receive(payload)) client.leave(CloseCode.InvalidInput);
    });
    this.onMessage('*', (client, type) => {
      if (Object.values(ClientMessageId).some((known) => known === type))
        return;
      const queue = this.inputBySession.get(client.sessionId)?.queue;
      if (queue?.noteUnknownMessage()) client.leave(CloseCode.InvalidInput);
    });
    this.fixedLoop = new FixedStepLoop(
      () => this.runSimulationStep(),
      this.warningLogger,
    );
    this.fixedLoop.start();
  }

  onJoin(client: Client): void {
    const auth = authenticatedPlayer(client.auth);
    if (auth === null)
      throw new ServerError(
        ErrorCode.AUTH_FAILED,
        'Missing authenticated player',
      );
    const choice = chooseHumanSeat(this.world, this.combatActivity.snapshot());
    if (choice === null)
      throw new ServerError(CloseCode.RoomFull, 'Room is full');
    const events = assignHumanSeat(this.world, choice, {
      id: client.sessionId,
      name: auth.name,
    });
    if (choice.kind === 'replace') this.botSequences.delete(choice.botId);
    this.bindInputSource(client, client.sessionId, choice.seat);
    this.broadcastEncodedEventsAtCurrentTick(events);
  }

  protected runSimulationStep(): void {
    // D-061: the elapsed scheduler delay never enters deterministic sim.step.
    const inputs: InputFrame[] = [];
    const inputPressedButtonsBySeat: (number | undefined)[] = [];
    for (let seat = 0; seat < this.world.players.length; seat += 1) {
      const binding = this.inputBySeat.get(seat);
      const player = this.world.players[seat];
      if (
        player !== null &&
        player !== undefined &&
        player.isBot &&
        player.controller === Controller.Bot
      ) {
        const sequence =
          this.botSequences.get(player.id) ??
          Math.max(player.lastInputSeq, player.lastButtonInputSeq, 0) + 1;
        inputs[seat] = neutralBotFrame(player, sequence);
        this.botSequences.set(player.id, sequence + 1);
        continue;
      }
      if (
        binding === undefined ||
        player === null ||
        player === undefined ||
        player.id !== binding.playerId ||
        player.isBot ||
        player.controller !== Controller.Human
      )
        continue;
      const applied = binding.queue.consume();
      if (applied.frame === undefined) continue;
      inputs[seat] = applied.frame;
      inputPressedButtonsBySeat[seat] = applied.pressedButtons;
    }
    const eventTick = this.world.tick;
    const events = step(this.world, inputs, { inputPressedButtonsBySeat });
    this.recordCombatEvents(events, eventTick);
    this.mirrorNow();
    this.broadcastSimEvents(eventTick, events);
  }

  /** T-024 can send out-of-step lifecycle events before the next step clears them. */
  protected broadcastEncodedEventsAtCurrentTick(
    events: readonly EncodedEvent[],
  ): void {
    this.broadcastEncodedEvents(this.world.tick, events);
  }

  protected broadcastSimEvents(
    tick: number,
    events: readonly SimEvent[],
  ): void {
    this.broadcastEncodedEvents(tick, encodeSimEvents(events));
  }

  protected recordCombatEvents(
    events: readonly SimEvent[],
    tick: number,
  ): void {
    this.combatActivity.observe(events, tick);
  }

  private broadcastEncodedEvents(
    tick: number,
    events: readonly EncodedEvent[],
  ): void {
    const batch = createEventBatch(tick, events);
    if (batch !== null) this.broadcast(ServerMessageId.Ev, batch);
  }

  /** T-024 will call this after it owns seat selection. A queue can be rebound. */
  protected bindInputSource(
    client: Client,
    playerId: string,
    seat: number,
    queue: InputQueue = new InputQueue(),
  ): InputQueue {
    const player = this.world.players[seat];
    if (player === null || player === undefined || player.id !== playerId)
      throw new Error('input source must match an occupied seat');
    this.unbindInputSource(client);
    const prior = this.inputBySeat.get(seat);
    if (prior !== undefined) this.inputBySession.delete(prior.sessionId);
    const binding = { sessionId: client.sessionId, playerId, seat, queue };
    this.inputBySession.set(client.sessionId, binding);
    this.inputBySeat.set(seat, binding);
    this.connectedIds.add(playerId);
    this.mirrorNow();
    this.sendWelcome(client, binding);
    return queue;
  }

  /** Only a real, bound player can receive welcome; rebind sends a fresh tick. */
  protected sendWelcome(
    client: Client,
    binding: { readonly playerId: string; readonly seat: number },
  ): void {
    const active = this.inputBySession.get(client.sessionId);
    const player = this.world.players[binding.seat];
    if (
      active === undefined ||
      active.playerId !== binding.playerId ||
      active.seat !== binding.seat ||
      player === null ||
      player === undefined ||
      player.id !== binding.playerId
    )
      throw new Error('welcome requires an assigned player binding');
    client.send(ServerMessageId.Welcome, {
      protocolVersion: PROTOCOL_VERSION,
      buildId: this.trustedBuildId,
      playerId: binding.playerId,
      seat: binding.seat,
      isHost: this.mirrorContext.hostId === binding.playerId,
      roomCode: this.roomCode,
      mapId: this.world.map.id,
      balanceVersion: BALANCE.version,
      balanceHash: balanceHash(),
      serverTick: this.world.tick,
      tickRate: BALANCE.tick.rateHz,
      patchRate: BALANCE.tick.patchRateHz,
      testerCode: client.sessionId.slice(0, 6),
    });
  }

  protected unbindInputSource(
    client: Client,
    mirror = true,
  ): InputQueue | undefined {
    const binding = this.inputBySession.get(client.sessionId);
    if (binding === undefined) return undefined;
    this.inputBySession.delete(client.sessionId);
    if (this.inputBySeat.get(binding.seat) === binding)
      this.inputBySeat.delete(binding.seat);
    this.connectedIds.delete(binding.playerId);
    if (mirror) this.mirrorNow();
    return binding.queue;
  }

  onLeave(client: Client): void {
    this.finalizePlayerLeave(client);
  }

  /** T-026 calls this only when a leave is final; repeating it is harmless. */
  protected finalizePlayerLeave(client: Client): void {
    const binding = this.inputBySession.get(client.sessionId);
    if (binding === undefined) return;
    const player = this.world.players[binding.seat];
    if (player?.id !== binding.playerId) {
      this.unbindInputSource(client);
      return;
    }
    this.unbindInputSource(client, false);
    const bot = this.botFillEnabled
      ? botIdentity(this.nextBotSerial++, binding.seat)
      : null;
    const events = releaseHumanSeat(this.world, binding.playerId, bot);
    this.mirrorNow();
    this.broadcastEncodedEventsAtCurrentTick(events);
  }

  protected mirrorNow(): number {
    return mirrorWorld(this.world, this.state, this.mirrorContext);
  }

  get tickMetrics(): Readonly<TickMetrics> {
    return this.fixedLoop.metrics;
  }

  onDispose(): void {
    this.fixedLoop?.stop();
  }
}
