# GAME_RULES.md

> **LLM FILE CONTRACT:** Authoritative prototype behavior and tick-order contract for `packages/sim`. Cite its `GR-x.y` ids in code and tests. Get every number from `BALANCE.md` and never fill a gap by guessing.

Precise prototype rules for forms, movement, combat, Flux, health, respawn, scoring and the objective. This is the gameplay contract for `packages/sim`.

- Every number here is a starting value that lives in `packages/shared/src/balance.ts`. The key is shown in `code` (see `docs/BALANCE.md`). Code must read the key, never hard-code the number.
- Rule IDs (`GR-x.y`) are cited by tests in `docs/ACCEPTANCE_TESTS.md` and tasks in `TASKS.md`.
- If a situation is not covered here, do not invent a rule. Add it to `OPEN_QUESTIONS.md`.
- Out of scope for the prototype (D-022): crates, characters, Ultimates, Overdrive, bounty, arena events, hazards, jump pads, grapple anchors. They do not exist in the prototype sim.

---

## 1. Conventions

- **GR-1.1 Units.** Distance in meters (m), time in seconds (s), speed in m/s, angles in radians inside the sim. `docs/BALANCE.md` stores degrees and seconds; `packages/shared` converts once at load (D-046).
- **GR-1.2 Coordinates.** x points east, y points north, origin at the map center. Angle 0 points east and angles grow counter-clockwise. Aim angles are normalized to [0, 2π).
- **GR-1.3 Tick.** The sim advances in fixed ticks at `tick.rateHz` = 30. `dt` = 1/30 s. Tick 0 is the first tick of a room.
- **GR-1.4 Timers.** Durations convert to whole ticks with `ticks = Math.round(seconds × 30)` (JavaScript rounding). All derived tick values are listed in `docs/BALANCE.md` §3. Exception: weapon fire intervals use a seconds accumulator (GR-7.2) so non-integer rates stay exact on average.
- **GR-1.5 Determinism.** Given the same seed, map and input stream, the sim produces bit-identical state on the same Node.js version. Randomness comes only from the match RNG (seeded per match). No `Math.random()`, no `Date.now()`, no iteration over unordered collections without sorting by a stable id.
- **GR-1.6 Processing order.** Players are processed in ascending seat index (0 to 7). Projectiles in ascending projectile id. Shards in ascending shard id. Section 15 gives the order of systems inside a tick.
- **GR-1.7 Who is an enemy.** In the prototype every mode is free-for-all: every other player, human or bot, is an enemy. There is no friendly fire because there are no teams.
- **GR-1.8 Floating point.** Use plain JavaScript numbers (float64). Avoid trigonometry in the per-tick movement path; store aim as an angle but move with precomputed unit vectors. Compare with a small epsilon (`1e-9`) where the text says "reaches 0".

---

## 2. Room and match flow

- **GR-2.1 Seats.** A room has `match.seats` = 8 seats. Humans take seats; bots fill every empty seat (D-038, `docs/BOT_SPEC.md` §9). A code room's host may lower the bot count (GR-2.9).
- **GR-2.2 Phases.** A room cycles through three phases forever:

| Phase | Length | Key | What happens |
|---|---|---|---|
| COUNTDOWN | 3 s (90 ticks) | `match.countdownS` | All players are spawned. Players can move and aim. They cannot fire, use abilities or morph. No damage, no Flux regeneration, no zone scoring. A 3, 2, 1 counter shows. |
| PLAYING | 180 s (5400 ticks) | `match.durationS` | Normal play. |
| RESULTS | 15 s (450 ticks) | `match.resultsS` | No input is applied. Projectiles are removed at the start of RESULTS. The results screen shows. |

- **GR-2.3 Room start.** When a room is created it starts in COUNTDOWN with a new match id and match seed (GR-2.10).
- **GR-2.4 Match start (each COUNTDOWN).** Scores, KOs, deaths, assists, points, damage and per-match stats reset to 0. Every seated player spawns: seat order is matched to a seeded shuffle of the 10 spawn points. Every player starts as Runner, full health, Flux = `flux.start` (60), all cooldowns ready, Rail heat 0, no status effects. Spawn protection does not apply during COUNTDOWN; it is granted for 2 s from the first PLAYING tick (GR-11.6). The two most recently used spawn points are set to the last two assigned in this shuffle.
- **GR-2.5 Shards and zone at match start.** Three shard clusters spawn immediately (GR-10.5). In Zone Frenzy the Surge Zone activates at Z-0 at the first PLAYING tick (GR-13.2). Destructible cover is fully rebuilt at match start.
- **GR-2.6 Late join.** A human may join during COUNTDOWN, RESULTS, or PLAYING while more than `match.lateJoinCutoffS` (60 s) remain. Joining during PLAYING spawns the player at once through the respawn rules (GR-11.5) with Flux `flux.start` and spawn protection. Joining during RESULTS shows the results screen and the player plays the next match. Quick-play rooms are locked to matchmaking when 60 s or less remain (`docs/NETWORK_PROTOCOL.md` §3.3). Code rooms always accept joins; a player who joins with 60 s or less left waits on an overview camera until the next COUNTDOWN.
- **GR-2.7 Match end.** At the last PLAYING tick the match ends: all projectiles, charges and dashes stop, scores freeze, and the ranking is computed (GR-12.3). RESULTS begins on the next tick.
- **GR-2.8 Next match.** After RESULTS, a new COUNTDOWN begins with a new match id and seed in the same room. Players who left during RESULTS are replaced by bots.
- **GR-2.9 Host settings (code rooms only).** The host can set, effective from the next COUNTDOWN: mode (Frenzy or Zone Frenzy), bot fill (on or off; off leaves empty seats empty), bot difficulty (Easy, Normal, Hard). Quick-play rooms use the server default mode (environment variable, default Frenzy in Stage A, alternating Frenzy and Zone Frenzy per match in Stage B) with bot fill on and adaptive difficulty off (Normal).
- **GR-2.10 Seeds.** The room seed comes from the server's crypto RNG when the room is created. Each match seed is derived from the room seed and match index with a fixed hash. Both are written to the match log so any match can be replayed.

