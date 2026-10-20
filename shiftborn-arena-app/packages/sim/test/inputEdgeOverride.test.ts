import {
  AimSource,
  Form,
  InputButton,
  Phase,
  type InputFrame,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { step } from '../src/step.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';

const player = { id: 'edge-player', name: 'Edge', isBot: false, seat: 0 };
function frame(seq: number, buttons: number): InputFrame {
  return {
    seq,
    moveX: 0,
    moveY: 0,
    aim: 0,
    buttons,
    aimSource: AimSource.Mouse,
  };
}

describe('T-022 StepContext merged input edges', () => {
  it('AT-NET-03 applies a press released in the newer frame exactly once', () => {
    const world = makeTestWorld({ seed: 70, players: [player] });
    world.phase = Phase.Playing;
    const record = world.players[0];
    if (record === null || record === undefined) throw new Error('missing player');
    record.alive = true;
    record.flux = 100;
    const events = step(world, [frame(2, 0)], {
      inputPressedButtonsBySeat: [InputButton.MorphBeast],
    });
    expect(events.filter((event) => event.type === 'morphStart')).toHaveLength(1);
    expect(record.morph?.target).toBe(Form.Beast);
    expect(record.lastInputSeq).toBe(2);
    expect(record.lastButtonInputSeq).toBe(2);
    expect(record.lastHeldButtons).toBe(0);
    expect(
      step(world, [frame(2, 0)], { inputPressedButtonsBySeat: [0] }).filter(
        (event) => event.type === 'morphStart',
      ),
    ).toHaveLength(0);
  });

  it('keeps default edge derivation when no server override is supplied', () => {
    const world = makeTestWorld({ seed: 71, players: [player] });
    world.phase = Phase.Playing;
    const record = world.players[0];
    if (record === null || record === undefined) throw new Error('missing player');
    record.alive = true;
    record.flux = 100;
    const events = step(world, [frame(1, InputButton.MorphTurret)], {});
    expect(events.some((event) => event.type === 'morphStart')).toBe(true);
    expect(record.morph?.target).toBe(Form.Turret);
  });

  it('AT-NET-03 starts Dash from a released ability edge without leaving ability held', () => {
    const world = makeTestWorld({ seed: 72, players: [player] });
    world.phase = Phase.Playing;
    const record = world.players[0];
    if (record === null || record === undefined) throw new Error('missing player');
    record.alive = true;
    const events = step(world, [frame(2, 0)], {
      inputPressedButtonsBySeat: [InputButton.Ability],
    });
    expect(events.some((event) => event.type === 'abilityStart')).toBe(true);
    expect(record.lastHeldButtons).toBe(0);
  });
});
