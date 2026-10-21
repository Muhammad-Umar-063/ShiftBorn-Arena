import { EventId, Form, WeaponId } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { validateEventTuple } from '../src/net/eventValidation.js';
import type { EntitySnapshot, PlayerVisual } from '../src/render/entityState.js';
import { RemoteTimeline } from '../src/render/remoteTimeline.js';
import { capRemoteCatchup } from '../src/render/remoteCatchup.js';
import { WorldEventTimeline } from '../src/render/worldEventTimeline.js';

function player(id: string, seat: number, x = 0, y = 0,
  extra: Partial<PlayerVisual> = {}): PlayerVisual {
  return { id, name: id, seat, isBot: false, controller: 0,
    connected: true, alive: true, x, y, vx: 0, vy: 0, aim: 0,
    form: 0, hpFrac: 1, flux: 60, kos: 0, deaths: 0, assists: 0,
    points: 0, damageDealt: 0, lastInputSeq: 0,
    morphTarget: -1, morphEndTick: 0, abilityId: -1, abilityPhase: 0,
    abilityStartTick: 0, abilityEndTick: 0, stunEndTick: 0,
    knockbackEndTick: 0, protectedEndTick: 0, ...extra };
}
function snapshot(tick: number, remotes: readonly PlayerVisual[],
  local = player('local', 0)): EntitySnapshot {
  return { tick, matchId: 'match', localPlayerId: 'local',
    players: [local, ...remotes], shards: [], clusters: [], cover: [] };
}

