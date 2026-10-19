# ARCHITECTURE.md

> **LLM FILE CONTRACT:** Technical source of truth for stack, folders, dependency direction, simulation boundaries, server, client, logging, tests, CI, deployment and budgets. Gameplay behavior and values still come from `GAME_RULES.md` and `BALANCE.md`.

The chosen stack, repository layout, shared simulation, and the responsibilities of the client and server for the Shiftborn Arena prototype. Built so production can grow from it without a rewrite.

Related: `DECISIONS.md` (D-030 to D-046), `docs/NETWORK_PROTOCOL.md`, `docs/GAME_RULES.md`, `docs/BALANCE.md`.

---

## 1. Principles

1. **One simulation.** All gameplay logic is in `packages/sim`. The server runs it as the authority; the client runs parts of it to predict the local player. Nothing else implements game rules (D-032).
2. **Server decides outcomes.** Clients send inputs and render. Hits, damage, deaths, Flux, scores and match results come only from the server (D-036).
3. **Data, not code, for numbers.** Every gameplay number comes from `packages/shared/src/balance.ts` (`docs/BALANCE.md`).
4. **Deterministic.** Same seed, map and inputs give the same result. This enables replays, determinism tests and reliable bug reports.
5. **Small and boring.** Fewest dependencies that do the job. No UI framework, no physics engine, no state library in the prototype.
6. **Production-ready seams.** Characters, crates, Overdrive, portals and persistence plug into interfaces defined now (section 15) without rewriting the core.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true` | Everywhere |
| Runtime (server, tools) | Node.js Active LTS | Pinned in `.nvmrc` and `engines` (D-060) |
| Package manager | pnpm workspaces | Pinned with `packageManager` in root `package.json` |
| Client build | Vite | Static output in `apps/client/dist` |
| Rendering | Three.js (WebGL 2) | Greybox meshes only (D-045) |
| Multiplayer | `@colyseus/core` with `@colyseus/ws-transport` server, `@colyseus/sdk` client, `@colyseus/schema` | Rooms, matchmaking, state patches, reconnection |
| Netcode helpers | Colyseus `setFixedTimestep`, `defineInput`, `Predict` and `reconciler`, `predict.spawns`, `allowRewindState`, `onDrop` and `onReconnect` if present in the pinned version | Adoption decided by spike T-020 (D-035). Fallback: the custom implementation in `docs/NETWORK_PROTOCOL.md` |
| Server logging | `pino` (JSON) | Operational logs |
| Tests | Vitest (unit, sim, server), Playwright (browser smoke), `@colyseus/testing` (room tests) | |
| Lint and format | ESLint (typescript-eslint), Prettier | Enforced in CI |
| Hosting | One VPS, Docker Compose, Caddy (HTTPS and WSS) | D-042 |

**Version policy.** At task T-001, install the latest stable compatible versions, pin them exactly (no `^` or `~`), and record them in `DECISIONS.md` as D-060. D-060 records any compatibility exception. Upgrade only through a task that re-runs the full test suite.

**Not used:** Unity, Phaser, Babylon.js, any 3D physics engine, React or other UI frameworks, Redux or other state libraries, Socket.IO, third-party analytics in the prototype.

---

## 3. Repository layout and tooling

```text
shiftborn-arena/
├── AGENTS.md                 Canonical Codex and repository instructions (read first)
├── CLAUDE.md                 Compatibility pointer to AGENTS.md
├── README.md
├── TASKS.md                  Ordered task queue
├── DECISIONS.md              Approved decisions (binding)
├── OPEN_QUESTIONS.md         Unresolved decisions
├── docs/                     Specs (this folder)
├── package.json              Root scripts, packageManager, engines
├── pnpm-workspace.yaml       packages/*, apps/*, tools/*
├── tsconfig.base.json        Shared compiler options, path aliases
├── eslint.config.js
├── .prettierrc
├── .editorconfig
├── .nvmrc
├── .env.example              Every environment variable with a comment
├── .github/workflows/
│   ├── ci.yml                On every push to main
│   └── nightly.yml           Soak test and determinism replay
├── packages/
│   ├── shared/               No runtime dependencies
│   │   ├── src/
│   │   │   ├── balance.ts    BALANCE object (docs/BALANCE.md §8)
│   │   │   ├── derived.ts    Ticks, radians, per-tick rates computed from BALANCE once
│   │   │   ├── constants.ts  Enums: Form, Phase, Mode, AbilityId, WeaponId, AimSource, Cause
│   │   │   ├── protocol.ts   Message names, input encoding, event payload types, protocol version
│   │   │   ├── ids.ts        Id formats, room code alphabet
│   │   │   ├── names.ts      Bot name lists, name sanitizer
│   │   │   ├── maps/
│   │   │   │   ├── types.ts        MapData type
│   │   │   │   └── greybox_v1.ts   Map data (docs/MAP_SPEC.md §9)
│   │   │   └── index.ts
│   │   └── test/
│   └── sim/                  Depends on shared only
│       ├── src/
│       │   ├── index.ts      Public API (section 4.3)
│       │   ├── world.ts      World type and creation
│       │   ├── rng.ts        Seeded PRNG (sfc32) and helpers
│       │   ├── hash.ts       Deterministic state hash
│       │   ├── events.ts     SimEvent union type and emitter
│       │   ├── math/         vec2, angle, geometry (circle vs box, segment vs circle, segment vs box, raycast)
│       │   ├── map/          Static collision index (uniform grid of boxes), line of sight, cover state
│       │   ├── player/       Player record, form stats lookup, pure movement step, pure morph step
│       │   ├── systems/      phase, input, morph, abilities/{dash,ramCharge,railShot}, movement,
│       │   │                 weapons, projectiles, damage, death, respawn, status, flux, shards, zone, cover, scoring
│       │   ├── modes/        ModeRules interface, frenzy.ts, zoneFrenzy.ts
│       │   └── predict.ts    Local-player prediction step (section 4.6)
│       └── test/             Unit, scenario, property and determinism tests
├── apps/
│   ├── server/               Depends on shared and sim
│   │   ├── src/
│   │   │   ├── index.ts      Bootstrap: Colyseus server, room definitions, HTTP health route
│   │   │   ├── config.ts     Environment variables, validated at startup
│   │   │   ├── rooms/
│   │   │   │   ├── ArenaRoom.ts        Room lifecycle, tick loop, seats, phases
│   │   │   │   ├── schema/             ArenaState, PlayerState, ShardState, CoverState, ZoneState
│   │   │   │   ├── mirror.ts           Copies sim state into the schema each tick
│   │   │   │   ├── seats.ts            Seat assignment, bot backfill, proxy control
│   │   │   │   └── codes.ts            Room code generation and validation
│   │   │   ├── net/
│   │   │   │   ├── inputQueue.ts       Per-player input buffer, redundancy, rate limit
│   │   │   │   ├── ping.ts             RTT measurement and smoothing
│   │   │   │   └── events.ts           Batches sim events into messages
│   │   │   ├── bots/                   BotController, perception, navgrid, pathfinding, aim, names (docs/BOT_SPEC.md)
│   │   │   ├── logging/                logger.ts (pino), matchLog.ts (JSONL), inputLog.ts (replay file)
│   │   │   └── dev/cheats.ts           Dev-only commands (section 11)
│   │   ├── test/
│   │   └── Dockerfile
│   └── client/               Depends on shared and sim
│       ├── index.html
│       ├── vite.config.ts
│       ├── src/
│       │   ├── main.ts                 Entry; feature-detects WebGL 2
│       │   ├── app/App.ts              Screen state machine: Landing, Connecting, InMatch, Error
│       │   ├── net/                    Connection, clock sync, netsim (artificial lag and loss), event intake
│       │   ├── input/                  InputManager, bindings, keyboardAim, lockOn, schemeDetect, mouseAim
│       │   ├── predict/                Predictor (local player), reconciliation, error smoothing
│       │   ├── interp/                 Snapshot buffer and interpolation for remote players
│       │   ├── projectiles/            Local predicted shots and server projectile views
│       │   ├── render/                 Renderer, camera, materials, entity views, effects
│       │   ├── ui/                     hud/*, screens/*, styles.css
│       │   ├── audio/sfx.ts            Synthesized sounds (Web Audio)
│       │   ├── settings/settings.ts    Settings with safe localStorage access
│       │   ├── telemetry/clientStats.ts
│       │   ├── debug/                  Overlay (F3), hitbox view (F4), dev console (backtick)
│       │   └── platform/PlatformAdapter.ts   No-op in the prototype (section 15)
│       ├── test/                       Unit tests
│       └── e2e/                        Playwright tests
└── tools/
    ├── map-validator/        Sightlines, clearance, connectivity, ASCII render (docs/MAP_SPEC.md §10)
    ├── analyze/              Match logs → metrics report (docs/PLAYTEST_PLAN.md §5)
    ├── replay/               Re-runs a match from its input log and compares hashes
    └── loadtest/             Bot-only rooms and headless clients for soak tests
```

### 3.1 Dependency rules

- `packages/shared` depends on nothing.
- `packages/sim` depends on `shared` only.
- `apps/server` and `apps/client` depend on `shared` and `sim`. They never import from each other.
- `tools/*` may depend on `shared` and `sim`, and read server output files.
- An ESLint rule (`no-restricted-imports`) enforces this. CI fails on a violation.

### 3.2 Root scripts

| Script | Does |
|---|---|
| `pnpm setup` | Installs all workspace packages from the frozen lockfile and installs Playwright Chromium |
| `pnpm dev` | Server on port 2567 and Vite client on port 5173 (proxying `/ws` and `/healthz` to the server), with hot reload |
| `pnpm build` | Builds shared, sim, server and client |
| `pnpm test` | All Vitest suites |
| `pnpm test:e2e` | Playwright against a locally started build |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm typecheck` | `tsc --noEmit` for every package |
| `pnpm check:size` | Fails if the gzipped client build is 5 MB or more |
| `pnpm sim:determinism` | Runs 20 seeded bot-only matches twice and compares final hashes |
| `pnpm map:validate` | Runs the map validator on every map in `packages/shared/src/maps` |
| `pnpm analyze <logs-dir>` | Writes the metrics report |
| `pnpm replay <match-log>` | Replays a match and checks hashes |
| `pnpm loadtest` | Starts N bot-only rooms for a duration (defaults: 20 rooms, 2 hours) |

---

## 4. Shared simulation (`packages/sim`)

### 4.1 World model

The world is a plain data structure, owned by the sim:

```ts
interface World {
  tick: number;
  phase: Phase;              // COUNTDOWN | PLAYING | RESULTS
  phaseEndTick: number;
  mode: Mode;                // 'frenzy' | 'zoneFrenzy'
  matchIndex: number;
  matchId: string;
  roomSeed: number;
  rng: Rng;                  // seeded per match (GR-2.10)
  map: MapRuntime;           // static boxes, collision grid, points
  cover: CoverState[];       // intact or destroyed, rebuild tick
  players: PlayerRecord[];   // indexed by seat, null for empty seats
  projectiles: Projectile[]; // sorted by id
  nextProjectileId: number;
  shards: Shard[];           // sorted by id
  clusters: ClusterState[];
  zone: ZoneState | null;    // Zone Frenzy only
  recentSpawns: number[];    // last 2 spawn indexes (GR-11.5)
  events: SimEvent[];        // cleared at the start of each step
}
```

Player record fields are listed in `docs/GAME_RULES.md` §3.

### 4.2 Rules for sim code

1. No `Math.random()`, `Date.now()`, `performance.now()`, timers, DOM, network, file system or `console` in `src/` (lint-enforced). Use `world.rng`.
2. No iteration over `Map` or `Set` where order affects results unless keys are sorted first.
3. All numbers from `BALANCE` through `derived.ts`.
4. Systems are functions `(world, ctx) => void` that read and write the world and push events. Player-level math (movement step, morph timing, ability movement, aim turning, fire timers) is written as **pure functions on a player record and the static map**, so the client predictor can call exactly the same code (section 4.6).
5. No allocation in the hot path where avoidable: reuse vectors, pool projectiles.
6. Every exported function has a unit test. Every rule ID in `docs/GAME_RULES.md` has at least one test that names it (for example `it('GR-8.7 wall stops ram and stuns 12 ticks')`).

### 4.3 Public API

```ts
createWorld(opts: { map: MapData; roomSeed: number; mode: Mode }): World
addPlayer(world, p: { id: string; name: string; isBot: boolean; seat: number }): void
removePlayer(world, id: string): void
setController(world, id: string, c: 'human' | 'bot' | 'proxy'): void
setMode(world, mode: Mode): void           // takes effect at the next COUNTDOWN
step(world, inputs: InputFrame[] /* by seat */, ctx: StepContext): SimEvent[]
snapshot(world): WorldSnapshot             // plain object for mirroring and logging
hashWorld(world): string                   // stable hash of all gameplay-relevant fields
lineOfSight(world, a: Vec2, b: Vec2): boolean
predictStep(local: LocalPredictState, input: InputFrame, map: MapRuntime, tick: number): LocalPredictState
```

`StepContext` carries server-only data: per-player spawn advance ticks (GR-7.9). On the client it is empty.

### 4.4 RNG

`sfc32` seeded from a 128-bit state derived from `(roomSeed, matchIndex)` with a fixed integer hash (for example `splitmix32` applied four times). Helpers: `nextFloat()`, `nextInt(n)`, `shuffle(array)`, `pick(array)`. One RNG per match, created at COUNTDOWN. Bot decisions use a separate RNG per bot (seeded from the match seed and seat) so bot behavior does not shift gameplay randomness when a bot is replaced.

### 4.5 Collision index

The static map (walls) is indexed in a uniform grid of 4 m cells listing the boxes that touch each cell. Destructible cover is checked separately (10 boxes) with its intact flag. Queries: circle vs boxes (movement), swept segment vs boxes (projectiles, line of sight), segment vs circles (Rail Shot, projectiles vs players).

### 4.6 Prediction step

`predictStep` advances only the local player for one tick using the same pure functions the server uses:

- aim (including the Turret turn cap), movement and wall collision, Dash movement, Ram Charge windup and charge movement (stops at walls and cover; player contact is left to the server), morph timing (start if the last known Flux allows it, end after 15 ticks), ability cooldown timers, fire timers and heat (to spawn local shot visuals).

It does **not** decide damage, deaths, Flux gains, shard pickups or Ram contacts. Those come from the server and are applied when the authoritative state arrives (`docs/NETWORK_PROTOCOL.md` §6).

### 4.7 Mode rules

```ts
interface ModeRules {
  id: Mode;
  onMatchStart(world): void;
  onTick(world): void;             // e.g. zone scoring
  onKo(world, killer, victim): void;
  score(player): number;           // ranking value (GR-12)
}
```

Frenzy and Zone Frenzy implement it. Production modes (Reactor War, King of the Morph) add implementations without touching the core systems.

---

## 5. Server (`apps/server`)

### 5.1 Responsibilities

- Host rooms, match players, assign seats, run bots.
- Run the authoritative sim at 30 Hz per room.
- Receive, validate, buffer and apply inputs.
- Mirror sim state into the Colyseus schema (patched to clients at 20 Hz).
- Broadcast sim events.
- Handle disconnects, reconnection, hidden tabs and AFK with proxy bots.
- Write operational logs, match logs and input logs.
- Expose `/healthz`.

### 5.2 Room: `ArenaRoom`

| Hook | Does |
|---|---|
| `onCreate(options)` | Read `code` (empty for quick play), mode, host settings. Create the sim world with a crypto-random room seed. Fill 8 seats with bots. Start the fixed 30 Hz loop. Set patch rate to 50 ms. |
| `onAuth` | Validate protocol version and name (sanitize, max 16 characters). Reject with an error code on mismatch. |
| `onJoin(client, options)` | Replace a bot immediately (D-038, `docs/BOT_SPEC.md` §9) or take a free seat. Send `welcome`. In a code room, the first human becomes host. |
| `onDrop(client)` (or `onLeave` with `consented = false`) | Switch the seat to a proxy bot, keep the player record, allow reconnection for 30 s (`net.reconnectS`). |
| `onReconnect(client)` | Return control to the human; send `welcome` again with the current tick. |
| `onLeave(client, consented)` | Consented leave or expired reconnection: the seat becomes a normal bot (or empty if bot fill is off). Host passes to the next human by seat order. |
| `onDispose()` | Flush and close match logs. |

Use the hook names of the pinned Colyseus version; the table describes the required behavior.

### 5.3 Tick loop

```text
every 1/30 s (fixed timestep; at most 3 catch-up steps, then drop time and log a warning):
  1. for each seat: frame = inputQueue.next(seat) or botController.input(seat) or proxy input
  2. events = sim.step(world, frames, { spawnAdvanceTicks })
  3. mirror.apply(world, state)          // only changed fields are assigned
  4. eventBatcher.push(world.tick, events)
  5. matchLog.write(world.tick, events)  // selected events only (section 9)
  6. inputLog.write(world.tick, frames)
  7. measure tick time; export to metrics
