# PROTOTYPE_SCOPE.md

> **LLM FILE CONTRACT:** Authoritative prototype boundary, hypotheses and gates. If a feature is excluded here, do not build it even when it appears in the GDD.

What the Shiftborn Arena test prototype includes, what it excludes, and what it must prove before Hamza approves full production.

Related: `DECISIONS.md` (D-002, D-022), `docs/GAME_RULES.md`, `docs/PLAYTEST_PLAN.md`, `docs/ACCEPTANCE_TESTS.md`, `TASKS.md`.

---

## 1. Purpose

The prototype answers one question: **is the core loop worth building into a full game?**

The core loop is: move and fight in a short online free-for-all, switch between three forms that counter each other, spend Flux to morph at the right moment, and (in Zone Frenzy) weigh kills against holding an objective.

Everything not needed to answer that question is out of scope, even if it is in the GDD and will ship at launch.

---

## 2. Stages

The prototype is built and tested in two stages. Each ends in a gate.

| Stage | Name | Contents | Ends with | Who plays |
|---|---|---|---|---|
| A | **First Playable** | Online Frenzy with bots, one default character, three forms with one base ability each, Flux and shards, combat, death and respawn, match flow, greybox map, mouse aiming | **Fun Gate** (task T-100) | The team, plus up to 5 invited people |
| B | **Playtest Build** | Stage A plus Zone Frenzy, keyboard-only lock-on, playtest rooms and host settings, death recap, settings, telemetry and analysis, deployment | **Approval Gate** (task T-150) | 20 or more outside players across playtest rounds |

Stage B work does not start until the Fun Gate passes, except tasks marked `parallel-ok` in `TASKS.md`.

### 2.1 Estimated timeline

With three engineers at about 30 hours each per week, working from the task queue:

| Work | Estimate |
|---|---|
| Stage A build (tasks T-001 to T-099) | 3 to 4 weeks |
| Fun Gate sessions and fixes | 3 to 5 days |
| Stage B build (tasks T-110 to T-149) | 1.5 to 2 weeks |
| Playtest rounds R1 and R2, iteration, report | 1.5 to 2 weeks |
| **Total to the Approval Gate** | **about 7 to 9 weeks** |

Re-estimate after Stage A with real velocity and record it in `TASKS.md`.

---

## 3. Included features

Every feature below is specified in the listed document. If a feature is not on this list, it is out of scope.

### 3.1 Stage A: First Playable

