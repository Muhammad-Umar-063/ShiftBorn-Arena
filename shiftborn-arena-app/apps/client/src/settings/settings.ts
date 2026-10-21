import { generateSafePlayerName, sanitizePlayerName } from '@shiftborn/shared';

export const SETTINGS_STORAGE_KEY = 'shiftborn.settings.v1';
export const SETTINGS_VERSION = 1;

export interface Preferences {
  aimAssistStrength: number;
  keyboardLockOn: boolean;
  fireMode: 'hold' | 'toggle';
  cameraView: 'tpp' | 'fpp';
  masterVolume: number;
  effectsVolume: number;
  interfaceVolume: number;
  screenShake: boolean;
  reducedMotion: boolean;
  damageNumbers: boolean;
  showFpsAndPing: boolean;
}

export interface SettingsSnapshot {
  readonly displayName: string;
  readonly preferences: Preferences;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  aimAssistStrength: 100,
  keyboardLockOn: true,
  fireMode: 'hold',
  cameraView: 'tpp',
  masterVolume: 80,
  effectsVolume: 100,
  interfaceVolume: 80,
  screenShake: true,
  reducedMotion: false,
  damageNumbers: true,
  showFpsAndPing: false,
});

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type StorageProvider = () => SettingsStorage | null;
export type EntropySource = (target: Uint8Array<ArrayBuffer>) => void;

function browserStorage(): SettingsStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function browserEntropy(target: Uint8Array<ArrayBuffer>): void {
  globalThis.crypto.getRandomValues(target);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function percentage(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    value >= 0 && value <= 100;
}

function safeName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 16 ||
    value !== value.trim()) return false;
  return sanitizePlayerName(value, '') === value;
}

function preferenceValue<K extends keyof Preferences>(key: K, value: unknown): value is Preferences[K] {
  if (key === 'fireMode') return value === 'hold' || value === 'toggle';
  if (key === 'cameraView') return value === 'tpp' || value === 'fpp';
  if (key === 'aimAssistStrength' || key === 'masterVolume' ||
    key === 'effectsVolume' || key === 'interfaceVolume') return percentage(value);
  return typeof value === 'boolean';
}

function readPreferences(value: unknown): Preferences {
  const result: Preferences = { ...DEFAULT_PREFERENCES };
  if (!record(value)) return result;
  for (const key of Object.keys(result) as (keyof Preferences)[]) {
    const candidate = value[key];
    if (preferenceValue(key, candidate)) {
      // The key/value correlation is established by preferenceValue above.
      (result as unknown as Record<string, unknown>)[key] = candidate;
    }
  }
  return result;
}

/** T-030: browser entropy is isolated from the deterministic simulation RNG. */
export function generatedPlayerName(entropy: EntropySource = browserEntropy): string {
  const bytes = new Uint8Array(16);
  entropy(bytes);
  const seed = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return generateSafePlayerName(seed);
}

/** Safe in blocked or quota-limited storage contexts; memory remains authoritative for this page. */
export class SettingsStore {
  private data: SettingsSnapshot;

  constructor(
    private readonly storage: StorageProvider = browserStorage,
    private readonly entropy: EntropySource = browserEntropy,
  ) {
    let parsed: unknown;
    try {
      const raw = this.storage()?.getItem(SETTINGS_STORAGE_KEY);
      if (raw !== null && raw !== undefined) parsed = JSON.parse(raw) as unknown;
    } catch {
      // Storage and malformed JSON are ordinary browser conditions.
    }
    const validRecord = record(parsed) && parsed.version === SETTINGS_VERSION
      ? parsed : null;
    const storedName = validRecord?.displayName;
    this.data = {
      displayName: safeName(storedName) ? storedName : generatedPlayerName(entropy),
      preferences: readPreferences(validRecord?.preferences),
    };
    if (!safeName(storedName)) this.persist();
  }

  snapshot(): SettingsSnapshot {
    return { displayName: this.data.displayName, preferences: { ...this.data.preferences } };
  }

  setName(value: string): boolean {
    const trimmed = value.trim();
    if (!safeName(trimmed)) return false;
    this.data = { ...this.data, displayName: trimmed };
    this.persist();
    return true;
  }

  update<K extends keyof Preferences>(key: K, value: Preferences[K]): boolean {
    if (!preferenceValue(key, value)) return false;
    this.data = {
      ...this.data,
      preferences: { ...this.data.preferences, [key]: value },
    };
    this.persist();
    return true;
  }

  private persist(): void {
    try {
      const value = JSON.stringify({
        version: SETTINGS_VERSION,
        displayName: this.data.displayName,
        preferences: { ...this.data.preferences },
      });
      this.storage()?.setItem(SETTINGS_STORAGE_KEY, value);
    } catch {
      // Keep this page's validated settings when storage is unavailable.
    }
  }
}
