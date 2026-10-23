import { BALANCE, DERIVED, EventId, Form, WeaponId, gunFor } from '@shiftborn/shared';
import { formStats, scatterAngles } from '@shiftborn/sim';
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { validateEventTuple } from '../src/net/eventValidation.js';
import type { PredictedShotStart } from '../src/predict/Predictor.js';
import { ProjectileTimeline } from '../src/render/projectileTimeline.js';
import { RemoteTimeline } from '../src/render/remoteTimeline.js';
import { ProjectileViews } from '../src/render/projectileViews.js';
import { WorldEventTimeline, type WorldDelivery } from '../src/render/worldEventTimeline.js';

function shot(form: Form, seq: number, shotIdx = 0, angle = 0): PredictedShotStart {
  return { form, weapon: gunFor(form, 1), inputSeq: seq, shotIdx, angle, x: 2, y: 3 };
}
function delivery(value: readonly unknown[], ownerId: string | null,
  tick = 20): WorldDelivery {
  const event = validateEventTuple(value);
  if (event === null) throw new Error('Invalid test event');
  return { tick, order: 0, event, actorId: ownerId,
    projectileOwnerId: ownerId };
}
function spawn(id: string | number, ownerId: string | null, seq: number,
  shotIdx: number, weapon: WeaponId = WeaponId.PulsePistol, advancedTicks = 0,
  tick = 20): WorldDelivery {
  return delivery([EventId.ProjectileSpawn, id, ownerId === 'local' ? 0 : 1,
    weapon, 2.7, 3, 0, tick, advancedTicks, seq, shotIdx, 0, 0, 0], ownerId, tick);
}

describe('T-037 predicted projectile views', () => {
  it('uses shared muzzle geometry and all three weapon speeds without deciding fire', () => {
    const model = new ProjectileTimeline();
    model.setContext('match', 'local');
    const starts = [shot(Form.Runner, 1), shot(Form.Beast, 2),
      shot(Form.Turret, 3)];
    const ids = model.startPredicted(starts, 100);
    expect(ids).toHaveLength(3);
    const expected = [
      [WeaponId.PulsePistol, BALANCE.weapons.pulsePistol.projSpeedMps,
        BALANCE.weapons.pulsePistol.rangeM],
      [WeaponId.ScatterCannon, BALANCE.weapons.scatterCannon.projSpeedMps,
        BALANCE.weapons.scatterCannon.rangeM],
      [WeaponId.RailRepeater, BALANCE.weapons.railRepeater.projSpeedMps,
        BALANCE.weapons.railRepeater.rangeM],
    ] as const;
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index]!;
      const start = starts[index]!;
      const [weapon] = expected[index]!;
      expect(model.get(id)).toMatchObject({ weapon, x: 2 +
        formStats(start.form).radiusM + BALANCE.weapons.muzzleExtraM, y: 3 });
    }
    model.advance(200, 0);
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index]!;
      const start = starts[index]!;
      const [, speed, range] = expected[index]!;
      expect(model.get(id)?.x).toBeCloseTo(Math.min(range, speed * 0.1) +
        2 + formStats(start.form).radiusM + BALANCE.weapons.muzzleExtraM);
    }
  });

  it('keeps seven Scatter pellets independent by sequence and firing index', () => {
    const model = new ProjectileTimeline();
    model.setContext('match', 'local');
    const starts = scatterAngles(0).map((angle, shotIdx) =>
      shot(Form.Beast, 42, shotIdx, angle));
    const ids = model.startPredicted(starts, 100);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
    expect(model.startPredicted(starts, 120)).toEqual([]);
    for (let index = 0; index < starts.length; index += 1) {
      const linked = model.onReceipt(spawn(`pellet-${index}`, 'local', 42,
        index, WeaponId.ScatterCannon), 150);
      expect(linked).toBe(ids[index]);
    }
    expect(model.linkedCount).toBe(7);
    expect(model.predictedCount).toBe(0);
  });

  it('matches only the local owner, sequence, index, and weapon without jumping', () => {
    const model = new ProjectileTimeline();
    model.setContext('match', 'local');
    const id = model.startPredicted([shot(Form.Runner, 7)], 100)[0]!;
    model.advance(140, 20);
    const before = { ...model.get(id)! };
    expect(model.onReceipt(spawn('other', 'enemy', 7, 0), 150)).toBeNull();
    expect(model.onReceipt(spawn('wrong-seq', 'local', 8, 0), 150)).toBeNull();
    expect(model.onReceipt(spawn('wrong-index', 'local', 7, 1), 150)).toBeNull();
    expect(model.onReceipt(spawn('wrong-weapon', 'local', 7, 0,
      WeaponId.RailRepeater), 150)).toBeNull();
    expect(model.onReceipt(spawn(9, 'local', 7, 0), 150)).toBe(id);
    expect(model.get(id)).toMatchObject({ x: before?.x, y: before?.y,
      visualId: id, serverId: 9 });
    expect(model.getByServerId('9')).toBeNull();
    expect(model.onReceipt(spawn(9, 'local', 7, 0), 160)).toBe(id);
    model.onWorld(spawn(9, 'local', 7, 0));
    expect(model.count).toBe(1);
    model.advance(200, 21);
    expect(model.get(id)?.x).toBeGreaterThan(before!.x);
  });

  it('starts fading at 500 ms, bounds the decorative fade, and rejects late revival', () => {
    const model = new ProjectileTimeline();
    model.setContext('match', 'local');
    const id = model.startPredicted([shot(Form.Runner, 9)], 100)[0]!;
    model.advance(599, 30);
    expect(model.get(id)?.opacity).toBe(1);
    model.advance(600, 30);
    expect(model.get(id)?.opacity).toBe(1);
    expect(model.onReceipt(spawn('late', 'local', 9, 0), 601)).toBeNull();
    expect(model.get(id)).toBeNull();
    model.onWorld(spawn('late', 'local', 9, 0));
    expect(model.count).toBe(0);
    expect(model.startPredicted([shot(Form.Runner, 9)], 700)).toEqual([]);
    const other = model.startPredicted([shot(Form.Runner, 10)], 100)[0]!;
    model.advance(650, 30);
    expect(model.get(other)?.opacity).toBeCloseTo(0.5);
    model.advance(700, 30);
    expect(model.get(other)).toBeNull();
  });
});