| # | Feature | Spec |
|---|---|---|
| A1 | Monorepo, CI, lint, type check, tests, size check | `docs/ARCHITECTURE.md` §3, §10 |
| A2 | Shared deterministic simulation at 30 Hz with seeded RNG | `docs/ARCHITECTURE.md` §4 |
| A3 | Authoritative Colyseus server running the simulation | `docs/ARCHITECTURE.md` §5 |
| A4 | Client prediction of own player, reconciliation, interpolation of others | `docs/NETWORK_PROTOCOL.md` §6 to §8 |
| A5 | Connection lifecycle: join, quick play, reconnect within 30 s, hidden tab handover, AFK | `docs/NETWORK_PROTOCOL.md` §9 |
| A6 | Greybox map `greybox_v1` (walls, 10 destructible cover pieces, 10 spawn points, 10 shard points, 5 zone points) | `docs/MAP_SPEC.md` |
| A7 | Two local camera views, TPP by default and FPP at eye height, with readability rules | `docs/CONTROLS_UI.md` §7 |
| A8 | Movement, wall collision and sliding, no player body collision | `docs/GAME_RULES.md` §4 |
| A9 | Three forms (Runner, Beast, Turret) with stats, hitboxes and the Turret turn cap | `docs/GAME_RULES.md` §4 |
| A10 | Morphing with Flux cost, 0.5 s morph, 3 s cooldown, old-form-during-morph rule | `docs/GAME_RULES.md` §5 |
| A11 | Health as an exact fraction, display rounding | `docs/GAME_RULES.md` §6 |
| A12 | Form weapons: Pulse Pistol, Scatter Cannon (fixed pellet pattern, falloff), Rail Repeater (arm distance, heat) | `docs/GAME_RULES.md` §7 |
| A13 | Matchup modifiers, Turret front-arc armor, EFFECTIVE and RESISTED feedback | `docs/GAME_RULES.md` §6, §7 |
| A14 | Base abilities: Dash, Ram Charge, Rail Shot | `docs/GAME_RULES.md` §8 |
| A15 | Status effects used by the prototype: stun, knockback, spawn protection | `docs/GAME_RULES.md` §9 |
| A16 | Flux: regeneration, shard clusters, KO and assist rewards, death drop, respawn floor | `docs/GAME_RULES.md` §10 |
| A17 | Destructible cover broken by Ram Charge, rebuilt after 30 s | `docs/GAME_RULES.md` §14 |
| A18 | Death, KO and assist credit, 3 s respawn, spawn selection, 2 s spawn protection | `docs/GAME_RULES.md` §11 |
| A19 | Frenzy match flow: 3 s countdown, 180 s match, results, next match in the same room | `docs/GAME_RULES.md` §2, §12 |
| A20 | Bots v1: navigation, targeting, aiming, shooting, counter-form morphs, abilities, shard collection, difficulty tiers, instant seat handover | `docs/BOT_SPEC.md` |
| A21 | Mouse and keyboard controls | `docs/CONTROLS_UI.md` §2 |
| A22 | Core HUD: health, Flux bar with notches, form buttons with cost and cooldown, ability cooldown, Rail heat, timer, score, kill feed, damage numbers, hit markers, minimap, respawn timer | `docs/CONTROLS_UI.md` §5 |
| A23 | Landing screen with name entry and Play, controls card, in-match menu, results screen | `docs/CONTROLS_UI.md` §6 |
| A24 | Synthesized placeholder sounds for core events | `docs/CONTROLS_UI.md` §9 |
| A25 | Debug overlay and dev-only cheat commands | `docs/ARCHITECTURE.md` §11 |
| A26 | Simulated latency and packet loss for testing | `docs/NETWORK_PROTOCOL.md` §12 |
| A27 | Minimal match logging needed for the Fun Gate metrics (morphs, damage by form, time by form) | `docs/ARCHITECTURE.md` §9 |

### 3.2 Stage B: Playtest Build

| # | Feature | Spec |
|---|---|---|
| B1 | Zone Frenzy with the Surge Zone, preview, contest rule and Turret half rate | `docs/GAME_RULES.md` §13 |
| B2 | Bot zone behavior | `docs/BOT_SPEC.md` §5 |
| B3 | Keyboard-only aiming with soft lock-on (acquire, track, lead, override, cycle, break) | `docs/CONTROLS_UI.md` §3 |
| B4 | Input scheme auto-detection and on-screen key glyphs | `docs/CONTROLS_UI.md` §2.4 |
| B5 | Playtest rooms by code, host settings (mode, bot count, bot difficulty) | `docs/NETWORK_PROTOCOL.md` §3 |
| B6 | Death recap with counter hint | `docs/CONTROLS_UI.md` §5 |
| B7 | Off-screen threat arrows and the Rail Shot edge warning | `docs/CONTROLS_UI.md` §5 |
| B8 | Settings: aim assist strength, lock-on on or off, auto-fire, volume, screen shake, damage numbers | `docs/CONTROLS_UI.md` §6.4 |
| B9 | Full telemetry: match logs, client stats, input scheme per shot | `docs/ARCHITECTURE.md` §9 |
| B10 | Analysis script producing the prototype metrics report | `docs/PLAYTEST_PLAN.md` §5 |
| B11 | In-game link to the playtest survey after the third match | `docs/PLAYTEST_PLAN.md` §6 |
| B12 | Deployment to one VPS with HTTPS and WSS, health check, log retention | `docs/ARCHITECTURE.md` §12 |
| B13 | Load test: 20 bot-only rooms for 2 hours without crash or memory growth | `docs/ACCEPTANCE_TESTS.md` §20 |
| B14 | Fairness test tooling: bot target dummies for mouse versus keyboard hit-rate comparison | `docs/PLAYTEST_PLAN.md` §4.4 |

