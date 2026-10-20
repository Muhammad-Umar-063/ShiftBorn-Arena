import assert from 'node:assert/strict';
import {
  AimSource,
  BALANCE,
  ClientMessageId,
  InputButton,
  decodeInputPacket,
  encodeInputPacket,
} from '../../../packages/shared/dist/index.js';

class SpikeQueue {
  constructor() {
    this.buffer = [];
    this.lastReceivedSeq = 0;
    this.lastApplied = null;
    this.appliedSeq = [];
    this.lastButtons = 0;
    this.rejectedFrames = 0;
    this.invalidMessages = 0;
    this.duplicates = 0;
    this.oldestDrops = 0;
    this.rateDrops = 0;
    this.frameTimes = [];
  }
  receive(messageId, packet, nowMs) {
    if (messageId !== ClientMessageId.Input) {
      this.invalidMessages += 1;
      return;
    }
    const decoded = decodeInputPacket(packet, this.lastReceivedSeq);
    if (!decoded.packetValid) {
      this.invalidMessages += 1;
      return;
    }
    this.rejectedFrames += decoded.rejectedFrames;
    for (const frame of [...decoded.frames].reverse()) {
      if (frame.seq <= this.lastReceivedSeq) {
        this.duplicates += 1;
        continue;
      }
      this.lastReceivedSeq = frame.seq;
      this.frameTimes = this.frameTimes.filter((time) => nowMs - time < 1000);
      if (this.frameTimes.length >= BALANCE.net.maxInputsPerS) {
        this.rateDrops += 1;
        continue;
      }
      this.frameTimes.push(nowMs);
      this.buffer.push(frame);
      if (this.buffer.length > BALANCE.net.inputBufferMax) {
        this.buffer.shift();
        this.oldestDrops += 1;
      }
    }
  }
  next() {
    const count = this.buffer.length >= 4 ? 2 : Math.min(1, this.buffer.length);
    let edges = 0;
    let frame = this.lastApplied;
    for (let i = 0; i < count; i += 1) {
      const current = this.buffer.shift();
      edges |= current.buttons & ~this.lastButtons;
      this.lastButtons = current.buttons;
      frame = current;
      this.appliedSeq.push(current.seq);
    }
    this.lastApplied = frame;
    return { frame, edges, consumed: count };
  }
}

function frame(seq, buttons = 0, moveX = 0, aimSource = AimSource.Mouse) {
  return { seq, buttons, moveX, moveY: 0, aim: 12345, aimSource };
}
function packet(...frames) {
  const encoded = encodeInputPacket(frames);
  if (encoded === null) throw new Error('invalid fixture');
  return encoded;
}

const loss = new SpikeQueue();
const prior = [];
for (let seq = 1; seq <= 11; seq += 1) {
  const current = frame(seq);
  prior.unshift(current);
  if (prior.length > 3) prior.pop();
  if (seq % 2 === 0) continue;
  loss.receive(ClientMessageId.Input, packet(...prior), seq * 33);
  while (loss.buffer.length > 0) loss.next();
}
assert.equal(loss.lastApplied.seq, 11);
assert.deepEqual(
  loss.appliedSeq,
  Array.from({ length: 11 }, (_, index) => index + 1),
);
assert.equal(loss.lastReceivedSeq, 11);
assert.equal(loss.duplicates > 0, true);

const catchup = new SpikeQueue();
for (let seq = 1; seq <= 6; seq += 1) {
  const buttons =
    seq === 1
      ? InputButton.Ability
      : seq === 2
        ? 0
        : seq === 3
          ? InputButton.MorphBeast
          : 0;
  catchup.receive(
    ClientMessageId.Input,
    packet(frame(seq, buttons, seq === 2 ? 127 : 0, AimSource.Keys)),
    seq * 100,
  );
}
const first = catchup.next();
assert.equal(first.consumed, 2);
assert.equal(first.frame.seq, 2);
assert.equal(first.frame.moveX, 127);
assert.equal(first.frame.aimSource, AimSource.Keys);
assert.equal(first.edges, InputButton.Ability);
const second = catchup.next();
assert.equal(second.consumed, 2);
assert.equal(second.edges, InputButton.MorphBeast);
const third = catchup.next();
assert.equal(third.consumed, 1);
assert.equal(catchup.next().consumed, 1);
const repeated = catchup.next();
assert.equal(repeated.consumed, 0);
assert.equal(repeated.frame.seq, 6);
assert.equal(repeated.edges, 0);

const overflow = new SpikeQueue();
for (let seq = 1; seq <= 10; seq += 1)
  overflow.receive(ClientMessageId.Input, packet(frame(seq)), seq * 100);
assert.equal(overflow.buffer.length, BALANCE.net.inputBufferMax);
assert.equal(overflow.oldestDrops, 2);

const rate = new SpikeQueue();
for (let seq = 1; seq <= 60; seq += 1)
  rate.receive(ClientMessageId.Input, packet(frame(seq)), 0);
assert.equal(rate.frameTimes.length, BALANCE.net.maxInputsPerS);
assert.equal(rate.rateDrops, 20);
rate.receive(255, packet(frame(61)), 0);
rate.receive(ClientMessageId.Input, [1, 2, 3], 0);
rate.receive(ClientMessageId.Input, [62, 1.2, 0, 0, 0, 0], 0);
assert.equal(rate.invalidMessages, 2);
assert.equal(rate.rejectedFrames, 1);

const reconnect = new SpikeQueue();
reconnect.receive(ClientMessageId.Input, packet(frame(100)), 0);
reconnect.next();
reconnect.receive(ClientMessageId.Input, packet(frame(101)), 100);
assert.equal(reconnect.next().frame.seq, 101);

process.stdout.write(
  JSON.stringify(
    {
      numericMessageId: ClientMessageId.Input,
      redundantPacketLength: packet(frame(3), frame(2), frame(1)).length,
      everySecondPacketDisruptedRecoveredThroughSeq: loss.lastReceivedSeq,
      recoveredExactlyOnceInOrder: loss.appliedSeq,
      duplicatesIgnored: loss.duplicates,
      catchupConsumed: [first.consumed, second.consumed, third.consumed],
      risingEdgeUnion: [first.edges, second.edges],
      repeatLastHasNoEdge: repeated.edges === 0,
      bufferMaximum: overflow.buffer.length,
      oldestDrops: overflow.oldestDrops,
      rateAccepted: rate.frameTimes.length,
      rateDrops: rate.rateDrops,
      invalidMessages: rate.invalidMessages,
      invalidFrames: rate.rejectedFrames,
      reconnectSeqContinued: reconnect.lastApplied.seq,
    },
    null,
    2,
  ) + '\n',
);
