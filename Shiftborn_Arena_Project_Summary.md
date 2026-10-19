# Shiftborn Arena: Project Summary

> **LLM FILE CONTRACT:** Orientation only. Use this to understand the pitch and long-term direction, never as an implementation specification. The files inside `shiftborn-arena/` are authoritative.

> **Context document.** This is a concise view of the long-term product, not the current implementation scope. For work in `shiftborn-arena/`, follow `AGENTS.md`, `DECISIONS.md`, `TASKS.md` and the prototype specs in `docs/`; they override this summary and the standalone GDD.

**Status:** planning complete; repository tooling is bootstrapped (T-001); gameplay implementation has not started. **Last updated:** October 19, 2026.
**Working title:** Shiftborn Arena (formerly Morph Runners). The name still needs a trademark and portal search before the art pass.
**Long-term rules and numbers:** `Shiftborn_Arena_GDD_v2.md` in this project. The repository's prototype documents are authoritative for the current build.

## One-line pitch

**Shiftborn Arena is a multiplayer transformation battler where players switch between a fast Runner, a powerful Beast and a ranged Turret in real time to control the arena and defeat rivals.**

Players don't just pick a weapon, they pick their whole role for each moment of the fight. They collect energy around the arena, spend it to transform, and win through positioning, objectives and smart form choices, not luck.

## Team and way of working

- Three senior full-stack engineers, about 30 hours a week each. No in-house 3D artist or UI designer.
- Work is an ordered task queue on the GitHub Project board. Whoever is free takes the top unblocked card. No per-person assignments.
- Codex is the primary collaborator for planning, research, implementation and verification. The repository's canonical working instructions live in `AGENTS.md`.

## Target audience

- Casual and competitive web and mobile players who enjoy fast PvP games such as Smash Karts, Brawl Stars and .io arena games, but want more strategy and character identity.
- Age 13+ (CrazyGames audience, PEGI 12 content). Many real players will be younger, so content stays kid-safe: cartoon violence, no blood, no free text chat.
- Includes Chromebook and school-laptop players, and keyboard-only players.

## How it plays

- Short matches in colorful, top-down 3D arenas. Launch mode: 8 players, 3 minutes, most KOs wins.
- Everyone spawns as a Runner and can morph at any time by spending **Flux**, an energy resource that refills slowly and is also collected as shards around the map.
- Weapon crates spawn at fixed, visible spots on visible timers and give an ammo-limited bonus weapon that works in any form.
- The **Living Arena** changes mid-match with telegraphed events (10-second warning): Crate Storm, Reactor Surge, Route Closure at launch.
- A full **Overdrive** meter unlocks the character's Ultimate.
- Bots fill every empty seat, so a match starts in under 3 seconds. Real players take over bot seats as they join.

### The three forms

| Form | Role | Strengths | Weaknesses | Beats | Loses to |
|---|---|---|---|---|---|
| Runner | Fast attacker and scout | Highest speed, dash, small hitbox, best objective capture | Lowest health (80 HP) | Turret, by flanking it | Beast |
| Beast | Close-range brawler | High health (140 HP), ram and pull attacks, breaks cover | Slow, large hitbox, weak at range | Runner | Turret |
| Turret | Ranged defender | Highest ranged damage, zone control, armored front | Cannot move at all while deployed, turns slowly, weak up close | Beast | Runner |

The counter triangle is enforced by damage modifiers (1.25x when effective, 0.75x when resisted) shown on every hit. Crate weapons deal neutral damage, so upsets stay possible.

### Morph rules

- Morphing to Beast or Turret costs 35 Flux. Returning to Runner is free, so a Turret is never stranded.
- A morph takes 0.5 seconds and has a 3-second cooldown.
- Health carries over as a percentage (half health stays half health), so morphing never heals.
- Ability cooldowns keep running across forms; morphing never resets them.
- Flux cap 100, start 60, regenerates 1 per second. On death, 40% of carried Flux drops as shards; respawn with at least 40.
- Design target: 4 to 8 morphs per player per match.

## What makes it different

- **Real-time transformation** between three forms, each with its own weapon, ability, speed and hitbox.
- **Strategy, not just shooting:** a readable counter triangle, energy management, objectives and map control.
- **Living arena:** events reshape the map mid-match and force new plans.
- **Fair randomness:** crates are visible and contested, so players plan around them.
- **Universal controls:** full play with mouse and keyboard, keyboard only (soft lock-on aiming), touch, and later controller.
- **No waiting:** one click puts you in a live match.

## Modes and release timing

| Mode | What it is | Release |
|---|---|---|
| Frenzy | 8-player free-for-all, 3 minutes, most KOs wins | Launch |
| Boot Camp | 90-second guided tutorial | Launch |
| Private rooms | Play with friends by code or CrazyGames invite link | Launch |
| Reactor War | 4v4: capture zones to charge your Reactor, then carry and deliver Cores; first to 2 deliveries wins | v1.1 |
| King of the Morph | Free-for-all control of a moving center zone | v1.2 |
| Last Engine | 12 to 16 player shrinking-arena battle royale | Later |
| Core Heist | Steal the enemy Core | Cut (overlapped Reactor War) |

## Characters

Each character changes how the three forms behave, with one signature ability per form and one Ultimate.

| Character | Playstyle | Release |
|---|---|---|
| Volt | Aggressive, fast, electric | Launch |
| Bramble | Tanky, disruptive, close range | Launch |
| Nova | Zone control and area denial with gravity pulls | Launch |
| Mira | Stealth and information control | v1.1 |
| Rook | Scaling defensive bruiser | v1.1 |

## Controls (PC defaults)

