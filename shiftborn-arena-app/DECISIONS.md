# DECISIONS.md

> **LLM FILE CONTRACT:** Highest project authority. Read the decision ids named by the active task. Never edit approved text in place, never infer approval and use `OPEN_QUESTIONS.md` for proposals.

Approved design and technical decisions for **Shiftborn Arena**. This file is binding.

- When this file and any other document disagree, **this file wins**, then the order in `AGENTS.md` §3.2 applies.
- Every decision has an ID. Code comments and docs may cite it, for example `// D-012 health fraction`.
- Never edit an approved decision in place. To change one, add a new decision that names what it supersedes, and mark the old one `Superseded by D-xxx`.
- Only Hamza (project owner) approves decisions. A coding agent never adds an `Approved` entry on its own. Agents propose changes in `OPEN_QUESTIONS.md`.
- Status values: `Proposed` (an agent filled a reserved entry from section 5; Hamza approves it only after reviewing the evidence), `Approved`, `Approved (provisional)` (stands until a playtest or spike says otherwise), `Superseded by D-xxx`.

Last updated: 2026-10-23.

---

## 1. Product and scope

### D-001 Working title
- **Decision:** The game's working title is **Shiftborn Arena** (formerly Morph Runners). A trademark, domain and portal name check happens before the production art pass.
- **Why:** "Morph Run" and "Morph-Runner" already exist as game names.
- **Status:** Approved.

### D-002 Prototype first, then an approval gate
- **Decision:** The team builds a **prototype** first (scope in `docs/PROTOTYPE_SCOPE.md`). No production feature starts until Hamza approves the prototype at the **Approval Gate** (`docs/PROTOTYPE_SCOPE.md` §8). The approval is recorded here as a new decision.
- **Why:** Test the core loop (morphing, counter triangle, objective, online feel) before spending on art, portal integration and content.
- **Status:** Approved.

### D-003 Platform and audience (production)
- **Decision:** Production launches on CrazyGames (desktop, Chromebook, mobile web) with the own website second. Audience 13+, PEGI 12 content. The prototype is hosted on our own server for playtests only and is not published on any portal.
- **Status:** Approved.

### D-004 Production launch scope
- **Decision:** One public mode (Frenzy or Zone Frenzy, see D-017), 3 characters (Volt, Bramble, Nova), 1 map (Neon Junction), 3 form weapons, 4 crate weapons, 3 arena events, Boot Camp tutorial, private rooms. Reactor War, Mira, Rook and controller support come in v1.1.
- **Status:** Approved.

### D-005 Renamed terms
- **Decision:** Smash Rush → **Frenzy**. Smashes → **KOs**. Energy → **Flux** (player-facing text may say "energy"). Morph Meter → **Overdrive**. Dominion Score → **Performance Score**, which decides no win condition.
- **Status:** Approved.

### D-006 Removed from the original concept
- **Decision:** These are removed and must not be reintroduced without a new decision: universal Flux costs for traps, shields, weapon upgrades and fast respawn; Flux for "surviving 30 seconds"; the 50% "minor overdrive"; the Railgun crate weapon; the Gravity Shift arena event; the Core Heist mode; Rook's unlimited permanent armor; King of the Morph's survival bonus; paid random rewards of any kind; morph costs of 80 to 100 and 20 to return to Runner; Turret "cannot move while firing" (it cannot move at all while deployed).
- **Status:** Approved.

### D-007 Overdrive Clash
- **Decision:** Cut by default. Not in the prototype, launch or v1.1. Reopen only after launch, and only with a design where execution (timing, aim or positioning) decides the winner. A hidden simultaneous choice is a guess even with past choices shown.
- **Status:** Approved.

---

## 2. Gameplay rules

### D-010 Counter triangle
- **Decision:** Runner beats Turret, Turret beats Beast, Beast beats Runner. Matchup multipliers (attacker row, defender column): Runner→Beast 0.75, Runner→Turret 1.25, Beast→Runner 1.25, Turret→Beast 1.25, all others 1.0. They apply to form weapons and form abilities only. Crate weapons (production) deal neutral damage.
- **Status:** Approved.

### D-011 Flux economy
- **Decision:** Morphing to Beast or Turret costs 35 Flux; returning to Runner is free. Flux cap 100, start 60, passive regeneration 1 per second. On death 40% of carried Flux drops as shards; the player respawns with at least 40.
- **Status:** Approved.

### D-012 Health storage
- **Decision:** Health is stored as a fraction of the current form's max health (a float from 0 to 1). Morphing keeps the fraction exactly. The simulation never rounds health. The HUD shows hit points rounded up, so a living player never shows 0.
- **Why:** Rounding up on each morph let a player gain health by morphing repeatedly.
- **Status:** Approved.

