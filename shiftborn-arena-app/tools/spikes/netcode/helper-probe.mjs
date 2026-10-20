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
import { PredictedSpawns } from '../../../apps/client/node_modules/@colyseus/sdk/build/predict.mjs';
import {
  BALANCE,
  ClientMessageId,
  encodeInputPacket,
  decodeInputPacket,
} from '../../../packages/shared/dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const socket = createTcpServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (typeof address !== 'object' || address === null)
    throw new Error('missing port');
  await new Promise((resolve) => socket.close(resolve));
  return address.port;
}

class SpikeInput extends Schema {}
defineTypes(SpikeInput, {
  seq: 'uint32',
  moveX: 'int8',
  moveY: 'int8',
  aim: 'uint16',
  buttons: 'uint16',
  aimSource: 'uint8',
});
class SpikeState extends Schema {}
defineTypes(SpikeState, { tick: 'uint32', x: 'number', ack: 'uint32' });

const spikeRooms = { active: null, expiry: null };
class HelperRoom extends Room {
  onCreate() {
    spikeRooms.active = this;
    this.autoDispose = false;
    this.state = new SpikeState();
    this.state.tick = 0;
    this.state.x = 0;
    this.state.ack = 0;
    this.patchRate = 50;
    this.seen = [];
    this.numericPackets = [];
    this.stepTimes = [];
    this.dropCount = 0;
    this.reconnectCount = 0;
    this.leaveCount = 0;
    this.player = {
      id: 'seat-player',
      seat: 0,
      controller: 'human',
      stats: { kos: 3 },
    };
    this.inputs = this.defineInput(SpikeInput, {
      seqField: 'seq',
      bufferMaxSize: 8,
      sanitize: { aimSource: [0, 4] },
    });
    this.rewindCallable =
      typeof this.allowRewindState({ maxRewindMs: 500 }).at === 'function';
    this.onMessage(ClientMessageId.Input, (client, payload) => {
      this.numericPackets.push({ sessionId: client.sessionId, payload });
    });
    this.setFixedTimestep((ctx) => {
      this.stepTimes.push({
        tick: ctx.tick,
        dt: ctx.dt,
        at: performance.now(),
      });
      for (const client of this.clients) {
        const accessor = this.inputs.get(client.sessionId);
        const input = accessor.next();
        if (input !== undefined) {
          this.seen.push({
            seq: input.seq,
            moveX: input.moveX,
            aimSource: input.aimSource,
            ack: accessor.consumedCount,
          });
          this.state.x += (input.moveX / 127) * ctx.dt;
          this.state.ack = input.seq;
        }
      }
      this.state.tick = ctx.tick;
      if (ctx.tick === 30) {
        const until = performance.now() + 235;
        while (performance.now() < until) {
          /* intentional hitch */
        }
      }
    }, BALANCE.tick.rateHz);
  }
  onDrop(client) {
    this.dropCount += 1;
    this.player.controller = 'proxy';
    this.allowReconnection(client, BALANCE.net.reconnectS);
  }
  onReconnect(client) {
    this.reconnectCount += 1;
    this.player.controller = 'human';
    client.send(200, {
      kind: 'welcome',
      playerId: this.player.id,
      seat: this.player.seat,
    });
  }
  onLeave() {
    this.leaveCount += 1;
  }
}

class ExpiryRoom extends Room {
  onCreate() {
    spikeRooms.expiry = this;
    this.autoDispose = false;
    this.drops = 0;
    this.leaves = 0;
  }
  onDrop(client) {
    this.drops += 1;
    // Accelerated expiry of the same public numeric-seconds API.
    this.allowReconnection(client, 0.4);
  }
  onLeave() {
    this.leaves += 1;
  }
}

