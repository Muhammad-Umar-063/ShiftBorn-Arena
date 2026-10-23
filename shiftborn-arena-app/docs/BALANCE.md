# BALANCE.md

> **LLM FILE CONTRACT:** Sole documentation source for gameplay numbers, units, formulas and tuning ranges. Code reads these values from `packages/shared/src/balance.ts`; do not duplicate numeric gameplay literals.

Every initial tunable value for the prototype: its configuration key, unit, starting value, derived tick values, formulas, and the range playtests may tune it within.

- The single source of truth in code is `packages/shared/src/balance.ts` (section 8 gives its full starting content). No gameplay number may appear anywhere else in code.
- Values use human units here (seconds, degrees, per-second rates). `packages/shared/src/derived.ts` converts them once at load (D-046): seconds to ticks with `Math.round(s × 30)`, degrees to radians, per-second rates to per-tick rates.
- Changing a value: edit `balance.ts`, bump `BALANCE.version`, note the change and reason in the change log in section 10, and re-run the simulation tests. A change outside the tuning range needs a decision in `DECISIONS.md`.
- `BALANCE.version` is written into every match log so analysis can group matches by balance version.

---

## 1. Match and tick

| Key | Value | Unit | Ticks | Tuning range | Notes |
|---|---|---|---|---|---|
| `tick.rateHz` | 30 | Hz | | fixed | D-033 |
| `tick.patchRateHz` | 20 | Hz | | fixed | State patches every 50 ms |
| `match.seats` | 8 | players | | fixed | |
| `match.countdownS` | 3 | s | 90 | 2 to 5 | |
| `match.durationS` | 600 | s | 18000 | fixed by D-073; changes need the owner | Ten-minute active play |
| `match.resultsS` | 15 | s | 450 | 8 to 20 | |
| `match.lateJoinCutoffS` | 60 | s | 1800 | 30 to 90 | Quick-play rooms lock below this |
| `match.respawnS` | 3 | s | 90 | 2 to 5 | |
| `match.spawnProtectionS` | 2 | s | 60 | 1 to 3 | |
| `match.spawnExcludeRecent` | 2 | points | | 1 to 3 | |
| `match.assistWindowS` | 5 | s | 150 | 3 to 8 | |

## 2. Forms and movement

| Key | Runner | Beast | Turret | Unit | Tuning range |
|---|---|---|---|---|---|
| `forms.<f>.maxHp` | 80 | 140 | 110 | HP | ±20% |
| `forms.<f>.speedMps` | 8.5 | 6.0 | 0 | m/s | Runner 7.5 to 9.5, Beast 5 to 7, Turret fixed 0 |
| `forms.<f>.radiusM` | 0.6 | 1.0 | 0.9 | m | ±0.15 |
| `forms.<f>.knockbackMult` | 1.0 | 0.5 | 0 | | Beast 0.3 to 0.7 |
| `forms.<f>.zonePointsMult` | 1.0 | 1.0 | 0.5 | | Turret 0.25 to 1.0 |
| `forms.<f>.cameraZoom` | 1.0 | 0.9 | 1.3 | | 0.8 to 1.5 |
| `forms.turret.turnRateDegPerS` | | | 120 | °/s | 90 to 180 (4°/tick at 120) |
| `forms.turret.frontArcDeg` | | | 120 | ° | 90 to 150 |
| `forms.turret.frontArcDamageMult` | | | 0.75 | | 0.6 to 0.9 |
| `movement.accelMps2` | 60 | 60 | n/a | m/s² | 40 to 100 |
| `movement.maxSubstepM` | 0.25 | 0.25 | 0.25 | m | fixed |
| `sprint.speedMult` | 1.3 | 1.3 | n/a | | 1.15 to 1.45 (GR-4.16) |
| `sprint.maxForwardAngleDeg` | 60 | 60 | n/a | ° | 45 to 75 |
| `aimDistance.minM` / `maxM` / `defaultM` | 2 / 24 / 12 | | | m | wire limit 25.5 m (GR-4.18) |

## 3. Morphing and matchups

| Key | Value | Unit | Ticks | Tuning range |
|---|---|---|---|---|
| `morph.costBeast` | 35 | Flux | | 25 to 45 |
| `morph.costTurret` | 35 | Flux | | 25 to 45 |
| `morph.costRunner` | 0 | Flux | | fixed (D-011) |
| `morph.durationS` | 0.5 | s | 15 | 0.3 to 0.7 |
| `morph.cooldownS` | 3 | s | 90 | 2 to 5 |
| `morph.moveMult` | 0.5 | | | 0.3 to 0.8 |