### D-013 Morph timing and state during a morph
- **Decision:** A morph takes 0.5 s. During it the player is still the **old form** for hitbox, max health, matchup class, armor and knockback stat, moves at 50% of the old form's speed (a Turret stays rooted), cannot fire, use abilities or start another morph, is immune to knockback, and takes damage normally. The new form applies at the end of the morph, keeping the health fraction. Flux is spent at the start. The 3 s morph cooldown starts when the morph ends. A morph cannot be cancelled.
- **Status:** Approved (provisional; refined for the prototype on 2026-10-14).

### D-014 Cooldowns across forms
- **Decision:** Each form's ability cooldown keeps running while the player is in another form. Morphing never resets a cooldown. Respawning resets all cooldowns.
- **Status:** Approved.

### D-015 Prototype abilities
- **Decision:** The prototype uses exactly three abilities, one per form, specified in `docs/GAME_RULES.md` §8: Dash (Runner), Ram Charge (Beast), Rail Shot (Turret).
- **Status:** Approved.

### D-016 Ability spec rule
- **Decision:** No character ability or Ultimate is implemented from its theme line. Each one first gets a full spec in the §8 table format of `docs/GAME_RULES.md` (input, targeting, wind-up, movement, damage, range and shape, effects, collisions, interruption, cooldown) and a matching decision here.
- **Status:** Approved.

### D-017 Zone Frenzy test and one public mode
- **Decision:** The prototype includes both Frenzy (most KOs) and Zone Frenzy (KOs plus a moving Surge Zone). Playtests compare them. If Zone Frenzy's second-match rate and fun rating are equal or better, it becomes the launch mode. Production launches with one public mode either way.
- **Why:** Frenzy alone rewards only KOs and cannot test the game's main promise, "kills create opportunities, objectives decide".
- **Status:** Approved.

### D-018 No body collision between players (prototype)
- **Decision:** Players do not block each other's movement. Only abilities (Ram Charge) test player-to-player contact.
- **Why:** Removes the largest source of prediction corrections and stuck players in a crowded 8-player arena.
- **Status:** Approved (provisional; revisit after playtests).

### D-019 No health regeneration (prototype)
- **Decision:** Health does not regenerate during a life in the prototype. See OQ-004.
- **Status:** Approved (provisional).

### D-020 No randomness in combat
- **Decision:** No random spread, random crits or random damage. The Scatter Cannon uses a fixed pellet pattern. Seeded randomness is allowed only for spawn choice tie-breaks, shard cluster placement, zone order, bot behavior and bot names.
- **Status:** Approved.

### D-021 Shards at full Flux
- **Decision:** A player at 100 Flux who touches a shard still collects it and the excess is lost.
- **Why:** Pushes players to spend Flux.
- **Status:** Approved.

### D-022 Excluded from the prototype
- **Decision:** The prototype has no crates or crate weapons, characters or character kits, Ultimates or Overdrive, bounty or Wanted, arena events, hazards, jump pads, grapple anchors, Reactor War, King of the Morph, Boot Camp, accounts or XP, touch or controller controls, CrazyGames SDK, art beyond greybox, music. Full list and where each item returns: `docs/PROTOTYPE_SCOPE.md` §4.
- **Status:** Approved. Partly superseded by D-075 (six guns as loot) and D-081 (art and audio).

### D-023 Zone Frenzy scoring in the prototype
- **Decision:** A KO is worth 5 points. A player alone in the Surge Zone earns 1 point per second (0.5 per second as a Turret). There is no Wanted bonus in the prototype because bounty is excluded (D-022).
- **Status:** Approved (provisional; tuned by playtest).

### D-024 Counter learning in the prototype
- **Decision:** The prototype shows EFFECTIVE and RESISTED tags on hits and a death recap with a counter hint. It does **not** show in-match contextual counter hints.
- **Why:** The playtest measures whether players learn the triangle from combat feedback alone. Production adds contextual hints to Boot Camp and the first three matches.
- **Status:** Approved.

---

## 3. Technical

### D-030 Network-first
- **Decision:** The authoritative server runs every match from the first playable build. There is no single-player code path. Bots fill empty seats on the server.
- **Status:** Approved.

### D-031 Stack
- **Decision:** TypeScript (strict) everywhere, pnpm workspaces monorepo, Vite for the client, Three.js for rendering, Node.js Active LTS for the server, Colyseus for rooms and state sync, Vitest for unit and simulation tests, Playwright for browser smoke tests. Custom 2D collision on the ground plane. No Unity, no Phaser, no general 3D physics engine, no UI framework in the prototype client. Exact versions are pinned in `package.json` at task T-001 and recorded in D-060.
- **Status:** Approved.

