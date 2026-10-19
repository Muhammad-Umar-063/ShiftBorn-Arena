import { describe, expect, it } from 'vitest';
import {
  AbilityId,
  AimSource,
  Cause,
  ClientAimSourceCode,
  ClientMessageId,
  CloseCode,
  DamageTag,
  EventId,
  Form,
  InputButton,
  MorphDenialReason,
  Phase,
  PROTOCOL_VERSION,
  ServerMessageId,
  UNUSED_BUTTON_MASK,
  VALID_BUTTON_MASK,
  WeaponId,
  decodeInputPacket,
  encodeInputPacket,
  isValidClientInputFrame,
} from '../src/index.js';
import type { DeathEvent, EncodedEvent, InputFrame } from '../src/index.js';

function frame(seq: number, overrides: Partial<InputFrame> = {}): InputFrame {
  return {
    seq,
    moveX: -12,
    moveY: 34,
    aim: 12345,
    buttons: InputButton.Fire | InputButton.Crate,
    aimSource: AimSource.Mouse,
    ...overrides,
  };
}

function packetFrame(values: readonly unknown[]): readonly unknown[] {
  return values;
}

describe('AT-NET-01 input encoding', () => {
  it.each([1, 2, 3])(
    'round-trips exactly %i frame(s) newest first',
    (count) => {
      const frames = Array.from({ length: count }, (_, index) =>
        frame(100 - index),
      );
      const packet = encodeInputPacket(frames);
      expect(packet).not.toBeNull();
      expect(packet).toHaveLength(count * 6);
      expect(packet?.filter((_, index) => index % 6 === 0)).toEqual(
        frames.map(({ seq }) => seq),
      );
      expect(decodeInputPacket(packet)).toEqual({
        frames,
        rejectedFrames: 0,
        packetValid: true,
      });
    },
  );

  it('rejects non-newest-first encoding without reordering', () => {
    expect(encodeInputPacket([frame(1), frame(2)])).toBeNull();
  });

  it('accepts minimum and maximum valid wire values', () => {
    const lowest = frame(1, { moveX: -127, moveY: -127, aim: 0, buttons: 0 });
    const highest = frame(4_294_967_295, {
      moveX: 127,
      moveY: 127,
      aim: 65535,
      buttons: VALID_BUTTON_MASK,
      aimSource: AimSource.Pad,
    });
    for (const value of [lowest, highest]) {
      const packet = encodeInputPacket([value]);
      expect(decodeInputPacket(packet).frames).toEqual([value]);
    }
  });

  it.each([
    [AimSource.Mouse, ClientAimSourceCode.Mouse],
    [AimSource.Keys, ClientAimSourceCode.Keys],
    [AimSource.Lock, ClientAimSourceCode.Lock],
    [AimSource.Touch, ClientAimSourceCode.Touch],
    [AimSource.Pad, ClientAimSourceCode.Pad],
  ])('maps client aim source %s to wire code %i', (source, code) => {
    const value = frame(1, { aimSource: source });
    expect(encodeInputPacket([value])?.[5]).toBe(code);
    expect(decodeInputPacket([1, -12, 34, 12345, 33, code]).frames).toEqual([
      value,
    ]);
  });

  it('rejects Bot as client input while leaving it valid in InputFrame', () => {
    const botFrame: InputFrame = frame(1, { aimSource: AimSource.Bot });
    expect(encodeInputPacket([botFrame])).toBeNull();
    expect(isValidClientInputFrame(botFrame)).toBe(false);
  });

  it('round-trips all eight button bits, including reserved bits 5 to 7', () => {
    for (const button of Object.values(InputButton)) {
      const value = frame(1, { buttons: button });
      expect(decodeInputPacket(encodeInputPacket([value])).frames).toEqual([
        value,
      ]);
    }
    expect(VALID_BUTTON_MASK).toBe(0x00ff);
    expect(UNUSED_BUTTON_MASK).toBe(0xff00);
  });

  it('accepts sequence distance exactly 1000 and rejects 1001', () => {
    expect(
      decodeInputPacket(encodeInputPacket([frame(1001)]), 1).frames,
    ).toHaveLength(1);
    expect(
      decodeInputPacket(encodeInputPacket([frame(1002)]), 1),
    ).toMatchObject({
      frames: [],
      rejectedFrames: 1,
    });
    expect(isValidClientInputFrame(frame(1), 1001)).toBe(true);
    expect(isValidClientInputFrame(frame(1), 1002)).toBe(false);
    expect(isValidClientInputFrame(frame(1), 0)).toBe(true);
  });

  it('is deterministic and does not mutate input frames or arrays', () => {
    const first = Object.freeze(frame(3));
    const second = Object.freeze(frame(2));
    const frames = Object.freeze([first, second]);
    const before = JSON.stringify(frames);
    const packetA = encodeInputPacket(frames);
    const packetB = encodeInputPacket(frames);
    expect(packetA).toEqual(packetB);
    expect(JSON.stringify(frames)).toBe(before);
    expect(decodeInputPacket(packetA)).toEqual(decodeInputPacket(packetB));
  });

  it.each([null, undefined, 'packet', {}, 4])(
    'rejects non-array input %s safely',
    (value) => {
      expect(() => decodeInputPacket(value)).not.toThrow();
      expect(decodeInputPacket(value)).toEqual({
        frames: [],
        rejectedFrames: 0,
        packetValid: false,
      });
    },
  );

  it.each([
    [],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 1],
    Array.from({ length: 19 }, () => 0),
    Array.from({ length: 24 }, () => 0),
  ])('rejects malformed packet length safely', (packet) => {
    expect(() => decodeInputPacket(packet)).not.toThrow();
    expect(decodeInputPacket(packet).packetValid).toBe(false);
  });

  it('rejects more than three frames on encode', () => {
    expect(
      encodeInputPacket([frame(4), frame(3), frame(2), frame(1)]),
    ).toBeNull();
    expect(encodeInputPacket([])).toBeNull();
  });

  it('drops a bad middle frame while keeping valid siblings identifiable', () => {
    const packet = [3, 0, 0, 0, 0, 0, 2, 0, 0, 'bad', 0, 0, 1, 0, 0, 0, 0, 0];
    expect(decodeInputPacket(packet)).toEqual({
      frames: [
        frame(3, { moveX: 0, moveY: 0, aim: 0, buttons: 0 }),
        frame(1, { moveX: 0, moveY: 0, aim: 0, buttons: 0 }),
      ],
      rejectedFrames: 1,
      packetValid: true,
    });
  });

  it.each([
    [undefined, 5, 0, 0, 0, 0],
    [null, 0, 0, 0, 0, 0],
    ['1', 0, 0, 0, 0, 0],
    [1, NaN, 0, 0, 0, 0],
    [1, Infinity, 0, 0, 0, 0],
    [1, 0.5, 0, 0, 0, 0],
    [1, 0, 0, 0.5, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [-1, 0, 0, 0, 0, 0],
    [4_294_967_296, 0, 0, 0, 0, 0],
    [1, -128, 0, 0, 0, 0],
    [1, 128, 0, 0, 0, 0],
    [1, 0, -128, 0, 0, 0],
    [1, 0, 128, 0, 0, 0],
    [1, 0, 0, -1, 0, 0],
    [1, 0, 0, 65536, 0, 0],
    [1, 0, 0, 0, -1, 0],
    [1, 0, 0, 0, 65536, 0],
    [1, 0, 0, 0, 0, 5],
  ])('rejects invalid wire field values without throwing', (...values) => {
    expect(() => decodeInputPacket(packetFrame(values))).not.toThrow();
    expect(decodeInputPacket(packetFrame(values))).toMatchObject({
      frames: [],
      rejectedFrames: 1,
      packetValid: true,
    });
  });

  it('rejects every unused button bit 8 through 15', () => {
    for (let bit = 8; bit <= 15; bit += 1) {
      expect(decodeInputPacket([1, 0, 0, 0, 1 << bit, 0]).rejectedFrames).toBe(
        1,
      );
    }
  });

  it('rejects invalid in-memory values without coercing them', () => {
    expect(isValidClientInputFrame({ ...frame(1), moveX: '2' })).toBe(false);
    expect(isValidClientInputFrame({ ...frame(1), aim: Infinity })).toBe(false);
    expect(isValidClientInputFrame({ ...frame(1), buttons: 256 })).toBe(false);
    expect(isValidClientInputFrame({ ...frame(1), aimSource: 'unknown' })).toBe(
      false,
    );
  });
});

