import { ErrorCode, Room, ServerError, type Client } from '@colyseus/core';
import {
  BALANCE,
  BotDifficultyCode,
  balanceHash,
  ClientMessageId,
  CloseCode,
  Controller,
  DERIVED,
  GREYBOX_V1,
  Mode,
  Phase,
  PROTOCOL_VERSION,
  ServerMessageId,
  isValidRoomCode,
  type EncodedEvent,
  type InputFrame,
  type ReplayRoomState,
} from '@shiftborn/shared';
import {
  addPlayer,
  createWorld,
  removePlayer,
  setController,
  setMode,
  stopOrdinaryBots,
  step,
  type SimEvent,
  type World,
} from '@shiftborn/sim';
import pino from 'pino';
import {
  decodeDevPayload, executeDevCommand, parseDevCommand,
  type DevCommand,
} from '../dev/cheats.js';
import { decodeClientStats } from '../logging/matchLog.js';
import { MatchRecorder } from '../logging/matchRecorder.js';
import { InputQueue } from '../net/inputQueue.js';
import {
  decodeTimeTuple,
  monotonicServerTimeMs,
  ProbeTracker,
  rttToSpawnAdvanceTicks,
} from '../net/ping.js';
import {
  afkAction,
  decodeVisibility,
  isMeaningfulInput,
  rebaseAfk,
  shutdownResultsWaitMs,
  type HumanSession,
  type ProxyReason,
} from './connectionLifecycle.js';
import {
  authenticatePlayer,
  authenticatedPlayer,
  type AuthenticatedPlayer,
} from './auth.js';
import { createEventBatch, encodeSimEvents } from './eventBatcher.js';
import { FixedStepLoop, type TickMetrics } from './fixedStep.js';
import { controllerCode, mirrorWorld, type MirrorContext } from './mirror.js';
import { createRoomSeed } from './roomSeed.js';
import { ArenaState, type ArenaStateRecord } from './schema.js';
import {
  decodeHostSettings,
  difficultyCode,
  quickplayModeForMatch,
  type RoomSettingsValue,
} from './roomSettings.js';
import type { BotDifficulty, QuickplayMode } from '../config.js';
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

interface QueuedDevCommand {
  readonly client: Client;
  readonly playerId: string;
  readonly seat: number;
  readonly command: DevCommand;
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
  private hostId = '';
  private activeSettings: RoomSettingsValue = {
    botFill: true,
    botDifficulty: BotDifficultyCode.Normal,
    nextMode: Mode.Frenzy,
  };
  private pendingSettings: RoomSettingsValue = this.activeSettings;
  private settingsDirty = false;
  private quickplayMode: QuickplayMode = 'frenzy';
  private cutoffLocked = false;
  private readonly waitingIds = new Set<string>();
  private readonly sessions = new Map<string, HumanSession>();
  private readonly finalCloseIds = new Set<string>();
  private readonly afkWakeIds = new Set<string>();
  private matchLogDir = './data/matches';
  private recorder: MatchRecorder | null = null;
  private readonly pendingRecorderCloses = new Set<Promise<void>>();
  private devCheatsEnabled = false;
  private readonly queuedDevCommands: QueuedDevCommand[] = [];
  private botsFrozen = false;
  protected readonly probeTracker = new ProbeTracker(() => this.monotonicNowMs());
  private probeDisposed = false;
  private shuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private resultsWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveResultsWait: (() => void) | null = null;

  static override async onAuth(
    token: string,
    options: unknown,
  ): Promise<AuthenticatedPlayer> {
    // The pinned declaration says string; unauthenticated SDK joins send none.
    return authenticatePlayer(options, typeof token === 'string' ? token : '');
  }

