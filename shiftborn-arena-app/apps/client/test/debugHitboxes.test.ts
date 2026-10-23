import { BALANCE, GREYBOX_V1, WeaponId } from '@shiftborn/shared';
import { Scene, type Mesh, type LineSegments } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HitboxView } from '../src/debug/HitboxView.js';
import { describeMapBoxes } from '../src/render/arenaMap.js';
import type { EntitySnapshot, PlayerVisual } from '../src/render/entityState.js';
import type { ProjectileVisual } from '../src/render/projectileTimeline.js';

function player(form: number, alive = true): PlayerVisual {
  return { id: 'p', name: 'P', seat: 0, isBot: false, controller: 0,
    connected: true, alive, x: 3, y: 4, vx: 0, vy: 0, aim: Math.PI / 2,
    form, hpFrac: 1, flux: 60, kos: 0, deaths: 0, assists: 0, points: 0,
    damageDealt: 0, lastInputSeq: 1, morphTarget: -1, morphEndTick: 0,
    abilityId: 2, abilityPhase: 1, abilityStartTick: 1, abilityEndTick: 20,
    stunEndTick: 0, knockbackEndTick: 0, protectedEndTick: 0 };
}
function snapshot(p: PlayerVisual, intact: boolean): EntitySnapshot {
  return { tick: 10, matchId: 'm', localPlayerId: 'p', players: [p],
    shards: [], clusters: [], cover: [{ id: GREYBOX_V1.cover[0]!.id,
      intact, rebuildTick: 0 }], zoneFrenzy: true, zonePoint: 0 };
}

describe('T-038 F4 collision geometry', () => {
  it('uses balance radii, map boxes, active cover, projectile radii and future zone/rail adapters', () => {
    const scene = new Scene();
    const view = new HitboxView(scene, describeMapBoxes(), GREYBOX_V1.zonePoints);
    expect(view.visible).toBe(false);
    view.setVisible(true);
    const shot = { x: 5, y: 6, weapon: WeaponId.PulsePistol } as ProjectileVisual;
    view.update(snapshot(player(1), false), [shot]);
    const circle = view.group.getObjectByName('hitbox-player') as Mesh;
    const projectile = view.group.getObjectByName('hitbox-projectile') as Mesh;
    const rail = view.group.getObjectByName('hitbox-rail-width') as LineSegments;
    const cover = view.group.getObjectByName(`hitbox-${GREYBOX_V1.cover[0]!.id}`);
    const zone = view.group.getObjectByName('hitbox-zone') as Mesh;
    expect(circle.scale.x).toBe(BALANCE.forms.beast.radiusM);
    expect(circle.position.toArray()).toEqual([3, 0.11, -4]);
    expect(projectile.scale.x).toBe(BALANCE.weapons.pulsePistol.projRadiusM);
    expect(projectile.position.toArray()).toEqual([5, 0.13, -6]);
    expect(cover?.visible).toBe(false);
    expect(zone.visible).toBe(true);
    expect(zone.scale.x).toBe(BALANCE.zoneFrenzy.zoneRadiusM);
    expect(rail.visible).toBe(true);
    expect(rail.scale.z).toBe(BALANCE.abilities.railShot.widthM);
    view.update(snapshot(player(0, false), true), []);
    expect(circle.visible).toBe(false);
    expect(projectile.visible).toBe(false);
    expect(cover?.visible).toBe(true);
    const dispose = vi.spyOn(circle.geometry, 'dispose');
    view.dispose(); view.dispose();
    expect(scene.children).not.toContain(view.group);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