---

## 3. Player state

Each seat holds a player record. The sim owns these fields (names are the canonical identifiers in code):

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable player id for the room session (human: session id; bot: `bot-<n>`) |
| `seat` | 0 to 7 | Seat index; processing order |
| `name` | string | Display name (human: chosen name; bot: generated) |
| `isBot` | boolean | True for bots |
| `controller` | `human`, `bot`, `proxy` | `proxy` = a bot driving a human's seat while their tab is hidden or they are AFK or reconnecting |
| `alive` | boolean | False while dead |
| `pos` | vec2 | Center position |
| `vel` | vec2 | Input-driven velocity |
| `aim` | radians | Current aim and facing angle |
| `form` | `runner`, `beast`, `turret` | Current form (the old form while morphing) |
| `morph` | null or `{ target, endTick }` | Morph in progress |
| `morphReadyTick` | tick | Tick from which a new morph is allowed |
| `hpFrac` | 0 to 1 | Health as a fraction of the current form's max health (D-012) |
| `flux` | 0 to 100 | Flux, float |
| `ability` | null or ability state | Dash, Ram Charge (windup or charge) or Rail Shot (charge) in progress |
| `abilityReadyTick` | per form | Tick from which each form's ability is ready (D-014) |
| `weapon` | per form | `nextShotIn` seconds for each form weapon |
| `heat`, `overheatEndTick` | seconds, tick | Rail Repeater heat state |
| `stunEndTick`, `ccImmuneEndTick` | tick | Status timers |
| `knockback` | null or `{ vel, endTick }` | Forced movement in progress |
| `protectedEndTick` | tick | Spawn protection end |
| `respawnTick` | tick | When a dead player respawns |
| `damageLog` | list | `{ attackerId, tick, amount }` entries for the last 5 s, for assists |
| `lastInputSeq` | int | Last processed input sequence number |
| `aimSource` | `mouse`, `keys`, `lock`, `bot` | From the latest input (telemetry only) |
| `stats` | object | Per-match counters (GR-12.4) |

---

## 4. Forms, movement and collision

### 4.1 Form stats

| Stat | Runner | Beast | Turret | Key |
|---|---|---|---|---|
| Max health | 80 | 140 | 110 | `forms.<form>.maxHp` |
| Move speed | 8.5 m/s | 6.0 m/s | 0 (rooted) | `forms.<form>.speedMps` |
| Hitbox radius | 0.6 m | 1.0 m | 0.9 m | `forms.<form>.radiusM` |
| Knockback taken | 100% | 50% | 0% | `forms.<form>.knockbackMult` |
| Aim turn rate | instant | instant | 120°/s (4° per tick) | `forms.turret.turnRateDegPerS` |
| Front-arc armor | none | none | 25% less damage within ±60° of aim | `forms.turret.frontArcDeg`, `forms.turret.frontArcDamageMult` |
| Primary weapon | Pulse Pistol | Scatter Cannon | Rail Repeater | GR-7 |
| Ability | Dash | Ram Charge | Rail Shot | GR-8 |
| Zone points rate | 100% | 100% | 50% | `forms.<form>.zonePointsMult` |
| Camera zoom (client) | 1.0 | 0.9 | 1.3 | `forms.<form>.cameraZoom` |

- **GR-4.1** Every player is always exactly one form. While morphing, the player is still the old form for every stat (D-013, GR-5.3).

### 4.2 Movement

- **GR-4.2 Move input.** The input carries `moveX` and `moveY` as integers from -127 to 127. The sim divides by 127 and, if the vector is longer than 1, normalizes it. Keyboard input therefore gives 8 directions at full speed.
- **GR-4.3 Target velocity.** `target = moveDir × speed × mult`, where `speed` is the form speed and `mult` is 1, or `morph.moveMult` (0.5) while morphing.
- **GR-4.4 Acceleration.** Each tick `vel` moves toward `target` by at most `movement.accelMps2 × dt` (60 m/s² gives 2 m/s per tick). A Runner reaches full speed in 5 ticks; a Beast in 3.
- **GR-4.5 Turret.** A Turret's speed is 0. When the Turret form becomes active, `vel` is set to 0 immediately.
- **GR-4.6 Movement is skipped** (velocity set to 0, input ignored) while dead, stunned, during an ability that controls movement (Dash, Ram Charge windup and charge), during RESULTS, and while knocked back (knockback movement replaces it, GR-9.2).
- **GR-4.7 Integration.** `displacement = vel × dt` (or the ability or knockback velocity × dt). Every displacement is split into sub-steps no longer than `movement.maxSubstepM` (0.25 m) to prevent tunneling. Each sub-step moves the circle, then resolves collisions (GR-4.8).