  onCreate(options: {
    readonly code?: unknown;
    readonly trustedBuildId: string;
    readonly trustedQuickplayMode?: QuickplayMode;
    readonly trustedBotDifficulty?: BotDifficulty;
    readonly trustedMatchLogDir?: string;
    readonly trustedDevCheats?: boolean;
  }): void {
    if (!isValidRoomCode(options.code))
      throw new ServerError(CloseCode.InvalidRoomCode, 'Invalid room code');
    this.roomCode = options.code;
    this.trustedBuildId = options.trustedBuildId;
    this.matchLogDir = options.trustedMatchLogDir ?? this.matchLogDir;
    this.devCheatsEnabled = options.trustedDevCheats === true;
    this.quickplayMode = options.trustedQuickplayMode ?? 'frenzy';
    this.activeSettings = {
      botFill: this.botFillEnabled,
      botDifficulty:
        this.roomCode === ''
          ? difficultyCode(options.trustedBotDifficulty ?? 'normal')
          : BotDifficultyCode.Normal,
      nextMode:
        this.roomCode === ''
          ? quickplayModeForMatch(this.quickplayMode, 0)
          : Mode.Frenzy,
    };
    this.pendingSettings =
      this.roomCode === ''
        ? {
            ...this.activeSettings,
            nextMode: quickplayModeForMatch(this.quickplayMode, 1),
          }
        : this.activeSettings;
    // Code rooms must remain discoverable when all eight human seats are full.
    // Their onJoin admission rejects every extra reservation with 4001.
    this.maxClients = this.roomCode === '' ? BALANCE.match.seats : Infinity;
    void this.setMetadata({ code: this.roomCode }).catch((error: unknown) => {
      this.warningLogger.error({ error }, 'room_metadata_error');
    });
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
      mode: this.activeSettings.nextMode,
      initialPlayers: initial.bots,
    });
    // Initial spawn and shard events predate all clients. The first tick or
    // join must not broadcast them as lifecycle events.
    this.world.events.length = 0;
    this.mirrorContext = {
      connectedIds: this.connectedIds,
      hostId: this.hostId,
      settings: this.pendingSettings,
    };
    this.state = new ArenaState();
    this.mirrorNow();
    this.recorder = this.createRecorder();
    this.onMessage(ClientMessageId.Input, (client, payload: unknown) => {
      const queue = this.inputQueueForSession(client.sessionId);
      if (queue === undefined) return;
      const session = this.sessions.get(client.sessionId);
      const retainedWakingFrame =
        session?.proxyReason === 'afk' && this.afkWakeIds.has(session.id)
          ? queue.frames[0]
          : undefined;
      const result = queue.receiveDetailed(payload);
      if (result.shouldKick) {
        this.kickInvalidInput(client);
        return;
      }
      if (session?.client !== client || !session.connected) return;
      if (session.hidden || session.proxyReason === 'drop') {
        queue.discardPending();
        return;
      }
      const waking = result.accepted.find(({ frame, previousAim }) =>
        isMeaningfulInput(frame, previousAim),
      );
      if (session.proxyReason === 'afk') {
        if (this.afkWakeIds.has(session.id)) {
          if (retainedWakingFrame !== undefined)
            queue.retainWakingFrame(retainedWakingFrame);
        } else if (waking !== undefined) {
          queue.retainWakingFrame(waking.frame);
          this.afkWakeIds.add(session.id);
        } else queue.discardPending();
      } else if (waking !== undefined) {
        rebaseAfk(session, this.world.tick);
      }
    });
    this.onMessage(ClientMessageId.Vis, (client, payload: unknown) => {
      const hidden = decodeVisibility(payload);
      const queue = this.inputQueueForSession(client.sessionId);
      if (hidden === null) {
        if (queue?.noteUnknownMessage()) this.kickInvalidInput(client);
        return;
      }
      const session = this.sessions.get(client.sessionId);
      if (
        session?.client !== client ||
        !session.connected ||
        session.hidden === hidden
      )
        return;
      session.hidden = hidden;
      if (hidden) this.proxySession(session, 'hidden');
      else if (session.proxyReason === 'hidden') this.restoreHuman(session);
    });
    this.onMessage(ClientMessageId.Ping, (client, payload: unknown) => {
      const clientTimeMs = decodeTimeTuple(payload);
      if (clientTimeMs === null || !this.isAttachedHuman(client)) {
        this.noteInvalidMessage(client);
        return;
      }
      const serverTick = this.world.tick;
      const serverTimeMs = this.monotonicNowMs();
      client.send(ServerMessageId.Pong, [
        clientTimeMs,
        serverTick,
        serverTimeMs,
      ]);
    });
    this.onMessage(ClientMessageId.ProbeReply, (client, payload: unknown) => {
      const token = decodeTimeTuple(payload);
      if (
        token === null ||
        !this.isAttachedHuman(client) ||
        !this.probeTracker.accept(client.sessionId, client, token)
      ) this.noteInvalidMessage(client);
    });
    this.onMessage(ClientMessageId.ClientStats, (client, payload: unknown) => {
      const stats = decodeClientStats(payload);
      if (stats === null || !this.isAttachedHuman(client)) {
        this.noteInvalidMessage(client);
        return;
      }
      this.recorder?.recordClientStats(this.world.tick, client.sessionId, stats);
    });
    this.onMessage(ClientMessageId.DevCmd, (client, payload: unknown) => {
      if (!this.devCheatsEnabled || !this.isAttachedHuman(client)) {
        this.noteInvalidMessage(client);
        return;
      }
      const commandText = decodeDevPayload(payload);
      if (commandText === null) {
        this.noteInvalidMessage(client);
        return;
      }
      const parsed = parseDevCommand(commandText);
      if (!parsed.ok) {
        client.send(ServerMessageId.DevResult, { ok: false, text: parsed.text });
        return;
      }
      const session = this.sessions.get(client.sessionId);
      if (session === undefined) return;
      this.queuedDevCommands.push({
        client, playerId: session.id, seat: session.seat,
        command: parsed.command,
      });
    });
    this.onMessage(ClientMessageId.HostSettings, (client, payload: unknown) => {
      const settings = decodeHostSettings(payload);
      const queue = this.inputBySession.get(client.sessionId)?.queue;
      if (settings === null) {
        if (queue?.noteUnknownMessage()) this.kickInvalidInput(client);
        return;
      }
      if (this.roomCode === '' || this.hostId !== client.sessionId) return;
      this.pendingSettings = settings;
      this.settingsDirty = true;
      this.updateMirrorContext();
      this.mirrorNow();
      this.broadcast(ServerMessageId.Notice, {
        kind: 'settingsPending',
        text: 'Changes apply at the next match.',
      });
    });
    this.onMessage('*', (client, type) => {
      if (Object.values(ClientMessageId).some((known) => known === type))
        return;
      const queue = this.inputBySession.get(client.sessionId)?.queue;
      if (queue?.noteUnknownMessage()) this.kickInvalidInput(client);
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
    if (auth.code !== this.roomCode)
      throw new ServerError(CloseCode.InvalidRoomCode, 'Invalid room code');
    const choice = chooseHumanSeat(this.world, this.combatActivity.snapshot());
    if (choice === null)
      throw new ServerError(CloseCode.RoomFull, 'Room is full');
    const waiting =
      this.world.phase === Phase.Results ||
      (this.world.phase === Phase.Playing &&
        this.world.phaseEndTick - this.world.tick <=
          DERIVED.match.lateJoinCutoffTicks);
    const events = assignHumanSeat(
      this.world,
      choice,
      {
        id: client.sessionId,
        name: auth.name,
      },
      waiting,
    );
    if (waiting) this.waitingIds.add(client.sessionId);
    if (choice.kind === 'replace') this.botSequences.delete(choice.botId);
    if (this.roomCode !== '' && this.hostId === '') {
      this.hostId = client.sessionId;
      this.updateMirrorContext();
    }
    const queue = this.bindInputSource(client, client.sessionId, choice.seat);
    this.sessions.set(client.sessionId, {
      id: client.sessionId,
      seat: choice.seat,
      queue,
      inputScheme: auth.inputScheme,
      client,
      connected: true,
      hidden: false,
      proxyReason: null,
      lastMeaningfulInputTick: this.world.tick,
      afkWarned: false,
    });
    this.markReplayCheckpoint();
    this.probeTracker.admit(client.sessionId, client);
    this.broadcastEncodedEventsAtCurrentTick(events);
    if (this.hostId === client.sessionId) this.sendHostChangedNotice();
  }

  protected runSimulationStep(): void {
    // D-061: the elapsed scheduler delay never enters deterministic sim.step.
    if (this.probeDisposed) return;
    this.sendDueProbes();
    const nextCountdown =
      this.world.phase === Phase.Results &&
      this.world.tick >= this.world.phaseEndTick;
    if (nextCountdown) this.prepareNextMatch();
    this.restoreAfkWakes();
    this.executeQueuedDevCommands();
    const inputs: InputFrame[] = [];
    const inputPressedButtonsBySeat: (number | undefined)[] = [];
    const shotIntentBySeat: (number | null | undefined)[] = [];
    const appliedShotSeqBySeat: (number | undefined)[] = [];
    const spawnAdvanceTicksBySeat: number[] = Array.from(
      { length: this.world.players.length },
      () => 0,
    );
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
        inputs[seat] = this.botInputFor(player, sequence);
        this.botSequences.set(player.id, sequence + 1);
        continue;
      }
      if (
        binding === undefined ||
        player === null ||
        player === undefined ||
        player.id !== binding.playerId ||
        player.isBot ||
        player.controller !== Controller.Human ||
        this.waitingIds.has(player.id)
      )
        continue;
      const session = this.sessions.get(player.id);
      if (
        session?.client !== null &&
        session?.client !== undefined &&
        session.client.sessionId === binding.sessionId &&
        session.connected &&
        session.seat === seat
      )
        spawnAdvanceTicksBySeat[seat] = rttToSpawnAdvanceTicks(
          this.probeTracker.medianFor(player.id),
        );
      const applied = binding.queue.consume();
      if (applied.frame === undefined) continue;
      const shotIntentSeq = binding.queue.candidateShotIntent(applied.frame);
      shotIntentBySeat[seat] = shotIntentSeq;
      appliedShotSeqBySeat[seat] = applied.frame.seq;
      inputs[seat] = shotIntentSeq === null ? applied.frame
        : { ...applied.frame, shotIntentSeq };
      inputPressedButtonsBySeat[seat] = applied.pressedButtons;
    }
    const eventTick = this.world.tick;
    const recording = this.recorder?.prepareStep(this.world);
    const events = step(this.world, inputs, {
      inputPressedButtonsBySeat,
      spawnAdvanceTicksBySeat,
    });
    const firedSeats = new Set(events.flatMap((event) =>
      event.type === 'projectileSpawn' ? [event.ownerSeat] : []));
    for (const seat of firedSeats) {
      const appliedSeq = appliedShotSeqBySeat[seat];
      if (appliedSeq !== undefined)
        this.inputBySeat.get(seat)?.queue.resolveShotIntent(
          appliedSeq, shotIntentBySeat[seat] ?? null);
    }
    if (recording !== undefined) {
      this.recorder?.recordStep(
        this.world, recording, events, inputs,
        inputPressedButtonsBySeat, spawnAdvanceTicksBySeat,
      );
      const previous = this.recorder;
      if (previous !== null && previous.matchId !== this.world.matchId) {
        this.trackRecorderClose(previous.close(this.world));
        this.recorder = this.createRecorder();
      }
    }
    if (nextCountdown) {
      this.waitingIds.clear();
      if (this.settingsDirty) {
        this.settingsDirty = false;
        this.broadcast(ServerMessageId.Notice, {
          kind: 'settingsApplied',
          text: 'Room settings applied.',
        });
      }
    }
    this.recordCombatEvents(events, eventTick);
    this.advanceAfk();
    this.mirrorNow();
    this.broadcastSimEvents(eventTick, events);
    this.updateQuickplayLock();
    if (this.world.phase !== Phase.Results) this.finishResultsWait();
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
    sendWelcome = true,
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
    if (sendWelcome) this.sendWelcome(client, binding);
    return queue;
  }

  protected inputQueueForSession(sessionId: string): InputQueue | undefined {
    return this.inputBySession.get(sessionId)?.queue;
  }

  protected sessionForId(id: string): HumanSession | undefined {
    return this.sessions.get(id);
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
      devCheatsEnabled: this.devCheatsEnabled,
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

  onDrop(client: Client): void {
    const session = this.sessions.get(client.sessionId);
    if (
      session?.client !== client ||
      !session.connected ||
      this.shuttingDown ||
      this.finalCloseIds.has(client.sessionId)
    )
      return;
    this.probeTracker.detach(session.id, client);
    session.client = null;
    session.connected = false;
    session.proxyReason = 'drop';
    session.queue.discardPending();
    this.afkWakeIds.delete(session.id);
    this.unbindInputSource(client, false);
    const player = this.world.players[session.seat];
    if (player?.id === session.id) player.lastHeldButtons = 0;
    setController(this.world, session.id, Controller.Proxy);
    this.markReplayCheckpoint();
    this.mirrorNow();
    void this.allowReconnection(client, this.reconnectionWindowSeconds()).catch(
      () => undefined,
    );
  }

  protected reconnectionWindowSeconds(): number {
    return BALANCE.net.reconnectS;
  }

  onReconnect(client: Client): void {
    const session = this.sessions.get(client.sessionId);
    if (session === undefined || session.proxyReason !== 'drop')
      throw new Error('reconnect requires a retained session');
    session.queue.discardPending();
    session.client = client;
    session.connected = true;
    session.hidden = false;
    session.proxyReason = null;
    rebaseAfk(session, this.world.tick);
    setController(this.world, session.id, Controller.Human);
    this.markReplayCheckpoint();
    this.bindInputSource(
      client,
      session.id,
      session.seat,
      session.queue,
      false,
    );
    this.probeTracker.attach(session.id, client);
    this.mirrorNow();
    this.sendControl(client, Controller.Human);
    this.sendWelcome(client, { playerId: session.id, seat: session.seat });
  }

  onLeave(client: Client): void {
    this.finalizePlayerLeave(client);
    this.probeTracker.release(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.finalCloseIds.delete(client.sessionId);
    this.afkWakeIds.delete(client.sessionId);
  }

  /** T-026 calls this only when a leave is final; repeating it is harmless. */
  protected finalizePlayerLeave(client: Client): void {
    const binding = this.inputBySession.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (binding !== undefined) this.unbindInputSource(client, false);
    const playerId = binding?.playerId ?? session?.id;
    const seat = binding?.seat ?? session?.seat;
    if (playerId === undefined || seat === undefined) return;
    this.probeTracker.release(playerId);
    if (session !== undefined) {
      session.client = null;
      session.connected = false;
      session.queue.discardPending();
    }
    const player = this.world.players[seat];
    if (player?.id !== playerId) return;
    this.waitingIds.delete(playerId);
    const bot = this.activeSettings.botFill
      ? botIdentity(this.nextBotSerial++, seat)
      : null;
    const events = releaseHumanSeat(this.world, playerId, bot);
    this.markReplayCheckpoint();
    if (playerId === this.hostId) this.handoverHost();
    this.mirrorNow();
    this.broadcastEncodedEventsAtCurrentTick(events);
  }

  private updateMirrorContext(): void {
    this.mirrorContext = {
      connectedIds: this.connectedIds,
      hostId: this.hostId,
      settings: this.pendingSettings,
    };
  }

  private createRecorder(): MatchRecorder {
    const inputSchemes = new Map<string, 'mouse' | 'keys' | null>();
    for (const session of this.sessions.values())
      inputSchemes.set(session.id, session.inputScheme ?? null);
    return new MatchRecorder(
      this.world,
      {
        roomId: this.roomId, roomCode: this.roomCode,
        buildId: this.trustedBuildId,
        botDifficulty: this.activeSettings.botDifficulty,
        inputSchemes,
      },
      this.matchLogDir,
      this.warningLogger,
    );
  }

  protected markReplayCheckpoint(roomState?: ReplayRoomState): void {
    this.recorder?.markExternalChange(roomState);
  }

  private trackRecorderClose(promise: Promise<void>): void {
    this.pendingRecorderCloses.add(promise);
    void promise.then(
      () => this.pendingRecorderCloses.delete(promise),
      (error: unknown) => {
        this.pendingRecorderCloses.delete(promise);
        this.warningLogger.error({ err: error }, 'match_log_close_error');
      },
    );
  }

  private async flushRecorders(): Promise<void> {
    if (this.recorder !== null) await this.recorder.close(this.world);
    await Promise.all(this.pendingRecorderCloses);
  }

  private sendHostChangedNotice(): void {
    this.broadcast(ServerMessageId.Notice, {
      kind: 'hostChanged',
      text:
        this.hostId === '' ? 'The room has no host.' : 'The room host changed.',
    });
  }

  /** T-026 calls final release only after a dropped host's grace expires. */
  protected handoverHost(): void {
    const next =
      this.world.players.find((player) => player !== null && !player.isBot)
        ?.id ?? '';
    if (next === this.hostId) return;
    this.hostId = next;
    this.updateMirrorContext();
    this.sendHostChangedNotice();
  }

  private prepareNextMatch(): void {
    const nextMode =
      this.roomCode === ''
        ? quickplayModeForMatch(this.quickplayMode, this.world.matchIndex + 1)
        : this.pendingSettings.nextMode;
    const selected = { ...this.pendingSettings, nextMode };
    this.activeSettings = selected;
    this.pendingSettings =
      this.roomCode === ''
        ? {
            ...selected,
            nextMode: quickplayModeForMatch(
              this.quickplayMode,
              this.world.matchIndex + 2,
            ),
          }
        : selected;
    this.botFillEnabled = selected.botFill;
    setMode(this.world, nextMode);
    for (let seat = 0; seat < this.world.players.length; seat += 1) {
      const player = this.world.players[seat];
      if (
        player !== null &&
        player !== undefined &&
        player.isBot &&
        !selected.botFill
      ) {
        this.botSequences.delete(player.id);
        removePlayer(this.world, player.id);
      } else if (player === null && selected.botFill) {
        addPlayer(this.world, botIdentity(this.nextBotSerial++, seat));
      }
    }
    for (const binding of this.inputBySession.values()) {
      if (this.waitingIds.has(binding.playerId)) binding.queue.discardPending();
    }
    this.updateMirrorContext();
    this.markReplayCheckpoint();
  }

  /** T-051 can replace this seam while preserving the room-owned freeze gate. */
  protected botInputFor(player: NonNullable<World['players'][number]>, sequence: number): InputFrame {
    if (this.botsFrozen) return neutralBotFrame(player, sequence);
    return neutralBotFrame(player, sequence);
  }

  protected botsAreFrozen(): boolean {
    return this.botsFrozen;
  }

  private setDevBotCount(count: number): boolean {
    const humans = this.world.players.filter((player) => player !== null && !player.isBot).length;
    if (count > BALANCE.match.seats - humans) return false;
    let current = this.world.players.filter((player) => player?.isBot).length;
    for (let seat = this.world.players.length - 1; seat >= 0 && current > count; seat -= 1) {
      const player = this.world.players[seat];
      if (player?.isBot !== true) continue;
      removePlayer(this.world, player.id);
      this.botSequences.delete(player.id);
      this.combatActivity.clearSeat(seat);
      current -= 1;
    }
    for (let seat = 0; seat < this.world.players.length && current < count; seat += 1) {
      if (this.world.players[seat] !== null) continue;
      addPlayer(this.world, botIdentity(this.nextBotSerial++, seat));
      this.combatActivity.clearSeat(seat);
      current += 1;
    }
    return true;
  }

  private executeQueuedDevCommands(): void {
    if (this.queuedDevCommands.length === 0) return;
    const queued = this.queuedDevCommands.splice(0);
    const previousEvents = this.world.events.length;
    let changed = false;
    for (const item of queued) {
      const session = this.sessions.get(item.playerId);
      if (session?.client !== item.client || session.seat !== item.seat ||
        !this.isAttachedHuman(item.client)) continue;
      const player = this.world.players[item.seat];
      if (player?.id !== item.playerId || player.isBot) continue;
      try {
        const result = executeDevCommand(item.command, {
          world: this.world,
          player,
          setBotCount: (count) => this.setDevBotCount(count),
          setDifficulty: (value) => {
            const botDifficulty = difficultyCode(value);
            this.activeSettings = { ...this.activeSettings, botDifficulty };
            this.pendingSettings = { ...this.pendingSettings, botDifficulty };
            this.updateMirrorContext();
          },
          setMode: (mode) => {
            this.pendingSettings = { ...this.pendingSettings, nextMode: mode };
            this.quickplayMode = mode === Mode.Frenzy ? 'frenzy' : 'zoneFrenzy';
            setMode(this.world, mode);
            this.settingsDirty = true;
            this.updateMirrorContext();
          },
          toggleFreeze: () => {
            this.botsFrozen = !this.botsFrozen;
            if (this.botsFrozen) stopOrdinaryBots(this.world);
            return this.botsFrozen;
          },
        });
        if (result.mutated) changed = true;
        if (this.isAttachedHuman(item.client))
          item.client.send(ServerMessageId.DevResult, { ok: result.ok, text: result.text });
      } catch (error: unknown) {
        this.warningLogger.error({ err: error, matchId: this.world.matchId,
          tick: this.world.tick, kind: item.command.kind }, 'dev_command_error');
        if (this.isAttachedHuman(item.client))
          item.client.send(ServerMessageId.DevResult, { ok: false, text: 'Command failed.' });
      }
    }
    if (changed) {
      this.markReplayCheckpoint({
        active: { ...this.activeSettings },
        pending: { ...this.pendingSettings },
        botsFrozen: this.botsFrozen,
      });
      this.mirrorNow();
    }
    const events = this.world.events.slice(previousEvents);
    if (events.length > 0) this.broadcastEncodedEventsAtCurrentTick(encodeSimEvents(events));
  }

  protected pendingDevCommandCount(): number {
    return this.queuedDevCommands.length;
  }

  private updateQuickplayLock(): void {
    if (this.roomCode !== '') return;
    const shouldLock =
      this.world.phase === Phase.Playing &&
      this.world.phaseEndTick - this.world.tick <=
        DERIVED.match.lateJoinCutoffTicks;
    if (shouldLock === this.cutoffLocked) return;
    this.cutoffLocked = shouldLock;
    const operation = shouldLock ? this.lock() : this.unlock();
    void operation.catch((error: unknown) => {
      this.warningLogger.error({ error }, 'room_lock_error');
    });
  }

  private kickInvalidInput(client: Client): void {
    this.finalCloseIds.add(client.sessionId);
    client.leave(CloseCode.InvalidInput);
  }

  protected monotonicNowMs(): number {
    return monotonicServerTimeMs();
  }

  private isAttachedHuman(client: Client): boolean {
    const session = this.sessions.get(client.sessionId);
    const binding = this.inputBySession.get(client.sessionId);
    const player = session && this.world.players[session.seat];
    return (
      session?.client === client &&
      session.connected &&
      binding?.playerId === session.id &&
      binding.seat === session.seat &&
      player?.id === session.id &&
      !player.isBot
    );
  }

  private noteInvalidMessage(client: Client): void {
    const queue = this.inputBySession.get(client.sessionId)?.queue;
    if (queue?.noteUnknownMessage()) this.kickInvalidInput(client);
  }

  private sendDueProbes(): void {
    if (!this.probeTracker.due(this.world.tick)) return;
    const sessions = [...this.sessions.values()].sort(
      (left, right) => left.seat - right.seat,
    );
    for (const session of sessions) {
      const client = session.client;
      if (client === null || !this.isAttachedHuman(client)) continue;
      const token = this.probeTracker.issue(session.id, client);
      if (token !== undefined) client.send(ServerMessageId.Probe, [token]);
    }
  }

  private proxySession(
    session: HumanSession,
    reason: Exclude<ProxyReason, null>,
  ): void {
    session.proxyReason = reason;
    session.queue.discardPending();
    this.afkWakeIds.delete(session.id);
    const player = this.world.players[session.seat];
    if (player?.id !== session.id) return;
    player.lastHeldButtons = 0;
    if (player.controller !== Controller.Proxy) {
      setController(this.world, session.id, Controller.Proxy);
      if (session.client !== null)
        this.sendControl(session.client, Controller.Proxy);
    }
    this.markReplayCheckpoint();
    this.mirrorNow();
  }

  private restoreHuman(session: HumanSession, keepWakingFrame = false): void {
    if (!keepWakingFrame) session.queue.discardPending();
    session.proxyReason = null;
    rebaseAfk(session, this.world.tick);
    const player = this.world.players[session.seat];
    if (player?.id !== session.id) return;
    player.lastHeldButtons = 0;
    if (player.controller !== Controller.Human) {
      setController(this.world, session.id, Controller.Human);
      if (session.client !== null)
        this.sendControl(session.client, Controller.Human);
    }
    this.markReplayCheckpoint();
    this.mirrorNow();
  }

  private restoreAfkWakes(): void {
    const ids = [...this.afkWakeIds].sort(
      (left, right) =>
        (this.sessions.get(left)?.seat ?? Infinity) -
        (this.sessions.get(right)?.seat ?? Infinity),
    );
    for (const id of ids) {
      const session = this.sessions.get(id);
      if (
        session?.connected &&
        !session.hidden &&
        session.proxyReason === 'afk'
      )
        this.restoreHuman(session, true);
    }
    this.afkWakeIds.clear();
  }

  private advanceAfk(): void {
    const sessions = [...this.sessions.values()].sort(
      (left, right) => left.seat - right.seat,
    );
    for (const session of sessions) {
      const action = afkAction(session, this.world.tick);
      if (action === 'warn') {
        session.afkWarned = true;
        if (session.client !== null)
          this.sendAfkWarning(
            session.client,
            BALANCE.net.afkBotS - BALANCE.net.afkWarnS,
          );
      } else if (action === 'proxy') {
        this.proxySession(session, 'afk');
      }
    }
  }

  protected sendControl(client: Client, controller: Controller): void {
    client.send(ServerMessageId.Control, [controllerCode(controller)]);
  }

  protected sendAfkWarning(client: Client, secondsLeft: number): void {
    client.send(ServerMessageId.AfkWarn, [secondsLeft]);
  }

  override onBeforeShutdown(): void {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.shutdownPromise = this.performShutdown().catch(
      async (error: unknown) => {
        this.warningLogger.error({ error }, 'room_shutdown_error');
        try {
          await this.disconnect(CloseCode.ServerShuttingDown);
        } catch (disconnectError: unknown) {
          this.warningLogger.error(
            { error: disconnectError },
            'room_disconnect_error',
          );
        }
      },
    );
  }

  protected async waitForResultsOrTimeout(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.resolveResultsWait = resolve;
      this.resultsWaitTimer = setTimeout(
        () => this.finishResultsWait(),
        milliseconds,
      );
    });
  }

  private finishResultsWait(): void {
    if (this.resultsWaitTimer !== null) clearTimeout(this.resultsWaitTimer);
    this.resultsWaitTimer = null;
    const resolve = this.resolveResultsWait;
    this.resolveResultsWait = null;
    resolve?.();
  }

  private async performShutdown(): Promise<void> {
    try {
      await this.lock();
    } catch (error: unknown) {
      this.warningLogger.error({ error }, 'room_shutdown_lock_error');
    }
    this.broadcast(ServerMessageId.Notice, {
      kind: 'shutdown',
      text: 'The server is restarting. Play again in a moment.',
    });
    const waitMs = shutdownResultsWaitMs(
      this.world.phase,
      this.world.phaseEndTick,
      this.world.tick,
    );
    if (waitMs > 0) await this.waitForResultsOrTimeout(waitMs);
    this.fixedLoop.stop();
    await this.flushRecorders();
    await this.disconnect(CloseCode.ServerShuttingDown);
  }

  protected mirrorNow(): number {
    return mirrorWorld(this.world, this.state, this.mirrorContext);
  }

  get tickMetrics(): Readonly<TickMetrics> {
    return this.fixedLoop.metrics;
  }

  async onDispose(): Promise<void> {
    this.probeDisposed = true;
    this.queuedDevCommands.length = 0;
    this.probeTracker.clear();
    this.fixedLoop?.stop();
    this.finishResultsWait();
    this.sessions.clear();
    this.finalCloseIds.clear();
    this.afkWakeIds.clear();
    await this.flushRecorders();
  }
}
