import { App, type AppOptions } from './App.js';
import { element } from '../ui/dom.js';
import { supportsWebGL2, type CanvasFactory } from '../support/webgl.js';

export function mountClient(
  root: HTMLElement,
  options: AppOptions = {},
  createCanvas?: CanvasFactory,
): App | null {
  if (!supportsWebGL2(createCanvas)) {
    const main = element('main', 'screen compact-screen');
    const panel = element('section', 'arena-frame compact-frame');
    panel.append(element('h1', 'screen-title', 'WebGL 2 is required'),
      element('p', 'help-copy', 'Use a browser and device with WebGL 2 to play Shiftborn Arena.'));
    main.setAttribute('role', 'alert');
    main.append(panel);
    root.replaceChildren(main);
    return null;
  }
  return new App(root, options);
}
