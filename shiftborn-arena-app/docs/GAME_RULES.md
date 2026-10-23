# GAME_RULES.md

> **LLM FILE CONTRACT:** Authoritative prototype behavior and tick-order contract for `packages/sim`. Cite its `GR-x.y` ids in code and tests. Get every number from `BALANCE.md` and never fill a gap by guessing.

Precise prototype rules for forms, movement, combat, Flux, health, respawn, scoring and the objective. This is the gameplay contract for `packages/sim`.

- Every number here is a starting value that lives in `packages/shared/src/balance.ts`. The key is shown in `code` (see `docs/BALANCE.md`). Code must read the key, never hard-code the number.
- Rule IDs (`GR-x.y`) are cited by tests in `docs/ACCEPTANCE_TESTS.md` and tasks in `TASKS.md`.
- If a situation is not covered here, do not invent a rule. Add it to `OPEN_QUESTIONS.md`.
- Out of scope for the prototype (D-022): crates, characters, Ultimates, Overdrive, bounty, arena events, hazards, jump pads, grapple anchors. They do not exist in the prototype sim.
- The 2026-10-23 release request (D-073 to D-082) adds ten-minute matches, kill unlocks, random gun loot, ammunition and reloads, the dagger, tier 2 weapons, sprint and aim distance. `docs/CHANGE_CONTRACT.md` maps every change to its rules, tests and owners.

---

## 1. Conventions

- **GR-1.1 Units.** Distance in meters (m), time in seconds (s), speed in m/s, angles in radians inside the sim. `docs/BALANCE.md` stores degrees and seconds; `packages/shared` converts once at load (D-046).
- **GR-1.2 Coordinates.** x points east, y points north, origin at the map center. Angle 0 points east and angles grow counter-clockwise. Aim angles are normalized to [0, 2π).
- **GR-1.3 Tick.** The sim advances in fixed ticks at `tick.rateHz` = 30. `dt` = 1/30 s. Tick 0 is the first tick of a room.
- **GR-1.4 Timers.** Durations convert to whole ticks with `ticks = Math.round(seconds × 30)` (JavaScript rounding). All derived tick values are listed in `docs/BALANCE.md` §3. Exception: weapon fire intervals use a seconds accumulator (GR-7.2) so non-integer rates stay exact on average.
- **GR-1.5 Determinism.** Given the same seed, map and input stream, the sim produces bit-identical state on the same Node.js version. Randomness comes only from the match RNG (seeded per match). Loot placement draws from a second match stream, `world.lootRng`, seeded from the same room seed and match index with a fixed salt, so loot never shifts other match randomness (GR-19.2). No `Math.random()`, no `Date.now()`, no iteration over unordered collections without sorting by a stable id.
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
| PLAYING | 600 s (18000 ticks) | `match.durationS` | Normal play (D-073). |
| RESULTS | 15 s (450 ticks) | `match.resultsS` | No input is applied. Projectiles are removed at the start of RESULTS. The results screen shows. |

- **GR-2.3 Room start.** When a room is created it starts in COUNTDOWN with a new match id and match seed (GR-2.10).
- **GR-2.4 Match start (each COUNTDOWN).** Scores, KOs, deaths, assists, points, damage and per-match stats reset to 0. Every seated player spawns: seat order is matched to a seeded shuffle of the 10 spawn points. Every player starts as Runner, full health, Flux = `flux.start` (60), all cooldowns ready, Rail heat 0, no status effects, and the fresh loadout of GR-18.1: only Runner unlocked, the dagger and no guns. Spawn protection does not apply during COUNTDOWN; it is granted for 2 s from the first PLAYING tick (GR-11.6). The two most recently used spawn points are set to the last two assigned in this shuffle.
- **GR-2.5 Shards and zone at match start.** Three shard clusters spawn immediately (GR-10.5). In Zone Frenzy the Surge Zone activates at Z-0 at the first PLAYING tick (GR-13.2). Destructible cover is fully rebuilt at match start. Loot is cleared and placed again (GR-19.2).
- **GR-2.6 Late join.** A human may join during COUNTDOWN, RESULTS, or PLAYING while more than `match.lateJoinCutoffS` (60 s) remain. Joining during PLAYING spawns the player at once through the respawn rules (GR-11.5) with Flux `flux.start`, spawn protection and the fresh loadout of GR-18.1. Joining during RESULTS shows the results screen and the player plays the next match. Quick-play rooms are locked to matchmaking when 60 s or less remain (`docs/NETWORK_PROTOCOL.md` §3.3). Code rooms always accept joins; a player who joins with 60 s or less left waits on an overview camera until the next COUNTDOWN.
- **GR-2.7 Match end.** At the last PLAYING tick the match ends: all projectiles, charges and dashes stop, scores freeze, and the ranking is computed (GR-12.3). RESULTS begins on the next tick.
- **GR-2.7a Final tick.** The last PLAYING tick is the 18,000th. It runs every step of section 15, so inputs, shots, hits, deaths, KO credit, unlocks and pickups on that tick count. RESULTS begins at the start of the next tick, before inputs. Projectiles, including Arc Mortar shells in flight, are removed without effect. Morphs, abilities, reloads (without moving ammunition) and dagger strikes are cancelled, and loot can no longer be collected.
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
| `unlocked` | per form | Forms the player may morph into (GR-18.2) |
| `guns` | per gun | `owned`, `mag` and `reserve` for each of the six guns (GR-7.18) |
| `selectedTier` | per form | 0 none, 1 or 2: the gun this form uses (GR-7.15) |
| `gunTimers` | per gun | `nextShotIn` seconds for each gun |
| `reload` | null or `{ gun, endTick }` | Reload in progress (GR-7.19) |
| `swapReadyTick` | tick | Tick from which guns may fire after a swap or draw (GR-7.16) |
| `melee` | null or `{ startTick, strikeTick, endTick }` | Dagger strike in progress (GR-7.30) |
| `sprinting` | boolean | Sprint applied this tick (GR-4.16) |
| `aimDistM` | m | Aim distance from input (GR-4.18) |
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
| Guns, tier 1 / tier 2 (found as loot) | Pulse Pistol / Ricochet Disc | Scatter Cannon / Slug Cannon | Rail Repeater / Arc Mortar | GR-7, GR-19 |
| Dagger | yes | yes | yes | GR-7.30 |
| Ability | Dash | Ram Charge | Rail Shot | GR-8 |
| Zone points rate | 100% | 100% | 50% | `forms.<form>.zonePointsMult` |
| Camera zoom (client) | 1.0 | 0.9 | 1.3 | `forms.<form>.cameraZoom` |

