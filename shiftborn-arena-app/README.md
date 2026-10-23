# Shiftborn Arena

A browser-based, top-down 3D multiplayer arena game for up to 8 players. Players switch in real time among **Runner**, **Beast** and **Turret**. Runner counters Turret, Turret counters Beast and Beast counters Runner. Morphing costs **Flux**, matches last 10 minutes, players find guns as loot and unlock forms by KOs, and bots keep every room full. The 2026-10-23 release changes are tracked in [docs/CHANGE_CONTRACT.md](docs/CHANGE_CONTRACT.md).

> **Fast path for Codex:** read `AGENTS.md`, find the active item in `TASKS.md`, then read only the specifications named by that task. On a fresh clone, install everything with `pnpm run setup`. Work only on `main`.

"Shiftborn Arena" is the working title (D-001, OQ-001).

---

## Current state

**Phase:** Prototype. **Completed:** T-001 through T-007, T-010 through T-034, and T-040. **T-008:** optional tabletop task, still TODO. T-031 is complete under D-066 staged acceptance; the unchanged full AT-NET-17 check remains mandatory in T-068 before the Fun Gate. FPP mouse aim stays disabled under D-065 pending OQ-018.

T-023 added version and name authentication, authoritative welcome data, and ordered per-tick event batches. With the pinned Colyseus SDK, a protocol mismatch returns HTTP 400 with JSON `code: 4000`; the SDK join helper exposes HTTP 400 as its error code. This transport behavior was approved for T-023.

T-024 fills rooms with eight idle placeholder bots. Humans immediately take an empty seat or replace a selected bot; a final human leave hands the same life to a new bot. Real bot AI begins at T-051.

T-025 packs quick-play humans into the fullest eligible room. Code rooms match by exact six-character code, keep the first human as host, accept pending host settings, and let late joiners wait for the next match. Quick-play rooms lock at 60 seconds remaining and unlock at RESULTS.

T-026 retains human seats and input history through a 30-second reconnect window. Hidden and AFK players switch to a neutral Proxy controller; final departure hands the seat to a bot or empties it and then updates the host. Bot-only rooms dispose. Graceful shutdown sends a notice, waits up to 10 seconds for the current RESULTS phase, and closes with code 4004. Real proxy behavior is T-055; client retry and resync are T-031/T-035.

T-027 replies to private client pings with authoritative tick and monotonic server-time anchors. Private probes measure each connected human's RTT every two seconds; the median of the last ten accepted samples supplies GR-7.9 projectile spawn advance. T-031 adds production client clock sync, ping scheduling and network simulation.

T-028 writes the Stage A match log and a gzipped authoritative input log for each match under `MATCH_LOG_DIR/YYYY-MM-DD/`. Run `pnpm replay <match-log>` against a `<matchId>.jsonl` file to replay its sibling input log and verify every simulation tick and the final hash. Full ranking and telemetry remain T-044 and T-130.

T-029 adds server dev commands behind `DEV_CHEATS=1`; the default remains `0`. Valid commands execute at the next room tick and produce private results and replayable checkpoints. T-038 adds the Backtick browser console, gated by the server's validated `welcome.devCheatsEnabled` signal. F3 shows live debug metrics and F4 draws collision geometry in development builds.

T-030 adds a responsive browser shell with Landing, Connecting, InMatch and Error screen states, local connection intents, a WebGL 2 capability gate, safe generated player names, room-code entry and link handling, and versioned settings in localStorage. T-031 now connects Play/Create/Join through Colyseus, validates Welcome and Schema state before entering the match, shows live server ticks, replies to probes, and uses a production client clock. Unexpected drops use the room token with 500, 1000, 2000, 4000, then 8000 ms retries under one fixed 30-second deadline. `?lag=`, `?jitter=`, and `?loss=` delay raw frames in FIFO order before state decoding; `loss` adds a 200 ms hold rather than dropping frames. D-066 permits T-031 completion after production networking and AT-NET-19 pass; full AT-NET-17 playability at `?lag=150&loss=2` remains mandatory in T-068. Live movement and no-console-error checks at that URL are partial evidence, not an AT-NET-17 pass. T-032 renders the static greybox arena from shared map boxes and markers with TPP behind the player or FPP at eye height. TPP is the saved default; V or the in-match button switches views. The camera follows authoritative aim, uses form zoom, TPP lead, wall/cover collision and TPP-only occlusion fading, and owns one disposable canvas. T-033 adds form silhouettes, names, status and ability effects, instanced shards, cluster markers and rubble. T-034 now maps documented keyboard and mouse controls, samples 30 Hz frames with redundancy through Connection, aims via the TPP ground ray, and draws the pointer reticle. Real-server movement passed both normal and `?lag=150&jitter=20&loss=2` browser checks. FPP mouse movement leaves aim unchanged, hides the aiming reticle, and restores the system cursor under D-065; OQ-018 tracks the detailed future rule. D-064 rejects simultaneous rising morph targets without affecting other input, timers or Flux regeneration. T-034 acceptance and real-server input checks pass. T-065 owns the full controls card and in-match menu, and T-122 applies other saved settings to gameplay, rendering and audio.