### D-032 Shared deterministic simulation
- **Decision:** All gameplay logic lives in `packages/sim`, used by the server (authority) and the client (prediction). The sim runs at a fixed 30 Hz, uses only a seeded RNG, never reads `Date.now()`, `Math.random()`, the DOM, the network or the file system, and never imports from `apps/*`.
- **Status:** Approved.

### D-033 Rates
- **Decision:** Simulation 30 Hz. State patches 20 Hz (every 50 ms). Client input 30 per second, each packet carrying the last 3 inputs for loss recovery. Remote entity interpolation delay 100 ms. Ping every 2 s.
- **Status:** Approved.

### D-034 Projectiles as events
- **Decision:** Projectiles are not part of the synced room state. The server broadcasts a spawn event; clients simulate them for display; only server hit and expire events change anything. The shooter's client shows its own shot instantly and matches it to the server event by input sequence and shot index.
- **Status:** Approved.

### D-035 Colyseus netcode helpers
- **Decision:** Recent Colyseus versions include netcode helpers (`setFixedTimestep`, `defineInput`, client `Predict` with `reconciler` and `spawns`, `allowRewindState`, `onDrop` and `onReconnect`). Spike task T-020 checks them against `docs/NETWORK_PROTOCOL.md`. If they meet every requirement there, use them; otherwise implement the protocol by hand. The result is recorded as D-061.
- **Status:** Approved.

### D-036 Server authority
- **Decision:** The server is authoritative. Clients run the shared simulation only to predict their own movement and effects. Clients never decide accepted outcomes: hits, damage, deaths, Flux, scores or match results. Clients send inputs only.
- **Status:** Approved.

### D-037 Lock-on runs on the client
- **Decision:** Keyboard lock-on is an input assist computed on the client. It produces an aim angle like any other aim source. The server sees only aim angles, enforces the Turret turn cap through the simulation, and records the aim source for telemetry.
- **Status:** Approved.

### D-038 Instant bot replacement
- **Decision:** When a human joins a room with no free seat, one bot leaves immediately with a warp-out effect (not a death, no KO credit, no Flux drop). The server picks a bot that has been out of combat for 3 s if one exists, otherwise the lowest-scoring bot. Play to spawn stays under 3 seconds.
- **Status:** Approved.

### D-039 No interest management in the prototype
- **Decision:** The prototype syncs the full room state to every client. Production adds per-client filtering (Colyseus `StateView` or equivalent) before any invisibility mechanic ships.
- **Status:** Approved.

### D-040 Client UI
- **Decision:** HUD and menus are DOM elements over the canvas, written in plain TypeScript and CSS. No React or other UI framework in the prototype.
- **Status:** Approved.

### D-041 Telemetry
- **Decision:** The server writes one JSON Lines log per match (`docs/ARCHITECTURE.md` §9). A script in `tools/analyze` computes the prototype metrics. No third-party analytics in the prototype.
- **Status:** Approved.

### D-042 Prototype hosting
- **Decision:** One VPS running Docker, with Caddy for HTTPS and WSS. The client is served as static files from the same host. One region, chosen in OQ-002.
- **Status:** Approved (region open).

### D-043 Playtest rooms
- **Decision:** Testers join the same room through a room code in the URL (`?room=CODE`). The first human in a code room is the host and can set mode, bot count and bot difficulty from the in-match menu.
- **Status:** Approved.

### D-044 Input schemes
- **Decision:** The prototype supports mouse and keyboard, and keyboard only (with soft lock-on). Touch and controller are production work. Production controller bindings: left trigger is crate weapon only, LB opens the morph wheel, D-pad left/up/right morphs directly.
- **Status:** Approved. Partly superseded by D-079 (fragile assist replaces soft lock-on).

### D-045 Art and audio in the prototype
- **Decision:** Greybox only (primitive shapes, flat colors, one outline pass). No purchased or commissioned art before approval. Sound effects are synthesized in code with Web Audio; no music.
- **Status:** Superseded by D-081 for the 2026-10-23 release scope.

### D-046 Coordinates and units
- **Decision:** Simulation coordinates: x east, y north, meters, origin at the map center. Angles in radians, 0 = east, counter-clockwise positive. Three.js world mapping: sim (x, y) → world (x, 0, -y), so north is "up" on screen with the fixed camera. `docs/BALANCE.md` stores human units (degrees, seconds); `packages/shared` converts them once at load.
- **Status:** Approved.

