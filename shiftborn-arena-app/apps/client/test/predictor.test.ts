import { AimSource, BALANCE, Form, GREYBOX_V1, InputButton, Mode,
  Phase, type ClientInputFrame } from '@shiftborn/shared';
import { createMapRuntime, createWorld, localPredictStateFromPlayer,
  predictStep, type LocalPredictState } from '@shiftborn/sim';
import { describe, expect, it } from 'vitest';
import type { AuthoritativeRead } from '../src/net/messageValidation.js';
import { Predictor } from '../src/predict/Predictor.js';
import { readPredictionAuthority, type PredictionAuthority } from '../src/predict/authoritative.js';

const map = createMapRuntime(GREYBOX_V1);
function base(): LocalPredictState {
  const world = createWorld({ map: GREYBOX_V1, roomSeed: 73, mode: Mode.Frenzy,
    initialPlayers: [{ id: 'p', name: 'Pilot', seat: 0, isBot: false }] });
  const player = world.players[0];
  if (player === null || player === undefined) throw new Error('missing player');
  player.pos = { x: -24, y: 0 };
  player.protectedEndTick = 0;
  return localPredictStateFromPlayer(player);
}
function frame(seq: number, buttons = 0, moveX = 0, moveY = 0): ClientInputFrame {
  return { aimDist: 120, seq, buttons, moveX, moveY, aim: 0, aimSource: AimSource.Mouse };
}
function authority(state: LocalPredictState, tick: number,
  respawnTick = 0): PredictionAuthority {
  return { tick, matchId: 'match', playerId: 'p', phase: Phase.Playing,
    cover: GREYBOX_V1.cover.map(({ id }) => ({ id, intact: true })),
    respawnTick, state: structuredClone(state) };
}

describe('T-035 D-071 authoritative restore', () => {
  it('projects every predictable field from a detached version-5 patch', () => {
    const state = base();
    state.gunTimers.pulsePistol = 0.17;
    state.guns.ricochetDisc = { owned: true, mag: 5, reserve: 16 };
    state.selectedTier.runner = 2;
    state.reload = { gun: 'ricochetDisc', endTick: 130 };
    state.swapReadyTick = 95;
    state.lastHeldButtons = InputButton.Fire;
    state.lastButtonInputSeq = 17;
    state.lastShotInputSeq = 16;
    state.nextShotIdx = 2;
    const raw = { locomotion: { aimDist: 120, sprinting: false },
      alive: state.alive, x: state.pos.x, y: state.pos.y,
      vx: state.vel.x, vy: state.vel.y, aim: state.aim, form: 0,
      morphTarget: -1, morphEndTick: 0, morphReadyTick: state.morphReadyTick,
      abilityId: -1, abilityPhase: 0, abilityStartTick: 0, abilityEndTick: 0,
      abilityDirX: 0, abilityDirY: 0,
      abilityReadyRunner: state.abilityReadyTick.runner,
      abilityReadyBeast: state.abilityReadyTick.beast,
      abilityReadyTurret: state.abilityReadyTick.turret,
      gunOwnedMask: 2, gunMag: [0, 5, 0, 0, 0, 0], gunReserve: [0, 16, 0, 0, 0, 0],
      gunNextShotIn: [0.17, 0, 0, 0, 0, 0],
      selectedRunner: 2, selectedBeast: 0, selectedTurret: 0,
      reloadGun: 1, reloadEndTick: 130, swapReadyTick: 95,
      meleeActive: false, meleeStartTick: 0, meleeStrikeTick: 0, meleeEndTick: 0,
      heat: state.heat,
      overheatEndTick: state.overheatEndTick, stunEndTick: state.stunEndTick,
      ccImmuneEndTick: state.ccImmuneEndTick, knockbackEndTick: 0,
      kbvx: 0, kbvy: 0, protectedEndTick: 0, respawnTick: 0,
      flux: state.authoritativeFlux, lastInputSeq: 17,
      lastButtonInputSeq: 17, lastHeldButtons: InputButton.Fire,
      lastShotInputSeq: 16, nextShotIdx: 2, aimSource: 0, unlockedMask: 1,
    };
    const read: AuthoritativeRead = { tick: 100, phase: 1, matchId: 'match',
      players: { p: { id: 'p', name: 'Pilot', seat: 0, isBot: false,
        controller: 0, connected: true, alive: true, x: raw.x, y: raw.y,
        aim: raw.aim, form: 0, hpFrac: 1, flux: raw.flux, kos: 0,
        deaths: 0, assists: 0, points: 0, damageDealt: 0, lastInputSeq: 17 } },
      full: { players: { p: raw },
        cover: GREYBOX_V1.cover.map(() => ({ intact: true })) } };
    const before = JSON.stringify(read);
    const projected = readPredictionAuthority(read, 'p');
    expect(JSON.stringify(read)).toBe(before);
    expect(projected?.state).toMatchObject({ gunTimers: state.gunTimers,
      guns: state.guns, selectedTier: state.selectedTier, reload: state.reload,
      swapReadyTick: 95, melee: null,
      lastButtonInputSeq: 17, lastHeldButtons: InputButton.Fire,
      lastShotInputSeq: 16, nextShotIdx: 2, ccImmuneEndTick: state.ccImmuneEndTick });
    raw.x = 99;
    expect(projected?.state.pos.x).toBe(-24);
    // D-076: malformed ammunition or ownership is rejected before replay.
    for (const patch of [
      { gunMag: [0, 9, 0, 0, 0, 0] },
      { gunReserve: [1, 16, 0, 0, 0, 0] },
      { gunOwnedMask: 64 },
      { locomotion: { aimDist: 256, sprinting: false } },
      { locomotion: { aimDist: 120, sprinting: 1 } },
      { locomotion: undefined },
      { gunNextShotIn: [0, 0, 0] },
      { reloadGun: 6 },
      { selectedBeast: 3 },
    ]) {
      const broken: AuthoritativeRead = { ...read, full: { ...read.full,
        players: { p: { ...raw, x: 0, ...patch } } } };
      expect(readPredictionAuthority(broken, 'p'), JSON.stringify(patch)).toBeNull();
    }
    expect(JSON.stringify(read)).not.toBe(before);
    expect(readPredictionAuthority({ ...read, full: { ...read.full,
      players: { p: { ...raw, gunNextShotIn: undefined } } } }, 'p')).toBeNull();
  });
});