### 4.3 Collision

- **GR-4.8 Walls.** A player is a circle with the form's radius. Walls and intact destructible cover are axis-aligned boxes (`docs/MAP_SPEC.md`). After each sub-step, if the circle overlaps a box, push it out along the shortest separation vector (closest point on the box to the circle center). Repeat over all boxes up to 3 passes. The velocity component into the wall is removed, so players slide along walls.
- **GR-4.9 Players do not collide with each other** (D-018). Only Ram Charge tests player contact (GR-8.3).
- **GR-4.10 Map bounds.** The outer walls keep players inside. If a position is ever found outside the playable area (x or y beyond ±31 m minus the radius), clamp it back and log a warning event.
- **GR-4.11 Line of sight** (used by bots, lock-on and Rail Shot) is a segment test against walls and intact cover only. Players never block line of sight or projectiles aimed at someone else; a projectile stops at the first player it hits (GR-7.6).

### 4.4 Aim

- **GR-4.12 Runner and Beast** set `aim` directly to the input aim angle each tick.
- **GR-4.13 Turret** turns `aim` toward the input aim by at most `turnRateDegPerS × dt` (4° per tick), along the shorter direction. This cap also applies while charging Rail Shot.
- **GR-4.14 Aim is frozen** while dead, stunned, during Ram Charge windup and charge, and during RESULTS.
- **GR-4.15 Aim during a morph** follows the old form's rule.

---

## 5. Morphing

- **GR-5.1 Request.** Pressing the key for Runner (1), Beast (2) or Turret (3) sends a morph request bit (input edge). Requesting the current form does nothing.
- **GR-5.2 Allowed when all are true:** phase is PLAYING; alive; not already morphing; `tick ≥ morphReadyTick`; not stunned; not knocked back; no ability in progress; `flux ≥ cost(target)`. Costs: Runner 0 (`morph.costRunner`), Beast 35 (`morph.costBeast`), Turret 35 (`morph.costTurret`). If any check fails, nothing happens and the sim emits `morphDenied` with the reason (the HUD flashes the form button).
- **GR-5.3 Start.** Flux is reduced by the cost immediately. `morph = { target, endTick: tick + 15 }` (`morph.durationS` = 0.5 s). During the morph the player: keeps the old form's hitbox, max health, matchup class, armor and knockback stat; moves at 50% of the old form's speed (`morph.moveMult`; a Turret stays rooted); cannot fire, use an ability or request another morph; is immune to knockback; takes damage normally; can collect shards and count for the Surge Zone (as the old form).
- **GR-5.4 End.** At `endTick` the form becomes `target`. `hpFrac` is unchanged (D-012). If the new form is Turret, `vel` is set to 0. `morphReadyTick = endTick + 90` (`morph.cooldownS` = 3 s). Emit `morphEnd`.
- **GR-5.5 Death during a morph** cancels it. Flux is not refunded. The player respawns as Runner.
- **GR-5.6 No cancel.** A morph cannot be cancelled by the player.
- **GR-5.7 Cooldowns across forms.** Ability cooldowns and weapon timers of every form keep counting down in every form (D-014).
- **GR-5.8 Match end during a morph.** The morph is dropped; the next match starts as Runner anyway.

---

## 6. Health and damage

- **GR-6.1 Storage.** `hpFrac` is a float from 0 to 1 (D-012). Max health comes from the current form.
- **GR-6.2 Damage pipeline.** For any damage event:

```text
base        = weapon or ability damage (GR-7, GR-8)
distanceMul = Scatter falloff or Rail arm rule, else 1 (GR-7)
matchupMul  = matchup[attackerClass][defenderClass]          (D-010)
armorMul    = forms.turret.frontArcDamageMult (0.75) if the defender is a Turret
              (not morphing out of one) and the hit comes from its front arc, else 1
final       = base × distanceMul × matchupMul × armorMul     (hit points, float)
hpFrac     -= final / defenderMaxHp
```

- **GR-6.3 Attacker class** is the attacker's form when the projectile was fired or the ability started. **Defender class** is the defender's current form (the old form while morphing).
- **GR-6.4 Front arc.** The incoming direction is the reverse of the projectile's travel direction (or of the charge or Rail Shot line direction). The hit is in the front arc if the angle between the Turret's `aim` and the incoming direction is 60° or less (half of `frontArcDeg` = 120°).
- **GR-6.5 Matchup table** (attacker row, defender column), key `matchup`:

| Attacker \ Defender | Runner | Beast | Turret |
|---|---|---|---|
| Runner | 1.0 | 0.75 | 1.25 |
| Beast | 1.25 | 1.0 | 1.0 |
| Turret | 1.0 | 1.25 | 1.0 |

- **GR-6.6 Tags.** A hit is tagged `EFFECTIVE` if `matchupMul > 1`, `RESISTED` if `matchupMul < 1`, and `ARMOR` if `armorMul < 1`. Tags go into the hit event for the HUD.
- **GR-6.7 Death threshold.** If `hpFrac ≤ 1e-9` after damage, the player dies (GR-11). Further damage in the same tick is ignored.
- **GR-6.8 Display.** Health shown in the HUD = `ceil(hpFrac × maxHp - 1e-6)`. A living player shows at least 1. Damage numbers show `round(final)`, minimum 1.
- **GR-6.9 Immunity.** Players with spawn protection take no damage (GR-9.3). Dead players take no damage.
- **GR-6.10 No healing** in the prototype (D-019). `hpFrac` only goes down during a life and resets to 1 on respawn.
- **GR-6.11 Damage log.** Every damage event appends `{ attackerId, tick, amount }` to the defender's `damageLog`. Entries older than 150 ticks (`match.assistWindowS` = 5 s) are dropped.

---

## 7. Form weapons

### 7.1 Weapon table

| | Pulse Pistol (Runner) | Scatter Cannon (Beast) | Rail Repeater (Turret) |
|---|---|---|---|
| Damage per projectile | 9 | 5 per pellet, 7 pellets | 16 |
| Fire rate | 6 per s (every 0.1667 s) | 1.25 per s (every 0.8 s) | 3.5 per s (every 0.2857 s) |
| Projectile speed | 45 m/s | 35 m/s | 70 m/s |
| Range | 14 m | 9 m | 18 m |
| Projectile radius | 0.15 m | 0.10 m | 0.12 m |
| Distance rule | none | full damage to 4 m, linear down to 50% at 9 m | 50% damage if the hit happens within the first 4 m traveled |
| Special | | fixed pattern, no randomness (D-020) | heat: 7 s of firing overheats for 2 s |
| Keys | `weapons.pulsePistol.*` | `weapons.scatterCannon.*` | `weapons.railRepeater.*` |

### 7.2 Firing

- **GR-7.1 Hold to fire.** While the fire bit is held, the weapon fires whenever it is ready. There is no separate click-to-fire mode in the sim.
- **GR-7.2 Fire timer.** Each form weapon has `nextShotIn` (seconds). Every tick, for every form's weapon: `nextShotIn = max(nextShotIn - dt, -dt)`. When the current form's weapon may fire (GR-7.3) and fire is held and `nextShotIn ≤ 0`: fire, then `nextShotIn += 1 / ratePerS`. When fire is not held, `nextShotIn = max(nextShotIn, 0)` so shots cannot be banked.
- **GR-7.3 Firing is blocked** while dead, morphing, stunned, during COUNTDOWN or RESULTS, during Dash, during Ram Charge windup or charge, during Rail Shot charge, and while the Rail Repeater is overheated. Knockback does not block firing.
- **GR-7.4 Firing ends spawn protection** (GR-9.3) on the tick the first shot is fired.

### 7.3 Projectiles

- **GR-7.5 Spawn.** A projectile spawns at `pos + aimDir × (formRadius + weapons.muzzleExtraM)` (0.1 m) moving along `aimDir` at its speed. If the spawn point is inside a wall or intact cover, the projectile is destroyed at once with an impact event and no damage.
- **GR-7.6 Movement and hits.** Each tick a projectile moves `speed × dt`, capped so total travel never exceeds its range. The swept segment is tested against walls and intact cover (boxes inflated by the projectile radius) and against every living player except its owner (circles of player radius + projectile radius). The earliest contact along the segment wins. If a wall and a player tie, the wall wins. On a player hit: damage per GR-6, then the projectile is destroyed. On a wall hit: the projectile is destroyed with an impact event. When travel reaches the range: destroyed with an expire event.
- **GR-7.7 Protected targets.** A projectile that touches a spawn-protected player is destroyed with no damage (the bubble absorbs it) and emits a `blocked` event.
- **GR-7.8 Owner death.** Projectiles keep flying after their owner dies. Their damage and KO still credit the owner.
- **GR-7.9 Server spawn advance.** On the server only, a newly fired projectile from a human is immediately advanced by `A` extra steps in the same tick, with full collision checks, where `A = min(round(oneWayLatencyMs / 33.33), 3)` (`weapons.spawnAdvanceMaxMs` = 100 ms). `oneWayLatencyMs` is half the player's smoothed RTT. Bots use `A = 0`. This keeps shots feeling responsive without full lag compensation (`docs/NETWORK_PROTOCOL.md` §8).

### 7.4 Scatter Cannon pattern and falloff