- **GR-4.1** Every player is always exactly one form. While morphing, the player is still the old form for every stat (D-013, GR-5.3).

### 4.2 Movement

- **GR-4.2 Move input.** The input carries `moveX` and `moveY` as integers from -127 to 127. The sim divides by 127 and, if the vector is longer than 1, normalizes it. Keyboard input therefore gives 8 directions at full speed. The client builds this world vector from facing-relative keys (GR-4.19).
- **GR-4.3 Target velocity.** `target = moveDir × speed × mult`, where `speed` is the form speed and `mult` is 1, `morph.moveMult` (0.5) while morphing, or `sprint.speedMult` (1.3) while sprinting (GR-4.16).
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

### 4.5 Sprint, aim distance and facing-relative input

- **GR-4.16 Sprint.** A player sprints on a tick when all are true: the sprint button is held; movement input is not zero; the angle between the movement direction and `aim` is at most `sprint.maxForwardAngleDeg` (60°); the form is Runner or Beast; not morphing; no ability in progress; not stunned or knocked back; no dagger strike in progress; fire is not held. Sprint multiplies the target speed by `sprint.speedMult` (1.3): Runner 11.05 m/s, Beast 7.8 m/s. Acceleration, sub-steps and collision are unchanged (GR-4.4 to GR-4.8). There is no stamina. A Turret never moves.
- **GR-4.17 Sprint and other actions.** Holding fire suppresses sprint, so shooting always wins. Sprinting does not block reloading or swapping. Abilities, morphs and knockback replace it. `sprinting` records whether this tick applied it.
- **GR-4.18 Aim distance.** The input carries `aimDist` in tenths of a meter (0 to 255). When aim is applied (GR-4.12 to GR-4.14), the sim also sets `aimDistM = clamp(aimDist / 10, aimDistance.minM, aimDistance.maxM)` (2 to 24 m). Only the Arc Mortar uses it (GR-7.26).
- **GR-4.19 Facing-relative input (client).** W and S move forward and back along the frame's aim; A and D strafe (D-078). The client converts them to the world `moveX`, `moveY` of GR-4.2 with the shared `encodeFacingMove`, which limits the intent to length 1 before rotating and quantizing. The sim stays world-relative, so sprint (GR-4.16) is checked against the same aim.

---

## 5. Morphing