Matchup table `matchup[attacker][defender]` (D-010): Runner→Beast 0.75, Runner→Turret 1.25, Beast→Runner 1.25, Turret→Beast 1.25, every other pair 1.0. Tuning range for the off-1.0 values: 1.15 to 1.35 and 0.65 to 0.85.

## 4. Weapons

Tier 1 values are unchanged from proto-3. Tier 2 values were calculated by the lead engineer under D-077; the benchmark is §9.5 and they await owner review in OQ-024.

| Key | Pulse Pistol (Runner, T1) | Ricochet Disc (Runner, T2) | Scatter Cannon (Beast, T1) | Slug Cannon (Beast, T2) | Rail Repeater (Turret, T1) | Arc Mortar (Turret, T2) | Unit |
|---|---|---|---|---|---|---|---|
| `damage` / `damagePerPellet` | 9 | 24 | 5 (7 pellets) | 50 | 16 | 75 (center) | HP |
| `ratePerS` | 6 | 2.5 | 1.25 | 1 | 3.5 | 0.85 | attacks/s |
| interval (derived) | 0.1667 | 0.4 | 0.8 | 1.0 | 0.2857 | 1.1765 | s |
| `rangeM` | 14 | 20 (path) | 9 | 12 | 18 | 8 to 20 (landing) | m |
| `projSpeedMps` | 45 | 32 | 35 | 55 | 70 | 1.0 s flight | m/s |
| `projRadiusM` | 0.15 | 0.2 | 0.10 | 0.2 | 0.12 | 2.5 blast | m |
| `magazine` | 20 | 8 | 8 | 4 | 30 | 3 | rounds |
| `reloadS` (ticks) | 1.5 (45) | 2 (60) | 2 (60) | 2.5 (75) | 2 (60) | 3 (90) | s |
| `ammoPerPickup` | 80 | 24 | 24 | 12 | 60 | 9 | rounds |
| `reserveMax` | 120 | 32 | 32 | 16 | 90 | 12 | rounds |
| Burst DPS (derived, §9.5) | 54 | 60 | 43.75 within 4 m | 50 | 56 beyond 4 m | 63.75 (center) | HP/s |
| Sustained DPS with reload (derived, §9.5) | 38.6 | 40.0 | 36.8 | 36.4 | 39.6 (heat-limited) | 42.0 | HP/s |

Scatter Cannon extras: `pelletOffsetsDeg` = [-12, -8, -4, 0, 4, 8, 12], `fullDamageRangeM` 4, `minFalloffMult` 0.5.
Rail Repeater extras: `armDistanceM` 4, `closeDamageMult` 0.5, `heatMaxS` 7, `overheatS` 2 (60 ticks), `heatCoolPerS` 2.
Ricochet Disc extras: `bounceDamageMult` 1.25 (30 after a bounce), `maxBounces` 1.
Arc Mortar extras: `edgeDamageMult` 0.5, `blastRadiusM` 2.5, `minRangeM` 8, `maxRangeM` 20, `flightS` 1 (30 ticks), `landingNudgeStepM` 0.1.
Dagger (`weapons.dagger`, every form, no ammunition): `damage` 25, `windupS` 0.1 (3 ticks), `recoveryS` 0.5 (15 ticks), `reachM` 0.8 beyond the body, `widthM` 0.7. Cycle 0.6 s, 41.7 DPS.
Shared: `weapons.muzzleExtraM` 0.1 m, `weapons.spawnAdvanceMaxMs` 100 ms (max 3 ticks), `weapons.swapS` 0.4 s (12 ticks).

Tuning ranges: damage ±20%, rate ±20%, range ±15%, projectile speed ±20%, magazine ±25%, reload ±25%, pickup ammunition ±30%. Keep each tier 1 gun's DPS within 10% of the other tier 1 guns' DPS against a neutral target unless a decision says otherwise. Tier 2 must stay above its own tier 1 on the §9.5 benchmark (GR-7.25).

## 4a. Progression and loot

