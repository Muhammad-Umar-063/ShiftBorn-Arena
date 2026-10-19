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
} as const;
export type WeaponId = (typeof WeaponId)[keyof typeof WeaponId];

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
