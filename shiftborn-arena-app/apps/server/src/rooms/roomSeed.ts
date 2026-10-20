import { randomBytes } from 'node:crypto';

/** A 48-bit cryptographic integer is exactly representable in JS and valid for createWorld. */
export function createRoomSeed(): number {
  return randomBytes(6).readUIntBE(0, 6);
}