```

Patches go out every 50 ms through Colyseus. Event batches go out every tick that has events (`docs/NETWORK_PROTOCOL.md` §5.3).

### 5.4 Matchmaking and rooms

- Quick play: `joinOrCreate('arena', { code: '' })`. Rooms with more humans are preferred (sort by human count descending). Quick-play rooms lock at 60 s or less remaining and unlock at RESULTS (GR-2.6).
- Code rooms: `joinOrCreate('arena', { code })`, filtered by `code`. Codes are 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no I, L, O, 0, 1). Creating a code room: the client generates a code, or the landing screen's "Create room" asks the server for one.
- Max 8 human clients per room.

### 5.5 Configuration

All settings come from environment variables, validated at startup (fail fast with a clear message). `.env.example` lists them:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 2567 | Colyseus and HTTP port |
| `PUBLIC_ORIGIN` | `http://localhost:5173` | Allowed browser origin |
| `QUICKPLAY_MODE` | `frenzy` | `frenzy`, `zoneFrenzy` or `alternate` |
| `BOT_DIFFICULTY` | `normal` | Default bot tier |
| `MATCH_LOG_DIR` | `./data/matches` | Match and input logs |
| `DEV_CHEATS` | `0` | `1` enables dev commands (never in the playtest build) |
| `LOG_LEVEL` | `info` | pino level |
| `BUILD_ID` | `dev` | Written into logs and the welcome message |

