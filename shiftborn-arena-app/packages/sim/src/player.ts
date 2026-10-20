import {
  AbilityId,
  AimSource,
  BALANCE,
  Controller,
  Form,
  Phase,
  WeaponId,
} from '@shiftborn/shared';
import type { Vec2 } from './math/vec2.js';
import { emitEvent } from './events.js';
import { chooseSpawnPoint } from './spawns.js';
import { removeOwnedProjectiles } from './projectiles.js';
import { grantSpawnProtection } from './protection.js';
import type { World } from './world.js';

export type AbilityState = {
  readonly id: typeof AbilityId.Dash;
  readonly startTick: number;
  readonly endTick: number;
  readonly dirX: number;
  readonly dirY: number;
};

export interface PlayerStats {
  kos: number;
  deaths: number;
  assists: number;
  points: number;
  zonePoints: number;
  damageDealtByForm: Record<Form, number>;
  damageTaken: number;
  shotsFired: {
    byWeapon: Record<WeaponId, number>;
    byAimSource: Record<AimSource, number>;
  };
  hits: {
    byWeapon: Record<WeaponId, number>;
    byAimSource: Record<AimSource, number>;
  };
  morphs: { count: number; byTargetForm: Record<Form, number> };
  timeAliveByFormTicks: Record<Form, number>;
  fluxCollectedFromShards: number;
  fluxSpent: number;
  abilitiesUsed: Record<AbilityId, number>;
  abilityHits: Record<AbilityId, number>;
  timeInZoneAloneTicks: number;
  timeInZoneContestedTicks: number;
  longestLifeTicks: number;
}

export interface PlayerRecord {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly isBot: boolean;
  controller: Controller;
  alive: boolean;
  pos: Vec2;
  vel: Vec2;
  aim: number;
  form: Form;
  morph: { target: Form; endTick: number } | null;
  morphReadyTick: number;
  hpFrac: number;
  flux: number;
  ability: AbilityState | null;
  abilityReadyTick: Record<Form, number>;
  weapon: Record<Form, { nextShotIn: number }>;
  heat: number;
  overheatEndTick: number;
  stunEndTick: number;
  ccImmuneEndTick: number;
  knockback: { vel: Vec2; endTick: number } | null;
  protectedEndTick: number;
  respawnTick: number;
  respawnFlux: number | null;
  fluxRegenAnchor: number;
  fluxRegenTicks: number;
  damageLog: { attackerId: string; tick: number; amount: number }[];
  lastInputSeq: number;
  lastButtonInputSeq: number;
  lastHeldButtons: number;
  lastShotInputSeq: number;
  nextShotIdx: number;
  aimSource: AimSource;
  stats: PlayerStats;
}

function zeroForms(): Record<Form, number> {
  return { [Form.Runner]: 0, [Form.Beast]: 0, [Form.Turret]: 0 };
}

function zeroWeapons(): Record<WeaponId, number> {
  return {
    [WeaponId.PulsePistol]: 0,
    [WeaponId.ScatterCannon]: 0,
    [WeaponId.RailRepeater]: 0,
  };
}

function zeroAimSources(): Record<AimSource, number> {
  return {
    [AimSource.Mouse]: 0,
    [AimSource.Keys]: 0,
    [AimSource.Lock]: 0,
    [AimSource.Bot]: 0,
    [AimSource.Touch]: 0,
    [AimSource.Pad]: 0,
  };
}

function zeroAbilities(): Record<AbilityId, number> {
  return {
    [AbilityId.Dash]: 0,
    [AbilityId.RamCharge]: 0,
    [AbilityId.RailShot]: 0,
  };
}

// GR-12.4: only initialization is implemented here; accounting belongs to later tasks.
export function createPlayerStats(): PlayerStats {
  return {
    kos: 0,
    deaths: 0,
    assists: 0,
    points: 0,
    zonePoints: 0,
    damageDealtByForm: zeroForms(),
    damageTaken: 0,
    shotsFired: { byWeapon: zeroWeapons(), byAimSource: zeroAimSources() },
    hits: { byWeapon: zeroWeapons(), byAimSource: zeroAimSources() },
    morphs: { count: 0, byTargetForm: zeroForms() },
    timeAliveByFormTicks: zeroForms(),
    fluxCollectedFromShards: 0,
    fluxSpent: 0,
    abilitiesUsed: zeroAbilities(),
    abilityHits: zeroAbilities(),
    timeInZoneAloneTicks: 0,
    timeInZoneContestedTicks: 0,
    longestLifeTicks: 0,
  };
}