| Key | Value | Unit | Ticks | Tuning range | Notes |
|---|---|---|---|---|---|
| `progression.beastUnlockKos` | 3 | KOs | | fixed by D-074 | GR-18.2 |
| `progression.turretUnlockKos` | 6 | KOs | | fixed by D-074 | GR-18.2 |
| `loot.tier1PerGun` | 3 | items | | 2 to 4 | 9 tier 1 items |
| `loot.tier2PerGun` | 2 | items | | 1 to 3 | 6 tier 2 items |
| `loot.respawnS` | 20 | s | 600 | 10 to 40 | GR-19.5 |
| `loot.pickupExtraRadiusM` | 0.5 | m | | 0.3 to 0.8 | Same as shards |
| `loot.candidateGridM` | 1 | m | | fixed | GR-19.2 |
| `loot.minClearanceM` | 1.5 | m | | fixed | Matches `mapRules.minPointClearanceM` |
| `loot.minSpacingM` | 6 | m | | 4 to 10 | Between items |
| `loot.minSpawnPointDistM` | 4 | m | | 3 to 8 | Keeps guns off spawn points |
| `loot.minPlayerDistM` | 3 | m | | 2 to 6 | Avoids spawning into a player |
| `loot.placementAttempts` | 24 | draws | | 8 to 64 | Fallback keeps the largest margin |

## 5. Abilities

| Key | Value | Unit | Ticks | Tuning range |
|---|---|---|---|---|
| `abilities.dash.distanceM` | 6 | m | | 4 to 8 |
| `abilities.dash.durationS` | 0.2 | s | 6 | 0.15 to 0.3 |
| `abilities.dash.cooldownS` | 5 | s | 150 | 3 to 7 |
| `abilities.ramCharge.windupS` | 0.15 | s | 5 | 0.1 to 0.3 |
| `abilities.ramCharge.speedMps` | 12 | m/s | | 10 to 15 |
| `abilities.ramCharge.maxDurationS` | 0.8 | s | 24 | 0.6 to 1.0 |
| `abilities.ramCharge.damage` | 25 | HP | | 15 to 35 |
| `abilities.ramCharge.knockbackM` | 4 | m | | 2 to 6 |
| `abilities.ramCharge.knockbackDurationS` | 0.2 | s | 6 | 0.15 to 0.3 |
| `abilities.ramCharge.wallStunS` | 0.4 | s | 12 | 0.2 to 0.8 |
| `abilities.ramCharge.cooldownS` | 7 | s | 210 | 5 to 10 |
| `abilities.railShot.chargeS` | 0.6 | s | 18 | 0.4 to 0.9 |
| `abilities.railShot.damage` | 45 | HP | | 35 to 60 |
| `abilities.railShot.rangeM` | 18 | m | | 15 to 22 |
| `abilities.railShot.widthM` | 0.4 | m | | 0.2 to 0.6 |
| `abilities.railShot.cancelCooldownS` | 2 | s | 60 | 1 to 4 |
| `abilities.railShot.cooldownS` | 6 | s | 180 | 4 to 9 |

## 6. Flux, shards, status, cover, zone

| Key | Value | Unit | Ticks | Tuning range |
|---|---|---|---|---|
| `flux.max` | 100 | Flux | | fixed |
| `flux.start` | 60 | Flux | | 35 to 70 |
| `flux.regenPerS` | 1 | Flux/s | | 0.5 to 2 |
| `flux.smallShard` | 5 | Flux | | 3 to 8 |
| `flux.largeShard` | 15 | Flux | | 10 to 20 |
| `flux.ko` | 20 | Flux | | 10 to 30 |
| `flux.assist` | 10 | Flux | | 5 to 15 |
| `flux.deathDropFrac` | 0.4 | | | 0.2 to 0.5 |
| `flux.respawnFloor` | 40 | Flux | | 35 to 60 (keep at or above the morph cost) |
| `shards.activeClusters` | 3 | clusters | | 2 to 4 |
| `shards.clusterSmall` | 4 | shards | | |
| `shards.clusterLarge` | 1 | shards | | |
| `shards.clusterOffsetM` | 1.5 | m | | |
| `shards.respawnDelayS` | 5 | s | 150 | 3 to 10 |
| `shards.announceS` | 3 | s | 90 | 2 to 5 |
| `shards.pickupExtraRadiusM` | 0.5 | m | | 0.3 to 0.8 |
| `shards.dropRingRadiusM` | 1.2 | m | | |
| `shards.dropNudgeStepM` | 0.1 | m | | Fixed GR-10.9 geometry nudge; exposed approved value |
| `shards.dropLifetimeS` | 15 | s | 450 | 10 to 30 |
| `status.ccImmunityS` | 2 | s | 60 | 1 to 3 |
| `cover.rebuildS` | 30 | s | 900 | 20 to 45 |
| `zoneFrenzy.koPoints` | 5 | points | | 3 to 10 |
| `zoneFrenzy.zoneRadiusM` | 6 | m | | 5 to 8 |
| `zoneFrenzy.moveEveryS` | 45 | s | 1350 | 30 to 60 |
| `zoneFrenzy.previewS` | 10 | s | 300 | 5 to 15 |
| `zoneFrenzy.pointsPerS` | 1 | points/s | | 0.5 to 2 |