- **GR-5.1 Request.** Pressing the key for Runner (1), Beast (2) or Turret (3) sends a morph request bit (input edge). Requesting the current form does nothing. If two or more distinct target buttons gain rising edges in the same simulation tick, ignore those morph requests with no new morph event or Flux cost (D-064). A previously held button does not count as a new edge. Existing morphs, other inputs, timers and Flux regeneration continue.
- **GR-5.2 Allowed when all are true:** phase is PLAYING; the target form is unlocked (GR-18.2); alive; not already morphing; `tick ≥ morphReadyTick`; not stunned; not knocked back; no ability or dagger strike in progress; `flux ≥ cost(target)`. Denials are checked in this order: phase, locked, busy (dead or morphing), cooldown, busy (stunned, knocked back, ability or strike), Flux. Costs: Runner 0 (`morph.costRunner`), Beast 35 (`morph.costBeast`), Turret 35 (`morph.costTurret`). If any check fails, nothing happens and the sim emits `morphDenied` with the reason (`cooldown`, `flux`, `busy`, `phase` or `locked`; the HUD flashes the form button).
- **GR-5.3 Start.** Flux is reduced by the cost immediately. `morph = { target, endTick: tick + 15 }` (`morph.durationS` = 0.5 s). During the morph the player: keeps the old form's hitbox, max health, matchup class, armor and knockback stat; moves at 50% of the old form's speed (`morph.moveMult`; a Turret stays rooted); cannot fire, use an ability, start a dagger strike or request another morph; loses any active reload without moving ammunition (GR-7.20); is immune to knockback; takes damage normally; can collect shards and count for the Surge Zone (as the old form).
- **GR-5.4 End.** At `endTick` the form becomes `target` and uses that form's selected gun (GR-7.15). `hpFrac` is unchanged (D-012). If the new form is Turret, `vel` is set to 0. `morphReadyTick = endTick + 90` (`morph.cooldownS` = 3 s). Emit `morphEnd`.
- **GR-5.5 Death during a morph** cancels it. Flux is not refunded. The player respawns as Runner.
- **GR-5.6 No cancel.** A morph cannot be cancelled by the player.
- **GR-5.7 Cooldowns across forms.** Ability cooldowns of every form and fire timers of every gun keep counting down in every form (D-014).
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
              (including while morphing out of one) and the hit comes from its front arc, else 1
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

Guns are found as loot (GR-19) and used only in their own unlocked form (GR-18). Tier 2 is the higher-damage gun of each form (D-077); the benchmark is in `docs/BALANCE.md` §9.5.

| | Pulse Pistol (Runner, tier 1) | Ricochet Disc (Runner, tier 2) | Scatter Cannon (Beast, tier 1) | Slug Cannon (Beast, tier 2) | Rail Repeater (Turret, tier 1) | Arc Mortar (Turret, tier 2) |
|---|---|---|---|---|---|---|
| Damage per hit | 9 | 24; 30 after a bounce | 5 per pellet, 7 pellets | 50 | 16 | 75 at the blast center, 37.5 at the edge |
| Fire rate | 6 per s (every 0.1667 s) | 2.5 per s (every 0.4 s) | 1.25 per s (every 0.8 s) | 1 per s | 3.5 per s (every 0.2857 s) | 0.85 per s (every 1.1765 s) |
| Projectile speed | 45 m/s | 32 m/s | 35 m/s | 55 m/s | 70 m/s | 1.0 s flight to the landing point |
| Range | 14 m | 20 m path, 1 bounce | 9 m | 12 m | 18 m | landing 8 to 20 m from the Turret |
| Projectile radius | 0.15 m | 0.20 m | 0.10 m | 0.20 m | 0.12 m | blast radius 2.5 m |
| Distance rule | none | none | full damage to 4 m, linear down to 50% at 9 m | none | 50% damage if the hit happens within the first 4 m traveled | linear 100% to 50% from blast center to edge |
| Magazine / reload | 20 / 1.5 s | 8 / 2.0 s | 8 / 2.0 s | 4 / 2.5 s | 30 / 2.0 s | 3 / 3.0 s |
| Ammo per pickup / reserve cap | 80 / 120 | 24 / 32 | 24 / 32 | 12 / 16 | 60 / 90 | 9 / 12 |
| Special | | bounces off walls and cover (GR-7.22) | fixed pattern, no randomness (D-020) | | heat: 7 s of firing overheats for 2 s | indirect fire over walls; blast blocked by walls (GR-7.26 to GR-7.29) |
| Keys | `weapons.pulsePistol.*` | `weapons.ricochetDisc.*` | `weapons.scatterCannon.*` | `weapons.slugCannon.*` | `weapons.railRepeater.*` | `weapons.arcMortar.*` |

The dagger (every form): 25 damage, 0.1 s windup, 0.5 s recovery, 0.8 m reach beyond the body, 0.7 m wide, no ammunition (`weapons.dagger.*`, GR-7.30 to GR-7.32).

### 7.2 Firing

- **GR-7.1 Hold to fire.** While the fire bit is held, the weapon fires whenever it is ready. There is no separate click-to-fire mode in the sim.
- **GR-7.2 Fire timer.** Each gun has `nextShotIn` (seconds). Every tick, for every gun: `nextShotIn = max(nextShotIn - dt, -dt)`. When the selected gun of the current form may fire (GR-7.3) and fire is held and `nextShotIn ≤ 0`: fire one attack, use one round of its magazine (GR-7.18), then `nextShotIn += 1 / ratePerS`. When fire is not held, `nextShotIn = max(nextShotIn, 0)` so shots cannot be banked.
- **GR-7.3 Firing is blocked** while dead, morphing, stunned, during COUNTDOWN or RESULTS, during Dash, during Ram Charge windup or charge, during Rail Shot charge, while the selected gun is an overheated Rail Repeater, while the current form has no selected gun, while its magazine is empty, while a reload is in progress, before `swapReadyTick`, and during a dagger strike. Knockback does not block firing.
- **GR-7.4 Firing ends spawn protection** (GR-9.3) on the tick the first shot is fired or a dagger strike starts.

### 7.3 Projectiles