Client build variables (Vite, `apps/client/.env`):

| Variable | Default | Meaning |
|---|---|---|
| `VITE_SERVER_URL` | `ws://localhost:2567` | Colyseus endpoint (`wss://...` in the playtest build) |
| `VITE_BUILD_ID` | `dev` | Shown on the landing screen footer |
| `VITE_SURVEY_URL` | empty | Playtest survey link; the survey prompt is hidden when empty |
| `VITE_SURVEY_CODE_FIELD` | empty | Survey field id used to pre-fill the tester code |

---

## 6. Client (`apps/client`)

### 6.1 Responsibilities

- Screens and menus, HUD, settings.
- Read input, build input frames at 30 Hz, send them with redundancy.
- Predict the local player; reconcile with server state; smooth errors.
- Interpolate remote players 100 ms behind.
- Show local shots instantly; match them to server projectile events.
- Render the greybox world with a fixed top-down camera.
- Play synthesized sounds.
- Send client stats every 30 s.
- Never decide outcomes (D-036).

### 6.2 Frame loop

```text
requestAnimationFrame:
  accumulate real time; for each 1/30 s elapsed (max 4 per frame):
     frame = inputManager.sample()          // move, aim, buttons, aimSource
     connection.sendInput(frame)            // with the last 3 frames
     predictor.step(frame)                  // local player
     localShots.step(frame)
  interpolator.update(renderTime = serverTimeEstimate - 100 ms)
  predictor.applyErrorSmoothing(frameDt)
  renderer.render(alpha)                    // alpha = fraction to the next local tick
  hud.update()
```

