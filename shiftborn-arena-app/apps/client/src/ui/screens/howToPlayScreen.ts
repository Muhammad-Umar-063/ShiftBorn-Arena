import { action, element } from '../dom.js';

/** A landing help seam; T-065 owns the in-match controls card lifecycle. */
export function howToPlayScreen(back: () => void): {
  readonly screen: HTMLElement; readonly primary: HTMLButtonElement;
} {
  const screen = element('main', 'screen compact-screen');
  const frame = element('section', 'arena-frame compact-frame');
  frame.append(element('p', 'eyebrow', 'Arena basics'), element('h1', 'screen-title', 'How to play'));
  const copy = element('p', 'help-copy',
    'Move with WASD. Aim with the mouse or keyboard, fire, and switch between Runner, Beast and Turret to answer each opponent.');
  const primary = action('Back', 'button button-secondary');
  primary.addEventListener('click', back);
  frame.append(copy, primary);
  screen.append(frame);
  return { screen, primary };
}