- **GR-7.10 Pattern.** Each shot fires 7 pellets at fixed angle offsets from `aim`: -12°, -8°, -4°, 0°, +4°, +8°, +12° (`weapons.scatterCannon.pelletOffsetsDeg`). All pellets spawn on the same tick.
- **GR-7.11 Falloff.** With `d` = distance the pellet traveled when it hits: `distanceMul = 1` if `d ≤ 4`, else `1 - 0.5 × (d - 4) / (9 - 4)`. At 9 m the multiplier is 0.5. Pellets expire at 9 m.
- **GR-7.12 Several pellets** can hit the same target in the same tick; each applies damage separately.

### 7.5 Rail Repeater arm distance and heat

- **GR-7.13 Arm distance.** If the bolt hits after traveling less than 4 m (`armDistanceM`), `distanceMul = 0.5` (`closeDamageMult`).
- **GR-7.14 Heat.** Every tick: if the player is a Turret, fire is held, and firing is not blocked (GR-7.3), `heat += dt`; otherwise `heat = max(0, heat - heatCoolPerS × dt)` (2 per s). When `heat ≥ heatMaxS` (7 s): the weapon overheats for `overheatS` (2 s, 60 ticks); then `heat = 0`. Heat and the overheat timer keep running in other forms. Rail Shot is not affected by heat.

---

## 8. Abilities

One ability per form, triggered by the ability input edge (key E). Holding E does not repeat. An ability can start only when: phase is PLAYING; alive; not morphing; not stunned; not knocked back; no other ability in progress; the current form's `abilityReadyTick ≤ tick`. Using an ability ends spawn protection.

### 8.1 Summary table

| Rule | Dash (Runner) | Ram Charge (Beast) | Rail Shot (Turret) |
|---|---|---|---|
| Input | E | E | E starts the charge; the shot fires automatically when charged |
| Direction and targeting | Movement input direction; aim direction if there is no movement input | Aim direction at the press, then locked; cannot steer | Aim direction; the Turret keeps turning (120° per second cap) while charging and the line follows |
| Wind-up | None | 0.15 s visible crouch (5 ticks), rooted | 0.6 s charge (18 ticks) with an aim line visible to everyone who can see the Turret; targets on the line get an edge-of-screen warning when the Turret is off-screen |
| Movement | 6 m over 0.2 s (6 ticks at 30 m/s) | 12 m/s for up to 0.8 s (24 ticks, 9.6 m at most) | None (the Turret is rooted) |
| Damage | None | 25 to the first enemy hit, times the matchup modifier | 45 to every enemy on the line, times the matchup modifier and front-arc armor |
| Range and shape | 6 m path; stops at walls and slides along them | Swept circle, radius 1.0 m (the Beast hitbox) | Instant line, 18 m long, 0.4 m wide; passes through players, stopped by walls and intact cover |
| Effect on hit | None | Target knocked back 4 m along the charge direction (scaled by its knockback stat); the charge ends | Damage only |
| Collisions | Passes through players, not walls | Ends on the first enemy, wall or cover. Wall: the Beast is stunned 0.4 s. Intact destructible cover: it breaks, no stun | Resolved on the server at release with server positions; no lag compensation (the telegraph keeps it fair) |
| While active | Cannot fire or morph; can aim | Cannot fire, morph, aim or move by input | Cannot fire the Rail Repeater or morph; can aim (turn cap applies) |
| Interrupted by | Stun or knockback ends it early; damage does not | Stun or knockback ends it early; damage does not | Stun, knockback or death cancels it; a cancelled charge goes on a 2 s cooldown |
| Cooldown | 5 s, from the end of the dash | 7 s, from the end of the charge | 6 s, from the shot |
| With keyboard lock-on | Uses movement direction as normal | The locked target sets the charge direction (aim at press) | The locked target is tracked while charging |
| Keys | `abilities.dash.*` | `abilities.ramCharge.*` | `abilities.railShot.*` |

### 8.2 Dash

- **GR-8.1** On start, direction = normalized move input, or the aim direction if move input is zero. For 6 ticks (`durationS` 0.2 s) the player moves at `distanceM / durationS` = 30 m/s in that direction, using sub-steps and wall sliding (GR-4.7, GR-4.8). Input movement is ignored. Aim follows input.
- **GR-8.2** The dash ends after 6 ticks, or early on stun, knockback or death. Cooldown: `abilityReadyTick[runner] = endTick + 150` (5 s). An interrupted dash still starts the cooldown.

### 8.3 Ram Charge

- **GR-8.3 Windup.** On start, `chargeDir` = aim direction (locked). For 5 ticks (`windupS` 0.15 s) the Beast is rooted and cannot aim. The sim emits `abilityStart` at the press so clients show the crouch.
- **GR-8.4 Charge.** For up to 24 ticks (`maxDurationS` 0.8 s) the Beast moves along `chargeDir` at 12 m/s (`speedMps`) in sub-steps. It does not slide along walls.
- **GR-8.5 Enemy contact.** After each sub-step, find living, non-protected enemies whose circle overlaps the Beast's circle (radius 1.0). If any: take the one with the smallest center distance (ties: lower seat). It takes `25 × matchupMul × armorMul` (`damage`), with incoming direction = reverse of `chargeDir` for the armor check. If it survives, it is knocked back `knockbackM × knockbackMult` (4 m for a Runner, 2 m for a Beast, 0 for a Turret) along `chargeDir` over 6 ticks (GR-9.2). The charge ends at that sub-step.
- **GR-8.6 Protected players** are passed through: no damage, no stop.
- **GR-8.7 Wall contact.** If a sub-step would make the Beast overlap a wall, place it at contact, end the charge, and stun the Beast for 12 ticks (`wallStunS` 0.4 s).
- **GR-8.8 Cover contact.** If a sub-step would make the Beast overlap intact destructible cover, the cover is destroyed (GR-14), the charge ends at contact, and there is no stun.
- **GR-8.9 Two Beasts.** If two charging Beasts touch in the same sub-step, both take the hit from each other (each applies its damage and knockback to the other) and both charges end. A Beast is immune to knockback only while morphing.
- **GR-8.10 End.** The charge ends at contact, after 24 ticks, or early on stun, knockback or death. Cooldown: `abilityReadyTick[beast] = endTick + 210` (7 s).

