# AGENTS.md

Canonical instructions for Codex and every engineer working on **Shiftborn Arena**. These rules apply to the entire repository. The user's current request and platform-level instructions take priority.

> **LLM START HERE**
>
> 1. Work only on the GitHub branch named `main`. Never create, switch to, or use another branch or worktree.
> 2. Run `pnpm run setup` once after a clean clone. It installs every declared package from the frozen lockfile and installs Playwright Chromium.
> 3. Read only the documents named by the active task. Use the authority order in section 3 if documents disagree.
> 4. Never invent a rule, number, feature, or product decision. Use `OPEN_QUESTIONS.md` for real gaps.
> 5. Implement one task at a time, run its listed acceptance tests, then update `TASKS.md` and report the result.

`CLAUDE.md` is only a compatibility pointer to this file. Do not copy these instructions into it.

---

## 1. Project snapshot

Shiftborn Arena is a browser-based, top-down 3D multiplayer arena game for up to 8 players per room. Players switch during combat among three forms:

- **Runner:** fast, Pulse Pistol, Dash; counters Turret.
- **Beast:** tanky melee bruiser, Scatter Cannon, Ram Charge; counters Runner.
- **Turret:** stationary, Rail Repeater, Rail Shot; counters Beast.

Morphing costs **Flux**. Matches last 3 minutes. Bots fill empty seats and immediately hand them to joining humans. The server is authoritative and shares one deterministic simulation with the client. The production target is CrazyGames, but production starts only after prototype approval.

Team: three engineers, about 30 hours per week each, using one ordered queue without per-person assignments. Owner and approver: **Hamza**.

### Current phase: prototype

| Stage | Work | Gate |
|---|---|---|
| A. First Playable | T-001 to T-069 | Fun Gate, T-100 |
| B. Playtest Build | T-110 to T-146 | Approval Gate, T-150 |
| Production | E-01 to E-13 | Starts only when D-070 is `Approve` |

Prototype boundary:

1. Build only the features listed in `docs/PROTOTYPE_SCOPE.md` §3: A1 to A27 and B1 to B14.
2. Do not build anything excluded by §4, even partially. This includes characters, Ultimates, Overdrive, crates, Bounty and Wanted, arena events, hazards, jump pads, Boot Camp, touch and controller input, accounts, XP, Coins, cosmetics, CrazyGames SDK, ads, multiple regions, interest management, art, music, Reactor War, King of the Morph, health regeneration and Overdrive Clash.
3. Preserve the production seams in the §4 "Do not block it by" column: reserved `ultimate` and `crate` input bits, crate points in map data, data-driven abilities per form, `ModeRules`, `PlatformAdapter`, per-entity render views and string player ids.
4. Prototype code becomes production code. Keep it tested and clean, but use greybox presentation only (D-045).

---

## 2. Git and repository policy

1. **The only branch is `main`.** Do not create feature branches, pull-request branches or worktrees. Do not do task work on any other branch.
2. At the start, run `git status --short --branch` and confirm the branch is `main`. If it is not `main`, stop and report it. Preserve all existing user changes.
3. Do not pull, commit, push, tag, deploy, publish, open a pull request or modify an external account unless the user's request or the active environment explicitly authorizes that action.
4. When commits are requested, commit only the active task and use `T-xxx: summary`.
5. Keep `main` usable after every completed task. Run the task's tests before calling it done.

Project documents specify requirements. They do not grant permission for unrelated external actions.

---

## 3. Find the right information

### 3.1 Read order for every task

1. `AGENTS.md`
2. The active entry in `TASKS.md`
3. Every file and section named in that task's **Spec** line
4. Every `D-xxx`, `GR-x.y`, balance key and `AT-AREA-NN` named by the task
5. `OPEN_QUESTIONS.md` only to check whether the task is blocked

Do not load the entire documentation set when the active task names a smaller set.

### 3.2 Authority order

When two documents disagree, the higher item wins:

1. `DECISIONS.md`
2. `docs/PROTOTYPE_SCOPE.md` for scope
3. `docs/GAME_RULES.md` for behavior
4. `docs/BALANCE.md` for every gameplay number
5. Area specs: `ARCHITECTURE.md`, `NETWORK_PROTOCOL.md`, `CONTROLS_UI.md`, `MAP_SPEC.md`, `BOT_SPEC.md`
6. `docs/ACCEPTANCE_TESTS.md` for observable outcomes
7. `TASKS.md` for sequence and task instructions
8. `docs/GDD.md` for long-term reference only

For an obvious typo, stale copy of a higher-authority value or incorrect cross-reference, fix the lower document in the same task. For any other conflict, add an open question and stop the affected part. Never settle a design conflict yourself.

