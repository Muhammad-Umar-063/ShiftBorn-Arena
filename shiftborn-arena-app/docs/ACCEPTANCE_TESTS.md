# ACCEPTANCE_TESTS.md

> **LLM FILE CONTRACT:** Observable pass or fail outcomes. Read only the AT ids listed by the active task. This file tests requirements but does not create gameplay rules or balance values.

Observable pass or fail checks for every prototype feature and for the complete prototype. A task in `TASKS.md` is done only when its listed acceptance tests pass.

Related: `docs/GAME_RULES.md` (GR ids), `DECISIONS.md` (D ids), `docs/PROTOTYPE_SCOPE.md`, `docs/PLAYTEST_PLAN.md`.

---

## 1. How to use this file

- **Ids:** `AT-<AREA>-<NN>`. Automated tests include the id in the test name, for example `it('AT-MORPH-03 health fraction is kept', ...)`.
- **Types:**
  - `UNIT`: Vitest unit test of a function.
  - `SIM`: Vitest scenario test that drives `packages/sim` with scripted inputs over many ticks, without network.
  - `SERVER`: Vitest with Colyseus test helpers, real room, scripted clients.
  - `E2E`: Playwright in Chromium against a local build.
  - `TOOL`: a repository script (`pnpm map:validate`, `pnpm loadtest`, and so on).
  - `MANUAL`: a person follows the steps on a local or deployed build and records the result in the task completion report.
  - `PLAYTEST`: measured in playtests and reported in the prototype report.
- **Numbers:** expected values come from `docs/BALANCE.md` proto-1. If balance changes, update the expected values in the same task.
- **Tolerances:** positions ±0.01 m in SIM tests unless stated; timings exact in ticks.
- Every SIM test sets up its world with the test helper `makeTestWorld({ seed, mode, players })` on `greybox_v1` or on the empty test map `test_open` (a 64 x 64 m box with outer walls only, defined in the sim test fixtures).

---

## 2. Repository and tooling

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-REPO-01 | TOOL | `pnpm setup` on a clean clone | Installs the frozen workspace dependencies and Playwright Chromium with the pinned Node.js and pnpm versions (D-060) |
| AT-REPO-02 | TOOL | `pnpm lint`, `pnpm typecheck`, `pnpm test` | All pass with zero warnings treated as errors |
| AT-REPO-03 | TOOL | Dependency rules (ARCHITECTURE §3.1) | Importing `apps/*` from `packages/sim` fails lint; importing `three` from `packages/sim` fails lint |
| AT-REPO-04 | TOOL | Sim purity lint | `Math.random`, `Date.now`, `performance.now`, `setTimeout`, `document`, `window` in `packages/sim/src` fail lint |
| AT-REPO-05 | TOOL | `pnpm dev` | Server on 2567 and client on 5173 start; opening the client shows the landing screen |
| AT-REPO-06 | TOOL | CI workflow | A push to `main` runs setup, lint, typecheck, unit, sim, server, determinism (short), build, size check, map validation and E2E smoke |
| AT-REPO-07 | TOOL | `pnpm check:size` | Gzipped client build under 5 MB; the script fails if a test asset pushes it over |
| AT-REPO-08 | UNIT | No hard-coded gameplay numbers | A grep-based test fails if numeric literals from a denylist (35, 8.5, 140, 110, 0.75, 1.25) appear in `packages/sim/src` outside `derived.ts` usage |
| AT-REPO-09 | TOOL | Canonical agent instructions | `AGENTS.md` exists and is non-empty; `CLAUDE.md` contains the literal `AGENTS.md`, is under 1 KiB and is not byte-identical to `AGENTS.md` |

## 3. Shared config and determinism

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-DET-01 | UNIT | `derived.ts` conversions | 0.5 s → 15 ticks; 0.15 s → 5; 0.4 s → 12; 0.6 s → 18; 3 s → 90; 45 s → 1350; 120°/s → 4°/tick in radians |
| AT-DET-02 | UNIT | `balanceHash` | Stable across runs; changes when any value changes |
| AT-DET-03 | UNIT | RNG | `sfc32` with the same seed yields the same 1,000 values; `shuffle` is a permutation |
| AT-DET-04 | SIM | Same seed twice | Two 8-bot matches of 5400 ticks with the same seed give identical `hashWorld` at every 300th tick |
| AT-DET-05 | SIM | Different seed | Final hashes differ |
| AT-DET-06 | TOOL | `pnpm replay` | Replaying a logged match from its input log reproduces the logged final hash |
| AT-DET-07 | SIM | Property invariants over 20 seeded bot matches | Always: `0 ≤ hpFrac ≤ 1`, `0 ≤ flux ≤ 100`, players inside the playable area, no NaN in any numeric field |