### 6.3 Rendering

- Three.js with one `WebGLRenderer`, antialiasing on desktop, pixel ratio capped at 2.
- Camera: perspective, about 50° pitch, fixed north-up, never rotates. The default view is about 36 m wide at 16:9. The camera leads up to 6 m toward the aim direction and zooms by form (`forms.<form>.cameraZoom`). Details in `docs/CONTROLS_UI.md` §7.
- Greybox look: walls light grey boxes 3 m tall; cover darker boxes 1.2 m tall with a crack decal pattern; floor with a 1 m grid and lane tints; players as form silhouettes (`docs/CONTROLS_UI.md` §8).
- Walls between the camera and a player fade to 30% opacity.
- Instanced meshes for shards and projectiles.
- Budgets: under 100 draw calls, under 100,000 triangles.

### 6.4 Platform adapter

`PlatformAdapter` has `init()`, `gameplayStart()`, `gameplayStop()`, `getUser()`, `showMidgameAd()`, `getInviteLink()`. The prototype uses a no-op implementation. Production adds the CrazyGames implementation without touching game code.

---

## 7. Data flow

```text
Keyboard / mouse
   │
   ▼
InputManager ──► InputFrame (seq, move, aim, buttons, aimSource)
   │                   │
   │                   ├──► Predictor.step (local, instant)
   │                   └──► Connection.send('input', last 3 frames) ──► Server inputQueue
   │                                                                     │
   │                                                       sim.step (30 Hz, authoritative)
   │                                                                     │
   │                              ┌──────────────────────────────────────┤
   │                              ▼                                      ▼
   │                   Schema patches (20 Hz)                 Event batches ('ev')
   │                              │                                      │
   ▼                              ▼                                      ▼
Renderer ◄── Interpolator (remote) / Reconciler (local)      HUD, FX, sounds, projectiles
```

