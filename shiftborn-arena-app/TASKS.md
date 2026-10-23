# TASKS.md

> **LLM FILE CONTRACT:** Ordered execution queue and status source. Use one task at a time. This file does not override decisions, scope, game rules, balance or area specifications.

Small, ordered implementation tasks for the Shiftborn Arena prototype, with dependencies and completion criteria. Production work after the Approval Gate is listed as epics at the end.

## How to use this file

1. **Pick:** take the first task in the queue whose status is `TODO` and whose dependencies are all `DONE`. Tasks marked `parallel-ok` may start before the Fun Gate (T-100) passes. There are no per-person assignments (D-047). The GitHub Project board mirrors this file; this file is the source of truth.
2. **Claim:** set status to `IN PROGRESS (YYYY-MM-DD)` in the same commit as your first change, so others skip it.
3. **Read the spec** listed for the task before writing code. If something is missing or contradictory, add an entry to `OPEN_QUESTIONS.md`, set the task to `BLOCKED (OQ-xxx)` if it cannot proceed, and report the blocker. Take the next task only when the active request covers queue progression. Never invent a gameplay rule.
4. **Done when** every listed acceptance test (`docs/ACCEPTANCE_TESTS.md`) passes, CI is green, and the "Done when" items are true. Set status to `DONE (YYYY-MM-DD)` and add a line to the velocity log at the end of this file.
5. **Size:** S = up to 3 hours, M = up to 1 day, L = up to 2 days. If a task grows past L, split it into lettered sub-tasks (T-041a, T-041b) here before continuing.
6. **New tasks:** add them in dependency order with the next free id in the right range, and mention them in the completion report.
7. **Git:** work only on `main`; never create another branch or worktree. When the user requests a commit, use `T-xxx: summary` and keep one task per commit where possible.

Status values: `TODO`, `IN PROGRESS (date)`, `BLOCKED (OQ-xxx)`, `DONE (date)`.

Id ranges: T-001 to T-009 setup (T-008 is a design task) · T-010 to T-019 simulation core · T-020 to T-029 server and network · T-030 to T-039 client foundation · T-040 to T-049 gameplay completion · T-050 to T-059 bots · T-060 to T-069 HUD, UX and Stage A wrap-up · T-100 Fun Gate · T-110 to T-149 Stage B · T-150 Approval Gate.

---

## Queue overview

| Id | Title | Depends on | Size | Status |
|---|---|---|---|---|
| T-001 | Monorepo, tooling and pinned versions | none | M | DONE (2026-10-16) |
| T-002 | CI workflows | T-001 | S | DONE (2026-10-19) |
| T-003 | Shared balance, derived values, constants | T-001 | M | DONE (2026-10-19) |
| T-004 | Map types and `greybox_v1` data | T-001 | S | DONE (2026-10-19) |
| T-005 | Map validator tool | T-004 | M | DONE (2026-10-20) |
| T-006 | Protocol definitions and input encoding | T-003 | M | DONE (2026-10-20) |
| T-007 | Local dev environment and config | T-001 | S | DONE (2026-10-20) |
| T-008 | Paper prototype of the counter triangle and Flux (optional, parallel-ok) | none | S | TODO |
| T-010 | Sim skeleton: world, step, events, RNG, hash | T-003, T-004 | M | DONE (2026-10-20) |
| T-011 | Geometry, collision index, line of sight | T-010 | M | DONE (2026-10-20) |
| T-012 | Seats, phases, match start and spawns | T-011 | M | DONE (2026-10-20) |
| T-013 | Movement, collision and aim | T-012 | M | DONE (2026-10-20) |
| T-014 | Forms and morphing | T-013 | M | DONE (2026-10-20) |
| T-015 | Health and damage pipeline | T-014 | M | DONE (2026-10-20) |
| T-016 | Form weapons and projectiles | T-015 | L | DONE (2026-10-20) |
| T-017 | Death, credit, respawn and spawn protection | T-016 | M | DONE (2026-10-20) |
| T-018 | Flux and shards | T-017 | M | DONE (2026-10-20) |
| T-019 | Dash | T-014 | S | DONE (2026-10-20) |
| T-020 | Spike: Colyseus netcode helpers | T-006, T-013 | M | DONE (2026-10-20) |
| T-021 | ArenaRoom, tick loop, schema and mirror | T-020, T-012 | L | DONE (2026-10-20) |
| T-022 | Server input pipeline | T-021 | M | DONE (2026-10-20) |
| T-023 | Event batching, welcome, version checks | T-021 | S | DONE (2026-10-20) |
| T-024 | Seats, bot backfill and instant replacement | T-021 | M | DONE (2026-10-20) |
| T-025 | Matchmaking: quick play, code rooms, host, locking | T-024 | M | DONE (2026-10-20) |
| T-026 | Connection lifecycle: drop, reconnect, hidden tab, AFK, leave, shutdown | T-024 | M | DONE (2026-10-20) |
| T-027 | RTT probes, clock sync and spawn advance wiring | T-022 | S | DONE (2026-10-20) |
| T-028 | Match log, input log and replay tool | T-021 | M | DONE (2026-10-21) |
| T-029 | Dev cheats | T-021 | S | DONE (2026-10-21) |
| T-030 | Client shell, screens and settings storage | T-006, T-007 | M | DONE (2026-10-21) |
| T-031 | Client connection, clock and netsim | T-030, T-023, T-027 | M | DONE (2026-10-21) |
| T-032 | Renderer, greybox map and camera | T-030, T-004 | L | DONE (2026-10-21) |
| T-033 | Entity views and effects | T-032 | M | DONE (2026-10-21) |
| T-034 | Input manager, bindings, mouse aim | T-030 | M | DONE (2026-10-21) |
| T-035 | Prediction and reconciliation | T-040, T-031, T-034 | L | DONE (2026-10-21) |
| T-036 | Interpolation and event timeline | T-031, T-033 | M | DONE (2026-10-21) |
| T-037 | Projectile views and local shots | T-035, T-036, T-016 | M | DONE (2026-10-21) |
| T-038 | Debug overlay, hitbox view, dev console | T-031, T-029 | S | DONE (2026-10-21) |
| T-039 | Synthesized sounds | T-030 | S | TODO |
| T-040 | `predictStep` and prediction equivalence tests | T-019, T-014 | M | DONE (2026-10-21) |
| T-041 | Ram Charge, knockback and stun | T-015, T-019, T-040 | L | TODO |
| T-042 | Rail Shot | T-016 | M | TODO |
| T-043 | Destructible cover | T-041 | S | TODO |
| T-044 | Scoring, ranking, stats and Frenzy mode rules | T-017 | M | TODO |
| T-045 | Ten-minute match, fresh loadout and kill unlocks | T-017 | M | DONE (2026-10-23) |
| T-046 | Gun state, ammunition, reloads, swap and dagger | T-045, T-016 | L | DONE (2026-10-23) |
| T-047 | Tier 2 guns: Ricochet Disc, Slug Cannon, Arc Mortar | T-046 | M | DONE (2026-10-23) |
| T-048 | Random loot and automatic pickup | T-046 | M | DONE (2026-10-23) |
| T-049 | Sprint, aim distance and facing-relative encoding | T-040 | S | IN PROGRESS (2026-10-23) |
| T-057 | Protocol v5, mirror, validation, replay and prediction for the release state | T-045 to T-049 | L | IN PROGRESS (2026-10-23) |
| T-058 | Client integration of the release gameplay (Codex) | T-057, T-037 | L | TODO |
| T-050 | Bot navigation grid and pathfinding | T-011 | M | TODO |
| T-051 | Bot controller framework | T-050, T-024 | M | TODO |
| T-052 | Bot combat: targeting, aim, fire, movement | T-051, T-016 | L | TODO |
| T-053 | Bot morph and ability policies | T-052, T-041, T-042 | M | TODO |
| T-054 | Bot goals, difficulty tiers, names | T-053, T-018 | M | TODO |
| T-055 | Proxy control integration | T-054, T-026 | S | TODO |
| T-056 | Determinism and property suites | T-054, T-044 | M | TODO |
| T-060 | HUD core: health, Flux, forms, ability, heat | T-035 | M | TODO |
| T-061 | HUD match info: timer, score, kill feed, scoreboard, network | T-036, T-044 | M | TODO |
| T-062 | Combat feedback: damage numbers, hit markers, reticle | T-037 | M | TODO |
| T-063 | Minimap | T-036 | S | TODO |
| T-064 | Respawn overlay, results screen, next match flow | T-061 | M | TODO |
| T-065 | Controls card and in-match menu | T-034, T-030 | S | TODO |
| T-066 | Toasts | T-060 | S | TODO |
| T-067 | Analyze v0 for the Fun Gate | T-028 | M | TODO |
| T-068 | Stage A integration pass and E2E smoke | T-060 to T-067, T-055, T-056 | M | TODO |
| T-069 | Minimal deployment for internal sessions | T-068 | S | TODO |
| T-100 | **Fun Gate** | T-069 | M | TODO |
| T-110 | Zone Frenzy simulation (parallel-ok) | T-044 | M | TODO |
| T-111 | Zone presentation | T-110, T-063 | M | TODO |
| T-112 | Bot zone behavior | T-110, T-054 | S | TODO |
| T-113 | Quick-play mode config and host settings panel | T-110, T-025, T-065 | S | TODO |
| T-120 | Keyboard turn model, aim distance and scheme detection (parallel-ok) | T-034, T-049 | S | TODO |
| T-121 | Fragile aim assist (parallel-ok) | T-120, T-036 | M | TODO |
| T-122 | Settings screen complete | T-121, T-039 | S | TODO |
| T-123 | Death recap with counter hint | T-064 | S | TODO |
| T-124 | Threat arrows and Rail Shot warning | T-042, T-036 | S | TODO |
| T-125 | Keyboard-only pass for all screens | T-122 | S | TODO |
| T-126 | Readability pass at 821 x 462 | T-125 | S | TODO |
| T-130 | Full telemetry (parallel-ok) | T-028 | M | TODO |
| T-131 | Analyze tool complete (parallel-ok) | T-130, T-067 | M | TODO |
| T-132 | Survey prompt and tester code | T-130, T-064 | S | TODO |
| T-133 | Dummy mode and fairness tooling | T-054, T-121 | S | TODO |
| T-140 | Deployment hardening (parallel-ok) | T-069 | M | TODO |
| T-141 | Load and soak test (parallel-ok) | T-056 | M | TODO |
| T-142 | Client performance pass | T-111 | S | TODO |
| T-143 | Full prototype checklist on the deployment | T-110 to T-142 | M | TODO |
| T-144 | Playtest ops kit | T-143 | S | TODO |
| T-145 | Playtest round R1 and fixes | T-144 | L | TODO |
| T-146 | Playtest round R2 and fairness protocol | T-145 | L | TODO |
| T-150 | **Approval Gate package** | T-146 | M | TODO |

