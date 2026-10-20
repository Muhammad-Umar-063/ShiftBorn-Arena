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
| `match.durationS` | 180 | s | 5400 | 150 to 240 | |
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

| Key | Pulse Pistol | Scatter Cannon | Rail Repeater | Unit |
|---|---|---|---|---|
| `damage` / `damagePerPellet` | 9 | 5 (7 pellets) | 16 | HP |
| `ratePerS` | 6 | 1.25 | 3.5 | shots/s |
| interval (derived) | 0.1667 | 0.8 | 0.2857 | s |
| `rangeM` | 14 | 9 | 18 | m |
| `projSpeedMps` | 45 | 35 | 70 | m/s |
| `projRadiusM` | 0.15 | 0.10 | 0.12 | m |
| Base DPS (derived) | 54 | 43.75 within 4 m | 56 beyond 4 m | HP/s |

Scatter Cannon extras: `pelletOffsetsDeg` = [-12, -8, -4, 0, 4, 8, 12], `fullDamageRangeM` 4, `minFalloffMult` 0.5.
Rail Repeater extras: `armDistanceM` 4, `closeDamageMult` 0.5, `heatMaxS` 7, `overheatS` 2 (60 ticks), `heatCoolPerS` 2.
Shared: `weapons.muzzleExtraM` 0.1 m, `weapons.spawnAdvanceMaxMs` 100 ms (max 3 ticks).

Tuning ranges: damage ±20%, rate ±20%, range ±15%, projectile speed ±20%. Keep each form weapon's DPS within 10% of the others' DPS against a neutral target unless a decision says otherwise.

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
| `keyboardAim.turnDegPerS` | 720 | °/s | Arrow-key aim rotates toward the pressed direction at this rate |
| `softLock.acquireConeDeg` | 60 | ° | Full cone width around the aim |
| `softLock.trackTurnDegPerS` | 720 | °/s | Tracking speed while locked (Turret still capped at 120) |
| `softLock.leadFactor` | 0.5 | | 0 to 0.5 by the aim assist setting; fairness knob (H9) |
| `softLock.breakAfterS` | 0.5 | s | Out of sight or range this long breaks the lock |
| `softLock.releaseHoldS` | 0.5 | s | Holding Q this long releases the lock |
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

## 8. `packages/shared/src/balance.ts` (starting content)

```ts
// packages/shared/src/balance.ts
// Single source of truth for every gameplay number. Human units. See docs/BALANCE.md.
export const BALANCE = {
  version: 'proto-3',
  tick: { rateHz: 30, patchRateHz: 20 },
  match: {
    seats: 8, countdownS: 3, durationS: 180, resultsS: 15, lateJoinCutoffS: 60,
    respawnS: 3, spawnProtectionS: 2, spawnExcludeRecent: 2, assistWindowS: 5,
  },
  movement: { accelMps2: 60, maxSubstepM: 0.25 },
  forms: {
    runner: { maxHp: 80,  speedMps: 8.5, radiusM: 0.6, knockbackMult: 1.0, zonePointsMult: 1.0, cameraZoom: 1.0 },
    beast:  { maxHp: 140, speedMps: 6.0, radiusM: 1.0, knockbackMult: 0.5, zonePointsMult: 1.0, cameraZoom: 0.9 },
    turret: { maxHp: 110, speedMps: 0,   radiusM: 0.9, knockbackMult: 0.0, zonePointsMult: 0.5, cameraZoom: 1.3,
              turnRateDegPerS: 120, frontArcDeg: 120, frontArcDamageMult: 0.75 },
  },
  matchup: { // attacker form -> defender form (D-010)
    runner: { runner: 1.0,  beast: 0.75, turret: 1.25 },
    beast:  { runner: 1.25, beast: 1.0,  turret: 1.0 },
    turret: { runner: 1.0,  beast: 1.25, turret: 1.0 },
  },
  morph: { costBeast: 35, costTurret: 35, costRunner: 0, durationS: 0.5, cooldownS: 3, moveMult: 0.5 },
  weapons: {
    muzzleExtraM: 0.1,
    spawnAdvanceMaxMs: 100,
    pulsePistol:   { damage: 9, ratePerS: 6, rangeM: 14, projSpeedMps: 45, projRadiusM: 0.15 },
    scatterCannon: { damagePerPellet: 5, pelletOffsetsDeg: [-12, -8, -4, 0, 4, 8, 12], ratePerS: 1.25,
                     fullDamageRangeM: 4, rangeM: 9, minFalloffMult: 0.5, projSpeedMps: 35, projRadiusM: 0.1 },
    railRepeater:  { damage: 16, ratePerS: 3.5, rangeM: 18, projSpeedMps: 70, projRadiusM: 0.12,
                     armDistanceM: 4, closeDamageMult: 0.5, heatMaxS: 7, overheatS: 2, heatCoolPerS: 2 },
  },
  abilities: {
    dash:      { distanceM: 6, durationS: 0.2, cooldownS: 5 },
    ramCharge: { windupS: 0.15, speedMps: 12, maxDurationS: 0.8, damage: 25, knockbackM: 4,
                 knockbackDurationS: 0.2, wallStunS: 0.4, cooldownS: 7 },
    railShot:  { chargeS: 0.6, damage: 45, rangeM: 18, widthM: 0.4, cancelCooldownS: 2, cooldownS: 6 },
  },
  status: { ccImmunityS: 2 },
  flux: { max: 100, start: 60, regenPerS: 1, smallShard: 5, largeShard: 15, ko: 20, assist: 10,
          deathDropFrac: 0.4, respawnFloor: 40 },
  shards: { activeClusters: 3, clusterSmall: 4, clusterLarge: 1, clusterOffsetM: 1.5, respawnDelayS: 5,
            announceS: 3, pickupExtraRadiusM: 0.5, dropRingRadiusM: 1.2, dropNudgeStepM: 0.1, dropLifetimeS: 15 },
  cover: { rebuildS: 30 },
  zoneFrenzy: { koPoints: 5, zoneRadiusM: 6, moveEveryS: 45, previewS: 10, pointsPerS: 1 },
  keyboardAim: { turnDegPerS: 720 },
  softLock: { acquireConeDeg: 60, trackTurnDegPerS: 720, leadFactor: 0.5, breakAfterS: 0.5, releaseHoldS: 0.5 },
  net: { inputRedundancy: 3, interpDelayMs: 100, pingIntervalS: 2, reconnectS: 30, afkWarnS: 30, afkBotS: 45, afkAimThresholdDeg: 2,
         maxInputsPerS: 40, inputBufferMax: 8, smoothErrorM: 0.5, smoothMs: 100 },
  backfill: { outOfCombatS: 3 },
  bots: {
    decisionHz: 5, perceptionRangeM: 22, memoryS: 2, retreatHpFrac: 0.3, leaderTargetBonus: 0.15,
    morphBeastThreatM: 12, morphRunnerThreatM: 6, stuckS: 1.5, aimErrorRerollS: 0.5,
    ramMaxRangeM: 8, ramMaxAngleDeg: 15, dashEngageRangeM: 10, railShotMinRangeM: 6,
    tiers: {
      easy:   { reactionMs: 450, aimErrorDeg: 12, leadFactor: 0.0, aimTurnDegPerS: 360, fireToleranceDeg: 15,
                counterFormChance: 0.4, abilityUseChance: 0.3 },
      normal: { reactionMs: 300, aimErrorDeg: 7,  leadFactor: 0.5, aimTurnDegPerS: 540, fireToleranceDeg: 10,
                counterFormChance: 0.7, abilityUseChance: 0.6 },
      hard:   { reactionMs: 180, aimErrorDeg: 3,  leadFactor: 0.9, aimTurnDegPerS: 720, fireToleranceDeg: 6,
                counterFormChance: 0.9, abilityUseChance: 0.9 },
    },
  },
  mapRules: { maxSightlineM: 34, longSightlineM: 22.5, maxShareOverLong: 0.05, minPointClearanceM: 1.5 },
} as const;

export type Balance = typeof BALANCE;
```