## 7. Input, network, bots, map validation

| Key | Value | Unit | Notes |
|---|---|---|---|
| `keyboardAim.turnStartDegPerS` | 90 | °/s | Left or Right arrow turn rate when first pressed (D-078) |
| `keyboardAim.turnMaxDegPerS` | 300 | °/s | Turn rate cap while held |
| `keyboardAim.turnAccelDegPerS2` | 600 | °/s² | Linear ramp from start to cap (0.35 s); integrated exactly per frame (§9.6) |
| `keyboardAim.distRateMps` | 10 | m/s | Up/Down arrow aim-distance rate |
| `aimAssist.acquireHalfAngleDeg` | 5 | ° | Raw aim within this of an eligible target on a fire press (D-079) |
| `aimAssist.retainHalfAngleDeg` | 7 | ° | Raw aim must stay within this or the assist breaks |
| `aimAssist.maxCorrectionDeg` | 3 | ° | Largest offset from raw aim, scaled by the assist strength setting |
| `aimAssist.pullDegPerS` | 40 | °/s | Offset change rate toward its target and back to 0 |
| `aimAssist.reacquireDelayS` | 0.75 | s | After a break, the same target cannot be acquired again for this long |
| `net.inputRedundancy` | 3 | inputs | Each packet carries the last 3 inputs |
| `net.interpDelayMs` | 100 | ms | Remote entity render delay |
| `net.pingIntervalS` | 2 | s | |
| `net.reconnectS` | 30 | s | Seat held by a proxy bot |
| `net.afkWarnS` | 30 | s | No input with a visible tab: warning |
| `net.afkBotS` | 45 | s | Proxy bot takes over |
| `net.afkAimThresholdDeg` | 2 | ° | Strictly greater aim change counts as meaningful input (§9.4) |
| `net.maxInputsPerS` | 40 | inputs/s | Above this, inputs are dropped |
| `net.inputBufferMax` | 8 | inputs | Server buffer per player; oldest dropped |
| `net.smoothErrorM` | 0.5 | m | Prediction errors below this are smoothed |
| `net.smoothMs` | 100 | ms | Smoothing time |
| `backfill.outOfCombatS` | 3 | s | Prefer removing a bot idle this long (D-038) |
| `bots.*` | | | See `docs/BOT_SPEC.md` §10 for the full table |
| `mapRules.maxSightlineM` | 34 | m | Validator hard limit, cover intact |
| `mapRules.longSightlineM` | 22.5 | m | Validator soft limit |
| `mapRules.maxShareOverLong` | 0.05 | | At most 5% of sampled lines above the soft limit |
| `mapRules.minPointClearanceM` | 1.5 | m | Spawn, shard, zone, crate points |

---

## 8. `packages/shared/src/balance.ts` (current content)