The renderer exposes `setView`, `setEntities`, `ingestEventBatch`, `setCoverIntact`, `setZoneMarkersVisible`, `setActiveShardPoints`, `coverIdsBetweenCameraAnd`, and camera `groundAtNdc` for later client tasks. The visual harness at `http://localhost:5173/visuals.html` has replayable scenario buttons. “LIVE SIM” uses scripted frames against the production simulation for implemented morph, Dash, shards and protection. “PRESENTATION FIXTURE” scenarios demonstrate future Ram, Rail, stun, knockback and cover rebuild inputs without claiming those gameplay producers are live.

T-040 exports `LocalPredictState` and `predictStep` from `@shiftborn/sim`. The local step shares the server's input, morph, Dash, movement, heat, weapon-timer and D-069 shot-index rules. Its 1,000 seeded sequences match every predictable local field on every tick when the same authoritative Flux, phase, cover and status inputs are supplied (D-068). T-035 owns the browser pending queue, authoritative replay and visual correction under D-067. D-071 added the missing restoration fields in protocol version 2, D-072 added shot-intent input tags in version 3, and T-038 adds the trusted dev-console capability in version 4; older clients must reload against the matching server build.

T-035 now predicts and reconciles the local player; its real-server AT-NET-06 and AT-NET-07 checks pass. T-036 renders remote players from one-second, stable-ID histories at the clock estimate minus 100 ms, extrapolates at most 100 ms, and caps non-respawn visual catch-up under 0.6 m per frame. Validated world events wait on the same render timeline; local vitals, own damage/death and own-hit feedback are delivered immediately through typed subscriptions. Real two-client AT-NET-08 passes at 0/100/200 ms, 150 ms plus 2% head-of-line loss, and the 150 ms/20 ms jitter/2% loss case. T-037 projectile views start predicted local shots on the click frame, retain exact server-id links without jumps, schedule remote flight on the delayed world timeline, and play terminal effects. [The version 2 failure and version 3 verification trace](docs/T037_HOL_TRACE.md) records D-072's durable shot-intent rule: server catch-up can apply N+1 while confirming the predicted tag N. The uninstrumented AT-NET-09 matrix passed 15/15, followed by 10/10 repeated loss and jitter runs. T-038 draws debug hitboxes and live metrics and routes authorized commands with private results. HUD presentation, sound and future FPP mouse controls remain with their later tasks.

| Stage | Goal | Gate |
|---|---|---|
| A. First Playable | Online Frenzy, bots, three forms, morphing, Flux, abilities and core HUD | Fun Gate, T-100 |
| B. Playtest Build | Zone Frenzy test, keyboard aiming, telemetry, deployment and external tests | Approval Gate, T-150 |
| Production | Characters, crates, Overdrive, progression, art and CrazyGames launch | D-070 must be `Approve` |

The prototype tests H1 to H14 in `docs/PROTOTYPE_SCOPE.md` §5. It must prove that the core loop is understandable, balanced, responsive and fun before production begins.

---

## Install everything with one command

### Requirements

- Node.js `24.22.0` from `.nvmrc`
- pnpm `12.14.0` from `package.json`
- Git
- Chrome or Edge for play; Playwright Chromium is installed by setup
- Docker and Docker Compose only for deployment

After cloning and entering the repository:

```bash
pnpm run setup
```

That single command:

1. installs every workspace dependency from `pnpm-lock.yaml` with `--frozen-lockfile`;
2. uses the exact versions in D-060 and the package manifests; and
3. installs Chromium for Playwright tests.

Do not install project libraries individually. To change a dependency, update its package manifest and lockfile deliberately, explain the reason, and keep the exact version pin.

For local development, copy `.env.example` to `.env` for server settings and `apps/client/.env.example` to `apps/client/.env` for client build settings. The defaults also work without either file. Keep real `.env` files out of Git.

---

## Start, build and test

Commands become functional when the task in the last column is complete. Until then, a stub may print `not implemented`.

| Command | Purpose | Available from |
|---|---|---|
| `pnpm run setup` | Install all packages and Playwright Chromium | T-001 |
| `pnpm dev` | Start server on 2567 and client on 5173 | T-007 |
| `pnpm build` | Build every workspace package | T-001 |
| `pnpm lint` | Run ESLint and project rules | T-001 |
| `pnpm typecheck` | Run TypeScript checks | T-001 |
| `pnpm test` | Run all Vitest suites | T-001 |
| `pnpm vitest run -t "AT-MORPH-03"` | Run one test by acceptance id | T-001 |
| `pnpm check:size` | Enforce the 5 MB gzipped client limit | T-002 |
| `pnpm map:validate` | Validate map rules V1 to V9 | T-005 |
| `pnpm sim:determinism` | Compare two runs of seeded matches | T-056 |
| `pnpm test:e2e` | Run the Playwright smoke flow | T-068 |
| `pnpm replay <match-log>` | Replay recorded inputs and verify per-tick and final state hashes | Implemented in T-028 |
| `pnpm analyze <logs-dir>` | Build playtest metrics and reports | T-067 / T-131 |
| `pnpm loadtest` | Run the default 20-room, 2-hour soak | T-141 |