Production keys (crates, Overdrive, bounty, characters, arena events) are added after the Approval Gate, using the values in `docs/GDD.md` Appendix E as the starting point.

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

### 9.2 Time to kill (all hits land, form weapons only)

Computed as `(shotsNeeded - 1) × fireInterval`, first shot at time 0, ignoring travel time. Real fights take 1.5 to 2 times longer because of misses.

| Attacker \ Defender | Runner (80) | Beast (140) | Turret (110) |
|---|---|---|---|
| Runner (Pulse Pistol) | 9 hits, 1.33 s | 21 hits, 3.33 s (losing) | flank 10 hits, 1.50 s; front 14 hits, 2.17 s (winning) |
| Beast (Scatter, within 4 m) | 2 shots, 0.80 s (winning) | 4 shots, 2.40 s | flank 4 shots, 2.40 s; front 5 shots, 3.20 s |
| Turret (Rail Repeater, beyond 4 m) | 5 hits, 1.14 s (within 4 m: 10 hits, 2.57 s) | 7 hits, 1.71 s (winning) | flank 7 hits, 1.71 s; front 10 hits, 2.57 s |

Watch items for playtests:
- Beast versus Runner at point blank is 0.8 s. If Runners report "instant deaths", tune `damagePerPellet` down or `fullDamageRangeM` down first.
- Turret versus Runner beyond 4 m (1.14 s) is faster than Runner versus Turret on the flank (1.50 s). The Runner wins only by closing inside 4 m and flanking, as designed. If Turrets dominate, lower `forms.turret.turnRateDegPerS` (easier to flank) or lower Rail Repeater damage.

### 9.3 Ability damage after matchup

| Ability | vs Runner | vs Beast | vs Turret (flank / front) |
|---|---|---|---|
| Ram Charge (25) | 31.25 | 25 | 25 / 18.75 |
| Rail Shot (45) | 45 | 56.25 | 45 / 33.75 |

### 9.4 Flux economy per 3-minute match (estimate, prototype)

| Source | Flux |
|---|---|
| Starting Flux | 60 |
| Passive regeneration (180 s × 1) | 180 |
| Shards (about 2 clusters' worth per player) | about 60 |
| KOs and assists | about 40 |
| Crates | 0 (not in the prototype) |
| **Total** | **about 340, up to 9 paid morphs** |

Design target: 4 to 8 morphs per human per match (H1). Levers in order: `morph.cost*`, then `flux.regenPerS`, then `morph.cooldownS` (`docs/PLAYTEST_PLAN.md` §7).

---

## 10. Change log

| Version | Date | Change | Reason | Decision |
|---|---|---|---|---|
| proto-1 | 2026-10-14 | Initial values from GDD v2.1 plus prototype additions | Prototype start | D-002 |
| proto-2 | 2026-10-20 | Exposed `shards.dropNudgeStepM = 0.1` from GR-10.9 | Missing approved key; no existing value tuned | GR-10.9 |
| proto-3 | 2026-10-20 | Exposed `net.afkAimThresholdDeg = 2` from NETWORK_PROTOCOL §9.4 | Required for tick-based AFK input detection; no existing value tuned | NETWORK_PROTOCOL §9.4 |
