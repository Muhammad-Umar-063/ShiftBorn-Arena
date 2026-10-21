import {
  AimSource,
  Controller,
  Form,
  GREYBOX_V1,
  Mode,
  Phase,
} from '@shiftborn/shared';
import { addPlayer, createWorld, hashWorld, startDash } from '@shiftborn/sim';
import { describe, expect, it } from 'vitest';
import {
  abilityCode,
  abilityPhaseCode,
  aimSourceCode,
  controllerCode,
  formCode,
  mirrorWorld,
  modeCode,
  phaseCode,
  zoneStateCode,
} from '../src/rooms/mirror.js';
import { ArenaState } from '../src/rooms/schema.js';

function fixture() {
  const world = createWorld({
    map: GREYBOX_V1,
    roomSeed: 73,
    mode: Mode.Frenzy,
  });
  const state = new ArenaState();
  return { world, state };
}

describe('T-021 NETWORK_PROTOCOL §4.2 mirror', () => {
  it('uses every documented code without inventing a Bot aim code', () => {
    expect(
      [Phase.Countdown, Phase.Playing, Phase.Results].map(phaseCode),
    ).toEqual([0, 1, 2]);
    expect([Mode.Frenzy, Mode.ZoneFrenzy].map(modeCode)).toEqual([0, 1]);
    expect(
      [Controller.Human, Controller.Bot, Controller.Proxy].map(controllerCode),
    ).toEqual([0, 1, 2]);
    expect([Form.Runner, Form.Beast, Form.Turret].map(formCode)).toEqual([
      0, 1, 2,
    ]);
    expect(
      [null, 'dash', 'ramCharge', 'railShot'].map((id) =>
        abilityCode(id as Parameters<typeof abilityCode>[0]),
      ),
    ).toEqual([-1, 0, 1, 2]);
    expect(
      ['none', 'windup', 'active'].map((phase) =>
        abilityPhaseCode(phase as Parameters<typeof abilityPhaseCode>[0]),
      ),
    ).toEqual([0, 1, 2]);
    expect(
      ['empty', 'held', 'contested'].map((state) =>
        zoneStateCode(state as Parameters<typeof zoneStateCode>[0]),
      ),
    ).toEqual([0, 1, 2]);
    expect(
      [
        AimSource.Mouse,
        AimSource.Keys,
        AimSource.Lock,
        AimSource.Touch,
        AimSource.Pad,
        AimSource.Bot,
      ].map(aimSourceCode),
    ).toEqual([0, 1, 2, 3, 4, null]);
  });

  it('projects complete initial state, preserves source and gives zero unchanged mutations', () => {
    const { world, state } = fixture();
    const before = hashWorld(world);
    const mutations = mirrorWorld(world, state);
    expect(mutations).toBeGreaterThan(0);
    expect(state.tick).toBe(world.tick);
    expect(state.phase).toBe(phaseCode(world.phase));
    expect(state.phaseEndTick).toBe(world.phaseEndTick);
    expect(state.mode).toBe(0);
    expect(state.matchId).toBe(world.matchId);
    expect(state.players.size).toBe(0);
    expect(state.shards.size).toBe(world.shards.length);
    expect(state.cover.length).toBe(world.cover.length);
    expect(state.zone.active).toBe(false);
    expect(state.zone.point).toBe(-1);
    const settings = state.settings;
    const zone = state.zone;
    const cover = state.cover[0];
    const shard = state.shards.get(String(world.shards[0]?.id));
    expect(mirrorWorld(world, state)).toBe(0);
    expect(state.settings).toBe(settings);
    expect(state.zone).toBe(zone);
    expect(state.cover[0]).toBe(cover);
    expect(state.shards.get(String(world.shards[0]?.id))).toBe(shard);
    expect(hashWorld(world)).toBe(before);
  });

  it('updates and removes players while retaining per-player identity', () => {
    const { world, state } = fixture();
    addPlayer(world, { id: 'p', name: 'Player', isBot: false, seat: 0 });
    const player = world.players[0];
    if (player === null || player === undefined)
      throw new Error('missing player');
    player.pos = { x: 3.25, y: -2.5 };
    player.vel = { x: 1, y: 2 };
    player.morph = { target: Form.Beast, endTick: 55 };
    player.ability = startDash(12, { x: 1, y: 0 });
    player.stats.damageDealtByForm[Form.Runner] = 3;
    player.stats.damageDealtByForm[Form.Beast] = 4;
    player.stats.damageDealtByForm[Form.Turret] = 5;
    player.lastInputSeq = -1;
    player.lastButtonInputSeq = 12;
    player.lastHeldButtons = 5;
    player.lastShotInputSeq = 11;
    player.nextShotIdx = 3;
    player.weapon[Form.Runner].nextShotIn = 0.1;
    player.weapon[Form.Beast].nextShotIn = 0.2;
    player.weapon[Form.Turret].nextShotIn = 0.3;
    player.ccImmuneEndTick = 72;
    mirrorWorld(world, state, {
      connectedIds: new Set(['p']),
      hostId: 'p',
      settings: { botFill: true, nextMode: Mode.ZoneFrenzy },
    });
    const record = state.players.get('p');
    expect(record).toMatchObject({
      id: 'p',
      name: 'Player',
      seat: 0,
      connected: true,
      x: 3.25,
      y: -2.5,
      vx: 1,
      vy: 2,
      morphTarget: 1,
      morphEndTick: 55,
      abilityId: 0,
      abilityPhase: 2,
      abilityStartTick: 12,
      damageDealt: 12,
      lastInputSeq: 0,
      lastButtonInputSeq: 12,
      lastHeldButtons: 5,
      lastShotInputSeq: 11,
      nextShotIdx: 3,
      ccImmuneEndTick: 72,
    });
    expect(record?.weaponRunnerNextShotIn).toBeCloseTo(0.1);
    expect(record?.weaponBeastNextShotIn).toBeCloseTo(0.2);
    expect(record?.weaponTurretNextShotIn).toBeCloseTo(0.3);
    expect(state.hostId).toBe('p');
    expect(state.settings.botFill).toBe(true);
    expect(state.settings.nextMode).toBe(1);
    player.pos = { ...player.pos, x: 4 };
    player.ability = null;
    player.morph = null;
    player.aimSource = AimSource.Bot;
    mirrorWorld(world, state, { connectedIds: new Set(['p']) });
    expect(state.players.get('p')).toBe(record);
    expect(record?.x).toBe(4);
    expect(record?.morphTarget).toBe(-1);
    expect(record?.abilityId).toBe(-1);
    expect(record?.abilityPhase).toBe(0);
    expect(record?.aimSource).toBe(0);
    player.pos = { x: 0.1, y: 0.2 };
    mirrorWorld(world, state, { connectedIds: new Set(['p']) });
    expect(mirrorWorld(world, state, { connectedIds: new Set(['p']) })).toBe(0);
    world.players[0] = null;
    mirrorWorld(world, state);
    expect(state.players.has('p')).toBe(false);
  });

  it('reconciles shards, cover and announced clusters in stable order', () => {
    const { world, state } = fixture();
    mirrorWorld(world, state);
    const shard = world.shards[0];
    if (shard === undefined) throw new Error('missing shard');
    const shardState = state.shards.get(String(shard.id));
    world.shards[0] = { ...shard, value: shard.value + 1 };
    const coverSource = world.cover[0];
    const firstCluster = world.clusters[0];
    const thirdCluster = world.clusters[2];
    if (
      coverSource === undefined ||
      firstCluster === undefined ||
      thirdCluster === undefined
    )
      throw new Error('missing cover or clusters');
    coverSource.intact = false;
    thirdCluster.state = 'announced';
    thirdCluster.spawnTick = 70;
    firstCluster.state = 'announced';
    firstCluster.spawnTick = 60;
    const cover = state.cover[0];
    mirrorWorld(world, state);
    expect(state.shards.get(String(shard.id))).toBe(shardState);
    expect(shardState?.value).toBe(shard.value + 1);
    expect(state.cover[0]).toBe(cover);
    expect(cover?.intact).toBe(false);
    expect(cover?.rebuildTick).toBe(0);
    expect([...state.clusterAnnounces].map((entry) => entry.spawnTick)).toEqual(
      [60, 70],
    );
    const announcement = state.clusterAnnounces[0];
    expect(mirrorWorld(world, state)).toBe(0);
    expect(state.clusterAnnounces[0]).toBe(announcement);
    world.shards.shift();
    firstCluster.state = 'waiting';
    mirrorWorld(world, state);
    expect(state.shards.has(String(shard.id))).toBe(false);
    expect(state.clusterAnnounces.length).toBe(1);
  });
});
