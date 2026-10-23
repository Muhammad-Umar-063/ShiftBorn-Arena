import { BALANCE, DERIVED, Form, GUN_IDS, GUN_TIER, Phase, WeaponId } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { advanceLoot, collectGun, setupLoot } from '../src/loot.js';
import { startMatch } from '../src/match.js';
import { hashWorld } from '../src/hash.js';
import { snapshotWorld, restoreWorld } from '../src/snapshot.js';
import { canFireGun } from '../src/weaponRules.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';

function setup(seed = 48) {
  const world = makeTestWorld({ seed, players: [0, 1].map(seat => ({ seat, id: `p${seat}`, name: 'Player', isBot: false })) });
  const a = world.players[0]; const b = world.players[1];
  if (!a || !b) throw new Error('missing players');
  world.phase = Phase.Playing; world.events.length = 0;
  // The center spawn has clear floor and is outside cover.
  const point = world.map.lootCandidates[0]; if (!point) throw new Error('no candidate');
  a.pos = { ...point }; b.pos = { x: point.x + 0.5, y: point.y };
  world.loot = [{ id: world.nextLootId++, gun: WeaponId.PulsePistol, ...point }];
  return { world, a, b, point };
}

describe('T-048 authoritative loot', () => {
  it('AT-LOOT-01 nearest wins, exact tie uses seat, and one item has one claim', () => {
    for (const tie of [false, true]) {
      const { world, a, b, point } = setup();
      if (tie) b.pos = { ...point }; else { a.pos = { x: a.pos.x + 0.5, y: a.pos.y }; b.pos = { ...point }; }
      advanceLoot(world);
      expect(a.guns.pulsePistol.owned).toBe(tie);
      expect(b.guns.pulsePistol.owned).toBe(!tie);
      expect(world.loot).toHaveLength(0);
      expect(world.events.filter(e => e.type === 'lootPickup')).toHaveLength(1);
      advanceLoot(world); expect(world.lootReplenishments).toHaveLength(1);
    }
  });
  it('AT-LOOT-02 AT-AMMO-06 new gun draws, duplicates fill only reserve, cap leaves item', () => {
    const { world, a, b } = setup(); b.alive = false;
    advanceLoot(world);
    expect(a.guns.pulsePistol).toEqual({ owned: true, mag: 20, reserve: 60 });
    expect(a.swapReadyTick).toBe(world.tick + DERIVED.weapons.swapTicks);
    a.guns.pulsePistol.mag = 3;
    expect(collectGun(a, WeaponId.PulsePistol, world.tick)).toBe(1);
    expect(a.guns.pulsePistol).toEqual({ owned: true, mag: 3, reserve: 120 });
    world.loot.push({ id: world.nextLootId++, gun: WeaponId.PulsePistol, ...a.pos });
    advanceLoot(world); expect(world.loot).toHaveLength(1);
  });
  it('AT-LOAD-02 locked-form guns are stored but cannot fire as Runner', () => {
    const { world, a, b } = setup(); b.alive = false;
    world.loot = [WeaponId.SlugCannon, WeaponId.RailRepeater].map(gun => ({ id: world.nextLootId++, gun, ...a.pos }));
    advanceLoot(world);
    expect(a.unlocked[Form.Beast]).toBe(false); expect(a.unlocked[Form.Turret]).toBe(false);
    expect(a.guns.slugCannon).toEqual({ owned: true, mag: 4, reserve: 8 });
    expect(a.guns.railRepeater.owned).toBe(true);
    expect(a.selectedTier[Form.Beast]).toBe(2);
    expect(canFireGun(a, world.phase, world.tick)).toBeNull();
    a.unlocked[Form.Beast] = true; a.form = Form.Beast;
    expect(canFireGun(a, world.phase, world.tick)).toBe(WeaponId.SlugCannon);
  });
  it('AT-LOOT-03 seeded placement has exact counts and static clearance', () => {
    const a = makeTestWorld({ seed: 48 }); const b = makeTestWorld({ seed: 48 });
    const c = makeTestWorld({ seed: 49 });
    expect(a.loot).toEqual(b.loot); expect(a.loot).not.toEqual(c.loot);
    expect(a.loot).toHaveLength(15);
    for (const gun of GUN_IDS) expect(a.loot.filter(item => item.gun === gun)).toHaveLength(GUN_TIER[gun] === 1 ? 3 : 2);
    for (const item of a.loot) {
      expect(a.map.lootCandidates).toContainEqual({ x: item.x, y: item.y });
      for (const { box } of [...a.map.walls, ...a.map.cover]) {
        expect(Math.hypot(Math.max(box[0] - item.x, 0, item.x - box[2]),
          Math.max(box[1] - item.y, 0, item.y - box[3]))).toBeGreaterThanOrEqual(BALANCE.loot.minClearanceM);
      }
    }
    const old = structuredClone(a.loot); a.matchIndex++; startMatch(a);
    expect(a.loot).not.toEqual(old); expect(a.lootReplenishments).toEqual([]);
  });
  it('AT-LOOT-04 replenishes the same gun exactly 600 ticks later at a new draw', () => {
    const { world, a, b, point } = setup(); b.alive = false; advanceLoot(world); a.alive = false;
    world.tick += DERIVED.loot.respawnTicks - 1; advanceLoot(world); expect(world.loot).toHaveLength(0);
    world.tick++; advanceLoot(world); expect(world.loot).toHaveLength(1);
    expect(world.loot[0]?.gun).toBe(WeaponId.PulsePistol);
    expect(world.loot[0]).not.toMatchObject(point);
    expect(world.events.filter(e => e.type === 'lootSpawn')).toHaveLength(1);
  });
  it('AT-LOOT-05 RNG isolation; dead players and RESULTS cannot collect', () => {
    const { world, a, b } = setup(); const rng = { ...world.rng }; setupLoot(world);
    expect(world.rng).toEqual(rng);
    world.loot = [{ id: world.nextLootId++, gun: WeaponId.PulsePistol, ...a.pos }];
    a.alive = b.alive = false; advanceLoot(world); expect(world.loot).toHaveLength(1);
    a.alive = true; world.phase = Phase.Results; advanceLoot(world); expect(world.loot).toHaveLength(1);
  });
  it('AT-DET-03 replay restores loot, pending replacements and independent RNG exactly', () => {
    const { world } = setup(); advanceLoot(world);
    const restored = restoreWorld(snapshotWorld(world)); expect(hashWorld(restored)).toBe(hashWorld(world));
    world.tick += DERIVED.loot.respawnTicks; restored.tick = world.tick;
    advanceLoot(world); advanceLoot(restored); expect(hashWorld(restored)).toBe(hashWorld(world));
  });
});
