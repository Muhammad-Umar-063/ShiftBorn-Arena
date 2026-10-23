import { AimSource, BALANCE, Form, GREYBOX_V1, InputButton, Mode,
  type InputFrame } from '@shiftborn/shared';
import { createWorld, step, type World } from '@shiftborn/sim';
import { ArenaRenderer } from './Renderer.js';
import type { EntitySnapshot, PlayerVisual } from './entityState.js';
import type { PresentationEvent } from './effects.js';

const root = document.querySelector<HTMLElement>('#visuals');
if (root === null) throw new Error('visual harness root missing');
const toolbar = document.createElement('div');
toolbar.style.cssText = 'position:absolute;z-index:3;top:8px;left:8px;right:8px;display:flex;gap:5px;flex-wrap:wrap;padding:8px;background:#101820d9;border:1px solid #73858b';
const info = document.createElement('div');
info.style.cssText = 'position:absolute;z-index:3;bottom:8px;left:8px;padding:8px;background:#101820d9';
const stage = document.createElement('div');
stage.style.cssText = 'position:fixed;inset:0';
root.append(stage, toolbar, info);
const renderer = new ArenaRenderer(stage, () => { info.textContent = 'WebGL failed'; });
let fixtureTick = 0;
let fixtureAt = performance.now();
let liveClock = false;
// Scripted visual fixtures supply their own tick source; production uses Connection.clock.
renderer.setClockEstimate(() => fixtureTick +
  (liveClock ? (performance.now() - fixtureAt) * BALANCE.tick.rateHz / 1000 : 0) +
  BALANCE.net.interpDelayMs * BALANCE.tick.rateHz / 1000);

const basePlayer = (id: string, name: string, seat: number, x: number, y: number,
  form: number): PlayerVisual => ({
  id, name, seat, isBot: seat !== 0, controller: seat === 0 ? 0 : 1,
  connected: seat === 0, alive: true, x, y, vx: 0, vy: 0,
  aim: seat === 2 ? Math.PI : 0,
  form, hpFrac: 1, flux: 60, kos: 0, deaths: 0, assists: 0, points: 0,
  damageDealt: 0, lastInputSeq: 0, morphTarget: -1, morphEndTick: 0,
  abilityId: -1, abilityPhase: 0, abilityStartTick: 0, abilityEndTick: 0,
  stunEndTick: 0, knockbackEndTick: 0, protectedEndTick: 0,
});

function fixture(kind: string): { snapshot: EntitySnapshot; events: PresentationEvent[] } {
  const tick = 300;
  const local = basePlayer('local', 'YOU', 0, -24, 6, 0);
  const beast = basePlayer('beast', 'BOT BEAST', 1, -21, 7, 1);
  const turret = basePlayer('turret', 'BOT TURRET', 2, -17, 5, 2);
  const all = kind === 'all';
  const morph = all || kind === 'morph';
  const protection = all || kind === 'protection';
  const stun = all || kind === 'stun';
  const ram = all || kind === 'ramWindup' || kind === 'ramCharge';
  const rail = all || kind === 'railCharge';
  const dash = kind === 'dash';
  const knockback = kind === 'knockback';
  const players: PlayerVisual[] = [
    { ...local, morphTarget: morph ? 1 : -1, morphEndTick: morph ? tick + 15 : 0,
      protectedEndTick: protection ? tick + 60 : 0,
      abilityId: dash ? 0 : -1, abilityStartTick: dash ? tick : 0,
      abilityEndTick: dash ? tick + 6 : 0 },
    { ...beast, stunEndTick: stun ? tick + 60 : 0,
      knockbackEndTick: knockback ? tick + 6 : 0,
      abilityId: ram ? 1 : -1, abilityPhase: kind === 'ramCharge' || all ? 2 : 1,
      abilityStartTick: ram ? tick : 0,
      abilityEndTick: ram ? tick + 25 : 0 },
    { ...turret, abilityId: rail ? 2 : -1,
      abilityPhase: rail ? 1 : 0, abilityStartTick: rail ? tick - 6 : 0,
      abilityEndTick: rail ? tick + 18 : 0 },
  ];
  if (kind === 'fullRoom') {
    for (let seat = 3; seat < BALANCE.match.seats; seat += 1)
      players.push(basePlayer(`bot-${seat}`, `BOT ${seat}`, seat,
        -24 + seat * 1.8, seat % 2 === 0 ? 8 : 4, seat % 3));
  }
  const shards = all || kind === 'shards' ? [
    { id: 'small', x: -19, y: 7, kind: 0 as const },
    { id: 'large', x: -18, y: 6, kind: 1 as const },
  ] : [];
  const clusters = all || kind === 'cluster' ? [
    { pointIndex: 0, spawnTick: tick + BALANCE.shards.announceS * BALANCE.tick.rateHz },
  ] : [];
  const cover = GREYBOX_V1.cover.map((item, index) => ({ id: item.id,
    intact: !(index === 0 && (all || kind === 'rubble' || kind === 'rebuildPulse')),
    rebuildTick: index === 0 && kind === 'rebuildPulse' ? tick + 60 : tick + 900 }));
  const events: PresentationEvent[] = kind === 'railRelease'
    ? [{ kind: 'railRelease', seat: 2, tick, x1: -17, y1: 5, x2: -26, y2: 5 }]
    : kind === 'ramImpact'
      ? [{ kind: 'ramImpact', seat: 1, tick, x: -21, y: 7 }] : [];
  return { snapshot: { tick, matchId: `fixture-${kind}`, localPlayerId: 'local',
    players, shards, clusters, cover }, events };
}