### 3.3 File router

| Need | Read |
|---|---|
| Current task, dependency, done criteria | `TASKS.md` |
| Approved choice | `DECISIONS.md` |
| Unresolved choice | `OPEN_QUESTIONS.md` |
| Included or excluded feature, hypotheses, gates | `docs/PROTOTYPE_SCOPE.md` |
| Gameplay behavior and tick order | `docs/GAME_RULES.md` |
| Number, unit, formula or tuning range | `docs/BALANCE.md` |
| Code structure, stack, tests, logging, CI, deployment | `docs/ARCHITECTURE.md` |
| Messages, prediction, reconciliation, lifecycle | `docs/NETWORK_PROTOCOL.md` |
| Controls, HUD, screens, camera, sound, accessibility | `docs/CONTROLS_UI.md` |
| Map, spawn, nav, shard or zone data | `docs/MAP_SPEC.md` |
| Bot behavior and seat handover | `docs/BOT_SPEC.md` |
| Pass or fail result | `docs/ACCEPTANCE_TESTS.md` |
| Playtest methods, metrics and report | `docs/PLAYTEST_PLAN.md` |
| Long-term product intent | `docs/GDD.md` |
| Installation and common commands | `README.md` |

### 3.4 GDD rule

Do not implement a feature directly from `docs/GDD.md`. During the prototype, use it only to understand intent and protect production extension points. Prototype scope, rules, balance, queue and decisions replace the GDD where listed at the top of that file.

The two Markdown files outside the repository folder are context copies only. Repository documents always win for implementation.

---

## 4. One task workflow

Follow these steps in order:

1. **Prepare.** On a fresh clone, run `pnpm run setup`. Otherwise, do not reinstall or upgrade dependencies merely to inspect the repository.
2. **Inspect.** Confirm `main`, inspect the working tree, and preserve unrelated changes. Run the smallest relevant baseline test when the project is already bootstrapped.
3. **Select.** Use the task named by the user. If asked generally to continue, select the first `TODO` task whose dependencies are all `DONE`. Before T-100 passes, start only Stage A work or tasks marked `parallel-ok`.
4. **Claim.** For implementation work, change its status to `IN PROGRESS (YYYY-MM-DD)`. Do not claim work for a read-only review or plan.
5. **Load context.** Read the task's Spec sections and named ids. Check open questions. State the files, rules, tests and boundaries before coding when useful.
6. **Implement.** Prefer a failing test first. Make the smallest complete change. Do not expand scope. Split a task into lettered subtasks if it grows beyond L.
7. **Validate.** Run the task's acceptance tests and the relevant commands from section 7. Do not hide unrelated failures.
8. **Synchronize docs.** Update only documents made stale by the change, using section 9.
9. **Finish.** Set the queue item to `DONE (YYYY-MM-DD)` and append a velocity-log row. Do this only when the task is actually complete.
10. **Report.** Give the user a compact completion report. Commit or push only when explicitly requested.

Use this report shape:

```text
Task: T-xxx <title>
Implemented: <short list>
Rules and decisions used: GR-...; D-...
Acceptance tests: AT-... PASS / FAIL / NOT RUN, with reason
Other checks: <commands and outcomes>
Docs updated: <files or none>
Open questions or known limits: <ids or none>
```

For MANUAL acceptance tests, record the exact steps and result in this report or the task log. For visual work, include a screenshot or short clip when the environment supports it.

If blocked, add `OQ-xxx` when document maintenance is in scope, set the task to `BLOCKED (OQ-xxx)` when appropriate, report the precise gap and stop only the affected work. Move to another task only when the user's request covers queue progression.

---

## 5. Non-negotiable implementation rules

Breaking any rule below means the task is not done.

