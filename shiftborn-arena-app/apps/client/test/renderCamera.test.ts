import { BALANCE, GREYBOX_V1 } from '@shiftborn/shared';
import { MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { describeMapBoxes, COVER_HEIGHT_M, WALL_HEIGHT_M } from '../src/render/arenaMap.js';
import {
  ArenaCamera, cameraZoom, groundToNdc, leadDistance,
  FPP_EYE_HEIGHT_M, FPP_VERTICAL_FOV_DEG, TPP_FOLLOW_DISTANCE_M,
  type CameraViewInput,
} from '../src/render/camera.js';
import { boxPlacement, simToWorld, worldToSim } from '../src/render/coordinates.js';
import {
  FADED_OPACITY, OcclusionController, nearNorthFace, shouldFadeOccluder,
  sightlineIntersectsBox,
} from '../src/render/occlusion.js';
import { staticRenderState } from '../src/render/stateView.js';

const base: CameraViewInput = {
  player: { x: 0, y: 0 }, aimRadians: 0, form: 'runner',
  inputScheme: 'mouse', cursorDistanceM: 0, reducedMotion: true,
  perspective: 'tpp',
};

describe('AT-MAP-04 map coordinates and shared geometry', () => {
  it('maps north to negative world Z and derives every unique wall and cover', () => {
    expect(simToWorld({ x: 4, y: -7 })).toEqual({ x: 4, z: 7 });
    expect(worldToSim({ x: -3, z: -5 })).toEqual({ x: -3, y: 5 });
    const source = JSON.stringify(GREYBOX_V1);
    const boxes = describeMapBoxes();
    expect(boxes.filter((box) => box.kind === 'wall')).toHaveLength(38);
    expect(boxes.filter((box) => box.kind === 'cover')).toHaveLength(10);
    expect(new Set(boxes.map((box) => box.id)).size).toBe(48);
    for (const [index, entry] of [...GREYBOX_V1.walls, ...GREYBOX_V1.cover].entries()) {
      const description = boxes[index];
      if (description === undefined) throw new Error('missing box');
      expect(description.id).toBe(entry.id);
      expect(description).toMatchObject(boxPlacement(entry.box,
        index < GREYBOX_V1.walls.length ? WALL_HEIGHT_M : COVER_HEIGHT_M));
    }
    expect(JSON.stringify(GREYBOX_V1)).toBe(source);
  });
});

describe('AT-UI-13 TPP and FPP camera views', () => {
  it('places TPP behind the player and FPP at the eyes, facing the aim', () => {
    const rig = new ArenaCamera(16 / 9);
    rig.update({ ...base, player: { x: 3, y: 4 }, aimRadians: 0,
      perspective: 'tpp' }, 0.1);
    expect(rig.camera.position.x).toBeLessThan(3);
    expect(rig.camera.position.y).toBeLessThan(5);
    rig.update({ ...base, player: { x: 3, y: 4 }, aimRadians: 0,
      perspective: 'fpp' }, 0.1);
    expect(rig.camera.position.x).toBeCloseTo(3);
    expect(rig.camera.position.y).toBeCloseTo(FPP_EYE_HEIGHT_M);
    expect(rig.camera.fov).toBeCloseTo(FPP_VERTICAL_FOV_DEG);
    expect(groundToNdc(rig.camera, { x: 13, y: 4 }).x).toBeCloseTo(0);
  });
  it('pulls the TPP camera in before a wall and leaves FPP at the eyes', () => {
    const rig = new ArenaCamera(16 / 9);
    const obstacle = { box: [-3, -1, -2, 1] as const, height: 3, visible: true };
    rig.setObstacles([obstacle]);
    rig.update(base, 0.1);
    expect(rig.camera.position.x).toBeGreaterThan(-2);
    obstacle.visible = false;
    rig.update(base, 0.1);
    expect(rig.camera.position.x).toBeCloseTo(-TPP_FOLLOW_DISTANCE_M);
    rig.update({ ...base, perspective: 'fpp' }, 0.1);
    expect(rig.camera.position.x).toBeCloseTo(0);
  });
  it('rotates both views with aim while retaining sim-to-world north mapping', () => {
    const rig = new ArenaCamera(16 / 9);
    rig.update({ ...base, aimRadians: Math.PI / 2 }, 0.1);
    expect(rig.camera.position.z).toBeGreaterThan(0);
    rig.update({ ...base, aimRadians: Math.PI }, 0.1);
    expect(rig.camera.position.x).toBeGreaterThan(0);
    rig.update({ ...base, aimRadians: Math.PI / 2, perspective: 'fpp' }, 0.1);
    expect(groundToNdc(rig.camera, { x: 0, y: 10 }).x).toBeCloseTo(0);
    expect(rig.camera.up).toEqual(new Vector3(0, 1, 0));
  });

  it('uses BALANCE zoom values and completes a form change in 0.3 s', () => {
    const rig = new ArenaCamera(16 / 9);
    expect(['runner', 'beast', 'turret'].map((form) =>
      cameraZoom(form as CameraViewInput['form'])))
      .toEqual([BALANCE.forms.runner.cameraZoom,
        BALANCE.forms.beast.cameraZoom, BALANCE.forms.turret.cameraZoom]);
    rig.update({ ...base, form: 'beast' }, 0.15);
    expect(rig.currentZoom).toBeCloseTo(0.95);
    rig.update({ ...base, form: 'beast' }, 0.15);
    expect(rig.currentZoom).toBeCloseTo(0.9);
    expect(rig.camera.position.x).toBeCloseTo(-TPP_FOLLOW_DISTANCE_M * 0.9);
    rig.update({ ...base, form: 'turret' }, 0.15);
    rig.update({ ...base, form: 'turret', perspective: 'fpp' }, 0.15);
    expect(rig.currentZoom).toBeCloseTo(1.3);
    expect(rig.camera.fov).toBeCloseTo(FPP_VERTICAL_FOV_DEG / 1.3);
  });

  it('applies documented mouse and keyboard lead, with stable and reduced-motion updates', () => {
    expect([0, 6, 12, 20].map((cursorDistanceM) =>
      leadDistance({ inputScheme: 'mouse', cursorDistanceM })))
      .toEqual([0, 3, 6, 6]);
    expect(leadDistance({ inputScheme: 'keys', cursorDistanceM: 0 })).toBeCloseTo(3.6);
    const slow = new ArenaCamera(16 / 9);
    const fast = new ArenaCamera(16 / 9);
    const target = { ...base, reducedMotion: false, cursorDistanceM: 12 };
    for (let index = 0; index < 60; index += 1) slow.update(target, 1 / 60);
    for (let index = 0; index < 30; index += 1) fast.update(target, 1 / 30);
    expect(slow.lead.x).toBeCloseTo(fast.lead.x, 5);
    expect(slow.lead.x).toBeGreaterThan(5);
    slow.update({ ...target, aimRadians: Math.PI / 2, reducedMotion: true }, 1 / 60);
    expect(slow.lead.x).toBeCloseTo(0);
    expect(slow.lead.y).toBeCloseTo(6);
  });
});

describe('AT-UI-13 wall and cover occlusion decisions', () => {
  const box = [0, 0, 2, 2] as const;
  const object = { box, height: 3, visible: true };
  it('fades a north face for an overlapping visible player and restores outside it', () => {
    expect(nearNorthFace(box, { x: 1, y: 3 })).toBe(true);
    expect(nearNorthFace(box, { x: 3, y: 3 })).toBe(false);
    expect(nearNorthFace(box, { x: 1, y: 4.6 })).toBe(false);
    expect(shouldFadeOccluder(object, new Vector3(20, 20, 20),
      { x: 10, y: 10 }, [{ x: 1, y: 3 }])).toBe(true);
    expect(shouldFadeOccluder(object, new Vector3(20, 20, 20),
      { x: 10, y: 10 }, [{ x: 5, y: 5 }])).toBe(false);
  });
  it('fades only for a true 3D camera-to-player box intersection', () => {
    const camera = new Vector3(1, 8, 8);
    const target = new Vector3(1, 0.9, -4);
    expect(sightlineIntersectsBox(camera, target, box, 3)).toBe(true);
    expect(sightlineIntersectsBox(new Vector3(8, 8, 8),
      new Vector3(8, 0.9, -4), box, 3)).toBe(false);
    expect(shouldFadeOccluder({ ...object, visible: false }, camera,
      { x: 1, y: 4 }, [])).toBe(false);
  });
  it('fades independently and restores the selected wall or cover', () => {
    const firstMaterial = new MeshBasicMaterial();
    const secondMaterial = new MeshBasicMaterial();
    const first = { id: 'first', kind: 'wall' as const, box, height: 3,
      material: firstMaterial, visible: true };
    const second = { id: 'second', kind: 'cover' as const,
      box: [8, 0, 10, 2] as const, height: 1.2,
      material: secondMaterial, visible: true };
    const controller = new OcclusionController([first, second]);
    controller.update(new Vector3(20, 20, 20), { x: 15, y: 15 }, [{ x: 1, y: 3 }]);
    expect(firstMaterial.opacity).toBe(FADED_OPACITY);
    expect(secondMaterial.opacity).toBe(1);
    controller.update(new Vector3(20, 20, 20), { x: 15, y: 15 }, []);
    expect(firstMaterial.opacity).toBe(1);
    expect(firstMaterial.transparent).toBe(false);
    controller.update(new Vector3(20, 20, 20), { x: 15, y: 15 },
      [{ x: 1, y: 3 }], false);
    expect(firstMaterial.opacity).toBe(1);
    firstMaterial.dispose();
    secondMaterial.dispose();
  });
});

describe('authoritative static scene adapter', () => {
  it('uses only detached player, cover and mode data', () => {
    const state = {
      tick: 4, phase: 1, matchId: 'fixture',
      players: { p: { id: 'p', name: 'P', seat: 0, isBot: false,
        controller: 0, connected: true, alive: true, x: 3, y: 4,
        aim: Math.PI / 2, form: 2, hpFrac: 1, flux: 0,
        kos: 0, deaths: 0, assists: 0, points: 0, damageDealt: 0,
        lastInputSeq: 0 } },
      full: { mode: 1, cover: [{ intact: false }] },
    } as const;
    const result = staticRenderState(state, 'p', true, 'fpp');
    expect(result?.view.camera).toMatchObject({
      player: { x: 3, y: 4 }, aimRadians: Math.PI / 2,
      form: 'turret', reducedMotion: true, perspective: 'fpp',
    });
    expect(result?.cover[0]).toEqual({ id: GREYBOX_V1.cover[0]?.id, intact: false });
    expect(result?.zoneFrenzy).toBe(true);
    expect(staticRenderState(state, 'missing', false, 'tpp')).toBeNull();
  });
});