---

## Stage A: First Playable

### T-001 Monorepo, tooling and pinned versions
- **Track:** Setup · **Size:** M · **Depends on:** none
- **Spec:** `docs/ARCHITECTURE.md` §2, §3, §16; D-031
- **Do:**
  - pnpm workspace with `packages/shared`, `packages/sim`, `apps/server`, `apps/client`, `tools/*` (empty packages with `index.ts` and a placeholder test each).
  - `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, path aliases; per-package `tsconfig.json`.
  - ESLint (typescript-eslint) with: dependency rules (§3.1) via `no-restricted-imports`; sim purity rules banning `Math.random`, `Date.now`, `performance.now`, timers, `document`, `window`, `console` in `packages/sim/src`; no default exports. Prettier.
  - `.nvmrc`, `engines`, `packageManager`, `.editorconfig`, `.gitignore`, root scripts from §3.2 (stubs that print "not implemented" are fine for later ones).
  - Commit the doc pack at the repository root and in `docs/` as delivered. `AGENTS.md` is the canonical Codex guide; `CLAUDE.md` is a short compatibility pointer to it.
  - Install and pin Node.js Active LTS, pnpm, TypeScript, Vite, Three.js, Colyseus server and client, `@colyseus/schema`, `@colyseus/testing`, Vitest, Playwright and pino. The completed task recorded exact versions in D-060 and provides `pnpm run setup` as the single clean-clone installation command.
- **Done when:** AT-REPO-01, AT-REPO-02, AT-REPO-03, AT-REPO-04 pass.

### T-002 CI workflows
- **Track:** Setup · **Size:** S · **Depends on:** T-001
- **Spec:** `docs/ARCHITECTURE.md` §10
- **Do:** `ci.yml` (install with frozen lockfile, lint, typecheck, test, build; later tasks add steps), `nightly.yml` skeleton (scheduled, runs `pnpm test` for now). Cache pnpm store. Add `pnpm check:size` (gzipped size of `apps/client/dist`, fails at 5 MB; passes trivially until the client builds) and its CI step. Add a CI step for AT-REPO-09: `AGENTS.md` must exist and be non-empty; `CLAUDE.md` must contain the literal `AGENTS.md`, remain under 1 KiB and not be byte-identical to `AGENTS.md`.
- **Done when:** AT-REPO-06 passes for the steps that exist; AT-REPO-07 and AT-REPO-09 pass; failing lint prevents the change from being accepted on `main`.

### T-003 Shared balance, derived values, constants
- **Track:** Shared · **Size:** M · **Depends on:** T-001
- **Spec:** `docs/BALANCE.md` §1 to §8; `docs/ARCHITECTURE.md` §8; D-046
- **Do:** `balance.ts` exactly as BALANCE §8; `derived.ts` (ticks via `Math.round(s × 30)`, radians, per-tick rates, weapon intervals, Turret 4° per tick, scatter offsets in radians); `balanceHash()` (stable hash of a canonical JSON); `constants.ts` enums (Form, Phase, Mode, AbilityId, WeaponId, AimSource, Cause, Controller).
- **Done when:** AT-DET-01, AT-DET-02, AT-REPO-08 pass.

### T-004 Map types and `greybox_v1` data
- **Track:** Shared · **Size:** S · **Depends on:** T-001
- **Spec:** `docs/MAP_SPEC.md` §9; also add the `test_open` fixture (a 64 x 64 box with only the outer walls) for sim tests (`docs/ACCEPTANCE_TESTS.md` §1)
- **Do:** `maps/types.ts`, `maps/greybox_v1.ts` copied exactly from MAP_SPEC §9, `test_open` in sim test fixtures.
- **Done when:** AT-MAP-02 passes.

### T-005 Map validator tool
- **Track:** Tools · **Size:** M · **Depends on:** T-004
- **Spec:** `docs/MAP_SPEC.md` §10, §11
- **Do:** `tools/map-validator` implementing V1 to V9, the report, the ASCII render, non-zero exit on failure; `pnpm map:validate`; add to CI.
- **Done when:** AT-MAP-01 passes; the printed ASCII render matches MAP_SPEC §11 and the numbers match §10.2.

### T-006 Protocol definitions and input encoding
- **Track:** Shared · **Size:** M · **Depends on:** T-003
- **Spec:** `docs/NETWORK_PROTOCOL.md` §2, §5
- **Do:** `protocol.ts`: `PROTOCOL_VERSION`, message ids, `InputFrame` type, encode and decode for the flat packet (with redundancy), validation function, button bit constants, event type ids and payload types, close codes.
- **Done when:** AT-NET-01 passes.

### T-007 Local dev environment and config
- **Track:** Setup · **Size:** S · **Depends on:** T-001
- **Spec:** `docs/ARCHITECTURE.md` §3.2, §5.5
- **Do:** `pnpm dev` runs the server (watch mode) and Vite with a proxy; `.env.example` with every variable; `config.ts` validating server variables at startup; client `.env` variables.
- **Done when:** AT-REPO-05 passes.

### T-008 Paper prototype of the counter triangle and Flux (optional, parallel-ok)
- **Track:** Design · **Size:** S · **Depends on:** none
- **Spec:** `docs/GDD.md` §21.1 (paper prototype step); `docs/GAME_RULES.md` §5, §6, §10; `docs/BALANCE.md` §3
- **Do:** a one-hour table-top session with 5 to 8 people in week 1 (index cards for forms, a timer for regeneration and cooldowns, tokens for Flux and shards). Explain only the controls, not the triangle. Note: does anyone morph without being told to; can players name which form beats which after three rounds; do the Flux costs force real choices. Write `docs/reports/PAPER_PROTOTYPE.md`.
- **Done when:** the report exists. Any proposed change to rules or numbers goes to `OPEN_QUESTIONS.md`, never straight into the specs. Skipping this task does not block anything.

### T-010 Sim skeleton
- **Track:** Sim · **Size:** M · **Depends on:** T-003, T-004
- **Spec:** `docs/ARCHITECTURE.md` §4.1 to §4.4; `docs/GAME_RULES.md` §1, §15, §17
- **Do:** `World` type, `createWorld`, `step` running the 15 tick-order steps as empty stubs in order, event emitter with the event union from GR §17, `sfc32` RNG with seeding from `(roomSeed, matchIndex)`, `hashWorld`.
- **Done when:** AT-DET-03 passes; a world steps 1,000 ticks with no players without error.

### T-011 Geometry, collision index, line of sight
- **Track:** Sim · **Size:** M · **Depends on:** T-010
- **Spec:** `docs/ARCHITECTURE.md` §4.5; `docs/GAME_RULES.md` §4.3
- **Do:** vec2 helpers, circle vs box push-out, swept segment vs box (inflated), segment vs circle, raycast; 4 m uniform grid index of walls; cover list with intact flags; `lineOfSight`.
- **Done when:** AT-MAP-03 passes; unit tests for each geometry function including edge and corner cases.

### T-012 Seats, phases, match start and spawns
- **Track:** Sim · **Size:** M · **Depends on:** T-011
- **Spec:** `docs/GAME_RULES.md` §2, §3, GR-11.5
- **Do:** player records and seats; `addPlayer`, `removePlayer`, `setController`, `setMode`; phase machine COUNTDOWN, PLAYING, RESULTS; match start reset, seeded spawn shuffle, recent spawns; match id and seed derivation.
- **Done when:** AT-MATCH-01, AT-MATCH-02, AT-MATCH-03 pass.

### T-013 Movement, collision and aim
- **Track:** Sim · **Size:** M · **Depends on:** T-012
- **Spec:** `docs/GAME_RULES.md` §4
- **Do:** input application (move quantization and normalization, aim rules per form), acceleration, sub-stepping, wall push-out and sliding, bounds clamp with event. Write movement and aim as pure functions on a player record and map (for `predictStep`).
- **Done when:** AT-MOV-01 to AT-MOV-08, AT-FORM-02, AT-FORM-03, AT-FORM-04 pass.

### T-014 Forms and morphing
- **Track:** Sim · **Size:** M · **Depends on:** T-013
- **Spec:** `docs/GAME_RULES.md` §4.1, §5; D-012, D-013, D-014
- **Do:** form stat lookup; morph request validation with denial reasons; morph start, old-form-during-morph rules, end with fraction kept; morph cooldown; per-form ability ready ticks that keep running.
- **Done when:** AT-FORM-01, AT-MORPH-01 to AT-MORPH-11 pass (AT-MORPH-07 parts about firing and abilities may be completed in T-016 and T-019).

### T-015 Health and damage pipeline
- **Track:** Sim · **Size:** M · **Depends on:** T-014
- **Spec:** `docs/GAME_RULES.md` §6; D-010, D-012
- **Do:** `applyDamage(world, attacker, victim, base, distanceMul, incomingDir, cause)` with matchup, front-arc armor, tags, damage log, death threshold, immunity; display helpers for HP and damage numbers in `shared` (used by the client).
- **Done when:** AT-DMG-01 to AT-DMG-05 pass.

### T-016 Form weapons and projectiles
- **Track:** Sim · **Size:** L · **Depends on:** T-015
- **Spec:** `docs/GAME_RULES.md` §7; D-020, D-034
- **Do:** per-form fire timers with the accumulator; blocked states; projectile pool, spawn rules, swept movement and hits, range expiry, wall impacts, protected blocks; Scatter pattern and falloff; Rail arm distance and heat; spawn advance via `StepContext`; events with `(inputSeq, shotIdx)`.
- **Done when:** AT-WPN-01 to AT-WPN-12 and AT-WPN-14 to AT-WPN-15 pass; AT-WPN-13 projectile survival and damage pass. Its KO-credit assertion belongs to T-017.

### T-017 Death, credit, respawn and spawn protection
- **Track:** Sim · **Size:** M · **Depends on:** T-016
- **Spec:** `docs/GAME_RULES.md` GR-9.3, §11
- **Do:** death handling order, KO and assist credit (including the deferred AT-WPN-13 owner KO-credit assertion), same-tick rules, respawn timer, spawn choice, respawn state, protection start and early end, death event with recap data and counter form.
- **Done when:** AT-DEATH-01 to AT-DEATH-08, AT-STS-05, AT-DMG-06, AT-WPN-13 pass.

### T-018 Flux and shards
- **Track:** Sim · **Size:** M · **Depends on:** T-017
- **Spec:** `docs/GAME_RULES.md` §10; D-011, D-021
- **Do:** regeneration, rewards, clusters (start, respawn schedule, announce), pickups with closest-player rule, death drops with ring placement and wall avoidance, expiry, respawn Flux.
- **Done when:** AT-FLUX-01 to AT-FLUX-09 pass.

### T-019 Dash
- **Track:** Sim · **Size:** S · **Depends on:** T-014
- **Spec:** `docs/GAME_RULES.md` §8.1, §8.2
- **Do:** ability framework (start conditions, per-form ability lookup `abilityFor(player)` for future kits, protection end), Dash movement as a pure function.
- **Done when:** AT-ABL-01 to AT-ABL-04, AT-ABL-19, AT-ABL-20 (Dash parts), AT-MORPH-12 pass.

### T-020 Spike: Colyseus netcode helpers
- **Track:** Network · **Size:** M · **Depends on:** T-006, T-013
- **Spec:** `docs/NETWORK_PROTOCOL.md` §15; D-035
- **Do:** a throwaway test room and client (in `tools/spikes/netcode`, deleted after) running sim movement with the pinned Colyseus helpers; run each check in §15 at 150 ms added RTT; write findings in the task completion report.
- **Done when:** D-061 is proposed in `DECISIONS.md` (Hamza approves) stating which helpers to use or "custom"; the spike code is removed or moved under `tools/spikes` with a README.

### T-021 ArenaRoom, tick loop, schema and mirror
- **Track:** Server · **Size:** L · **Depends on:** T-020, T-012
- **Spec:** `docs/ARCHITECTURE.md` §5.1 to §5.3; `docs/NETWORK_PROTOCOL.md` §4
- **Do:** room definition, `onCreate` with crypto room seed and sim world, fixed 30 Hz loop with bounded catch-up and overrun logging, schema classes from NETWORK_PROTOCOL §4.2, `mirror.ts` assigning only changed fields, patch rate 50 ms, tick time measurement.
- **Done when:** a server test shows a room advancing 30 ticks per second, a client receiving `tick` updates at 20 Hz, and player positions mirrored.

### T-022 Server input pipeline
- **Track:** Server · **Size:** M · **Depends on:** T-021
- **Spec:** `docs/NETWORK_PROTOCOL.md` §5.2, §5.4, §14
- **Do:** `inputQueue.ts` (redundancy de-duplication, buffer cap, 2-frame catch-up with merged edges, repeat-last, edge computation, `lastInputSeq`), validation and drop counters, rate limit, kick on abuse.
- **Done when:** AT-NET-02, AT-NET-03, AT-NET-04, AT-SEC-01 pass.

### T-023 Event batching, welcome, version checks
- **Track:** Server · **Size:** S · **Depends on:** T-021
- **Spec:** `docs/NETWORK_PROTOCOL.md` §2, §5.1, §5.3
- **Do:** `ev` batching per tick, `welcome` with balance hash and tester code, protocol version check in `onAuth`, name sanitizing.
- **Done when:** AT-NET-05, AT-SEC-02 pass.

### T-024 Seats, bot backfill and instant replacement
- **Track:** Server · **Size:** M · **Depends on:** T-021
- **Spec:** `docs/NETWORK_PROTOCOL.md` §3.5; `docs/BOT_SPEC.md` §9; D-038
- **Do:** `seats.ts`: fill with placeholder bots (an idle input source until T-051), replacement selection with out-of-combat tracking, `botReplaced` event, projectiles removal, seat release on leave.
- **Done when:** AT-NET-10 passes.

### T-025 Matchmaking: quick play, code rooms, host, locking
- **Track:** Server · **Size:** M · **Depends on:** T-024
- **Spec:** `docs/NETWORK_PROTOCOL.md` §3; `docs/GAME_RULES.md` GR-2.6, GR-2.9
- **Do:** `joinOrCreate` filtering by code, sorting by human count, room codes, host assignment and handover, `hostSettings` handling (applied next COUNTDOWN), lock and unlock for quick play, waiting state for late code-room joiners.
- **Done when:** AT-NET-14, AT-NET-15, AT-MATCH-07, AT-MATCH-08 pass.

### T-026 Connection lifecycle
- **Track:** Server · **Size:** M · **Depends on:** T-024
- **Spec:** `docs/NETWORK_PROTOCOL.md` §9
- **Do:** drop handling with a 30 s reconnection window and proxy control (placeholder input until T-055), reconnect restore, `vis` handling, AFK tracking with `afkWarn` and takeover, consented leave, disposal, graceful shutdown on SIGTERM.
- **Done when:** AT-NET-11, AT-NET-13, AT-NET-16 pass, plus the server half of AT-NET-12.

### T-027 RTT probes, clock sync and spawn advance wiring
- **Track:** Server · **Size:** S · **Depends on:** T-022
- **Spec:** `docs/NETWORK_PROTOCOL.md` §8.1, §10
- **Do:** `ping`/`pong`, server `probe`/`probeReply` with median RTT per player, pass spawn advance ticks to `sim.step`.
- **Done when:** AT-NET-19 passes (server side) and AT-WPN-14 passes through a server test.

### T-028 Match log, input log and replay tool
- **Track:** Server, Tools · **Size:** M · **Depends on:** T-021
- **Spec:** `docs/ARCHITECTURE.md` §9; `docs/GAME_RULES.md` GR-2.10
- **Do:** JSONL writer with daily folders (Stage A events: `match_start`, `morph`, `damage`, `death`, `match_end`, `client_stats`), gzipped input log, `tools/replay` and `pnpm replay`.
- **Done when:** AT-TEL-02 and AT-DET-06 pass; AT-TEL-01 passes for the Stage A event set.

### T-029 Dev cheats
- **Track:** Server · **Size:** S · **Depends on:** T-021
- **Spec:** `docs/ARCHITECTURE.md` §11
- **Do:** `devCmd` handling gated by `DEV_CHEATS=1`; commands `/flux`, `/hp`, `/form`, `/kill`, `/endmatch`, `/bots`, `/difficulty`, `/mode`, `/freeze`, `/tp` (`/dummies` comes in T-133).
- **Done when:** commands work with cheats on and are rejected with cheats off (AT-SEC-03 part).

### T-030 Client shell, screens and settings storage
- **Track:** Client · **Size:** M · **Depends on:** T-006, T-007
- **Spec:** `docs/CONTROLS_UI.md` §6.1, §6.2, §6.4 (storage only); D-040
- **Do:** Vite app, WebGL 2 check, `App` screen state machine, landing screen (generated name, Play, Create room, Join room, `?room=` handling), connecting and error screens per close code, `settings.ts` with safe storage and defaults, base CSS.
- **Done when:** AT-UI-01 (without joining a real match), AT-UI-10 pass.

### T-031 Client connection, clock and netsim
- **Track:** Client · **Size:** M · **Depends on:** T-030, T-023, T-027
- **Spec:** `docs/NETWORK_PROTOCOL.md` §6 to §10, §12
- **Do:** `Connection` (join options, welcome checks, message routing, reconnection with token and backoff), clock sync estimator, probe replies, `netsim.ts` with lag, jitter and head-of-line loss.
- **Done when:** joining shows live server ticks; production socket, validation, reconnection and netsim checks pass; AT-NET-19 passes end to end (D-066). Attempt full AT-NET-17 after T-034 and assign any remaining verification to T-068 without changing its pass condition.

### T-032 Renderer, greybox map and camera
- **Track:** Client · **Size:** L · **Depends on:** T-030, T-004
- **Spec:** `docs/ARCHITECTURE.md` §6.3; `docs/CONTROLS_UI.md` §7, §8; `docs/MAP_SPEC.md` §13
- **Do:** Three.js renderer, floor grid and lane tints, walls 3 m and cover 1.2 m from map data, lane labels, sim-to-world mapping, TPP and FPP camera views with TPP default, form zoom, TPP lead and smoothing, TPP occlusion fade, `palette.ts`.
- **Done when:** AT-MAP-04 and AT-UI-13 (static parts) pass.

### T-033 Entity views and effects
- **Track:** Client · **Size:** M · **Depends on:** T-032
- **Spec:** `docs/CONTROLS_UI.md` §8
- **Do:** form silhouettes (Runner, Beast, Turret with front-arc wedge), own blue with white ring, enemies red with outline and nameplates, morph burst, protection bubble, stun stars, knockback and dash trails, shards (instanced), cluster announce marker, destroyed cover rubble, Rail Shot telegraph line and beam.
- **Done when:** each visual appears on a scripted local sim run (a dev page that runs the sim locally with bots for visual checks is allowed).

### T-034 Input manager, bindings, mouse aim
- **Track:** Client · **Size:** M · **Depends on:** T-030
- **Spec:** `docs/CONTROLS_UI.md` §2.1, §2.5, §2.6, §3.1
- **Do:** actions and bindings table, latching, frame building at 30 Hz with `aimSource`, mouse ground-plane aim with dead zone, reticle, fire Hold and Toggle, browser input rules.
- **Done when:** AT-CTRL-01, AT-CTRL-02, AT-CTRL-03, AT-CTRL-09, AT-CTRL-11 pass.

### T-035 Prediction and reconciliation
- **Track:** Client · **Size:** L · **Depends on:** T-040, T-031, T-034
- **Spec:** `docs/NETWORK_PROTOCOL.md` §6 (or the Colyseus helper path from D-061)
- **Do:** `Predictor` with pending project-sequence frames around T-040's shared `predictStep`, authoritative restoration, reconciliation with replay, smooth-or-snap, correction counter, special cases (death, respawn, visibility return, reconnect) (D-067). Resolve OQ-021's missing restoration fields before claiming full-state replay.
- **Done when:** AT-NET-06 and AT-NET-07 pass.
- **2026-10-21 evidence:** D-071 version 2 Schema restores weapon timers, held-edge and shot history, and immunity. Browser predictor replays pending project-sequence frames with the shared step, snaps inclusive Euclidean errors at 0.5 m, smooths smaller visual offsets for 100 ms, and resets on death, respawn, large teleport, resync and recovery. Real-server AT-NET-06 moved the displayed player and camera on the first frame at 150 ms. Real-server AT-NET-07 ran 60.756 s at 150 ms with 5.20 m of authoritative movement, one Dash start, two morph starts and zero qualifying corrections. Separate 0/100/200 ms, 150 ms with 2% loss, and 150 ms with 20 ms jitter plus 2% loss smoke checks passed. Focused tests, 583 unit tests, 13 nongated Playwright regressions, lint, typecheck, build, map validation, size (221,562 bytes gzipped) and diff checks passed; eleven gated Playwright cases were not counted in that nongated suite, and T-035's seven live cases ran separately.

### T-036 Interpolation and event timeline
- **Track:** Client · **Size:** M · **Depends on:** T-031, T-033
- **Spec:** `docs/NETWORK_PROTOCOL.md` §7
- **Do:** snapshot ring buffer per remote player, render time, interpolation and capped extrapolation, teleport snap, event playback on the render timeline, immediate local HUD events.
- **Done when:** AT-NET-08 passes.
- **2026-10-21 evidence:** One-second detached, stable-ID histories, shorter-arc aim, boundary-switched discrete fields, 100 ms capped velocity extrapolation, strict >5 m snap and presentation-only 0.599 m frame catch-up. Validated same-tick event batches share the delayed world timeline; typed own vitals, damage/death and hit feedback arrive immediately, with projectile-owner and BotReplaced seat attribution. Real server and two production-schema browser clients passed AT-NET-08 at 0/100/200 ms, 150 ms plus 2% HOL loss, and 150 ms plus 20 ms jitter and 2% loss: respectively 217/72, 209/71, 211/71, 210/72 and 209/70 rendered frames/patches in ~3.5 s windows; 15.9–17.1 m displayed movement, 33–39 patch intervals with intermediate rendered poses, and maximum frame deltas 0.258/0.340/0.530/0.599/0.599 m. Focused tests, 13 nongated browser regressions, AT-NET-06 local first-frame regression, 594 unit tests, lint, typecheck, build, map and size checks pass. Sixteen gated browser cases are counted only in their separate live runs.

### T-037 Projectile views and local shots
- **Track:** Client · **Size:** M · **Depends on:** T-035, T-036, T-016
- **Spec:** `docs/NETWORK_PROTOCOL.md` §8.2, §8.3
- **Do:** local shot visuals from predicted fire, linking by `(inputSeq, shotIdx)`, 500 ms fade for unmatched shots, remote projectiles scheduled at render time, impact, expire and blocked effects.
- **Done when:** AT-NET-09 passes.
- **2026-10-21 evidence:** Predicted local shots render on the first click frame; exact `(owner, inputSeq, shotIdx)` confirmation retains visual id and position. Remote flight and terminal effects use the delayed world timeline, and unmatched visuals fade after 500 ms. [The real-server trace](docs/T037_HOL_TRACE.md) preserves the protocol v2 AT-NET-09 failures and documents approved D-072's protocol v3 fix: eight bounded, ordered shot-intent slots travel with redundant input frames; server catch-up still applies newer movement/aim/held input while an accepted shot uses the original predicted tag. The deterministic 117/118 regression, exact matching and client acknowledgement/reset tests pass. An uninstrumented AT-NET-09 matrix passed 15/15 across 0/100/200 ms, 150 ms with 2% HOL loss, and 150 ms with 20 ms jitter plus loss; five more repetitions of each stress condition passed 10/10. All 25 cases drew the shot on the next frame and linked without a jump or page error. The full 609-test unit suite, lint, typecheck, build, map validation, size gate and diff check pass. The nongated browser suite passed 14/14; 21 live-gated cases were skipped there and AT-NET-09 was run separately. A static T-033 fixture clock was held at its selected tick to remove a transient 0.18 s flash assertion race; its three-repeat browser check passed.

### T-038 Debug overlay, hitbox view, dev console
- **Track:** Client · **Size:** S · **Depends on:** T-031, T-029
- **Spec:** `docs/ARCHITECTURE.md` §11
- **Do:** F3 overlay values, F4 hitbox view, backtick console sending `devCmd` and showing `devResult`.
- **Done when:** all overlay values update live; console commands work against a cheats-on server.
- **2026-10-21 evidence:** F3 reads renderer frame timing and entity counts, measured RTT, authoritative and predicted ticks, predictor error/corrections, remote buffer depth, input scheme and raw local `hpFrac`/Flux. F4 reads map boxes and balance radii, hides destroyed cover, and has typed zone/Rail fixtures for later gameplay producers. Protocol v4 adds a validated, trusted `welcome.devCheatsEnabled` capability; Connection gates sends to the current open session while the server retains its command check. Browser tests with real `DEV_CHEATS=1` and `=0` servers passed 3/3 each, including all ten existing commands, private results, disabled-client flags, live metrics, hitboxes, neutral typing input, safe text and cleanup. The 611-test unit suite and 15 nongated browser tests pass; 23 live-gated browser cases were skipped in that sweep, and T-038's two live cases ran separately. Lint, typecheck, build, map validation, size (231278 gzipped bytes) and diff check pass. Deployment security acceptance is still AT-DEP-04.

### T-039 Synthesized sounds
- **Track:** Client · **Size:** S · **Depends on:** T-030
- **Spec:** `docs/CONTROLS_UI.md` §9
- **Do:** `sfx.ts` with Web Audio synthesis for every sound in the table, unlock on first input, volume groups, positional pan and distance, mute on hidden tab.
- **Done when:** AT-UI-12 passes (sounds wired to events as the related tasks land; list missing hooks in the task completion report).

### T-040 `predictStep` and prediction equivalence tests
- **Track:** Sim · **Size:** M · **Depends on:** T-019, T-014
- **Spec:** `docs/ARCHITECTURE.md` §4.6
- **Do:** Shared `LocalPredictState` and `predictStep` built from the same pure functions; equivalence tests for 1,000 random input sequences of movement, Dash, morph and Turret turning (no other players), comparing every predictable local field exactly every tick with the same authoritative inputs; separately test stale-authority divergence (D-067, D-068). D-069 defines shot-index allocation.
- **Done when:** the approved conditional equivalence tests and relevant checks pass.
- **2026-10-21 evidence:** Shared `predictStep` and `LocalPredictState` implemented; 1,000 seeded 48-tick sequences compare every predictable local field exactly against the full server step when both receive the same authoritative inputs. Targeted tests cover stale-Flux affordability divergence, shots, Dash interruption, morph timing, cover and statuses. OQ-021 was resolved for T-035 through D-071; it did not change T-040's shared-step acceptance.

### T-041 Ram Charge, knockback and stun
- **Track:** Sim · **Size:** L · **Depends on:** T-015, T-019, T-040
- **Spec:** `docs/GAME_RULES.md` §8.3, GR-9.1, GR-9.2
- **Do:** windup, charge sub-steps, enemy contact selection, damage and knockback, wall stun, cover contact (calls into T-043's destroy function; stub until then), two-Beast rule, cooldown; knockback and stun systems with CC immunity; extend `predictStep` with Ram movement (walls and cover only).
- **Done when:** AT-ABL-05 to AT-ABL-09, AT-ABL-11 to AT-ABL-13, AT-STS-01 to AT-STS-04 pass.

### T-042 Rail Shot
- **Track:** Sim · **Size:** M · **Depends on:** T-016
- **Spec:** `docs/GAME_RULES.md` §8.4
- **Do:** charge with turning, release segment truncated at walls and cover, pierce hits with width, armor direction, cancel rules, cooldowns, events.
- **Done when:** AT-ABL-14 to AT-ABL-18 pass.

### T-043 Destructible cover
- **Track:** Sim · **Size:** S · **Depends on:** T-041
- **Spec:** `docs/GAME_RULES.md` §14
- **Do:** destroy on Ram contact, removal from collision and line of sight, rebuild timer with overlap check, match-start rebuild, events.
- **Done when:** AT-ABL-10 and AT-MATCH-09 pass.

### T-044 Scoring, ranking, stats and Frenzy mode rules
- **Track:** Sim · **Size:** M · **Depends on:** T-017
- **Spec:** `docs/GAME_RULES.md` §12; `docs/ARCHITECTURE.md` §4.7
- **Do:** `ModeRules` interface and Frenzy implementation, ranking with tie-breakers, every per-match stat in GR-12.4 (including shots and hits by `aimSource`), `matchEnd` event.
- **Done when:** AT-MATCH-04, AT-MATCH-05, AT-MATCH-06 pass.

### T-045 Ten-minute match, fresh loadout and kill unlocks
- **Track:** Sim · **Size:** M · **Depends on:** T-017
- **Spec:** `docs/GAME_RULES.md` GR-2.2, GR-2.4, GR-2.6, GR-2.7a, GR-5.2, §18; D-073, D-074; `docs/CHANGE_CONTRACT.md`
- **Do:** 600 s PLAYING; `unlocked` state and fresh loadout at match start, late join and bot replacement; KO-credited unlocks in step 9 with `formUnlocked`; `locked` morph denial; retained progress through death; seat handoff copies; audit three-minute assumptions in code, tests and docs.
- **Done when:** AT-MATCH-01, AT-MATCH-02, the unlock and progress parts of AT-LOAD-01, AT-LOAD-03 to AT-LOAD-07 and the KO part of AT-MATCH-10 pass. AT-LOAD-01's gun and dagger checks complete in T-046 and AT-LOAD-02 in T-048.
- **2026-10-23 evidence:** `unlocked` per player with fresh resets at match start, late join and bot replacement; step 9 KO credit unlocks Beast at 3 and Turret at 6 once each with `formUnlocked`; `locked` morph denial after the phase check, in sim and `predictStep`; 600 s PLAYING. Protocol 5 carries `unlockedMask`, events 31 to 40 and denial reason 4; the client validates the mask before replay. A `/unlock` dev command (cheats only) keeps live morph checks possible. New `progression.test.ts` (9 tests) plus AT-LOAD-07 assertions in the real-room seat and reconnect tests pass. Existing morph-rule tests opt into unlocked forms through `makeTestWorld({ unlockAllForms: true })`; their assertions are unchanged. Full suite 621/621, typecheck and lint pass. Live e2e scripts that morph (AT-NET-07) must send `/unlock` first; that is recorded for T-057 and T-068.

### T-046 Gun state, ammunition, reloads, swap and dagger
- **Track:** Sim · **Size:** L · **Depends on:** T-045, T-016
- **Spec:** GR-7.2 to GR-7.20, GR-7.30 to GR-7.32, GR-11.3, GR-11.6, GR-18.4; D-076; BALANCE §4
- **Do:** per-gun ownership, magazines, reserves and timers; selection and swap; timed reloads with cancellation; dagger strikes; fire fallback; retained ammunition on death; `predictStep` parity for every predictable field.
- **Done when:** AT-AMMO-01 to AT-AMMO-07, AT-WPN-16, AT-MELEE-01 to AT-MELEE-03 and AT-LOAD-01's gun and dagger checks pass with the existing weapon tests.
- **2026-10-23 evidence:** Per-gun ownership, magazine, reserve and timers replace the per-form timers; `selectedTier`, `reload`, `swapReadyTick` and `melee` join `PlayerRecord`, `LocalPredictState`, snapshots, the Schema mirror and client restoration (protocol 5 arrays in `GUN_IDS` order). One shared `advanceWeaponState` orders reload completion, swap, dagger, reload start, heat and fire, and automatic reload for both server and `predictStep`. Dagger strikes use a truncated capsule with a line-of-sight check on the target's nearest point, so the strike's width never reaches through a wall (GR-7.31 updated). Morph, ability, swap, dagger, death and match end cancel reloads without moving ammunition; respawn keeps every gun's exact counts (D-076). Input bits 8 to 11 (reload, sprint, swap, dagger) are valid; 12 to 15 are rejected. New `loadout.test.ts` (12 tests). The 1,000-sequence equivalence sweep now includes reload, swap and dagger edges and four loadouts, and every predictable field matches on every tick. AT-WPN-01 is redefined for magazines (D-076) with the exact GR-7.2 cadence; existing firing tests opt into `armAllGuns`. 633 tests, typecheck, lint, build and size (233,969 gzipped bytes) pass. Observed once in four full runs: `clientConnection.test.ts` real-socket join timed out under suite load; it passes alone (3/3) and in the other full runs. Stun cancellation of reloads and strikes lands with the first stun source in T-041.

### T-047 Tier 2 guns: Ricochet Disc, Slug Cannon, Arc Mortar
- **Track:** Sim · **Size:** M · **Depends on:** T-046
- **Spec:** GR-7.1, GR-7.21 to GR-7.29; BALANCE §4, §9.5; D-077
- **Do:** deterministic disc bounce with corner rule, Slug projectile, mortar landing point, flight and blast with line of sight; events; benchmark test from `BALANCE`.
- **Done when:** AT-WPN-17 to AT-WPN-22 pass.
- **2026-10-23 progress (paused):** Implemented but not yet covered by its own tests: `segmentBoxContact` (entry face normal, corner tie, receding t = 0 ignored), disc bounce with `bounceDamageMult` and `projectileBounce`, `mortarLandingPoint` (clamp, playable clamp, 0.1 m nudge), shells that land after 30 ticks with no collision and no spawn advance, and a `mortarBlast` with edge falloff, a line-of-sight check, owner and protection exclusion, and incoming direction toward the blast. `PlayerRecord.aimDistM` exists (default 12 m) but is not yet set from input; T-049 wires it. Workspace gates are green (633 tests). Next: write AT-WPN-17 to AT-WPN-22, then T-048.

- **Codex verification 2026-10-23:** AT-WPN-17 to AT-WPN-22: 14 dedicated tests pass. Fixed a reproduced floating-point exclusion at the exact mortar blast edge. Sim source typecheck passes. Full suite with localhost permission: 647/647 pass; no retries. OQ-024 defaults now approved (D-083). Live client verification remains in T-057.

### T-048 Random loot and automatic pickup
- **Track:** Sim · **Size:** M · **Depends on:** T-046
- **Spec:** GR-19, GR-18.3; D-075; BALANCE §4a
- **Do:** map-agnostic candidate grid, separate `lootRng`, match-start placement, claims, duplicates, caps, replenishment, events.
- **Done when:** AT-LOOT-01 to AT-LOOT-05 and AT-LOAD-02 pass.

- **Codex verification 2026-10-23:** Seven dedicated loot tests pass; full sim suite 267/267 before T-049 integration. Seeded placements, automatic claims, duplicate reserve caps, locked-form storage, exact replenishment timing and replay are covered. Existing event assertions include initial loot spawns; D-068 conditional prediction fixture excludes exogenous pickups.

### T-049 Sprint, aim distance and facing-relative encoding
- **Track:** Sim and shared · **Size:** S · **Depends on:** T-040
- **Spec:** GR-4.16 to GR-4.19; D-078; BALANCE §2
- **Do:** sprint eligibility and speed, `aimDistM` from input, shared `encodeFacingMove`, keyboard turn and aim-distance integrators for the client, `predictStep` parity.
- **Done when:** AT-MOV-09 to AT-MOV-11, AT-CTRL-04 and AT-CTRL-12 pass.

### T-050 Bot navigation grid and pathfinding
- **Track:** Bots · **Size:** M · **Depends on:** T-011
- **Spec:** `docs/BOT_SPEC.md` §4; `docs/MAP_SPEC.md` §12
- **Do:** `navgrid.ts` (two radii), A* with octile heuristic, string-pulling, path cache, per-room search budget.
- **Done when:** AT-BOT-01 passes.

### T-051 Bot controller framework
- **Track:** Bots · **Size:** M · **Depends on:** T-050, T-024
- **Spec:** `docs/BOT_SPEC.md` §1 to §4
- **Do:** `BotController` with decide (5 Hz, staggered) and input (every tick), per-bot RNG, perception with memory and reaction delay, steering, separation, stuck handling; plug into seats replacing the placeholder input.
- **Done when:** bots roam the map without getting stuck for 10 minutes in a bot-only room (part of AT-BOT-02).

### T-052 Bot combat
- **Track:** Bots · **Size:** L · **Depends on:** T-051, T-016
- **Spec:** `docs/BOT_SPEC.md` §5 (Fight, target score), §6
- **Do:** target scoring with hysteresis and leader bonus, aim (delayed positions, lead, error re-roll, turn rate), fire discipline including Beast range and Turret heat, combat movement per form pair.
- **Done when:** AT-BOT-04 and AT-BOT-05 pass.

### T-053 Bot morph and ability policies
- **Track:** Bots · **Size:** M · **Depends on:** T-052, T-041, T-042
- **Spec:** `docs/BOT_SPEC.md` §7, §8
- **Do:** morph rules table with counter chance and hysteresis; Dash, Ram and Rail Shot usage rules with use chance.
- **Done when:** AT-BOT-03 passes.

### T-054 Bot goals, difficulty tiers, names
- **Track:** Bots · **Size:** M · **Depends on:** T-053, T-018
- **Spec:** `docs/BOT_SPEC.md` §5, §9.4, §10
- **Do:** Retreat, Collect Flux, Roam goals and selection; tier parameters from balance; room difficulty; names.
- **Done when:** AT-BOT-02, AT-BOT-06, AT-BOT-08 pass.

### T-055 Proxy control integration
- **Track:** Bots, Server · **Size:** S · **Depends on:** T-054, T-026
- **Spec:** `docs/BOT_SPEC.md` §9.3; `docs/NETWORK_PROTOCOL.md` §9
- **Do:** proxy controllers for hidden, AFK and dropped humans; immediate hand-back; proxy seats excluded from replacement.
- **Done when:** AT-BOT-07 passes.

### T-056 Determinism and property suites
- **Track:** Sim, Tools · **Size:** M · **Depends on:** T-054, T-044
- **Spec:** `docs/ARCHITECTURE.md` §10
- **Do:** `pnpm sim:determinism` (seeded bot-only matches run twice, hash compare; short version in CI, long in nightly), property invariants, event recount checks.
- **Done when:** AT-DET-04, AT-DET-05, AT-DET-07, AT-FLUX-10, AT-DMG-07 pass.

### T-057 Protocol v5 for the release state
- **Track:** Network · **Size:** L · **Depends on:** T-045 to T-049
- **Spec:** `docs/CHANGE_CONTRACT.md` §7; `docs/NETWORK_PROTOCOL.md`; D-071, D-072
- **Do:** input frame with `aimDist` and new buttons, PlayerState and loot schema mirror, new events and client validation, replay and hash coverage, authoritative restoration and extended conditional equivalence tests, protocol version 5.
- **Done when:** AT-NET-01, AT-NET-20, AT-NET-21, AT-DET-03 pass and AT-NET-09 still passes against a real server.

### T-058 Client integration of the release gameplay
- **Track:** Client (Codex) · **Size:** L (split before starting) · **Depends on:** T-057, T-037
- **Spec:** `docs/CHANGE_CONTRACT.md` §4, §8, §12; `docs/CONTROLS_UI.md`; D-078 to D-081
- **Do:** pointer lock and facing-relative controls, sprint, R, Q, V, C bindings, loot, ammunition, reload, swap, dagger, disc and mortar views, unlock feedback, menu input neutrality, art and audio integration.
- **Done when:** AT-CTRL-04 to AT-CTRL-13 wiring and the relevant AT-UI checks pass in the real client against a real server; Claude's cross-review in `docs/CHANGE_CONTRACT.md` §12 is recorded.

### T-060 HUD core
- **Track:** Client · **Size:** M · **Depends on:** T-035
- **Spec:** `docs/CONTROLS_UI.md` §4, §5
- **Do:** health bar with display rounding, Flux bar with notches and gain or spend effects, form buttons with costs, cooldown ring, morph progress, greying and denial shake, ability button with per-form cooldown, Rail heat bar and overheated state, low-health pulse.
- **Done when:** AT-UI-02 (these elements) and AT-UI-03 pass.

### T-061 HUD match info
- **Track:** Client · **Size:** M · **Depends on:** T-036, T-044
- **Spec:** `docs/CONTROLS_UI.md` §5
- **Do:** timer and countdown, mode and rank and score, kill feed, Tab scoreboard, network indicator.
- **Done when:** AT-UI-02 (these elements) passes.

### T-062 Combat feedback
- **Track:** Client · **Size:** M · **Depends on:** T-037
- **Spec:** `docs/CONTROLS_UI.md` §3.1, §5
- **Do:** world-space damage numbers with EFFECTIVE, RESISTED and ARMOR labels, hit markers (bigger on KO), damage-taken wedge, reticle states, screen shake rules.
- **Done when:** AT-UI-04 passes.

### T-063 Minimap
- **Track:** Client · **Size:** S · **Depends on:** T-036
- **Spec:** `docs/CONTROLS_UI.md` §5.1
- **Do:** static map layer, local player, on-screen enemies, every deployed Turret, clusters (zone layer comes in T-111).
- **Done when:** AT-UI-07 passes (except the zone parts).

### T-064 Respawn overlay, results screen, next match flow
- **Track:** Client · **Size:** M · **Depends on:** T-061
- **Spec:** `docs/CONTROLS_UI.md` §6.7, §6.8
- **Do:** respawn countdown overlay (recap details come in T-123), results ranking with bot icons and highlight, "next match in" countdown, waiting overlay for late joiners.
- **Done when:** AT-UI-08 passes.

### T-065 Controls card and in-match menu
- **Track:** Client · **Size:** S · **Depends on:** T-034, T-030
- **Spec:** `docs/CONTROLS_UI.md` §6.3, §6.5
- **Do:** controls card shown in the first COUNTDOWN of a session; menu with Resume, Settings (basic), Controls, Room code and copy link, Leave.
- **Done when:** AT-UI-14 passes.

### T-066 Toasts
- **Track:** Client · **Size:** S · **Depends on:** T-060
- **Spec:** `docs/CONTROLS_UI.md` §4, §5
- **Do:** toast component; morph denial reasons, ability cooldown, notices, AFK warning, reconnecting banner.
- **Done when:** each toast shows on its trigger.

### T-067 Analyze v0 for the Fun Gate
- **Track:** Tools · **Size:** M · **Depends on:** T-028
- **Spec:** `docs/PLAYTEST_PLAN.md` §5 (H1, H3, H11 only)
- **Do:** `tools/analyze` reading a folder of match logs, computing H1, H3 and H11 for humans only with sample sizes, writing `report.md`.
- **Done when:** AT-TEL-03 passes for these three metrics on logs from a test session.

### T-068 Stage A integration pass and E2E smoke
- **Track:** All · **Size:** M · **Depends on:** T-060 to T-067, T-055, T-056
- **Spec:** `docs/PROTOTYPE_SCOPE.md` §3.1; `docs/ACCEPTANCE_TESTS.md` §22 (Stage A items)
- **Do:** Playwright smoke test (load, name, Play, HUD, move, morph, results) in CI; play full local matches with 2 to 4 people plus bots; file and fix blocker bugs. Complete any remaining full AT-NET-17 verification at `?lag=150&loss=2` (D-066).
- **Done when:** every Stage A feature A1 to A27 has passing tests; AT-E2E-01 to AT-E2E-06 pass locally; full AT-NET-17 passes before the Fun Gate (D-066).
- **AT-NET-17 handoff (2026-10-21):** At the exact `?lag=150&loss=2` URL, the live shell joined the real server, rendered advancing ticks, switched views, accepted pointer and keyboard input, and showed no browser errors. Authoritative movement also advanced in a separate live browser check. Full match playability remains unverified and must be checked here before the Fun Gate.

### T-069 Minimal deployment for internal sessions
- **Track:** Ops · **Size:** S · **Depends on:** T-068
- **Spec:** `docs/ARCHITECTURE.md` §12 (basic subset)
- **Do:** Dockerfile, Docker Compose with Caddy on the playtest VPS (or a temporary VPS), HTTPS and WSS, `DEV_CHEATS=0`, logs volume.
- **Done when:** the team can play the deployed Stage A build remotely.

### T-100 Fun Gate
- **Track:** Design · **Size:** M · **Depends on:** T-069
- **Spec:** `docs/PROTOTYPE_SCOPE.md` §5.1; `docs/PLAYTEST_PLAN.md` §3.1
- **Do:** run the three R0 sessions; run `pnpm analyze`; write `docs/reports/FUN_GATE.md` with H1, H3, H11, the triangle answers and blocker status; present to Hamza.
- **Done when:** Hamza records the Fun Gate result in `DECISIONS.md` (pass, or the changes to make before re-running).

---

## Stage B: Playtest Build

### T-110 Zone Frenzy simulation (parallel-ok)
- **Track:** Sim · **Size:** M · **Depends on:** T-044
- **Spec:** `docs/GAME_RULES.md` §13; D-017, D-023
- **Do:** Zone Frenzy `ModeRules`: schedule, preview choice, presence, contest, Turret half rate, KO points, events and stats (zone time alone and contested); schema `ZoneState` mirroring.
- **Done when:** AT-ZONE-01 to AT-ZONE-07 pass.

### T-111 Zone presentation
- **Track:** Client · **Size:** M · **Depends on:** T-110, T-063
- **Spec:** `docs/CONTROLS_UI.md` §5, §8, §9
- **Do:** zone ring with held and contested looks, preview ring, floor marks, off-screen zone arrow with state and distance, points in the HUD, minimap zone layer, "zone moves" toast and sounds.
- **Done when:** AT-E2E-07 visual parts pass.

### T-112 Bot zone behavior
- **Track:** Bots · **Size:** S · **Depends on:** T-110, T-054
- **Spec:** `docs/BOT_SPEC.md` §5 (Contest zone, Hold zone), §7 (rule 5)
- **Do:** zone goals and the Beast preference while holding.
- **Done when:** AT-ZONE-08 passes.

### T-113 Quick-play mode config and host settings panel
- **Track:** Server, Client · **Size:** S · **Depends on:** T-110, T-025, T-065
- **Spec:** `docs/GAME_RULES.md` GR-2.9; `docs/CONTROLS_UI.md` §6.6; `docs/ARCHITECTURE.md` §5.5
- **Do:** `QUICKPLAY_MODE` (`frenzy`, `zoneFrenzy`, `alternate`); host settings panel in the menu; `notice` to all on change.
- **Done when:** AT-MATCH-08 passes end to end through the UI.

### T-120 Keyboard turn model, aim distance and scheme detection (parallel-ok)
- **Track:** Client (Claude numerics, Codex wiring) · **Size:** S · **Depends on:** T-034, T-049
- **Spec:** `docs/CONTROLS_UI.md` §2.2, §2.4, §3.2; BALANCE §9.6; D-078
- **Do:** wire the shared keyboard turn and aim-distance integrators, scheme detection, `aimSource`, glyph switching across HUD and cards. Supersedes the earlier 8-direction arrow aim.
- **Done when:** AT-CTRL-04 and AT-CTRL-08 pass.

### T-121 Fragile aim assist (parallel-ok)
- **Track:** Client (Claude numerics, Codex wiring) · **Size:** M · **Depends on:** T-120, T-036
- **Spec:** `docs/CONTROLS_UI.md` §3.3, §3.4; D-037, D-079
- **Do:** shared assist state machine (acquire on fire, raw-aim retention, capped offset, break and reacquire delay) and its client wiring and feedback. Supersedes soft lock-on, Q lock, cycling and lead.
- **Done when:** AT-CTRL-05, AT-CTRL-06, AT-CTRL-07 pass.

### T-122 Settings screen complete
- **Track:** Client · **Size:** S · **Depends on:** T-121, T-039
- **Spec:** `docs/CONTROLS_UI.md` §6.4
- **Do:** every setting in the table wired to its system.
- **Done when:** each setting changes behavior immediately and persists (AT-UI-10).

### T-123 Death recap with counter hint
- **Track:** Client · **Size:** S · **Depends on:** T-064
- **Spec:** `docs/CONTROLS_UI.md` §5.2; `docs/GAME_RULES.md` GR-11.8; D-024
- **Do:** recap card from the `death` event, counter form with key glyph.
- **Done when:** AT-UI-05 passes.

### T-124 Threat arrows and Rail Shot warning
- **Track:** Client · **Size:** S · **Depends on:** T-042, T-036
- **Spec:** `docs/CONTROLS_UI.md` §5
- **Do:** edge arrows for recent off-screen attackers; RAIL warning from the latest Turret aim and charge state when the line covers the local player.
- **Done when:** AT-UI-06 passes.

### T-125 Keyboard-only pass for all screens
- **Track:** Client · **Size:** S · **Depends on:** T-122
- **Spec:** `docs/CONTROLS_UI.md` §2.2, §6, §10
- **Do:** focus order and visible focus on every screen; Esc back; Enter or Space confirm; no mouse-only control anywhere.
- **Done when:** AT-CTRL-10 passes.

### T-126 Readability pass at 821 x 462
- **Track:** Client · **Size:** S · **Depends on:** T-125
- **Spec:** `docs/CONTROLS_UI.md` §5, §10
- **Do:** scaling rules and minimum text sizes; fix overlaps.
- **Done when:** AT-UI-11 passes.

### T-130 Full telemetry (parallel-ok)
- **Track:** Server, Client · **Size:** M · **Depends on:** T-028
- **Spec:** `docs/ARCHITECTURE.md` §9
- **Do:** every match log type in §9.2 (including `room_error`, shot sampling, `aimSource` on damage), `clientStats` with errors from the client every 30 s, session tracking and consecutive match counts, tester code, `testerTag`.
- **Done when:** AT-TEL-01, AT-TEL-04, AT-TEL-05 pass.

### T-131 Analyze tool complete (parallel-ok)
- **Track:** Tools · **Size:** M · **Depends on:** T-130, T-067
- **Spec:** `docs/PLAYTEST_PLAN.md` §5
- **Do:** every telemetry metric for H1 to H4, H7, H8 (second-match rate), H9, H11, H12, H14; informational metrics; CSV outputs; sample size flags; grouping by `testerTag` and `balanceVersion`; survey CSV join by tester code for H5, H6, H10, H13.
- **Done when:** AT-TEL-03 passes in full.

### T-132 Survey prompt and tester code
- **Track:** Client · **Size:** S · **Depends on:** T-130, T-064
- **Spec:** `docs/CONTROLS_UI.md` §6.8; `docs/PLAYTEST_PLAN.md` §6
- **Do:** prompt after the third completed match of a session, survey link with tester code pre-fill from `VITE_SURVEY_URL` and `VITE_SURVEY_CODE_FIELD`, tester code in the menu.
- **Done when:** AT-UI-09 passes.

### T-133 Dummy mode and fairness tooling
- **Track:** Bots, Tools · **Size:** S · **Depends on:** T-054, T-121
- **Spec:** `docs/BOT_SPEC.md` §11; `docs/PLAYTEST_PLAN.md` §4.4
- **Do:** `/dummies on [speed]` and `off`; analyze output for hit rate by `aimSource` and weapon for a fairness session.
- **Done when:** AT-BOT-09 passes; a team fairness run produces a hit-rate table.

### T-140 Deployment hardening (parallel-ok)
- **Track:** Ops · **Size:** M · **Depends on:** T-069
- **Spec:** `docs/ARCHITECTURE.md` §12
- **Do:** image build on `proto-*` tags to GHCR, SSH deploy script, `/healthz`, external uptime check, rollback procedure written in `docs/ops/DEPLOY.md`, log retention (input logs 30 days, operational logs 14 days), cheats off.
- **Done when:** AT-DEP-01 to AT-DEP-04 pass.

### T-141 Load and soak test (parallel-ok)
- **Track:** Tools, Ops · **Size:** M · **Depends on:** T-056
- **Spec:** `docs/ARCHITECTURE.md` §10, §13
- **Do:** `pnpm loadtest` (bot-only rooms, duration, memory and tick reports, byte counters), nightly soak job, a run on the playtest VPS size.
- **Done when:** AT-PERF-01, AT-PERF-02, AT-NET-18 pass.

### T-142 Client performance pass
- **Track:** Client · **Size:** S · **Depends on:** T-111
- **Spec:** `docs/ARCHITECTURE.md` §13
- **Do:** measure and fix draw calls, triangles, heap and FPS on the target laptop and a Chromebook if available; confirm `pnpm check:size`.
- **Done when:** AT-PERF-03, AT-PERF-04 (and AT-PERF-05 if a Chromebook is available), AT-REPO-07 pass.

### T-143 Full prototype checklist on the deployment
- **Track:** All · **Size:** M · **Depends on:** T-110 to T-142
- **Spec:** `docs/ACCEPTANCE_TESTS.md` §22
- **Do:** run AT-E2E-01 to AT-E2E-15 with at least 4 humans; fix blockers; record results in the task completion report.
- **Done when:** all AT-E2E checks pass on the deployed build.

### T-144 Playtest ops kit
- **Track:** Design · **Size:** S · **Depends on:** T-143
- **Spec:** `docs/PLAYTEST_PLAN.md` §4, §6, §9, §10
- **Do:** `docs/playtest/`: facilitator sheet, observation template, consent text, recruitment posts, survey built and tested (pre-fill works), session calendar, code room list with tags.
- **Done when:** a dry run with the team works start to finish.

### T-145 Playtest round R1 and fixes
- **Track:** Design, All · **Size:** L · **Depends on:** T-144
- **Spec:** `docs/PLAYTEST_PLAN.md` §3.2, §7
- **Do:** run R1; analyze; fix blockers and the top three annoyances; at most three balance changes with records; write `docs/reports/R1_SUMMARY.md`.
- **Done when:** the summary exists and the fixes are deployed.

### T-146 Playtest round R2 and fairness protocol
- **Track:** Design · **Size:** L · **Depends on:** T-145
- **Spec:** `docs/PLAYTEST_PLAN.md` §3.3, §4.4
- **Do:** run R2 group sessions, open-link week and the fairness protocol; collect logs and survey export.
- **Done when:** every hypothesis has data, or is marked insufficient with a reason.

### T-150 Approval Gate package
- **Track:** Design · **Size:** M · **Depends on:** T-146
- **Spec:** `docs/PROTOTYPE_SCOPE.md` §8; `docs/PLAYTEST_PLAN.md` §8
- **Do:** `docs/reports/PROTOTYPE_REPORT.md` from the template; attachments (analyze output, survey export, video, build link, known issues); production re-plan using the velocity log; meeting with Hamza.
- **Done when:** Hamza records D-070 (Approve, Iterate or Stop) in `DECISIONS.md`. Agents never record this decision.

---

## Production epics (after approval only)

These are not tasks yet. When D-070 is "Approve", the first production task (E-01) turns each epic into ordered tasks in this file with the same format. Source of detail: `docs/GDD.md` (section numbers in brackets).

| Epic | Contents | GDD |
|---|---|---|
| E-01 Production kickoff | Record the launch mode (H8); re-plan with velocity; break the epics below into tasks; update `docs/PROTOTYPE_SCOPE.md` to a production scope document | §21, §22 |
| E-02 Characters | Volt, Bramble, Nova: full ability and Ultimate specs first (D-016); weapon modifiers within 10% DPS; Overdrive meter (§6.4); character select; character unlock rules (§12.6) | §6.4, §12 |
| E-03 Crates | 6 crate points, 4 launch crate weapons, ammo and timing rules, golden crate later | §7.3, §7.4 |
| E-04 Arena and comeback systems | Bounty and Wanted; arena events Crate Storm, Reactor Surge, Route Closure with nav states and telegraphing; hazards; district system; full Neon Junction map with one raised level and jump pads, built to the map strategy rules | §7.8, §9.4, §10 |
| E-05 First-time experience | Boot Camp; contextual counter hints; easy bots for the first three matches; adaptive bot difficulty | §14.5, App. A |
| E-06 Input and accessibility | Touch controls; morph wheel; key remapping; one-hand preset; colorblind options; enemy highlight color; subtitles; visual sound indicators; pings and preset quick-chat (no free text chat) | §9.3, §14.3, §15, App. C |
| E-07 Progression | Guest identity, Performance Score for MVP and XP, XP with anti-farming, Coins, character tokens, earned cosmetics v1, daily challenges, main menu, persistence in Supabase | §9.1, §13, §14.1 |
| E-08 Art and audio | Style lock; commissioned riders and shells (shell swap); environment kit; VFX; UI kit; sound packs; music streaming; asset budgets with a 15 MB CI check | §16, §17 |
| E-09 CrazyGames integration | SDK events, accounts and usernames, private rooms, room status and invite links, instant multiplayer, ads per rules and the phased monetization plan (no ads in Basic Launch); QA and Preview tools; Basic Launch submission | §11.7, §19.4, §19.5, App. B |
| E-10 Scale and safety | Three regions with ping selection; Redis presence; interest management (`StateView`); anti-cheat rules; load test at twice expected peak; Sentry error monitoring; remote config with feature flags (every new feature ships behind a flag); production telemetry events; cost model check; incident runbook; report button, name filter, input replays for moderation, data minimization, legal review before accounts or purchases on the own site | §18, App. C, App. D |
| E-11 Launch gate (M4) | Crash-free 99%; click to gameplay under 10 s; clean QA run; balance pass from data; success metrics tracked | §21.5, §24 |
| E-12 v1.1 | Reactor War with team bots; Mira (after interest management); Rook; controller support; Full Launch ads | §11.2, §12, §21.6 |
| E-13 Live operations and later modes | Seasons of 10 to 12 weeks, events, retention systems, all shipped through remote config; cosmetic purchases and the battle pass only when the §19.5 conditions hold; King of the Morph (v1.2); Last Engine (later) | §11.3, §11.5, §19, §20 |

---

## Velocity log

Add one line per finished task. Used to re-estimate at the Fun Gate and the Approval Gate.

| Task | Size | Hours actual | Finished | Notes |
|---|---|---|---|---|
| T-001 | M | Not tracked | 2026-10-16 | Pinned workspace, lint fixture tests and clean frozen install. TypeScript pinned to newest release compatible with typescript-eslint. |
| T-002 | S | Not tracked | 2026-10-19 | Main CI and nightly skeleton, client gzip size gate, canonical instructions check. Local checks passed; first hosted CI run awaits a push. |
| T-003 | M | Not tracked | 2026-10-19 | Copied balance values, derived ticks and rates, canonical balance hash, string constants and focused acceptance tests. |
| T-004 | S | Not tracked | 2026-10-19 | Typed map definitions, exact greybox_v1 data, test_open fixture and AT-MAP-02 coverage. |
| T-005 | M | Not tracked | 2026-10-20 | V1–V9 validator, deterministic metrics and ASCII render, CLI failure handling and CI integration. |
| T-006 | M | Not tracked | 2026-10-20 | Protocol constants, input codec and validation, event tuple types, and AT-NET-01 tests. |
| T-007 | S | Not tracked | 2026-10-20 | Validated environment configuration, local server, Vite proxy, and one-command watch runner. |
| T-010 | M | Not tracked | 2026-10-20 | Plain world state, seeded sfc32 helpers, internal events, ordered empty tick systems, and canonical state hash. |
| T-011 | M | Not tracked | 2026-10-20 | Pure geometry and raycast, serializable 4 m wall grid, ordered cover state, indexed circle queries, and line of sight. |
| T-012 | M | Not tracked | 2026-10-20 | Fixed seats and player state, exact phase transitions, pending mode, seeded match spawns, spawn selection, and phase permissions. |
| T-013 | M | Not tracked | 2026-10-20 | Deterministic input movement, acceleration, collision sliding, bounds clamping, and form-specific aim. |
| T-014 | M | Not tracked | 2026-10-20 | Balance-backed form stats, morph input edges, ordered validation and events, exact completion and cooldown, match/death/respawn seams. Simultaneous target priority remains OQ-014. |
| T-015 | M | Not tracked | 2026-10-20 | Pure matchup and front-arc damage, health and death threshold, immunity, assist-window log, internal damage events, and shared display formulas. Corrected stale GR-6.2 armor wording per D-013. |
| T-016 | L | Not tracked | 2026-10-20 | Per-form firing and heat, deterministic projectile pool, swept walls/cover/players, scatter and Rail damage rules, spawn advance and typed events. AT-WPN-13 KO credit remains T-017; shot-index contract is OQ-015. |
| T-017 | M | Not tracked | 2026-10-20 | Ordered death credit and assists, attack-time recap, exact respawn and seeded spawn selection, centralized protection. Completed the AT-WPN-13 KO-credit portion deferred from T-016. Flux rewards and drops remain T-018. |
| T-018 | M | Not tracked | 2026-10-20 | Capped Flux regeneration/rewards/pickups, deterministic cluster lifecycle and death drops, exact expiry and precomputed respawn Flux. Exposed approved GR-10.9 nudge key in balance proto-2 without tuning existing values. |
| T-019 | S | Not tracked | 2026-10-20 | Runner Dash with exact six-tick motion and end-based cooldown, wall/cover sliding, ability events and interruption seam. Completed Dash portions of AT-ABL-19/20 and T-014's deferred real ability/morph interaction. Ram Charge and Rail Shot remain later tasks. |
| T-020 | M | Not tracked | 2026-10-20 | Pinned Colyseus helper spike with real local sockets, seeded 61-second latency matrix, input and prediction probes, and approved D-061 mixed implementation path. The 2% head-of-line quality failure remains a production validation risk. |
| T-021 | L | Not tracked | 2026-10-20 | Base ArenaRoom with crypto room seed, complete §4.2 Schema projection, identity-preserving mirror, custom fixed 30 Hz loop with three-step catch-up cap, 20 Hz patching, tick metrics, and real client integration. Input and seat policy remain later tasks. |
| T-022 | M | Not tracked | 2026-10-20 | Validated numeric input packets, per-seat sequence queues, redundant recovery, two-frame edge union, rolling rate/abuse limits, 4003 kick, 4 KiB WebSocket cap, and room/sim integration. OQ-014 and OQ-015 remain open. |
| T-023 | S | Not tracked | 2026-10-20 | Static auth, safe names, authoritative welcome, and ordered event batches. Approved transport exception: pinned SDK reports HTTP 400 for a mismatch; the JSON body carries code 4000. Seat allocation remains T-024. |
| T-024 | M | Not tracked | 2026-10-20 | Eight idle placeholder bots enter one seeded match start; neutral bot frames, damage-tick replacement choice, same-tick human joins, sorted projectile expiry, and final human-to-bot life handoff. Matchmaking and reconnect policy remain later tasks. |
| T-025 | M | Not tracked | 2026-10-20 | Exact room codes, fullest eligible quick-play matching, code-room fullness and host handover, approved D-063 difficulty codes, pending settings and bot-fill reconciliation, late waiting and quick-play cutoff lock. T-026 owns reconnect, proxy, AFK, disposal and shutdown. |
| T-026 | M | Not tracked | 2026-10-20 | Retained human sessions and input sequences across 30-second reconnects; visibility and tick-based AFK proxy handoff; final leave, host handover, room disposal, and graceful shutdown with notice, RESULTS wait cap, and 4004 close. Proxy input stays neutral until T-055. |
| T-027 | S | Not tracked | 2026-10-20 | Private monotonic pong anchors and tick-scheduled probes; identity-owned bounded median RTT; measured GR-7.9 spawn advance through ArenaRoom. Production client clock sync remains T-031. |
| T-028 | M | Not tracked | 2026-10-21 | Stage A match JSONL, gzipped authoritative input log, lifecycle checkpoints, match rotation and shutdown flush; replay CLI verifies every tick and final or unfinished-prefix hash. Ranking, analysis and full telemetry remain T-044, T-067 and T-130. |
| T-029 | S | Not tracked | 2026-10-21 | Trusted DEV_CHEATS gate, strict private dev commands at the next tick, administrative player and room mutations, and replayable command checkpoints. Browser console remains T-038 and deployment validation remains AT-DEP-04. |
| T-030 | M | Not tracked | 2026-10-21 | Plain-TS Landing and connection-state screens, safe names and room intents, WebGL 2 gate, versioned local settings, and responsive greybox UI. AT-UI-01/10 pass without a server. Networking is T-031, rendering T-032, full controls card/menu T-065, and settings integration T-122. |
| T-032 | L | Not tracked | 2026-10-21 | Shared-data greybox map and one disposable Three renderer; 50°/35° north-up camera calibrated to 20.25 m ground depth, form zoom, lead and occlusion. Static AT-MAP-04/AT-UI-13 and two-size browser inspection pass. T-033 adds entities/effects; T-034 adds live aim/cursor input. |
| T-032 camera revision | S | Not tracked | 2026-10-21 | User-requested TPP/FPP views replace the fixed north-up presentation. TPP is the saved default with a neutral local body; V/button switches views. TPP camera collision, FPP eye pose and opaque walls, form zoom, settings persistence and browser screenshots pass. |
| T-033 | M | Not tracked | 2026-10-21 | ID-keyed form silhouettes and safe names, morph/protection/status/ability effects, instanced shards, clusters and authoritative rubble; scripted live-sim and future-producer fixtures. Client/browser checks pass; 8-player fixture uses 95 draw calls and 2,990 triangles. |
| T-034 | M | Not tracked | 2026-10-21 | Documented bindings, 30 Hz input sampling and redundancy, TPP ground-ray aim, FPP interim no-mouse-aim behavior (D-065), browser input rules and fire modes. D-064 ambiguous morph edges verified for all combinations and recovery. AT-CTRL-01/02/03/09/11, AT-MORPH-13, full unit suite and live real-server movement checks pass. |
| T-031 | M | Not tracked | 2026-10-21 | Production Colyseus connection, Welcome and Schema validation, clock and probes, reconnection and FIFO netsim verified with the real server. AT-NET-19 passed within two true ticks at 150 ms plus jitter. Live browser checks passed normally and at `?lag=150&loss=2` with no console errors. D-066 stages signoff; full AT-NET-17 playability remains a mandatory T-068 check. |
| T-040 | M | Not tracked | 2026-10-21 | Shared local prediction with explicit tick/phase/cover and separate authoritative Flux, 1,000 seeded 48-tick exact conditional equivalence sequences, targeted boundaries and D-069 shot allocation. D-067 assigns browser reconciliation to T-035; OQ-021 remains its live-patch restoration gap. All required shared/sim/server/replay and workspace checks pass. |
| T-035 | L | Not tracked | 2026-10-21 | D-071 protocol v2 full restoration, project-sequence replay, local visual correction and lifecycle resets. Production 150 ms RTT AT-NET-06 first-frame display pass and 60.756 s AT-NET-07 run with one Dash, two morphs and zero qualifying corrections; 0/100/200 ms and loss/jitter smoke passed. Full unit and required workspace checks passed. |
| T-036 | M | Not tracked | 2026-10-21 | Tick-keyed remote interpolation, 100 ms extrapolation cap, stable seat attribution and one delayed event timeline with immediate local feedback. Two-client AT-NET-08 passed in all five required network conditions with moving remote players and maximum displayed frame jump 0.599 m. |
| T-037 | M | Not tracked | 2026-10-21 | Exact local shot matching and event-only remote projectiles; D-072 protocol v3 shot-intent identity survives two-frame catch-up without approximate matching. Real-server AT-NET-09 passed 25/25 across required network conditions and repeated loss/jitter runs; full unit, browser and workspace gates passed. |
| T-038 | S | Not tracked | 2026-10-21 | Live F3 diagnostics, F4 collision geometry and server-authorized console; protocol v4 trusted capability and private results. Real cheats-on/off browser checks, 611 unit tests and workspace gates pass. Zone and Rail debug adapters await their gameplay producers. |
| T-045 | M | Not tracked | 2026-10-23 | 600 s matches, fresh Runner-only loadout, KO-credited Beast and Turret unlocks with `formUnlocked`, `locked` denial in sim and prediction, protocol 5 `unlockedMask` and events 31 to 40, `/unlock` dev seam. 621 tests, typecheck and lint pass. |
| T-046 | L | Not tracked | 2026-10-23 | Gun inventory, magazines, reloads, swap, dagger and fire fallback shared by server and `predictStep`; protocol 5 gun arrays and restoration; D-076 retention through death and respawn; 1,000-sequence equivalence with the new actions. 633 tests and workspace gates pass. |

| T-047 | M | Not tracked | 2026-10-23 | Codex: 14 dedicated tier-2 tests, exact-edge mortar fix; 647/647 full suite passes with real localhost sockets. |

| T-048 | M | Not tracked | 2026-10-23 | Codex: deterministic loot, authoritative claims and replenishment, 7 dedicated tests and 267/267 sim checks. |
