# Shiftborn Arena

A browser-based, top-down 3D multiplayer arena game for up to 8 players. Players switch in real time among **Runner**, **Beast** and **Turret**. Runner counters Turret, Turret counters Beast and Beast counters Runner. Morphing costs **Flux**, matches last 3 minutes and bots keep every room full.

> **Fast path for Codex:** read `AGENTS.md`, find the active item in `TASKS.md`, then read only the specifications named by that task. On a fresh clone, install everything with `pnpm run setup`. Work only on `main`.

"Shiftborn Arena" is the working title (D-001, OQ-001).

---

## Current state

**Phase:** Prototype. **Completed:** T-001 through T-004. **Next task in the ordered queue:** T-005 unless the user names another eligible task.

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

Environment files are introduced by T-007. When those example files exist, copy `.env.example` to `.env` and `apps/client/.env.example` to `apps/client/.env`.

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
| `pnpm replay <match-log>` | Replay inputs and compare state hashes | T-028 |
| `pnpm analyze <logs-dir>` | Build playtest metrics and reports | T-067 / T-131 |
| `pnpm loadtest` | Run the default 20-room, 2-hour soak | T-141 |

When T-007 is done:

```bash
pnpm dev
```

Open <http://localhost:5173>, enter a name and select **Play**. Use a second browser window for a second human; bots fill the remaining seats.

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
