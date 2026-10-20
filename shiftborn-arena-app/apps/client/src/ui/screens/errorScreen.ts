import { errorPresentation, type AppState } from '../../app/appState.js';
import { action, element } from '../dom.js';

export function errorScreen(
  state: Extract<AppState, { kind: 'error' }>,
  act: () => void, home: () => void,
): { readonly screen: HTMLElement; readonly primary: HTMLButtonElement } {
  const presentation = errorPresentation(state);
  const screen = element('main', 'screen compact-screen');
  screen.setAttribute('aria-live', 'assertive');
  const frame = element('section', 'arena-frame compact-frame');
  frame.append(element('p', 'eyebrow', 'Connection status'));
  const heading = element('h1', 'screen-title', presentation.message);
  const primary = action(presentation.label, 'button button-primary');
  primary.addEventListener('click', act);
  frame.append(heading, primary);
  if (presentation.action !== 'home') {
    const back = action('Back', 'button button-text');
    back.addEventListener('click', home);
    frame.append(back);
  }
  screen.append(frame);
  return { screen, primary };
}