Implementation note (2026-10-21): The requested TPP/FPP camera views follow the player's aim. D-046's coordinate mapping remains in force; its fixed-camera screen-orientation explanation describes the earlier presentation.

### D-047 Process
- **Decision:** Work is an ordered task queue (`TASKS.md`), mirrored on the GitHub Project board. Whoever is free takes the top unblocked task. No per-person assignments. When a spec has a gap, the agent writes it in `OPEN_QUESTIONS.md`, does not invent a rule, and takes the next unblocked task.
- **Status:** Approved.

---

## 4. Where these decisions supersede the GDD

`docs/GDD.md` (v2.1) stays the long-term reference. For the prototype, these override it:

| GDD section | What changes for the prototype | Decision |
|---|---|---|
| §21 Roadmap M0 to M4 | The prototype phase replaces M0 and M1 and pulls Zone Frenzy and keyboard lock-on forward from M2. Production M2 to M4 start only after approval. | D-002 |
| §22.1 Build order | Replaced by `TASKS.md` | D-047 |
| §6.5 Economy check | No crates in the prototype, so crate Flux is 0 | D-022 |
| §7.8 Bounty, §11.1b Wanted bonus | Excluded from the prototype | D-022, D-023 |
| §11.1b "everything else matches Frenzy: shards, crates, arena events" | Prototype Zone Frenzy has shards only | D-022 |
| §14.5 Boot Camp, contextual hints | Excluded; replaced by a controls card and the death recap | D-022, D-024 |
| §18.6 Interest management | Deferred to production | D-039 |
| §15 Controls | Prototype supports mouse and keyboard, and keyboard only | D-044 |
| §5.4 Morph rules | Refined with the old-form-during-morph rule | D-013 |

---

## 5. Reserved for results

### D-061 Netcode implementation path

- **Status:** Approved by Hamza (confirmed in conversation, 2026-10-20).
- **Task:** T-020. Evidence and reproduction commands: `tools/spikes/netcode/README.md`.
- **Pinned versions inspected:** `@colyseus/core` 0.18.18, `@colyseus/ws-transport` 0.18.4, `@colyseus/sdk` 0.18.5, `@colyseus/schema` 5.0.40, `@colyseus/testing` 0.18.6, and `@colyseus/tools` 0.18.10 (D-060). No dependency or protocol version change was needed.
- **Decision:** Use mixed Colyseus room/transport and lifecycle hooks with custom Shiftborn netcode adapters over the public APIs. Preserve the numeric message IDs, flat newest-plus-two input packet, project `InputFrame.seq`, event-only projectiles, deterministic shared simulation, inclusive 0.5 m snap threshold, and 30-second reconnect window.

