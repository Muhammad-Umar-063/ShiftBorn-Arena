import { isValidRoomCode } from '@shiftborn/shared';
import type { EntropySource } from '../settings/settings.js';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function browserEntropy(target: Uint8Array<ArrayBuffer>): void {
  globalThis.crypto.getRandomValues(target);
}

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().slice(0, 6);
}

export function validJoinRoomCode(value: string): string | null {
  const code = value.toUpperCase();
  return code !== '' && isValidRoomCode(code) ? code : null;
}

export function generateRoomCode(entropy: EntropySource = browserEntropy): string {
  const bytes = new Uint8Array(6);
  entropy(bytes);
  const code = Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
  if (!isValidRoomCode(code) || code === '') throw new Error('invalid generated room code');
  return code;
}

export type RoomQuery =
  | { readonly kind: 'none' }
  | { readonly kind: 'valid'; readonly code: string }
  | { readonly kind: 'invalid'; readonly entered: string };

export function parseRoomQuery(search: string): RoomQuery {
  const raw = new URLSearchParams(search).get('room');
  if (raw === null) return { kind: 'none' };
  const code = validJoinRoomCode(raw);
  return code === null
    ? { kind: 'invalid', entered: normalizeRoomCode(raw) }
    : { kind: 'valid', code };
}
