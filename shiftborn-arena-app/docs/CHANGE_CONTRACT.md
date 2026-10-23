# CHANGE_CONTRACT.md

> **LLM FILE CONTRACT:** One shared contract for the 2026-10-23 release request. It maps each change to its canonical rule, number, interface, test and owner. Rules live in `GAME_RULES.md`, numbers in `BALANCE.md`, wire formats in `NETWORK_PROTOCOL.md`, decisions in `DECISIONS.md`. Do not copy them here; link them. Update the stage table and the handoff log when work lands.

- **Writer lock:** one agent writes a shared file at a time. Current writer of shared docs: **Codex** (takeover 2026-10-23). Codex takes the lock by adding a handoff row in §13 before editing shared docs, and returns it the same way.
- **Owners:** Claude owns gameplay rules, math, physics, the authoritative sim, networking, prediction, bots, backend and operations. Codex owns client presentation, art, audio, UI, camera, platform adapter and client wiring of the shared input models.
- **Decisions:** D-073 to D-082. **Open:** OQ-023 (map roster), OQ-024 (lead-engineer defaults for owner review), OQ-002, OQ-003 and OQ-010 (hosting).

---

## 1. Confirmed owner requirements

| # | Requirement | Decision | Canonical rule |
|---|---|---|---|
| R1 | 600 s of active play (18,000 ticks); countdown and results separate; tick-driven end | D-073 | GR-2.2, GR-2.7, GR-2.7a |
| R2 | Start as Runner, Runner only unlocked, dagger, no guns | D-074 | GR-2.4, GR-18.1 |
| R3 | Beast at 3 credited KOs, Turret at 6; kept through death; never forced; no free gun | D-074 | GR-18.2, GR-18.3, GR-5.2 |
| R4 | Guns are loot, random per match on every map, including rooms; both guns of every form | D-075 | GR-19 |
| R5 | Locked-form guns can be collected and stored; usable only in the matching unlocked form | D-075 | GR-7.15, GR-18.3 |
| R6 | Automatic pickup, Q swap, V dagger; two gun slots per form; duplicates refill reserve | D-075, D-078 | GR-7.16, GR-7.17, GR-19.4 |
| R7 | Death keeps unlocks and loot and exactly the remaining ammunition of every gun | D-076 | GR-11.3, GR-11.6, GR-18.4 |
| R8 | Server-owned magazines, reserves and reloads; no free refills or reloads | D-076 | GR-7.18 to GR-7.20 |
| R9 | Six `WEAPON_ART.md` guns plus a dagger; one balanced higher-damage tier 2 gun per form | D-077 | GR-7.1, GR-7.21 to GR-7.32, BALANCE §9.5 |
| R10 | WASD facing-relative, Shift+W sprint, arrows aim, 1/2/3, R, E, Space, Tab, C, Esc/P; pointer lock | D-078 | GR-4.16 to GR-4.19, CONTROLS_UI §2 |
| R11 | Weak, breakable aim assist | D-079 | CONTROLS_UI §3.3, BALANCE §7 |
| R12 | Menu keeps the match running; neutral input; damageable | D-080 | CONTROLS_UI §6.5, NETWORK_PROTOCOL §9.4 |
| R13 | Art and audio may be integrated | D-081 | Codex |
| R14 | Finish mandatory gameplay, server, bot, ops tasks; selected production portions only | D-082 | §11 |

## 2. Superseded and preserved

**Superseded for this scope:** the 180 s PLAYING length and its tuning range (D-073); starting with every form usable and its form weapon always available (D-074); D-022 only for the six guns as loot (D-075); greybox only, D-045 (D-081); D-065's ban on pointer lock and its disabled FPP mouse aim, plus OQ-018 (D-078); soft lock-on, the Q lock binding and `softLock.*` (D-079); the V camera binding (now C).

**Preserved without change:** eight-seat FFA, Frenzy and Zone Frenzy, bot backfill and instant replacement (D-038), the counter triangle and matchup table, health fractions and morph rules (D-012, D-013, GR-5 apart from the unlock check), Flux and shards, abilities and their cooldowns, Turret rooting, turn cap and front armor, tier 1 gun numbers, Rail Repeater heat, damage ordering, spawn protection, respawn delay and Runner respawn form, server authority (D-036), shared deterministic sim (D-032), event-only projectiles (D-034), D-067, D-068, D-071 and D-072 prediction and exact `(owner, inputSeq, shotIdx)` matching, D-069 shot-index allocation, the AFK, hidden-tab and reconnect lifecycle, and every human gate (T-100, T-150, D-070).

