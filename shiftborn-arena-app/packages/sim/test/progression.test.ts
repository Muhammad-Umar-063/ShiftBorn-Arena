import {
  AimSource,
  BALANCE,
  Cause,
  DERIVED,
  Form,
  GREYBOX_V1,
  InputButton,
  MorphDenialReason,
  Phase,
  type InputFrame,
  type MapData,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { applyDamage } from '../src/damage.js';
import { finalizeDeaths } from '../src/death.js';
import { evaluateMorphRequest } from '../src/morph.js';
import {
  addPlayer,
  handoffPlayerToBot,
  removePlayer,
} from '../src/player.js';
import { formsUnlockedAt, freshUnlocks } from '../src/progression.js';
import { step } from '../src/step.js';
import type { PlayerRecord, World } from '../src/world.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

const map: MapData = { ...TEST_OPEN, spawnPoints: GREYBOX_V1.spawnPoints };
const specs = [
  { id: 'killer', name: 'Killer', isBot: false, seat: 0 },
  { id: 'victim', name: 'Victim', isBot: false, seat: 1 },
  { id: 'assist', name: 'Assist', isBot: false, seat: 2 },
];
const FRESH = { [Form.Runner]: true, [Form.Beast]: false, [Form.Turret]: false };

function seat(world: World, index: number): PlayerRecord {
  const record = world.players[index];
  if (record === null || record === undefined) throw new Error('missing player');
  return record;
}

function playing(count = 3): World {
  const world = makeTestWorld({ seed: 31, map, players: specs.slice(0, count) });
  world.phase = Phase.Playing;
  world.phaseEndTick = world.tick + DERIVED.match.durationTicks;
  world.events.length = 0;
  for (let index = 0; index < count; index += 1) {
    const record = seat(world, index);
    record.protectedEndTick = world.tick;
    record.pos = { x: index * 4, y: 0 };
  }
  return world;
}

// The default is lethal for every form under any matchup (minimum 0.75).
function damage(world: World, source: PlayerRecord, victim: PlayerRecord,
  base = 2 * BALANCE.forms.beast.maxHp): void {
  applyDamage(world,
    { id: source.id, seat: source.seat, name: source.name, form: source.form },
    victim, base, 1, { x: -1, y: 0 }, Cause.PulsePistol);
}

/** Kill the victim, finalize in step 9 order, then revive it for reuse. */
function creditKo(world: World, killer: PlayerRecord, victim: PlayerRecord) {
  world.events.length = 0;
  damage(world, killer, victim);
  finalizeDeaths(world);
  const events = [...world.events];
  victim.alive = true;
  victim.hpFrac = 1;
  victim.damageLog = [];
  return events;
}

function frame(seq: number, buttons: number): InputFrame {
  return { aimDist: 120, seq, moveX: 0, moveY: 0, aim: 0, buttons, aimSource: AimSource.Mouse };
}

describe('GR-18 loadout and kill progression (D-074)', () => {
  it('AT-MATCH-02 AT-LOAD-01 starts every seat fresh at match start', () => {
    const world = makeTestWorld({ seed: 5, players: specs });
    expect(world.phase).toBe(Phase.Countdown);
    for (let index = 0; index < specs.length; index += 1) {
      const record = seat(world, index);
      expect(record.form).toBe(Form.Runner);
      expect(record.unlocked).toEqual(FRESH);
      expect(record.stats.kos).toBe(0);
    }
    expect(freshUnlocks()).toEqual(FRESH);
    expect(freshUnlocks()).not.toBe(freshUnlocks());
  });

  it('AT-LOAD-01 gives a late joiner and a human replacing a bot a fresh loadout', () => {
    const world = playing(2);
    const veteran = seat(world, 0);
    veteran.unlocked = { [Form.Runner]: true, [Form.Beast]: true, [Form.Turret]: true };
    veteran.stats.kos = 7;
    addPlayer(world, { id: 'late', name: 'Late', isBot: false, seat: 3 });
    expect(seat(world, 3).unlocked).toEqual(FRESH);
    expect(seat(world, 3).stats.kos).toBe(0);

    addPlayer(world, { id: 'bot-4', name: 'Bot', isBot: true, seat: 4 });
    const bot = seat(world, 4);
    bot.unlocked = { [Form.Runner]: true, [Form.Beast]: true, [Form.Turret]: false };
    bot.stats.kos = 4;
    removePlayer(world, 'bot-4');
    addPlayer(world, { id: 'joiner', name: 'Joiner', isBot: false, seat: 4 });
    expect(seat(world, 4).unlocked).toEqual(FRESH);
    expect(seat(world, 4).stats.kos).toBe(0);
  });

  it('AT-LOAD-03 GR-18.2 unlocks Beast on KO 3 and Turret on KO 6 in step 9 only', () => {
    expect(formsUnlockedAt(2)).toEqual([Form.Runner]);
    expect(formsUnlockedAt(3)).toEqual([Form.Runner, Form.Beast]);
    expect(formsUnlockedAt(5)).toEqual([Form.Runner, Form.Beast]);
    expect(formsUnlockedAt(6)).toEqual([Form.Runner, Form.Beast, Form.Turret]);

    const world = playing(2);
    const killer = seat(world, 0);
    const victim = seat(world, 1);
    const unlockEvents: { kos: number; events: unknown[] }[] = [];
    for (let ko = 1; ko <= 7; ko += 1) {
      const events = creditKo(world, killer, victim)
        .filter((event) => event.type === 'formUnlocked');
      unlockEvents.push({ kos: killer.stats.kos, events });
      expect(killer.form).toBe(Form.Runner);
    }
    expect(unlockEvents.map((entry) => entry.events.length))
      .toEqual([0, 0, 1, 0, 0, 1, 0]);
    expect(unlockEvents[2]?.events).toEqual([
      { type: 'formUnlocked', seat: 0, form: Form.Beast },
    ]);
    expect(unlockEvents[5]?.events).toEqual([
      { type: 'formUnlocked', seat: 0, form: Form.Turret },
    ]);
    expect(killer.unlocked).toEqual({
      [Form.Runner]: true, [Form.Beast]: true, [Form.Turret]: true,
    });
  });

  it('GR-18.3 denies a locked target after the phase check and before busy, cooldown and Flux', () => {
    const world = playing(1);
    const player = seat(world, 0);
    player.flux = 0;
    player.morphReadyTick = world.tick + 50;
    player.stunEndTick = world.tick + 50;
    expect(evaluateMorphRequest(player, Form.Beast, Phase.Countdown, world.tick))
      .toEqual({ kind: 'denied', reason: MorphDenialReason.Phase });
    expect(evaluateMorphRequest(player, Form.Beast, Phase.Playing, world.tick))
      .toEqual({ kind: 'denied', reason: MorphDenialReason.Locked });
    expect(evaluateMorphRequest(player, Form.Runner, Phase.Playing, world.tick))
      .toEqual({ kind: 'sameForm' });
    player.unlocked[Form.Beast] = true;
    expect(evaluateMorphRequest(player, Form.Beast, Phase.Playing, world.tick))
      .toEqual({ kind: 'denied', reason: MorphDenialReason.Cooldown });

    const fresh = playing(1);
    const runner = seat(fresh, 0);
    runner.flux = BALANCE.flux.max;
    const events = step(fresh, [frame(1, InputButton.MorphTurret)], {});
    expect(events.filter((event) => event.type === 'morphDenied')).toEqual([
      { type: 'morphDenied', seat: 0, target: Form.Turret,
        reason: MorphDenialReason.Locked },
    ]);
    expect(runner.flux).toBe(BALANCE.flux.max);
    expect(runner.morph).toBeNull();
  });

  it('AT-LOAD-04 keeps unlocks and progress through the killer\'s own death and respawn', () => {
    const world = playing(2);
    const killer = seat(world, 0);
    const victim = seat(world, 1);
    for (let ko = 0; ko < 3; ko += 1) creditKo(world, killer, victim);
    expect(killer.unlocked[Form.Beast]).toBe(true);
    killer.form = Form.Beast;
    damage(world, victim, killer);
    finalizeDeaths(world);
    expect(killer.alive).toBe(false);
    world.tick = killer.respawnTick;
    step(world, [], {});
    expect(killer.alive).toBe(true);
    expect(killer.form).toBe(Form.Runner);
    expect(killer.unlocked[Form.Beast]).toBe(true);
    expect(killer.stats.kos).toBe(3);
    expect(victim.unlocked[Form.Beast]).toBe(false);
  });

  it('AT-LOAD-05 counts only credited KOs: no assists, points, duplicates or non-lethal damage', () => {
    const world = playing(3);
    const killer = seat(world, 0);
    const victim = seat(world, 1);
    const assister = seat(world, 2);
    for (let ko = 0; ko < 2; ko += 1) {
      damage(world, assister, victim, 1);
      creditKo(world, killer, victim);
    }
    assister.stats.points = 999;
    assister.stats.assists += 5;
    damage(world, assister, victim, 1);
    finalizeDeaths(world);
    expect(killer.stats.kos).toBe(2);
    expect(assister.stats.kos).toBe(0);
    expect(assister.unlocked).toEqual(FRESH);

    world.events.length = 0;
    damage(world, killer, victim);
    const pending = world.pendingDeaths[0];
    if (pending === undefined) throw new Error('missing pending death');
    world.pendingDeaths.push({ ...pending });
    damage(world, assister, victim);
    finalizeDeaths(world);
    expect(killer.stats.kos).toBe(3);
    expect(world.events.filter((event) => event.type === 'formUnlocked')).toHaveLength(1);
    expect(assister.stats.kos).toBe(0);
  });

  it('AT-LOAD-05 credits a mutual kill once each, including the dead killer\'s unlock', () => {
    const world = playing(2);
    const first = seat(world, 0);
    const second = seat(world, 1);
    first.stats.kos = 2;
    second.stats.kos = 5;
    world.events.length = 0;
    damage(world, first, second);
    damage(world, second, first);
    expect(first.alive).toBe(false);
    expect(second.alive).toBe(false);
    finalizeDeaths(world);
    expect(first.stats.kos).toBe(3);
    expect(second.stats.kos).toBe(6);
    // GR-1.6: step 9 finalizes victims in seat order, so seat 0's death credits seat 1 first.
    expect(world.events.filter((event) => event.type === 'formUnlocked')).toEqual([
      { type: 'formUnlocked', seat: 1, form: Form.Beast },
      { type: 'formUnlocked', seat: 1, form: Form.Turret },
      { type: 'formUnlocked', seat: 0, form: Form.Beast },
    ]);
  });

  it('AT-LOAD-06 resets at every COUNTDOWN and lets a bot continue a departed human\'s seat', () => {
    const world = playing(2);
    const human = seat(world, 0);
    const victim = seat(world, 1);
    for (let ko = 0; ko < 3; ko += 1) creditKo(world, human, victim);
    const bot = handoffPlayerToBot(world, 'killer', { id: 'bot-0', name: 'Bot' });
    expect(bot.unlocked[Form.Beast]).toBe(true);
    expect(bot.stats.kos).toBe(3);
    expect(bot.unlocked).not.toBe(human.unlocked);

    world.phaseEndTick = world.tick;
    step(world, [], {});
    expect(world.phase).toBe(Phase.Results);
    world.phaseEndTick = world.tick;
    step(world, [], {});
    expect(world.phase).toBe(Phase.Countdown);
    expect(seat(world, 0).unlocked).toEqual(FRESH);
    expect(seat(world, 0).stats.kos).toBe(0);
  });

  it('AT-MATCH-10 counts a KO and its unlock on the last PLAYING tick', () => {
    const world = playing(2);
    const killer = seat(world, 0);
    const victim = seat(world, 1);
    killer.stats.kos = 2;
    world.phaseEndTick = world.tick + 1;
    damage(world, killer, victim);
    const events = step(world, [], {});
    expect(world.phase).toBe(Phase.Playing);
    expect(events.filter((event) => event.type === 'formUnlocked')).toEqual([
      { type: 'formUnlocked', seat: 0, form: Form.Beast },
    ]);
    step(world, [], {});
    expect(world.phase).toBe(Phase.Results);
    expect(killer.stats.kos).toBe(3);
    expect(killer.unlocked[Form.Beast]).toBe(true);
  });
});