### 3.3 Platform for the prototype

- Desktop browsers: Chrome and Edge (current versions) are required. Firefox and Safari: best effort, bugs logged but not blocking.
- Window sizes: fully playable at 1280 x 720 and above. Text must stay legible at 821 x 462 (the smallest common CrazyGames window), checked once before the Approval Gate.
- Hardware target: 60 FPS on a mid-range laptop with integrated graphics; at least 30 FPS on a 4 GB RAM Chromebook if one is available for testing.
- Initial download: under 5 MB (greybox, no assets). This keeps the production 15 MB budget realistic.
- Network: playable at up to 150 ms round-trip time and 2% packet loss.

---

## 4. Excluded features

Nothing in this table is built during the prototype. Where it returns is listed so nobody designs the prototype in a way that blocks it.

| Excluded | Returns in | Do not block it by |
|---|---|---|
| Characters (Volt, Bramble, Nova, Mira, Rook), character kits, signature abilities | Production M2 | Keep abilities data-driven per form so a character can override one |
| Overdrive meter and Ultimates | Production M2 | Leave an `ultimate` input bit reserved |
| Weapon crates and the four crate weapons | Production M2 | Leave a `crate` input bit and crate points in the map data |
| Bounty and Wanted | Production M2 | Keep KO streaks in match stats |
| Arena events (Crate Storm, Reactor Surge, Route Closure) | Production M2 | Keep wall data loadable per map state |
| Hazards, jump pads, raised platforms, grapple anchors | Production M2 or later | Keep the sim 2D with optional height data per wall |
| Boot Camp tutorial, contextual counter hints | Production M2 | Keep the controls card separate from the HUD |
| Touch controls, controller | Production M2 (touch), v1.1 (controller) | Route every action through the input mapper, never raw key codes |
| Accounts, guest identity persistence, XP, Coins, cosmetics, challenges | Production M2 to M4 | Keep player identity a string id |
| CrazyGames SDK, ads, usernames from the portal, invite links | Production M3 | Keep a `platform` adapter interface in the client |
| Multiple regions, ping-based region choice, Redis presence | Production M3 | Keep the server stateless apart from rooms |
| Interest management (`StateView`) | Production, before invisibility | Keep state schemas grouped per entity |
| Art, VFX beyond simple particles, music, final sounds | Production M3 | Keep visuals behind a `RenderAdapter` per entity type |
| Reactor War, King of the Morph, Last Engine, private room invites via portal | v1.1 and later | Keep the mode logic behind a `ModeRules` interface |
| Leaderboards, ranked, shop, battle pass | Later | Nothing |
| Health regeneration | Decided by OQ-004 | Keep health changes in one place in the sim |
| Overdrive Clash | Cut (D-007) | Nothing |

---

## 5. What the prototype must prove

Each hypothesis has a measurable pass condition. Metrics are defined in `docs/PLAYTEST_PLAN.md` §5 and computed by `tools/analyze`. Only **human** players count in gameplay metrics; bots are excluded.

| ID | Hypothesis | Metric | Pass | Gate |
|---|---|---|---|---|
| H1 | Players actually morph | Average morphs per human per completed match | 4 to 8 | Fun and Approval |
| H2 | Players use more than one form | Share of human match participations with damage dealt in 2 or more forms | 70% or more | Approval |
| H3 | Every form has a job | Share of total human damage dealt per form | Each form 20% to 45% | Fun and Approval |
| H4 | Every form gets played | Share of human time alive per form | Each form 15% to 50% | Approval |
| H5 | The counter triangle is learnable from play | Survey: correctly names which form beats which, without being told | 70% or more of testers | Approval |
| H6 | Matches are readable | Survey: can say what killed them in their last death | 80% or more | Approval |
| H7 | The objective adds strategy (Zone Frenzy) | Zone points as a share of the winner's score | 30% to 60% median | Approval |
| H8 | The objective is at least as fun | Zone Frenzy fun rating and second-match rate compared with Frenzy | Equal or better (picks launch mode, D-017) | Approval (decides mode, never fails the gate) |
| H9 | Keyboard-only is fair | Keyboard-only hit rate compared with mouse, same bot difficulty | Within 10% (relative) | Approval |
| H10 | Online play feels good | Survey: controls feel responsive (4 or 5 of 5) at under 150 ms RTT | 80% or more | Approval |
| H11 | Netcode is stable | Prediction corrections over 0.5 m per player-minute at 150 ms simulated RTT | Under 1 | Fun and Approval |
| H12 | People want to play again | Sessions where the tester chose to play 2 or more matches in a row | 60% or more | Approval |
| H13 | It is fun | Survey: overall fun rating | Median 4 of 5 or higher | Approval |
| H14 | Technically sound | Crash-free sessions; server tick time | 99% or more; under 4 ms average per room tick | Approval |

