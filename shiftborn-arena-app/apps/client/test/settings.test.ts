import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PREFERENCES, SETTINGS_STORAGE_KEY, SETTINGS_VERSION,
  SettingsStore, generatedPlayerName, type SettingsStorage,
} from '../src/settings/settings.js';

const entropy = (target: Uint8Array<ArrayBuffer>): void => { target.fill(7); };

function memoryStorage(initial?: string): SettingsStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(SETTINGS_STORAGE_KEY, initial);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

function envelope(storage: ReturnType<typeof memoryStorage>): Record<string, unknown> {
  return JSON.parse(storage.values.get(SETTINGS_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
}

describe('SettingsStore', () => {
  it('uses every documented default and persists a generated safe name on first use', () => {
    const storage = memoryStorage();
    const store = new SettingsStore(() => storage, entropy);
    expect(store.snapshot()).toEqual({
      displayName: generatedPlayerName(entropy),
      preferences: {
        aimAssistStrength: 100, keyboardLockOn: true, fireMode: 'hold', cameraView: 'tpp',
        masterVolume: 80, effectsVolume: 100, interfaceVolume: 80,
        screenShake: true, reducedMotion: false, damageNumbers: true,
        showFpsAndPing: false,
      },
    });
    expect(envelope(storage)).toEqual({
      version: SETTINGS_VERSION,
      displayName: generatedPlayerName(entropy),
      preferences: DEFAULT_PREFERENCES,
    });
    expect(new SettingsStore(() => storage, () => { throw new Error('should not generate'); })
      .snapshot().displayName).toBe(generatedPlayerName(entropy));
  });

  it('saves name and changed preferences and returns detached snapshots', () => {
    const storage = memoryStorage();
    const store = new SettingsStore(() => storage, entropy);
    expect(store.setName('  New_Player  ')).toBe(true);
    expect(store.update('aimAssistStrength', 24)).toBe(true);
    expect(store.update('fireMode', 'toggle')).toBe(true);
    expect(store.update('cameraView', 'fpp')).toBe(true);
    expect(store.update('reducedMotion', true)).toBe(true);
    const detached = store.snapshot();
    detached.preferences.masterVolume = 0;
    expect(store.snapshot().preferences.masterVolume).toBe(80);
    const reloaded = new SettingsStore(() => storage, entropy).snapshot();
    expect(reloaded.displayName).toBe('New_Player');
    expect(reloaded.preferences).toMatchObject({ aimAssistStrength: 24,
      fireMode: 'toggle', cameraView: 'fpp', reducedMotion: true });
    expect(DEFAULT_PREFERENCES.masterVolume).toBe(80);
    expect(store.setName('seventeen letters')).toBe(false);
    expect(store.setName('<script>')).toBe(false);
    expect(store.update('masterVolume', Number.NaN)).toBe(false);
    expect(store.snapshot().displayName).toBe('New_Player');
  });

  it.each([
    undefined,
    '{bad json',
    'null',
    '[]',
    JSON.stringify({ version: 999, displayName: 'OldName', preferences: { masterVolume: 1 } }),
    JSON.stringify({ version: 1, displayName: 'Unsafe!', preferences: {} }),
    JSON.stringify({ version: 1, displayName: 'OverlongPlayerName', preferences: {} }),
  ])('recovers from missing, malformed, or unsafe stored data: %s', (raw) => {
    const storage = memoryStorage(raw);
    const snapshot = new SettingsStore(() => storage, entropy).snapshot();
    expect(snapshot.displayName).toBe(generatedPlayerName(entropy));
    expect(snapshot.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(envelope(storage).displayName).toBe(snapshot.displayName);
  });

  it('validates partial fields independently and ignores unknown fields', () => {
    const storage = memoryStorage(JSON.stringify({
      version: 1, displayName: 'Valid_Name', extra: 'discard',
      preferences: {
        aimAssistStrength: 50, keyboardLockOn: false, fireMode: 'burst',
        masterVolume: -1, effectsVolume: '90', interfaceVolume: 101,
        screenShake: false, reducedMotion: true, damageNumbers: null,
        showFpsAndPing: true, secret: 'discard',
      },
    }));
    const store = new SettingsStore(() => storage, entropy);
    expect(store.snapshot()).toEqual({
      displayName: 'Valid_Name',
      preferences: {
        aimAssistStrength: 50, keyboardLockOn: false, fireMode: 'hold', cameraView: 'tpp',
        masterVolume: 80, effectsVolume: 100, interfaceVolume: 80,
        screenShake: false, reducedMotion: true, damageNumbers: true,
        showFpsAndPing: true,
      },
    });
    expect(store.update('masterVolume', 0)).toBe(true);
    expect(store.update('cameraView', 'other' as 'tpp')).toBe(false);
    expect(envelope(storage)).not.toHaveProperty('extra');
    expect(envelope(storage).preferences).not.toHaveProperty('secret');
  });

  it('rejects non-finite and out-of-range values without affecting defaults', () => {
    const storage = memoryStorage(JSON.stringify({
      version: 1, displayName: 'Valid',
      preferences: { masterVolume: 1e309, effectsVolume: -1, interfaceVolume: 101,
        aimAssistStrength: 0, keyboardLockOn: 1 },
    }));
    expect(new SettingsStore(() => storage, entropy).snapshot().preferences).toMatchObject({
      masterVolume: 80, effectsVolume: 100, interfaceVolume: 80,
      aimAssistStrength: 0, keyboardLockOn: true,
    });
    expect(DEFAULT_PREFERENCES).toMatchObject({ masterVolume: 80, effectsVolume: 100 });
  });

  it('continues in memory when storage getter, reads, writes, or serialization fail', () => {
    const throwingProvider = (): SettingsStorage => { throw new Error('blocked getter'); };
    const blocked = new SettingsStore(throwingProvider, entropy);
    expect(blocked.update('masterVolume', 22)).toBe(true);
    expect(blocked.setName('Offline')).toBe(true);
    expect(blocked.snapshot()).toMatchObject({ displayName: 'Offline', preferences: { masterVolume: 22 } });

    const readsThrow: SettingsStorage = {
      getItem: () => { throw new Error('blocked read'); },
      setItem: () => { throw new Error('blocked write'); },
    };
    expect(new SettingsStore(() => readsThrow, entropy).update('screenShake', false)).toBe(true);
    const writesThrow: SettingsStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
    };
    expect(new SettingsStore(() => writesThrow, entropy).setName('Offline')).toBe(true);

    const store = new SettingsStore(() => memoryStorage(), entropy);
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new Error('serialization'); });
    try {
      expect(store.update('masterVolume', 33)).toBe(true);
      expect(store.snapshot().preferences.masterVolume).toBe(33);
    } finally {
      stringify.mockRestore();
    }
  });

  it('never removes or changes unrelated keys', () => {
    const storage = memoryStorage();
    storage.values.set('unrelated', 'keep me');
    new SettingsStore(() => storage, entropy).update('showFpsAndPing', true);
    expect(storage.values.get('unrelated')).toBe('keep me');
    expect([...storage.values.keys()]).toEqual(['unrelated', SETTINGS_STORAGE_KEY]);
  });
});