---

## 8. Shared package (`packages/shared`)

- `balance.ts`, `derived.ts`: section 8 of `docs/BALANCE.md`.
- `protocol.ts`: `PROTOCOL_VERSION`, message names, `InputFrame` encoding and decoding, event payload types. Both client and server import from here so they cannot drift.
- `maps/`: map data as typed TypeScript (not JSON) so the compiler checks it.
- `constants.ts`: enums as `const` objects with string values (readable logs).
- No runtime dependencies. Pure functions only.

---

## 9. Telemetry and logs

### 9.1 Operational logs

pino JSON to stdout, collected by Docker. Room create and dispose, joins and leaves, errors, tick overruns, rate-limit drops, reconnections.

### 9.2 Match log

One JSON Lines file per match: `MATCH_LOG_DIR/YYYY-MM-DD/<matchId>.jsonl`. Every line has `t` (tick), `type` and fields. Written from the server only.

| Type | Fields |
|---|---|
| `match_start` | matchId, roomId, roomCode (empty for quick play), mode, seed, balanceVersion, mapId, buildId, seats (id, name, isBot, controller, inputScheme), botDifficulty |
| `player_join`, `player_leave` | playerId, isBot, sessionId, reason |
| `controller_change` | playerId, from, to, reason (hidden, afk, drop, reconnect) |
| `morph` | playerId, from, to, fluxBefore, hpFrac, phase tick |
| `morph_denied` | playerId, target, reason |
| `shot` | playerId, weapon, aimSource (sampled: every shot counted in stats; individual lines only every 10th to limit size) |
| `damage` | attackerId, victimId, attackerForm, victimForm, cause, amount, distance, tags, aimSource |
| `ability` | playerId, ability, result (hit count, cancelled) |
| `death` | victimId, killerId, assisters, killerForm, victimForm, cause, position |
| `shard_pickup` | playerId, value, source (cluster or drop) |
| `zone_state` | state, holderId |
| `client_stats` | playerId, fpsMedian, fpsP5, rttMs, corrections, inputScheme, windowSize, browser, hiddenMs, errors |
| `room_error` | roomId, matchId, tick, message (an internal error ended the room) |
| `match_end` | ranking, per-player stats (GR-12.4), durationTicks, humans, bots |

