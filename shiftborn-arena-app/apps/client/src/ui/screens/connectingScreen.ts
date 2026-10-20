import type { ConnectionIntent } from '../../app/appState.js';
import { action, element } from '../dom.js';

export function connectingScreen(intent: ConnectionIntent, cancel: () => void): {
  readonly screen: HTMLElement; readonly primary: HTMLButtonElement;
} {
  const screen = element('main', 'screen compact-screen');
  const frame = element('section', 'arena-frame compact-frame');
  frame.append(element('p', 'eyebrow', 'Arena access'), element('h1', 'screen-title', 'Connecting...'));
  const status = element('p', 'status-line', 'Connecting...');
  status.setAttribute('role', 'status');
  frame.append(status);
  if (intent.code !== '') frame.append(element('p', 'room-hint', `Room code: ${intent.code}`));
  const primary = action('Cancel', 'button button-secondary');
  primary.addEventListener('click', cancel);
  frame.append(primary);
  screen.append(frame);
  return { screen, primary };
}