**Still excluded:** crates and crate weapons, drones and every other `WEAPON_ART.md` weapon, Ultimates, Overdrive, accounts, XP, currencies, paid upgrades, seasons, extra modes, extra floors, gravity or bullet drop, headshots, penetration and physics engines.

## 3. State and lifecycle

New `PlayerRecord` fields are listed in GAME_RULES §3: `unlocked`, `guns` (owned, mag, reserve per gun), `selectedTier`, `gunTimers` (replace per-form `weapon`), `reload`, `swapReadyTick`, `melee`, `sprinting` and `aimDistM`. Progress is `stats.kos`. The world gains `loot`, `lootRng`, `nextLootId` and pending loot replenishments.

| Transition | Unlocks and progress | Guns, mag, reserve, selection | Reload, strike, timers, heat | Rule |
|---|---|---|---|---|
| Match start (COUNTDOWN) | Reset to Runner only, 0 | Reset to none | Reset | GR-2.4, GR-18.1 |
| Late join, human takes a bot's seat | Fresh | Fresh | Fresh | GR-2.6, GR-18.5 |
| Death (step 9) | Kept | Kept exactly | Reload and strike cancelled, nothing moves | GR-11.3 |
| Respawn | Kept | Kept exactly; form Runner | Timers 0, heat 0, guns ready | GR-11.6 |
| Reconnect, hidden tab, AFK proxy | Kept | Kept; a proxy may spend ammunition like any player | Continue | GR-18.5 |
| Human leaves, bot continues the seat | Kept | Kept | Continue | BOT_SPEC §9.1 |
| Morph start / end | Kept | Selection follows the new form at the end | Reload cancelled at start | GR-5.3, GR-5.4 |
| Last PLAYING tick to RESULTS | Final | Final | Reloads and strikes cancelled; shells removed | GR-2.7a |

## 4. Inputs, actions and identifiers

| Action | Key | Input (protocol v5) | Rule |
|---|---|---|---|
| Move | WASD, facing-relative | `moveX`, `moveY` from `encodeFacingMove` | GR-4.19 |
| Sprint | Shift (with forward movement) | button bit 9 (held) | GR-4.16 |
| Turn | Mouse X under pointer lock; Left/Right arrows | `aim` | D-078, BALANCE §9.6 |
| Aim distance | Mouse Y under pointer lock; Up/Down arrows | `aimDist` uint8, tenths of a meter | GR-4.18 |
| Fire | LMB, Space | bit 0 (held) | GR-7.2 |
| Ability | E | bit 1 (edge) | GR-8 |
| Morph | 1, 2, 3 | bits 2 to 4 (edge) | GR-5 |
| Reload | R | bit 8 (edge) | GR-7.19 |
| Swap gun | Q, mouse wheel | bit 10 (edge) | GR-7.16 |
| Dagger | V | bit 11 (edge) | GR-7.30 |
| Pickup | none (automatic) | none; bit 7 `interact` stays reserved | GR-19.3 |
| Scoreboard, camera, menu | Tab, C, Esc/P | client only | CONTROLS_UI |

Weapon ids (`WeaponId`, strings on the wire): `pulsePistol`, `ricochetDisc`, `scatterCannon`, `slugCannon`, `railRepeater`, `arcMortar`, `dagger`. `GUN_IDS` order (protocol index and placement order): pulsePistol 0, ricochetDisc 1, scatterCannon 2, slugCannon 3, railRepeater 4, arcMortar 5. Tier: `GUN_TIER`; form: `GUN_FORM`. New causes: `ricochetDisc`, `slugCannon`, `arcMortar`, `dagger`. Morph denial reason 4 is `locked`.

## 5. Numbers and formulas

All values: `BALANCE.md` proto-4 (§1, §2, §4, §4a, §7). Formulas: damage §9.1, TTK §9.2, Flux §9.4, the tier 2 benchmark §9.5, the keyboard turn model §9.6. Geometry: disc bounce GR-7.22, mortar landing and blast GR-7.26 to GR-7.28, dagger capsule GR-7.31, sprint cone GR-4.16, loot placement GR-19.2. All of them are deterministic: ordered by seat, projectile id or loot id, with ties broken as written.

## 6. Tick order

GAME_RULES §15 is canonical. Changes: step 2 records new edges and aim distance; step 6 decides sprint; step 7 orders reload completion, swap, dagger start, reload start, fire and automatic reload, then strikes after the spawn advance; step 8 adds bounces and mortar landings; step 9 adds unlocks; step 12 adds loot pickup and replenishment.

## 7. Protocol and prediction (protocol version 5)

`NETWORK_PROTOCOL.md` is canonical once stage S5 lands. Summary of the interface:

- **Input frame:** 15 numbers, `[seq, moveX, moveY, aim, buttons, aimSource, aimDist, intent0..7]`. New button bits 8 reload, 9 sprint, 10 swap, 11 dagger; bits 12 to 15 must be 0.
- **PlayerState additions:** `unlockedMask` (bit 0 Runner, 1 Beast, 2 Turret); `gunOwnedMask` (bit = `GUN_IDS` index); `gunMag` and `gunReserve` (6 values each); `gunNextShotIn` (6 float32, replacing the three per-form timers); `selectedRunner`, `selectedBeast`, `selectedTurret` (0, 1, 2); `reloadGun` (-1 none) and `reloadEndTick`; `swapReadyTick`; `meleeActive`, `meleeStartTick`, `meleeStrikeTick`, `meleeEndTick`; `sprinting`; `aimDist`.
- **World additions:** `loot: MapSchema<LootState>` with `gun` (index), `x`, `y`; key = loot id.
- **Events:** 31 `projectileBounce` (id, x, y, angle); 32 `mortarBlast` (id, x, y); 33 `reloadStart` (seat, gun, endTick); 34 `reloadEnd` (seat, gun, completed); 35 `weaponSwap` (seat, gun, readyTick); 36 `meleeStart` (seat, strikeTick, endTick); 37 `meleeStrike` (seat, targetSeat or -1, damage, tags, x2, y2); 38 `formUnlocked` (seat, form); 39 `lootSpawn` (lootId, gun, x, y); 40 `lootPickup` (lootId, seat, gun, kind 0 new or 1 ammunition). `projectileSpawn` appends `landTick`, `targetX`, `targetY`, which are 0 except for the Arc Mortar.
- **Prediction:** `LocalPredictState` adds the new player fields. Predicted: magazine and reserve use on firing, reload completion, swap, selection after a morph, dagger start and its timing, sprint movement, aim distance. Never predicted: loot pickups, ownership, unlocks, strike results, bounces' targets, mortar blasts, damage. Every new field is restored from the patch before replay (D-071 pattern). Conditional exact per-tick equivalence (D-068) extends to the new fields; stale-authority divergence tests stay separate.
- **Shot identity:** unchanged `(owner, inputSeq, shotIdx)`. A Scatter shell uses 7 consecutive indexes. Disc, Slug and Mortar use one each. The dagger creates no projectile and no shot index.

## 8. Asset and map integration interfaces (for Codex)

- **Loot:** render items at schema `loot` positions exactly; `lootSpawn` and `lootPickup` drive effects. No fixed sockets exist (D-075). Visuals must not imply a pickup range different from GR-19.3.
- **Muzzle:** projectiles start at `pos + aimDir × (radiusM + muzzleExtraM)` (GR-7.5). Visual muzzles must start shots there, or F4 hitboxes will disagree with what players see.
- **Disc:** straight flight between `projectileSpawn` and `projectileBounce` events; render the bounce at the event point.
- **Mortar:** draw the landing ring at (`targetX`, `targetY`) from spawn until `landTick`; the arc is cosmetic only and never implies cover clearance beyond GR-7.29.
- **Dagger:** animate from `meleeStart`; the hit comes only from `meleeStrike`.
- **Reload, swap, sprint, unlock:** drive the HUD and animations from the state fields and events in §7, never from local timers alone.
- **Camera and quality:** settings must not reveal players hidden behind walls or extend view beyond what every player can get (fairness review item, §12).
- **Map:** the loot candidate set is derived from map boxes at load. A new map from OQ-023 needs collision data that passes V1 to V9; visuals follow collision, not the other way round.

## 9. Acceptance tests

New and changed ids are in `docs/ACCEPTANCE_TESTS.md` §24 (release request). Requirement-to-test matrix:

| Requirement | Tests | Type | Owner |
|---|---|---|---|
| Exactly 600 s active | AT-MATCH-01 (18000 ticks), AT-MATCH-10 boundary | SIM | Claude |
| Fresh start: Runner, dagger, no guns | AT-LOAD-01 | SIM | Claude |
| Locked-form guns collected but unusable | AT-LOAD-02 | SIM | Claude |
| Unlock at 2→3 and 5→6 KOs | AT-LOAD-03 | SIM | Claude |
| Unlocks persist through death | AT-LOAD-04 | SIM | Claude |
| No unlock from assists, duplicates or invalid events | AT-LOAD-05 | SIM | Claude |
| New-match reset, reconnect and seat replacement | AT-LOAD-06 (SIM), AT-LOAD-07 (SERVER) | SIM, SERVER | Claude |
| Exact ammunition retention for every owned gun | AT-AMMO-01 | SIM | Claude |
| Death during reload, fire or swap; match-boundary races | AT-AMMO-02, AT-AMMO-03 | SIM | Claude |
| Reload, swap and fallback rules | AT-AMMO-04 to AT-AMMO-07 | SIM | Claude |
| Simultaneous claims and duplicate pickups | AT-LOOT-01, AT-LOOT-02 | SIM | Claude |
| Random, valid, deterministic placement and replenishment | AT-LOOT-03 to AT-LOOT-05 | SIM | Claude |
| Weapon and form restrictions | AT-WPN-16 | SIM | Claude |
| Tier 2 benchmark and effective TTK | AT-WPN-17, AT-WPN-18 | UNIT, SIM | Claude |
| Disc bounce and corner; Slug; Mortar landing, walls and blast | AT-WPN-19 to AT-WPN-22 | SIM | Claude |
| Dagger reach, wall and target selection | AT-MELEE-01 to AT-MELEE-03 | SIM | Claude |
| Sprint normalization, cone, Turret rooting, interactions | AT-MOV-09 to AT-MOV-11 | SIM | Claude |
| Facing-relative encoding | AT-CTRL-12 | UNIT | Claude (model), Codex (wiring) |
| Arrow combinations and frame-rate independence | AT-CTRL-04 (rewritten) | UNIT | Claude (model), Codex (wiring) |
| Assist acquire, manual tracking, break, occlusion, reacquire | AT-CTRL-05 to AT-CTRL-07 (rewritten) | UNIT | Claude (model), Codex (wiring) |
| Menu open: damage and death without pause | AT-CTRL-13 | E2E | Codex, reviewed by Claude |
| Protocol v5 validation, restoration and equivalence | AT-NET-01 (v5), AT-NET-20, AT-NET-21 | UNIT, SIM | Claude |
| Deterministic replay with the new state | AT-DET-03, AT-DET-05 (hash covers new fields) | SIM, TOOL | Claude |
| Exact shot identity regression | AT-NET-09 | E2E | Claude and Codex |
| Full match playability at loss | AT-NET-17 | MANUAL | Shared |
| Bots follow the same rules | AT-BOT-10 | SIM | Claude (T-051 onward) |
| Several full matches without growth | AT-PERF-06 | TOOL | Claude (T-141) |

## 10. Implementation stages

| Stage | Scope | Owner | Status |
|---|---|---|---|
| S0 | Audit, decisions, rules, balance, this contract | Claude | Done 2026-10-23 |
| S1 | T-045 ten-minute match, fresh loadout, kill unlocks | Claude | Done 2026-10-23 |
| S2 | T-046 gun state, ammunition, reloads, swap, dagger | Claude | Done 2026-10-23 |
| S3 | T-047 tier 2 guns | Codex takeover | Verified 2026-10-23 |
| S4 | T-048 loot; T-049 sprint, aim distance, facing encoding | Claude | Planned |
| S5 | T-057 protocol v5, mirror, validation, replay, prediction | Claude, then Codex client validation | Planned |
| S6 | T-058 client integration (controls, views, HUD) | Codex | Waits for S5 |
| S7 | T-041 to T-044, bots T-050 to T-056, T-067, T-110, T-112, T-113, T-120, T-121 numerics, T-130, T-131, T-133, T-141 | Claude | Queue order |
| S8 | Ops: T-069, T-140 server portions; platform research | Claude | Needs OQ-002, OQ-003, OQ-010 |
| S9 | Integrated cross-review of Codex's client | Claude | After S6 |

## 11. Task inventory

| Task | Owner | Depends on | Proof |
|---|---|---|---|
| T-039 sounds | Codex | T-030 | Manual listening, unit tests |
| T-041 Ram Charge, T-042 Rail Shot, T-043 cover, T-044 scoring | Claude | per TASKS.md | Their AT ids |
| T-045 to T-049 release gameplay | Claude | T-044 for unlock stats only | §9 tests |
| T-057 protocol v5 | Claude | T-045 to T-049 | AT-NET-01, AT-NET-20, AT-NET-21 |
| T-058 client release integration | Codex | T-057 | AT-CTRL-04 to AT-CTRL-13, AT-UI ids |
| T-050 to T-056 bots, determinism | Claude | T-057 | AT-BOT-01 to AT-BOT-10, AT-DET |
| T-060 to T-066 HUD, screens, toasts | Codex | T-058 | AT-UI ids |
| T-067 analyze v0 (adds time-to-first-gun, unlocks, weapon strength, late join, snowballing, keyboard versus mouse) | Claude | T-028 | TOOL |
| T-068 integration and E2E | Shared | all Stage A | AT-NET-17, E2E |
| T-069 deployment | Claude (server), Codex (client hosting) | T-068, OQ-002, OQ-003, OQ-010 | AT-DEP |
| T-100 Fun Gate | Human sessions | T-069 | Real sessions only |
| T-110, T-112, T-113 | Claude | T-044, bots | AT-ZONE, AT-MATCH-08 |
| T-120, T-121 aim models | Claude (numerics), Codex (wiring) | T-058 | AT-CTRL-04 to AT-CTRL-08 |
| T-130, T-131, T-133, T-141 | Claude | T-028, bots | AT-TEL, AT-PERF |
| T-140, T-143 to T-146, T-150 | Shared | earlier stages | Human evidence only |

