import { AimSource, ClientAimSourceCode, DERIVED, GREYBOX_V1,
  InputButton, Mode, Phase, type InputFrame } from '@shiftborn/shared';
import { addPlayer, createWorld, localPredictStateFromPlayer,
  predictStep, step } from '@shiftborn/sim';
import { describe, expect, it } from 'vitest';
import { InputQueue } from '../src/net/inputQueue.js';

function wire(seq: number, buttons: number, intents: readonly number[] = []): number[] {
  return [seq, 0, 0, 0, buttons, ClientAimSourceCode.Mouse, 120,
    ...Array.from({ length: 8 }, (_, index) => intents[index] ?? 0)];
}
function input(seq: number, buttons: number): InputFrame {
  return { aimDist: 120, seq, moveX: 0, moveY: 0, aim: 0, buttons,
    aimSource: AimSource.Mouse };
}

describe('AT-NET-09 D-072 catch-up shot intent', () => {
  it('preserves the predicted 117/0 tag when catch-up applies frame 118', () => {
    const world = createWorld({ map: GREYBOX_V1, roomSeed: 37,
      mode: Mode.Frenzy });
    addPlayer(world, { id: 'local', name: 'Local', isBot: false, seat: 0 });
    world.phase = Phase.Playing;
    world.phaseEndTick = world.tick + DERIVED.match.durationTicks;
    const player = world.players[0];
    if (player === null || player === undefined) throw new Error('missing player');
    player.protectedEndTick = world.tick;
    // D-075: the shooter needs a gun; ammunition rules are covered by AT-AMMO tests.
    player.guns.pulsePistol = { owned: true, mag: 20, reserve: 0 };
    player.selectedTier.runner = 1;
    expect(player.gunTimers.pulsePistol).toBe(0);
    expect(player.nextShotIdx).toBe(0);

    // Client projects each newly sent input immediately at one step per frame.
    const initial = localPredictStateFromPlayer(player);
    const predicted117 = predictStep(initial, input(117, InputButton.Fire),
      world.map, { tick: world.tick, phase: world.phase, cover: world.cover });
    const predicted118 = predictStep(predicted117,
      input(118, InputButton.Fire), world.map,
      { tick: world.tick + 1, phase: world.phase, cover: world.cover });
    expect(predicted117.shotsThisTick).toMatchObject([
      { inputSeq: 117, shotIdx: 0 },
    ]);
    expect(predicted117.gunTimers.pulsePistol).toBeCloseTo(0.1333333333);
    expect(predicted118.shotsThisTick).toEqual([]);

    // A head-of-line burst reaches a four-frame buffer. §5.4 consumes 117
    // and 118 together, unions the rising edge, but uses newer held state.
    const queue = new InputQueue(() => 0);
    queue.receive([...wire(119, InputButton.Fire, [117]),
      ...wire(118, InputButton.Fire, [117]), ...wire(117, InputButton.Fire)]);
    queue.receive([...wire(120, InputButton.Fire, [117]),
      ...wire(119, InputButton.Fire, [117]),
      ...wire(118, InputButton.Fire, [117])]);
    expect(queue.frames.map((frame) => frame.seq)).toEqual([117, 118, 119, 120]);
    const consumed = queue.consume();
    expect(consumed.consumedSequences).toEqual([117, 118]);
    expect(consumed.pressedButtons).toBe(InputButton.Fire);
    expect(consumed.frame?.seq).toBe(118);
    if (consumed.frame === undefined) throw new Error('missing applied frame');

    const intent = queue.candidateShotIntent(consumed.frame);
    expect(intent).toBe(117);
    const events = step(world, [{ ...consumed.frame, shotIntentSeq: intent! }], {
      inputPressedButtonsBySeat: [consumed.pressedButtons],
    });
    const spawn = events.find((event) => event.type === 'projectileSpawn');
    expect(spawn).toMatchObject({ type: 'projectileSpawn',
      inputSeq: 117, shotIdx: 0 });
    queue.resolveShotIntent(consumed.frame.seq, intent);
    expect(queue.candidateShotIntent(queue.frames[0]!)).toBeNull();
    expect(player.gunTimers.pulsePistol).toBeCloseTo(0.1333333333);
    expect(player.lastShotInputSeq).toBe(117);
    expect(player.nextShotIdx).toBe(1);
    expect(predicted117.shotsThisTick[0]?.inputSeq)
      .toBe(spawn?.type === 'projectileSpawn' ? spawn.inputSeq : null);
  });
});