## 4. Map

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-MAP-01 | TOOL | `pnpm map:validate` on `greybox_v1` | Rules V1 to V9 pass (MAP_SPEC §10) and numbers match MAP_SPEC §10.2 |
| AT-MAP-02 | UNIT | Map data matches the spec | Wall, cover and point counts: 38 walls, 10 cover, 10 spawns, 10 shard points, 5 zone points, 6 crate points; ids unique |
| AT-MAP-03 | UNIT | Collision index | Circle-vs-box queries through the grid return the same result as brute force for 10,000 random circles |
| AT-MAP-04 | MANUAL | Render | The greybox shows every wall and cover box at the right place (compare with the ASCII render, MAP_SPEC §11) |

## 5. Movement and collision

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-MOV-01 | SIM | GR-4.4 acceleration | Runner from rest with full move input: speed 2, 4, 6, 8, 8.5 m/s on ticks 1 to 5 |
| AT-MOV-02 | SIM | GR-4.2 diagonal | Input (127, 127) moves at 8.5 m/s, not 12 |
| AT-MOV-03 | SIM | GR-4.3 Beast speed | Steady speed 6.0 m/s |
| AT-MOV-04 | SIM | GR-4.5 Turret rooted | Move input does not change position; `vel` is 0 |
| AT-MOV-05 | SIM | GR-4.8 wall slide | Runner moving diagonally into a vertical wall keeps the parallel velocity component and never overlaps the wall |
| AT-MOV-06 | SIM | GR-4.7 no tunneling | Dash and knockback straight into a 1 m wall never end on the far side (1,000 seeded angles and positions) |
| AT-MOV-07 | SIM | GR-4.9 no player collision | Two players walking into each other pass through |
| AT-MOV-08 | SIM | GR-4.10 bounds | No player ever leaves the playable area in AT-DET-07 runs |

## 6. Forms and aim

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-FORM-01 | UNIT | Form stats | Max HP 80/140/110, radius 0.6/1.0/0.9, speeds 8.5/6/0 from balance |
| AT-FORM-02 | SIM | GR-4.12 instant aim | Runner and Beast aim equals input aim the same tick |
| AT-FORM-03 | SIM | GR-4.13 Turret turn cap | Input aim 180° away: the Turret's aim changes by exactly 4° per tick (45 ticks to turn around) |
| AT-FORM-04 | SIM | GR-4.14 aim frozen | Aim does not change while stunned or during Ram Charge |

## 7. Morphing

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-MORPH-01 | SIM | GR-5.2, GR-5.3 cost | Runner with 60 Flux morphs to Beast: Flux 25 at the start tick; form Beast after exactly 15 ticks |
| AT-MORPH-02 | SIM | Return to Runner is free | Beast with 0 Flux morphs to Runner successfully; Flux unchanged |
| AT-MORPH-03 | SIM | D-012 fraction kept | Runner at 40/80 becomes Beast at 70/140 (`hpFrac` 0.5 exactly) |
| AT-MORPH-04 | SIM | D-012 no gain from cycling | Runner at `hpFrac` 0.0125 morphs Runner→Beast→Runner 10 times (dev Flux): `hpFrac` is still exactly 0.0125; HUD value 1 as Runner and 2 as Beast |
| AT-MORPH-05 | SIM | GR-5.4 cooldown | A second morph request 89 ticks after the first morph ends is denied (`cooldown`); at 90 ticks it starts |
| AT-MORPH-06 | SIM | GR-5.2 Flux check | Morph to Turret with 34.9 Flux is denied (`flux`); with 35 it starts and Flux becomes 0 |
| AT-MORPH-07 | SIM | GR-5.3 old form during morph | During a Runner→Beast morph: radius 0.6, max HP 80, speed 4.25 m/s, cannot fire, ability input ignored, knockback ignored |
| AT-MORPH-08 | SIM | GR-5.3 Turret stays rooted | Turret→Runner morph: speed 0 during the 15 ticks, then Runner speed |
| AT-MORPH-09 | SIM | GR-5.5 death during morph | Killed mid-morph: no refund, respawns as Runner |
| AT-MORPH-10 | SIM | GR-5.1 same form | Requesting the current form does nothing and emits no event |
| AT-MORPH-11 | SIM | GR-5.2 phase | Morph requests during COUNTDOWN and RESULTS are denied (`phase`) |
| AT-MORPH-12 | SIM | D-014 cooldowns keep running | Dash used as Runner, morph to Beast and back within 5 s: Dash is ready exactly 150 ticks after the dash ended, not reset |