```ts
// packages/shared/src/balance.ts
// Single source of truth for every gameplay number. Human units. See docs/BALANCE.md.
export const BALANCE = {
  version: 'proto-4',
  tick: { rateHz: 30, patchRateHz: 20 },
  match: {
    seats: 8,
    countdownS: 3,
    durationS: 600,
    resultsS: 15,
    lateJoinCutoffS: 60,
    respawnS: 3,
    spawnProtectionS: 2,
    spawnExcludeRecent: 2,
    assistWindowS: 5,
  },
  movement: { accelMps2: 60, maxSubstepM: 0.25 },
  // GR-4.16 (D-078): no stamina; Turret speed stays 0.
  sprint: { speedMult: 1.3, maxForwardAngleDeg: 60 },
  // GR-4.18: aim distance from the input frame, used by the Arc Mortar.
  aimDistance: { minM: 2, maxM: 24, defaultM: 12 },
  forms: {
    runner: {
      maxHp: 80,
      speedMps: 8.5,
      radiusM: 0.6,
      knockbackMult: 1.0,
      zonePointsMult: 1.0,
      cameraZoom: 1.0,
    },
    beast: {
      maxHp: 140,
      speedMps: 6.0,
      radiusM: 1.0,
      knockbackMult: 0.5,
      zonePointsMult: 1.0,
      cameraZoom: 0.9,
    },
    turret: {
      maxHp: 110,
      speedMps: 0,
      radiusM: 0.9,
      knockbackMult: 0.0,
      zonePointsMult: 0.5,
      cameraZoom: 1.3,
      turnRateDegPerS: 120,
      frontArcDeg: 120,
      frontArcDamageMult: 0.75,
    },
  },
  matchup: {
    // attacker form -> defender form (D-010)
    runner: { runner: 1.0, beast: 0.75, turret: 1.25 },
    beast: { runner: 1.25, beast: 1.0, turret: 1.0 },
    turret: { runner: 1.0, beast: 1.25, turret: 1.0 },
  },
  morph: {
    costBeast: 35,
    costTurret: 35,
    costRunner: 0,
    durationS: 0.5,
    cooldownS: 3,
    moveMult: 0.5,
  },
  weapons: {
    muzzleExtraM: 0.1,
    spawnAdvanceMaxMs: 100,
    // GR-7.16: swap and first-gun draw delay.
    swapS: 0.4,
    pulsePistol: {
      damage: 9,
      ratePerS: 6,
      rangeM: 14,
      projSpeedMps: 45,
      projRadiusM: 0.15,
      magazine: 20,
      reloadS: 1.5,
      ammoPerPickup: 80,
      reserveMax: 120,
    },
    // D-077 tier 2 Runner gun; BALANCE.md §9.5 benchmark.
    ricochetDisc: {
      damage: 24,
      bounceDamageMult: 1.25,
      maxBounces: 1,
      ratePerS: 2.5,
      rangeM: 20,
      projSpeedMps: 32,
      projRadiusM: 0.2,
      magazine: 8,
      reloadS: 2,
      ammoPerPickup: 24,
      reserveMax: 32,
    },
    scatterCannon: {
      damagePerPellet: 5,
      pelletOffsetsDeg: [-12, -8, -4, 0, 4, 8, 12],
      ratePerS: 1.25,
      fullDamageRangeM: 4,
      rangeM: 9,
      minFalloffMult: 0.5,
      projSpeedMps: 35,
      projRadiusM: 0.1,
      magazine: 8,
      reloadS: 2,
      ammoPerPickup: 24,
      reserveMax: 32,
    },
    // D-077 tier 2 Beast gun.
    slugCannon: {
      damage: 50,
      ratePerS: 1,
      rangeM: 12,
      projSpeedMps: 55,
      projRadiusM: 0.2,
      magazine: 4,
      reloadS: 2.5,
      ammoPerPickup: 12,
      reserveMax: 16,
    },
    railRepeater: {
      damage: 16,
      ratePerS: 3.5,
      rangeM: 18,
      projSpeedMps: 70,
      projRadiusM: 0.12,
      armDistanceM: 4,
      closeDamageMult: 0.5,
      heatMaxS: 7,
      overheatS: 2,
      heatCoolPerS: 2,
      magazine: 30,
      reloadS: 2,
      ammoPerPickup: 60,
      reserveMax: 90,
    },
    // D-077 tier 2 Turret gun: indirect fire, GR-7.26 to GR-7.29.
    arcMortar: {
      damage: 75,
      edgeDamageMult: 0.5,
      blastRadiusM: 2.5,
      minRangeM: 8,
      maxRangeM: 20,
      flightS: 1,
      landingNudgeStepM: 0.1,
      ratePerS: 0.85,
      magazine: 3,
      reloadS: 3,
      ammoPerPickup: 9,
      reserveMax: 12,
    },
    // D-074 starting weapon for every form, GR-7.30 to GR-7.32.
    dagger: {
      damage: 25,
      windupS: 0.1,
      recoveryS: 0.5,
      reachM: 0.8,
      widthM: 0.7,
    },
  },
  // GR-18.2 (D-074): credited KOs in the current match.
  progression: { beastUnlockKos: 3, turretUnlockKos: 6 },
  // GR-19 (D-075): random per-match placement, automatic pickup.
  loot: {
    tier1PerGun: 3,
    tier2PerGun: 2,
    respawnS: 20,
    pickupExtraRadiusM: 0.5,
    candidateGridM: 1,
    minClearanceM: 1.5,
    minSpacingM: 6,
    minSpawnPointDistM: 4,
    minPlayerDistM: 3,
    placementAttempts: 24,
  },
  abilities: {
    dash: { distanceM: 6, durationS: 0.2, cooldownS: 5 },
    ramCharge: {
      windupS: 0.15,
      speedMps: 12,
      maxDurationS: 0.8,
      damage: 25,
      knockbackM: 4,
      knockbackDurationS: 0.2,
      wallStunS: 0.4,
      cooldownS: 7,
    },
    railShot: {
      chargeS: 0.6,
      damage: 45,
      rangeM: 18,
      widthM: 0.4,
      cancelCooldownS: 2,
      cooldownS: 6,
    },
  },
  status: { ccImmunityS: 2 },
  flux: {
    max: 100,
    start: 60,
    regenPerS: 1,
    smallShard: 5,
    largeShard: 15,
    ko: 20,
    assist: 10,
    deathDropFrac: 0.4,
    respawnFloor: 40,
  },
  shards: {
    activeClusters: 3,
    clusterSmall: 4,
    clusterLarge: 1,
    clusterOffsetM: 1.5,
    respawnDelayS: 5,
    announceS: 3,
    pickupExtraRadiusM: 0.5,
    dropRingRadiusM: 1.2,
    dropNudgeStepM: 0.1,
    dropLifetimeS: 15,
  },
  cover: { rebuildS: 30 },
  zoneFrenzy: {
    koPoints: 5,
    zoneRadiusM: 6,
    moveEveryS: 45,
    previewS: 10,
    pointsPerS: 1,
  },
  // D-078 client aim model: Left/Right arrows turn, Up/Down change aim distance.
  keyboardAim: {
    turnStartDegPerS: 90,
    turnMaxDegPerS: 300,
    turnAccelDegPerS2: 600,
    distRateMps: 10,
  },
  // D-079 fragile assist: acquire on fire only, retain from raw aim, no lead.
  aimAssist: {
    acquireHalfAngleDeg: 5,
    retainHalfAngleDeg: 7,
    maxCorrectionDeg: 3,
    pullDegPerS: 40,
    reacquireDelayS: 0.75,
  },
  net: {
    inputRedundancy: 3,
    interpDelayMs: 100,
    pingIntervalS: 2,
    reconnectS: 30,
    afkWarnS: 30,
    afkBotS: 45,
    afkAimThresholdDeg: 2,
    maxInputsPerS: 40,
    inputBufferMax: 8,
    smoothErrorM: 0.5,
    smoothMs: 100,
  },
  backfill: { outOfCombatS: 3 },
  bots: {
    decisionHz: 5,
    perceptionRangeM: 22,
    memoryS: 2,
    retreatHpFrac: 0.3,
    leaderTargetBonus: 0.15,
    morphBeastThreatM: 12,
    morphRunnerThreatM: 6,
    stuckS: 1.5,
    aimErrorRerollS: 0.5,
    ramMaxRangeM: 8,
    ramMaxAngleDeg: 15,
    dashEngageRangeM: 10,
    railShotMinRangeM: 6,
    tiers: {
      easy: {
        reactionMs: 450,
        aimErrorDeg: 12,
        leadFactor: 0.0,
        aimTurnDegPerS: 360,
        fireToleranceDeg: 15,
        counterFormChance: 0.4,
        abilityUseChance: 0.3,
      },
      normal: {
        reactionMs: 300,
        aimErrorDeg: 7,
        leadFactor: 0.5,
        aimTurnDegPerS: 540,
        fireToleranceDeg: 10,
        counterFormChance: 0.7,
        abilityUseChance: 0.6,
      },
      hard: {
        reactionMs: 180,
        aimErrorDeg: 3,
        leadFactor: 0.9,
        aimTurnDegPerS: 720,
        fireToleranceDeg: 6,
        counterFormChance: 0.9,
        abilityUseChance: 0.9,
      },
    },
  },
  mapRules: {
    maxSightlineM: 34,
    longSightlineM: 22.5,
    maxShareOverLong: 0.05,
    minPointClearanceM: 1.5,
  },
} as const;

export type Balance = typeof BALANCE;
```