### 8.4 Rail Shot

- **GR-8.11 Charge.** On start, emit `abilityStart` with the start and release ticks. For 18 ticks (`chargeS` 0.6 s) the Turret charges. It can still turn (GR-4.13) and the line follows its current aim. It cannot fire the Rail Repeater or morph.
- **GR-8.12 Release.** On the release tick, build a segment from the Turret's center along its current `aim`, 18 m long (`rangeM`). Truncate it at the first wall or intact cover it crosses. Every living, non-protected enemy whose circle comes within `radius + widthM / 2` (0.2 m) of the segment takes `45 × matchupMul × armorMul` (`damage`) once, with incoming direction = reverse of the line direction. The line passes through players. Emit `abilityHit` per target and one `railShotFired` event with the segment.
- **GR-8.13 Cancel.** Stun, knockback or death during the charge cancels it. A cancelled charge sets `abilityReadyTick[turret] = tick + 60` (`cancelCooldownS` 2 s).
- **GR-8.14 Cooldown** after a shot: `abilityReadyTick[turret] = releaseTick + 180` (6 s).
- **GR-8.15 Server only.** The release is resolved with server positions at the release tick. Clients show the result from the server event. The visible 0.6 s telegraph is what makes this fair without lag compensation.

---

## 9. Status effects

Only these exist in the prototype.

- **GR-9.1 Stun.** No movement, aiming, firing, abilities or morphing until `stunEndTick`. A stun ends any ability in progress. After a stun ends, the player is immune to new stuns for 60 ticks (`status.ccImmunityS` 2 s). In the prototype the only stun is the Ram Charge wall stun.
- **GR-9.2 Knockback.** Sets `knockback = { vel: dir × distance / 0.2 s, endTick: tick + 6 }` (`abilities.ramCharge.knockbackDurationS`). While active, input movement is ignored and the player moves at `knockback.vel` with sub-steps and wall sliding (it stops in any axis that hits a wall). It ends Dash and cancels Rail Shot charge. It does not block firing or aiming. A new knockback replaces the old one. A distance of 0 (Turret) creates no knockback. Players who are morphing or spawn-protected ignore knockback.
- **GR-9.3 Spawn protection.** For 60 ticks (`match.spawnProtectionS` 2 s) after a respawn, or from the first PLAYING tick after a match-start spawn, the player takes no damage, ignores knockback and stun, and shows a bubble. It ends early the tick the player fires or uses an ability. Morphing does not end it. Protected players can collect shards and count in the Surge Zone.

---

## 10. Flux and shards

### 10.1 Flux

- **GR-10.1 Range.** `0 ≤ flux ≤ flux.max` (100). Any gain above 100 is lost (D-021).
- **GR-10.2 Regeneration.** During PLAYING, every living player gains `flux.regenPerS / 30` per tick (1 per second).
- **GR-10.3 Rewards.** The killer gains `flux.ko` (20) on a KO if alive. Each assister (GR-11.2) gains `flux.assist` (10) if alive. A dead killer or assister gets nothing (the KO and assist still count).
- **GR-10.4 Spending.** Only morphing spends Flux (GR-5.2, D-006).

### 10.2 Shard clusters

- **GR-10.5 Clusters.** The map has 10 shard points (`docs/MAP_SPEC.md` §6). `shards.activeClusters` (3) are active at a time. At match start, 3 distinct points are chosen with the match RNG. A cluster is 1 large shard (15 Flux, `flux.largeShard`) at the point and 4 small shards (5 Flux each, `flux.smallShard`) at offsets (±1.5, 0) and (0, ±1.5) m (`shards.clusterOffsetM`).
- **GR-10.6 Respawn.** When the last shard of a cluster is collected at tick `t`: at `t + 150` (`shards.respawnDelayS` 5 s) a new point is chosen with the match RNG from points that are not active, not announced, and not the point just emptied. It is announced (marker visible to all, event `clusterAnnounce`) for 90 ticks (`shards.announceS` 3 s), then its shards spawn.
- **GR-10.7 Pickup.** A shard is collected by a living player whose center is within `radius + shards.pickupExtraRadiusM` (0.5 m) of the shard. If several players qualify in the same tick, the closest takes it (ties: lower seat). Morphing and protected players can collect. Dead players cannot.