## 8. Health and damage

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-DMG-01 | UNIT | GR-6.2 pipeline | Table-driven: every attacker/defender form pair applies the matchup table exactly (GR-6.5) |
| AT-DMG-02 | UNIT | GR-6.4 front arc | Turret aiming east: a hit traveling west (from the east) takes 0.75×; traveling north (from the south, 90°) takes 1.0×; boundary at exactly 60° is armored |
| AT-DMG-03 | UNIT | GR-6.6 tags | Runner→Turret front: tags EFFECTIVE and ARMOR; Runner→Beast: RESISTED |
| AT-DMG-04 | UNIT | GR-6.8 display | `hpFrac` 0.0001 as Runner displays 1; damage 0.3 displays as 1; 31.25 displays as 31 |
| AT-DMG-05 | SIM | GR-6.7 death threshold | A hit that leaves `hpFrac` at 1e-12 kills |
| AT-DMG-06 | SIM | GR-6.9 protection | Projectiles hitting a protected player are destroyed with a `blocked` event and no damage |
| AT-DMG-07 | SIM | GR-6.10 no healing | `hpFrac` never increases during a life over 20 bot matches |

## 9. Weapons

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-WPN-01 | SIM | GR-7.2 Pulse Pistol rate | Holding fire for 300 ticks fires 60 shots (±1) |
| AT-WPN-02 | SIM | Rail Repeater rate | Holding fire for 120 ticks (4 s) as a Turret fires 14 or 15 shots (3.5 per s average) |
| AT-WPN-03 | SIM | GR-7.2 no banking | Releasing fire for 2 s and pressing again: the next shot fires at once, and the following one exactly one interval later |
| AT-WPN-04 | SIM | GR-7.6 range | A Pulse Pistol shot in open space expires after traveling 14 m (±0.01) |
| AT-WPN-05 | SIM | GR-7.6 walls | A shot fired at a wall 3 m away emits `projectileImpact` at the wall face |
| AT-WPN-06 | SIM | GR-7.5 spawn inside wall | Firing while touching a wall, aiming into it: projectile destroyed at spawn, no damage |
| AT-WPN-07 | SIM | GR-7.10 pattern | A Scatter shot creates 7 pellets at exactly -12, -8, -4, 0, 4, 8, 12 degrees from aim |
| AT-WPN-08 | SIM | GR-7.11 falloff | Single pellet hits at 3 m, 6.5 m and 9 m (minus radius) deal 5, 3.75 and 2.5 before matchup |
| AT-WPN-09 | SIM | GR-7.13 arm distance | Rail bolt hit after 3 m travel deals 8; after 5 m deals 16 (neutral matchup) |
| AT-WPN-10 | SIM | GR-7.14 heat | Continuous Turret fire overheats at tick 210 (7 s); no shot for the next 60 ticks; heat resets to 0 |
| AT-WPN-11 | SIM | Heat cooling | After 3 s of firing then release, heat falls at 2 per s and reaches 0 after 1.5 s |
| AT-WPN-12 | SIM | GR-7.3 blocked states | No shots during morph, stun, Dash, Ram windup and charge, Rail Shot charge, COUNTDOWN, RESULTS |
| AT-WPN-13 | SIM | GR-7.8 owner death | A projectile in flight when its owner dies still damages and credits the owner with the KO |
| AT-WPN-14 | SIM | GR-7.9 spawn advance | With 100 ms one-way latency, a server projectile is created 3 ticks advanced (spawn position + 3 steps), and collisions along those steps are checked |
| AT-WPN-15 | SIM | Time to kill table (BALANCE §9.2) | Pistol vs standing Runner at 8 m: dies on the 9th hit; Scatter within 4 m vs Runner: dies on the 2nd shot; Rail Repeater beyond 4 m vs Beast: dies on the 7th hit |