This copy matches the code at proto-4; the code wins if they ever differ. Production keys (crates, Overdrive, bounty, characters, arena events) are added after the Approval Gate, using the values in `docs/GDD.md` Appendix E as the starting point.

---

## 9. Formulas and derived numbers

### 9.1 Damage

```text
final = base × distanceMul × matchupMul × armorMul
hpFrac -= final / defenderMaxHp
Scatter distanceMul = 1 if d ≤ 4, else 1 - 0.5 × (d - 4) / 5
Rail Repeater distanceMul = 0.5 if d < 4, else 1
armorMul = 0.75 if the defender is a Turret and the hit is within ±60° of its aim, else 1
```

### 9.2 Time to kill (all hits land)

Computed as `(shotsNeeded - 1) × fireInterval`, first shot at time 0, ignoring travel and flight time, with the matchup and front-arc multipliers of §9.1. Real fights take 1.5 to 2 times longer because of misses. A `*` marks a kill that needs more rounds than one magazine.

| Attacker \ Defender | Runner (80) | Beast (140) | Turret (110) flank / front |
|---|---|---|---|
| Runner, Pulse Pistol (T1) | 9 hits, 1.33 s | 21 hits, 3.33 s* (losing) | 10 hits, 1.50 s / 14 hits, 2.17 s (winning) |
| Runner, Ricochet Disc (T2) | 4 hits, 1.20 s | 8 hits, 2.80 s (losing) | 4 hits, 1.20 s / 5 hits, 1.60 s (winning) |
| Beast, Scatter within 4 m (T1) | 2 shots, 0.80 s (winning) | 4 shots, 2.40 s | 4 shots, 2.40 s / 5 shots, 3.20 s |
| Beast, Slug Cannon (T2) | 2 hits, 1.00 s (winning) | 3 hits, 2.00 s | 3 hits, 2.00 s / 3 hits, 2.00 s |
| Turret, Rail beyond 4 m (T1) | 5 hits, 1.14 s (within 4 m: 10 hits, 2.57 s) | 7 hits, 1.71 s (winning) | 7 hits, 1.71 s / 10 hits, 2.57 s |
| Turret, Arc Mortar center (T2) | 2 shells, 1.18 s + 1.0 s flight | 2 shells, 1.18 s + 1.0 s flight (winning) | 2 shells, 1.18 s + 1.0 s flight / same |
| Runner, dagger | 4 strikes, 1.90 s | 8 strikes, 4.30 s | 4 strikes, 1.90 s / 5 strikes, 2.50 s |
| Beast, dagger | 3 strikes, 1.30 s | 6 strikes, 3.10 s | 5 strikes, 2.50 s / 6 strikes, 3.10 s |
| Turret, dagger | 4 strikes, 1.90 s | 5 strikes, 2.50 s | 5 strikes, 2.50 s / 6 strikes, 3.10 s |

