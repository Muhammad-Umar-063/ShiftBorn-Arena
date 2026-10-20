import { join } from 'node:path';
import type { Logger } from 'pino';
import { Phase, type Controller, type InputFrame, type ReplayRoomState } from '@shiftborn/shared';
import { hashWorld, type SimEvent, type World } from '@shiftborn/sim';
import { replayCheckpoint, replayEnd, replayHeader, replayTick } from './inputLog.js';
import { JsonlWriter } from './jsonlWriter.js';
import {
  appliedControllers, capturePreStepTelemetry, clientStatsRecord,
  matchEndRecord, matchStartRecord, projectMatchEvents,
  type ClientStatsValue, type MatchMetadata, type PreStepTelemetry,
} from './matchLog.js';

export interface StepRecording {
  readonly eventTick: number;
  readonly before: PreStepTelemetry;
  readonly controllers: readonly (Controller | null)[];
}

function safeMatchId(id: string): string {
  if (!/^match:-?\d+:\d+$/.test(id))
    throw new TypeError('unsafe match ID for log filename');
  return id;
}

export class MatchRecorder {
  readonly matchPath: string;
  readonly inputPath: string;
  readonly matchId: string;
  private readonly matchWriter: JsonlWriter;
  private readonly inputWriter: JsonlWriter;
  private previousHash: string;
  private externalDirty = false;
  private pendingRoomState: ReplayRoomState | null = null;
  private naturalEnd = false;
  private closePromise: Promise<void> | null = null;

  constructor(
    world: World,
    metadata: MatchMetadata,
    directory: string,
    private readonly logger: Logger,
    startedAt: Date = new Date(),
  ) {
    this.matchId = world.matchId;
    const folder = join(directory, startedAt.toISOString().slice(0, 10));
    const stem = safeMatchId(world.matchId);
    this.matchPath = join(folder, `${stem}.jsonl`);
    this.inputPath = join(folder, `${stem}.inputs.jsonl.gz`);
    this.matchWriter = new JsonlWriter(this.matchPath, false, logger);
    this.inputWriter = new JsonlWriter(this.inputPath, true, logger);
    this.previousHash = hashWorld(world);
    this.matchWriter.write(matchStartRecord(world, metadata));
    this.inputWriter.write(replayHeader(world, metadata.buildId));
  }

  markExternalChange(roomState?: ReplayRoomState): void {
    this.externalDirty = true;
    if (roomState !== undefined) this.pendingRoomState = roomState;
  }

  prepareStep(world: World): StepRecording {
    if (this.externalDirty) {
      const currentHash = hashWorld(world);
      if (currentHash !== this.previousHash || this.pendingRoomState !== null) {
        this.inputWriter.write(replayCheckpoint(
          world, this.previousHash, this.pendingRoomState ?? undefined,
        ));
        this.previousHash = currentHash;
      }
      this.externalDirty = false;
      this.pendingRoomState = null;
    }
    return {
      eventTick: world.tick,
      before: capturePreStepTelemetry(world),
      controllers: appliedControllers(world),
    };
  }

  recordStep(
    world: World,
    recording: StepRecording,
    events: readonly SimEvent[],
    inputs: readonly (InputFrame | undefined)[],
    pressed: readonly (number | undefined)[],
    spawnAdvance: readonly number[],
  ): void {
    try {
      for (const record of projectMatchEvents(
        recording.eventTick, events, world, recording.before,
      )) this.matchWriter.write(record);
      const hash = hashWorld(world);
      this.inputWriter.write(replayTick(
        recording.eventTick, inputs, recording.controllers,
        pressed, spawnAdvance, hash,
      ));
      this.previousHash = hash;
      if (!this.naturalEnd && recording.before.phase === Phase.Playing &&
        world.phase === Phase.Results) {
        this.matchWriter.write(matchEndRecord(world, recording.eventTick));
        this.naturalEnd = true;
      }
    } catch (error: unknown) {
      // Projection failures are operational; gameplay continues.
      this.logger.error({ err: error, matchId: this.matchId,
        tick: recording.eventTick }, 'match_log_projection_error');
    }
  }

  recordClientStats(tick: number, playerId: string, stats: ClientStatsValue): void {
    this.matchWriter.write(clientStatsRecord(tick, playerId, stats));
  }

  close(world: World): Promise<void> {
    if (this.closePromise !== null) return this.closePromise;
    const currentHash = hashWorld(world);
    if (currentHash !== this.previousHash || this.pendingRoomState !== null) {
      this.inputWriter.write(replayCheckpoint(
        world, this.previousHash, this.pendingRoomState ?? undefined,
      ));
      this.previousHash = currentHash;
    }
    this.inputWriter.write(replayEnd(world, this.naturalEnd));
    this.closePromise = Promise.all([
      this.matchWriter.close(), this.inputWriter.close(),
    ]).then(() => undefined);
    return this.closePromise;
  }
}
