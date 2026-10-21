import { element } from '../dom.js';

export function reconnectingScreen(): {
  readonly screen: HTMLElement; readonly primary: HTMLElement;
} {
  const screen = element('main', 'screen compact-screen');
  const frame = element('section', 'arena-frame compact-frame');
  const heading = element('h1', 'screen-title', 'Reconnecting...');
  const status = element('p', 'status-line', 'Trying to restore your match.');
  status.setAttribute('role', 'status');
  frame.append(element('p', 'eyebrow', 'Connection status'), heading, status);
  screen.append(frame);
  return { screen, primary: heading };
}