function worldSnapshot(world: World): EntitySnapshot {
  const players: PlayerVisual[] = world.players.flatMap((player) => player === null ? [] : [{
    ...basePlayer(player.id, player.name, player.seat, player.pos.x, player.pos.y,
      player.form === Form.Beast ? 1 : player.form === Form.Turret ? 2 : 0),
    alive: player.alive, aim: player.aim, flux: player.flux,
    vx: player.vel.x, vy: player.vel.y,
    morphTarget: player.morph === null ? -1 : player.morph.target === Form.Beast ? 1
      : player.morph.target === Form.Turret ? 2 : 0,
    morphEndTick: player.morph?.endTick ?? 0,
    abilityId: player.ability?.id === 'dash' ? 0 : -1,
    abilityStartTick: player.ability?.startTick ?? 0,
    abilityEndTick: player.ability?.endTick ?? 0,
    stunEndTick: player.stunEndTick,
    knockbackEndTick: player.knockback?.endTick ?? 0,
    protectedEndTick: player.protectedEndTick,
  }]);
  return { tick: world.tick, matchId: world.matchId, localPlayerId: 'local', players,
    shards: world.shards.map((shard) => ({ id: String(shard.id), x: shard.x,
      y: shard.y, kind: shard.kind === 1 ? 1 : 0 })),
    clusters: world.clusters.filter((cluster) => cluster.state === 'announced')
      .map((cluster) => ({ pointIndex: cluster.pointIndex, spawnTick: cluster.spawnTick })),
    cover: world.cover.map((cover) => ({ id: cover.id, intact: cover.intact,
      rebuildTick: 0 })) };
}

let timer: ReturnType<typeof setInterval> | null = null;
function show(snapshot: EntitySnapshot, events: readonly PresentationEvent[] = []): void {
  const local = snapshot.players.find((player) => player.id === snapshot.localPlayerId);
  if (local === undefined) return;
  renderer.setView({ camera: { player: { x: local.x, y: local.y },
    aimRadians: local.aim, form: local.form === 1 ? 'beast'
      : local.form === 2 ? 'turret' : 'runner', inputScheme: 'mouse',
    cursorDistanceM: 6, reducedMotion: true, perspective: 'tpp' },
  visiblePlayers: snapshot.players.map((player) => ({ x: player.x, y: player.y })) });
  renderer.setEntities(snapshot);
  fixtureTick = snapshot.tick;
  fixtureAt = performance.now();
  renderer.ingestVisualEvents(events);
}
function select(kind: string): void {
  if (timer !== null) { clearInterval(timer); timer = null; }
  liveClock = kind === 'live';
  if (kind === 'live') {
    const world = createWorld({ map: GREYBOX_V1, roomSeed: 42, mode: Mode.Frenzy,
      initialPlayers: [{ id: 'local', seat: 0, name: 'YOU', isBot: false },
        { id: 'beast', seat: 1, name: 'SCRIPTED BOT', isBot: true }] });
    let seq = 1;
    timer = setInterval(() => {
      const buttons = world.tick === 95 ? InputButton.MorphBeast
        : world.tick === 125 ? InputButton.Ability : 0;
      const frame: InputFrame = { aimDist: 120, seq, moveX: world.tick % 90 < 45 ? 127 : -127,
        moveY: 0, aim: 0, buttons, aimSource: AimSource.Mouse };
      const idle: InputFrame = { ...frame, moveX: 0, buttons: 0 };
      step(world, [frame, idle], {}); seq += 1;
      show(worldSnapshot(world));
    }, 1000 / BALANCE.tick.rateHz);
    info.textContent = 'LIVE SIM: scripted input frames drive real morph, Dash, shards and protection. No bot AI.';
  } else {
    const { snapshot, events } = fixture(kind);
    show(snapshot, events);
    info.textContent = `PRESENTATION FIXTURE: ${kind}. Later gameplay producers are not claimed here.`;
  }
}
const scenarios = ['live', 'all', 'fullRoom', 'morph', 'protection', 'stun', 'dash',
  'knockback', 'ramWindup', 'ramCharge', 'ramImpact', 'railCharge',
  'railRelease', 'shards', 'cluster', 'rubble', 'rebuildPulse'];
for (const kind of scenarios) {
  const button = document.createElement('button');
  button.textContent = kind;
  button.dataset.scenario = kind;
  button.addEventListener('click', () => select(kind));
  toolbar.append(button);
}
Object.assign(window, { __visualHarness: { renderer, select,
  dispose: () => { if (timer !== null) clearInterval(timer); renderer.dispose(); } } });
select(new URLSearchParams(location.search).get('scenario') ?? 'all');