Start both the watched server and Vite client with one command:

```bash
pnpm dev
```

Open <http://localhost:5173> for the greybox client shell. You can edit a generated player name, connect with Play/Create/Join, follow `?room=CODE` links, read How to play, and change persistent local settings. A successful connection shows live authoritative server ticks and greybox entities. TPP supports WASD, mouse aim, LMB or Space fire, number-key morph requests, E ability, and V camera switching. FPP mouse aim is disabled; press V to return to TPP for mouse aiming. A detailed FPP turning rule remains open in OQ-018. `http://localhost:2567/healthz` checks the local server; Vite proxies the same route at `http://localhost:5173/healthz`.

Useful debug controls, when their tasks are complete:

| Need | Action |
|---|---|
| Join the same room | Share `?room=CODE` |
| Simulate a poor network | Add `?lag=150&jitter=20&loss=2` |
| Performance and netcode overlay | F3 |
| Hitbox view | F4 |
| Dev console | Set `DEV_CHEATS=1`, restart and press backtick |

---

## Prototype controls

| Action | Mouse and keyboard | Keyboard only |
|---|---|---|
| Move | W A S D | W A S D |
| Aim | Mouse | Arrow keys; Q soft lock-on in Stage B |
| Fire | Left mouse or Space | Space |
| Runner / Beast / Turret | 1 / 2 / 3 | 1 / 2 / 3 |
| Ability | E | E |
| Scoreboard | Tab | Tab |
| Menu | Esc or P | Esc or P |

The complete binding and accessibility contract is in `docs/CONTROLS_UI.md`.

---

## Documentation map

`AGENTS.md` contains the authority order and task algorithm. The table below answers where a specific kind of information lives.

| File | Source of truth for |
|---|---|
| `AGENTS.md` | Agent workflow, `main`-only rule, hard constraints and definition of done |
| `DECISIONS.md` | Approved project decisions |
| `TASKS.md` | Ordered queue, dependencies, task status and production epics |
| `OPEN_QUESTIONS.md` | Unresolved choices; never approval |
| `docs/PROTOTYPE_SCOPE.md` | Included and excluded work, hypotheses and gates |
| `docs/GAME_RULES.md` | Exact gameplay behavior and tick order |
| `docs/BALANCE.md` | Every gameplay value, unit, formula and tuning range |
| `docs/ARCHITECTURE.md` | Stack, layout, shared sim, tests, logs, CI, deployment and budgets |
| `docs/NETWORK_PROTOCOL.md` | Messages, prediction, reconciliation, interpolation and lifecycle |
| `docs/CONTROLS_UI.md` | Input, HUD, screens, camera, sound and accessibility |
| `docs/MAP_SPEC.md` | `greybox_v1`, map data, navigation and V1 to V9 validation |
| `docs/BOT_SPEC.md` | Bot decisions, combat, movement, tiers and seat handover |
| `docs/ACCEPTANCE_TESTS.md` | Observable pass or fail outcomes |
| `docs/PLAYTEST_PLAN.md` | Rounds, metrics, survey and report format |
| `docs/GDD.md` | Full long-term design, reference only during the prototype |
| `CLAUDE.md` | Compatibility pointer to `AGENTS.md` |

The two Markdown documents beside the repository folder are background context. Repository documents override them during implementation.

---

## Technology and layout

TypeScript strict-mode pnpm workspace; Three.js and Vite client; authoritative Node.js and Colyseus server; one deterministic simulation shared by server and client; Vitest and Playwright; Docker Compose and Caddy for the playtest VPS. D-060 contains every exact version.

```text
packages/shared   Balance, constants, protocol and map data; no dependencies
packages/sim      Deterministic game simulation; depends only on shared
apps/server       Colyseus rooms, seats, bots, matchmaking and logs
apps/client       Three.js rendering, input, prediction and HUD
tools/            Map validation, analysis, replay and load testing
docs/             Authoritative specifications
```

The complete tree and dependency rules are in `docs/ARCHITECTURE.md` §3.

---

## Git workflow

1. Use only the existing `main` branch. Never create a feature branch, pull-request branch or worktree.
2. Read `AGENTS.md` and choose one eligible task from `TASKS.md`.
3. Mark implementation work `IN PROGRESS`, make the smallest complete change and run its acceptance tests.
4. Mark it `DONE` only when its definition of done is satisfied.
5. Commit or push only when the user requests it. Requested commits use `T-xxx: summary`.

If a specification is missing or contradictory, add an entry to `OPEN_QUESTIONS.md` instead of guessing.

---

## Deployment

The playtest target is one VPS with a Node.js server container and Caddy serving the client and proxying secure WebSockets. Images use `proto-*` tags; the previous tag remains available for rollback. The playtest build always has `DEV_CHEATS=0`. Details are in `docs/ARCHITECTURE.md` §12 and tasks T-069 and T-140.

---

## License

Private repository, all rights reserved, unless Hamza decides otherwise (OQ-005).
