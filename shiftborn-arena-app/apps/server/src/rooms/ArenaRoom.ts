import { Room, type Client } from '@colyseus/core';
import {
  BALANCE,
  ClientMessageId,
  CloseCode,
  Controller,
  GREYBOX_V1,
  Mode,
  type InputFrame,
} from '@shiftborn/shared';
import { createWorld, step, type World } from '@shiftborn/sim';
import pino from 'pino';
import { InputQueue } from '../net/inputQueue.js';
import { FixedStepLoop, type TickMetrics } from './fixedStep.js';
import { mirrorWorld, type MirrorContext } from './mirror.js';
import { createRoomSeed } from './roomSeed.js';
import { ArenaState, type ArenaStateRecord } from './schema.js';

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
  private readonly warningLogger = pino({ name: 'arena-room' });

  onCreate(): void {
    this.maxClients = BALANCE.match.seats;
    this.patchRate = 1000 / BALANCE.tick.patchRateHz;
    this.world = createWorld({
      map: GREYBOX_V1,
      roomSeed: createRoomSeed(),
      mode: Mode.Frenzy,
    });
    this.mirrorContext = { connectedIds: this.connectedIds };
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

  protected runSimulationStep(): void {
    // D-061: the elapsed scheduler delay never enters deterministic sim.step.
    const inputs: InputFrame[] = [];
    const inputPressedButtonsBySeat: (number | undefined)[] = [];
    for (let seat = 0; seat < this.world.players.length; seat += 1) {
      const binding = this.inputBySeat.get(seat);
      const player = this.world.players[seat];
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
    step(this.world, inputs, { inputPressedButtonsBySeat });
    this.mirrorNow();
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
    return queue;
  }

  protected unbindInputSource(client: Client): InputQueue | undefined {
    const binding = this.inputBySession.get(client.sessionId);
    if (binding === undefined) return undefined;
    this.inputBySession.delete(client.sessionId);
    if (this.inputBySeat.get(binding.seat) === binding)
      this.inputBySeat.delete(binding.seat);
    this.connectedIds.delete(binding.playerId);
    this.mirrorNow();
    return binding.queue;
  }

  onLeave(client: Client): void {
    this.unbindInputSource(client);
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