describe('T-037 authoritative world projectile timeline', () => {
  it('ages late remote spawns from spawnTick, never adding advancedTicks twice', () => {
    const model = new ProjectileTimeline();
    model.setContext('match', 'local');
    model.onWorld(spawn('remote', 'enemy', 1, 0, WeaponId.PulsePistol,
      3, 20));
    model.advance(100, 22.5);
    const visual = model.getByServerId('remote');
    expect(visual).not.toBeNull();
    expect(visual?.x).toBeCloseTo(2.7 + 2.5 * DERIVED.tick.secondsPerTick *
      BALANCE.weapons.pulsePistol.projSpeedMps);
    model.advance(200, 100);
    expect(visual?.x).toBeCloseTo(2.7 + BALANCE.weapons.pulsePistol.rangeM);
  });

  it('terminates own visuals at receipt and produces delayed terminal effects', () => {
    const model = new ProjectileTimeline();
    model.setContext('match', 'local');
    const id = model.startPredicted([shot(Form.Runner, 3)], 100)[0]!;
    const birth = spawn('instant', 'local', 3, 0);
    const impact = delivery([EventId.ProjectileImpact, 'instant', 2.7, 3],
      'local');
    expect(model.onReceipt(birth, 110)).toBe(id);
    model.onReceipt(impact, 110);
    expect(model.count).toBe(0);
    expect(model.onWorld(birth)).toBeNull();
    expect(model.count).toBe(0);
    expect(model.onWorld(impact)).toMatchObject({ kind: 'impact',
      x: 2.7, y: 3, own: true });
    expect(model.onWorld(impact)).toBeNull();
    expect(model.count).toBe(0);
  });

  it('handles hit, expire, blocked, duplicate, and out-of-order terminal events', () => {
    const model = new ProjectileTimeline();
    model.setContext('match', 'local');
    for (const [id, event, kind] of [
      ['hit', [EventId.ProjectileHit, 'hit', 0, 5, 1, 6, 7], 'hit'],
      ['expire', [EventId.ProjectileExpire, 'expire'], 'expire'],
      ['blocked', [EventId.Blocked, 'blocked', 0], 'blocked'],
    ] as const) {
      model.onWorld(spawn(id, 'enemy', 1, 0));
      model.advance(200, 21);
      expect(model.onWorld(delivery(event, 'enemy'))?.kind).toBe(kind);
      expect(model.getByServerId(id)).toBeNull();
      model.onWorld(spawn(id, 'enemy', 1, 0));
      expect(model.getByServerId(id)).toBeNull();
    }
    expect(model.onWorld(delivery([EventId.ProjectileExpire, 'prior'],
      'enemy'))).toBeNull();
    model.onWorld(spawn('prior', 'enemy', 1, 0));
    expect(model.count).toBe(0);
  });

  it('supports server-only own shots and keeps numeric and string ids separate', () => {
    const model = new ProjectileTimeline();
    model.setContext('match', 'local');
    model.onWorld(spawn(7, 'local', 40, 0));
    model.onWorld(spawn('7', 'enemy', 41, 0));
    expect(model.count).toBe(2);
    expect(model.getByServerId(7)?.own).toBe(true);
    expect(model.getByServerId('7')?.own).toBe(false);
    model.onWorld(delivery([EventId.ProjectileExpire, 7], 'local'));
    expect(model.getByServerId(7)).toBeNull();
    expect(model.getByServerId('7')).not.toBeNull();
  });

  it('filters malformed tuples and preserves spawn-terminal order in one batch', () => {
    const remote = new RemoteTimeline();
    const timeline = new WorldEventTimeline(remote);
    const model = new ProjectileTimeline();
    model.setContext('match', 'local');
    const queued: WorldDelivery[] = [];
    timeline.ingest({ tick: 20, events: [
      [EventId.ProjectileSpawn, 'bad', 1, WeaponId.PulsePistol,
        Number.NaN, 3, 0, 20, 0, 1, 0, 0, 0, 0],
      [EventId.ProjectileSpawn, 'instant', 1, WeaponId.PulsePistol,
        2.7, 3, 0, 20, 0, 1, 0, 0, 0, 0],
      [EventId.ProjectileImpact, 'instant', 2.7, 3],
    ] }, 'local', (item) => queued.push(item));
    expect(queued).toHaveLength(2);
    expect(timeline.due(19.9)).toEqual([]);
    const due = timeline.due(20);
    expect(due.map((item) => item.event[0])).toEqual([
      EventId.ProjectileSpawn, EventId.ProjectileImpact]);
    for (const item of due) model.onWorld(item);
    expect(model.count).toBe(0);
  });

  it('survives owner death, then clears on results, match change, reconnect and disposal', () => {
    const model = new ProjectileTimeline();
    model.setContext('first', 'local');
    model.onWorld(spawn('shot', 'enemy', 1, 0));
    // Death is not a projectile terminal event (GR-7.8).
    model.onWorld(delivery([EventId.Death, 1, -1,
      WeaponId.PulsePistol, Form.Runner, Form.Runner, 1, Form.Runner],
    'enemy'));
    expect(model.count).toBe(1);
    model.clear(); // RESULTS or recovery resets presentation.
    expect(model.count).toBe(0);
    model.onWorld(spawn('new', 'enemy', 2, 0));
    model.setContext('second', 'local');
    expect(model.count).toBe(0);
    model.startPredicted([shot(Form.Runner, 3)], 100);
    model.setContext('second', 'replacement');
    expect(model.count).toBe(0);
    model.dispose();
    expect(model.startPredicted([shot(Form.Runner, 4)], 200)).toEqual([]);
    model.onWorld(spawn('ignored', 'enemy', 4, 0));
    expect(model.count).toBe(0);
  });

  it('keeps validated old-seat event ownership after replacement', () => {
    const model = new ProjectileTimeline();
    model.setContext('match', 'new');
    const predicted = model.startPredicted([shot(Form.Runner, 1)], 100)[0]!;
    const oldSpawn = spawn('old', 'old', 1, 0);
    const newSpawn = spawn('new', 'new', 1, 0);
    expect(model.onReceipt(oldSpawn, 110)).toBeNull();
    expect(model.get(predicted)?.serverId).toBeNull();
    expect(model.onReceipt(newSpawn, 110)).toBe(predicted);
    model.onWorld(oldSpawn);
    model.onWorld(newSpawn);
    expect(model.getByServerId('old')?.own).toBe(false);
    expect(model.getByServerId('new')?.own).toBe(true);
  });

  it('renders terminal effects from the delayed world path and disposes meshes', () => {
    const scene = new Scene();
    const views = new ProjectileViews(scene);
    views.setContext('match', 'local');
    views.onWorld(spawn('remote', 'enemy', 1, 0), 100);
    views.update(100, 20);
    expect(views.count).toBe(1);
    const impact = delivery([EventId.ProjectileImpact, 'remote', 4, 5],
      'enemy');
    views.onWorld(impact, 120);
    views.update(120, 20);
    expect(views.count).toBe(0);
    expect(views.flashMesh.count).toBe(1);
    views.update(270, 20);
    expect(views.flashMesh.count).toBe(0);
    views.dispose();
    expect(scene.getObjectByName('projectile-terminal-effects')).toBeUndefined();
    expect(views.timeline.count).toBe(0);
  });
});