### 5.1 Fun Gate (end of Stage A)

Three internal sessions with 4 to 8 humans plus bots. Pass when:

1. H1 average morphs is 4 or more.
2. H3: each form deals between 20% and 45% of human damage.
3. At least 3 of every 4 testers can explain which form beats which, without being told, after their third match.
4. H11 holds at 150 ms simulated RTT.
5. No blocker bug open (crash, desync, stuck player, broken respawn).

If the gate fails: apply the levers in `docs/PLAYTEST_PLAN.md` §7, run one more internal session, and re-check. If it fails twice, Hamza decides whether to continue (record the decision).

---

## 6. Definition of done for the prototype

The prototype is done when all of these are true:

1. Every Stage A and Stage B feature in §3 passes its acceptance tests in `docs/ACCEPTANCE_TESTS.md`.
2. The full-prototype checklist (`docs/ACCEPTANCE_TESTS.md` §22) passes on the deployed build.
3. Playtest rounds R1 and R2 are complete (`docs/PLAYTEST_PLAN.md` §3).
4. The prototype report (`docs/PLAYTEST_PLAN.md` §8) is written with all metrics from §5.
5. No open blocker or critical bug.

---

## 7. Rules for working inside the prototype

1. If it is not in §3, do not build it. If you think it is needed to answer a hypothesis, add it to `OPEN_QUESTIONS.md`.
2. Prefer the simplest implementation that keeps production possible (see the "do not block it by" column in §4).
3. Every gameplay number comes from `packages/shared/src/balance.ts` (`docs/BALANCE.md`).
4. Prototype code is the start of the production codebase, not throwaway. Write it with tests, but do not polish visuals.

---

## 8. Approval Gate

### 8.1 Evidence package

Prepared at task T-150 and presented to Hamza:

1. **Prototype report** (`docs/PLAYTEST_PLAN.md` §8): every hypothesis H1 to H14 with its measured value, pass or fail, and sample size.
2. **Metrics output** from `tools/analyze` for all playtest matches (attached file).
3. **Survey summary** with the raw export.
4. **Recording**: a 3-minute video of a real playtest match, unedited.
5. **Build link** to the deployed prototype so Hamza can play it.
6. **Known issues list** with severity.
7. **Recommendation**: Approve, Iterate or Stop, and the launch mode suggested by H8.
8. **Production re-plan**: updated estimate for production M2 to M4 using real velocity.

### 8.2 Decision options

| Outcome | When | What happens next |
|---|---|---|
| **Approve** | All "Approval" hypotheses pass, or the failures have a clear, low-cost fix | Record D-070 as Approve. Production starts with the epics in `TASKS.md` §Production. Launch mode chosen from H8. |
| **Iterate** | Core hypotheses (H1, H3, H5, H13) pass or are close, others fail | Record D-070 as Iterate with the specific changes. Run one more playtest round. Maximum two iterations before a final Approve or Stop. |
| **Stop** | H13 (fun) fails clearly, or H1 and H3 both fail after an iteration | Record D-070 as Stop. Archive the repo with the report. |

Only Hamza makes this decision. Agents prepare the evidence and never mark the gate as passed.