describe('T-036 NETWORK_PROTOCOL §7 remote history', () => {
  it('caps network catch-up in the rendered pose without altering authority or respawn snaps', () => {
    const previous = player('remote', 1, 0);
    const target = player('remote', 1, 0.84);
    const displayed = capRemoteCatchup(previous, target);
    expect(displayed.x).toBeCloseTo(0.599);
    expect(target.x).toBe(0.84);
    expect(capRemoteCatchup(displayed, target).x).toBeCloseTo(0.84);
    expect(capRemoteCatchup(previous, player('remote', 1, 5.01)).x).toBe(5.01);
    expect(capRemoteCatchup(player('remote', 1, 0, 0, { alive: false }),
      player('remote', 1, 4)).x).toBe(4);
  });
  it('interpolates position and shortest-arc aim while switching discrete state at the exact tick', () => {
    const timeline = new RemoteTimeline();
    timeline.ingest(snapshot(10, [player('remote', 1, 0, 0,
      { aim: 350 * Math.PI / 180, form: 0, morphTarget: 1,
        abilityPhase: 0, alive: true })]), 100);
    timeline.ingest(snapshot(12, [player('remote', 1, 2, 4,
      { aim: 10 * Math.PI / 180, form: 1, morphTarget: -1,
        abilityPhase: 2, alive: false })]), 150);
    const middle = timeline.samplePlayer('remote', 11);
    expect(middle?.x).toBe(1);
    expect(middle?.y).toBe(2);
    expect(Math.cos(middle?.aim ?? NaN)).toBeCloseTo(1);
    expect(middle).toMatchObject({ form: 0, morphTarget: 1,
      abilityPhase: 0, alive: true });
    expect(timeline.samplePlayer('remote', 12)).toMatchObject({ x: 2, y: 4,
      form: 1, morphTarget: -1, abilityPhase: 2, alive: false });
  });

  it('prunes at one second, replaces duplicate ticks, and detaches source objects', () => {
    const timeline = new RemoteTimeline();
    const remote = { ...player('remote', 1, 1) };
    expect(timeline.ingest(snapshot(0, [remote]), 0)).toBe(true);
    expect(timeline.ingest(snapshot(0, [player('remote', 1, 2)]), 1)).toBe(true);
    expect(timeline.samples('remote')).toHaveLength(1);
    expect(timeline.samples('remote')[0]).toMatchObject({ tick: 0, receivedAtMs: 1 });
    remote.x = 99;
    expect(timeline.samplePlayer('remote', 0)?.x).toBe(2);
    for (let tick = 1; tick <= 45; tick += 1)
      timeline.ingest(snapshot(tick, [player('remote', 1, tick)]), tick * 10);
    expect(timeline.samples('remote')[0]?.tick).toBe(15);
    expect(timeline.samples('remote')).toHaveLength(31);
    expect(timeline.historySize).toBe(31);
    expect(timeline.ingest(snapshot(1, [player('remote', 1, 999)]), 500)).toBe(false);
  });

  it('caps velocity extrapolation at 100 ms and holds the endpoint', () => {
    const timeline = new RemoteTimeline();
    timeline.ingest(snapshot(10, [player('remote', 1, 1, 2,
      { vx: 6, vy: -3 })]), 100);
    expect(timeline.samplePlayer('remote', 11)?.x).toBeCloseTo(1.2);
    expect(timeline.samplePlayer('remote', 13)).toMatchObject({ x: 1.6, y: 1.7 });
    expect(timeline.samplePlayer('remote', 100)).toMatchObject({ x: 1.6, y: 1.7 });
    expect(timeline.samplePlayer('remote', 9)).toBeNull();
    expect(timeline.sample(Number.NaN)?.players.map((entry) => entry.id))
      .toEqual(['local', 'remote']);
  });

  it('uses strict >5 m snap and keeps true respawns discrete', () => {
    const exact = new RemoteTimeline();
    exact.ingest(snapshot(10, [player('remote', 1, 0)]), 100);
    exact.ingest(snapshot(12, [player('remote', 1, 5)]), 150);
    expect(exact.samplePlayer('remote', 11)?.x).toBe(2.5);
    const jump = new RemoteTimeline();
    jump.ingest(snapshot(10, [player('remote', 1, 0)]), 100);
    jump.ingest(snapshot(12, [player('remote', 1, 5.01)]), 150);
    expect(jump.samplePlayer('remote', 11)?.x).toBe(0);
    expect(jump.samplePlayer('remote', 12)?.x).toBe(5.01);
    const respawn = new RemoteTimeline();
    respawn.ingest(snapshot(10, [player('remote', 1, 0, 0,
      { alive: false })]), 100);
    respawn.ingest(snapshot(12, [player('remote', 1, 4, 0,
      { alive: true })]), 150);
    expect(respawn.samplePlayer('remote', 11)).toMatchObject({ x: 0, alive: false });
    expect(respawn.samplePlayer('remote', 12)).toMatchObject({ x: 4, alive: true });
  });

  it('never blends different stable IDs in one seat or exposes their future state', () => {
    const timeline = new RemoteTimeline();
    timeline.ingest(snapshot(10, [player('old', 1, 0)]), 100);
    timeline.ingest(snapshot(12, [player('new', 1, 4)]), 150);
    expect(timeline.sample(11)?.players.map((entry) => entry.id)).toEqual(['local', 'old']);
    expect(timeline.sample(12)?.players.map((entry) => entry.id)).toEqual(['local', 'new']);
    expect(timeline.playerIdAtSeat(1, 11)).toBe('old');
    expect(timeline.playerIdAtSeat(1, 12)).toBe('new');
    expect(timeline.sample(9)?.players.map((entry) => entry.id)).toEqual(['local']);
    timeline.clear();
    expect(timeline.sample(12)).toBeNull();
    expect(timeline.samples('old')).toHaveLength(0);
  });
});