describe('AT-NET-01 protocol constants and event tuples', () => {
  it('uses the exact initial version and message IDs', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(Object.values(ClientMessageId)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(Object.values(ServerMessageId)).toEqual([
      100, 101, 102, 103, 104, 105, 106, 107,
    ]);
  });

  it('uses the exact event, tag, denial and close codes', () => {
    expect(Object.values(EventId)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
    expect(DamageTag).toEqual({ Effective: 1, Resisted: 2, Armor: 4 });
    expect(MorphDenialReason).toEqual({
      Cooldown: 0,
      Flux: 1,
      Busy: 2,
      Phase: 3,
    });
    expect(CloseCode).toEqual({
      VersionMismatch: 4000,
      RoomFull: 4001,
      InvalidRoomCode: 4002,
      InvalidInput: 4003,
      ServerShuttingDown: 4004,
      InternalRoomError: 4010,
    });
  });

  it('types all 30 event tuples and variable death assists without any', () => {
    type IsAny<T> = 0 extends 1 & T ? true : false;
    const eventIsAny: IsAny<EncodedEvent> = false;
    const death: DeathEvent = [
      EventId.Death,
      0,
      1,
      Cause.PulsePistol,
      Form.Runner,
      Form.Beast,
      25,
      Form.Turret,
      2,
      3,
    ];
    const events: readonly EncodedEvent[] = [
      [
        EventId.ProjectileSpawn,
        'p',
        1,
        WeaponId.PulsePistol,
        0,
        0,
        0,
        1,
        0,
        1,
        0,
      ],
      [EventId.ProjectileHit, 'p', 2, 10, DamageTag.Effective, 0, 0],
      [EventId.ProjectileImpact, 'p', 0, 0],
      [EventId.ProjectileExpire, 'p'],
      [EventId.Blocked, 'p', 2],
      [EventId.MorphStart, 1, Form.Runner, Form.Beast, 10],
      [EventId.MorphEnd, 1, Form.Beast],
      [EventId.MorphDenied, 1, Form.Turret, MorphDenialReason.Flux],
      [EventId.AbilityStart, 1, AbilityId.Dash, 1, 2, 1, 0],
      [EventId.AbilityEnd, 1, AbilityId.Dash, 0],
      [EventId.AbilityHit, 1, AbilityId.RamCharge, 2, 10, DamageTag.Resisted],
      [EventId.RailShotFired, 1, 0, 0, 1, 1],
      [EventId.Stun, 1, 10],
      [EventId.Knockback, 1, 1, 0, 10],
      [EventId.Overheat, 1, 10],
      death,
      [EventId.Spawn, 1, 0, 0, 10],
      [EventId.Respawn, 1, 0, 0, 10],
      [EventId.ShardSpawn, 's'],
      [EventId.ShardPickup, 's', 1, 10],
      [EventId.ShardExpire, 's'],
      [EventId.ClusterAnnounce, 1, 10],
      [EventId.CoverDestroyed, 1],
      [EventId.CoverRebuilt, 1],
      [EventId.ZoneAnnounce, 1, 10],
      [EventId.ZoneMoved, 1],
      [EventId.ZoneState, 1, -1],
      [EventId.Phase, Phase.Playing, 10],
      [EventId.MatchEnd, [1, 2]],
      [EventId.BotReplaced, 1, 'player-id'],
    ];
    expect(eventIsAny).toBe(false);
    expect(events.map((event) => event[0])).toEqual(Object.values(EventId));
    expect(death.slice(-2)).toEqual([2, 3]);
  });
});
