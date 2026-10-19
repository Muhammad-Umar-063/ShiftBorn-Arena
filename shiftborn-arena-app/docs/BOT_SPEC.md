# BOT_SPEC.md

> **LLM FILE CONTRACT:** Bot behavior source of truth. Bots must emit normal `InputFrame`s and obey the same simulation rules as humans. Read the sections named by the active bot task.

How prototype bots perceive, move, pick targets, aim, shoot, morph, use abilities, play the Surge Zone, and hand their seats to humans. Bots exist so a match never waits for players (D-030, D-038) and so playtests always have a full 8-player match.

Related: `docs/GAME_RULES.md`, `docs/MAP_SPEC.md` §12, `docs/NETWORK_PROTOCOL.md` §3.5, §9, `docs/BALANCE.md` §8 (`bots`).

---

## 1. Principles

1. **Bots are players.** A bot produces the same `InputFrame` a human sends (move, aim, buttons, `aimSource = bot`). It never changes game state directly. Every rule, cost and cooldown applies to it.
2. **Fair perception.** A bot knows only what a human could reasonably know (section 3). No seeing through walls.
3. **Human-like execution.** Reaction time, aim error and imperfect counter choices make bots beatable. Difficulty tiers change execution, not knowledge.
4. **Deterministic.** Each bot has its own RNG seeded from the match seed and its seat, so bot-only matches replay exactly and replacing one bot does not change others.
5. **Cheap.** Decisions at 5 Hz, staggered across seats; inputs every tick.

---

## 2. Structure

```text
apps/server/src/bots/
  BotController.ts   one per bot or proxy seat; decide() at 5 Hz, input() every tick
  perception.ts      builds the bot's view of the world (section 3)
  navgrid.ts         walkable grids per radius (docs/MAP_SPEC.md §12)
  pathfind.ts        A* + smoothing + path cache
  steering.ts        waypoint following, separation, strafing
  aim.ts             reaction delay, lead, error, turn rate
  goals.ts           utility scoring (section 5)
  morphPolicy.ts     section 7
  abilityPolicy.ts   section 8
  names.ts           bot names (uses packages/shared/src/names.ts)
```

- **Decide** (5 Hz, `bots.decisionHz`): seat `s` decides on ticks where `tick % 6 == s % 6`. It refreshes perception, scores goals, picks a target, plans a path if needed, and sets morph and ability intents.
- **Input** (every tick): follows the current plan: steering toward the next waypoint, aim turning, fire discipline, and button presses for planned morphs and abilities (held for one frame).

---

## 3. Perception

| A bot knows | How |
|---|---|
| Its own full state | Directly |
| Enemies within 22 m (`bots.perceptionRangeM`) with line of sight | Visible list, refreshed at each decision |
| Where a visible enemy was in the last 2 s after losing sight (`bots.memoryS`) | Memory, then forgotten |
| Who damaged it in the last 2 s, and from which direction | From damage events, even without sight (humans see a damage indicator) |
| Every deployed Turret on the map | Same as the human minimap rule (`docs/CONTROLS_UI.md` §5.1) |
| Active shard clusters, announced cluster points, dropped shards within 22 m | Same as the human view and minimap |
| The Surge Zone, its state and its preview | Same as the human HUD |
| The map, its walls and cover | Static data |

- **Reaction time:** a newly visible enemy can be targeted only after `reactionMs` (tier).
- **Delayed positions:** bots aim at enemy positions from 100 ms ago (the same delay humans see through interpolation), plus lead (section 6.1).

---

## 4. Navigation