- **GR-7.5 Spawn.** A projectile spawns at `pos + aimDir × (formRadius + weapons.muzzleExtraM)` (0.1 m) moving along `aimDir` at its speed. If the spawn point is inside a wall or intact cover, the projectile is destroyed at once with an impact event and no damage. The Arc Mortar has no muzzle check; it follows GR-7.26 to GR-7.29.
- **GR-7.6 Movement and hits.** Each tick a projectile moves `speed × dt`, capped so total travel never exceeds its range. The swept segment is tested against walls and intact cover (boxes inflated by the projectile radius) and against every living player except its owner (circles of player radius + projectile radius). The earliest contact along the segment wins. If a wall and a player tie, the wall wins. On a player hit: damage per GR-6, then the projectile is destroyed. On a wall hit: the projectile is destroyed with an impact event. When travel reaches the range: destroyed with an expire event. The Ricochet Disc's first wall contact is a bounce (GR-7.22); the Arc Mortar never collides in flight (GR-7.27).
- **GR-7.7 Protected targets.** A projectile that touches a spawn-protected player is destroyed with no damage (the bubble absorbs it) and emits a `blocked` event.
- **GR-7.8 Owner death.** Projectiles keep flying after their owner dies. Their damage and KO still credit the owner.
- **GR-7.9 Server spawn advance.** On the server only, a newly fired projectile from a human is immediately advanced by `A` extra steps in the same tick, with full collision checks, where `A = min(round(oneWayLatencyMs / 33.33), 3)` (`weapons.spawnAdvanceMaxMs` = 100 ms). `oneWayLatencyMs` is half the player's smoothed RTT. Bots use `A = 0`. Arc Mortar shells are never advanced. This keeps shots feeling responsive without full lag compensation (`docs/NETWORK_PROTOCOL.md` §8).

### 7.4 Scatter Cannon pattern and falloff

- **GR-7.10 Pattern.** Each shot fires 7 pellets at fixed angle offsets from `aim`: -12°, -8°, -4°, 0°, +4°, +8°, +12° (`weapons.scatterCannon.pelletOffsetsDeg`). All pellets spawn on the same tick.
- **GR-7.11 Falloff.** With `d` = distance the pellet traveled when it hits: `distanceMul = 1` if `d ≤ 4`, else `1 - 0.5 × (d - 4) / (9 - 4)`. At 9 m the multiplier is 0.5. Pellets expire at 9 m.
- **GR-7.12 Several pellets** can hit the same target in the same tick; each applies damage separately.

### 7.5 Rail Repeater arm distance and heat

- **GR-7.13 Arm distance.** If the bolt hits after traveling less than 4 m (`armDistanceM`), `distanceMul = 0.5` (`closeDamageMult`).
- **GR-7.14 Heat.** Every tick: if the player is a Turret whose selected gun is the Rail Repeater, fire is held, and firing is not blocked (GR-7.3), `heat += dt`; otherwise `heat = max(0, heat - heatCoolPerS × dt)` (2 per s). When `heat ≥ heatMaxS` (7 s): the weapon overheats for `overheatS` (2 s, 60 ticks); then `heat = 0`. Heat and the overheat timer keep running in other forms and while the Arc Mortar is selected. Rail Shot and the Arc Mortar are not affected by heat.

### 7.6 Selection, swap and dagger fallback

- **GR-7.15 Selection.** `selectedTier[form]` is 0 when the player owns no gun for that form; otherwise it names an owned gun of that form. Picking up a form's first gun selects it. Morph completion uses the new form's selection (GR-5.4). Guns of other forms stay stored with their exact ammunition and timers.
- **GR-7.16 Swap.** On the swap rising edge (Q or mouse wheel), when the current form owns both guns and the player is alive in PLAYING, not morphing and not stunned: the selection flips, an active reload is cancelled (GR-7.20) and `swapReadyTick = tick + weapons.swapS` (0.4 s, 12 ticks). Picking up the current form's first gun applies the same draw delay. Otherwise the swap edge does nothing.
- **GR-7.17 Dagger fallback.** While fire is held and the current form has no usable gun (none selected, or the selected gun has an empty magazine and an empty reserve), fire starts dagger strikes (GR-7.30). A gun with an empty magazine and a reserve reloads instead (GR-7.19).

### 7.7 Magazines and reloads

- **GR-7.18 Ammunition.** Each owned gun has `mag` (0 to `magazine`) and `reserve` (0 to `reserveMax`) rounds. One firing action uses one round; a Scatter shell fires all 7 pellets. Counts change only by firing, reloading and loot (GR-19.4).
- **GR-7.19 Reload start.** A reload of the selected gun starts on the reload rising edge (R), or automatically on any weapons step on which its magazine is 0, when all are true: phase is PLAYING; alive; `mag < magazine`; `reserve > 0`; no reload in progress; not morphing; not stunned; no ability or dagger strike in progress; `tick ≥ swapReadyTick`. Overheat does not block it. It sets `reload = { gun, endTick: tick + reloadTicks }` and emits `reloadStart`.
- **GR-7.20 Reload end.** At `endTick`, first in that player's weapons step: `moved = min(magazine − mag, reserve)`, `mag += moved`, `reserve −= moved`, and `reloadEnd` is emitted as completed. A morph start, ability start, swap, dagger strike, stun, death or the end of PLAYING cancels it: no ammunition moves and `reloadEnd` is emitted as cancelled. Knockback and sprint do not cancel it. Stored guns never reload.