| Capability                                   | Spike finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Selected production path                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Room.setFixedTimestep`                      | Fixed `ctx.dt` is 1/30 s, but an intentional 235 ms hitch produced a five-step burst. The pinned public options do not expose a three-step catch-up limit.                                                                                                                                                                                                                                                                                                                                   | T-021 implements a custom accumulator at 30 Hz, at most three catch-up steps and explicit excess-backlog drop/overrun logging. Wall-clock delta never enters `sim.step`.                                                                                                                                                                                                                                    |
| `Room.defineInput` and SDK `room.input`      | The helper buffers Schema input and can cap at eight; it uses its own input wire format and acknowledgements. Sanitization clamped an invalid aim-source value rather than rejecting and counting it. It cannot directly consume message ID 1's approved flat redundant packet or own the project's sequence/edge rules.                                                                                                                                                                     | T-022 uses `room.onMessage(ClientMessageId.Input)` with shared `decodeInputPacket`, a custom eight-frame queue, project-seq deduplication/continuity, two-frame catch-up with merged rising edges, repeat-last, validation/rate limits and drop counters.                                                                                                                                                   |
| `Predict.sim` / reconciler                   | Public `sim` can adopt an opaque full player record, step shared movement/Dash with fixed dt, replay pending commands and expose a raw correction when diagnostics are enabled. Its input history is tied to SDK `room.input`; its built-in snap test is strict per-axis and does not implement Shiftborn's inclusive Euclidean threshold or 100 ms visual smoothing. Death, synthetic respawn and real-socket reconnect resets worked; project-seq held-edge replay with the approved packet was not proven. | T-040 uses a custom project-seq pending queue and reconciliation around the shared prediction step. Adopt all authoritative local fields, replay unacknowledged frames, snap at **>= 0.5 m**, smooth smaller visual offsets over 100 ms, count qualifying corrections, and hard-reset on death/respawn/reconnect. The SDK predictor remains an optional later optimization only after these behaviors pass. |
| `PredictedSpawns`                            | A public event adapter matched out-of-order `(inputSeq, shotIdx)` Scatter visuals, retained render identity, expired a rejected visual after 500 ms and removed by server id. Its collection-oriented handoff returned an observed 1 m position jump with an event-only projectile feed.                                                                                                                                                                                                     | T-037 implements custom event-only matching and render continuity. Preserve D-034; do not add projectiles to synchronized Schema state. OQ-015 shot-index semantics remain unresolved.                                                                                                                                                                                                                      |
| `onDrop`, `onReconnect`, `allowReconnection` | An actual local socket drop called both hooks once; a reconnect retained room/session, seat and stats. Accelerated expiry caused final leave; consented leave bypassed drop. SDK defaults do not match the exact retry schedule.                                                                                                                                                                                                                                                             | Use public room/client lifecycle hooks, `allowReconnection(client, BALANCE.net.reconnectS)` and a public client backoff wrapper for 0.5, 1, 2, 4, 8, then 8 s. Layer proxy control, `welcome`/resync, expiry bot replacement, and project-seq continuity in later tasks.                                                                                                                                    |
| `allowRewindState`                           | Present and callable in core 0.18.18.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Defer: NETWORK_PROTOCOL §8.1 keeps projectile spawn advance authoritative and excludes prototype lag-compensated hit rewinds.                                                                                                                                                                                                                                                                               |

- **Measured quality:** A local socket room/client with shared sim and spike-local custom prediction ran 61 seconds at 150 ms added RTT (75 ms each direction), 1.0167 player-minutes, 913 measured reconciliations and zero errors at or above 0.5 m. This passes the spike's no-loss §15 threshold. A separate seeded 150 ms / 2% head-of-line run had 16 qualifying corrections (15.74 per player-minute, maximum 1.133 m), which is a material risk for later production validation. Both runs used event messages for snapshots, not production Schema mirroring, and do not establish AT-NET acceptance.
- **Implications:** T-021 owns the custom bounded fixed loop and Schema mirror. T-022 owns the custom input pipeline. T-035 retains project sequence continuity through reconnect. T-037 owns event-only projectile matching. T-040 owns full-state local reconciliation and presentation rules. Later network acceptance and load tests must verify these choices in production code.
- **Risk:** The 2% head-of-line quality failure and the spike's simplified room/snapshot adapter require follow-up in the assigned production tasks. Approval selects an implementation path; it does not claim later AT-NET acceptance.
- **D-062 Playtest region** (filled from OQ-002).
- **D-070 Approval Gate outcome** (filled at task T-150): Approve, Iterate or Stop, with the evidence report link.

### D-060 Pinned versions

- **Decision:** Pin the prototype toolchain to these exact direct versions at T-001.
- **Status:** Approved (Hamza, 2026-10-16).

| Package or runtime | Version |
|---|---|
| Node.js Active LTS | 24.22.0 |
| pnpm | 12.14.0 |
| TypeScript | 6.0.3 |
| Vite | 8.3.4 |
| Three.js (`three`) | 0.186.1 |
| `@types/three` | 0.186.0 |
| Colyseus server core (`@colyseus/core`) | 0.18.18 |
| Colyseus WebSocket transport (`@colyseus/ws-transport`) | 0.18.4 |
| Colyseus client SDK (`@colyseus/sdk`) | 0.18.5 |
| `@colyseus/schema` | 5.0.40 |
| `@colyseus/testing` | 0.18.6 |
| `@colyseus/tools` (testing peer) | 0.18.10 |
| Vitest | 5.0.5 |
| Playwright (`@playwright/test`) | 1.64.1 |
| pino | 10.4.0 |
| ESLint | 10.12.0 |
| typescript-eslint | 8.71.2 |
| Prettier | 3.9.10 |

TypeScript 7.0.2 is the newest release, but typescript-eslint 8.71.2 declares support only for TypeScript below 6.1. TypeScript 6.0.3 is the newest compatible release. The server uses the focused Colyseus core and WebSocket packages because the `colyseus` umbrella package pulls a Git-sourced optional transport that pnpm 12 rejects by default.

### D-063 Bot difficulty wire codes

- **Decision:** Encode Easy as 0, Normal as 1, and Hard as 2 in the existing `RoomSettings.botDifficulty` and `hostSettings.botDifficulty` uint8 fields.
- **Status:** Approved by Hamza (confirmed in conversation, 2026-10-20).
- **Task:** T-025. The existing protocol fields had no documented numeric mapping.

### D-064 Ambiguous morph input edges

- **Decision:** If two or more distinct morph-target buttons gain rising edges in one simulation tick, ignore those morph requests. Do not choose a priority form, begin a morph, spend Flux, or emit a new morph event for that ambiguous request. An existing morph, ordinary timers and Flux regeneration continue. Movement, aim, fire, ability input and held-button history continue normally. A button already held before the tick does not count as a new rising edge when another target is pressed.
- **Status:** Approved by user in conversation, 2026-10-21 (OQ-014 option B).
- **Task:** T-034 verification of the T-014 sim behavior.

### D-065 Interim FPP mouse controls

- **Decision:** Keep FPP mouse aim disabled until a detailed rule is approved. Mouse movement does not change aim in FPP. Keep the FPP camera and V switch. Show the system cursor and hide the aiming reticle in FPP. Do not use pointer lock. This interim behavior does not block T-034 and does not establish complete FPP playability; the future control rule remains open.
- **Status:** Superseded by D-078 (2026-10-23). Previously approved by user in conversation, 2026-10-21 (OQ-017 option C).
- **Task:** T-034; follow-up OQ-018.

### D-066 Staged T-031 acceptance

- **Decision:** T-031 may finish when its production networking requirements and AT-NET-19 genuinely pass. AT-NET-17 retains its full manual requirement: at `?lag=150&loss=2`, the game stays playable without state decode errors. Attempt it after T-034, and require any remaining verification in T-068 before the Fun Gate. Schema delivery, movement checks and this staged approval alone do not count as AT-NET-17 passing.
- **Status:** Approved by user in conversation, 2026-10-21 (OQ-016 option A).
- **Task:** T-031 and T-068.

### D-067 T-040 and T-035 ownership

- **Decision:** T-040 owns the shared `LocalPredictState` and `predictStep` contract and its simulation equivalence tests. T-035 owns the browser project-sequence pending queue, authoritative restoration, replay, correction counting, snap and 100 ms visual smoothing, and death/respawn/visibility/reconnect resets. This supersedes only D-061's assignment of those client reconciliation and presentation tasks to T-040; D-061's selected custom netcode behavior and thresholds remain in force.
- **Status:** Approved by user in conversation, 2026-10-21 (OQ-019 option A).
- **Task:** T-040 and T-035.

### D-068 T-040 prediction equivalence boundary

- **Decision:** T-040 compares every predictable local field exactly after each tick when both predictor and full server step receive the same authoritative Flux, phase, cover, and status inputs. Separate tests must show the expected temporary divergence when authority is stale, including morph affordability. The client still does not predict Flux gains, damage, deaths, pickups, scores or other server-owned outcomes (D-036).
- **Status:** Approved by user in conversation, 2026-10-21 (OQ-020 option A).
- **Task:** T-040.

### D-069 Projectile shot index per input sequence

- **Decision:** For each applied input sequence, allocate `shotIdx` in firing order starting at zero. Repeating the same held input frame across simulation ticks continues its index; the first shot tagged with a different accepted input sequence starts again at zero. Scatter pellets consume consecutive indexes in their fixed pattern order. This approves the existing T-016 server behavior and the T-040 predictor behavior, resolving D-061's historical OQ-015 caveat. The `(inputSeq, shotIdx)` event wire format is unchanged.
- **Status:** Approved by user in conversation, 2026-10-21 (OQ-015 option A).
- **Task:** T-040 and T-037.

### D-071 Complete local prediction restoration

- **Decision:** Use OQ-021 option A. Version the protocol and mirror the local player's three weapon fire timers, last button sequence and held mask, last shot sequence and next shot index. Mirror `ccImmuneEndTick` as well because the shared `LocalPredictState` requires it for a complete authoritative restore. Reject an incomplete prediction projection rather than retaining stale predicted fields. The client continues to predict only the D-036 permitted subset.
- **Status:** Approved by user in conversation, 2026-10-21 (OQ-021 option A).
- **Task:** T-035.

### D-072 Durable shot intent identity through input catch-up

- **Decision:** Use OQ-022 option A. Input protocol version 3 carries up to eight ascending, unacknowledged predicted shot sequence tags in each redundant input frame. A client registers a tag after predicting a shot, repeats it in subsequent frames for the existing 500 ms local confirmation window, and removes it on an own `projectileSpawn` confirmation or lifecycle reset. The server still applies the newer movement, aim and held buttons during two-frame catch-up. On an actual accepted shot, it selects the oldest carried tag newer than its last resolved tag and no newer than the applied frame; if none is eligible, it uses the applied input sequence. Only an accepted shot resolves a tag. A fallback shot resolves through its applied sequence, preventing a later stale tag from being attached to another shot. Scatter pellets retain consecutive `shotIdx` values under the selected sequence. Exact `(owner, inputSeq, shotIdx)` matching remains mandatory; rejected predicted visuals fade under §8.2. This supersedes D-069 only for the sequence chosen for a tagged human shot; D-069's index allocation and repeated-sequence rule remain.
- **Status:** Approved by user in conversation, 2026-10-21 (OQ-022 option A).
- **Task:** T-037. A new protocol version is required because the input frame wire changes.

## 6. Release request of 2026-10-23

The owner's request of 2026-10-23 supersedes the conflicting three-minute, starting-gun, unrestricted-form and greybox-only requirements for this scope. `docs/CHANGE_CONTRACT.md` maps each decision below to rules, numbers, protocol, tests and owners. Numbers chosen by the lead engineer under D-077 live in `docs/BALANCE.md` and are listed for owner review in OQ-024; they are not owner decisions.

### D-073 Ten-minute active matches

- **Decision:** PLAYING lasts 600 seconds: 18,000 simulation ticks at the existing 30 Hz. COUNTDOWN and RESULTS keep their own lengths and never count toward active time. Match time, phase changes and termination come only from authoritative ticks. The tick on which PLAYING ends is the last tick on which inputs, hits, kills, unlocks and pickups apply (GR-2.7).
- **Supersedes:** GR-2.2's 180-second PLAYING length and BALANCE's 150 to 240 second tuning range for `match.durationS`. Any later change to 600 needs the owner.
- **Status:** Approved by user in conversation, 2026-10-23.
- **Task:** CHANGE_CONTRACT stage S1.

### D-074 Runner-only start, dagger and kill unlocks

- **Decision:** Every match starts with every player as Runner, with only Runner unlocked, carrying the dagger and no guns. Beast unlocks at 3 cumulative credited KOs in the current match and Turret at 6. Death does not reset progress. An unlock permits morphing; it never forces a morph and never grants a gun. Only authoritative KO credit (GR-11.1) counts; assists, points and client reports never count. Existing morph costs, cooldowns and eligibility still apply, and a locked target is denied. Progress, unlocks and gear reset at every COUNTDOWN. A fresh entrant (late join, or a human taking a bot's seat) starts fresh. A reconnecting human and a proxy keep the seat's state; a bot continuing a departed human's seat continues that life (BOT_SPEC §9.1).
- **Supersedes:** GR-2.4 and GR-11.6 only where they let any form be used from the start, and the always-available form weapons of GR-4.1 and GR-7. Morph rules GR-5 otherwise remain.
- **Status:** Approved by user in conversation, 2026-10-23.
- **Task:** CHANGE_CONTRACT stage S2.

### D-075 Random loot, automatic pickup and two gun slots per form

- **Decision:** Six guns are map loot: Runner Pulse Pistol (tier 1) and Ricochet Disc (tier 2), Beast Scatter Cannon (tier 1) and Slug Cannon (tier 2), Turret Rail Repeater (tier 1) and Arc Mortar (tier 2). Loot positions are random on every map, re-rolled every match and again whenever an item is replenished; there are no fixed loot places. Walking over an item collects it; there is no pickup key. Each form holds one gun per tier, so a player can own all six. Guns for locked forms are stored and become usable only in the matching unlocked form. Picking up a gun the player already owns adds ammunition to that gun's reserve up to its cap; at the cap the item stays on the floor. The server owns placement, claims and inventory; no client position, inventory or message can grant an item.
- **Supersedes:** D-022 only for these six guns as loot. Crates, crate weapons, drones and every other `WEAPON_ART.md` weapon stay excluded.
- **Status:** Approved by user in conversation, 2026-10-23 (question batch: automatic pickup, two slots per form with duplicate refill, random placement every match on all maps).
- **Task:** CHANGE_CONTRACT stage S2.

### D-076 Ammunition, reloads and retained gear

- **Decision:** Every gun has authoritative magazine and reserve counts and a timed, server-owned reload (R, or automatic when the magazine empties). Death and respawn keep unlocks, owned guns and exactly the magazine and reserve of every gun at the moment death is finalized, including stored guns for other forms. An active reload is cancelled on death without moving ammunition. Death, respawn, reconnect, morphing and weapon switching never refill ammunition, duplicate pickups or complete a reload. Transient state (fire timers, heat, cooldowns, status) still follows GR-11.6. Turret heat remains.
- **Status:** Approved by user in conversation, 2026-10-23 ("Respawn refills ammo: no, restore exactly the same remaining ammo").
- **Task:** CHANGE_CONTRACT stage S2.

### D-077 Higher-damage tier 2 weapons

- **Decision:** Use the six weapon identities from `WEAPON_ART.md`, plus a new starting dagger. The owner authorizes the lead engineer to calculate and balance one higher-damage weapon per form, designated tier 2 in documents and UI: Ricochet Disc, Slug Cannon and Arc Mortar. Tier 1 values stay unchanged unless a further approved change is needed. The higher-damage claim must hold under the stated benchmark in `docs/BALANCE.md` §9.5, with its tradeoffs reported. `WEAPON_ART.md` is a reference, not a source of approvals or decision numbers.
- **Status:** Approved by user in conversation, 2026-10-23.
- **Task:** CHANGE_CONTRACT stage S2.

### D-078 Controls and facing-relative camera basis

- **Decision:** WASD moves relative to facing: W forward along aim, S back, A and D strafe. Shift+W sprints. Clicking the canvas captures the mouse with pointer lock; horizontal mouse motion turns the player, and Esc releases the lock. Left and Right arrows turn smoothly. The same basis applies in TPP and FPP. Other bindings: arrows aim, 1/2/3 morph, R reload, E form ability, Space keyboard fire, LMB fire, Tab scoreboard, C camera view, Esc or P personal menu, Q or mouse wheel swaps the current form's guns, V strikes with the dagger.
- **Supersedes:** D-065 (pointer lock is now allowed and FPP mouse turning is enabled) and answers OQ-018. Supersedes the V camera and Q lock bindings in `CONTROLS_UI.md` §2.
- **Status:** Approved by user in conversation, 2026-10-23.
- **Task:** T-120, T-034 follow-up (Codex client wiring with Claude's numerical aim model).

### D-079 Fragile aim assist replaces soft lock-on

- **Decision:** Aim assistance is weak, breakable input assistance. It acquires only on a firing action when raw manual aim is already very close to an eligible, visible enemy within range. Retention is measured from the player's raw input, not the assisted angle, so enemy movement breaks it unless the player tracks manually. Release has a reacquisition delay. It has no target cycling, lead, autonomous tracking, homing, hitbox or damage change, and the Turret turn cap still applies. Thresholds and rates live in shared balance data. It still runs on the client and produces ordinary aim angles (D-037). The input scheme is recorded for analysis but never treated as proof of honesty.
- **Supersedes:** The soft lock-on of `CONTROLS_UI.md` §3.3 and §3.4, its Q binding and the `softLock.*` keys; D-044 only for "keyboard only with soft lock-on".
- **Status:** Approved by user in conversation, 2026-10-23.
- **Task:** T-121.

### D-080 Personal menu keeps the match running

- **Decision:** Esc or P opens a local menu. Gameplay input becomes neutral and held input is cleared on menu, blur and focus transitions. The server keeps running; the player stays damageable and can die. There is no pause, no immunity and no immediate proxy. The ordinary AFK rule (`NETWORK_PROTOCOL.md` §9.4) still applies to a player who stays in the menu; the hidden-tab and disconnect rules are unchanged.
- **Status:** Approved by user in conversation, 2026-10-23.
- **Task:** T-065.

### D-081 Art and audio for this release

- **Decision:** For this release scope, the greybox-only rule no longer applies. Art and audio may be integrated by Codex. Every asset records its source and license before publication, the client size budget still applies, and art never changes timing, hitboxes or numbers.
- **Supersedes:** D-045 and the "art beyond greybox" item of D-022 for this scope.
- **Status:** Approved by user in conversation, 2026-10-23.
- **Task:** Codex art/audio integration stages.

### D-082 Requested release scope

- **Decision:** This request authorizes the specified gameplay changes and the work needed to complete them, including remaining mandatory gameplay, server and bot tasks, and only these production portions: scope reconciliation, art and audio integration, platform integration, essential safety and operations, and launch verification. It is not approval of every production epic. It does not add Ultimates, crates, accounts, progression currencies, paid upgrades, seasons or extra modes. Human Fun Gate, playtest and approval gates remain; D-070 is still recorded only by the owner. Hosting choice, credentials, domain and any spending need separate owner approval.
- **Status:** Approved by user in conversation, 2026-10-23.
- **Task:** CHANGE_CONTRACT §11 task inventory.

### D-083 Owner review of release defaults and map

- **Decision:** The owner approves all nine OQ-024 defaults, including dagger and sprint parameters, indirect mortar flight with blast occlusion, ammunition/reloads, swap/draw delay, aim distance controls, loot counts/replenishment and keyboard-only fragile assist. Adapt Lion’s Claw as the default flat eight-player map (OQ-023).
- **Status:** Approved by user in conversation, 2026-10-23, during Codex takeover.
- **Task:** T-047 to T-049, T-057, T-058; map adaptation follows validation V1 to V9.
