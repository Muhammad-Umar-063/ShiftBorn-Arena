import { BALANCE, DERIVED, Form, GREYBOX_V1, Phase } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import {
  administrativelyEliminate, administrativelyTeleport, setAdministrativeFlux,
  setAdministrativeForm, setAdministrativeHealth, stopOrdinaryBots,
} from '../src/admin.js';
import { startDash } from '../src/ability.js';
import { circleBoxPushOut } from '../src/math/geometry.js';
import { formStats } from '../src/formStats.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';

function setup() {
  const world = makeTestWorld({ seed: 29, players: [
    { id: 'human', name: 'Human', isBot: false, seat: 0 },
    { id: 'bot', name: 'Bot', isBot: true, seat: 1 },
  ] });
  const human = world.players[0];
  const bot = world.players[1];
  if (human === null || human === undefined || bot === null || bot === undefined)
    throw new Error('missing player');
  world.phase = Phase.Playing;
  world.phaseEndTick = 10000;
  return { world, human, bot };
}

describe('T-029 administrative sim mutations', () => {
  it('AT-SEC-03 rebases Flux without statistics or RNG changes', () => {
    const { world, human } = setup();
    const rng = { ...world.rng };
    const stats = structuredClone(human.stats);
    setAdministrativeFlux(human, BALANCE.flux.max / 2);
    expect(human.flux).toBe(BALANCE.flux.max / 2);
    expect(human.fluxRegenAnchor).toBe(human.flux);
    expect(human.fluxRegenTicks).toBe(0);
    expect(human.stats).toEqual(stats);
    expect(world.rng).toEqual(rng);
    expect(() => setAdministrativeFlux(human, -1)).toThrow();
  });

  it('AT-SEC-03 changes health and form directly without paid morph events', () => {
    const { world, human } = setup();
    human.flux = 20;
    human.hpFrac = 0.3;
    human.morph = { target: Form.Beast, endTick: world.tick + 5 };
    human.vel = { x: 3, y: 2 };
    expect(setAdministrativeForm(world, human, Form.Turret)).toBe(true);
    expect(human.form).toBe(Form.Turret);
    expect(human.hpFrac).toBe(0.3);
    expect(human.flux).toBe(20);
    expect(human.morph).toBeNull();
    expect(human.vel).toEqual({ x: 0, y: 0 });
    expect(human.stats.morphs.count).toBe(0);
    expect(world.events.every((event) => event.type !== 'morphStart')).toBe(true);
    expect(setAdministrativeHealth(world, human, 0.75)).toBe(true);
    expect(human.hpFrac).toBe(0.75);
  });

  it('AT-SEC-03 /hp 0 and /kill share credit-free elimination and delayed respawn', () => {
    for (const viaHealth of [true, false]) {
      const { world, human } = setup();
      const rng = { ...world.rng };
      human.morph = { target: Form.Beast, endTick: world.tick + 5 };
      human.ability = startDash(world.tick, { x: 1, y: 0 });
      human.knockback = { vel: { x: 1, y: 0 }, endTick: world.tick + 2 };
      human.lastHeldButtons = 1;
      const result = viaHealth ? setAdministrativeHealth(world, human, 0) :
        administrativelyEliminate(world, human);
      expect(result).toBe(true);
      expect(human.alive).toBe(false);
      expect(human.hpFrac).toBe(0);
      expect(human.morph).toBeNull();
      expect(human.ability).toBeNull();
      expect(human.knockback).toBeNull();
      expect(human.lastHeldButtons).toBe(0);
      expect(human.respawnTick).toBe(world.tick + DERIVED.match.respawnTicks);
      expect(human.stats.deaths).toBe(0);
      expect(world.rng).toEqual(rng);
      expect(world.events.every((event) => event.type !== 'death')).toBe(true);
    }
  });

  it('AT-SEC-03 freezes ordinary bots and teleports to legal geometry', () => {
    const { world, human, bot } = setup();
    bot.vel = { x: 4, y: 0 };
    human.vel = { x: 3, y: 0 };
    stopOrdinaryBots(world);
    expect(bot.vel).toEqual({ x: 0, y: 0 });
    expect(human.vel).toEqual({ x: 3, y: 0 });
    const before = { ...human.pos };
    expect(administrativelyTeleport(world, human, GREYBOX_V1.playable.maxX + 10, 0)).toBeNull();
    expect(human.pos).toEqual(before);
    const pos = administrativelyTeleport(world, human, 0, 0);
    expect(pos).not.toBeNull();
    expect(pos?.x).toBeLessThanOrEqual(GREYBOX_V1.playable.maxX - formStats(human.form).radiusM);
    expect(human.vel).toEqual({ x: 0, y: 0 });
    for (const wall of world.map.walls)
      expect(circleBoxPushOut(human.pos, formStats(human.form).radiusM, wall.box)).toBeNull();
  });
});