### 7.8 Ricochet Disc

- **GR-7.21 Disc.** The Ricochet Disc fires one projectile with no distance rule.
- **GR-7.22 Bounce.** When a disc's swept segment first touches a wall or intact cover box (inflated by its radius) and it has bounced fewer than `maxBounces` (1) times, it reflects instead of being destroyed. The contact face belongs to the slab of the inflated box entered last along the segment; the direction component normal to that face is negated. A corner contact, where both slabs are entered at the same `t`, negates both components. The disc continues from the contact point with the remaining distance of the tick, testing contacts again, and emits `projectileBounce`. Its next wall contact destroys it with `projectileImpact`. The total path, including travel after the bounce, is capped at its range (20 m).
- **GR-7.23 Bounce damage.** A hit after at least one bounce deals `damage × bounceDamageMult` (24 × 1.25 = 30). The front-arc check uses the disc's current travel direction. Discs never hit their owner, before or after a bounce.

### 7.9 Slug Cannon

- **GR-7.24 Slug.** The Slug Cannon fires one projectile with no distance rule and no special behavior.
- **GR-7.25 Tier designation.** Each form's guns are tier 1 and tier 2 in every document, event and UI label. Tier 2 must stay the higher-damage gun under the `docs/BALANCE.md` §9.5 benchmark (D-077); a balance change that breaks the benchmark needs a new decision.

### 7.10 Arc Mortar

- **GR-7.26 Landing point.** On firing, `L = clamp(aimDistM, minRangeM, maxRangeM)` (8 to 20 m) and the landing point is `pos + aimDir × L`, clamped to the playable area. If it is inside a wall or intact cover box, it moves toward the Turret along the aim line in `landingNudgeStepM` (0.1 m) steps until it is outside every box.
- **GR-7.27 Flight.** The shell is a projectile with no collision while it flies over walls, cover and players. It lands exactly `flightS` (1.0 s, 30 ticks) after the firing tick and is never advanced (GR-7.9). `projectileSpawn` carries the landing tick and point, so every client shows the landing point for the whole flight.
- **GR-7.28 Blast.** On the landing tick, in the projectiles step, emit `mortarBlast`, then for each living player other than the owner in seat order: `e = max(0, distance(center, landing) − radius)`. If `e ≤ blastRadiusM` (2.5 m) and the segment from the landing point to the player's center crosses no wall or intact cover, the player takes `damage × (1 − (1 − edgeDamageMult) × e / blastRadiusM)` (75 at the center, 37.5 at the edge) through GR-6.2. The incoming direction (GR-6.4) points from the player toward the landing point, the reverse of the blast's travel; when they coincide it is the reverse of the shell's flight direction. A spawn-protected player emits `blocked` instead. The shell is then removed.
- **GR-7.29 Indirect fire.** The flight is never blocked; walls and intact cover block only the blast. The blast never damages its owner or cover.

### 7.11 Dagger

- **GR-7.30 Start.** A dagger strike starts on the dagger rising edge (V), or by fire under GR-7.17, when all are true: phase is PLAYING; alive; not morphing; not stunned; no ability in progress; no strike in progress. Every form can use it. It sets `melee = { startTick: tick, strikeTick: tick + windupTicks (3), endTick: strikeTick + recoveryTicks (15) }`, cancels an active reload (GR-7.20), ends spawn protection (GR-9.3) and emits `meleeStart`.
- **GR-7.31 Strike.** At `strikeTick`, after every firing decision of that weapons step: build a segment from the player's center along its current `aim`, `radiusM + reachM` long (Runner 1.4 m), truncated at the first wall or intact cover. Candidates are living enemies whose center is not behind the attacker's center (non-negative projection on `aim`) and whose circle comes within `widthM / 2` (0.35 m) of the segment, and whose nearest point to the segment is in line of sight from the attacker's center (GR-4.11), so the strike's width never reaches through a wall. The target is the candidate whose closest point on the segment is nearest the start; ties go to the smaller center distance, then the lower seat. It takes `damage` (25) through GR-6.2, with incoming direction opposite to `aim`. A spawn-protected target takes nothing. Emit one `meleeStrike` with the result; the target is -1 on a miss.
- **GR-7.32 Recovery.** Until `endTick` the player cannot fire a gun, start another strike, start an ability, start a reload or morph. Movement continues without sprint. Stun or death cancels a strike; a strike cancelled before `strikeTick` deals nothing.

---

## 8. Abilities

One ability per form, triggered by the ability input edge (key E). Holding E does not repeat. An ability can start only when: phase is PLAYING; alive; not morphing; not stunned; not knocked back; no other ability or dagger strike in progress; the current form's `abilityReadyTick ≤ tick`. Using an ability ends spawn protection and cancels an active reload (GR-7.20).

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