function projectileProbe() {
  let now = 0;
  let onAdd;
  let onRemove;
  const rejected = [];
  const store = new PredictedSpawns(
    {
      owned: (server) => server.ownerSeat === 0,
      correlate: (local, server) =>
        local.inputSeq === server.inputSeq && local.shotIdx === server.shotIdx,
      ttl: () => 500,
      onReject: (local) => rejected.push(`${local.inputSeq}:${local.shotIdx}`),
      data: () => ({ visualX: 0 }),
    },
    { serverNow: () => now, smoothedRtt: () => 150 },
  );
  store.attach((add, remove) => {
    onAdd = add;
    onRemove = remove;
    return () => {};
  });
  const a = store.spawn({ inputSeq: 4, shotIdx: 0, x: 1 });
  const b = store.spawn({ inputSeq: 4, shotIdx: 1, x: 1 });
  const c = store.spawn({ inputSeq: 4, shotIdx: 2, x: 1 });
  const foreign = { id: 900, ownerSeat: 1, inputSeq: 4, shotIdx: 0, x: 9 };
  onAdd(foreign, foreign.id);
  const serverC = { id: 903, ownerSeat: 0, inputSeq: 4, shotIdx: 2, x: 2 };
  const serverA = { id: 901, ownerSeat: 0, inputSeq: 4, shotIdx: 0, x: 2 };
  onAdd(serverC, serverC.id);
  onAdd(serverA, serverA.id);
  assert.equal(store.entryFor(serverC)?.id, c.id);
  assert.equal(store.entryFor(serverA)?.id, a.id);
  assert.equal(store.entryFor(foreign)?.local, undefined);
  assert.equal(store.entryFor(serverA)?.data, a.data);
  onRemove(serverA, serverA.id);
  assert.equal(store.alive(a.id), false);
  now = 501;
  store.prune();
  assert.deepEqual(rejected, ['4:1']);
  assert.equal(store.alive(b.id), false);
  const handoffJumpM = Math.abs(store.value(store.entryFor(serverC), 'x') - 1);
  onRemove(serverC, serverC.id);
  onRemove(foreign, foreign.id);
  const removalKinds = ['hit', 'impact', 'expiry', 'blocked'];
  for (const [index, kind] of removalKinds.entries()) {
    const visual = store.spawn({ inputSeq: 10 + index, shotIdx: 0, x: 0 });
    const authoritative = {
      id: 910 + index,
      ownerSeat: 0,
      inputSeq: 10 + index,
      shotIdx: 0,
      x: 0,
    };
    onAdd(authoritative, authoritative.id);
    // The event adapter receives the authoritative id and removes that entry.
    onRemove(authoritative, authoritative.id);
    assert.equal(
      store.alive(visual.id),
      false,
      `${kind} did not remove its visual`,
    );
  }
  store.dispose();
  return {
    exactOutOfOrderMatch: true,
    foreignPreserved: true,
    stableRenderId: true,
    rejectedAtMs: now,
    removalKinds,
    handoffJumpM,
  };
}