describe('T-035 AT-NET-06/07 predictor mechanics', () => {
  it('drops acknowledgements and replays remaining frames in sequence without sending', () => {
    const initial = base();
    const first = frame(1, 0, 1);
    const second = frame(2, 0, 1);
    const predictor = new Predictor(map);
    predictor.adopt(authority(initial, 100), 0);
    predictor.onFrame(first);
    predictor.onFrame(second);
    const s1 = predictStep(initial, first, map,
      { tick: 100, phase: Phase.Playing, cover: authority(initial, 100).cover });
    const s2 = predictStep(s1, second, map,
      { tick: 101, phase: Phase.Playing, cover: authority(initial, 100).cover });
    expect(predictor.state).toEqual(s2);
    predictor.adopt(authority(s1, 101), 0);
    expect(predictor.pendingSequences).toEqual([2]);
    expect(predictor.state).toEqual(s2);
    expect(initial.lastInputSeq).toBe(-1);
    predictor.dispose();
  });

  it('uses inclusive Euclidean snap and visual-only 100 ms smoothing', () => {
    const initial = base();
    const predictor = new Predictor(map);
    predictor.adopt(authority(initial, 100), 0);
    const justBelow = structuredClone(initial);
    justBelow.pos = { ...justBelow.pos,
      x: justBelow.pos.x + BALANCE.net.smoothErrorM - 0.001 };
    predictor.adopt(authority(justBelow, 101), 0);
    expect(predictor.correctionCount).toBe(0);
    expect(predictor.presentation(0)?.x).toBeCloseTo(initial.pos.x);
    expect(predictor.presentation(BALANCE.net.smoothMs)?.x).toBeCloseTo(justBelow.pos.x);
    expect(predictor.state?.pos.x).toBeCloseTo(justBelow.pos.x);
    const exact = structuredClone(justBelow);
    exact.pos = { ...exact.pos, x: initial.pos.x + BALANCE.net.smoothErrorM };
    predictor.adopt(authority(exact, 102), BALANCE.net.smoothMs);
    // The previous offset has finished, so this update is only 0.001 m.
    expect(predictor.correctionCount).toBe(0);
    const diagonal = structuredClone(exact);
    diagonal.pos = { x: diagonal.pos.x + 0.36, y: diagonal.pos.y + 0.36 };
    predictor.adopt(authority(diagonal, 103), BALANCE.net.smoothMs * 2);
    expect(predictor.correctionCount).toBe(1);
    expect(predictor.presentation(BALANCE.net.smoothMs * 2)?.x)
      .toBeCloseTo(diagonal.pos.x);
    const boundary = new Predictor(map);
    boundary.adopt(authority(initial, 100), 0);
    boundary.adopt(authority(exact, 101), 0);
    expect(boundary.correctionCount).toBe(1);
    const above = new Predictor(map);
    above.adopt(authority(initial, 100), 0);
    above.adopt(authority({ ...initial, pos: {
      x: initial.pos.x + BALANCE.net.smoothErrorM + 0.001,
      y: initial.pos.y } }, 101), 0);
    expect(above.correctionCount).toBe(1);
  });

  it('uses the current displayed pose for repeated corrections and snaps teleports', () => {
    const initial = base();
    const predictor = new Predictor(map);
    predictor.adopt(authority(initial, 100), 0);
    const first = structuredClone(initial);
    first.pos = { ...first.pos, x: first.pos.x + 0.4 };
    predictor.adopt(authority(first, 101), 0);
    expect(predictor.presentation(50)?.x).toBeCloseTo(initial.pos.x + 0.2);
    const second = structuredClone(initial);
    second.pos = { ...second.pos, x: second.pos.x + 0.8 };
    predictor.adopt(authority(second, 102), 50);
    expect(predictor.correctionCount).toBe(1);
    expect(predictor.presentation(50)?.x).toBeCloseTo(second.pos.x);
    const teleported = structuredClone(second);
    teleported.pos = { ...teleported.pos, x: teleported.pos.x + 5.01 };
    predictor.adopt(authority(teleported, 103), 60);
    expect(predictor.presentation(60)?.x).toBeCloseTo(teleported.pos.x);
    expect(predictor.correctionCount).toBe(1);
    expect(predictor.pendingSequences).toEqual([]);
  });

  it('immediately rejects acknowledged morphs and hard-resets death/respawn/recovery', () => {
    const initial = base();
    // D-074 unlocks are authoritative inputs; this test needs Beast available.
    initial.unlocked.beast = true;
    const predictor = new Predictor(map);
    const notices: string[] = [];
    predictor.subscribe((notice) => notices.push(notice.kind));
    predictor.adopt(authority(initial, 100), 0);
    predictor.onFrame(frame(1, InputButton.MorphBeast));
    expect(predictor.state?.morph?.target).toBe(Form.Beast);
    const rejected = structuredClone(initial);
    rejected.lastInputSeq = 1;
    predictor.adopt(authority(rejected, 101), 0);
    expect(notices).toEqual(['rejectedMorph']);
    expect(predictor.presentation(0)?.form).toBe(Form.Runner);
    predictor.onFrame(frame(2, 0, 1));
    expect(predictor.pendingSequences).toEqual([2]);
    const dead = structuredClone(rejected);
    dead.alive = false;
    predictor.adopt(authority(dead, 102), 0);
    expect(predictor.pendingSequences).toEqual([]);
    predictor.onFrame(frame(3, 0, 1));
    expect(predictor.pendingSequences).toEqual([]);
    const beforeRespawn = predictor.correctionCount;
    const respawned = structuredClone(initial);
    respawned.pos = { x: 20, y: 0 };
    predictor.adopt(authority(respawned, 103, 103), 0);
    expect(predictor.presentation(0)?.x).toBe(20);
    expect(predictor.correctionCount).toBe(beforeRespawn);
    predictor.reset();
    expect(predictor.presentation(0)).toBeNull();
    predictor.adopt(authority(initial, 104), 0);
    expect(predictor.pendingSequences).toEqual([]);
    predictor.dispose();
  });
});