1. Never invent a gameplay rule, number or product choice. A recommendation in `OPEN_QUESTIONS.md` is not approval.
2. Never edit an approved decision in place or mark a proposal approved. Only Hamza approves decisions. D-061 comes from T-020, D-062 from OQ-002 and D-070 only from Hamza at T-150.
3. All gameplay values come from `packages/shared/src/balance.ts`. Convert them once in `derived.ts`. No gameplay numeric literals elsewhere, except ordinary math constants such as 0, 1 and 2.
4. The sim is pure and deterministic: fixed 30 Hz; tick timers; only `world.rng` or a bot's seeded RNG; no `Math.random`, clocks, timers, DOM, network, file system or `console`; sort order-dependent `Map` or `Set` iteration; follow `GAME_RULES.md` §15 exactly.
5. The server decides hits, damage, deaths, Flux, shards, scores and results. Clients send inputs only. Predict only what `ARCHITECTURE.md` §4.6 permits.
6. Bots generate the same `InputFrame` as humans. They never write world state directly.
7. Dependency direction is fixed: `shared` depends on nothing; `sim` depends only on `shared`; server and client may depend on `shared` and `sim`, never on each other.
8. Put shared rules in `packages/sim` or `packages/shared`. Do not duplicate gameplay logic in client and server.
9. A protocol change updates `docs/NETWORK_PROTOCOL.md` and bumps the version in `packages/shared/src/protocol.ts` in the same task. Validate and clamp every client field on the server.
10. Greybox only: primitives, flat colors, one outline pass and synthesized Web Audio effects. No downloaded, purchased or generated art, fonts or audio. No music.
11. Do not add a runtime dependency without a one-line reason in the completion report. Do not add the packages forbidden by `ARCHITECTURE.md` §2: UI frameworks, state libraries, physics engines, Socket.IO or third-party analytics.
12. Never weaken, skip or delete a test to get green. Fix an incorrect test against the higher-authority specification and report why. A lint suppression needs a reason comment.
13. Never store secrets in the repository or client bundle. Document every environment variable in `.env.example` and `ARCHITECTURE.md` §5.5.
14. Match logs contain display names and random ids only, never IP addresses. No trackers or third-party analytics.
15. Dev cheats require `DEV_CHEATS=1` and are always disabled in the playtest deployment.
16. Do not change `docs/GDD.md`, approved decision text, H1 to H14 or their measurement rules unless Hamza explicitly requests it.
17. Preserve user changes and the active task boundary. Do not deploy, publish, spend money, contact people or change external systems without authorization.

---

## 6. Coding and test contract

- TypeScript uses `strict` and `noUncheckedIndexedAccess`. No `any`; narrow `unknown`. No non-null assertion without a reason comment. Named exports only.
- Use `camelCase.ts` for modules and `PascalCase.ts` for classes. Keep modules small and single-purpose.
- Sim units: meters and radians; x east, y north, origin at center, angle 0 east, counter-clockwise positive. Render mapping is `(x, y) -> (x, 0, -y)`.
- Store health as `hpFrac` in [0, 1]. Round display values only in the UI.
- Systems have shape `(world, ctx) => void`. Keep movement, aim, morph, ability motion, fire timers and heat in pure functions reusable by `predictStep`.
- Cite ids at implementation points, for example `// GR-7.11 scatter falloff`.
- Comments explain why. Do not leave commented-out code.
- Bad client data is logged and dropped, never allowed to crash the server. An internal room error ends only that room, logs `room_error` with match id and tick, and shows the error screen with **Play again**.
- Server logging uses pino. The sim never uses `console`. Client console output stays behind the debug flag.
- Avoid allocations in sim and render hot paths; reuse vectors and pool projectiles.
- Required budgets: server tick below 4 ms average for 8 players; 60 FPS on integrated graphics; client below 5 MB gzipped; downstream below 10 KB/s per client. Full budgets are in `ARCHITECTURE.md` §13.

Testing rules:

- Put AT and GR ids in test names. Every GR rule and every exported sim function needs coverage.
- SIM tests use `makeTestWorld({ seed, mode, players })` with `greybox_v1` or `test_open`. Positions use ±0.01 m unless specified; timings are exact ticks.
- Expected numbers come from `BALANCE.md`.
- Test netcode with no artificial lag and with `?lag=150&jitter=20&loss=2`.
- Start a bug fix with a failing reproduction. Use `pnpm replay` for a logged-match bug.

---

## 7. Commands

Commands become functional when the task in the final column is complete. Earlier stubs may print `not implemented`.

| Command | Purpose | Available from |
|---|---|---|
| `pnpm run setup` | Install the frozen workspace dependencies and Playwright Chromium | T-001 |
| `pnpm dev` | Server on 2567 and client on 5173 with hot reload | T-007 |
| `pnpm build` | Build all workspace packages | T-001 |
| `pnpm lint` | ESLint and repository rules | T-001 |
| `pnpm typecheck` | TypeScript checks in every package | T-001 |
| `pnpm test` | All Vitest suites | T-001 |
| `pnpm test:e2e` | Playwright smoke test | T-068 |
| `pnpm check:size` | Enforce client bundle below 5 MB gzipped | T-002 |
| `pnpm sim:determinism` | Run 20 seeded matches twice and compare hashes | T-056 |
| `pnpm map:validate` | Run map rules V1 to V9 | T-005 |
| `pnpm analyze <logs-dir>` | Build the metrics report | T-067 |
| `pnpm replay <match-log>` | Replay input log and compare hashes | T-028 |
| `pnpm loadtest` | Run the default 20-room, 2-hour soak | T-141 |