- **GR-9.1 Stun.** No movement, aiming, firing, abilities or morphing until `stunEndTick`. A stun ends any ability in progress and cancels any reload or dagger strike. After a stun ends, the player is immune to new stuns for 60 ticks (`status.ccImmunityS` 2 s). In the prototype the only stun is the Ram Charge wall stun.
- **GR-9.2 Knockback.** Sets `knockback = { vel: dir × distance / 0.2 s, endTick: tick + 6 }` (`abilities.ramCharge.knockbackDurationS`). While active, input movement is ignored and the player moves at `knockback.vel` with sub-steps and wall sliding (it stops in any axis that hits a wall). It ends Dash and cancels Rail Shot charge. It does not block firing or aiming. A new knockback replaces the old one. A distance of 0 (Turret) creates no knockback. Players who are morphing or spawn-protected ignore knockback.
- **GR-9.3 Spawn protection.** For 60 ticks (`match.spawnProtectionS` 2 s) after a respawn, or from the first PLAYING tick after a match-start spawn, the player takes no damage, ignores knockback and stun, and shows a bubble. It ends early the tick the player fires, starts a dagger strike or uses an ability. Morphing does not end it. Protected players can collect shards and count in the Surge Zone.

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
- **GR-11.3 On death.** In order: mark dead; cancel morph, ability, knockback, stun, dagger strike and reload (without moving ammunition), keeping unlocks, guns and ammunition (GR-18.4); record KO, death and assists; apply Flux rewards (GR-10.3); create the Flux drop (GR-10.9); emit `death` with killer, assisters, the killer's form and weapon or ability, and the victim's form; set `respawnTick = tick + 90` (`match.respawnS` 3 s).
- **GR-11.4 Same-tick hits.** Hits are applied in processing order (GR-1.6, section 15). The first hit that kills gets the KO. Later hits in the same tick on that player are ignored. Two players can kill each other in the same tick; both KOs count.
- **GR-11.5 Spawn point choice.** Candidates are the 10 spawn points minus the two most recently used in this room. For each candidate, compute the distance to the nearest living other player. Choose the largest. Ties: lowest spawn index. If no other player is alive, choose with the match RNG. Record the chosen point as most recently used.
- **GR-11.6 Respawn state.** At `respawnTick` (if still PLAYING): Runner form, `hpFrac = 1`, Flux per GR-10.10, all ability cooldowns ready, all gun timers 0, heat 0, no reload or dagger strike, guns ready (`swapReadyTick = tick`), unlocks, progress, owned guns, selections and every gun's magazine and reserve exactly as at death (D-076), no status effects, spawn protection for 60 ticks, `aim` pointing at the map center, `vel = 0`. Emit `respawn`.
- **GR-11.7 Death near match end.** If the match ends before `respawnTick`, the player spawns normally at the next COUNTDOWN.
- **GR-11.8 Death recap data.** The `death` event includes: killer id and name, killer form, cause (`pulsePistol`, `ricochetDisc`, `scatterCannon`, `slugCannon`, `railRepeater`, `arcMortar`, `dagger`, `ramCharge`, `railShot`), final hit damage, and `counterForm` = the form that beats the killer's form (Runner→Beast, Beast→Turret, Turret→Runner).

---

## 12. Scoring and results

- **GR-12.1 Frenzy.** Score = KOs. Most KOs wins.
- **GR-12.2 Zone Frenzy.** Score = points = 5 × KOs (`zoneFrenzy.koPoints`) + zone points (GR-13). Most points wins. Points are floats; the HUD shows `floor(points)`.
- **GR-12.3 Ranking.** Sort by score descending, then deaths ascending, then damage dealt descending, then seat index ascending. Bots are ranked like humans.
- **GR-12.4 Per-match stats** (for the results screen and telemetry): KOs, deaths, assists, points, zone points, damage dealt (by form), damage taken, shots fired and hits (by weapon and by `aimSource`), morphs (count, by target form), time alive by form (ticks), Flux collected from shards, Flux spent, abilities used and hits, time in zone alone and contested, longest life, guns and ammunition collected, reloads completed, and the PLAYING tick of the first gun pickup and of each unlock.
- **GR-12.5 Results screen** shows rank, name, bot icon, score, KOs, deaths, assists, damage, and (Zone Frenzy) zone points. The local player's row is highlighted.

---

## 13. Zone Frenzy and the Surge Zone

