// GR-2.2, GR-11.8: string values match the sim and protocol vocabulary.
export const Form = {
  Runner: 'runner',
  Beast: 'beast',
  Turret: 'turret',
} as const;
export type Form = (typeof Form)[keyof typeof Form];

export const Phase = {
  Countdown: 'COUNTDOWN',
  Playing: 'PLAYING',
  Results: 'RESULTS',
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export const Mode = {
  Frenzy: 'frenzy',
  ZoneFrenzy: 'zoneFrenzy',
} as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export const AbilityId = {
  Dash: 'dash',
  RamCharge: 'ramCharge',
  RailShot: 'railShot',
} as const;
export type AbilityId = (typeof AbilityId)[keyof typeof AbilityId];

export const WeaponId = {
  PulsePistol: 'pulsePistol',
  ScatterCannon: 'scatterCannon',
  RailRepeater: 'railRepeater',
  RicochetDisc: 'ricochetDisc',
  SlugCannon: 'slugCannon',
  ArcMortar: 'arcMortar',
  Dagger: 'dagger',
} as const;
export type WeaponId = (typeof WeaponId)[keyof typeof WeaponId];
/** D-075: the six loot guns. The dagger is a weapon but never loot. */
export type GunId = Exclude<WeaponId, typeof WeaponId.Dagger>;
export type GunTier = 1 | 2;

/** Protocol and placement order: form order, then tier (GR-19.2). */
export const GUN_IDS: readonly GunId[] = Object.freeze([
  WeaponId.PulsePistol,
  WeaponId.RicochetDisc,
  WeaponId.ScatterCannon,
  WeaponId.SlugCannon,
  WeaponId.RailRepeater,
  WeaponId.ArcMortar,
]);

export const GUN_FORM: Readonly<Record<GunId, Form>> = Object.freeze({
  [WeaponId.PulsePistol]: Form.Runner,
  [WeaponId.RicochetDisc]: Form.Runner,
  [WeaponId.ScatterCannon]: Form.Beast,
  [WeaponId.SlugCannon]: Form.Beast,
  [WeaponId.RailRepeater]: Form.Turret,
  [WeaponId.ArcMortar]: Form.Turret,
});

/** GR-7.25: tier 2 is the higher-damage gun of each form (D-077). */
export const GUN_TIER: Readonly<Record<GunId, GunTier>> = Object.freeze({
  [WeaponId.PulsePistol]: 1,
  [WeaponId.RicochetDisc]: 2,
  [WeaponId.ScatterCannon]: 1,
  [WeaponId.SlugCannon]: 2,
  [WeaponId.RailRepeater]: 1,
  [WeaponId.ArcMortar]: 2,
});

export function gunFor(form: Form, tier: GunTier): GunId {
  switch (form) {
    case Form.Runner:
      return tier === 1 ? WeaponId.PulsePistol : WeaponId.RicochetDisc;
    case Form.Beast:
      return tier === 1 ? WeaponId.ScatterCannon : WeaponId.SlugCannon;
    case Form.Turret:
      return tier === 1 ? WeaponId.RailRepeater : WeaponId.ArcMortar;
  }
}

export function isGunId(value: unknown): value is GunId {
  return (GUN_IDS as readonly unknown[]).includes(value);
}

export const AimSource = {
  Mouse: 'mouse',
  Keys: 'keys',
  Lock: 'lock',
  Bot: 'bot',
  // NETWORK_PROTOCOL §5.2 reserves touch and pad for later input schemes.
  Touch: 'touch',
  Pad: 'pad',
} as const;
export type AimSource = (typeof AimSource)[keyof typeof AimSource];

export const Cause = {
  PulsePistol: WeaponId.PulsePistol,
  ScatterCannon: WeaponId.ScatterCannon,
  RailRepeater: WeaponId.RailRepeater,
  RicochetDisc: WeaponId.RicochetDisc,
  SlugCannon: WeaponId.SlugCannon,
  ArcMortar: WeaponId.ArcMortar,
  Dagger: WeaponId.Dagger,
  RamCharge: AbilityId.RamCharge,
  RailShot: AbilityId.RailShot,
} as const;
export type Cause = (typeof Cause)[keyof typeof Cause];

export const Controller = {
  Human: 'human',
  Bot: 'bot',
  Proxy: 'proxy',
} as const;
export type Controller = (typeof Controller)[keyof typeof Controller];
