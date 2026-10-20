/** Sim-space metres: x points east and y points north. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
