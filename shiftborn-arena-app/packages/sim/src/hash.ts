import type { World } from './world.js';

// FNV-1a over canonical UTF-16 tokens. Constants are for hashing, not gameplay.
const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

interface HashState {
  value: bigint;
  readonly ancestors: WeakSet<object>;
}

function writeText(state: HashState, text: string): void {
  const token = `${text.length}:${text}`;
  for (let index = 0; index < token.length; index += 1) {
    state.value =
      ((state.value ^ BigInt(token.charCodeAt(index))) * PRIME) & MASK;
  }
}

function writeValue(state: HashState, value: unknown, isWorld = false): void {
  if (value === null) {
    writeText(state, 'null');
    return;
  }
  if (typeof value === 'string') {
    writeText(state, 'string');
    writeText(state, value);
    return;
  }
  if (typeof value === 'number') {
    writeText(state, 'number');
    const numberText = Object.is(value, -0) ? '-0' : String(value);
    writeText(state, numberText);
    return;
  }
  if (typeof value === 'boolean' || typeof value === 'undefined') {
    writeText(state, String(value));
    return;
  }
  if (typeof value !== 'object') {
    throw new TypeError('World state must contain only plain data');
  }
  if (state.ancestors.has(value)) {
    throw new TypeError('World state must not contain cycles');
  }
  state.ancestors.add(value);
  if (Array.isArray(value)) {
    writeText(state, 'array');
    writeText(state, String(value.length));
    for (let index = 0; index < value.length; index += 1) {
      if (Object.hasOwn(value, index)) writeValue(state, value[index]);
      else writeText(state, 'hole');
    }
  } else {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('World state must contain only plain data');
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => !isWorld || key !== 'events')
      .sort();
    writeText(state, 'object');
    writeText(state, String(keys.length));
    for (const key of keys) {
      writeText(state, key);
      writeValue(state, record[key]);
    }
  }
  state.ancestors.delete(value);
}

// Events are transient output, so only the root World.events buffer is excluded.
export function hashWorld(world: World): string {
  const state: HashState = { value: OFFSET, ancestors: new WeakSet() };
  writeValue(state, world, true);
  return state.value.toString(16).padStart(16, '0');
}