Dagger time is `windupS + (strikes - 1) × 0.6 s`.

Watch items for playtests:
- Beast versus Runner at point blank is 0.8 s. If Runners report "instant deaths", tune `damagePerPellet` down or `fullDamageRangeM` down first.
- Turret versus Runner beyond 4 m (1.14 s) is faster than Runner versus Turret on the flank (1.50 s). The Runner wins only by closing inside 4 m and flanking, as designed. If Turrets dominate, lower `forms.turret.turnRateDegPerS` (easier to flank) or lower Rail Repeater damage.

### 9.3 Ability damage after matchup

| Ability | vs Runner | vs Beast | vs Turret (flank / front) |
|---|---|---|---|
| Ram Charge (25) | 31.25 | 25 | 25 / 18.75 |
| Rail Shot (45) | 45 | 56.25 | 45 / 33.75 |

### 9.4 Flux economy per 10-minute match (estimate)

| Source | Flux |
|---|---|
| Starting Flux | 60 |
| Passive regeneration (600 s × 1) | 600 |
| Shards (scaled from about 2 clusters' worth per 3 minutes) | about 200 |
| KOs and assists | about 130 |
| Crates | 0 (excluded) |
| **Total** | **about 990, up to 28 paid morphs** |

Morphs need an unlocked target (GR-18.2), so early-match morphs are limited by KOs, not Flux. The per-minute rate matches proto-3. H1's 4 to 8 morphs per 3-minute match is about 13 to 27 per 10-minute match; measure it before tuning. Levers in order: `morph.cost*`, then `flux.regenPerS`, then `morph.cooldownS` (`docs/PLAYTEST_PLAN.md` §7). The 3 and 6 KO thresholds are fixed by D-074; measured snowballing is reported, not tuned away.

### 9.5 Tier 2 higher-damage benchmark (D-077)

**Benchmark.** Neutral matchup (1.0), stationary target, every projectile hits at full damage (Scatter within 4 m, Rail Repeater beyond 4 m, disc without a bounce, mortar at the blast center), from a full magazine. Burst DPS = damage per attack × `ratePerS`. Sustained DPS = magazine × damage / ((magazine − 1) × interval + max(reload, interval)); the Rail Repeater figure comes from a tick-accurate run with heat (30 shots in 364 ticks). Travel and flight time are excluded, as in §9.2.

| Form | Tier 1 per attack / burst / sustained | Tier 2 per attack / burst / sustained | Tier 2 vs tier 1 |
|---|---|---|---|
| Runner | Pulse 9 / 54 / 38.6 | Disc 24 / 60 / 40.0 | +167% per attack, +11.1% burst, +3.7% sustained |
| Beast | Scatter 35 / 43.75 / 36.8 | Slug 50 / 50 / 36.4 | +43% per attack, +14.3% burst, −1.3% sustained |
| Turret | Rail 16 / 56 / 39.6 | Mortar 75 / 63.75 / 42.0 | +369% per attack, +13.8% burst, +6.1% sustained |

**Claim.** Each tier 2 gun deals more damage per attack and at least 10% more burst DPS than its tier 1 partner under this benchmark. Sustained DPS stays within ±7%, because tier 2 pays with smaller magazines and longer reloads.

**Tradeoffs and limits.** Tier 2 does not win every fight:
- The Ricochet Disc flies at 32 m/s against the Pulse Pistol's 45 m/s, so it is easier to dodge at range. A bounce adds 25% and reaches a Turret's flank.
- The Slug Cannon needs one precise hit. Inside 4 m the Scatter fan kills a Runner faster (0.80 s against 1.00 s). Beyond 4 m, where Scatter falls off, the Slug wins every matchup.
- The Arc Mortar adds a 1.0 s telegraphed flight, cannot land closer than 8 m and is blocked by walls between the blast and the target. Including flight, it is slower than the Rail Repeater except against a front-armored Turret (2.18 s against 2.57 s). It can hit several players and reach over walls.
- Pickup ammunition limits tier 2 harder: 576 (Disc), 600 (Slug) and 675 (Mortar) potential damage per pickup, against 720 (Pulse), 840 (Scatter) and 960 (Rail).

### 9.6 Keyboard turn model (client, D-078)

While exactly one of Left or Right is held for `h` seconds, the turn rate is `ω(h) = min(turnMax, turnStart + turnAccel × h)`. The turn over a frame from `h0` to `h1` is the exact integral of `ω` over that interval, so the total angle depends only on how long the key was held, never on the frame rate. Releasing the key, or holding both, stops turning at once and resets `h`. Up and Down change the aim distance at `distRateMps`, clamped to the `aimDistance` limits.

---

## 10. Change log

| Version | Date | Change | Reason | Decision |
|---|---|---|---|---|
| proto-1 | 2026-10-14 | Initial values from GDD v2.1 plus prototype additions | Prototype start | D-002 |
| proto-2 | 2026-10-20 | Exposed `shards.dropNudgeStepM = 0.1` from GR-10.9 | Missing approved key; no existing value tuned | GR-10.9 |
| proto-3 | 2026-10-20 | Exposed `net.afkAimThresholdDeg = 2` from NETWORK_PROTOCOL §9.4 | Required for tick-based AFK input detection; no existing value tuned | NETWORK_PROTOCOL §9.4 |
| proto-4 | 2026-10-23 | `match.durationS` 180 to 600; added sprint, aim distance, magazines, reloads, swap, three tier 2 guns, dagger, progression, loot, keyboard turn and fragile assist keys; removed `softLock.*` and `keyboardAim.turnDegPerS` | Owner release request; tier 2 values calculated under D-077 (§9.5) | D-073 to D-079 |