### 9.3 Input log

One gzipped JSON Lines file per match: one line per tick with every seat's input frame and controller. Used by `tools/replay` and for bug reports. Kept 30 days.

### 9.4 Sessions

A human **session** is one continuous connection (including reconnections). The server tracks the number of consecutive matches per session; `tools/analyze` uses it for H12. The client shows a short **tester code** (first 6 characters of the session id) in the menu so survey answers can be linked to telemetry (`docs/PLAYTEST_PLAN.md` §6).

### 9.5 Privacy

Logs store the chosen display name and random ids only. No IP addresses in match logs (operational logs may contain them and are kept 14 days).

---

## 10. Testing and CI

| Layer | Tool | What |
|---|---|---|
| Sim unit | Vitest | Every system and pure function; every GR rule ID |
| Sim scenario | Vitest | Scripted inputs over many ticks with expected outcomes (for example "Beast rams Runner into a wall") |
| Sim property | Vitest | Invariants over random seeded matches: `0 ≤ hpFrac ≤ 1`, `0 ≤ flux ≤ 100`, players inside bounds, no NaN |
| Determinism | `pnpm sim:determinism` | Same seed twice gives the same hash; replay of a logged match gives the same hash |
| Server | Vitest with `@colyseus/testing` | Join, seat replacement, reconnection, rate limits, phase flow, code rooms |
| Client unit | Vitest (jsdom where needed) | Input mapping, keyboard aim, lock-on math, interpolation, reconciliation |
| Browser smoke | Playwright | Load, name entry, Play, HUD visible, move, morph, results screen |
| Map | `pnpm map:validate` | `docs/MAP_SPEC.md` §10 rules |
| Size | `pnpm check:size` | Client under 5 MB gzipped |
| Soak | `pnpm loadtest` (nightly) | 20 bot-only rooms for 2 hours, no crash, flat memory |

