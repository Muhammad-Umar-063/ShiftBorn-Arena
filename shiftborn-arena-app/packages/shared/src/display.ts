// GR-6.8: presentation formulas do not change stored simulation health.
const HEALTH_DISPLAY_EPSILON = 1e-6;

export function displayHealth(
  hpFrac: number,
  maxHp: number,
  alive: boolean,
): number {
  if (!alive || hpFrac <= 0) return 0;
  return Math.max(1, Math.ceil(hpFrac * maxHp - HEALTH_DISPLAY_EPSILON));
}

export function displayDamage(finalDamage: number): number {
  return Math.max(1, Math.round(finalDamage));
}
