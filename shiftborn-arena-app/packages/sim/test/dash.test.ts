import {
  AbilityId,
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
import {
  abilityFor,
  advanceDash,
  canStartAbility,
  cancelAbility,
  dashDirection,
  endDash,
  startDash,
} from '../src/ability.js';
import { hashWorld } from '../src/hash.js';
import { applyDamage } from '../src/damage.js';
import { finalizeDeaths } from '../src/death.js';
import { startMatch } from '../src/match.js';
import { step } from '../src/step.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';

const openMap: MapData = {
  ...GREYBOX_V1,
  id: 'dash_open',
  walls: [],
  cover: [],
};
const wall = { id: 'dash_wall', box: [0, -12, 1, 12] as const };
const wallMap: MapData = { ...openMap, id: 'dash_wall_map', walls: [wall] };
const coverMap: MapData = {
  ...openMap,
  id: 'dash_cover_map',
  cover: [{ id: 'dash_cover', box: wall.box }],
};
const first = { id: 'runner', name: 'Runner', isBot: false, seat: 0 };
const second = { id: 'enemy', name: 'Enemy', isBot: false, seat: 1 };

function setup(map: MapData = openMap, withEnemy = false) {
  const world = makeTestWorld({
    seed: 19,
    map,
    players: withEnemy ? [first, second] : [first],
  });
  world.phase = Phase.Playing;
  world.phaseEndTick = 5000;
  const player = world.players[0];
  if (player === null || player === undefined)
    throw new Error('missing Runner');
  player.pos = { x: 0, y: 0 };
  player.protectedEndTick = world.tick;
  return { world, player };
}

function frame(
  worldTick: number,
  buttons = 0,
  moveX = 0,
  moveY = 0,
  aim = 0,
): InputFrame {
  return {
    seq: worldTick + 1,
    buttons,
    moveX,
    moveY,
    aim,
    aimSource: AimSource.Mouse,
  };
}

function eventsOf(
  world: ReturnType<typeof setup>['world'],
  buttons = 0,
  moveX = 0,
  moveY = 0,
  aim = 0,
) {
  return [...step(world, [frame(world.tick, buttons, moveX, moveY, aim)], {})];
}

function runUntil(world: ReturnType<typeof setup>['world'], tick: number) {
  while (world.tick < tick) step(world, [], {});
}

describe('GR-8.1–8.2 Runner Dash', () => {
  it('AT-ABL-01 moves exactly six metres on six ticks with locked normalized direction and live aim', () => {
    for (const [moveX, moveY, aim, expectedX, expectedY] of [
      [127, 0, 16384, 6, 0],
      [127, 127, 0, 6 / Math.SQRT2, 6 / Math.SQRT2],
      [0, 0, 16384, 0, 6],
    ] as const) {
      const { world, player } = setup();
      const start = eventsOf(world, InputButton.Ability, moveX, moveY, aim);
      expect(
        start.filter((event) => event.type === 'abilityStart'),
      ).toMatchObject([
        {
          seat: 0,
          ability: AbilityId.Dash,
          startTick: 0,
          endTick: DERIVED.abilities.dash.durationTicks,
        },
      ]);
      expect(Math.hypot(player.pos.x, player.pos.y)).toBeCloseTo(1, 12);
      for (
        let index = 1;
        index < DERIVED.abilities.dash.durationTicks;
        index += 1
      ) {
        eventsOf(world, 0, -127, 0, 32768);
        expect(Math.hypot(player.pos.x, player.pos.y)).toBeCloseTo(
          index + 1,
          12,
        );
        expect(player.aim).toBeCloseTo(Math.PI, 12);
        expect(player.vel).toEqual({ x: 0, y: 0 });
      }
      expect(player.pos.x).toBeCloseTo(expectedX, 10);
      expect(player.pos.y).toBeCloseTo(expectedY, 10);
      const end = eventsOf(world);
      expect(end.filter((event) => event.type === 'abilityEnd')).toEqual([
        { type: 'abilityEnd', seat: 0, ability: AbilityId.Dash, cancelled: 0 },
      ]);
      expect(player.ability).toBeNull();
      expect(player.pos.x).toBeCloseTo(expectedX, 10);
      expect(player.pos.y).toBeCloseTo(expectedY, 10);
      expect(player.vel).toEqual({ x: 0, y: 0 });
    }
  });

  it('AT-ABL-02 requires a new edge and permits cooldown at endTick plus 150', () => {
    const { world, player } = setup();
    eventsOf(world, InputButton.Ability, 127);
    for (let i = 1; i <= DERIVED.abilities.dash.durationTicks; i += 1)
      eventsOf(world, InputButton.Ability);
    const ready =
      DERIVED.abilities.dash.durationTicks +
      DERIVED.abilities.dash.cooldownTicks;
    expect(player.abilityReadyTick.runner).toBe(ready);
    runUntil(world, ready - 2);
    expect(
      eventsOf(world, InputButton.Ability).some(
        (event) => event.type === 'abilityStart',
      ),
    ).toBe(false);
    eventsOf(world, 0);
    expect(world.tick).toBe(ready);
    expect(
      eventsOf(world, InputButton.Ability).filter(
        (event) => event.type === 'abilityStart',
      ),
    ).toHaveLength(1);
    // The first held frame after completion had no new edge; this second Dash did.
    expect(player.abilityReadyTick.beast).toBe(0);
    expect(player.abilityReadyTick.turret).toBe(0);
  });

  it('AT-ABL-03 blocks at a wall, slides when angled, and uses cover intact state', () => {
    const straight = setup(wallMap);
    straight.player.pos = { x: -2, y: 0 };
    eventsOf(straight.world, InputButton.Ability, 127);
    runUntil(straight.world, DERIVED.abilities.dash.durationTicks + 1);
    expect(straight.player.pos.x).toBeCloseTo(
      -BALANCE.forms.runner.radiusM,
      10,
    );
    expect(straight.player.abilityReadyTick.runner).toBe(156);

    const angled = setup(wallMap);
    angled.player.pos = { x: -2, y: -3 };
    eventsOf(angled.world, InputButton.Ability, 127, 127);
    runUntil(angled.world, DERIVED.abilities.dash.durationTicks + 1);
    expect(angled.player.pos.x).toBeCloseTo(-BALANCE.forms.runner.radiusM, 10);
    expect(angled.player.pos.y).toBeGreaterThan(-1);

    for (const intact of [true, false]) {
      const { world, player } = setup(coverMap);
      player.pos = { x: -2, y: 0 };
      const cover = world.cover[0];
      if (cover === undefined) throw new Error('missing cover');
      cover.intact = intact;
      eventsOf(world, InputButton.Ability, 127);
      runUntil(world, DERIVED.abilities.dash.durationTicks + 1);
      expect(player.pos.x).toBeCloseTo(
        intact ? -BALANCE.forms.runner.radiusM : 4,
        10,
      );
    }
  });

  it('AT-ABL-04 crosses another player without touching their state', () => {
    const { world, player } = setup(openMap, true);
    const enemy = world.players[1];
    if (enemy === null || enemy === undefined) throw new Error('missing enemy');
    enemy.pos = { x: 3, y: 0 };
    enemy.vel = { x: 0, y: 0 };
    enemy.protectedEndTick = 0;
    const before = structuredClone(enemy);
    const events = [];
    for (let i = 0; i < DERIVED.abilities.dash.durationTicks; i += 1)
      events.push(
        ...eventsOf(
          world,
          i === 0 ? InputButton.Ability : 0,
          i === 0 ? 127 : 0,
        ),
      );
    expect(player.pos.x).toBeCloseTo(6, 10);
    expect(enemy.hpFrac).toBe(before.hpFrac);
    expect(enemy.pos).toEqual(before.pos);
    expect(
      events.some((event) =>
        ['damage', 'abilityHit', 'knockback', 'stun'].includes(event.type),
      ),
    ).toBe(false);
  });

  it('AT-ABL-19/20 ends protection only for successful Dash and blocks invalid starts', () => {
    const blocked = [
      (p: ReturnType<typeof setup>['player']) => {
        p.morph = { target: Form.Beast, endTick: 20 };
      },
      (p: ReturnType<typeof setup>['player']) => {
        p.stunEndTick = 1;
      },
      (p: ReturnType<typeof setup>['player']) => {
        p.knockback = { vel: { x: 0, y: 0 }, endTick: 1 };
      },
      (p: ReturnType<typeof setup>['player']) => {
        p.ability = startDash(0, { x: 1, y: 0 });
      },
      (p: ReturnType<typeof setup>['player']) => {
        p.alive = false;
      },
      (p: ReturnType<typeof setup>['player']) => {
        p.abilityReadyTick.runner = 1;
      },
      (p: ReturnType<typeof setup>['player']) => {
        p.form = Form.Beast;
      },
      (p: ReturnType<typeof setup>['player']) => {
        p.form = Form.Turret;
      },
    ];
    for (const change of blocked) {
      const { world, player } = setup();
      player.protectedEndTick = 60;
      change(player);
      expect(
        eventsOf(world, InputButton.Ability).some(
          (event) => event.type === 'abilityStart',
        ),
      ).toBe(false);
      expect(player.protectedEndTick).toBe(60);
    }
    for (const phase of [Phase.Countdown, Phase.Results]) {
      const { world, player } = setup();
      world.phase = phase;
      player.protectedEndTick = 60;
      expect(
        eventsOf(world, InputButton.Ability).some(
          (event) => event.type === 'abilityStart',
        ),
      ).toBe(false);
      expect(player.protectedEndTick).toBe(60);
    }
    for (const status of ['stun', 'knockback'] as const) {
      const { world, player } = setup();
      if (status === 'stun') player.stunEndTick = 0;
      else player.knockback = { vel: { x: 1, y: 0 }, endTick: 0 };
      player.protectedEndTick = 60;
      expect(
        eventsOf(world, InputButton.Ability).filter(
          (event) => event.type === 'abilityStart',
        ),
      ).toHaveLength(1);
      expect(player.protectedEndTick).toBe(0);
    }
  });

  it('AT-MORPH-07/12 gives morph priority, Busy during Dash, and preserves Runner cooldown', () => {
    const priority = setup();
    expect(
      eventsOf(
        priority.world,
        InputButton.Ability | InputButton.MorphBeast,
      ).map((event) => event.type),
    ).toContain('morphStart');
    expect(priority.player.ability).toBeNull();

    const { world, player } = setup();
    eventsOf(world, InputButton.Ability, 127);
    expect(eventsOf(world, InputButton.MorphBeast)).toContainEqual({
      type: 'morphDenied',
      seat: 0,
      target: Form.Beast,
      reason: MorphDenialReason.Busy,
    });
    eventsOf(world, 0);
    runUntil(world, 7);
    const ready = player.abilityReadyTick.runner;
    eventsOf(world, InputButton.MorphBeast);
    expect(player.morph?.target).toBe(Form.Beast);
    eventsOf(world, InputButton.Ability);
    expect(player.ability).toBeNull();
    runUntil(world, player.morph?.endTick ?? 0);
    eventsOf(world);
    expect(player.form).toBe(Form.Beast);
    runUntil(world, player.morphReadyTick);
    eventsOf(world, InputButton.MorphRunner);
    runUntil(world, player.morph?.endTick ?? 0);
    eventsOf(world);
    expect(player.form).toBe(Form.Runner);
    expect(player.abilityReadyTick.runner).toBe(ready);
    runUntil(world, ready - 2);
    eventsOf(world, InputButton.Ability);
    expect(player.ability).toBeNull();
    eventsOf(world, 0);
    expect(world.tick).toBe(ready);
    expect(
      eventsOf(world, InputButton.Ability).filter(
        (event) => event.type === 'abilityStart',
      ),
    ).toHaveLength(1);
  });

  it('AT-WPN-12 and AT-STS-05 block real Dash firing, then resume after completion', () => {
    const { world, player } = setup();
    player.protectedEndTick = 60;
    const firstTick = eventsOf(
      world,
      InputButton.Ability | InputButton.Fire,
      127,
    );
    expect(firstTick.some((event) => event.type === 'projectileSpawn')).toBe(
      false,
    );
    expect(player.protectedEndTick).toBe(0);
    for (let i = 1; i < DERIVED.abilities.dash.durationTicks; i += 1)
      expect(
        eventsOf(world, InputButton.Fire).some(
          (event) => event.type === 'projectileSpawn',
        ),
      ).toBe(false);
    expect(
      eventsOf(world, InputButton.Fire).some(
        (event) => event.type === 'projectileSpawn',
      ),
    ).toBe(true);
  });

  it('interrupts on stun, knockback, death, and match end exactly once with full cooldown', () => {
    for (const kind of ['stun', 'knockback', 'death', 'results'] as const) {
      const { world, player } = setup();
      eventsOf(world, InputButton.Ability, 127);
      const before = { ...player.pos };
      if (kind === 'stun') player.stunEndTick = world.tick + 2;
      if (kind === 'knockback')
        player.knockback = { vel: { x: 0, y: 0 }, endTick: world.tick + 2 };
      if (kind === 'death') player.alive = false;
      if (kind === 'results') world.phaseEndTick = world.tick;
      const interruptionTick = world.tick;
      const events = eventsOf(world);
      expect(events.filter((event) => event.type === 'abilityEnd')).toEqual([
        { type: 'abilityEnd', seat: 0, ability: AbilityId.Dash, cancelled: 1 },
      ]);
      expect(player.pos).toEqual(before);
      expect(player.abilityReadyTick.runner).toBe(
        interruptionTick + DERIVED.abilities.dash.cooldownTicks,
      );
      expect(
        eventsOf(world).filter((event) => event.type === 'abilityEnd'),
      ).toHaveLength(0);
    }
  });

  it('GR-11.3 keeps Dash through ordinary damage and cancels before a lethal death event', () => {
    const { world, player } = setup(openMap, true);
    const enemy = world.players[1];
    if (enemy === null || enemy === undefined) throw new Error('missing enemy');
    enemy.pos = { x: 12, y: 0 };
    eventsOf(world, InputButton.Ability, 127);
    const nonlethal = applyDamage(
      world,
      enemy,
      player,
      1,
      1,
      { x: -1, y: 0 },
      Cause.PulsePistol,
    );
    expect(nonlethal.lethal).toBe(false);
    expect(player.ability).not.toBeNull();
    const lethal = applyDamage(
      world,
      enemy,
      player,
      1000,
      1,
      { x: -1, y: 0 },
      Cause.PulsePistol,
    );
    expect(lethal.lethal).toBe(true);
    finalizeDeaths(world);
    const types = world.events.map((event) => event.type);
    expect(types.indexOf('abilityEnd')).toBeLessThan(types.indexOf('death'));
    expect(world.events.filter((event) => event.type === 'abilityEnd')).toEqual(
      [{ type: 'abilityEnd', seat: 0, ability: AbilityId.Dash, cancelled: 1 }],
    );
    expect(player.abilityReadyTick.runner).toBe(
      world.tick + DERIVED.abilities.dash.cooldownTicks,
    );
  });

  it('orders multi-seat starts and endings and resets Dash on a new match', () => {
    const { world, player } = setup(openMap, true);
    const enemy = world.players[1];
    if (enemy === null || enemy === undefined) throw new Error('missing enemy');
    enemy.pos = { x: 10, y: 0 };
    const starts = step(
      world,
      [frame(0, InputButton.Ability, 127), frame(0, InputButton.Ability, -127)],
      {},
    );
    expect(
      starts
        .filter((event) => event.type === 'abilityStart')
        .map((event) => ('seat' in event ? event.seat : -1)),
    ).toEqual([0, 1]);
    runUntil(world, DERIVED.abilities.dash.durationTicks);
    const ends = step(world, [], {});
    expect(
      ends
        .filter((event) => event.type === 'abilityEnd')
        .map((event) => ('seat' in event ? event.seat : -1)),
    ).toEqual([0, 1]);
    expect(player.abilityReadyTick.runner).toBe(156);
    startMatch(world);
    expect(player.ability).toBeNull();
    expect(player.abilityReadyTick.runner).toBe(world.tick);
    expect(enemy.abilityReadyTick.runner).toBe(world.tick);
  });

  it('exports pure helpers, keeps inputs immutable, and hashes serializable Dash state', () => {
    const { world, player } = setup(coverMap);
    const beforePlayer = structuredClone(player);
    const beforeMap = structuredClone(world.map);
    const beforeCover = structuredClone(world.cover);
    const beforeBalance = structuredClone(BALANCE);
    const beforeDerived = structuredClone(DERIVED);
    const move = Object.freeze({ x: 0.5, y: 0.5 });
    expect(abilityFor(player)).toBe(AbilityId.Dash);
    expect(abilityFor({ form: Form.Beast })).toBe(AbilityId.RamCharge);
    expect(abilityFor({ form: Form.Turret })).toBe(AbilityId.RailShot);
    expect(canStartAbility(player, Phase.Playing, world.tick)).toBe(true);
    const dir = dashDirection(move, Math.PI);
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 12);
    const dash = Object.freeze(startDash(world.tick, dir));
    const end = endDash(dash, 2, 1);
    expect(end).toEqual({
      id: AbilityId.Dash,
      readyTick: 2 + DERIVED.abilities.dash.cooldownTicks,
      cancelled: 1,
    });
    advanceDash(player, dash, world.map, world.cover);
    expect(player).toEqual(beforePlayer);
    expect(world.map).toEqual(beforeMap);
    expect(world.cover).toEqual(beforeCover);
    expect(BALANCE).toEqual(beforeBalance);
    expect(DERIVED).toEqual(beforeDerived);
    player.ability = { ...dash };
    expect(JSON.parse(JSON.stringify(player.ability))).toEqual(player.ability);
    expect(hashWorld(world)).toBe(hashWorld(structuredClone(world)));
    expect(cancelAbility(world, player, world.tick)).toBe(true);
    expect(cancelAbility(world, player, world.tick)).toBe(false);
  });
});
