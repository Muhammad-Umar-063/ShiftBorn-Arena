import {
  AimSource,
  BALANCE,
  Controller,
  DERIVED,
  Form,
  Phase,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  createPlayer,
  createPlayerStats,
  removePlayer,
  resetPlayerForMatch,
  setController,
} from '../src/player.js';
import { step } from '../src/step.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';

const ada = { id: 'ada', name: 'Ada', isBot: false, seat: 2 };
const bot = { id: 'bot-1', name: 'Bot', isBot: true, seat: 5 };

function numericLeaves(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(numericLeaves);
  }
  return [];
}

describe('GR §3 player records and seat APIs', () => {
  it('creates every canonical field with fresh nested state and zero GR-12.4 stats', () => {
    const first = createPlayer(ada, 12);
    const second = createPlayer(ada, 12);
    expect(Object.keys(first).sort()).toEqual(
      [
        'id',
        'seat',
        'name',
        'isBot',
        'controller',
        'alive',
        'pos',
        'vel',
        'aim',
        'form',
        'unlocked',
        'morph',
        'morphReadyTick',
        'hpFrac',
        'flux',
        'fluxRegenAnchor',
        'fluxRegenTicks',
        'ability',
        'abilityReadyTick',
        'guns',
        'selectedTier',
        'gunTimers',
        'reload',
        'swapReadyTick',
        'melee',
        'heat',
        'overheatEndTick',
        'stunEndTick',
        'ccImmuneEndTick',
        'knockback',
        'protectedEndTick',
        'respawnTick',
        'respawnFlux',
        'damageLog',
        'lastInputSeq',
        'lastButtonInputSeq',
        'lastHeldButtons',
        'lastShotInputSeq',
        'nextShotIdx',
        'aimSource',
        'aimDistM', 'sprinting',
        'stats',
      ].sort(),
    );
    expect(first.controller).toBe(Controller.Human);
    expect(first.aimSource).toBe(AimSource.Mouse);
    expect(createPlayer(bot, 12).controller).toBe(Controller.Bot);
    expect(first.abilityReadyTick).toEqual({
      runner: 12,
      beast: 12,
      turret: 12,
    });
    expect(first.gunTimers).toEqual({
      pulsePistol: 0, ricochetDisc: 0, scatterCannon: 0,
      slugCannon: 0, railRepeater: 0, arcMortar: 0,
    });
    expect(Object.values(first.guns).every((gun) =>
      !gun.owned && gun.mag === 0 && gun.reserve === 0)).toBe(true);
    expect(first.selectedTier).toEqual({ runner: 0, beast: 0, turret: 0 });
    expect(first.reload).toBeNull();
    expect(first.melee).toBeNull();
    expect(first.swapReadyTick).toBe(12);
    expect(first.morph).toBeNull();
    expect(first.ability).toBeNull();
    expect(first.knockback).toBeNull();
    expect(first.stats).toEqual(createPlayerStats());
    expect(numericLeaves(first.stats).length).toBeGreaterThan(20);
    expect(numericLeaves(first.stats).every((value) => value === 0)).toBe(true);
    expect(first.pos).not.toBe(second.pos);
    expect(first.vel).not.toBe(second.vel);
    expect(first.gunTimers).not.toBe(second.gunTimers);
    expect(first.guns.pulsePistol).not.toBe(second.guns.pulsePistol);
    expect(first.selectedTier).not.toBe(second.selectedTier);
    expect(first.abilityReadyTick).not.toBe(second.abilityReadyTick);
    expect(first.damageLog).not.toBe(second.damageLog);
    expect(first.stats.shotsFired.byWeapon).not.toBe(
      second.stats.shotsFired.byWeapon,
    );
    expect(first.stats.shotsFired.byWeapon).not.toBe(first.stats.hits.byWeapon);
  });

  it('GR-2.1 preserves seat positions and rejects invalid or occupied seats and duplicate IDs', () => {
    const world = makeTestWorld({ seed: 1 });
    addPlayer(world, ada);
    addPlayer(world, bot);
    expect(world.players).toHaveLength(BALANCE.match.seats);
    expect(world.players[2]?.id).toBe('ada');
    expect(world.players[5]?.id).toBe('bot-1');
    expect(world.players[0]).toBeNull();
    expect(() => addPlayer(world, { ...ada, id: 'other' })).toThrow(/occupied/);
    expect(() => addPlayer(world, { ...ada, seat: 1 })).toThrow(/duplicate/);
    for (const seat of [-1, BALANCE.match.seats, 1.5, Number.NaN]) {
      expect(() =>
        addPlayer(world, { ...ada, id: `invalid-${seat}`, seat }),
      ).toThrow(RangeError);
    }
    removePlayer(world, 'ada');
    expect(world.players[2]).toBeNull();
    expect(world.players[5]?.id).toBe('bot-1');
    expect(world.players).toHaveLength(BALANCE.match.seats);
  });

  it('changes only controller and throws for unknown IDs', () => {
    const world = makeTestWorld({ seed: 2, players: [ada] });
    const player = world.players[ada.seat];
    if (player === null || player === undefined)
      throw new Error('Missing player');
    const before = JSON.stringify(player);
    setController(world, 'ada', Controller.Proxy);
    expect(player.controller).toBe(Controller.Proxy);
    expect(JSON.stringify({ ...player, controller: Controller.Human })).toBe(
      before,
    );
    expect(() => setController(world, 'missing', Controller.Bot)).toThrow(
      /unknown/,
    );
    expect(() => removePlayer(world, 'missing')).toThrow(/unknown/);
  });

  it('GR-2.4 resets gameplay while retaining identity, controller and input sequence', () => {
    const player = createPlayer(ada, 0);
    player.controller = Controller.Proxy;
    player.lastInputSeq = 42;
    player.lastButtonInputSeq = 42;
    player.lastHeldButtons = 8;
    player.form = Form.Beast;
    player.morph = { target: Form.Turret, endTick: 50 };
    player.abilityReadyTick.runner = 99;
    player.gunTimers.scatterCannon = 2;
    player.damageLog.push({ attackerId: 'x', tick: 1, amount: 3 });
    player.stats.kos = 3;
    player.stats.hits.byAimSource.mouse = 2;
    resetPlayerForMatch(player, 100);
    expect([
      player.id,
      player.seat,
      player.name,
      player.isBot,
      player.controller,
      player.lastInputSeq,
      player.lastButtonInputSeq,
      player.lastHeldButtons,
    ]).toEqual(['ada', 2, 'Ada', false, Controller.Proxy, 42, 42, 8]);
    expect(player).toMatchObject({
      alive: true,
      form: Form.Runner,
      hpFrac: 1,
      flux: BALANCE.flux.start,
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      aim: 0,
      morph: null,
      ability: null,
      knockback: null,
      morphReadyTick: 100,
      protectedEndTick: 100,
      respawnTick: 100,
      heat: 0,
    });
    expect(Object.values(player.abilityReadyTick)).toEqual([100, 100, 100]);
    expect(Object.values(player.gunTimers)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(player.damageLog).toEqual([]);
    expect(numericLeaves(player.stats).every((value) => value === 0)).toBe(
      true,
    );
  });

  it('GR-2.6 spawns COUNTDOWN joins without protection, PLAYING joins with it, and RESULTS joins wait', () => {
    const world = makeTestWorld({ seed: 4 });
    addPlayer(world, ada);
    expect(world.players[2]?.alive).toBe(true);
    expect(world.players[2]?.protectedEndTick).toBe(world.tick);
    expect(world.events.filter((event) => event.type === 'spawn')).toHaveLength(
      1,
    );
    for (let count = 0; count <= DERIVED.match.countdownTicks; count += 1)
      step(world, [], {});
    expect(world.phase).toBe(Phase.Playing);
    addPlayer(world, bot);
    expect(world.players[5]?.protectedEndTick).toBe(
      world.tick + DERIVED.match.spawnProtectionTicks,
    );
    const spawnEvents = world.events.filter(
      (event) => event.type === 'spawn',
    ).length;
    expect(spawnEvents).toBe(1);
    while (world.phase !== Phase.Results) step(world, [], {});
    const before = world.recentSpawns.slice();
    addPlayer(world, { id: 'waiting', name: 'Waiting', isBot: false, seat: 0 });
    expect(world.players[0]?.alive).toBe(false);
    expect(world.recentSpawns).toEqual(before);
    expect(world.events.some((event) => event.type === 'spawn')).toBe(false);
    while (world.tick < world.phaseEndTick) step(world, [], {});
    const nextMatchEvents = step(world, [], {});
    expect(world.phase).toBe(Phase.Countdown);
    expect(world.players[0]?.alive).toBe(true);
    expect(world.players[0]?.flux).toBe(BALANCE.flux.start);
    expect(world.players[0]?.protectedEndTick).toBe(world.tick - 1);
    expect(nextMatchEvents.some((event) => event.type === 'spawn')).toBe(true);
  });
});