## 10. Abilities

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-ABL-01 | SIM | GR-8.1 Dash | In open space: moves exactly 6 m over 6 ticks along the move input; along aim if move input is zero |
| AT-ABL-02 | SIM | GR-8.2 Dash cooldown | Next Dash allowed exactly 150 ticks after it ended |
| AT-ABL-03 | SIM | Dash into a wall | Stops and slides along the wall; does not pass through; cooldown still applies |
| AT-ABL-04 | SIM | Dash through players | Passes through an enemy without contact effects |
| AT-ABL-05 | SIM | GR-8.3 Ram windup | 5 ticks rooted; direction locked to aim at the press even if aim input changes |
| AT-ABL-06 | SIM | GR-8.4 Ram range | In open space, a charge that hits nothing travels 9.6 m (±0.01) in 24 ticks |
| AT-ABL-07 | SIM | GR-8.5 Ram hit | Ram into a Runner: 31.25 damage, Runner knocked back 4 m (±0.05) along the charge direction over 6 ticks; charge ends at contact |
| AT-ABL-08 | SIM | Ram vs Beast and Turret | Beast target: 25 damage, 2 m knockback. Turret target hit in its front arc: 18.75 damage, no knockback |
| AT-ABL-09 | SIM | GR-8.7 wall stun | Ram into a wall: Beast stops at contact, `stun` for exactly 12 ticks |
| AT-ABL-10 | SIM | GR-8.8 cover | Ram into intact cover: `coverDestroyed`, no stun, charge ends |
| AT-ABL-11 | SIM | GR-8.6 protected | Ram passes through a spawn-protected enemy |
| AT-ABL-12 | SIM | GR-8.9 two Beasts | Two Beasts ramming head-on: both take 25 and 2 m knockback, both charges end |
| AT-ABL-13 | SIM | GR-8.10 Ram cooldown | Next Ram allowed exactly 210 ticks after the charge ended |
| AT-ABL-14 | SIM | GR-8.11 Rail Shot charge | 18 ticks; the Turret keeps turning at 4° per tick and the release uses the aim at release |
| AT-ABL-15 | SIM | GR-8.12 Rail Shot pierce | Two enemies on the line, 5 m and 10 m away: both take 45 (Beast 56.25); the line stops at a wall at 12 m and an enemy at 14 m behind the wall takes nothing |
| AT-ABL-16 | SIM | Rail Shot width | An enemy whose edge is 0.19 m from the line is hit; at 0.21 m it is not (Runner radius 0.6: centers at 0.79 m and 0.81 m) |
| AT-ABL-17 | SIM | GR-8.13 cancel | Stunning a charging Turret cancels the shot; ability ready again after 60 ticks |
| AT-ABL-18 | SIM | GR-8.14 cooldown | Next Rail Shot allowed exactly 180 ticks after release |
| AT-ABL-19 | SIM | Ability ends protection | Using any ability during spawn protection ends it that tick |
| AT-ABL-20 | SIM | Ability blocked states | No ability starts while morphing, stunned, knocked back, during another ability, or outside PLAYING |

## 11. Status effects

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-STS-01 | SIM | GR-9.1 stun | Stunned player: no movement, aim, fire, ability or morph; ends on the exact tick |
| AT-STS-02 | SIM | CC immunity | A second stun within 60 ticks after the first ends is ignored |
| AT-STS-03 | SIM | GR-9.2 knockback | Input movement ignored during the 6 ticks; firing still allowed; stops at walls |
| AT-STS-04 | SIM | Knockback interrupts | A Ram hit ends a Runner's Dash in progress. A Turret takes 0% knockback, so a Ram hit does not cancel its Rail Shot charge (it only takes damage) |
| AT-STS-05 | SIM | GR-9.3 protection | 60 ticks after respawn; ends early on fire or ability; not ended by morphing; protected players collect shards and count in the zone |

