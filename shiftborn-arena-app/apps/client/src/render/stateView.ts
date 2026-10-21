import { GREYBOX_V1 } from '@shiftborn/shared';
import type { AuthoritativeRead } from '../net/messageValidation.js';
import type { RenderView } from './Renderer.js';
import type { CameraPerspective } from './camera.js';

export interface StaticRenderState {
  readonly view: RenderView;
  readonly cover: readonly { readonly id: string; readonly intact: boolean }[];
  readonly zoneFrenzy: boolean;
}

/** Narrow, detached state adapter. Entity meshes and input arrive in later tasks. */
export function staticRenderState(
  state: AuthoritativeRead, localPlayerId: string,
  reducedMotion: boolean, perspective: CameraPerspective,
): StaticRenderState | null {
  const local = state.players[localPlayerId];
  if (local === undefined) return null;
  const form = local.form === 1 ? 'beast' : local.form === 2 ? 'turret' : 'runner';
  const rawCover = state.full.cover;
  const cover = Array.isArray(rawCover) ? GREYBOX_V1.cover.flatMap((item, index) => {
    const entry: unknown = rawCover[index];
    return typeof entry === 'object' && entry !== null && 'intact' in entry &&
      typeof entry.intact === 'boolean'
      ? [{ id: item.id, intact: entry.intact }] : [];
  }) : [];
  return {
    view: {
      camera: {
        player: { x: local.x, y: local.y },
        aimRadians: local.aim,
        form,
        inputScheme: 'mouse',
        cursorDistanceM: 0,
        reducedMotion,
        perspective,
      },
      visiblePlayers: Object.values(state.players).filter((player) => player.alive)
        .map((player) => ({ x: player.x, y: player.y })),
    },
    cover,
    zoneFrenzy: state.full.mode === 1,
  };
}
