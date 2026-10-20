import { describe, expect, it } from 'vitest';
import { supportsWebGL2 } from '../src/support/webgl.js';

describe('WebGL 2 detection', () => {
  it('accepts a context and rejects null or thrown getContext', () => {
    const calls: string[] = [];
    expect(supportsWebGL2(() => ({ getContext: ((type: string) => {
      calls.push(type);
      return {};
    }) as HTMLCanvasElement['getContext'] }))).toBe(true);
    expect(calls).toEqual(['webgl2']);
    expect(supportsWebGL2(() => ({ getContext: (() => null) as HTMLCanvasElement['getContext'] }))).toBe(false);
    expect(supportsWebGL2(() => ({ getContext: (() => { throw new Error('unsupported'); }) as HTMLCanvasElement['getContext'] }))).toBe(false);
  });

  it('rejects an unavailable canvas factory before normal startup', () => {
    expect(supportsWebGL2(() => { throw new Error('canvas unavailable'); })).toBe(false);
  });
});
