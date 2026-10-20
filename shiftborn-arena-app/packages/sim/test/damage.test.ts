import {
  BALANCE,
  Cause,
  DamageTag,
  DERIVED,
  Form,
  Phase,
  degreesToRadians,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { applyDamage } from '../src/damage.js';
import { calculateDamage, type AttackSource } from '../src/damageMath.js';
import { formStats } from '../src/formStats.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';

const source: AttackSource = { id: 'attacker', seat: 0, form: Form.Runner };
const incomingEast = { x: 1, y: 0 };
const incomingWest = { x: -1, y: 0 };
const base = BALANCE.weapons.pulsePistol.damage;
const playerSeats = [
  { id: 'attacker', name: 'Attacker', isBot: false, seat: 0 },
  { id: 'victim', name: 'Victim', isBot: false, seat: 1 },
];

function damageWorld() {
  const world = makeTestWorld({ seed: 15, players: playerSeats });
  const attacker = world.players[0];
  const victim = world.players[1];
  if (
    attacker === null ||
    attacker === undefined ||
    victim === null ||
    victim === undefined
  )
    throw new Error('missing fixture players');
  world.phase = Phase.Playing;
  world.phaseEndTick = world.tick + DERIVED.match.durationTicks;
  victim.protectedEndTick = world.tick;
  world.events.length = 0;
  return { world, attacker, victim };
}

describe('GR-6 pure damage calculation', () => {
  it('AT-DMG-01 applies all nine BALANCE matchups and distance multiplication', () => {
    const before = structuredClone(BALANCE);
    const forms = [Form.Runner, Form.Beast, Form.Turret];
    for (const attackerForm of forms) {
      for (const defenderForm of forms) {
        const attacker = { ...source, form: attackerForm };
        const defender = { form: defenderForm, aim: 0 };
        // West is behind an east-facing Turret, so armor cannot mask matchup.
        const result = calculateDamage(
          attacker,
          defender,
          base,
          1,
          incomingWest,
        );
        const multiplier = BALANCE.matchup[attackerForm][defenderForm];
        expect(result.matchupMul).toBe(multiplier);
        expect(result.armorMul).toBe(1);
        expect(result.finalDamage).toBe(base * multiplier);
        expect(result.defenderMaxHp).toBe(formStats(defenderForm).maxHp);
        const withDistance = calculateDamage(
          attacker,
          defender,
          base,
          0.5,
          incomingWest,
        );
        expect(withDistance.finalDamage).toBe(base * 0.5 * multiplier);
        expect(withDistance.tags).toBe(result.tags);
      }
    }
    expect(BALANCE).toEqual(before);
  });

  it('AT-DMG-02 armors front and exact 60-degree boundary, not the flank', () => {
    const turret = { form: Form.Turret, aim: 0 };
    const sixty = degreesToRadians(BALANCE.forms.turret.frontArcDeg / 2);
    const justBeyond = sixty + degreesToRadians(0.01);
    const front = calculateDamage(source, turret, base, 1, incomingEast);
    const south = calculateDamage(source, turret, base, 1, { x: 0, y: -1 });
    const boundary = calculateDamage(source, turret, base, 1, {
      x: Math.cos(sixty),
      y: Math.sin(sixty),
    });
    const beyond = calculateDamage(source, turret, base, 1, {
      x: Math.cos(justBeyond),
      y: Math.sin(justBeyond),
    });
    expect(front.armorMul).toBe(BALANCE.forms.turret.frontArcDamageMult);
    expect(south.armorMul).toBe(1);
    expect(boundary.armorMul).toBe(BALANCE.forms.turret.frontArcDamageMult);
    expect(beyond.armorMul).toBe(1);
  });

  it('AT-DMG-03 combines EFFECTIVE and ARMOR but tags resistance separately', () => {
    const frontTurret = calculateDamage(
      source,
      { form: Form.Turret, aim: 0 },
      base,
      1,
      incomingEast,
    );
    expect(frontTurret.tags).toBe(DamageTag.Effective | DamageTag.Armor);
    expect(
      calculateDamage(
        source,
        { form: Form.Beast, aim: 0 },
        base,
        1,
        incomingEast,
      ).tags,
    ).toBe(DamageTag.Resisted);
    expect(
      calculateDamage(
        source,
        { form: Form.Runner, aim: 0 },
        base,
        1,
        incomingEast,
      ).tags,
    ).toBe(0);
    expect(
      calculateDamage(
        source,
        { form: Form.Turret, aim: 0 },
        base,
        1,
        incomingWest,
      ).tags,
    ).toBe(DamageTag.Effective);
  });

  it('GR-6.3 uses captured firing form and old defender form while morphing', () => {
    const { world, attacker, victim } = damageWorld();
    attacker.form = Form.Beast;
    victim.form = Form.Runner;
    victim.morph = {
      target: Form.Turret,
      endTick: world.tick + DERIVED.morph.durationTicks,
    };
    const first = applyDamage(
      world,
      source,
      victim,
      base,
      1,
      incomingEast,
      Cause.PulsePistol,
    );
    expect(first.finalDamage).toBe(base * BALANCE.matchup.runner.runner);
    expect(victim.hpFrac).toBe(
      1 - first.finalDamage / BALANCE.forms.runner.maxHp,
    );
    expect(world.events[0]).toMatchObject({
      attackerForm: Form.Runner,
      victimForm: Form.Runner,
    });
    victim.form = Form.Turret;
    victim.morph = {
      target: Form.Runner,
      endTick: world.tick + DERIVED.morph.durationTicks,
    };
    const second = applyDamage(
      world,
      source,
      victim,
      base,
      1,
      incomingEast,
      Cause.PulsePistol,
    );
    expect(second.finalDamage).toBe(
      base *
        BALANCE.matchup.runner.turret *
        BALANCE.forms.turret.frontArcDamageMult,
    );
    expect(world.events[1]).toMatchObject({
      attackerForm: Form.Runner,
      victimForm: Form.Turret,
    });
  });

  it('GR-6.2 pure helper does not mutate source, target, direction, or BALANCE', () => {
    const attacker = Object.freeze({ ...source });
    const defender = Object.freeze({ form: Form.Turret, aim: 0 });
    const direction = Object.freeze({ x: 1, y: 0 });
    const balanceBefore = structuredClone(BALANCE);
    calculateDamage(attacker, defender, base, 1, direction);
    expect(attacker).toEqual(source);
    expect(defender).toEqual({ form: Form.Turret, aim: 0 });
    expect(direction).toEqual(incomingEast);
    expect(BALANCE).toEqual(balanceBefore);
  });
});

describe('GR-6 authoritative damage application', () => {
  it('AT-DMG-05 kills at a tiny positive remainder and ignores later same-tick hits', () => {
    const { world, victim } = damageWorld();
    victim.hpFrac = base / BALANCE.forms.runner.maxHp + 1e-12;
    const first = applyDamage(
      world,
      source,
      victim,
      base,
      1,
      incomingWest,
      Cause.PulsePistol,
    );
    expect(first).toEqual({
      applied: true,
      finalDamage: base,
      tags: 0,
      lethal: true,
    });
    expect(victim.alive).toBe(false);
    expect(victim.hpFrac).toBe(0);
    expect(victim.damageLog).toEqual([
      { attackerId: source.id, tick: world.tick, amount: base },
    ]);
    expect(world.events).toHaveLength(1);
    expect(world.events[0]?.type).toBe('damage');
    const second = applyDamage(
      world,
      source,
      victim,
      base,
      1,
      incomingWest,
      Cause.PulsePistol,
    );
    expect(second).toEqual({
      applied: false,
      finalDamage: 0,
      tags: 0,
      lethal: false,
    });
    expect(victim.damageLog).toHaveLength(1);
    expect(world.events).toHaveLength(1);
  });

  it('GR-6.1 keeps exact nonlethal fractions and accepts dead owner snapshots', () => {
    const { world, attacker, victim } = damageWorld();
    attacker.alive = false;
    const hit = applyDamage(
      world,
      source,
      victim,
      base,
      1,
      incomingWest,
      Cause.PulsePistol,
    );
    expect(hit.applied).toBe(true);
    expect(hit.lethal).toBe(false);
    expect(victim.hpFrac).toBe(1 - base / BALANCE.forms.runner.maxHp);
    expect(world.events[0]).toEqual({
      type: 'damage',
      attackerId: source.id,
      attackerSeat: source.seat,
      attackerForm: source.form,
      victimId: victim.id,
      victimSeat: victim.seat,
      victimForm: Form.Runner,
      cause: Cause.PulsePistol,
      finalDamage: base,
      tags: 0,
      incomingDir: incomingWest,
    });
    const event = world.events[0];
    if (event?.type !== 'damage') throw new Error('missing damage event');
    expect(event.incomingDir).not.toBe(incomingWest);
  });

  it('GR-6.9 blocks dead, protected, COUNTDOWN, and RESULTS without side effects', () => {
    const { world, victim } = damageWorld();
    victim.morph = { target: Form.Beast, endTick: world.tick + 10 };
    const before = structuredClone(victim);
    victim.protectedEndTick = world.tick + 1;
    expect(
      applyDamage(
        world,
        source,
        victim,
        base,
        1,
        incomingWest,
        Cause.PulsePistol,
      ).applied,
    ).toBe(false);
    expect(victim.morph).toEqual(before.morph);
    expect(victim.hpFrac).toBe(before.hpFrac);
    expect(victim.damageLog).toEqual([]);
    expect(world.events).toEqual([]);
    victim.protectedEndTick = world.tick;
    world.phase = Phase.Countdown;
    expect(
      applyDamage(
        world,
        source,
        victim,
        base,
        1,
        incomingWest,
        Cause.PulsePistol,
      ).applied,
    ).toBe(false);
    world.phase = Phase.Results;
    expect(
      applyDamage(
        world,
        source,
        victim,
        base,
        1,
        incomingWest,
        Cause.PulsePistol,
      ).applied,
    ).toBe(false);
    world.phase = Phase.Playing;
    victim.alive = false;
    expect(
      applyDamage(
        world,
        source,
        victim,
        base,
        1,
        incomingWest,
        Cause.PulsePistol,
      ).applied,
    ).toBe(false);
    expect(victim.damageLog).toEqual([]);
    expect(world.events).toEqual([]);
    victim.alive = true;
    expect(
      applyDamage(
        world,
        source,
        victim,
        base,
        1,
        incomingWest,
        Cause.PulsePistol,
      ).applied,
    ).toBe(true);
  });

  it('GR-6.7 cancels a lethal victim morph without refund or death event', () => {
    const { world, victim } = damageWorld();
    victim.morph = { target: Form.Beast, endTick: world.tick + 10 };
    victim.hpFrac = base / BALANCE.forms.runner.maxHp;
    const fluxBefore = victim.flux;
    const hit = applyDamage(
      world,
      source,
      victim,
      base,
      1,
      incomingWest,
      Cause.PulsePistol,
    );
    expect(hit.lethal).toBe(true);
    expect(victim.morph).toBeNull();
    expect(victim.flux).toBe(fluxBefore);
    expect(world.events.map((event) => event.type)).toEqual(['damage']);
  });

  it('GR-6.11 keeps 150-tick entries, prunes 151-tick entries, and records each hit', () => {
    const { world, victim } = damageWorld();
    world.tick = 1000;
    victim.damageLog = [
      {
        attackerId: 'old',
        tick: world.tick - DERIVED.match.assistWindowTicks - 1,
        amount: 1,
      },
      {
        attackerId: 'edge',
        tick: world.tick - DERIVED.match.assistWindowTicks,
        amount: 2,
      },
    ];
    applyDamage(
      world,
      source,
      victim,
      BALANCE.weapons.scatterCannon.damagePerPellet,
      1,
      incomingWest,
      Cause.ScatterCannon,
    );
    applyDamage(
      world,
      source,
      victim,
      BALANCE.weapons.scatterCannon.damagePerPellet,
      1,
      incomingWest,
      Cause.ScatterCannon,
    );
    expect(victim.damageLog).toEqual([
      {
        attackerId: 'edge',
        tick: world.tick - DERIVED.match.assistWindowTicks,
        amount: 2,
      },
      {
        attackerId: source.id,
        tick: world.tick,
        amount: BALANCE.weapons.scatterCannon.damagePerPellet,
      },
      {
        attackerId: source.id,
        tick: world.tick,
        amount: BALANCE.weapons.scatterCannon.damagePerPellet,
      },
    ]);
    expect(world.events).toHaveLength(2);
    expect(world.events.every((event) => event.type === 'damage')).toBe(true);
  });
});
