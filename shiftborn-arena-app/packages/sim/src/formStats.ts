import { BALANCE, type Form } from '@shiftborn/shared';

/** GR-4.1: one lookup for the common form statistics, backed by BALANCE. */
export type FormStats = Pick<
  (typeof BALANCE.forms)[Form],
  | 'maxHp'
  | 'speedMps'
  | 'radiusM'
  | 'knockbackMult'
  | 'zonePointsMult'
  | 'cameraZoom'
>;

export function formStats(form: Form): Readonly<FormStats> {
  return BALANCE.forms[form];
}
