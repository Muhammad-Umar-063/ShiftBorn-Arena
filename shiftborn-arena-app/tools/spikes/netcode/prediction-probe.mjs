import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createServer as createTcpServer } from 'node:net';
import {
  Room,
  Server,
} from '../../../apps/server/node_modules/@colyseus/core/build/index.mjs';
import { WebSocketTransport } from '../../../apps/server/node_modules/@colyseus/ws-transport/build/index.mjs';
import {
  Schema,
  defineTypes,
} from '../../../apps/server/node_modules/@colyseus/schema/build/index.mjs';
import { Client } from '../../../apps/client/node_modules/@colyseus/sdk/build/index.mjs';
import { Predict } from '../../../apps/client/node_modules/@colyseus/sdk/build/predict.mjs';
import {
  AimSource,
  BALANCE,
  GREYBOX_V1,
  InputButton,
  Mode,
  Phase,
} from '../../../packages/shared/dist/index.js';
import {
  addPlayer,
  createWorld,
  step,
} from '../../../packages/sim/dist/index.js';

const MAP = {
  ...GREYBOX_V1,
  id: 'prediction_spike_open',
  walls: [],
  cover: [],
};
const PLAYER = { id: 'predict-player', name: 'Predict', isBot: false, seat: 0 };
function makeWorld() {
  const world = createWorld({ map: MAP, roomSeed: 313, mode: Mode.Frenzy });
  addPlayer(world, PLAYER);
  world.phase = Phase.Playing;
  world.phaseEndTick = 10000;
  world.players[0].pos = { x: 0, y: 0 };
  world.players[0].protectedEndTick = 0;
  return world;
}
class SpikeInput extends Schema {}
defineTypes(SpikeInput, {
  moveX: 'int8',
  moveY: 'int8',
  aim: 'uint16',
  buttons: 'uint16',
  aimSource: 'uint8',
});
class SpikeState extends Schema {}
defineTypes(SpikeState, { tick: 'uint32', playerJson: 'string' });
const spikeRooms = { server: null };
class PredictionRoom extends Room {
  onCreate() {
    spikeRooms.server = this;
    this.autoDispose = false;
    this.world = makeWorld();
    this.state = new SpikeState();
    this.state.tick = 0;
    this.state.playerJson = JSON.stringify(this.world.players[0]);
    this.patchRate = 50;
    this.inputs = this.defineInput(SpikeInput, { bufferMaxSize: 8 });
    this.lastFrame = null;
    this.setFixedTimestep(() => {
      for (const client of this.clients) {
        const accessor = this.inputs.get(client.sessionId);
        const input = accessor.next();
        if (input) {
          this.lastFrame = {
            seq: accessor.consumedCount,
            moveX: input.moveX,
            moveY: input.moveY,
            aim: input.aim,
            buttons: input.buttons,
            aimSource: AimSource.Mouse,
          };
        }
      }
      step(this.world, this.lastFrame ? [this.lastFrame] : [], {});
      this.state.tick = this.world.tick;
      this.state.playerJson = JSON.stringify(this.world.players[0]);
    }, BALANCE.tick.rateHz);
  }
  onDrop(client) {
    this.allowReconnection(client, BALANCE.net.reconnectS);
  }
}
async function freePort() {
  const socket = createTcpServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (typeof address !== 'object' || address === null)
    throw new Error('missing port');
  await new Promise((resolve) => socket.close(resolve));
  return address.port;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function visualCorrection(x, y, elapsedMs) {
  const magnitude = Math.hypot(x, y);
  if (magnitude >= BALANCE.net.smoothErrorM) {
    return { snap: true, offset: { x: 0, y: 0 } };
  }
  const remaining = Math.max(0, 1 - elapsedMs / BALANCE.net.smoothMs);
  return { snap: false, offset: { x: x * remaining, y: y * remaining } };
}
assert.deepEqual(visualCorrection(0.499, 0, BALANCE.net.smoothMs), {
  snap: false,
  offset: { x: 0, y: 0 },
});
assert.deepEqual(visualCorrection(0.5, 0, 0), {
  snap: true,
  offset: { x: 0, y: 0 },
});

async function main() {
  const port = await freePort();
  const server = new Server({
    greet: false,
    gracefullyShutdown: false,
    transport: new WebSocketTransport(),
  });
  server.define('prediction_spike', PredictionRoom);
  let room;
  let ticker;
  try {
    await server.listen(port, '127.0.0.1');
    room = await new Client(`ws://127.0.0.1:${port}`).joinOrCreate(
      'prediction_spike',
    );
    const input = room.input({ type: SpikeInput, mode: 'reliable' });
    const predict = Predict.get(room);
    const local = makeWorld();
    const corrections = [];
    let replaySteps = 0;
    let replayAbilityEvents = 0;
    let liveEffects = 0;
    let sim;
    sim = predict.sim({
      input,
      world: { world: local },
      adopt: ({ world }) => {
        world.players[0] = JSON.parse(room.state.playerJson);
        world.tick = room.state.tick;
      },
      pose: ({ world }) => ({
        x: world.players[0].pos.x,
        y: world.players[0].pos.y,
      }),
      step: (ctx, { world }, command) => {
        assert.equal(ctx.dt, 1 / BALANCE.tick.rateHz);
        if (ctx.isReplay) replaySteps += 1;
        const frame = {
          seq: ctx.tick,
          moveX: command.moveX,
          moveY: command.moveY,
          aim: command.aim,
          buttons: command.buttons,
          aimSource: AimSource.Mouse,
        };
        const events = step(world, [frame], {});
        if (ctx.isReplay)
          replayAbilityEvents += events.filter(
            (event) => event.type === 'abilityStart',
          ).length;
        if (!ctx.isReplay)
          liveEffects += events.filter(
            (event) => event.type === 'abilityStart',
          ).length;
      },
      smoothMs: 0,
      warnOnDivergence: 0,
      onReconcile: (acked) => {
        const x = sim.lastCorrection.x ?? 0;
        const y = sim.lastCorrection.y ?? 0;
        const euclidean = Math.hypot(x, y);
        corrections.push({
          acked,
          x,
          y,
          euclidean,
          snap: euclidean >= BALANCE.net.smoothErrorM,
        });
      },
    });
    ticker = setInterval(() => predict.tick(performance.now()), 16);
    for (let seq = 1; seq <= 30; seq += 1) {
      input.data.moveX = seq <= 15 ? 127 : -127;
      input.data.aim = seq * 100;
      input.data.buttons = 0;
      input.send();
      await sleep(1000 / BALANCE.tick.rateHz);
    }
    await sleep(250);
    const adoptedAfterWalk = sim.world.world.players[0];
    assert.ok(corrections.length > 0);
    input.data.moveX = 0;
    input.data.buttons = InputButton.Ability;
    input.send();
    await sleep(40);
    input.data.buttons = 0;
    input.send();
    await sleep(300);
    // Settle the last held movement and re-seed from the decoded truth before
    // testing the exact threshold without residual movement drift.
    input.send();
    await sleep(350);
    sim.reset();
    const beforeBoundaryCount = corrections.length;
    const serverPlayer = spikeRooms.server.world.players[0];
    serverPlayer.pos.x =
      sim.world.world.players[0].pos.x + BALANCE.net.smoothErrorM;
    serverPlayer.alive = false;
    serverPlayer.heat = 3;
    spikeRooms.server.state.playerJson = JSON.stringify(serverPlayer);
    input.send();
    await sleep(220);
    const boundary = corrections
      .slice(beforeBoundaryCount)
      .find(
        (item) => Math.abs(item.euclidean - BALANCE.net.smoothErrorM) < 1e-6,
      );
    const discrete = sim.world.world.players[0];
    const afterInjection = {
      corrections: corrections.slice(beforeBoundaryCount),
      exactBoundaryDetected: boundary !== undefined,
      alive: discrete.alive,
      heat: discrete.heat,
      serverAlive: spikeRooms.server.world.players[0].alive,
      serverHeat: spikeRooms.server.world.players[0].heat,
      decodedAlive: JSON.parse(room.state.playerJson).alive,
      decodedHeat: JSON.parse(room.state.playerJson).heat,
      decodedTick: room.state.tick,
      serverTick: spikeRooms.server.world.tick,
    };
    sim.reset();
    assert.equal(liveEffects, 1);
    assert.equal(afterInjection.exactBoundaryDetected, true);
    assert.equal(afterInjection.alive, false);
    const deathReset = {
      alive: sim.world.world.players[0].alive,
      pending: sim.pendingCount,
    };
    serverPlayer.alive = true;
    serverPlayer.pos = { x: 5, y: 0 };
    serverPlayer.heat = 0;
    spikeRooms.server.state.playerJson = JSON.stringify(serverPlayer);
    input.send();
    await sleep(220);
    sim.reset();
    const respawnReset = {
      alive: sim.world.world.players[0].alive,
      pending: sim.pendingCount,
    };
    assert.equal(respawnReset.alive, true);
    assert.equal(respawnReset.pending, 0);
    room.reconnection.minUptime = 0;
    room.reconnection.delay = 500;
    room.reconnection.minDelay = 500;
    room.reconnection.maxDelay = 8000;
    room.reconnection.backoff = (attempt) =>
      Math.min(500 * 2 ** Math.max(0, attempt - 1), 8000);
    room.connection.close();
    await sleep(1600);
    assert.equal(room.connection.isOpen, true);
    sim.reset();
    const reconnectReset = {
      alive: sim.world.world.players[0].alive,
      pending: sim.pendingCount,
    };
    assert.equal(reconnectReset.alive, true);
    assert.equal(reconnectReset.pending, 0);
    const summary = {
      helper: 'Predict.sim',
      advertisedStepSeconds: input.stepSeconds,
      reconciles: corrections.length,
      replaySteps,
      liveEffects,
      replayAbilityEvents,
      smallCorrectionAtZeroMs: visualCorrection(0.499, 0, 0),
      smallCorrectionAt100Ms: visualCorrection(0.499, 0, BALANCE.net.smoothMs),
      boundaryCorrection: visualCorrection(0.5, 0, 0),
      adoptedPositionAfterWalk: adoptedAfterWalk.pos,
      afterInjection,
      deathReset,
      respawnReset,
      reconnectReset,
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    await room.leave(true);
    room = undefined;
  } finally {
    if (ticker) clearInterval(ticker);
    if (room?.connection.isOpen) await room.leave(true).catch(() => {});
    await server.gracefullyShutdown(false);
  }
}
await main();