## 12. Flux and shards

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-FLUX-01 | SIM | GR-10.2 regen | 30 PLAYING ticks add exactly 1.0 Flux; no regen in COUNTDOWN, RESULTS or while dead |
| AT-FLUX-02 | SIM | GR-10.1 cap | Picking up a large shard at 95 Flux gives 100; the shard is consumed (D-021) |
| AT-FLUX-03 | SIM | GR-10.3 rewards | KO gives the living killer +20, each living assister +10; a dead killer gets nothing but the KO counts |
| AT-FLUX-04 | SIM | GR-10.5 clusters | Match start: exactly 3 clusters at 3 distinct points; each has 1 large (15) and 4 small (5) shards at the specified offsets |
| AT-FLUX-05 | SIM | GR-10.6 respawn | After a cluster is emptied: `clusterAnnounce` 150 ticks later at a different inactive point; shards appear 90 ticks after that |
| AT-FLUX-06 | SIM | GR-10.7 pickup | Pickup radius = player radius + 0.5 m; when two players are in range the closer one gets it; dead players never pick up |
| AT-FLUX-07 | SIM | GR-10.8, GR-10.9 drop | Death at 63.7 Flux: 5 shards of 5 in a 1.2 m ring; respawn Flux 40. Death at 90: 7 shards of 5 and 1 of 1; respawn Flux 54 |
| AT-FLUX-08 | SIM | Drop inside walls | Dying against a wall: no dropped shard is inside a wall or cover box |
| AT-FLUX-09 | SIM | Drop expiry | Dropped shards disappear after exactly 450 ticks |
| AT-FLUX-10 | SIM | GR-10.4 spending | Flux only decreases on morph start (scan all events in AT-DET-07 runs) |

## 13. Death and respawn

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-DEATH-01 | SIM | GR-11.1 KO credit | The player whose hit crosses 0 gets the KO |
| AT-DEATH-02 | SIM | GR-11.2 assists | Damage 4.9 s before the KO counts as an assist; 5.1 s does not |
| AT-DEATH-03 | SIM | GR-11.4 same tick | Two players killing each other in one tick both die and both get a KO; a third hit that tick on a dead player is ignored |
| AT-DEATH-04 | SIM | GR-11.3 respawn delay | Respawn exactly 90 ticks after death |
| AT-DEATH-05 | SIM | GR-11.5 spawn choice | With a scripted enemy layout, the chosen spawn is the one farthest from its nearest enemy, excluding the last two used |
| AT-DEATH-06 | SIM | GR-11.6 respawn state | Runner, `hpFrac` 1, cooldowns ready, heat 0, protection 60 ticks, aim toward the map center |
| AT-DEATH-07 | SIM | GR-11.7 match end | Dying in the last 2 s: no respawn in RESULTS; normal spawn at the next COUNTDOWN |
| AT-DEATH-08 | SIM | GR-11.8 recap data | The death event carries killer, killer form, cause, final damage, and the correct counter form (Runner→Beast, Beast→Turret, Turret→Runner) |

## 14. Match flow and scoring

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-MATCH-01 | SIM | GR-2.2 phases | COUNTDOWN 90, PLAYING 5400, RESULTS 450 ticks, then a new COUNTDOWN with a new match id |
| AT-MATCH-02 | SIM | GR-2.4 reset | At COUNTDOWN all scores and stats are 0, everyone is a Runner with 60 Flux at distinct spawn points |
| AT-MATCH-03 | SIM | COUNTDOWN rules | Players can move and aim; firing, abilities and morphs do nothing; no regen |
| AT-MATCH-04 | SIM | GR-2.7 match end | All projectiles removed at RESULTS; no input applied during RESULTS |
| AT-MATCH-05 | UNIT | GR-12.3 ranking | Ties broken by fewer deaths, then more damage, then lower seat |
| AT-MATCH-06 | SIM | GR-12.4 stats | Stats match an independent recount from the event stream for 5 bot matches |
| AT-MATCH-07 | SERVER | GR-2.6 late join | Joining with 61 s left spawns at once; quick play with 59 s left creates or finds another room; a code room with 59 s left shows the waiting overlay and joins the next match |
| AT-MATCH-08 | SERVER | GR-2.9 host settings | Host changes mode and bot difficulty; they apply at the next COUNTDOWN; a non-host's request is dropped |
| AT-MATCH-09 | SIM | GR-14 cover reset | All cover is intact at each COUNTDOWN |

