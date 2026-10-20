const MAX_PLAYER_NAME_LENGTH = 16;
const SAFE_NAME = /^[A-Za-z0-9 _-]+$/;
const ADJECTIVES = ['Bright', 'Calm', 'Quick', 'Steady'] as const;
const NOUNS = ['Fox', 'Hawk', 'Otter', 'Wolf'] as const;

/** AT-SEC-02: deterministic fallback with no gameplay RNG or raw-name echo. */
export function generateSafePlayerName(seed: string): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const value = hash >>> 0;
  const adjective = ADJECTIVES[value % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(value / ADJECTIVES.length) % NOUNS.length];
  return `${adjective}${noun}`;
}

/** Null means overlength and must be rejected by ordinary authentication. */
export function sanitizePlayerName(
  value: unknown,
  seed: string,
): string | null {
  if (typeof value !== 'string') return generateSafePlayerName(seed);
  const trimmed = value.trim();
  if (trimmed.length > MAX_PLAYER_NAME_LENGTH) return null;
  return SAFE_NAME.test(trimmed) ? trimmed : generateSafePlayerName(seed);
}
