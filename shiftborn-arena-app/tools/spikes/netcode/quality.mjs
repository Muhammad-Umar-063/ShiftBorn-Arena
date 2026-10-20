import assert from 'node:assert/strict';
import { createServer as createTcpServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import {
  Room,
  Server,
} from '../../../apps/server/node_modules/@colyseus/core/build/index.mjs';
import { WebSocketTransport } from '../../../apps/server/node_modules/@colyseus/ws-transport/build/index.mjs';
import { Client } from '../../../apps/client/node_modules/@colyseus/sdk/build/index.mjs';
import {
  AimSource,
  BALANCE,
  ClientMessageId,
  Form,
  GREYBOX_V1,
  InputButton,
  Mode,
  Phase,
  decodeInputPacket,
  encodeInputPacket,
} from '../../../packages/shared/dist/index.js';
import {
  addPlayer,
  createWorld,
  step,
} from '../../../packages/sim/dist/index.js';

const [rttText = '150', secondsText = '5', lossText = '0'] =
  process.argv.slice(2);
const rttMs = Number(rttText);
const durationS = Number(secondsText);
const lossPercent = Number(lossText);
assert.ok([0, 100, 150, 200].includes(rttMs));
assert.ok(durationS >= 5);
assert.ok(lossPercent === 0 || lossPercent === 2);
const stepMs = 1000 / BALANCE.tick.rateHz;
const MAP = { ...GREYBOX_V1, id: 'spike_open', walls: [], cover: [] };
const PLAYER = { id: 'quality-player', name: 'Quality', isBot: false, seat: 0 };

function makeWorld() {
  const world = createWorld({ map: MAP, roomSeed: 2020, mode: Mode.Frenzy });
  addPlayer(world, PLAYER);
  world.phase = Phase.Playing;
  world.phaseEndTick = 100000;
  const player = world.players[0];
  if (!player) throw new Error('missing player');
  player.pos = { x: 0, y: 0 };
  player.protectedEndTick = 0;
  return world;
}

function scenario(seq) {
  const second = seq / BALANCE.tick.rateHz;
  if (second < 10) return 'walking and direction changes';
  if (second < 22) return 'walking with Dash';
  if (second < 40) return 'morphing with movement';
  return 'movement, morphing, and Dash';
}

function frameFor(seq) {
  const second = seq / BALANCE.tick.rateHz;
  const period = Math.floor(second / 2) % 4;
  const moves = [
    [127, 0],
    [0, 127],
    [-127, 0],
    [0, -127],
  ];
  const [moveX, moveY] = moves[period];
  let buttons = 0;
  if (
    [12, 18, 42, 49, 56].includes(Math.floor(second)) &&
    seq % BALANCE.tick.rateHz === 0
  )
    buttons |= InputButton.Ability;
  if (
    [23, 34, 52].includes(Math.floor(second)) &&
    seq % BALANCE.tick.rateHz === 0
  )
    buttons |= InputButton.MorphBeast;
  if (
    [27, 38, 54].includes(Math.floor(second)) &&
    seq % BALANCE.tick.rateHz === 0
  )
    buttons |= InputButton.MorphRunner;
  return {
    seq,
    moveX,
    moveY,
    aim: (seq * 811) % 65536,
    buttons,
    aimSource: AimSource.Mouse,
  };
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

const spikeRooms = { active: null };
class QualityRoom extends Room {
  onCreate() {
    spikeRooms.active = this;
    this.autoDispose = false;
    this.world = makeWorld();
    this.queue = [];
    this.receivedSeq = 0;
    this.lastApplied = null;
    this.received = [];
    this.applied = [];
    this.duplicates = 0;
    this.overflowDrops = 0;
    this.invalid = 0;
    this.onMessage(ClientMessageId.Input, (_client, payload) => {
      const result = decodeInputPacket(payload, this.receivedSeq);
      if (!result.packetValid) {
        this.invalid += 1;
        return;
      }
      this.invalid += result.rejectedFrames;
      for (const frame of [...result.frames].reverse()) {
        if (frame.seq <= this.receivedSeq) {
          this.duplicates += 1;
          continue;
        }
        this.queue.push(frame);
        this.received.push(frame.seq);
        this.receivedSeq = frame.seq;
        if (this.queue.length > BALANCE.net.inputBufferMax) {
          this.queue.shift();
          this.overflowDrops += 1;
        }
      }
    });
    this.setFixedTimestep(() => {
      const fresh = this.queue.shift();
      if (fresh) {
        this.lastApplied = fresh;
        this.applied.push(fresh.seq);
      }
      step(this.world, [fresh ?? this.lastApplied].filter(Boolean), {});
      if (this.world.tick % 2 === 0) {
        const player = this.world.players[0];
        const snapshot = {
          tick: this.world.tick,
          ack: player?.lastInputSeq ?? 0,
          player: structuredClone(player),
        };
        for (const client of this.clients) client.send(200, snapshot);
      }
    }, BALANCE.tick.rateHz);
  }
}

let seed = 0x51f7;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

function distribution(values) {
  if (values.length === 0) return { min: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    min: sorted[0],
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted.at(-1),
  };
}

async function main() {
  const port = await freePort();
  const server = new Server({
    greet: false,
    gracefullyShutdown: false,
    transport: new WebSocketTransport(),
  });
  server.define('quality_spike', QualityRoom);
  const timers = new Set();
  let room;
  try {
    await server.listen(port, '127.0.0.1');
    const client = new Client(`ws://127.0.0.1:${port}`);
    room = await client.joinOrCreate('quality_spike');
    const predicted = makeWorld();
    const history = new Map();
    const recent = [];
    const errors = [];
    const qualifying = [];
    let corrections = 0;
    let outboundHeld = 0;
    let inboundHeld = 0;
    let outboundDue = 0;
    let inboundDue = 0;
    let sent = 0;
    let snapshots = 0;
    let replayEffects = 0;
    const started = performance.now();
    const schedule = (fn, due) => {
      const timer = setTimeout(
        () => {
          timers.delete(timer);
          fn();
        },
        Math.max(0, due - performance.now()),
      );
      timers.add(timer);
    };
    room.onMessage(200, (snapshot) => {
      const selected = lossPercent > 0 && random() < lossPercent / 100;
      if (selected) inboundHeld += 1;
      inboundDue = Math.max(
        inboundDue,
        performance.now() + rttMs / 2 + (selected ? 200 : 0),
      );
      schedule(() => {
        const current = predicted.players[0];
        if (!current) return;
        if (snapshot.ack > sent || snapshot.tick > 100000)
          throw new Error('invalid snapshot');
        const displayed = { ...current.pos };
        predicted.players[0] = snapshot.player;
        predicted.tick = snapshot.tick;
        for (const [seq, frame] of history) {
          if (seq <= snapshot.ack) history.delete(seq);
          else {
            const replayEvents = step(predicted, [frame], {});
            replayEffects += replayEvents.filter(
              (event) => event.type === 'abilityStart',
            ).length;
          }
        }
        const next = predicted.players[0];
        const error = Math.hypot(
          displayed.x - next.pos.x,
          displayed.y - next.pos.y,
        );
        const sampleMs = performance.now() - started;
        if (sampleMs <= durationS * 1000) {
          errors.push(error);
          corrections += 1;
        }
        if (sampleMs <= durationS * 1000 && error >= BALANCE.net.smoothErrorM) {
          qualifying.push({
            ms: Math.round(sampleMs),
            seq: sent,
            ack: snapshot.ack,
            error,
            scenario: scenario(sent),
          });
        }
        snapshots += 1;
      }, inboundDue);
    });
    const count = Math.round(durationS * BALANCE.tick.rateHz);
    for (let seq = 1; seq <= count; seq += 1) {
      const due = started + (seq - 1) * stepMs;
      await sleep(Math.max(0, due - performance.now()));
      const frame = frameFor(seq);
      history.set(seq, frame);
      recent.unshift(frame);
      if (recent.length > 3) recent.pop();
      step(predicted, [frame], {});
      sent = seq;
      const packet = encodeInputPacket(recent);
      if (!packet) throw new Error('invalid generated packet');
      const selected = lossPercent > 0 && random() < lossPercent / 100;
      if (selected) outboundHeld += 1;
      outboundDue = Math.max(
        outboundDue,
        performance.now() + rttMs / 2 + (selected ? 200 : 0),
      );
      schedule(() => room.send(ClientMessageId.Input, packet), outboundDue);
    }
    await sleep(Math.max(0, started + durationS * 1000 - performance.now()));
    const measuredWindowMs = performance.now() - started;
    await sleep(rttMs + 400);
    const stats = {
      rttMs,
      oneWayDelayMs: rttMs / 2,
      lossPercent,
      durationMs: measuredWindowMs,
      scriptedDurationMs: durationS * 1000,
      playerMinutes: durationS / 60,
      sentFrames: sent,
      receivedUniqueFrames: spikeRooms.active.received.length,
      appliedFrames: spikeRooms.active.applied.length,
      duplicates: spikeRooms.active.duplicates,
      overflowDrops: spikeRooms.active.overflowDrops,
      invalidFrames: spikeRooms.active.invalid,
      snapshots,
      corrections,
      qualifyingCorrections: qualifying.length,
      qualifyingPerPlayerMinute: qualifying.length / (durationS / 60),
      distributionM: distribution(errors),
      qualifyingSamples: qualifying.slice(0, 30),
      outboundHolSelections: outboundHeld,
      inboundHolSelections: inboundHeld,
      replaySuppressedPresentationEffects: replayEffects,
      finalServer: {
        tick: spikeRooms.active.world.tick,
        pos: spikeRooms.active.world.players[0]?.pos,
        form: spikeRooms.active.world.players[0]?.form,
        abilityReady:
          spikeRooms.active.world.players[0]?.abilityReadyTick[Form.Runner],
      },
      finalPredicted: {
        tick: predicted.tick,
        pos: predicted.players[0]?.pos,
        form: predicted.players[0]?.form,
        abilityReady: predicted.players[0]?.abilityReadyTick[Form.Runner],
      },
    };
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
    await room.leave(true);
    room = undefined;
  } finally {
    for (const timer of timers) clearTimeout(timer);
    if (room?.connection.isOpen) await room.leave(true).catch(() => {});
    await server.gracefullyShutdown(false);
  }
}
await main();