## 15. Zone Frenzy

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-ZONE-01 | SIM | GR-13.2 schedule | Zone active at Z-0 from PLAYING tick 0; moves at 1350, 2700, 4050 |
| AT-ZONE-02 | SIM | GR-13.3 preview | `zoneAnnounce` 300 ticks before each move; the next point is never the current one |
| AT-ZONE-03 | SIM | GR-13.5 scoring | One Runner alone for 30 ticks: +1.0 points; one Turret alone: +0.5; two players inside: no points; a dead player does not count |
| AT-ZONE-04 | SIM | GR-13.4 boundary | Center at 5.99 m counts; at 6.01 m does not |
| AT-ZONE-05 | SIM | GR-13.6 KO points | A KO adds 5 points |
| AT-ZONE-06 | SIM | Morphing counts as old form | A Runner morphing to Turret inside the zone scores at 1.0 until the morph ends, then 0.5 |
| AT-ZONE-07 | SIM | GR-13.8 Frenzy | No zone and no zone points exist in Frenzy |
| AT-ZONE-08 | SIM | Bot zone play (BOT_SPEC §5) | In a Zone Frenzy bot match, the zone is held (not empty and not contested) at least 25% of PLAYING ticks |

## 16. Network

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-NET-01 | UNIT | Input encoding | Encode then decode round-trips every field; out-of-range frames are rejected (§5.2) |
| AT-NET-02 | SERVER | Redundancy | With every second input packet dropped, the server still applies every frame exactly once in order |
| AT-NET-03 | SERVER | Catch-up (§5.4) | A burst of 6 buffered frames is consumed 2 per tick with edges merged |
| AT-NET-04 | SERVER | Rate limit | 60 frames per second: only 40 per second applied; the rest counted as dropped |
| AT-NET-05 | SERVER | Protocol mismatch | Join with a different `protocolVersion` is rejected with 4000 |
| AT-NET-06 | E2E | Prediction responsiveness | With `?lag=150`, a key press moves the local player on the next rendered frame |
| AT-NET-07 | E2E | Corrections (H11) | Scripted 60 s of walking, dashing and morphing at `?lag=150`: fewer than 1 correction over 0.5 m per minute |
| AT-NET-08 | E2E | Interpolation | Remote players move smoothly (no visible stepping) at 20 Hz patches; recorded frame-to-frame position deltas have no jumps over 0.6 m except respawns |
| AT-NET-09 | E2E | Own shots | A local shot appears on the same frame as the click; it links to the server projectile without jumping |
| AT-NET-10 | SERVER | Seat replacement (D-038) | A human joining a full bot room replaces a bot within the same tick; the removed bot is the out-of-combat lowest scorer; no death event is emitted |
| AT-NET-11 | SERVER | Reconnect (§9.3) | Dropping the socket: the seat becomes `proxy`; reconnecting within 30 s restores `human` with the same stats; after 30 s the seat becomes a normal bot |
| AT-NET-12 | E2E | Hidden tab (§9.4) | Hiding the tab switches the seat to proxy within 1 tick of the `vis` message; showing it returns control |
| AT-NET-13 | SERVER | AFK (§9.4) | No meaningful input: `afkWarn` at 30 s, proxy at 45 s, any input returns control |
| AT-NET-14 | SERVER | Code rooms | Two clients with the same code land in the same room; an invalid code is rejected with 4002 |
| AT-NET-15 | SERVER | Locking | A quick-play room locks at 60 s remaining and unlocks at RESULTS |
| AT-NET-16 | SERVER | Disposal | A room with no humans and no pending reconnections disposes |
| AT-NET-17 | MANUAL | Netsim loss | `?lag=150&loss=2`: the game stays playable; no state decode errors in the console |
| AT-NET-18 | TOOL | Bandwidth | In a full room, average downstream under 10 KB/s and upstream under 4 KB/s per client |
| AT-NET-19 | SERVER | Clock sync | Client server-tick estimate stays within 2 ticks of the true tick with 150 ms ± 20 ms jitter |

## 17. Bots

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-BOT-01 | UNIT | Paths | A path exists from every spawn point to every shard and zone point at radius 0.6 and 1.0; smoothed paths never cross a box |
| AT-BOT-02 | SIM | Bot match | 8 Normal bots, 180 s: every bot deals damage; at least 10 KOs and 8 morphs in total; no bot stuck over 5 s |
| AT-BOT-03 | UNIT | Morph policy | Each row of BOT_SPEC §7 produces the wanted form with `counterFormChance` 1.0 |
| AT-BOT-04 | UNIT | Fire discipline | No shot when the aim error is above tolerance, out of range, or without line of sight; never at protected players |
| AT-BOT-05 | UNIT | Perception | A bot never targets an enemy behind a wall that it has not seen in the last 2 s |
| AT-BOT-06 | SIM | Difficulty spread | Over 10 matches, Hard bots out-score Easy bots on average when mixed 4 and 4 |
| AT-BOT-07 | SIM | Proxy | A proxy seat keeps the human's name and stats and returns control the tick the human returns |
| AT-BOT-08 | TOOL | Bot cost | Bot logic under 1 ms per room tick average with 8 bots |
| AT-BOT-09 | MANUAL | Dummy mode | `/dummies on` makes bots strafe at 10 m without firing; `/dummies off` restores normal play |