### 10.3 Death drop

- **GR-10.8 Amount.** On death, `drop = floor(flux × flux.deathDropFrac)` (40%).
- **GR-10.9 Shards.** The drop becomes `n = floor(drop / 5)` shards of 5, plus one shard of `drop - 5n` if that is above 0. They are placed on a ring of radius `shards.dropRingRadiusM` (1.2 m) around the death position at angles `a0 + 2πk / count`, where `a0` comes from the match RNG. A position inside a wall or cover moves toward the death position in 0.1 m steps until free. Dropped shards disappear after `shards.dropLifetimeS` (15 s, 450 ticks).
- **GR-10.10 Respawn Flux.** On respawn, `flux = max(flux.respawnFloor, fluxAtDeath - drop)` (floor 40).

---

## 11. Death, credit and respawn

- **GR-11.1 KO credit.** The player whose damage brought `hpFrac` to 0 or below gets the KO, even if they are dead (GR-7.8). There are no self-KOs and no environmental deaths in the prototype.
- **GR-11.2 Assists.** Every other player with an entry in the victim's `damageLog` within the last 150 ticks gets an assist.
- **GR-11.3 On death.** In order: mark dead; cancel morph, ability, knockback and stun; record KO, death and assists; apply Flux rewards (GR-10.3); create the Flux drop (GR-10.9); emit `death` with killer, assisters, the killer's form and weapon or ability, and the victim's form; set `respawnTick = tick + 90` (`match.respawnS` 3 s).
- **GR-11.4 Same-tick hits.** Hits are applied in processing order (GR-1.6, section 15). The first hit that kills gets the KO. Later hits in the same tick on that player are ignored. Two players can kill each other in the same tick; both KOs count.
- **GR-11.5 Spawn point choice.** Candidates are the 10 spawn points minus the two most recently used in this room. For each candidate, compute the distance to the nearest living other player. Choose the largest. Ties: lowest spawn index. If no other player is alive, choose with the match RNG. Record the chosen point as most recently used.
- **GR-11.6 Respawn state.** At `respawnTick` (if still PLAYING): Runner form, `hpFrac = 1`, Flux per GR-10.10, all ability cooldowns ready, all weapon timers 0, heat 0, no status effects, spawn protection for 60 ticks, `aim` pointing at the map center, `vel = 0`. Emit `respawn`.
- **GR-11.7 Death near match end.** If the match ends before `respawnTick`, the player spawns normally at the next COUNTDOWN.
- **GR-11.8 Death recap data.** The `death` event includes: killer id and name, killer form, cause (`pulsePistol`, `scatterCannon`, `railRepeater`, `ramCharge`, `railShot`), final hit damage, and `counterForm` = the form that beats the killer's form (Runner→Beast, Beast→Turret, Turret→Runner).

---

## 12. Scoring and results

- **GR-12.1 Frenzy.** Score = KOs. Most KOs wins.
- **GR-12.2 Zone Frenzy.** Score = points = 5 × KOs (`zoneFrenzy.koPoints`) + zone points (GR-13). Most points wins. Points are floats; the HUD shows `floor(points)`.
- **GR-12.3 Ranking.** Sort by score descending, then deaths ascending, then damage dealt descending, then seat index ascending. Bots are ranked like humans.
- **GR-12.4 Per-match stats** (for the results screen and telemetry): KOs, deaths, assists, points, zone points, damage dealt (by form), damage taken, shots fired and hits (by weapon and by `aimSource`), morphs (count, by target form), time alive by form (ticks), Flux collected from shards, Flux spent, abilities used and hits, time in zone alone and contested, longest life.
- **GR-12.5 Results screen** shows rank, name, bot icon, score, KOs, deaths, assists, damage, and (Zone Frenzy) zone points. The local player's row is highlighted.

---

## 13. Zone Frenzy and the Surge Zone

- **GR-13.1 Zone points.** The map has 5 zone points: Z-0 (center) and Z-1 to Z-4 (`docs/MAP_SPEC.md` §7).
- **GR-13.2 Schedule.** The zone is active at Z-0 from the first PLAYING tick. It moves every 45 s (`zoneFrenzy.moveEveryS`, 1350 ticks): at PLAYING ticks 1350, 2700 and 4050. So a match has 4 zone periods.
- **GR-13.3 Preview.** 10 s before each move (`zoneFrenzy.previewS`, 300 ticks), the next point is chosen with the match RNG from the 4 points other than the current one, announced (event `zoneAnnounce`), and shown as a preview ring on the map and minimap.
- **GR-13.4 Presence.** A living player is inside the zone if its center is within `zoneFrenzy.zoneRadiusM` (6 m) of the zone center. Morphing and protected players count.
- **GR-13.5 Scoring.** Each PLAYING tick: if exactly one player is inside, that player gains `zoneFrenzy.pointsPerS × formMult / 30` points, where `formMult` = `forms.<form>.zonePointsMult` (Runner 1, Beast 1, Turret 0.5) for the player's current form (old form while morphing). If two or more players are inside, the zone is contested and nobody scores. If nobody is inside, nobody scores.
- **GR-13.6 KO points.** Each KO adds `zoneFrenzy.koPoints` (5) points.
- **GR-13.7 Events.** Emit `zoneState` changes (empty, held by player id, contested) when they change, plus `zoneAnnounce` and `zoneMoved`.
- **GR-13.8 Frenzy has no zone.** In Frenzy the zone does not exist and zone points are not shown.