async function main() {
  const port = await freePort();
  const server = new Server({
    greet: false,
    gracefullyShutdown: false,
    transport: new WebSocketTransport(),
  });
  server.define('helper_spike', HelperRoom);
  server.define('expiry_spike', ExpiryRoom);
  let room;
  try {
    await server.listen(port, '127.0.0.1');
    const client = new Client(`ws://127.0.0.1:${port}`);
    room = await client.joinOrCreate('helper_spike');
    const handle = room.input({ type: SpikeInput, mode: 'reliable' });
    assert.equal(handle.stepSeconds, 1 / BALANCE.tick.rateHz);
    handle.data.seq = 1;
    handle.data.moveX = 127;
    handle.send();
    handle.data.seq = 2;
    handle.send();
    handle.data.seq = 3;
    handle.data.aimSource = 99;
    handle.send();
    const packet = encodeInputPacket([
      { seq: 2, moveX: 0, moveY: 0, aim: 0, buttons: 0, aimSource: 'mouse' },
    ]);
    assert.deepEqual(
      decodeInputPacket(packet).frames.map((frame) => frame.seq),
      [2],
    );
    room.send(ClientMessageId.Input, packet);
    await sleep(1700);
    const numericPacketCount = spikeRooms.active.numericPackets.length;
    const fixed = spikeRooms.active.stepTimes;
    const gaps = fixed.slice(1).map((row, i) => row.at - fixed[i].at);
    let maxBurst = 1;
    let burst = 1;
    for (const gap of gaps) {
      burst = gap < 2 ? burst + 1 : 1;
      maxBurst = Math.max(maxBurst, burst);
    }
    const beforeDrop = room.sessionId;
    const defaultReconnect = {
      delay: room.reconnection.delay,
      minDelay: room.reconnection.minDelay,
      maxDelay: room.reconnection.maxDelay,
      minUptime: room.reconnection.minUptime,
    };
    room.reconnection.minUptime = 0;
    room.reconnection.delay = 500;
    room.reconnection.minDelay = 500;
    room.reconnection.maxDelay = 8000;
    room.reconnection.backoff = (attempt) =>
      Math.min(500 * 2 ** Math.max(0, attempt - 1), 8000);
    let clientDrops = 0;
    let clientReconnects = 0;
    let welcomes = 0;
    room.onMessage(200, () => {
      welcomes += 1;
    });
    room.onDrop(() => {
      clientDrops += 1;
    });
    room.onReconnect(() => {
      clientReconnects += 1;
    });
    room.connection.close();
    await sleep(1800);
    handle.data.seq = 4;
    handle.data.aimSource = 0;
    handle.send();
    await sleep(100);
    const expiryClient = new Client(`ws://127.0.0.1:${port}`);
    const expired = await expiryClient.joinOrCreate('expiry_spike');
    expired.reconnection.enabled = false;
    expired.connection.close();
    await sleep(750);
    const expiry = {
      drops: spikeRooms.expiry.drops,
      leaves: spikeRooms.expiry.leaves,
    };
    const consented = await expiryClient.joinOrCreate('expiry_spike');
    await consented.leave(true);
    expiry.consentedDrops = spikeRooms.expiry.drops;
    expiry.consentedLeaves = spikeRooms.expiry.leaves;
    const summary = {
      versions: { core: '0.18.18', sdk: '0.18.5', schema: '5.0.40' },
      fixed: {
        requestedHz: BALANCE.tick.rateHz,
        observedSteps: fixed.length,
        observedDurationMs: fixed.at(-1).at - fixed[0].at,
        dtMin: Math.min(...fixed.map((row) => row.dt)),
        dtMax: Math.max(...fixed.map((row) => row.dt)),
        jitterMs: { min: Math.min(...gaps), max: Math.max(...gaps) },
        maxObservedBurst: maxBurst,
      },
      input: {
        helperSeqSeen: spikeRooms.active.seen.map((row) => row.seq),
        sanitizedAimSources: spikeRooms.active.seen.map((row) => row.aimSource),
        numericPacketCount,
        helperStepSeconds: handle.stepSeconds,
      },
      reconnect: {
        defaultReconnect,
        configuredRetryMs: Array.from({ length: 7 }, (_, index) =>
          room.reconnection.backoff(index + 1, 500),
        ),
        clientDrops,
        clientReconnects,
        serverDrops: spikeRooms.active.dropCount,
        serverReconnects: spikeRooms.active.reconnectCount,
        welcomesAfterReconnect: welcomes,
        sameSession: room.sessionId === beforeDrop,
        serverLeaves: spikeRooms.active.leaveCount,
        seatRecord: spikeRooms.active.player,
        expiry,
      },
      projectiles: projectileProbe(),
      rewindCallable: spikeRooms.active.rewindCallable,
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    await room.leave(true);
    room = undefined;
  } finally {
    if (room) await room.leave(true).catch(() => {});
    await server.gracefullyShutdown(false);
  }
}
await main();