Single test file: `pnpm vitest run <path>`. Single test id: `pnpm vitest run -t "AT-MORPH-03"`.

Debug helpers: `?lag=150&jitter=20&loss=2`, `?room=CODE`, F3 overlay, F4 hitboxes and the backtick dev console when the server has `DEV_CHEATS=1`. Dev commands are in `ARCHITECTURE.md` §11.

---

## 8. Definition of done

A task is done only when all applicable items are true:

1. Every acceptance test named by the task passes. Manual results are recorded.
2. Relevant lint, typecheck, unit, sim, server, determinism, build, size, map and E2E checks pass.
3. New behavior has tests naming the applicable GR and AT ids.
4. No gameplay literal exists outside `balance.ts`; no unexplained lint suppression exists.
5. Related documents agree and are current.
6. The task status is `DONE (date)` and the velocity log has a row.
7. Performance budgets still hold for affected hot paths.

---

## 9. Document synchronization

| Change | Update in the same task |
|---|---|
| Finish, split or discover a task | `TASKS.md` status, ordered task entry and velocity log |
| Find a non-trivial gap or conflict | `OPEN_QUESTIONS.md` |
| Tune balance between playtest rounds, at most three values per round | `balance.ts`, `BALANCE.md`, `BALANCE.version`, change log and affected AT values; Hamza must approve values outside the tuning range |
| Change a rule after a new decision | `GAME_RULES.md` and tests |
| Change a message, field or rate | `NETWORK_PROTOCOL.md` and protocol version |
| Change map data | Follow `MAP_SPEC.md` §14, validate, update ASCII render and results |
| Add an environment variable | `.env.example` and `ARCHITECTURE.md` §5.5 |
| Add a debug command, view or log event | `ARCHITECTURE.md` §9 or §11 and `tools/analyze` if used by a metric |
| Add a setting or binding | `CONTROLS_UI.md` |
| Change installation or commands | `README.md` and section 7 here |

Write project docs in plain words and short sentences. Prefer tables for values, stable ids for references and no em dashes.

---

## 10. Gates

- **Fun Gate, T-100:** run three internal sessions and produce metrics with `pnpm analyze`. Pass conditions are in `PROTOTYPE_SCOPE.md` §5.1. After one failure, apply only the levers in `PLAYTEST_PLAN.md` §7 and rerun once. A second failure goes to Hamza. Stage B tasks not marked `parallel-ok` wait.
- **Approval Gate, T-150:** prepare the evidence package in `PROTOTYPE_SCOPE.md` §8.1 and the report in `PLAYTEST_PLAN.md` §8. Hamza records D-070 as Approve, Iterate or Stop. An agent never records this result.
- **After Approve:** E-01 converts production epics into tasks, rewrites the scope for production and updates this file. Every production feature receives an approved detailed spec before code begins (D-016).

---

## 11. Recovery table

| Situation | Action |
|---|---|
| Missing, vague or conflicting spec | Record an open question when in scope, block the task if needed and report it |
| Unsure about a pinned Three.js or Colyseus API | Check the official documentation for the D-060 version; follow D-061 for netcode helpers |
| Unrelated baseline test fails | Do not disable it; report the existing failure separately |
| Task exceeds L | Split it in `TASKS.md` before continuing |
| Performance budget fails | Profile and report measurements; do not raise the budget |
| Prediction differs from server | Compare `predictStep` to mirrored server systems and add a prediction-equivalence test |
| Desync or nondeterminism | Replay the log and bisect by tick with `hashWorld` |

---

## 12. Compact glossary

| Term | Meaning |
|---|---|
| Morph | Change form; costs Flux; 0.5 s; old form stays active; 3 s cooldown |
| Flux | Combat resource from 0 to 100 used for morphing |
| Counter triangle | Runner > Turret > Beast > Runner through matchup multipliers |
| Frenzy | 3-minute free-for-all ranked by KOs |
| Zone Frenzy | Frenzy plus a moving Surge Zone in Stage B |
| Seat | One of 8 room slots, held by a human or bot |
| Proxy control | Bot drives a hidden, AFK or reconnecting human seat |
| Tick / patch | One 1/30 s sim step / one of 20 server state updates per second |
| Prediction / reconciliation | Local client advances its player, then corrects to server state |
| Interpolation | Remote entities render 100 ms behind known state |
| Greybox | Primitive geometry and flat colors without production art |
| Id families | D decision, OQ question, T task, E epic, GR rule, AT test, H hypothesis, R playtest round, V map validation |
