import { BALANCE, DERIVED, GUN_FORM, GUN_IDS, GUN_TIER, Phase, type GunId, type MapData } from '@shiftborn/shared';
import { emitEvent } from './events.js';
import { formStats } from './formStats.js';
import { gunNumbers } from './loadout.js';
import { lineOfSight } from './map/lineOfSight.js';
import type { Vec2 } from './math/vec2.js';
import { nextInt, sfc32 } from './rng.js';
import type { PlayerRecord, World } from './world.js';

export interface LootItem { id: number; gun: GunId; x: number; y: number }
export interface LootReplenishment { id: number; gun: GunId; dueTick: number }

/** GR-19.2: static candidate centers include rooms and never depend on cover health. */
export function lootCandidates(map: MapData): Vec2[] {
  const result: Vec2[] = [];
  const boxes = [...map.walls, ...map.cover];
  const { candidateGridM: grid, minClearanceM: clearance } = BALANCE.loot;
  for (let y = map.playable.minY + grid / 2; y < map.playable.maxY; y += grid) {
    for (let x = map.playable.minX + grid / 2; x < map.playable.maxX; x += grid) {
      if (boxes.every(({ box }) =>
        Math.hypot(Math.max(box[0] - x, 0, x - box[2]),
          Math.max(box[1] - y, 0, y - box[3])) >= clearance)) result.push({ x, y });
    }
  }
  return result;
}

function placementMargin(world: World, point: Vec2): number {
  let margin = Infinity;
  for (const item of world.loot)
    margin = Math.min(margin, Math.hypot(item.x - point.x, item.y - point.y) - BALANCE.loot.minSpacingM);
  for (const spawn of world.map.spawnPoints)
    margin = Math.min(margin, Math.hypot(spawn.x - point.x, spawn.y - point.y) - BALANCE.loot.minSpawnPointDistM);
  for (const player of world.players) if (player?.alive)
    margin = Math.min(margin, Math.hypot(player.pos.x - point.x, player.pos.y - point.y) - BALANCE.loot.minPlayerDistM);
  return margin;
}

function place(world: World, gun: GunId): void {
  const candidates = world.map.lootCandidates;
  // Tiny collision fixtures may have no floor; production maps must validate.
  if (candidates.length === 0) return;
  let best: Vec2 | undefined;
  let bestMargin = -Infinity;
  for (let draw = 0; draw < BALANCE.loot.placementAttempts; draw++) {
    const point = candidates[nextInt(world.lootRng, candidates.length)];
    if (!point) throw new Error('invalid loot candidate');
    const margin = placementMargin(world, point);
    if (best === undefined || margin > bestMargin) { best = point; bestMargin = margin; }
    if (margin >= 0) break;
  }
  if (!best) return;
  const item = { id: world.nextLootId++, gun, x: best.x, y: best.y };
  world.loot.push(item);
  emitEvent(world, { type: 'lootSpawn', lootId: item.id, gun, x: item.x, y: item.y });
}

/** GR-19.2: a separate RNG domain leaves spawn and shard sequences untouched. */
export function setupLoot(world: World): void {
  world.loot = []; world.lootReplenishments = [];
  world.lootRng = sfc32(world.roomSeed, world.matchIndex);
  // Domain separator is an RNG mixing constant, not a gameplay value.
  world.lootRng.a = (world.lootRng.a ^ 0x6c6f6f74) >>> 0;
  for (const gun of GUN_IDS) {
    const count = GUN_TIER[gun] === 1 ? BALANCE.loot.tier1PerGun : BALANCE.loot.tier2PerGun;
    for (let index = 0; index < count; index++) place(world, gun);
  }
}

/** GR-19.4 shared grant semantics; callers must enforce authority and eligibility. */
export function collectGun(player: PlayerRecord, gun: GunId, tick: number): 0 | 1 | null {
  const state = player.guns[gun]; const numbers = gunNumbers(gun);
  if (state.owned) {
    if (state.reserve >= numbers.reserveMax) return null;
    state.reserve = Math.min(numbers.reserveMax, state.reserve + numbers.ammoPerPickup);
    return 1;
  }
  state.owned = true;
  state.mag = Math.min(numbers.magazine, numbers.ammoPerPickup);
  state.reserve = Math.min(numbers.reserveMax, numbers.ammoPerPickup - state.mag);
  const form = GUN_FORM[gun];
  if (player.selectedTier[form] === 0) {
    player.selectedTier[form] = GUN_TIER[gun];
    if (player.form === form) player.swapReadyTick = tick + DERIVED.weapons.swapTicks;
  }
  return 0;
}

/** GR-19.3 to GR-19.5: one authoritative claim per item, then due replenishments. */
export function advanceLoot(world: World): void {
  if (world.phase !== Phase.Playing) return;
  for (const item of [...world.loot].sort((a, b) => a.id - b.id)) {
    let winner: PlayerRecord | null = null; let closest = Infinity;
    for (const player of world.players) {
      if (!player?.alive) continue;
      const gun = player.guns[item.gun];
      if (gun.owned && gun.reserve >= gunNumbers(item.gun).reserveMax) continue;
      const distance = Math.hypot(player.pos.x - item.x, player.pos.y - item.y);
      if (distance > formStats(player.form).radiusM + BALANCE.loot.pickupExtraRadiusM ||
        !lineOfSight(world, player.pos, item)) continue;
      if (distance < closest || (distance === closest && player.seat < (winner?.seat ?? Infinity))) {
        winner = player; closest = distance;
      }
    }
    if (!winner) continue;
    const kind = collectGun(winner, item.gun, world.tick);
    if (kind === null) continue;
    world.loot.splice(world.loot.indexOf(item), 1);
    world.lootReplenishments.push({ id: item.id, gun: item.gun, dueTick: world.tick + DERIVED.loot.respawnTicks });
    emitEvent(world, { type: 'lootPickup', lootId: item.id, seat: winner.seat, gun: item.gun, kind });
  }
  world.lootReplenishments.sort((a, b) => a.dueTick - b.dueTick || a.id - b.id);
  while (world.lootReplenishments[0] && world.lootReplenishments[0].dueTick <= world.tick) {
    const due = world.lootReplenishments.shift();
    if (due) place(world, due.gun);
  }
}