`ci.yml` runs on every push to `main`: setup from the frozen lockfile, lint, typecheck, unit and sim tests, server tests, determinism (short: 5 matches), build, size check, map validation and Playwright smoke. `nightly.yml` runs the full determinism suite and the soak test.

---

## 11. Debug tools and dev cheats

| Tool | How | Shows or does |
|---|---|---|
| Debug overlay | F3 | FPS, frame time, RTT, server tick, local tick, prediction error (last, average), corrections per minute, interpolation buffer depth, entity counts, input scheme, exact `hpFrac` and Flux |
| Hitbox view | F4 | Player circles, wall and cover boxes, projectile radii, zone radius, Rail Shot width |
| Network simulation | URL `?lag=150&jitter=20&loss=2` | Adds delay, jitter (ms) and loss (%) on the client in both directions (`docs/NETWORK_PROTOCOL.md` §12) |
| Dev console | Backtick key, only when the server has `DEV_CHEATS=1` | Commands below |

Dev commands (rejected unless `DEV_CHEATS=1`): `/flux <n>`, `/hp <fraction>`, `/form <runner|beast|turret>` (instant, no cost), `/kill`, `/endmatch`, `/bots <n>`, `/difficulty <easy|normal|hard>`, `/mode <frenzy|zone>`, `/dummies <on|off> [speed]` (bots stop shooting and strafe on fixed paths, for the fairness test), `/freeze` (bots stop moving), `/tp <x> <y>`.

---

## 12. Deployment and environments