- **Grid:** 0.5 m cells, one grid for radius 0.6 m (Runner) and one for 1.0 m (Beast) (`docs/MAP_SPEC.md` §12). A Turret does not move; to relocate, a bot morphs to Runner first.
- **Search:** A* with 8-way moves and octile heuristic, then string-pulling (remove waypoints while line of sight between the remaining ones is clear with the bot's radius).
- **Replanning:** when the goal changes, every 1 s while following a path, or when stuck.
- **Budget:** at most 2 path searches per room per tick; extra requests wait for the next tick. Cache paths to static destinations (shard and zone points) for 2 s.
- **Following:** steer toward the next waypoint; a waypoint is reached within 0.6 m. Movement input is the unit vector to the waypoint (full speed), converted to the `moveX`, `moveY` integers.
- **Separation:** players do not collide (D-018), but bots avoid stacking: add a push away from any other player within 1.5 m, weighted 0.5.
- **Stuck:** if the bot tried to move but its position changed less than 0.5 m in 1.5 s (`bots.stuckS`), replan. If stuck again within 3 s, pick a random walkable cell within 6 m as a temporary goal.

---

## 5. Goals

Every decision, each goal gets a score; the highest wins. Scores are unitless; the formulas are starting points to tune in playtests.

| Goal | Score | Behavior |
|---|---|---|
| **Fight** | `1.0 × targetScore` if a target exists (below), else 0 | Engage the target with form-specific movement (section 6.3) |
| **Retreat** | `1.5` if `hpFrac < 0.3` (`bots.retreatHpFrac`) and (the current target beats the bot's form, or 2 or more enemies are within 12 m); else 0 | Move away from threats toward the nearest cluster or the farthest reachable doorway; morph to Runner if allowed and Dash away (section 8) |
| **Collect Flux** | `0.6 + 0.4 × (1 - flux / 100)` if a cluster or dropped shard is within 25 m path estimate; `0.3` if farther; doubled if `flux < 35` and no enemy is visible | Path to the best shard target: value divided by straight-line distance; announced clusters count if they spawn before the bot arrives |
| **Contest zone** (Zone Frenzy) | `1.2` if the zone is empty or held by another player; `1.4` if the bot is within 15 m; `0` in Frenzy | Path into the zone; once inside, switch to Hold zone |
| **Hold zone** (Zone Frenzy) | `1.6` while the bot is inside and alive | Stay inside within 4 m of the center, face the nearest threat, fight from inside; prefer Beast form (section 7) |
| **Roam** | `0.2` | Walk toward a seeded random zone point or lane center; re-pick on arrival |

**Target score** for each visible (or remembered) enemy, highest wins:

```text
targetScore = (1 / max(distance, 4)) × 10
            × (1.3 if the bot's form beats the enemy's form, 0.8 if the enemy's form beats the bot's, else 1)
            × (1 + 0.5 × (1 - enemy.hpFrac))
            × (1.3 if the enemy damaged this bot in the last 2 s)
            × (1 + bots.leaderTargetBonus if the enemy is the human with the highest score)   // comeback help, GDD §7.8
            × (0 if the enemy is spawn-protected)
```

Keep the current target unless a new one scores 25% higher (prevents flicking between targets).

---

## 6. Combat execution

### 6.1 Aim

```text
aimPoint   = targetPos(t - 100 ms) + targetVel × travelTime × tier.leadFactor
travelTime = distance / current weapon projectile speed
desired    = angle(bot → aimPoint) + aimError
aimError   = seeded uniform value in [-tier.aimErrorDeg, +tier.aimErrorDeg], re-rolled every 0.5 s (bots.aimErrorRerollS)
aim        turns toward desired at tier.aimTurnDegPerS (the sim still caps a Turret at 120°/s)
```

### 6.2 Fire discipline

- Fire only when the target is within the current weapon's range, in line of sight, and the difference between the current aim and `desired` is within `tier.fireToleranceDeg`.
- **Beast:** fire only when the target is within 6 m (Scatter falloff makes longer shots weak).
- **Turret heat:** Normal and Hard bots stop firing at 6 s of heat and resume at 3 s. Easy bots ignore heat and overheat.
- Never fire at spawn-protected enemies.

### 6.3 Movement while fighting

| Bot form | Target form | Movement |
|---|---|---|
| Runner | Runner | Strafe sideways at about 8 m, switching direction every 1 to 2 s (seeded) |
| Runner | Beast | Kite: keep more than 7 m away, strafe, prefer open ground; avoid corridors |
| Runner | Turret | Flank: path to a point 3 m from the Turret, offset 120° from its aim direction (outside its armored arc), then circle it |
| Beast | any | Approach directly along the path; stop strafing within 4 m; use Ram Charge (section 8) |
| Turret | any | Does not move; turns toward the target |

---

## 7. Morph policy

Evaluated at each decision when a morph is allowed (phase, cooldown, not busy) and affordable. Rules in priority order (from GDD Appendix A, plus prototype additions):

| # | Situation | Wanted form |
|---|---|---|
| 1 | Retreat goal active | Runner |
| 2 | An enemy Beast within 12 m (`bots.morphBeastThreatM`) with line of sight | Turret |
| 3 | The target is a Turret, or a Turret is visible within 18 m in front | Runner (then flank) |
| 4 | An enemy Runner within 6 m (`bots.morphRunnerThreatM`) | Beast |
| 5 | Hold zone goal active and no Beast threat within 12 m | Beast (full zone rate, high health) |
| 6 | Bot is a Turret and no enemy has been within 18 m for 3 s | Runner (relocate) |
| 7 | No enemy visible and Flux under 35 | Runner (fast for collecting shards) |

- With probability `tier.counterFormChance` the bot takes the wanted form; otherwise it keeps its current form for this decision. The roll uses the bot's RNG.
- Hysteresis: no new morph decision for 2 s after a morph ends.
- The bot presses the morph key for one frame. If the server denies it (cost, cooldown, busy), the bot will try again at a later decision.

---

## 8. Ability policy

Each eligible decision uses the ability with probability `tier.abilityUseChance`.

| Ability | Use when |
|---|---|
| Dash (Runner) | Flanking a Turret and within 10 m (`bots.dashEngageRangeM`), dash toward the flank point; or Retreat goal active, dash away from the nearest threat. Never into a wall within 6 m (check the path first) |
| Ram Charge (Beast) | Target within 8 m (`bots.ramMaxRangeM`), aim within 15° of the target (`bots.ramMaxAngleDeg`), and the straight path to the target is free of walls and cover. Hard bots also use it to break cover between them and a target |
| Rail Shot (Turret) | Target in line of sight, between 6 m (`bots.railShotMinRangeM`) and 18 m; prefer when the target is a Beast or moving slower than 3 m/s |

---

## 9. Seats, replacement and proxy control

### 9.1 Filling

- At room creation, every empty seat gets a bot (bot fill on). Bot count = 8 minus humans.
- When a human leaves (consented, or after the 30 s reconnection window), the seat becomes a bot at once, keeping the seat index. The new bot starts the next life as normal (the current life continues seamlessly if the player was alive).

### 9.2 Instant replacement on human join (D-038)

1. Candidates: all bot seats (not proxy seats).
2. Prefer bots with no damage dealt or taken in the last 3 s (`backfill.outOfCombatS`).
3. Among those (or among all bots if none is idle), pick the lowest score; ties go to the highest seat index.
4. The bot is removed at once: `botReplaced` event, warp-out effect, no death, no KO credit, no Flux drop. Its projectiles in flight are removed.
5. The human takes that seat and spawns per GR-2.6.

### 9.3 Proxy control

When a human's tab is hidden, they are AFK, or their connection dropped (`docs/NETWORK_PROTOCOL.md` §9), a `BotController` drives their seat (`controller = proxy`):

- Same behavior and difficulty as the room's bots.
- The seat keeps the human's name and stats; score earned counts for the seat in that match. In production, it does not count toward the player's XP.
- When the human returns, control returns on the next tick and the proxy's state is discarded.
- Proxy seats are never chosen for replacement (section 9.2).

### 9.4 Names

- Generated as adjective + noun from lists in `packages/shared/src/names.ts` (for example "SwiftComet", "IronBadger"), picked with the bot's RNG, unique within the room.
- Bots look exactly like other enemies in the world. A bot icon appears only on the scoreboard and results screen (GDD Appendix A).

---

## 10. Difficulty

| Tier | Reaction | Aim error | Lead factor | Aim turn | Fire tolerance | Counter-form chance | Ability use chance |
|---|---|---|---|---|---|---|---|
| Easy | 450 ms | ±12° | 0.0 | 360°/s | 15° | 40% | 30% |
| Normal | 300 ms | ±7° | 0.5 | 540°/s | 10° | 70% | 60% |
| Hard | 180 ms | ±3° | 0.9 | 720°/s | 6° | 90% | 90% |

Keys: `bots.tiers.<tier>.*`. Other bot keys: `bots.decisionHz` 5, `bots.perceptionRangeM` 22, `bots.memoryS` 2, `bots.retreatHpFrac` 0.3, `bots.leaderTargetBonus` 0.15, `bots.morphBeastThreatM` 12, `bots.morphRunnerThreatM` 6, `bots.stuckS` 1.5, `bots.aimErrorRerollS` 0.5, `bots.ramMaxRangeM` 8, `bots.ramMaxAngleDeg` 15, `bots.dashEngageRangeM` 10, `bots.railShotMinRangeM` 6.

- The prototype uses one tier per room: Normal in quick play (`BOT_DIFFICULTY`), set by the host in code rooms.
- Adaptive difficulty (bots tracking the humans' median skill, easy bots for a player's first three matches) is production work.

---

## 11. Dummy mode (fairness test)

Enabled with the dev command `/dummies on [speed]` (`docs/ARCHITECTURE.md` §11), so it runs on a local or internal build with `DEV_CHEATS=1`, never on the public playtest build.

- Bots stop firing, using abilities and morphing; they stay Runners.
- Each dummy picks a line 10 m from the nearest human, perpendicular to the line between them, and strafes back and forth along it at `speed` (default 8.5 m/s), reversing every 1 to 2 s (seeded).
- Used by the fairness test (`docs/PLAYTEST_PLAN.md` §4.4) to compare mouse and keyboard-only hit rates on identical targets.

---

## 12. Testing

- Unit tests: target scoring, morph policy (each row of section 7), ability policy, aim error bounds, fire discipline, replacement choice (section 9.2).
- Navigation tests: a path exists from every spawn point to every shard point and zone point for both radii; smoothed paths never cut through walls.
- Scenario: a bot-only match of 8 Normal bots runs 180 s with every bot dealing damage, at least 10 KOs in total, at least 8 morphs in total, no bot stuck for more than 5 s.
- Determinism: two runs of the same bot-only match give the same final hash.
- Performance: bot decision plus input time under 1 ms per room per tick on average with 8 bots.