## 12. Cross-review checklist (after Codex integrates)

1. Visual muzzle positions agree with GR-7.5 and hit obstruction (F4).
2. Animation and audio timings follow server state and events, not local guesses.
3. Camera, FOV and quality settings do not reveal hidden information or change competitive reach.
4. No UI action bypasses restrictions: pickups, swaps, reloads and unlocks come only from server state.
5. Pickup, reload, death and reconnect races render correctly at `?lag=150&jitter=20&loss=2`.
6. The packaged client connects to the intended backend URL, not localhost.
7. Pointer lock loss (Esc, blur, focus change) opens the menu and clears held input.

## 13. Handoff log

| Date | From | Summary | Next safe action |
|---|---|---|---|
| 2026-10-23 | Claude | S0 complete: D-073 to D-082, OQ-023, OQ-024, GAME_RULES §18 and §19 with changed sections, BALANCE proto-4 with the §9.5 benchmark, this contract. T-037 and T-038 working-tree changes are preserved and uncommitted. | Claude continues with S1 to S5. Codex should not start T-058 wiring until S5 publishes protocol v5. |
| 2026-10-23 (paused at the owner's request) | Claude | T-045 and T-046 done. T-047 code is in place (disc bounce, mortar landing and blast) without its own tests yet. Protocol 5 so far: `unlockedMask`, gun arrays, selection, reload, swap and melee fields, events 31 to 40, button bits 8 to 11, 12-bit button mask. Not yet on the wire: `aimDist` in the input frame, the `sprinting` and `aimDist` state fields, and the loot schema. Gates: 633 tests, typecheck, lint, build, size and map validation pass. Nothing is committed. Live e2e scripts that morph or fire need `/unlock`, and a gun grant command is still to come. | Resume with AT-WPN-17 to AT-WPN-22 for T-047, then T-048, T-049 and T-057. Codex: still wait for T-057 before T-058 wiring. |

| 2026-10-23 | Codex takeover | Owner authorized temporary gameplay/network ownership; Claude paused. Codex takes the shared-doc writer lock. Main confirmed; existing T-037/T-038 edits preserved. Focused progression, loadout, weapons and prediction baseline: 59/59 pass. T-047 remains unverified by dedicated tests; S4/S5 incomplete. OQ-024 approval requested; defaults remain provisional. | Add T-047 dedicated coverage, then loot, sprint and protocol in dependency order. |

| 2026-10-23 | Codex | S3: 14 dedicated tests pass; exact mortar-edge roundoff fixed; full suite 647/647 passes with localhost permission. D-083 records owner approval of all OQ-024 defaults and flat eight-player Lion’s Claw. Sandbox run failed on EPERM socket binds and was stopped, not retried as a flaky test. | T-048 loot, then T-049/T-057. Original graphics prompt pending from owner. |

**T-057 wire layout correction (2026-10-23):** Colyseus 5.0.40 limits a Schema object to 63 fields. PlayerState stores the new fields as `locomotion: LocomotionState { aimDist: uint8, sprinting: boolean }`. Input `aimDist` remains the seventh number in each 15-number frame. All consumers restore these fields from `locomotion` before replay. This is the finalized protocol v5 layout; all earlier flat-field descriptions refer to the same logical state.

| 2026-10-23 | Codex | T-048 implemented and focused/full sim verified (267/267). T-049 shared models and sprint parity implemented. T-057 now has 15-number frames and nested locomotion (63-field schema cap), loot mirror, and trusted `/give`. Broader verification exposed a real RTT test ordering race (ticks do not guarantee a Pong); assertion now waits for its own observation. Full-suite patch-rate check also failed under resource contention; threshold unchanged, investigation ongoing. | Complete protocol validation, bounded-concurrency broader checks and browser/server gameplay evidence. |
