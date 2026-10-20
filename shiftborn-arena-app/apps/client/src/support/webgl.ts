export type CanvasFactory = () => Pick<HTMLCanvasElement, 'getContext'>;

/** T-030: feature detection only; T-032 owns the renderer and its canvas. */
export function supportsWebGL2(
  createCanvas: CanvasFactory = () => document.createElement('canvas'),
): boolean {
  try {
    return createCanvas().getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