- **GR-13.1 Zone points.** The map has 5 zone points: Z-0 (center) and Z-1 to Z-4 (`docs/MAP_SPEC.md` §7).
- **GR-13.2 Schedule.** The zone is active at Z-0 from the first PLAYING tick. It moves every 45 s (`zoneFrenzy.moveEveryS`, 1350 ticks): at every PLAYING tick that is a positive multiple of 1350 before the match ends. In a 600 s match that is ticks 1350, 2700, ... 17550, so a match has 14 zone periods.
- **GR-13.3 Preview.** 10 s before each move (`zoneFrenzy.previewS`, 300 ticks), the next point is chosen with the match RNG from the 4 points other than the current one, announced (event `zoneAnnounce`), and shown as a preview ring on the map and minimap.
- **GR-13.4 Presence.** A living player is inside the zone if its center is within `zoneFrenzy.zoneRadiusM` (6 m) of the zone center. Morphing and protected players count.
- **GR-13.5 Scoring.** Each PLAYING tick: if exactly one player is inside, that player gains `zoneFrenzy.pointsPerS × formMult / 30` points, where `formMult` = `forms.<form>.zonePointsMult` (Runner 1, Beast 1, Turret 0.5) for the player's current form (old form while morphing). If two or more players are inside, the zone is contested and nobody scores. If nobody is inside, nobody scores.
- **GR-13.6 KO points.** Each KO adds `zoneFrenzy.koPoints` (5) points.
- **GR-13.7 Events.** Emit `zoneState` changes (empty, held by player id, contested) when they change, plus `zoneAnnounce` and `zoneMoved`.
- **GR-13.8 Frenzy has no zone.** In Frenzy the zone does not exist and zone points are not shown.

---

## 14. Destructible cover

- **GR-14.1** The map has 10 destructible cover boxes (`docs/MAP_SPEC.md` §5). While intact they block movement, projectiles and line of sight like walls.
- **GR-14.2 Destruction.** In the prototype only Ram Charge contact destroys cover (GR-8.8). Projectiles and Rail Shot stop at cover but do not damage it. The Arc Mortar flies over cover and its blast does not damage it.
- **GR-14.3 Rebuild.** 900 ticks (`cover.rebuildS` 30 s) after destruction, the cover rebuilds if no player circle overlaps its box expanded by 0.1 m. Otherwise it checks again every tick until clear. Emit `coverDestroyed` and `coverRebuilt`.
- **GR-14.4 Match start** rebuilds all cover.

---

## 15. Tick order

Every tick runs these steps in this exact order. Steps skip dead players unless stated.

1. **Phase.** Advance phase timers. On a phase change, run its entry rules (GR-2).
2. **Inputs.** For each seat in order, take the input for this tick (`docs/NETWORK_PROTOCOL.md` §5.4). Apply aim and aim distance (GR-4.12 to GR-4.15, GR-4.18). Record fire and sprint held, move vector, and the morph, ability, reload, swap and dagger edges.
3. **Morph.** Complete morphs whose `endTick` is now (GR-5.4). Then start requested morphs (GR-5.2, GR-5.3).
4. **Ability start.** Start requested abilities (section 8).
5. **Ability update.** Advance Dash, Ram Charge (windup, charge, contacts) and Rail Shot (charge, release).
6. **Movement.** Decide sprint (GR-4.16), then integrate input movement or knockback with collision (GR-4.2 to GR-4.8).
7. **Weapons.** For each seat in order: complete a due reload (GR-7.20); apply the swap edge (GR-7.16); start a dagger strike (GR-7.30); start a requested reload (GR-7.19); update gun timers and heat; fire where allowed and use ammunition; start an automatic reload (GR-7.19). Then spawn projectiles with the server spawn advance (GR-7.9), then resolve due dagger strikes in seat order (GR-7.31).
8. **Projectiles.** Move all projectiles and resolve hits (GR-7.6), bounces (GR-7.22) and mortar landings (GR-7.28). Damage applies immediately; a player reaching 0 becomes dead at once and skips the remaining steps.
9. **Deaths.** Finish death handling for players who died this tick (GR-11.3), including KO credit and unlocks (GR-18.2).
10. **Respawns.** Respawn players whose `respawnTick` is now (GR-11.6).
11. **Status timers.** End stuns, knockbacks and spawn protection whose end tick is now.
12. **Flux, shards and loot.** Regeneration (GR-10.2), pickups (GR-10.7), dropped shard expiry, cluster respawn schedule (GR-10.6), then loot pickups (GR-19.4) and loot replenishment (GR-19.5).
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
| A reload's `endTick` is the tick the player dies | The reload completes in step 7 before the step 8 hit, so the moved ammunition stays (GR-7.20) |
| Fire held with an empty magazine and an empty reserve | Dagger strikes instead (GR-7.17) |
| Two players reach the same loot item in one tick | Smaller center distance wins, then lower seat; the other gets nothing (GR-19.4) |
| A gun for a locked form is picked up | Stored; usable after the unlock and a morph to that form (GR-18.3) |
| A KO on the last PLAYING tick | Counts, with any unlock; RESULTS begins on the next tick (GR-2.7a) |
| An Arc Mortar shell is in flight when PLAYING ends | Removed without a blast (GR-2.7a) |
| A bounced disc crosses its owner | Passes through; owners are never hit (GR-7.23) |
| Swap, reload and fire edges on one tick | Swap first, then the dagger, then the reload; firing is then blocked by the swap or reload (step 7) |

---

## 17. Sim events

The sim returns a list of events every tick. The server forwards them to clients (`docs/NETWORK_PROTOCOL.md` §5.3) and to the match log (`docs/ARCHITECTURE.md` §9). Names are canonical.