export function createPlayer(
  player: {
    readonly id: string;
    readonly name: string;
    readonly isBot: boolean;
    readonly seat: number;
  },
  tick: number,
): PlayerRecord {
  return {
    id: player.id,
    seat: player.seat,
    name: player.name,
    isBot: player.isBot,
    controller: player.isBot ? Controller.Bot : Controller.Human,
    alive: false,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    aim: 0,
    form: Form.Runner,
    morph: null,
    morphReadyTick: tick,
    hpFrac: 0,
    flux: 0,
    ability: null,
    abilityReadyTick: {
      [Form.Runner]: tick,
      [Form.Beast]: tick,
      [Form.Turret]: tick,
    },
    weapon: {
      [Form.Runner]: { nextShotIn: 0 },
      [Form.Beast]: { nextShotIn: 0 },
      [Form.Turret]: { nextShotIn: 0 },
    },
    heat: 0,
    overheatEndTick: tick,
    stunEndTick: tick,
    ccImmuneEndTick: tick,
    knockback: null,
    protectedEndTick: tick,
    respawnTick: tick,
    respawnFlux: null,
    fluxRegenAnchor: 0,
    fluxRegenTicks: 0,
    damageLog: [],
    lastInputSeq: -1,
    lastButtonInputSeq: -1,
    lastHeldButtons: 0,
    lastShotInputSeq: -1,
    nextShotIdx: 0,
    aimSource: player.isBot ? AimSource.Bot : AimSource.Mouse,
    stats: createPlayerStats(),
  };
}

// GR-2.4, D-012, D-014: preserve room identity and input sequence across matches.
export function resetPlayerForMatch(player: PlayerRecord, tick: number): void {
  player.alive = true;
  player.pos = { x: 0, y: 0 };
  player.vel = { x: 0, y: 0 };
  player.aim = 0;
  player.form = Form.Runner;
  player.morph = null;
  player.morphReadyTick = tick;
  player.hpFrac = 1;
  player.flux = BALANCE.flux.start;
  player.ability = null;
  player.abilityReadyTick = {
    [Form.Runner]: tick,
    [Form.Beast]: tick,
    [Form.Turret]: tick,
  };
  player.weapon = {
    [Form.Runner]: { nextShotIn: 0 },
    [Form.Beast]: { nextShotIn: 0 },
    [Form.Turret]: { nextShotIn: 0 },
  };
  player.heat = 0;
  player.overheatEndTick = tick;
  player.stunEndTick = tick;
  player.ccImmuneEndTick = tick;
  player.knockback = null;
  player.protectedEndTick = tick;
  player.respawnTick = tick;
  player.respawnFlux = null;
  player.fluxRegenAnchor = player.flux;
  player.fluxRegenTicks = 0;
  player.damageLog = [];
  player.aimSource = player.isBot ? AimSource.Bot : AimSource.Mouse;
  player.stats = createPlayerStats();
}

export function addPlayer(
  world: World,
  player: {
    readonly id: string;
    readonly name: string;
    readonly isBot: boolean;
    readonly seat: number;
  },
): void {
  if (
    !Number.isInteger(player.seat) ||
    player.seat < 0 ||
    player.seat >= BALANCE.match.seats
  ) {
    throw new RangeError(
      'seat must be an integer within the configured seat range',
    );
  }
  if (world.players[player.seat] !== null) throw new Error('seat is occupied');
  if (world.players.some((current) => current?.id === player.id))
    throw new Error('duplicate player id');
  const record = createPlayer(player, world.tick);
  if (world.phase !== Phase.Results) {
    const spawnIndex = chooseSpawnPoint(world, player.id);
    const spawn = world.map.spawnPoints[spawnIndex];
    if (spawn === undefined) throw new RangeError('spawn point is missing');
    resetPlayerForMatch(record, world.tick);
    record.pos = { x: spawn.x, y: spawn.y };
    if (world.phase === Phase.Playing) {
      grantSpawnProtection(record, world.tick);
    }
    emitEvent(world, { type: 'spawn' });
  }
  world.players[player.seat] = record;
}

export function removePlayer(world: World, id: string): void {
  const seat = world.players.findIndex((player) => player?.id === id);
  if (seat < 0) throw new Error('unknown player id');
  removeOwnedProjectiles(world, id);
  world.players[seat] = null;
}

export function setController(
  world: World,
  id: string,
  controller: Controller,
): void {
  const player = world.players.find((current) => current?.id === id);
  if (player === undefined || player === null)
    throw new Error('unknown player id');
  player.controller = controller;
}
