import { describe, expect, it } from 'vitest';
import { circleBoxPushOut, segmentBoxIntersection, segmentCircleIntersection } from '../src/math/geometry.js';
import { dot, subtract } from '../src/math/vec2.js';
import { raycast, type RaycastShape } from '../src/math/raycast.js';

const box = [0, 0, 2, 2] as const;

describe('Vec2 metre helpers', () => {
  it('subtract and dot use east/north components without mutating inputs', () => {
    const a = Object.freeze({ x: 3, y: 5 });
    const b = Object.freeze({ x: 1, y: -2 });
    expect(subtract(a, b)).toEqual({ x: 2, y: 7 });
    expect(dot(a, b)).toBe(-7);
    expect(a).toEqual({ x: 3, y: 5 });
    expect(b).toEqual({ x: 1, y: -2 });
  });
});

describe('GR-4.8 circle-box push-out', () => {
  it('pushes face and corner penetration along the shortest vector', () => {
    expect(circleBoxPushOut({ x: -0.5, y: 1 }, 1, box)).toEqual({ x: -0.5, y: 0 });
    const corner = circleBoxPushOut({ x: -0.6, y: -0.8 }, 2, box);
    expect(corner?.x).toBeCloseTo(-0.6);
    expect(corner?.y).toBeCloseTo(-0.8);
  });

  it('chooses the nearest exit inside and resolves exact ties west first', () => {
    expect(circleBoxPushOut({ x: 1.5, y: 1 }, 0.5, box)).toEqual({ x: 1, y: 0 });
    expect(circleBoxPushOut({ x: 1, y: 1 }, 0.5, box)).toEqual({ x: -1.5, y: 0 });
    expect(circleBoxPushOut({ x: 1, y: 1 }, 0, box)).toEqual({ x: -1, y: 0 });
  });

  it('treats exact tangency and clear space as no penetration', () => {
    expect(circleBoxPushOut({ x: -1, y: 1 }, 1, box)).toBeNull();
    expect(circleBoxPushOut({ x: -2, y: 1 }, 1, box)).toBeNull();
    expect(circleBoxPushOut({ x: 0, y: 1 }, 0, box)).toBeNull();
  });

  it('rejects bad radii and leaves frozen inputs unchanged', () => {
    const center = Object.freeze({ x: -0.5, y: 1 });
    const frozenBox = Object.freeze([0, 0, 2, 2] as const);
    expect(circleBoxPushOut(center, 1, frozenBox)).toEqual({ x: -0.5, y: 0 });
    for (const radius of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => circleBoxPushOut(center, radius, frozenBox)).toThrow(RangeError);
    }
  });
});

describe('swept segment-box contact', () => {
  it.each([
    [{ x: -1, y: 1 }, { x: 1, y: 1 }],
    [{ x: 3, y: 1 }, { x: 1, y: 1 }],
    [{ x: 1, y: -1 }, { x: 1, y: 1 }],
    [{ x: 1, y: 3 }, { x: 1, y: 1 }],
  ])('hits each face at t=0.5', (a, b) => {
    expect(segmentBoxIntersection(a, b, box)).toBe(0.5);
  });

  it('handles inflation, parallel misses, corner tangency, and endpoints', () => {
    expect(segmentBoxIntersection({ x: -2, y: 1 }, { x: 0, y: 1 }, box, 1)).toBe(0.5);
    expect(segmentBoxIntersection({ x: -1, y: 3 }, { x: 3, y: 3 }, box)).toBeNull();
    expect(segmentBoxIntersection({ x: -1, y: 1 }, { x: 1, y: 3 }, box)).toBe(0.5);
    expect(segmentBoxIntersection({ x: -1, y: 1 }, { x: 0, y: 1 }, box)).toBe(1);
    expect(segmentBoxIntersection({ x: 3, y: 1 }, { x: 2, y: 1 }, box)).toBe(1);
  });

  it('handles starting inside and zero-length paths', () => {
    expect(segmentBoxIntersection({ x: 1, y: 1 }, { x: 3, y: 1 }, box)).toBe(0);
    expect(segmentBoxIntersection({ x: 1, y: 1 }, { x: 1, y: 1 }, box)).toBe(0);
    expect(segmentBoxIntersection({ x: 3, y: 3 }, { x: 3, y: 3 }, box)).toBeNull();
  });

  it('does not mutate inputs and rejects invalid inflation', () => {
    const a = Object.freeze({ x: -1, y: 1 });
    const b = Object.freeze({ x: 3, y: 1 });
    const frozenBox = Object.freeze([0, 0, 2, 2] as const);
    expect(segmentBoxIntersection(a, b, frozenBox)).toBe(0.25);
    for (const inflation of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => segmentBoxIntersection(a, b, frozenBox, inflation)).toThrow(RangeError);
    }
  });
});

describe('segment-circle contact', () => {
  const center = { x: 0, y: 0 };
  it('returns earliest direct, tangent, and endpoint contact', () => {
    expect(segmentCircleIntersection({ x: -2, y: 0 }, { x: 2, y: 0 }, center, 1)).toBe(0.25);
    expect(segmentCircleIntersection({ x: -2, y: 1 }, { x: 2, y: 1 }, center, 1)).toBe(0.5);
    expect(segmentCircleIntersection({ x: -2, y: 0 }, { x: -1, y: 0 }, center, 1)).toBe(1);
  });
  it('handles misses, starting inside, and zero-length paths', () => {
    expect(segmentCircleIntersection({ x: -2, y: 2 }, { x: 2, y: 2 }, center, 1)).toBeNull();
    expect(segmentCircleIntersection(center, { x: 2, y: 0 }, center, 1)).toBe(0);
    expect(segmentCircleIntersection(center, center, center, 0)).toBe(0);
    expect(segmentCircleIntersection({ x: 2, y: 0 }, { x: 2, y: 0 }, center, 1)).toBeNull();
  });
  it('rejects invalid radii without mutating inputs', () => {
    const a = Object.freeze({ x: -2, y: 0 });
    const b = Object.freeze({ x: 2, y: 0 });
    const frozenCenter = Object.freeze(center);
    expect(segmentCircleIntersection(a, b, frozenCenter, 1)).toBe(0.25);
    for (const radius of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => segmentCircleIntersection(a, b, frozenCenter, radius)).toThrow(RangeError);
    }
  });
});

describe('raycast source-order contract', () => {
  const a = { x: -3, y: 1 };
  const b = { x: 5, y: 1 };
  it('returns the nearest source across box and circle shapes', () => {
    const shapes: RaycastShape[] = [
      { kind: 'box', box: [2, 0, 3, 2] },
      { kind: 'circle', center: { x: 0, y: 1 }, radius: 1 },
    ];
    expect(raycast(a, b, shapes)).toEqual({ index: 1, t: 0.25 });
    expect(raycast({ x: -3, y: 4 }, { x: 5, y: 4 }, shapes)).toBeNull();
  });
  it('prefers earlier sources for exact ties and counts corner and start-inside', () => {
    const shapes: RaycastShape[] = [
      { kind: 'box', box },
      { kind: 'circle', center: { x: 1, y: 1 }, radius: 1 },
    ];
    expect(raycast(a, b, shapes)).toEqual({ index: 0, t: 0.375 });
    expect(raycast({ x: -1, y: 1 }, { x: 1, y: 3 }, [shapes[0] as RaycastShape])).toEqual({ index: 0, t: 0.5 });
    expect(raycast({ x: 1, y: 1 }, b, shapes)).toEqual({ index: 0, t: 0 });
  });
});