`phase`, `spawn`, `respawn`, `death`, `morphStart`, `morphEnd`, `morphDenied`, `abilityStart`, `abilityEnd`, `abilityHit`, `railShotFired`, `projectileSpawn`, `projectileHit`, `projectileImpact`, `projectileExpire`, `projectileBounce`, `mortarBlast`, `blocked`, `damage`, `stun`, `knockback`, `overheat`, `reloadStart`, `reloadEnd`, `weaponSwap`, `meleeStart`, `meleeStrike`, `formUnlocked`, `lootSpawn`, `lootPickup`, `shardSpawn`, `shardPickup`, `shardExpire`, `clusterAnnounce`, `coverDestroyed`, `coverRebuilt`, `zoneAnnounce`, `zoneMoved`, `zoneState`, `score`, `matchEnd`, `positionClamped`.

---

## 18. Loadout, progression and retained gear

- **GR-18.1 Fresh loadout.** At every match start, and for every fresh entrant (late join, or a human taking a bot's seat), a player has only Runner unlocked, progress 0, no guns (`owned` false and `mag` and `reserve` 0 for all six), every selection 0, and the dagger (D-074).
- **GR-18.2 Unlocks.** Progress is the player's credited KOs this match (`stats.kos`, GR-11.1). When step 9 credits a KO and progress reaches `progression.beastUnlockKos` (3), Beast unlocks; at `progression.turretUnlockKos` (6), Turret unlocks. Each unlock happens once and emits `formUnlocked`. Assists, points, damage, zone points and client reports never count. A dead killer still unlocks. An unlock never morphs the player and never grants a gun.
- **GR-18.3 Locked forms.** A morph request to a locked form is denied with reason `locked` (GR-5.2). Guns for a locked form can be collected and are stored until that form is unlocked and active.
- **GR-18.4 Retained gear.** Death, respawn and reconnection keep unlocks, progress, owned guns, selections and every gun's `mag` and `reserve` exactly (D-076). The respawn form stays Runner (GR-11.6).
- **GR-18.5 Seats.** A reconnecting human and a proxy-controlled seat keep the seat's full state. A bot continuing a departed human's seat continues that state (`docs/BOT_SPEC.md` §9.1). A human taking a bot's seat starts with GR-18.1. Nothing carries into the next match.
- **GR-18.6 Bots.** Bots obey every rule here and in GR-19. They start with no guns or unlocks and get no information a human in the same seat would not have.

---

## 19. Loot

- **GR-19.1 Items.** A loot item is one gun lying at a point. The map holds `loot.tier1PerGun` (3) items of each tier 1 gun and `loot.tier2PerGun` (2) of each tier 2 gun: 15 items. Items exist in every phase but can be collected only during PLAYING.
- **GR-19.2 Placement.** Candidates are the centers of a `loot.candidateGridM` (1 m) grid inside the playable area whose distance to every wall and every cover box (intact or not) is at least `loot.minClearanceM` (1.5 m). They are computed once per map and cover every walkable area, including enclosed rooms. At match start every item and pending replenishment is cleared, and the 15 items are placed in gun order (`GUN_IDS`), each gun's items in sequence. For each placement, draw up to `loot.placementAttempts` (24) candidates with `world.lootRng` and accept the first whose distance is at least `loot.minSpacingM` (6 m) to every other item, at least `loot.minSpawnPointDistM` (4 m) to every spawn point and at least `loot.minPlayerDistM` (3 m) to every living player. If none passes, use the draw with the largest margin, where the margin is the smallest of the three distances minus its limit; ties go to the earliest draw. There are no fixed loot places: every match and every replenishment draws again (D-075).
- **GR-19.3 Range.** A living player can collect an item during PLAYING when its center is within `radiusM + loot.pickupExtraRadiusM` (0.5 m) of the item and the segment between them crosses no wall or intact cover. Morphing and spawn-protected players can collect.
- **GR-19.4 Claims.** In step 12, items are processed in ascending id. A player in range is eligible when they do not own that gun, or their reserve for it is below `reserveMax`. The eligible player with the smallest center distance takes the item; ties go to the lower seat. A new gun gets `mag = min(magazine, ammoPerPickup)` and `reserve = min(reserveMax, ammoPerPickup − mag)`, and becomes its form's selection if that form had none, with the GR-7.16 draw delay when it is the current form. An owned gun gets `reserve = min(reserveMax, reserve + ammoPerPickup)`. The item is removed in the same step, so it is never taken twice. Emit `lootPickup`. An item no one can accept stays on the floor.
- **GR-19.5 Replenishment.** When an item is taken at tick `t`, a new item of the same gun is placed at `t + loot.respawnS` (20 s, 600 ticks) using GR-19.2. Due replenishments run in order of due tick, then the taken item's id. Emit `lootSpawn` for every placement, including those at match start.
- **GR-19.6 Authority.** Only the sim places, assigns and removes loot. No input field claims an item, so no client position, inventory or message can grant one.
