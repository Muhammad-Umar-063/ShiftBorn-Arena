# DECISIONS.md

> **LLM FILE CONTRACT:** Highest project authority. Read the decision ids named by the active task. Never edit approved text in place, never infer approval and use `OPEN_QUESTIONS.md` for proposals.

Approved design and technical decisions for **Shiftborn Arena**. This file is binding.

- When this file and any other document disagree, **this file wins**, then the order in `AGENTS.md` §3.2 applies.
- Every decision has an ID. Code comments and docs may cite it, for example `// D-012 health fraction`.
- Never edit an approved decision in place. To change one, add a new decision that names what it supersedes, and mark the old one `Superseded by D-xxx`.
- Only Hamza (project owner) approves decisions. A coding agent never adds an `Approved` entry on its own. Agents propose changes in `OPEN_QUESTIONS.md`.
- Status values: `Proposed` (an agent filled a reserved entry from section 5; Hamza approves it only after reviewing the evidence), `Approved`, `Approved (provisional)` (stands until a playtest or spike says otherwise), `Superseded by D-xxx`.

Last updated: 2026-10-16.

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
- **Status:** Approved.

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
- **Status:** Approved.

### D-045 Art and audio in the prototype
- **Decision:** Greybox only (primitive shapes, flat colors, one outline pass). No purchased or commissioned art before approval. Sound effects are synthesized in code with Web Audio; no music.
- **Status:** Approved.

### D-046 Coordinates and units
- **Decision:** Simulation coordinates: x east, y north, meters, origin at the map center. Angles in radians, 0 = east, counter-clockwise positive. Three.js world mapping: sim (x, y) → world (x, 0, -y), so north is "up" on screen with the fixed camera. `docs/BALANCE.md` stores human units (degrees, seconds); `packages/shared` converts them once at load.
- **Status:** Approved.

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
