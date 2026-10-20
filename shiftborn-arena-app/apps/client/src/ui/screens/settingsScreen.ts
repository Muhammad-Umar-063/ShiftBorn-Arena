import type { Preferences, SettingsSnapshot } from '../../settings/settings.js';
import { action, element } from '../dom.js';

export interface SettingsActions {
  update<K extends keyof Preferences>(key: K, value: Preferences[K]): void;
  back(): void;
}

export function settingsScreen(
  snapshot: SettingsSnapshot, actions: SettingsActions,
): { readonly screen: HTMLElement; readonly primary: HTMLButtonElement } {
  const screen = element('main', 'screen settings-screen');
  const frame = element('section', 'arena-frame settings-frame');
  frame.append(element('p', 'eyebrow', 'Arena access'), element('h1', 'screen-title', 'Settings'));
  const form = element('form', 'settings-form');
  form.noValidate = true;
  form.addEventListener('submit', (event) => event.preventDefault());
  const numeric: { key: keyof Pick<Preferences,
    'aimAssistStrength' | 'masterVolume' | 'effectsVolume' | 'interfaceVolume'>; label: string }[] = [
    { key: 'aimAssistStrength', label: 'Aim assist strength' },
    { key: 'masterVolume', label: 'Master volume' },
    { key: 'effectsVolume', label: 'Effects volume' },
    { key: 'interfaceVolume', label: 'Interface volume' },
  ];
  for (const { key, label } of numeric) {
    const row = element('div', 'setting-row');
    const id = `setting-${key}`;
    const caption = element('label', 'field-label', label);
    caption.htmlFor = id;
    const input = element('input', 'range-input');
    input.id = id;
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = String(snapshot.preferences[key]);
    const output = element('output', 'setting-value', `${input.value}%`);
    output.htmlFor = id;
    input.addEventListener('input', () => {
      const value = Number(input.value);
      output.value = `${value}%`;
      actions.update(key, value);
    });
    row.append(caption, input, output);
    form.append(row);
  }

  const booleans: { key: keyof Pick<Preferences,
    'keyboardLockOn' | 'screenShake' | 'reducedMotion' | 'damageNumbers' | 'showFpsAndPing'>;
    label: string }[] = [
    { key: 'keyboardLockOn', label: 'Keyboard lock-on' },
    { key: 'screenShake', label: 'Screen shake' },
    { key: 'reducedMotion', label: 'Reduced motion' },
    { key: 'damageNumbers', label: 'Damage numbers' },
    { key: 'showFpsAndPing', label: 'Show FPS and ping' },
  ];
  for (const { key, label } of booleans) {
    const row = element('div', 'setting-row setting-toggle');
    const caption = element('label', 'field-label', label);
    const input = element('input', 'checkbox-input');
    input.type = 'checkbox';
    input.checked = snapshot.preferences[key];
    input.addEventListener('change', () => actions.update(key, input.checked));
    caption.append(input);
    row.append(caption);
    form.append(row);
  }

  const fire = element('fieldset', 'setting-row fire-mode');
  fire.append(element('legend', 'field-label', 'Fire mode'));
  for (const value of ['hold', 'toggle'] as const) {
    const label = element('label', 'radio-label', value === 'hold' ? 'Hold' : 'Toggle');
    const input = element('input');
    input.type = 'radio';
    input.name = 'fireMode';
    input.value = value;
    input.checked = snapshot.preferences.fireMode === value;
    input.addEventListener('change', () => {
      if (input.checked) actions.update('fireMode', value);
    });
    label.prepend(input);
    fire.append(label);
  }
  form.append(fire);
  const primary = action('Back', 'button button-secondary');
  primary.addEventListener('click', actions.back);
  frame.append(form, primary);
  screen.append(frame);
  return { screen, primary };
}