---

## 14. Destructible cover

- **GR-14.1** The map has 10 destructible cover boxes (`docs/MAP_SPEC.md` §5). While intact they block movement, projectiles and line of sight like walls.
- **GR-14.2 Destruction.** In the prototype only Ram Charge contact destroys cover (GR-8.8). Projectiles and Rail Shot stop at cover but do not damage it.
- **GR-14.3 Rebuild.** 900 ticks (`cover.rebuildS` 30 s) after destruction, the cover rebuilds if no player circle overlaps its box expanded by 0.1 m. Otherwise it checks again every tick until clear. Emit `coverDestroyed` and `coverRebuilt`.
- **GR-14.4 Match start** rebuilds all cover.

---

## 15. Tick order

Every tick runs these steps in this exact order. Steps skip dead players unless stated.

1. **Phase.** Advance phase timers. On a phase change, run its entry rules (GR-2).
2. **Inputs.** For each seat in order, take the input for this tick (`docs/NETWORK_PROTOCOL.md` §5.4). Apply aim (GR-4.12 to GR-4.15). Record fire held, move vector, and the morph and ability edges.
3. **Morph.** Complete morphs whose `endTick` is now (GR-5.4). Then start requested morphs (GR-5.2, GR-5.3).
4. **Ability start.** Start requested abilities (section 8).
5. **Ability update.** Advance Dash, Ram Charge (windup, charge, contacts) and Rail Shot (charge, release).
6. **Movement.** Integrate input movement or knockback with collision (GR-4.2 to GR-4.8).
7. **Weapons.** Update fire timers and heat. Fire where allowed. Spawn projectiles; apply the server spawn advance (GR-7.9).
8. **Projectiles.** Move all projectiles and resolve hits (GR-7.6). Damage applies immediately; a player reaching 0 becomes dead at once and skips the remaining steps.
9. **Deaths.** Finish death handling for players who died this tick (GR-11.3).
10. **Respawns.** Respawn players whose `respawnTick` is now (GR-11.6).
11. **Status timers.** End stuns, knockbacks and spawn protection whose end tick is now.
12. **Flux and shards.** Regeneration (GR-10.2), pickups (GR-10.7), dropped shard expiry, cluster respawn schedule (GR-10.6).
13. **Zone.** Zone Frenzy presence, scoring and schedule (section 13).
14. **Cover.** Rebuild checks (GR-14.3).
15. **Output.** Emit this tick's events in the order generated. Increment the tick.

---

## 16. Edge cases

| Case | Rule |
|---|---|
| Fire pressed on the same tick a morph is requested | Morph wins (step 3 runs before step 7); firing is then blocked by the morph |
| Morph and ability requested on the same tick | Morph is processed first; if it starts, the ability is blocked |
| Ability pressed during the last tick of a morph | The morph completes in step 3, so the new form's ability can start in step 4 |
| Player hit by a Ram while dashing | Dash ends, knockback applies (GR-9.2) |
| Turret hit by a Ram | Takes damage, no knockback (0%), Rail Shot charge is not cancelled because no knockback is applied |
| Beast charges into a protected player | Passes through (GR-8.6) |
| Projectile owner leaves the room | Projectiles in flight are removed; damage already dealt stays |
| Player disconnects | A proxy bot takes the seat (D-038, `docs/BOT_SPEC.md` §9); the player state continues unchanged |
| Shard spawns under a player | Collected on the next pickup step if in range |
| Zone moves onto a spot where a player stands | The player counts immediately on the next tick |
| Two players kill each other with the same tick's projectiles | Both die; both get a KO |
| All 8 seats are bots (no humans) | The room closes after the reconnection windows end (`docs/NETWORK_PROTOCOL.md` §9.6) |
| Flux exactly 35 when morphing to Beast | Allowed; Flux becomes 0 |
| Health display when `hpFrac × maxHp` is 0.0001 | Shows 1 (GR-6.8) |

---

## 17. Sim events

The sim returns a list of events every tick. The server forwards them to clients (`docs/NETWORK_PROTOCOL.md` §5.3) and to the match log (`docs/ARCHITECTURE.md` §9). Names are canonical.

`phase`, `spawn`, `respawn`, `death`, `morphStart`, `morphEnd`, `morphDenied`, `abilityStart`, `abilityEnd`, `abilityHit`, `railShotFired`, `projectileSpawn`, `projectileHit`, `projectileImpact`, `projectileExpire`, `blocked`, `damage`, `stun`, `knockback`, `overheat`, `shardSpawn`, `shardPickup`, `shardExpire`, `clusterAnnounce`, `coverDestroyed`, `coverRebuilt`, `zoneAnnounce`, `zoneMoved`, `zoneState`, `score`, `matchEnd`, `positionClamped`.
