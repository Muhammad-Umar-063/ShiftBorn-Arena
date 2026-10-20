import { describe, expect, it } from 'vitest';
import { generateSafePlayerName, sanitizePlayerName } from '../src/names.js';

describe('AT-SEC-02 player names', () => {
  it('trims valid ASCII names and accepts exact boundary lengths', () => {
    expect(sanitizePlayerName(' A ', 'seed')).toBe('A');
    expect(sanitizePlayerName('ABCDEFGHIJKLMNOP', 'seed')).toBe(
      'ABCDEFGHIJKLMNOP',
    );
    expect(sanitizePlayerName(' Alice_2- Bob ', 'seed')).toBe('Alice_2- Bob');
    expect(sanitizePlayerName('ABCDEFGHIJKLMNOPQ', 'seed')).toBeNull();
  });

  it('generates valid safe names for blank, illegal, and non-string values', () => {
    const invalid: unknown[] = [
      '',
      '  ',
      '<b>name</b>',
      'a!b',
      'a\nb',
      '😀',
      'Élodie',
      123,
      {},
      [],
      null,
    ];
    for (const value of invalid) {
      const name = sanitizePlayerName(value, 'seed');
      expect(name).toMatch(/^[A-Za-z0-9 _-]{1,16}$/);
      expect(name).toBe(generateSafePlayerName('seed'));
    }
    expect(generateSafePlayerName('seed')).toBe(generateSafePlayerName('seed'));
  });

  it('does not mutate inputs or truncate an overlength name', () => {
    const value = { dangerous: '<script>' };
    const before = JSON.stringify(value);
    expect(sanitizePlayerName(value, 'seed')).toMatch(/^[A-Za-z0-9 _-]{1,16}$/);
    expect(JSON.stringify(value)).toBe(before);
    expect(sanitizePlayerName('ABCDEFGHIJKLMNOPQ', 'seed')).toBeNull();
  });
});