## 18. Controls and lock-on

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-CTRL-01 | UNIT | Bindings | Every action in CONTROLS_UI §2.1 and §2.2 maps to the right key; reserved keys produce no action |
| AT-CTRL-02 | UNIT | Latching | A press and release within one tick yields one frame with the button held |
| AT-CTRL-03 | UNIT | Mouse aim | Cursor ground point to aim angle is correct for 8 test points; within 0.75 m the previous aim is kept |
| AT-CTRL-04 | UNIT | Keyboard aim | Up + Right targets 45°; aim rotates at 720°/s; release keeps the aim |
| AT-CTRL-05 | UNIT | Lock acquire | Picks the smallest angle within ±30° in range and sight; falls back to the nearest valid enemy; nothing valid gives no lock |
| AT-CTRL-06 | UNIT | Lock tracking and lead | Aim point = position + velocity × travel time × 0.5 at 100% assist; 0 lead at 0% |
| AT-CTRL-07 | UNIT | Lock override, cycle, release, break | Arrow key releases; tap Q cycles clockwise; hold Q 0.5 s releases; 0.5 s out of sight or range breaks; mouse movement releases |
| AT-CTRL-08 | UNIT | Scheme detection | Mouse move over 3 px sets `mouse`; arrow sets `keys`; lock sets `lock`; glyphs switch |
| AT-CTRL-09 | E2E | Browser rules | Space, arrows and Tab do not scroll the page; right-click shows no menu; blur releases held keys |
| AT-CTRL-10 | MANUAL | Keyboard only | A tester completes a full match, every menu and the settings using only the keyboard |
| AT-CTRL-11 | UNIT | Fire toggle | In Toggle mode one press starts firing, the next stops |

## 19. HUD, screens and audio

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-UI-01 | E2E | Landing | Name field prefilled; Play joins; Enter triggers Play; `?room=CODE` shows the join view |
| AT-UI-02 | E2E | HUD elements | Health, Flux with notches, form buttons with costs, ability cooldown, timer, score, kill feed, minimap all render during PLAYING |
| AT-UI-03 | MANUAL | Form buttons | Greyed below cost or during cooldown; shake and toast on denial with the right reason text |
| AT-UI-04 | MANUAL | Damage numbers | EFFECTIVE, RESISTED and ARMOR show the right label or icon on a scripted hit set |
| AT-UI-05 | MANUAL | Death recap | Shows killer, form, cause, damage and the right counter form; respawn countdown |
| AT-UI-06 | MANUAL | Threat arrows | An off-screen attacker shows a red arrow; standing in an enemy Rail Shot line shows the pulsing RAIL arrow |
| AT-UI-07 | MANUAL | Minimap | Shows walls, you, on-screen enemies, every deployed Turret (also off-screen), zone and clusters; hides off-screen non-Turret enemies |
| AT-UI-08 | E2E | Results | Ranking matches the server ranking; local row highlighted; next match starts after 15 s |
| AT-UI-09 | MANUAL | Survey prompt | Appears once after the third completed match of a session, with the tester code |
| AT-UI-10 | E2E | Settings persistence | A changed setting survives reload; with storage blocked the game still runs on defaults |
| AT-UI-11 | MANUAL | Readability at 821 x 462 | All HUD text legible (12 px minimum); nothing overlaps |
| AT-UI-12 | MANUAL | Sounds | Every sound in CONTROLS_UI §9 plays on its event; audio unlocks on first input; muted when the tab is hidden |
| AT-UI-13 | MANUAL | Camera | Zoom per form; lead toward aim; walls in front of players fade; no rotation |
| AT-UI-14 | MANUAL | Controls card | Shown in the first COUNTDOWN of a session; does not state which form beats which |

