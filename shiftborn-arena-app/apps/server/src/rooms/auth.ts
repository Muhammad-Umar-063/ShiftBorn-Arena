import { ErrorCode, ServerError } from '@colyseus/core';
import {
  CloseCode,
  PROTOCOL_VERSION,
  isValidRoomCode,
  sanitizePlayerName,
} from '@shiftborn/shared';

export interface AuthenticatedPlayer {
  readonly name: string;
  readonly code: string;
  readonly inputScheme: 'mouse' | 'keys' | null;
}

export function hasValidRoomCode(options: unknown): boolean {
  return (
    typeof options === 'object' &&
    options !== null &&
    !Array.isArray(options) &&
    isValidRoomCode((options as Record<string, unknown>).code)
  );
}

export function hasCurrentProtocolVersion(options: unknown): boolean {
  if (typeof options !== 'object' || options === null || Array.isArray(options))
    return false;
  const version = (options as Record<string, unknown>).protocolVersion;
  return (
    typeof version === 'number' &&
    Number.isInteger(version) &&
    version === PROTOCOL_VERSION
  );
}

/** NETWORK_PROTOCOL §2 and §3.4: auth receives untrusted join options. */
export function authenticatePlayer(
  options: unknown,
  nameSeed: string,
): AuthenticatedPlayer {
  if (!hasCurrentProtocolVersion(options))
    throw new ServerError(
      CloseCode.VersionMismatch,
      'Protocol version mismatch',
    );
  const fields = options as Record<string, unknown>;
  const code = fields.code;
  if (!isValidRoomCode(code))
    throw new ServerError(CloseCode.InvalidRoomCode, 'Invalid room code');
  const name = sanitizePlayerName(fields.name, nameSeed);
  if (name === null)
    throw new ServerError(ErrorCode.AUTH_FAILED, 'Invalid player name');
  const inputScheme = fields.inputScheme === 'mouse' || fields.inputScheme === 'keys'
    ? fields.inputScheme : null;
  return { name, code, inputScheme };
}

/** T-024 reads only this validated auth result, never raw join options. */
export function authenticatedPlayer(
  value: unknown,
): AuthenticatedPlayer | null {
  if (typeof value !== 'object' || value === null) return null;
  const name = (value as Record<string, unknown>).name;
  const code = (value as Record<string, unknown>).code;
  const scheme = (value as Record<string, unknown>).inputScheme;
  return typeof name === 'string' && isValidRoomCode(code)
    ? { name, code, inputScheme: scheme === 'mouse' || scheme === 'keys' ? scheme : null }
    : null;
}