| Action | Key |
|---|---|
| Move | W A S D |
| Aim | Mouse, or arrow keys with soft lock-on (Q to lock and cycle) |
| Fire | Left mouse or Space |
| Morph to Runner / Beast / Turret | 1 / 2 / 3 |
| Ability | E |
| Crate weapon | Right mouse or R |
| Ultimate | X |
| Scoreboard | Tab |
| Menu (match keeps running) | Esc or P |

Mobile: floating left joystick to move, right joystick to aim and auto-fire, three small form buttons, landscape only.

## Platform and technical constraints

| Item | Constraint or decision |
|---|---|
| Launch portal | CrazyGames (Basic Launch, then Full Launch). Own website second |
| Initial download | 20 MB or less (CrazyGames mobile homepage); target 15 MB; estimate 10 to 12 MB |
| Total size | 250 MB limit; estimate 15 to 18 MB |
| Load time | Gameplay within 20 s worst case; target under 10 s |
| Hardware | Smooth on a 4 GB RAM Chromebook; 30 FPS minimum on a mid-range phone |
| CrazyGames SDK | Required even in Basic Launch for multiplayer games: usernames, invite links, instant multiplayer, gameplay events |
| Client | TypeScript, Three.js, Vite |
| Server | Node.js, Colyseus, authoritative server at 30 Hz, 20 Hz snapshots |
| Shared code | One simulation package used by the server (authority) and client (prediction); bots run inside it |
| Data | Supabase Postgres, Redis for room presence, PostHog analytics, Sentry |
| Regions | EU (Frankfurt), US East, Singapore |
| Art approach | Greybox first; "shell swap" morphs (rider plus 3 vehicle shells, VFX burst hides the swap); asset packs plus one freelance artist for 3 characters |

## Plan

| Milestone | Weeks | Delivers | Gate to pass |
|---|---|---|---|
| M0 Foundations | 1 | Repo, CI, server, 2 players online in one room | Smooth play at 150 ms simulated lag |
| M1 Core loop | 2 to 4 | 3 forms, Flux, bots, Frenzy, rough visuals | Fun gate: 4+ morphs per player per match, all 3 forms used |
| M2 Depth | 5 to 7 | 3 characters, crates, tutorial, touch and keyboard aim | 20+ outside testers, 60% play a second match |
| M3 Polish | 8 to 10 | Art, sound, CrazyGames SDK, 3 server regions | Under 15 MB, CrazyGames QA passed, no crash in a 2-hour soak |
| M4 Launch | 11 to 13 | Submission, cosmetics, load tests, balance | 99% crash-free sessions, playing within 10 s |

No art spending until the Fun gate passes. Re-plan after M1 with real velocity.

## Monetization

- Free to play. Nothing paid ever makes a player stronger.
- Basic Launch: no revenue; the goal is retention data.
- Full Launch: CrazyGames SDK ads on the results screen between matches, plus opt-in rewarded ads. Never during combat.
- Later: cosmetic purchases (through CrazyGames' Xsolla account on the portal) and a battle pass only if D7 retention holds at 8% or more. No paid random rewards.

## Superseded ideas (do not reintroduce)

These came from the first draft and were changed on purpose:

- "Smash Rush" and "Smashes": now **Frenzy** and **KOs** (too close to Smash Karts).
- "Energy" and "Morph Meter": now **Flux** and **Overdrive**.
- Morph costs of 80 to 100 energy, and 20 to return to Runner: now 35, and Runner is free.
- Spending energy on traps, shields, weapon upgrades or fast respawn: removed. Traps and shields live in character kits and crate weapons.
- Turret "cannot move while firing": it cannot move at all while deployed.
- Overdrive Clash triggering automatically with slowed time: now opt-in, no time slow, post-launch behind a playtest gate.
- Dominion Score deciding matches: replaced by per-mode win conditions; Performance Score is only for MVP, XP and leaderboards.
- Five modes and five characters at launch: launch is one mode and three characters.
- Target age 10+: now 13+.
- Building single-player first and adding multiplayer later: the server runs every match from week 1.

## Top risks

| Risk | Response |
|---|---|
| Morphing is not fun | Fun gate in week 4 before any art spend |
| Empty matches at launch | Bot backfill and persistent rooms |
| Lag or cheating | Authoritative server from week 1, tested with simulated lag |
| Server cost outgrows ad revenue | One server per region at first; track cost against revenue per 1,000 player-hours |
| No in-house 3D artist | Shell-swap morphs, asset packs, one freelancer |
| Portal rejection | CrazyGames rules built into the spec; QA tool from week 8 |

## Open decisions

1. Final name, after the trademark and portal search.
2. Art budget for a freelance 3D artist (3 characters, each a rider plus 3 vehicle shells).
3. Monthly server budget before ad revenue starts.
4. CrazyGames only at launch, or the own website at the same time.
5. How the 13 weeks fit with the team's other work.

## Glossary

| Term | Meaning |
|---|---|
| Flux | The combat resource; pays for morphing into Beast or Turret |
| Overdrive | Meter that fills in combat; when full, powers the character's Ultimate |
| Form weapon | Each form's unlimited primary weapon (Pulse Pistol, Scatter Cannon, Rail Repeater) |
| Crate weapon | Ammo-limited bonus weapon from a crate, on its own button, works in any form |
| Counter triangle | Runner beats Turret, Turret beats Beast, Beast beats Runner |
| Wanted | A player on a 3-KO streak; marked on all minimaps, worth a bonus KO |
| Shell swap | Art approach: the morph is a VFX burst that hides a vehicle model swap |
| Fun gate | The week 4 playtest that must pass before art spending |