## 20. Performance, load and soak

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-PERF-01 | TOOL | Server tick time | 8 bots per room: average under 4 ms, p99 under 8 ms |
| AT-PERF-02 | TOOL | Soak (B13) | `pnpm loadtest` with 20 bot-only rooms for 2 hours: no crash, no room error, server memory growth under 10% after the first 10 minutes, tick time within AT-PERF-01 |
| AT-PERF-03 | MANUAL | Client frame rate | 60 FPS in a full room on a mid-range laptop with integrated graphics (debug overlay) |
| AT-PERF-04 | MANUAL | Client budgets | Under 100 draw calls and 100,000 triangles; JS heap under 200 MB after 30 minutes |
| AT-PERF-05 | MANUAL | Chromebook (if available) | At least 30 FPS on a 4 GB RAM Chromebook |

## 21. Telemetry, deployment and security

| Id | Type | Check | Pass when |
|---|---|---|---|
| AT-TEL-01 | SERVER | Match log | Every match writes a JSONL file with `match_start`, all listed event types and `match_end` (ARCHITECTURE §9.2) |
| AT-TEL-02 | SERVER | Input log | Every match writes a gzipped input log that `pnpm replay` reproduces |
| AT-TEL-03 | TOOL | `pnpm analyze` | Produces the metrics report with every H1 to H14 metric that telemetry covers, from a folder of logs; bots excluded |
| AT-TEL-04 | SERVER | Client stats | `clientStats` every 30 s lands in the match log |
| AT-TEL-05 | SERVER | Sessions | Consecutive matches per session counted correctly across a reconnect |
| AT-DEP-01 | MANUAL | Deployment | `https://<playtest-host>` serves the client over HTTPS; the game connects over WSS |
| AT-DEP-02 | MANUAL | Health | `/healthz` returns build id, uptime, room count and tick time |
| AT-DEP-03 | MANUAL | Rollback | Deploying the previous image tag restores the previous build |
| AT-DEP-04 | MANUAL | Cheats off | Dev commands are rejected on the playtest deployment |
| AT-SEC-01 | SERVER | Invalid input | Malformed messages are dropped; 50 in 10 s closes with 4003 |
| AT-SEC-02 | SERVER | Names | Invalid names are replaced by generated names; names over 16 characters are rejected |
| AT-SEC-03 | SERVER | Host only | `hostSettings` from a non-host and `devCmd` without cheats are dropped |

---

## 22. Full prototype checklist (end to end, deployed build)

Run on the playtest deployment with at least 4 humans (bots fill the rest) before playtest round R1, and again before the Approval Gate. Record results in the prototype report.

| Id | Check | Pass when |
|---|---|---|
| AT-E2E-01 | Open the link, enter a name, press Play | In a match within 10 s (median click to gameplay) |
| AT-E2E-02 | Play a full Frenzy match | Countdown, 3 minutes, results, next match starts in the same room |
| AT-E2E-03 | Morph to all three forms in one life | Costs, timings and HUD match the rules |
| AT-E2E-04 | Use all three abilities | Dash, Ram Charge (hit, wall stun, cover break) and Rail Shot (telegraph, pierce) behave as specified |
| AT-E2E-05 | Win a fight using a counter form | EFFECTIVE hits appear; the death recap names the right counter |
| AT-E2E-06 | Collect shards and die with Flux | Drop and respawn Flux follow the rules |
| AT-E2E-07 | Zone Frenzy via host settings | Zone schedule, preview, contest and Turret half rate work; points ranking correct |
| AT-E2E-08 | Keyboard only | A full match with lock-on, cycling and override |
| AT-E2E-09 | Code room with 4 humans | All in the same room; host settings apply next match; late joiner handled |
| AT-E2E-10 | Hide the tab for 20 s, then return | A proxy bot played; control returns; no desync |
| AT-E2E-11 | Kill the network for 10 s, then restore | Reconnects into the same seat with the same stats |
| AT-E2E-12 | Play with `?lag=150&loss=2` | Playable; corrections under 1 per minute |
| AT-E2E-13 | Three matches in one session | Survey prompt with the tester code appears |
| AT-E2E-14 | Logs | Match logs for every match; `pnpm analyze` runs on them |
| AT-E2E-15 | 30 minutes continuous play | No crash, no memory growth, frame rate steady |

## 23. Gates

- **Fun Gate (T-100):** `docs/PROTOTYPE_SCOPE.md` §5.1 with the metrics from `pnpm analyze` and facilitator notes (`docs/PLAYTEST_PLAN.md` §3.1).
- **Approval Gate (T-150):** `docs/PROTOTYPE_SCOPE.md` §5 and §8; every hypothesis H1 to H14 reported with value, threshold, pass or fail, and sample size.