| Environment | Where | How |
|---|---|---|
| Local | Developer machine | `pnpm dev` |
| CI | GitHub Actions | Section 10 |
| Playtest | One VPS (region per OQ-002) | Docker Compose: `server` container (Node), `caddy` container serving `apps/client/dist` and proxying WSS to the server, a volume for `data/matches` |

- Image built by a GitHub Action on tags `proto-*`, pushed to the GitHub Container Registry, deployed with a script over SSH (`docker compose pull && docker compose up -d`). Keep the previous image tag for rollback.
- Domain: a playtest subdomain (OQ-003). Caddy handles TLS automatically.
- `/healthz` returns build id, uptime, room count and average tick time. An external uptime check pings it every minute during playtest weeks.
- VPS size for the prototype: 2 to 4 vCPU, 4 to 8 GB RAM is enough for the planned load (20 rooms).
- The playtest build always runs with `DEV_CHEATS=0`.

---

## 13. Performance budgets

| Budget | Target | Checked by |
|---|---|---|
| Server tick time per room (8 players) | under 4 ms average, under 8 ms p99 | Tick timer, `/healthz`, soak test |
| Rooms per vCPU | 20 or more | Load test |
| Client frame rate | 60 FPS on a mid-range laptop (integrated GPU) | Debug overlay, client stats |
| Draw calls, triangles | under 100, under 100,000 | Debug overlay |
| Client JS heap | under 200 MB | Chrome DevTools during the soak |
| Initial download | under 5 MB gzipped | `pnpm check:size` |
| Downstream bandwidth per client | under 10 KB/s average in a full room | Server byte counters |
| Upstream per client | under 4 KB/s | Server byte counters |

---

## 14. Security for the prototype

- Clients send inputs only. Every input field is range-checked and clamped (`docs/NETWORK_PROTOCOL.md` §5.2). Malformed messages are dropped; 50 malformed messages in 10 s kicks the client.
- Inputs above 40 per second are dropped (`net.maxInputsPerS`).
- Names: trimmed, 1 to 16 characters, letters, digits, spaces, `_` and `-` only; otherwise replaced with a generated name.
- Dev cheats are off unless `DEV_CHEATS=1`, and the playtest deployment never sets it.
- No secrets in the client bundle. CORS and WebSocket origin limited to `PUBLIC_ORIGIN`.
- Full state goes to every client in the prototype (D-039). This is acceptable because no prototype mechanic hides information.

---

## 15. Production extension points

| Future feature | Seam that exists in the prototype |
|---|---|
| Characters and kits | Abilities are looked up per form through `abilityFor(player)`; a kit can override the form's ability and weapon modifiers (D-016) |
| Overdrive and Ultimates | Reserved input bit `ultimate`; `systems/` has a slot after `flux` |
| Crates and crate weapons | Reserved input bit `crate`; crate points exist in map data |
| Arena events | Walls are loaded through `MapRuntime`, which can swap wall sets per map state |
| New modes | `ModeRules` interface |
| CrazyGames SDK, ads, usernames | `PlatformAdapter` |
| Accounts, XP, persistence | Player identity is an opaque string id; a backend service can be added under `apps/server/src/backend` |
| Interest management | Schema grouped per entity; switch to `StateView` without changing the sim |
| Regions, Redis presence | Server keeps no state outside rooms |
| Art | Each entity view in `render/entities` is the only place that builds meshes |

---

## 16. Coding conventions

- Named exports only; no default exports.
- File names: `camelCase.ts` for modules, `PascalCase.ts` for classes.
- No `any`. Use `unknown` and narrow.
- Cite rule and decision ids in comments where code implements a rule: `// GR-7.11 scatter falloff`.
- Errors: the server never crashes on bad client data; it logs and drops. Unexpected internal errors in a room end that room (players see an error screen with a "Play again" button) and are logged with the match id and tick.
- Commits: `<task id>: <summary>`, for example `T-043: Scatter Cannon pattern and falloff`.
- Work only on `main`; never create another branch or worktree. Keep one task per commit where possible.
