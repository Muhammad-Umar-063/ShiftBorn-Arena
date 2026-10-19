import { BALANCE } from './balance.js';

type BalanceJson =
  | string
  | number
  | boolean
  | null
  | readonly BalanceJson[]
  | { readonly [key: string]: BalanceJson };

function isBalanceArray(value: BalanceJson): value is readonly BalanceJson[] {
  return Array.isArray(value);
}

function canonicalJson(value: BalanceJson): string {
  if (isBalanceArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const members = Object.keys(value)
      .sort()
      .map((key) => {
        const member = value[key];
        if (member === undefined) {
          throw new TypeError(`Missing balance value: ${key}`);
        }
        return `${JSON.stringify(key)}:${canonicalJson(member)}`;
      });
    return `{${members.join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Balance values must be finite numbers.');
  }
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new TypeError('Balance contains a non-JSON value.');
  }
  return json;
}

// AT-DET-02: FNV-1a 64-bit constants hash the canonical JSON's UTF-16 code units.
export function balanceHash(balance: BalanceJson = BALANCE): string {
  const json = canonicalJson(balance);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= BigInt(json.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}