describe('T-036 NETWORK_PROTOCOL §§5.3,7 event timeline', () => {
  it('validates all routed tuple positions and drops malformed payloads', () => {
    expect(validateEventTuple([EventId.MorphStart, 1, Form.Runner,
      Form.Beast, 30])).not.toBeNull();
    expect(validateEventTuple([EventId.MorphStart, 1, 0, 1, 30])).toBeNull();
    expect(validateEventTuple([EventId.RailShotFired, 1, 0, 0, Infinity, 2]))
      .toBeNull();
    expect(validateEventTuple([EventId.ProjectileSpawn, 'id', 1,
      WeaponId.PulsePistol, 0, 0, 0, 10, 0, 1, 0])).not.toBeNull();
    expect(validateEventTuple([EventId.MatchEnd, [0, 1, 1]])).toBeNull();
  });

  it('keeps same-tick batches in arrival order and creates nothing before due', () => {
    const remotes = new RemoteTimeline();
    remotes.ingest(snapshot(10, [player('remote', 1)]), 100);
    const events = new WorldEventTimeline(remotes);
    events.ingest({ tick: 12, events: [[EventId.RailShotFired, 1, 0, 0, 1, 0]] }, 'local');
    events.ingest({ tick: 12, events: [[EventId.MorphStart, 1,
      Form.Runner, Form.Beast, 27]] }, 'local');
    expect(events.queuedCount).toBe(2);
    expect(events.due(11.999)).toEqual([]);
    const due = events.due(12);
    expect(due.map((entry) => entry.order)).toEqual([0, 1]);
    expect(due.map((entry) => entry.actorId)).toEqual(['remote', 'remote']);
    expect(events.due(12)).toEqual([]);
    events.ingest({ tick: 11, events: [[EventId.RailShotFired, 1, 0, 0, 2, 0]] },
      'local');
    expect(events.due(12)).toHaveLength(1);
  });

  it('delivers own hits, damage and death immediately with projectile ownership', () => {
    const remotes = new RemoteTimeline();
    remotes.ingest(snapshot(10, [player('remote', 1)]), 100);
    const events = new WorldEventTimeline(remotes);
    const own = events.ingest({ tick: 11, events: [
      [EventId.ProjectileSpawn, 'p1', 0, WeaponId.PulsePistol,
        0, 0, 0, 11, 0, 1, 0],
      [EventId.ProjectileHit, 'p1', 1, 9, 1, 1, 0],
    ] }, 'local');
    expect(own).toEqual([{ kind: 'ownHit', tick: 11,
      source: 'projectile', targetId: 'remote', damage: 9, tags: 1 }]);
    const incoming = events.ingest({ tick: 12, events: [
      [EventId.ProjectileSpawn, 'p2', 1, WeaponId.PulsePistol,
        0, 0, 0, 12, 0, 2, 0],
      [EventId.ProjectileHit, 'p2', 0, 4, 2, 0, 0],
      [EventId.Death, 0, 1, WeaponId.PulsePistol,
        Form.Runner, Form.Beast, 4, Form.Beast],
    ] }, 'local');
    expect(incoming).toEqual([
      { kind: 'damageTaken', tick: 12, projectileId: 'p2', ownerId: 'remote',
        damage: 4, tags: 2, x: 0, y: 0 },
      { kind: 'death', tick: 12, killerId: 'remote',
        cause: WeaponId.PulsePistol, finalDamage: 4 },
    ]);
    expect(events.due(10)).toEqual([]);
    expect(events.queuedCount).toBe(5);
  });

  it('preserves old seat identity and clears queues and attribution on reset', () => {
    const remotes = new RemoteTimeline();
    remotes.ingest(snapshot(10, [player('old', 1)]), 100);
    const events = new WorldEventTimeline(remotes);
    events.ingest({ tick: 10, events: [
      [EventId.RailShotFired, 1, 0, 0, 2, 0],
      [EventId.ProjectileSpawn, 7, 1, WeaponId.PulsePistol,
        0, 0, 0, 10, 0, 1, 0],
    ] }, 'local');
    remotes.ingest(snapshot(12, [player('new', 1)]), 120);
    expect(events.due(12).map((entry) => entry.actorId)).toEqual(['old', 'old']);
    expect(events.attributionCount).toBe(1);
    events.ingest({ tick: 13, events: [[EventId.RailShotFired, 1,
      0, 0, Number.NaN, 1]] }, 'local');
    expect(events.queuedCount).toBe(0);
    events.clear(); remotes.clear();
    expect(events.attributionCount).toBe(0);
    expect(events.due(100)).toEqual([]);
  });

  it('uses a BotReplaced identity before its first patch without rebinding older events', () => {
    const remotes = new RemoteTimeline();
    remotes.ingest(snapshot(10, [player('old', 1)]), 100);
    const events = new WorldEventTimeline(remotes);
    events.ingest({ tick: 11, events: [
      [EventId.BotReplaced, 1, 'new'],
      [EventId.ProjectileSpawn, 'new-shot', 1, WeaponId.PulsePistol,
        0, 0, 0, 11, 0, 1, 0],
    ] }, 'local');
    events.ingest({ tick: 10, events: [
      [EventId.RailShotFired, 1, 0, 0, 1, 0],
    ] }, 'local');
    expect(events.due(11).map((entry) => entry.actorId))
      .toEqual(['old', 'new', 'new']);
    remotes.ingest(snapshot(12, [player('new', 1)]), 120);
    events.ingest({ tick: 12, events: [
      [EventId.ProjectileHit, 'new-shot', 0, 3, 1, 0, 0],
    ] }, 'local');
    expect(events.due(12)[0]?.projectileOwnerId).toBe('new');
  });
});
