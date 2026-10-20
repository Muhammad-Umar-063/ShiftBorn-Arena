import type { RoomQuery } from '../../rooms/roomCode.js';
import { element, action } from '../dom.js';

export interface LandingActions {
  nameChanged(name: string): void;
  codeChanged(code: string): void;
  play(name: string): void;
  create(name: string): void;
  join(name: string, code: string): boolean;
  saveName(name: string): boolean;
  howToPlay(): void;
  settings(): void;
}

export interface LandingView {
  readonly screen: HTMLElement;
  readonly primary: HTMLButtonElement;
}

export function landingScreen(
  name: string, joinCode: string, query: RoomQuery,
  buildId: string, actions: LandingActions,
): LandingView {
  const screen = element('main', 'screen landing-screen');
  const frame = element('div', 'arena-frame');
  const header = element('header', 'brand-header');
  const eyebrow = element('p', 'eyebrow', 'Prototype / arena access');
  const title = element('h1', 'wordmark');
  title.append(element('span', undefined, 'Shiftborn '), element('span', undefined, 'Arena'));
  const tag = element('p', 'prototype-tag', 'Prototype');
  header.append(eyebrow, title, tag);
  const form = element('form', 'entry-form');
  form.noValidate = true;
  const nameLabel = element('label', 'field-label', 'Player name');
  nameLabel.htmlFor = 'player-name';
  const nameInput = element('input', 'text-input');
  nameInput.id = 'player-name';
  nameInput.name = 'playerName';
  nameInput.type = 'text';
  nameInput.maxLength = 16;
  nameInput.setAttribute('autocomplete', 'nickname');
  nameInput.value = name;
  nameInput.addEventListener('input', () => actions.nameChanged(nameInput.value));
  const nameError = element('p', 'field-error');
  nameError.id = 'name-error';
  nameError.setAttribute('role', 'alert');
  nameInput.setAttribute('aria-describedby', nameError.id);
  nameInput.addEventListener('blur', () => {
    const valid = actions.saveName(nameInput.value);
    nameInput.setAttribute('aria-invalid', String(!valid));
    nameError.textContent = valid ? '' : 'Use 1–16 letters, numbers, spaces, _ or -.';
  });
  form.append(nameLabel, nameInput, nameError);

  const roomLink = query.kind === 'valid';
  if (roomLink) {
    const hint = element('p', 'room-hint', `Joining room ${query.code}`);
    form.append(hint);
  }
  const primary = element('button', 'button button-primary', roomLink ? 'Join' : 'Play');
  primary.type = 'submit';
  form.append(primary);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const valid = actions.saveName(nameInput.value);
    nameInput.setAttribute('aria-invalid', String(!valid));
    nameError.textContent = valid ? '' : 'Use 1–16 letters, numbers, spaces, _ or -.';
    if (!valid) { nameInput.focus(); return; }
    if (query.kind === 'valid') actions.join(nameInput.value.trim(), query.code);
    else actions.play(nameInput.value.trim());
  });

  if (!roomLink) {
    const roomActions = element('div', 'room-actions');
    const create = action('Create room', 'button button-secondary');
    create.addEventListener('click', () => {
      if (!actions.saveName(nameInput.value)) {
        nameInput.focus();
        nameInput.setAttribute('aria-invalid', 'true');
        nameError.textContent = 'Use 1–16 letters, numbers, spaces, _ or -.';
        return;
      }
      actions.create(nameInput.value.trim());
    });
    const joinLabel = element('label', 'field-label', 'Room code');
    joinLabel.htmlFor = 'room-code';
    const joinInput = element('input', 'text-input room-code-input');
    joinInput.id = 'room-code';
    joinInput.name = 'roomCode';
    joinInput.type = 'text';
    joinInput.maxLength = 6;
    joinInput.autocomplete = 'off';
    joinInput.setAttribute('autocapitalize', 'characters');
    joinInput.value = joinCode;
    const codeError = element('p', 'field-error');
    codeError.id = 'room-code-error';
    codeError.setAttribute('role', 'alert');
    joinInput.setAttribute('aria-describedby', codeError.id);
    if (query.kind === 'invalid') {
      codeError.textContent = 'Enter a valid six-character room code.';
      joinInput.setAttribute('aria-invalid', 'true');
    }
    joinInput.addEventListener('input', () => {
      joinInput.value = joinInput.value.toUpperCase().slice(0, 6);
      actions.codeChanged(joinInput.value);
      joinInput.setAttribute('aria-invalid', 'false');
      codeError.textContent = '';
    });
    const join = action('Join room', 'button button-secondary');
    join.addEventListener('click', () => {
      if (!actions.saveName(nameInput.value)) {
        nameInput.focus();
        nameInput.setAttribute('aria-invalid', 'true');
        nameError.textContent = 'Use 1–16 letters, numbers, spaces, _ or -.';
        return;
      }
      if (!actions.join(nameInput.value.trim(), joinInput.value)) {
        joinInput.setAttribute('aria-invalid', 'true');
        codeError.textContent = 'Enter a valid six-character room code.';
        joinInput.focus();
      }
    });
    roomActions.append(create, joinLabel, joinInput, join, codeError);
    form.append(roomActions);
  }

  const utilities = element('nav', 'utility-actions');
  utilities.setAttribute('aria-label', 'More options');
  const how = action('How to play', 'button button-text');
  const settings = action('Settings', 'button button-text');
  how.dataset.action = 'howToPlay';
  settings.dataset.action = 'settings';
  how.addEventListener('click', actions.howToPlay);
  settings.addEventListener('click', actions.settings);
  utilities.append(how, settings);
  const formLabels = element('div', 'form-stripe');
  formLabels.append(
    element('span', undefined, 'Runner'),
    element('span', undefined, 'Beast'),
    element('span', undefined, 'Turret'),
  );
  const footer = element('footer', 'screen-footer');
  footer.append(
    element('span', undefined, `Build ${buildId}`),
    element('span', undefined, 'Prototype build: greybox visuals'),
  );
  frame.append(header, form, utilities, formLabels, footer);
  screen.append(frame);
  return { screen, primary };
}
