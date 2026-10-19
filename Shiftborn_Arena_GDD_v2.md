# Shiftborn Arena: Complete Game Design & Technical Specification

> **LLM FILE CONTRACT:** Long-term context copy only. Do not implement from this file. Inside `shiftborn-arena/`, follow `AGENTS.md` and the repository specifications; they override this document for prototype scope, behavior, values and workflow. Preserve this file unless the project owner explicitly requests a GDD change.

> **Context document.** This file describes the long-term product vision. When working in the `shiftborn-arena/` repository, follow its `AGENTS.md`, `DECISIONS.md`, `TASKS.md` and prototype specs. Those files override this standalone GDD for implementation scope, rules, balance and workflow.

**Document version:** 2.0, clean copy for project context (October 14, 2026). The red-marked review copy is kept separately.  
**Date:** October 13, 2026  
**Prepared for:** Development implementation by the in-house team with Codex and compatible coding agents  
**Genre:** Real-time, top-down 3D multiplayer character arena battler  
**Platform:** Browser-first web game. Launch portal: CrazyGames (desktop, Chromebook and mobile web). Own website second.  
**Business model:** Free-to-play, cosmetic-only monetization. Ad-supported at launch (portal ads between matches only); cosmetic purchases come later (see §19).  
**Title status:** Shiftborn Arena (formerly Morph Runners) is the working title until the name check in §1.1 is done.

***

## 0. Key Decisions and Team

### 0.1 Decisions that shape the build

1. **Network-first.** One shared simulation runs on the server from week 1. "Single-player with bots" is the same server code with bots in the empty seats.
2. **Launch scope:** Frenzy (8-player free-for-all) with bots, 3 characters, 1 map, 3 form weapons, 4 crate weapons, 3 arena events. Reactor War ships in v1.1.
3. **One combat resource (Flux)** with cheap morphs and a free return to Runner, plus **one ultimate meter (Overdrive)**. Health carries over between forms as a percentage.
4. **A real counter triangle:** Runner beats Turret, Turret beats Beast, Beast beats Runner, enforced by matchup damage modifiers that are shown on every hit.
5. **Rooms never wait.** Bots fill every empty slot and hand their seat to joining humans.
6. **Overdrive Clash is redesigned** and moves behind a playtest gate in v1.1. Character Ultimates are the launch payoff for a full meter.
7. **CrazyGames is the launch platform** and its requirements are hard constraints.
8. **"Shell swap" morph art:** a VFX burst plus a model swap, instead of bespoke mechanical transformation animations.

### 0.2 Team assumption

Plans and estimates assume three senior full-stack engineers at about 30 hours per week each (about 90 team hours per week), no in-house 3D artist or UI designer, and AI coding agents for implementation. Work is planned as an ordered task queue: whoever is free takes the next unblocked task. There are no per-person assignments.

***

## 1. Executive Summary

**Shiftborn Arena** is a fast, strategic, browser-based multiplayer arena game where each player controls a character who can transform between three combat forms in real time: **Runner**, **Beast**, and **Turret**.

Unlike Smash Karts, where players remain in karts and rely heavily on random weapon crates, Shiftborn Arena gives players a meaningful strategic identity through transformation, energy management, objective control, map awareness, and counterplay. Smash Karts' appeal comes from short multiplayer rounds, weapon crates, fast respawns, XP progression, and simple controls combined with chaotic PvP; Shiftborn Arena preserves that accessibility but adds deeper decision-making.

### One-line pitch

> **Shiftborn Arena is a fast multiplayer arena game where you transform between a fast Runner, a powerful Beast, and a ranged Turret to outthink, outmaneuver, and smash your enemies.**

### Core fantasy

The player is not merely driving a vehicle or shooting enemies. They are a **living weapon system**: a character bonded to a transformable machine. Their success depends on choosing the right form at the right moment.

### Target audience

- Players aged **13+** who enjoy quick browser games. CrazyGames is a site for players 13 and older and requires PEGI 12 compatible content. A 10+ target would also bring stricter children's privacy rules (Appendix C). Many real players will still be younger, so content and safety rules stay kid-safe.
- Fans of Smash Karts, Brawl Stars, Shell Shockers, Krunker, and fast arena shooters.
- Casual players who want instant matches.
- Competitive players who want skill expression, positioning, and strategic decision-making.
- Mobile and desktop players, including keyboard-only users.
- Chromebook and school-laptop players, a large share of web portal traffic. The game must run smoothly on a 4 GB RAM Chromebook.

### Core promise

Every match should create moments where a player asks:

> "Should I chase this kill, capture this zone, save energy to morph, place a trap, or deny the enemy's weapon spawn?"

If the answer is always "shoot the enemy," the design has failed.

### 1.1 Name check

- Working title: **Shiftborn Arena**. It replaced "Morph Runners", which collided with existing games named "Morph Run" and "Morph-Runner".
- The mode name "Smash Rush" and the score term "Smashes" were too close to Smash Karts, so they are now **Frenzy** and **KOs**.
- Before the art pass (M3): check trademark databases (USPTO, EUIPO), domain availability, CrazyGames search and Google for "Shiftborn Arena".

***

## 2. Design Pillars

All features must support at least one of these pillars.

### Pillar 1: Instant chaos

Matches begin quickly, combat is readable, and players can understand what killed them. From page load to controlling a character in under 20 seconds, with no account, menu or tutorial wall in between.

### Pillar 2: Strategic transformation

Changing form must be a meaningful tactical decision, not a cosmetic animation.

### Pillar 3: Skill over luck

Random elements create opportunities, but positioning, timing, resource management, and decision-making decide outcomes. v1.0's Overdrive Clash was a blind guess, which broke this pillar; it is redesigned in §8.

### Pillar 4: Everyone can play

The game must be playable with keyboard only, mouse and keyboard, touch, and eventually controller.

### Pillar 5: Short, repeatable sessions

A full match should take around 3-5 minutes, making "one more game" natural.

### Pillar 6: Fair progression

Progression unlocks cosmetics and convenience, never direct combat power in competitive modes.

### Pillar 7: Readable at a glance

Every threat, form and objective must be identifiable within one second on a phone screen and in the smallest common portal window (821 x 462 px). If a feature cannot be read at that size, it does not ship.

***

## 3. Competitive Positioning

### Comparison with Smash Karts

| Area | Smash Karts | Shiftborn Arena |
|---|---|---|
| Core identity | Kart battle arena | Character transformation arena |
| Player role | Driver in a kart | Character with three combat forms |
| Combat | Random weapon crates | Form-specific weapons plus strategic crates |
| Movement | Kart driving | Runner, Beast, and Turret movement |
| Progression | XP, coins, cosmetics, character tokens | XP, character unlocks, cosmetics, mastery |
| Strategy | Weapon timing, positioning, map hazards | Morph timing, energy economy, objectives, information control |
| Randomness | High impact from weapon crates | Controlled randomness with visible spawns and counterplay |
| Controls | Keyboard/mouse and touch | Keyboard-only, mouse + keyboard, touch, controller-ready |
| Match length | Around 3 minutes | 3-5 minutes |
| Match start | Quick join | Instant: rooms start with bots; humans take bot seats as they join |

Smash Karts uses short matches, weapon crates, kill-based scoring, and progression systems such as XP, coins, character tokens, and prize machines. Shiftborn Arena keeps those proven engagement loops but differentiates through transformation combat and strategic objectives.

### Unique selling points

1. **Real-time three-form morphing:** Runner, Beast, and Turret.
2. **Flux and Overdrive economy:** Players decide when to become stronger.
3. **Living Arena:** Map districts rise, open, collapse, and change during a match.
4. **Overdrive Clash:** A designed duel mechanic between two fully charged players. (Post-launch, prototype-gated; see §8.)
5. **Strategic objectives:** Kills help, but objectives and map control decide matches.
6. **Universal controls:** Keyboard-only players can access every feature.
7. **Character identity:** Each character changes how the three forms behave.
8. **A readable counter triangle:** Runner beats Turret, Turret beats Beast, Beast beats Runner. A losing player always knows what to switch to.
9. **Never wait:** one click puts you in a live match.

***

## 4. Core Gameplay Loop

### Micro loop: every 5-20 seconds

```text
Move / position
→ Collect energy or contest a weapon crate
→ Choose whether to fight, capture, defend, or save energy
→ Use form ability or morph
→ Kill, escape, capture, or deny an objective
→ Earn score, energy, and XP
→ Repeat
```

### Match loop: 3-5 minutes

Instant join instead of a matchmaking wait, no loadouts at launch, and rooms persist between matches so players do not fall back to a menu.

```text
Press Play (instant join into a running or new room; bots hold empty seats)
→ Choose character (remembered from last time; no loadouts at launch)
→ Spawn into arena in Runner form
→ Fight for zones, Flux, and weapon crates
→ Morph strategically
→ Complete objectives and score points
→ Match ends
→ Receive XP, coins, and progression rewards
→ 15-second results screen, then the next match starts in the same room
```

### Meta loop: days to weeks

```text
Play matches
→ Earn XP, coins, character tokens, and mastery
→ Unlock characters, skins, trails, emotes, and arena cosmetics
→ Complete daily and weekly challenges
→ Climb ranked ladder (post-launch, when player population allows)
→ Participate in seasonal events
→ Return for new characters, maps, and modes
```

Ranked is post-launch. It needs enough concurrent players per region to produce fair matches (§18.4).

***
## 5. Core Concept: Morphing

Morphing is the central mechanic. Every character can transform between three forms, but each character's versions of those forms have different abilities, stats, and weapons.

The ability tables in 5.1 to 5.3 are the **ability pool**. Each character uses one signature ability per form, picked from or built on this pool (§12.0). In any single form a player manages at most four things: primary fire, one form ability, the crate weapon (if held) and the Ultimate (when charged).

### 5.1 Runner Form

**Role:** Mobility, scouting, objective capture, harassment.

**Visual identity:** The character separates from the vehicle and rides a hoverboard, glide pack, or light mechanical frame. Production: the board is a swappable "shell" model (§16.5).

**Stats:** 80 HP, 8.5 m/s, hitbox radius 0.6 m, Pulse Pistol (54 DPS, 14 m range). Full stat sheet in §5.6.

**Strengths:**

- Highest movement speed.
- Fast dash or grapple.
- Best objective-capture speed. (1.5x capture rate.)
- Small hitbox.
- Strong escape tools.
- Effective (1.25x damage) against Turrets.

**Weaknesses:**

- Lowest health.
- Weak against grouped enemies.
- Limited direct damage.
- Vulnerable to area denial.
- Resisted (0.75x damage) by Beasts.

**Example Runner abilities:**

| Ability | Effect | Cooldown |
|---|---|---|
| Dash | Short burst of speed in movement direction. 6 m over 0.2 s. | 5 seconds |
| Grapple Hook | Pulls player toward a wall or object. Only attaches to marked anchor posts, so players and bots can predict it. | 8 seconds |
| Decoy | Creates a fake character marker for 3 seconds. The decoy also appears on enemy minimaps and moves in a straight line. | 15 seconds |
| Flux Siphon | Each hit steals 1 Flux from the target | Passive |

### 5.2 Beast Form

**Role:** Close-range aggression, disruption, defense-breaking, body-blocking.

**Visual identity:** The character fuses with the vehicle, becoming an armored creature-like combat machine.

**Stats:** 140 HP, 6.0 m/s, hitbox radius 1.0 m, takes 50% less knockback, Scatter Cannon (about 44 DPS within 4 m, falling off to 9 m).

**Strengths:**

- High health.
- Strong melee ram.
- Can destroy cover and barriers. (Only cover marked as destructible; it rebuilds after 30 s.)
- Can knock enemies back.
- Strong in narrow corridors.
- Effective (1.25x damage) against Runners.

**Weaknesses:**

- Slower than Runner.
- Large hitbox.
- Weak at long range.
- Loud movement, making it easier to track. Beast footsteps are audible to enemies within 20 m and also shown as a visual sound ring, so players with sound off get the same information.
- Takes 1.25x damage from Turrets.

**Example Beast abilities:**

| Ability | Effect | Cooldown |
|---|---|---|
| Ram Charge | Charges forward, damaging and launching enemies. 12 m/s for 0.8 s, 25 damage, 4 m knockback. Hitting a wall stuns the Beast for 0.4 s, which rewards baiting the charge. | 7 seconds |
| Ground Slam | Creates a shockwave that slows nearby enemies. 4 m radius, 15 damage, 40% slow for 1.5 s. | 10 seconds |
| Iron Hide | Temporarily reduces incoming damage. 40% for 3 s. | 18 seconds |
| Chain Pull | Pulls one enemy toward the Beast. 10 m range, visible chain projectile that can be dodged. | 12 seconds |

### 5.3 Turret Form

**Role:** Area control, long-range damage, defense, zone denial.

**Visual identity:** The vehicle transforms into a stationary weapon platform with the character operating it.

**Stats:** 110 HP, cannot move while deployed, hitbox radius 0.9 m, turns at most 120° per second, front 120° arc is armored (takes 25% less damage), Rail Repeater (56 DPS, 18 m range).

**Strengths:**

- Highest ranged damage.
- Strong area denial.
- Can defend objectives.
- Can punish grouped enemies.
- Excellent at controlling chokepoints.
- Effective (1.25x damage) against Beasts.

**Weaknesses:**

- Cannot move at all while deployed. To relocate, morph back to Runner, which is free (§6.2).
- Vulnerable to flanking. Armor covers only the front arc, and the 120°/s turn cap lets a circling Runner get behind it.
- Weak against fast Runner pressure. Rail rounds arm after 4 m: targets closer than 4 m take 50% damage.
- Requires setup time. (The 0.5 s morph.)

**Anti-camping rules:**

- A deployed Turret is always shown on enemy minimaps. It is a loud, stationary emplacement.
- Heat: 7 s of continuous fire overheats the Rail Repeater for 2 s.
- In objective modes, Turrets capture at 0.5x speed. They hold zones well but cannot take them alone.

**Example Turret abilities:**

| Ability | Effect | Cooldown |
|---|---|---|
| Rail Shot | High-damage piercing shot. 45 damage after a 0.6 s charge with a visible aim line; targets get an edge-of-screen warning even if the Turret is off-screen. | 6 seconds |
| Flame Field | Creates a damaging area around the turret | 12 seconds |
| Deploy Drone | Drone reveals enemies or attacks automatically. Launch version reveals only: 8 m radius for 4 s. The drone can be shot down (20 HP). | 15 seconds |
| Barrier Wall | Places a temporary wall to block movement or projectiles. 6 m wide, 150 HP, lasts 8 s. | 20 seconds |

### 5.4 Morph rules

- Players begin each match and each life in **Runner form**.
- Morphing into Beast or Turret costs 35 Flux. Morphing back to Runner is free. (Replaces "Morphing consumes Morph Energy".)
- Morphing has a short animation, approximately 0.5 seconds. During it the player cannot fire or use abilities, moves at 50% speed, takes normal damage and is immune to knockback.
- Global morph cooldown: 3 s after a morph completes.
- Players cannot morph while stunned, grabbed, or carrying a Core in Reactor War. A Core carrier stays in the form they picked it up in.
- **Health carries over as a percentage.** A Runner at 40/80 HP (50%) becomes a Beast at 70/140 HP (50%). Rounded up. This removes the "morph to heal" exploit.
- Each form has its own speed, weapon, ability, hitbox and matchup modifiers.
- Each form's ability cooldown keeps running while you are in another form. Morphing never resets a cooldown.
- Crate weapons, shields and active status effects persist through a morph.
- A player may remain in one form for the entire match, but strong players will switch forms based on the situation.
- The current form must always be visible through silhouette, color, UI icon, sound, and animation.

### 5.5 Morph counterplay

v1.0 listed every form as countered by both other forms, which gives no form a clear job and no player a clear answer. The forms now form a triangle, like rock-paper-scissors, but with skill inside each matchup:

| Form | Beats | Loses to | Why |
|---|---|---|---|
| Runner | Turret | Beast | Runner closes distance with Dash, circles faster than the Turret can turn and hits for 1.25x. Rail rounds deal half damage inside 4 m. Against Beast, the pistol is resisted (0.75x) and Scatter Cannon hits Runners for 1.25x. |
| Beast | Runner | Turret | High HP, slows and pulls catch Runners, Scatter Cannon is effective. But Beast must cross open ground to reach a Turret, whose rail hits Beasts for 1.25x. |
| Turret | Beast | Runner | Out-ranges and out-damages an approaching Beast. Cannot move, turns slowly and is weak up close, so Runners flank it. |

How to beat your counter without switching forms:

| Form | Counterplay against its counter |
|---|---|
| Runner vs Beast | Kite in open space, bait Ram Charge into walls, never fight in corridors |
| Beast vs Turret | Approach behind cover, destroy cover lines, attack the unarmored side, use Iron Hide for the final rush |
| Turret vs Runner | Deploy with your back to a wall, place Barrier Wall on the flank, morph out early when a Runner closes in |

The triangle applies to form weapons and form abilities only. Crate weapons deal neutral damage to every form, so a crate can let any form win any fight. That keeps upsets possible without making them random.

### 5.6 Form stat sheet

Starting values for playtests. All live in the central balance file (Appendix E).

| Stat | Runner | Beast | Turret |
|---|---|---|---|
| Health | 80 | 140 | 110 |
| Move speed | 8.5 m/s | 6.0 m/s | 0 (deployed) |
| Hitbox radius | 0.6 m | 1.0 m | 0.9 m |
| Primary weapon | Pulse Pistol | Scatter Cannon | Rail Repeater |
| Base DPS (all hits) | 54 | about 44 (within 4 m) | 56 (beyond 4 m) |
| Max range | 14 m | 9 m | 18 m |
| Capture rate | 1.5x | 1.0x | 0.5x |
| Knockback taken | 100% | 50% | 0% (anchored) |
| Camera zoom | 1.0x | 0.9x | 1.3x (sees farther) |

### 5.7 Matchup damage modifiers

Multiplier applied to form weapons and form abilities (attacker's form, rows; defender's form, columns). Hit numbers show **EFFECTIVE** or **RESISTED** so players learn the triangle by playing.

| Attacker \ Defender | Runner | Beast | Turret |
|---|---|---|---|
| Runner | 1.0 | 0.75 | 1.25 |
| Beast | 1.25 | 1.0 | 1.0 |
| Turret | 1.0 | 1.25 | 1.0 |

The Turret's front-arc armor (0.75x) stacks with these multipliers.

***

## 6. Flux and Overdrive (was "Energy and Morph Meter")

### 6.0 Why this section changed

v1.0 had three overlapping names (Energy, Morph Energy, Morph Meter) and seven ways to spend energy. With morphs costing 80 to 100 and kills paying 25, the average player would morph about once per match, which defeats the core mechanic. The fix is one combat resource with one main use, and one separate meter for Ultimates:

- **Flux** (green bar): pays for morphing into Beast or Turret.
- **Overdrive** (gold meter): fills during combat and powers your character's Ultimate.

Player-facing text may call Flux "energy". Code and design docs always say Flux.

### 6.1 Flux sources

| Source | Flux gained |
|---|---|
| Passive regeneration | 1 per second, in any form |
| Small energy shard | 5 energy |
| Large energy shard | 15 energy |
| Eliminating an enemy | 20 (reduced to limit snowballing) |
| Assisting a kill | 10 energy |
| Capturing a zone tick | 5 energy per 5 s inside a zone your team holds (Reactor War) |
| Delivering a Core | 50 energy |
| Opening a weapon crate | 10 energy |
| Surviving 30 seconds without dying | Removed: it rewarded hiding. Passive regeneration replaces it. |

### 6.2 Flux costs

| Action | Cost |
|---|---|
| Morph to Beast | 35 Flux |
| Morph to Turret | 35 Flux |
| Return to Runner | Free (a Turret can never be stranded) |
| Place a trap | Removed as a universal action. Traps live in character kits (Bramble) and crate weapons (Mine Layer). |
| Activate personal shield | Removed as a universal action. Shields live in character kits (Rook). One fewer button on mobile. |
| Upgrade current weapon | Removed: invisible stat increases are hard to read in combat. |
| Fast respawn | Removed: replaced by the respawn Flux floor (§6.3). |
| Activate Overdrive Clash | Uses the Overdrive meter, not Flux (§6.4, §8) |

### 6.3 Flux rules

- Cap: 100. Start of match: 60. Shards picked up at 100 are wasted, which pushes players to spend.
- The Flux bar has notches at 35 and 70, so players see at a glance how many morphs they have banked.
- On death, 40% of carried Flux drops as shards at the death spot. The player respawns with the remaining 60%, never less than 40 (the comeback floor: everyone can morph right after respawning).
- Flux is per player. There is no team Flux.

### 6.4 Overdrive meter (was Morph Meter)

The Overdrive meter fills as the player earns energy, damages enemies, captures objectives, and survives. Exact sources: +1 per 5 damage dealt, +10 per elimination, +5 per assist, +10 per zone capture, +20 per Core delivery, +0.25 per second passively. Target: an average player fills it 1 to 2 times per 3-minute match.

- At 100%, the player can activate their character's Ultimate (§12). From v1.1, holding the Ultimate key near a fully charged enemy issues an Overdrive Clash instead (§8).
- The meter resets after use.
- Dying removes 25% of the current Overdrive meter, punishing reckless play without making death overly punishing.

### 6.5 Economy sanity check

Expected Flux income for an average player in a 3-minute Frenzy match (estimates to verify with telemetry):

| Source | Flux |
|---|---|
| Starting Flux | 60 |
| Passive regeneration (180 s) | 180 |
| Shards | about 60 |
| Eliminations and assists | about 40 |
| Crates | about 20 |
| **Total** | **about 360, enough for up to 10 morphs** |

Design target: 4 to 8 morphs per player per match. If telemetry shows fewer than 4, lower the cost or raise regeneration. If players flip every few seconds without thinking, raise the cooldown before raising the cost.

### 6.6 Strategic purpose

Flux creates decisions such as:

- Spend 35 now to go Beast and hunt a Runner, or keep it banked so you can drop a Turret when the enemy Beast commits.
- Grab the shard cluster before the fight, or let it go to hold position.
- Morph back to Runner (free) to escape, knowing the next Beast costs 35 again.
- Spend down before dying, because 40% of what you carry drops for your killer.

***

## 7. Combat System

### 7.1 Damage model

The game uses arcade-style combat with clear feedback.

- Players have visible health bars.
- Damage numbers appear on hits. Numbers are confirmed by the server and tagged EFFECTIVE or RESISTED when a matchup modifier applies.
- Enemies flash when damaged.
- Critical hits have a distinct sound and visual effect. (Only for character abilities that define a critical condition; there are no random crits.)
- Eliminated players explode into energy shards. (40% of their Flux, §6.3.)
- Respawn timer is 3 seconds in casual modes and 5 seconds in ranked modes. Reactor War also uses 5 seconds so objectives have windows.
- **Spawn protection:** 2 s of invulnerability after respawn, ended early by firing or using an ability. Protected players have a visible bubble.
- **Spawn selection:** the server picks the spawn point with the highest distance to the nearest enemy, excluding the last two used points.
- **Death recap:** during the respawn timer, a card shows who killed you, with which form and weapon, and the counter form to use next time.

### 7.2 Health values

| Form | Base health |
|---|---|
| Runner | 80 HP |
| Beast | 140 HP |
| Turret | 110 HP |

Health values are starting targets and must be tuned through playtesting. On morph, current health scales by percentage (§5.4).

### 7.3 Weapon categories

Weapons now come in two kinds. **Form weapons** are the primary fire of each form and never run out. **Crate weapons** are ammo-limited secondary weapons from crates, fired with their own button, and they work in any form.

| Weapon type | Best form | Behavior | Kind (v2.0) |
|---|---|---|---|
| Pistol | Runner | Fast, low damage, reliable | Runner form weapon (Pulse Pistol) |
| Shotgun | Beast | High close-range burst | Beast form weapon (Scatter Cannon) |
| Rifle | Turret | Medium range, sustained damage | Turret form weapon (Rail Repeater) |
| Rocket | Any | Slow projectile, area damage | Crate, launch |
| Grenade Launcher | Beast / Turret | Arcing explosive projectile | Crate, post-launch |
| Railgun | Turret | High damage, long charge time | Cut: duplicates the Turret's Rail Shot |
| Chain Lightning | Runner | Hits multiple nearby enemies | Crate, launch |
| Mine Layer | Beast | Places explosive traps | Crate, launch |
| Flame Thrower | Beast | Short-range continuous damage | Crate, launch |
| Drone Swarm | Turret | Sends small drones to attack enemies | Crate, post-launch (golden crate) |

**Form weapon numbers:**

| Weapon | Damage | Fire rate | DPS | Range | Projectile speed | Notes |
|---|---|---|---|---|---|---|
| Pulse Pistol | 9 | 6/s | 54 | 14 m | 45 m/s | Reliable, no falloff |
| Scatter Cannon | 7 pellets x 5 | 1.25/s | about 44 | 9 m | 35 m/s | Full damage within 4 m, 50% at 9 m |
| Rail Repeater | 16 | 3.5/s | 56 | 18 m | 70 m/s | 50% damage within 4 m; overheats after 7 s for 2 s |

**Launch crate weapons:**

| Crate weapon | Ammo | Effect |
|---|---|---|
| Rocket | 3 | 40 direct + 25 splash (2.5 m radius), destroys cover |
| Mine Layer | 3 mines | 45 damage, arms after 1 s, blinks when an enemy is within 5 m |
| Chain Lightning | 5 casts | 22 damage, chains to 2 nearby enemies at 60% |
| Flame Thrower | 4 s of fuel | 50 DPS in a 6 m cone, applies Burn |

### 7.4 Weapon crates

Weapon crates remain in the game because they create excitement and map movement, but they must not make matches feel purely lucky.

Rules:

- Crates spawn at fixed, visible locations. (6 points on the launch map, plus one golden crate in the center after post-launch.)
- Crate spawn timers appear on the minimap. (Shown during the last 5 s; crates respawn 20 s after being opened.)
- The weapon category inside a crate is visible from a distance.
- High-power weapons spawn in dangerous areas.
- Crates can be destroyed by explosives. A destroyed crate respawns on its normal timer.
- A player who opens a crate receives an ammo-limited crate weapon on its own button. It lasts until its ammo runs out or 30 s pass, persists through morphs, and is replaced if the player opens another crate. The form weapon is never overridden.
- Opening a crate grants a small amount of energy.

This preserves the fun of Smash Karts' question-mark crates while reducing pure randomness.

### 7.5 Damage rules

- Friendly fire is disabled in casual and ranked modes.
- Environmental hazards damage all players. A hazard kill is credited to the last enemy who damaged the victim within 5 s.
- Explosive damage decreases with distance.
- Headshots are not used because the game is top-down and character forms differ.
- Backstab bonus damage may exist only for specific characters.
- Damage falloff applies to shotguns and automatic weapons.
- Projectiles should be readable, with clear trails and impact effects. Projectiles are tinted by team (allies blue, enemies red), so a player can always tell incoming fire from their own.

### 7.6 Status effects

| Effect | Result | Duration |
|---|---|---|
| Slow | Reduces movement speed (max 40%) | 1-2 seconds |
| Stun | Prevents movement and abilities | 0.5-1 second |
| Burn | Deals damage over time | 3 seconds |
| Reveal | Shows enemy through walls or minimap | 3-5 seconds |
| Shield | Absorbs damage | Until depleted |
| Knockback | Pushes enemy away | Instant |
| Gravity Pull | Pulls enemy toward a point | 1 second |

Status effects must have clear visual icons, sounds, and screen feedback.

**Crowd-control immunity:** after a stun or pull ends, the target is immune to stun and pull for 2 s. Slows do not stack; the strongest one applies. This prevents chain-stun locks, which feel terrible on high-latency connections.

### 7.7 Time-to-kill targets

Seconds to kill from full health with every shot hitting, form weapons only. Real fights take 1.5 to 2x longer because of misses. Design rule: winning matchups kill in 2 s or less, losing matchups take 3 s or more.

| Attacker \ Defender | Runner (80) | Beast (140) | Turret (110) |
|---|---|---|---|
| Runner | 1.5 s | 3.5 s (losing) | 1.6 s flank / 2.2 s front (winning) |
| Beast (within 4 m) | 1.5 s (winning) | 3.2 s | 2.5 s flank / 3.4 s front |
| Turret (beyond 4 m) | 1.4 s (2.9 s within 4 m) | 2.0 s (winning) | 2.0 s flank / 2.6 s front |

### 7.8 Bounty and comeback

- A player on a 3-KO streak becomes **Wanted**: a marker shows on every minimap.
- KO-ing a Wanted player is worth 1 bonus KO and drops a large shard cluster.
- The respawn Flux floor (§6.3) means a player who keeps dying can still morph immediately.
- Bots in the room (Appendix A) prefer to target the leading human, which gently slows runaway leaders.

***

## 8. Overdrive Clash

**Overdrive Clash** is the signature close-range duel mechanic.

### 8.0 Review findings

- Slowing time for two players in an 8-player real-time match is impossible without slowing everyone, and slowing everyone ruins six other players' fights.
- Triggering automatically on collision forces a mini-game on players who did not ask for it.
- A hidden simultaneous choice is a pure guess, which contradicts Pillar 3. The v1.0 text even says its purpose is to let weaker players turn a fight around through prediction.
- With different pings, the lower-latency player would see the prompt earlier unless the server enforces the window.

### 8.1 Status

Post-launch experiment for v1.1, behind the gate in §8.6. At launch, a full Overdrive meter powers the character's Ultimate (§12).

### Trigger

- Opt-in: a player with a full Overdrive meter **holds** the Ultimate key for 0.4 s while aiming at an enemy within 5 m who also has a full meter. Tapping the key still fires the Ultimate.
- The challenged player cannot refuse (it is an attack), but the challenger spends their whole meter even if they lose, so challenges are a real risk.
- A Clash never triggers automatically.

### Sequence

1. Both duelists are rooted for 1.0 s inside a visible ring. Time does not slow. Other players keep playing and can attack either duelist, which is part of the risk.
2. Both players receive a prompt.
3. Each player chooses one of three actions (keys 1, 2, 3 or three large touch buttons; choices stay hidden):
   - **Ram**
   - **Shield**
   - **Overload**
4. The game resolves the outcome. Choices are revealed for 0.4 s first. A player who picks nothing gets a random choice.
5. The winner receives a temporary golden weapon and speed boost. (2x form weapon damage and +30% speed for 6 s.)
6. The loser is launched into the air and drops energy shards. (Launched 5 m, stunned 0.6 s, drops 30% of their Flux.) Both meters empty.

### Counter system

| Player A chooses | Player B chooses | Result |
|---|---|---|
| Ram | Shield | Shield wins |
| Shield | Overload | Overload wins |
| Overload | Ram | Ram wins |
| Same choice | Same choice | Both are knocked back; no winner |

**Read the opponent:** each duelist's last two Clash choices are shown above their nameplate during a Clash. Players with habits become predictable, which turns a blind guess into a read.

### 8.5 Network resolution

The server opens the choice window and accepts input for 1.0 s plus each player's measured one-way latency (capped at 100 ms), so a higher-ping player gets the same decision time. The server resolves and broadcasts the result; clients only display it.

### 8.6 Playtest gate

Ship Clash only if, across two external playtests with 20+ players: at least 60% of players who experienced a Clash rate it fun, fewer than 20% describe it as random, and match completion does not drop. Otherwise cut it; Ultimates remain the full-meter payoff.

### Purpose

Overdrive Clash creates highlight moments and rewards players who engage rather than camp. It rewards reading an opponent's habits.

***
## 9. Strategy Systems

The game must not be won only by getting the most kills. Strategy must come from objectives, resources, positioning, information, and counterplay.

### 9.1 Performance Score (was Dominion Score)

Performance Score (formerly Dominion Score) decides **no** win condition. It is a per-player score used for the match MVP, post-match XP and leaderboards. Win conditions are defined per mode in §11.

| Action | Score |
|---|---|
| Elimination | 100 points |
| Assist | 40 points |
| Zone capture | 150 points |
| Zone held per 5 seconds | 25 points |
| Core delivery | 500 points |
| Weapon crate denial | Removed: never defined |
| Final Reactor control | Removed: never defined |
| KO of a Core carrier | 150 points |
| KO of a Wanted player | +100 bonus points |
| Damage dealt | 1 point per 2 damage |

### 9.2 Objective control

Objectives should be more valuable than random kills.

- **Energy Zones** generate energy for the controlling team.
- **Reactor Zones** charge the team Reactor (Reactor War, §11.2).
- **Core Spawn Points** create high-value delivery objectives.
- **Weapon Crates** create temporary combat advantages.
- **Cover Nodes** can be destroyed or rebuilt by certain forms. Beast and explosives destroy them; Bramble rebuilds them; destroyed cover rebuilds itself after 30 s.

### 9.3 Information control

Players gain information through risk.

| Tool | Benefit | Cost or risk |
|---|---|---|
| Scanner Drone | Reveals enemies in an area | Reveals user briefly |
| Energy Radar | Shows next shard cluster | Consumes energy (post-launch; launch shows shard clusters 3 s before they spawn to everyone) |
| Decoy | Creates a fake minimap signal | Consumes energy (cooldown-based, §5.1) |
| Sound cues | Reveals Beast and Turret activity | Requires careful listening (also shown as visual sound rings) |
| Minimap pings | Team communication | Limited ping cooldown |

- **Server-side visibility:** enemies that are out of view or hidden are not sent to that player's client (§18.6). Information tools therefore cannot be bypassed by reading network traffic.
- Pings and preset quick-chat phrases are the only team communication at launch. There is no free text chat (Appendix C).

### 9.4 Map strategy

Maps must include:

- Safe but slower routes.
- Fast but exposed routes.
- Chokepoints for Beast and Turret control.
- Open lanes for Runner mobility.
- Vertical elements such as bridges, ramps, and raised platforms. Limited at launch: one raised level reached by ramps or jump pads, and no walkable floor directly above another walkable floor. Stacked layers in a top-down view hide players and confuse projectile hits.
- Destructible cover.
- Hazard zones.
- High-risk, high-reward weapon spawn areas.
- Sightlines no longer than 22 m, so the Turret's 18 m range dominates lanes without covering the whole map.

### 9.5 Anti-luck design rule

> **Randomness decides opportunities; decisions decide outcomes.**

Examples:

- Weapon crates may contain random weapons, but their location and timing are visible.
- Environmental hazards may activate randomly, but players receive warnings.
- Energy shard clusters may spawn in variable places, but capturing them requires risk.
- Powerful weapons may be strong, but their spawn locations are contested and predictable.

***

## 10. Living Arena

The arena changes during the match to force movement and strategic planning.

### 10.1 District system

**Launch scope:** one map, *Neon Junction*, built from three districts: Neon Market, Scrapyard and Reactor Core. The remaining districts become separate maps or variants after launch. Six districts with seven events in one arena is too much to build, test and teach for v1.

The arena contains several districts:

- **Neon Market:** Tight corridors, destructible stalls, high cover density. (Launch)
- **Scrapyard:** Open areas, moving crushers, metal ramps. (Launch)
- **Sky Bridge:** Narrow elevated path with long sightlines. (Later; needs the layered-floor rules of §9.4)
- **Reactor Core:** Central high-value zone with dangerous energy vents. (Launch)
- **Flooded Tunnel:** Slow movement, water hazards, ambush routes. (Later)
- **Launch Pad:** High-risk jump pads and vertical movement. (Later as a map; two jump pads exist on Neon Junction)

### 10.2 Arena events

Every 45-60 seconds, one event occurs: In a 3-minute Frenzy match that means two events, at 1:00 and 2:00.

| Event | Effect | Release |
|---|---|---|
| District Rise | A new area rises from the floor | Later (needs extra bot navigation states) |
| Bridge Collapse | A route disappears temporarily | Launch, as "Route Closure" (a gate closes one of three lanes for 30 s) |
| Reactor Surge | Central zone gives double energy but damages players over time | Launch |
| Crate Storm | Multiple weapon crates spawn in contested areas | Launch |
| Blackout | Minimap is disabled for 10 seconds | Later |
| Gravity Shift | Jump pads and projectile arcs change | Cut: changes projectile physics mid-match, which hurts readability and network prediction |
| Security Lockdown | Doors close, creating temporary arenas | Later |

### 10.3 Telegraphing

Arena changes must never feel unfair.

- Show a warning 10 seconds before a major event.
- Display the next objective on the minimap.
- Use audio cues and visual markers.
- Give players time to reposition, set traps, or contest an area.
- Each map state (for example a closed lane) has its own pre-built bot navigation data, so bots react to events correctly.

### 10.4 Launch map spec: Neon Junction

| Item | Spec |
|---|---|
| Playable area | 64 x 64 m, symmetric enough for fair spawns |
| Layout | Three lanes (Market corridors west, Scrapyard open east, Reactor Core center) |
| Spawn points | 10 around the edge |
| Crate points | 6 (two per district), fixed |
| Shard cluster points | 10 possible, 3 active at a time, announced 3 s before spawning |
| Destructible cover | 8 pieces, marked with visible cracks |
| Grapple anchors | 6 posts |
| Jump pads | 2, onto one raised platform per side |
| Hazards | 1 crusher in the Scrapyard (2 s warning), energy vents in the Reactor Core |
| Longest sightline | 22 m |

***

## 11. Game Modes

### 11.0 Mode plan

Every extra mode splits a small player base into emptier rooms. Launch with one mode, add the strategic team mode once the core loop is proven, and add the rest only when the population supports them.

| Mode | Release | Reason |
|---|---|---|
| Frenzy (was Smash Rush) | Launch | Instant, works with any number of humans plus bots |
| Boot Camp (tutorial) | Launch | First-time experience, §14.5 |
| Private rooms | Launch | Friends via invite link (portal requirement for multiplayer pages) |
| Reactor War | v1.1 | Flagship strategy mode; needs team bots and the proven core loop |
| King of the Morph | v1.2 | Good rotation mode once rooms are full |
| Core Heist | Cut | Same carry-the-Core loop as Reactor War; its base-steal idea can return as a Reactor War map variant |
| Last Engine | Later | Needs 16-player rooms, a larger map and more server capacity |

### 11.1 Frenzy (was Smash Rush)

**Players:** 8 (always 8: bots fill empty slots and leave as humans join)  
**Type:** Free-for-all  
**Duration:** 3 minutes  
**Win condition:** Most KOs wins. Ties are broken by fewer deaths, then by more damage dealt.

Rules:

- Players earn points for eliminations.
- Energy shards spawn across the map.
- Weapon crates spawn regularly.
- The player with the highest score wins.
- This is the first mode to implement.
- KO-ing a Wanted player gives 1 bonus KO (§7.8).
- Deaths to hazards with no recent attacker cost no points, but the Flux still drops.
- Humans can join mid-match until 60 s remain; they take over a bot's seat.

### 11.2 Reactor War (v1.1)

**Players:** 4v4  
**Type:** Objective-based team mode  
**Duration:** 5 minutes  
**Win condition:** First team to deliver two Cores, or, at time end, the team with more deliveries; if tied, the team with higher Reactor charge.

Rules:

- Three energy zones spawn across the map.
- Holding zones charges the team Reactor. Each held zone adds 1% per second. Each enemy KO adds 2%.
- Capturing a zone takes 6 s for one Beast. Runners capture at 1.5x, Turrets at 0.5x, and each extra teammate adds 50% (max 2x). A zone with both teams inside is contested and does not progress. An enemy zone must first decay to neutral before you can capture it.
- When a Reactor reaches 100%, a Core spawns. It spawns on that team's forward pad (announced 5 s ahead), and the Reactor resets to 0 and keeps charging.
- A player picks up the Core and carries it to the enemy delivery pad. Only the team that charged a Core can carry it.
- The Core carrier cannot morph and moves 20% slower. The carrier can still shoot.
- The carrier drops the Core when eliminated. Teammates can pick it up. Enemies who stand on a dropped Core for 2 s neutralize it and gain 10% Reactor charge.
- First team to deliver two Cores wins.
- **Overtime:** if a Core is being carried or lies on the ground at 0:00, play continues until it is delivered or neutralized, for at most 45 s.
- Respawn time is 5 s.

This is the flagship strategic mode.

### 11.3 King of the Morph (v1.2)

**Players:** 8  
**Type:** Free-for-all objective mode  
**Duration:** 4 minutes  
**Win condition:** Most time spent controlling the center.

Rules:

- A central Morph Core appears.
- Standing inside it earns points. 1 point per second, only while you are the only player inside. Contested zones give nobody points.
- The zone changes location every 60 seconds. The next location is shown 10 s before it moves.

### 11.4 Core Heist (Cut)

Cut from the plan. It repeats Reactor War's carry-the-Core loop with a different name and would split the team-mode population. The v1.0 rules also had the carrier unable to use weapons, while Reactor War's carrier could, which would confuse players switching between the two. Its best idea, stealing from an enemy base, can return as a Reactor War map variant.

### 11.5 Last Engine (Later)

**Players:** 12-16  
**Type:** Shrinking arena battle royale  
**Duration:** 5-7 minutes  
**Win condition:** Last player or team alive.

Rules:

- The arena shrinks in stages.
- The final zone contains moving walls and energy storms.
- Players can collect energy and morph throughout the match.
- This mode is added after the core modes are stable.
- Prerequisites: 16-player rooms load-tested, a map at least 2x the launch map, and enough concurrent players that bots fill under half the seats.

### 11.6 Boot Camp

A 90-second guided match against training dummies and two easy bots. Defined in §14.5.

### 11.7 Private rooms

- Any player can create a private room for any released mode and share it by room code or portal invite link.
- Empty seats can be filled with bots (host toggle, on by default).
- Private rooms give normal XP but do not count for leaderboards or ranked.
- When CrazyGames launches the game in "instant multiplayer" mode, the first player of a party goes straight into a new private room with default settings (portal requirement, Appendix B).

***

## 12. Characters

Characters are not only cosmetic. Each one modifies the three forms, giving players a preferred playstyle.

### 12.0 Character kit template

| Slot | Runner | Beast | Turret |
|---|---|---|---|
| Primary weapon | Pulse Pistol (character may modify) | Scatter Cannon (may modify) | Rail Repeater (may modify) |
| Signature ability | 1 | 1 | 1 |
| Ultimate | One per character, usable in any form, costs a full Overdrive meter | (same Ultimate) | (same Ultimate) |

A modified weapon may change behavior (chaining, piercing) but its DPS must stay within 10% of the base weapon. **Launch roster: Volt, Bramble, Nova.** They cover aggressive, tank and control playstyles. Mira needs server-side visibility work, and Rook's scaling needs tuning, so both move to v1.1.

### 12.1 Volt: The Street Racer (Launch)

**Playstyle:** Aggressive, fast, electric.

- **Runner:** Electric dash that damages enemies passed through.
- **Beast:** Lightning Bull with a chain-lightning ram.
- **Turret:** Tesla Cannon that chains between enemies.
- **Ultimate:** Storm Surge, creating a moving electric field.

### 12.2 Mira: The Ghost Mechanic (v1.1)

**Playstyle:** Stealth, trickery, information control.

- **Runner:** Short phase dash through thin walls. Only walls marked as thin.
- **Beast:** Panther-Tank with a temporary invisibility field. A shimmer is visible within 4 m; firing breaks invisibility for 1.5 s; invisible players are not sent to enemy clients at all (§18.6).
- **Turret:** Deploys holographic decoy turrets.
- **Ultimate:** Phantom Grid, revealing enemies while hiding teammates.

### 12.3 Bramble: The Junkyard Brawler (Launch)

**Playstyle:** Tanky, disruptive, close-range.

- **Runner:** Places scrap barricades. Max 2 at a time, 100 HP each.
- **Beast:** Strongest ram attack and armor spikes.
- **Turret:** Builds cover walls and fires scrap projectiles.
- **Ultimate:** Salvage Storm, pulling nearby metal debris into a damaging whirlwind.

### 12.4 Nova: The Star Cartographer (Launch)

**Playstyle:** Zone control, team support, area denial.

- **Runner:** Places gravity pads that pull enemies.
- **Beast:** Gravity Ram that drags enemies inward.
- **Turret:** Gravity Well that slows and pulls enemies.
- **Ultimate:** Singularity, creating a large pull zone.
- All of Nova's pulls follow the crowd-control immunity rule (§7.6), so she cannot chain-lock a target.

### 12.5 Rook: The Riot Bot (v1.1)

**Playstyle:** Scaling bruiser, defensive frontline.

- **Runner:** Deploys small shield drones.
- **Beast:** Gains 10% damage reduction per elimination, up to 3 stacks, all lost on death. Unlimited permanent armor would snowball out of control.
- **Turret:** Deploys a riot barrier and suppressive fire.
- **Ultimate:** Riot Protocol, becoming temporarily immune to knockback.

### 12.6 Character unlock rules

- The first three characters are available from the start. (At launch this is the full roster: Volt, Bramble, Nova.)
- Additional characters unlock through gameplay tokens. A new character should be unlockable with about 8 hours of normal play.
- Characters can also be unlocked instantly with Gems once the shop exists (§19). Buying a character only saves time; every character stays earnable.
- No character may be strictly stronger than another.
- Each character must have a clear strength, weakness, and counterplay.

***

## 13. Progression System

### 13.1 Account level

Players earn Account XP from:

- Match completion.
- Eliminations.
- Assists.
- Objective captures.
- Form variety: a once-per-match bonus for dealing damage in two or more forms. Rewarding raw morph count would reward pointless flipping.
- Wins.
- Daily challenges.

**Anti-farming:** KO XP from bots is reduced by 50% and capped per match. Leaving a match early forfeits its match XP.

### 13.2 Character mastery

Each character has its own Mastery Level.

Mastery rewards:

- Character-specific titles.
- Profile banners.
- Weapon trails.
- Victory poses.
- Exclusive cosmetic variants.

Mastery must not provide gameplay advantages.

### 13.3 Currencies

| Currency | Earned from | Used for |
|---|---|---|
| XP | Matches and challenges | Account level |
| Coins | Matches, quests, events | Common cosmetics |
| Character Tokens | Matches, missions, events | Unlocking characters |
| Gems | Rare rewards or purchase | Premium cosmetics, battle pass (not in the launch build; arrives with the shop) |
| Mastery Points | Playing a specific character | Character mastery rewards |

Coins can never be bought with Gems or money. That keeps any random cosmetic machine strictly earned-only (§13.4).

### 13.4 Unlock philosophy

- All gameplay-relevant content must be earnable through play.
- No weapon, character, or stat upgrade may be exclusive to paying players.
- Paid content should be cosmetic or convenience-based.
- Random reward machines, if any, use earned Coins only, disclose their odds, and can never be bought into directly or indirectly. Every paid item is a direct purchase with the item shown before buying. This matters with a young audience and with regulators that treat paid random rewards as gambling.
- No pay-to-win advantages in ranked modes.

### 13.5 Daily and weekly challenges

Examples:

- Get 10 Beast-form rams.
- Win a match without dying.
- Capture 5 zones as Runner. (From v1.1, when Reactor War exists)
- Deal 2,000 damage in Turret form.
- Deliver 2 Cores in Reactor War. (From v1.1)
- Play 3 matches with different characters.
- Rule: the daily set only offers challenges completable in currently released modes.

***

## 14. User Interface and UX

### 14.1 Main menu

**Play-first flow:** a first-time player never sees the main menu before playing. Load → Boot Camp (skippable) → live Frenzy match. Returning players land on a home screen where Play is the dominant button and Enter or Space starts a match.

The main menu must show:

- Play button.
- Character selection.
- Loadout and control settings. (Control settings only; no loadouts at launch)
- Challenges.
- Shop. (When it exists, §19)
- Battle pass. (When it exists, §19)
- Friends and party. (At launch: private room plus portal invite link)
- Leaderboards. (Post-launch)
- Settings.

### 14.2 In-match HUD

The HUD must display:

- Health bar.
- Shield bar.
- Flux bar with notches at 35 and 70.
- Overdrive meter (glows and pulses when full).
- Current form.
- Current weapon and ammunition. (Form weapon icon, plus crate weapon icon with ammo and remaining time.)
- Ability cooldowns.
- Match timer.
- Score or objective status.
- Minimap.
- Kill feed.
- Respawn timer. (With the death recap card, §7.1.)
- Teammate status in team modes.
- Form buttons 1, 2, 3 with cost and cooldown, greyed out when unaffordable.
- Off-screen threat arrows (enemies aiming at you, Rail Shot charge lines).
- Wanted markers (§7.8).
- CrazyGames username above each player (portal requirement).

**Layout:** desktop puts the timer and score top-center, kill feed top-left, minimap top-right, health and Flux bottom-left, form buttons bottom-center, ability, crate weapon and Ultimate bottom-right. On mobile the joysticks take the bottom corners, so health and Flux move top-left and form buttons sit above the right joystick.

### 14.3 Morph wheel

On PC, morphing uses direct keys 1, 2 and 3: faster than a wheel and it never interrupts aiming. The wheel exists only on controller (hold LB). Mobile uses three small form buttons.

It shows:

- Runner icon.
- Beast icon.
- Turret icon.
- Energy cost. (Flux cost)
- Cooldown status.
- Locked or available state.

### 14.4 UI principles

- Important combat information must be readable in under one second.
- Use icons plus text labels.
- Avoid hiding critical information behind menus.
- Use colorblind-safe indicators.
- Provide scalable UI for mobile and desktop.
- Show controls during the first match.
- Use clear visual and audio feedback for damage, pickups, morphs, and objectives.
- All text must be legible in a 821 x 462 px window at devicePixelRatio 1 (CrazyGames checks this).
- Every menu screen must work with keyboard only, mouse only, touch only and controller.

### 14.5 First-time experience: Boot Camp

About 90 seconds, skippable after 10 seconds, skipped automatically for returning players. One instruction on screen at a time, no text walls, and each step completes by doing it. Prompts use the glyphs of the input device the player is actually using.

1. Move to a marker.
2. Shoot a training dummy (Runner).
3. Press 2: morph to Beast and ram a stack of crates.
4. Press 3: morph to Turret and stop three dummies walking in from range.
5. Press 1: back to Runner (free), dash, open a crate and fire the crate weapon.
6. Beat two easy bots, then drop straight into a live Frenzy room.

For the first three real matches: mostly easy bots, and contextual counter hints such as "Enemy Beast close: Turret beats Beast (press 3)". At most one hint per 20 s; hints can be turned off. Each Boot Camp step is logged (Appendix D) to find where players quit.

### 14.6 Camera and readability

- Perspective camera at about 50° pitch, fixed north-up (never rotates).
- Default view about 36 m wide at 16:9. The camera leads up to 6 m toward the aim direction, and zoom changes per form (§5.6).
- **On-screen fairness rule:** every weapon's maximum range must fit inside the visible area in the aim direction for the form using it. A player must be able to see whoever is shooting them, or get an edge arrow for it.
- Walls and props between the camera and a player fade to 30% opacity; players behind cover show as silhouettes.
- Your own character has a white ground ring. Enemies have red outlines and nameplates.
- Mobile is landscape only, with a rotate prompt in portrait.

***
## 15. Controls

### 15.0 What changed and why

- v1.0 bound the arrow keys to both "alternative movement" and "aim" in the same scheme. Arrows are now aim only in keyboard-only mode. A one-hand preset (arrows move, auto-aim on) exists in accessibility settings.
- The same key now does the same thing in every PC scheme: 1/2/3 morph, E ability, Space fire, R crate weapon, X Ultimate, Tab scoreboard, Z ping. Players who switch between mouse and keyboard-only do not relearn anything.
- Shift is removed from defaults: pressing it five times opens Windows Sticky Keys in the middle of a match. It stays available for remapping.
- "Pause" is removed: an online match cannot pause. Esc or P opens the menu while the match keeps running.
- Tab is the scoreboard everywhere; lock-on target cycling moved to Q.
- The PC morph wheel and number-key emotes are removed (they collided with morph keys). Emotes return post-launch on a separate key.

### 15.1 Keyboard-only controls

Keyboard-only players must be able to access every gameplay feature.

| Action | Default key |
|---|---|
| Move | W A S D |
| Alternative movement | Removed from default (conflicted with aim); available as the one-hand preset |
| Aim / turn | Arrow keys (8 directions with smoothed rotation) (I J K L available by remapping) |
| Fire | Space (auto-fire toggle in settings) |
| Morph to Runner | 1 |
| Morph to Beast | 2 |
| Morph to Turret | 3 |
| Special ability | E |
| Crate weapon | R |
| Ultimate / Overdrive | X (from v1.1, hold 0.4 s near a charged enemy for a Clash) |
| Interact / use item | F (picking up and dropping Cores; everything else is automatic) |
| Lock nearest enemy | Q (tap again to cycle; hold 0.5 s to release) |
| Switch locked target | Q (tap) |
| Ping | Z |
| Scoreboard | Tab (hold) |
| Pause | Menu: Esc or P (the match keeps running) |
| Confirm menu | Enter or Space |
| Navigate menus | Arrow keys or W A S D |

### 15.2 Mouse and keyboard controls

| Action | Control |
|---|---|
| Move | W A S D |
| Aim | Mouse cursor |
| Fire | Left mouse button (Space also fires) |
| Morph wheel | Direct keys 1, 2, 3 |
| Ability | E |
| Crate weapon | Right mouse button (R also works) |
| Ultimate | X |
| Interact | F |
| Ping | Z or middle mouse button |
| Scoreboard | Tab |
| Emote | Post-launch, on B (number keys are morph keys) |

### 15.3 Mobile controls

| Action | Control |
|---|---|
| Move | Left virtual joystick (floating: appears where the thumb lands) |
| Aim | Right virtual joystick |
| Fire | Fires automatically while the right stick is dragged; a quick tap on the right stick fires at the nearest enemy (soft lock). Separate fire button available in settings. |
| Morph | Three small form buttons above the right stick, showing cost and cooldown |
| Ability | Ability button |
| Crate weapon | Button appears only while a crate weapon is held |
| Ultimate | Button appears and pulses when Overdrive is full |
| Interact | Automatic pickup |
| Orientation | Landscape only |

### 15.4 Controller controls (v1.1)

| Action | Control |
|---|---|
| Move | Left stick |
| Aim | Right stick |
| Fire | Right trigger |
| Morph wheel | Left trigger or D-pad (D-pad left / up / right = Runner / Beast / Turret; hold LB for the wheel) |
| Ability | Circle / B |
| Interact | Square / X |
| Crate weapon | Left trigger (the wheel moves to LB) |
| Ultimate | Triangle / Y |
| Scoreboard | Touchpad / View button |

### 15.5 Keyboard-only aiming

Because mouse aiming is not required, use **soft lock-on**:

- Press Q to lock the nearest enemy.
- Press Q again to switch targets.
- Shots curve slightly toward the locked target. Projectiles fired while locked get up to 6° of heading correction toward the target's position at the moment of firing. There is no homing after the shot, so strafing still dodges.
- Lock-on does not guarantee a hit.
- Enemies can break lock using cover, dashes, or invisibility. Lock breaks after 0.5 s out of line of sight or out of weapon range.
- Long-range weapons have reduced accuracy while locked. (The Rail Repeater gets 3° of correction instead of 6°.)
- Players can disable aim assist in settings.
- Aim assist never applies to mouse aiming.
- **Fairness test:** in internal tests against standard bots, keyboard-only hit rate must be within 10% of mouse hit rate at each skill level. Tune the correction angle until it is.
- Ranked (post-launch) matches mouse players and assisted inputs (keyboard-only, touch, controller) in separate pools once population allows.

### 15.6 Input accessibility

Required settings:

- Full key remapping.
- Toggle instead of hold for sprint, shield, and fire.
- Adjustable aim-assist strength.
- Auto-pickup toggle.
- Adjustable joystick size and opacity.
- Colorblind-safe UI.
- Screen-shake reduction.
- Motion reduction.
- Subtitles and visual sound indicators.
- One-hand keyboard preset (arrows move, auto-aim on, fire on Enter).
- Enemy highlight color picker (for colorblind players).

Keyboard access is a foundational accessibility requirement: all functionality should be available through keyboard input.

### 15.7 Browser input rules

- Call preventDefault on Space, arrow keys and Tab during gameplay, otherwise the page scrolls or focus jumps.
- Disable the right-click context menu on the game canvas.
- Esc exits fullscreen in browsers and may not reach the game, so P is a second menu key.
- Never use Ctrl or Cmd combinations (Ctrl+W closes the tab).
- On window blur or tab switch, release all held keys so a player does not keep running into a wall.
- Detect the input scheme from the most recent input and switch on-screen glyphs automatically. Mixed use (mouse plus keyboard-only keys) always works.

***

## 16. Art Direction

### 16.1 Visual style

The game should use a bright, readable, cartoon-inspired style with:

- Bold silhouettes.
- Strong color coding.
- Clean outlines.
- Simple shapes.
- High-contrast enemies and allies.
- Readable projectiles.
- Satisfying impact effects.

### 16.2 Color rules

| Element | Color direction |
|---|---|
| Player team | Blue (cyan was too close to energy teal) |
| Enemy team | Red / orange plus red outline and nameplate. In free-for-all, every opponent uses enemy colors. |
| Energy | Green |
| Weapon crates | White capsule with a dark weapon-category icon on top (yellow now belongs to hazards) |
| Objectives | Purple |
| Hazards | Yellow / black stripes plus a warning icon (red was the enemy color) |
| Morph forms | Forms are identified by silhouette and icon shape (Runner: arrow, Beast: horns, Turret: crosshair). Accent colors appear only on HUD form buttons, so they never compete with team colors. |
| Your own character | White ground ring under your team color |

Rule: no information is carried by color alone. Every color cue has a matching shape, icon or outline.

### 16.3 Character design rules

Each character must be recognizable from:

- Silhouette.
- Primary color.
- Vehicle shape.
- Form transformation.
- Weapon design.
- Movement animation.

### 16.4 Animation priorities

1. Morph animation.
2. Fire and hit feedback.
3. Elimination effect.
4. Movement and dash.
5. Objective capture.
6. Victory and defeat poses.

### 16.5 Production approach

Five characters with three transforming forms each means 15 vehicle models plus transformations. With no in-house artist, true mechanical transformations are out of reach for v1. The plan:

- **Shell swap morph:** each character is one rider model plus three vehicle "shells" (board, beast shell, turret platform). A morph is a 0.5 s energy burst VFX that hides the swap, plus a scale-pop on the new shell. This reads as a transformation at gameplay camera distance and costs a fraction of a rigged transformation.
- **Greybox first:** capsules, cubes and cones in form colors until Fun Gate 1 (§21.2) passes. No art spending before the core loop is proven.
- **Environment and props:** CC0 or purchased low-poly packs (for example Kenney, Quaternius, KayKit), unified by one toon shader and one palette texture.
- **Characters:** commission a freelance 3D artist for the three launch riders and their nine shells, against the budgets in §16.6. AI-generated 3D models are fine for concepts and blockouts; check each tool's license before shipping anything generated.
- **UI:** a purchased or free game UI kit, adapted in Figma, then implemented. No from-scratch UI design.
- **Style lock:** one reference board approved before M3 so every source looks like one game.

### 16.6 Asset budgets

| Asset | Budget |
|---|---|
| Rider | 3,000 triangles or fewer, 12 animation clips or fewer |
| Each form shell | 4,000 triangles or fewer, animated by transforms (spinning wheels, rotating barrel), no skinning |
| Textures | One shared 256 x 256 palette texture plus small emissive masks; compressed GPU textures |
| Draw calls on screen | about 100 on desktop, about 60 on mobile (instancing for shards, projectiles, props) |
| Triangles on screen | about 300k desktop, about 120k mobile |
| Initial download (everything needed for the first match) | 15 MB target, 20 MB hard limit (§18.5) |

***

## 17. Audio Design

### 17.1 Core audio needs

- Weapon fire sounds.
- Hit confirmation sounds.
- Elimination sound.
- Morph transformation sound.
- Energy pickup sound.
- Crate opening sound.
- Objective capture sound.
- Overdrive Clash sound.
- Low-health warning.
- Respawn sound.
- Victory and defeat music.
- EFFECTIVE and RESISTED hit sounds (two distinct tones that teach the counter triangle by ear).

### 17.2 Audio accessibility

- Separate volume sliders for music, effects, UI, and voice.
- Visual indicators for important sounds.
- Directional damage indicators.
- Optional subtitles for announcer messages.

### 17.3 Technical notes

- Browsers block audio until the first user input, so the audio system unlocks on the first key, click or tap.
- All sound effects ship as one compressed audio sprite. Music streams after gameplay starts and is not part of the initial download.
- Positional audio: stereo pan by screen position and volume by distance. Full 3D audio is unnecessary for a top-down camera.
- Mute game audio during ads and while the tab is hidden.
- Sources: CC0 or purchased sound packs at launch; a custom audio identity is a post-launch upgrade.

***

## 18. Technical Requirements

### 18.1 Recommended stack

v1.0 listed alternatives. A spec handed to AI coding agents must list decisions, so each layer below has one choice.

| Layer | Recommended technology |
|---|---|
| Game client | TypeScript + Three.js, built with Vite. Unity WebGL was rejected (build size and memory are too high for 4 GB Chromebooks and the 20 MB mobile budget). |
| 2D/2.5D alternative | None: the game is 3D. (Babylon.js is an acceptable alternative to Three.js; pick one and never switch.) |
| Shared simulation | Pure TypeScript package used by the server (authority) and the client (prediction) |
| Physics | Custom 2D collision on the ground plane: circles for players, static boxes and polygons for walls, swept tests for projectiles. No general 3D physics engine. |
| Game server | Node.js + TypeScript |
| Real-time networking | WebSocket (binary, delta-compressed state) |
| Multiplayer framework | Colyseus (rooms, matchmaking, state sync; replace only if profiling proves it is the bottleneck) |
| Database | PostgreSQL via Supabase |
| Authentication | CrazyGames account on CrazyGames (required for full launch); guest ID plus Supabase Auth on the own site |
| Hosting client | Uploaded build on CrazyGames; Vercel, Netlify or Cloudflare Pages for the own site |
| Hosting server | Containers on VPS in three regions (for example Hetzner, Vultr, DigitalOcean) or Fly.io |
| Shared room state | Redis, so several server processes can share matchmaking presence |
| Analytics | PostHog, Firebase Analytics, or custom telemetry (decision: PostHog, plus the CrazyGames dashboard) |
| Error monitoring | Sentry |
| Testing | Vitest (simulation), Playwright (smoke tests), headless bot clients (load tests) |

### 18.2 Architecture

Built around one shared simulation. The same code runs authoritative on the server and predictive on the client, and bots live inside the server simulation. There is no separate single-player codebase to throw away later.

```text
Monorepo (pnpm workspaces)
├── packages/shared     Types, constants, balance config, network protocol
├── packages/sim        Pure simulation: movement, collision, combat, morphing,
│                       Flux, objectives, arena events, bots.
│                       No DOM, no rendering, no network, no Math.random
│                       (seeded RNG only), fixed timestep.
├── apps/client         Input, prediction (runs sim for own player),
│                       interpolation, Three.js rendering, UI, audio,
│                       portal SDK, network client
├── apps/server         Colyseus rooms running the authoritative sim,
│                       matchmaking, validation, persistence calls
├── apps/backend        Accounts, progression, inventory, challenges,
│                       remote config (lives inside apps/server until
│                       load requires a split)
└── tools/loadtest      Headless bot clients for soak and load tests
```

### 18.3 Multiplayer architecture

Use an **authoritative server model**.

- The server owns player positions, health, damage, morph state, objectives, and match results.
- Clients send inputs, not final outcomes.
- The server validates movement speed, fire rate, energy spending, damage, and objective capture.
- Clients predict local movement for responsiveness.
- Server reconciliation corrects disagreement.

**Netcode details:**

- Simulation: fixed 30 Hz on the server. Snapshots to clients: 20 Hz, delta-compressed.
- Input packet each client tick: sequence number, move vector, aim angle, button bitmask. Nothing else.
- Own player: predicted with the shared sim; on mismatch, rewind to the server state and replay unacknowledged inputs. Errors under 0.5 m are smoothed over 100 ms; larger errors snap.
- Other players and projectiles: interpolated between snapshots with about a 100 ms buffer.
- Shooting: the client shows its own projectile instantly. The server spawns the real projectile advanced by the shooter's latency (capped at 100 ms), so firing feels responsive without full lag compensation. Only server-confirmed hits show damage numbers.
- Knockback and pulls on the local player are server-driven and blended in; keep forces modest so corrections stay small.
- Clock sync and round-trip time are measured every 2 s.
- Bandwidth target: 10 KB/s or less downstream per client in an 8-player room.

### 18.4 Matchmaking

A new game will not have 8 humans waiting per region, so the v1.0 rule "fall back to mixed regions after 30 seconds" would mean long waits and empty rooms. Rooms now never wait.

- **Instant join:** Play picks the region with the lowest measured ping (measured during loading), then joins the public room with a free seat and the most humans, or creates a new one. No queue screen.
- **Bot backfill:** rooms always hold 8 players. Bots fill empty seats; a joining human takes over a bot's seat (the bot leaves at its next death, or immediately in the first 30 s).
- **Persistent rooms:** after each match, a 15 s results screen, then the next match in the same room. Leavers are replaced by bots. Rooms with no humans close immediately.
- **Friends:** private rooms with a code and the CrazyGames invite link; "instant multiplayer" launches create a private room (Appendix B).

Initial matchmaking rules:

- Region preference. Launch regions: EU (Frankfurt), US East, Asia (Singapore). Add regions from telemetry.
- Casual skill-based matchmaking after enough players exist. Until then, bot difficulty adapts to the humans in the room (Appendix A).
- Party size matching.
- Ping-based server selection.
- No queue exists; if every region is above 180 ms, join the best one anyway.
- Ranked ladder only when a region sustains enough concurrent players (starting threshold to validate: about 300).

Required backend services:

- Accounts.
- Sessions and lobbies.
- Matchmaking.
- Progression persistence.
- Inventory.
- Leaderboards.
- Remote configuration.
- Telemetry.

### 18.5 Performance targets

| Metric | Target |
|---|---|
| Desktop frame rate | 60 FPS |
| Mobile frame rate | 30 FPS minimum on a mid-range Android phone from about 2021, 60 where possible |
| Chromebook | Smooth on a 4 GB RAM Chromebook (CrazyGames requirement); target under 500 MB tab memory |
| Initial load | Gameplay within 20 s worst case (portal requirement); target under 8 s on broadband |
| Initial download | 20 MB or less (needed for the CrazyGames mobile homepage); target 15 MB |
| Total build | 250 MB or less and 1,500 files or fewer |
| Matchmaking time | Under 3 seconds from Play to spawning (bot backfill) |
| Server tick rate | 30 Hz simulation, 20 Hz snapshots |
| Input latency | Under 100 ms on good connections |
| Concurrent players per room | 8 for launch |
| Reconnect window | 30 seconds (a bot holds the seat) |
| Server density | 20+ rooms per vCPU (target, verify with load tests) |
| Bandwidth | 10 KB/s or less downstream per client |

### 18.6 Security and anti-cheat

- Server-side validation for all damage and movement.
- Rate limiting for inputs and requests. (Inputs above 40 per second are dropped; repeated invalid inputs kick the client.)
- Encrypted authentication tokens.
- No critical game logic in client code.
- Detect impossible speed, teleportation, fire-rate abuse, and invalid energy spending.
- Report and replay tools for moderators. The server stores each match's inputs and random seed for 72 hours, so a reported match can be replayed exactly.
- Do not store payment data directly; use a payment provider.
- **Interest management:** each client receives only entities within its view plus a 10 m margin, never invisible enemies. Browser game code is readable by anyone, so anything sent to the client can be shown by a cheat.
- **Aim-assist abuse:** flag accounts whose mouse aim snaps to targets with lock-on-like precision.
- Never trust client timestamps; the server clock decides.

### 18.7 Hosting and cost model

- An 8-player room at 30 Hz is light. Plan for 20+ rooms per vCPU (to verify). 1,000 concurrent players is about 125 rooms, roughly 6 to 7 vCPUs plus headroom.
- Bots cost CPU too: a room with 1 human and 7 bots costs almost as much as a full human room. Close rooms with no humans immediately.
- Start with one 4 to 8 vCPU server per region and scale by adding processes behind Redis presence.
- Track server cost per 1,000 player-hours against ad revenue per 1,000 player-hours (from the portal dashboard). That ratio decides whether a region stays online.

### 18.8 Disconnects, AFK and background tabs

- Browsers throttle hidden tabs, and portal players tab out often. When the tab is hidden, the client tells the server, and a bot takes over the seat at once. When the player returns, control returns instantly. Score the bot earns does not count toward the player's XP.
- Disconnect: a bot holds the seat for 30 s; reconnecting restores the player. After 30 s the player is removed.
- AFK with the tab visible: no input for 30 s shows a warning; at 45 s a bot takes the seat.
- Leaving early forfeits that match's XP (later, a penalty in ranked).

### 18.9 Testing strategy

- Simulation unit tests: movement, collision, matchup modifiers, morph rules, Flux math, scoring, match end.
- Determinism check in CI: same seed plus same inputs must produce the same final state hash.
- Nightly soak: 100 headless bot rooms for 2 hours, with no crashes and flat memory.
- Network: every playtest also runs with simulated latency (100 and 200 ms) and 2% packet loss.
- Device lab: 4 GB Chromebook, mid-range Android phone, iPhone (Safari), low-end Windows laptop.
- Release smoke test (Playwright): load, Boot Camp, match start, match end.
- Bundle size check in CI fails the build if the initial download exceeds 15 MB.

***

## 19. Monetization

### 19.1 Model

Free-to-play with cosmetic-only purchases. Revenue at launch comes from portal ads between matches. Purchases arrive later (§19.5).

### 19.2 Monetization features

- Character skins.
- Vehicle shells.
- Morph effects.
- Weapon trails.
- Victory poses.
- Profile banners.
- Emotes.
- Arena music.
- Battle pass. (Only once retention supports it, §19.5)
- Cosmetic bundles.

### 19.3 Prohibited practices

- No paid weapons.
- No paid characters that are stronger than free characters.
- No paid health, damage, speed, or energy advantages.
- No paid random rewards of any kind (§13.4).
- No aggressive ads during matches.
- No paywalled ranked access.

### 19.4 Ads

Optional rewarded ads may offer:

- A cosmetic spin.
- A small coin reward.
- A temporary lobby cosmetic.

Ads must never interrupt active combat or provide gameplay advantages.

- On CrazyGames only ads served through the CrazyGames SDK are allowed.
- Midgame (interstitial) ads only on the results screen between matches, never in the first match of a session and never in Boot Camp. Frequency is capped by the portal and by remote config.
- Rewarded ads are always opt-in: double Coins after a match, or one extra cosmetic spin per day.

### 19.5 Phased monetization plan

| Phase | What earns money | Notes |
|---|---|---|
| CrazyGames Basic Launch | Nothing | Monetization is disabled in Basic Launch. The goal is retention data. |
| CrazyGames Full Launch | SDK ads (results-screen midgame ads, rewarded ads) | Main revenue for v1 |
| Cosmetic purchases | Gems for cosmetics | On CrazyGames, purchases go through the CrazyGames Xsolla account and are invite-only. On the own site, use a merchant-of-record payment provider that handles global tax and payouts. |
| Battle pass | Seasonal pass | Only if D7 retention holds at 8% or more with steady daily players |

***

## 20. Live Operations

### 20.1 Season structure

Each season lasts 10-12 weeks (a three-person team cannot ship a character, map, weapon and cosmetics every 6 weeks while also maintaining servers) and includes:

- One new character.
- One new map or major variant every other season.
- One new weapon or mutation.
- New cosmetics.
- Seasonal challenges.
- Ranked reset. (Once ranked exists)
- Limited-time mode.

### 20.2 Events

- Double XP weekends.
- Character spotlight events.
- Community challenge events.
- Holiday-themed arenas.
- Limited-time mutations such as "Infinite Energy" or "Beast Only."

### 20.3 Retention systems

- Daily login rewards.
- Daily challenges.
- Weekly challenges.
- Character mastery.
- Ranked seasons. (Post-launch)
- Friends and parties. (Private rooms and portal invites at launch)
- Post-match rewards.
- Comeback rewards for returning players.

Every live-ops change ships through remote config where possible, so balance and event changes do not need a new client build or a new portal review.

***
## 21. Development Roadmap

### 21.0 Why the plan changed

- v1.0 fit the whole game into 14 weeks. At about 90 team hours per week, the full v1.0 scope is estimated at 6 to 9 months. This plan ships a smaller, complete game in about 13 weeks, then grows it with player data.
- Multiplayer starts in week 1, not week 5.
- Every milestone ends with a gate. Failing a gate means fix or cut before adding content.
- Tasks are an ordered queue, one card per task on the project board. Whoever is free takes the top unblocked card. Cards are tagged by track (Sim, Client, Server, Content, Platform) so parallel work is visible without assigning people.
- Estimates assume AI coding agents for implementation and bought or commissioned art. Re-plan after the M1 gate with real velocity.

The v1.0 phases (Concept validation, Single-player prototype, Local multiplayer prototype, Online multiplayer prototype, Vertical slice, Soft launch) are replaced by M0 to M4 below. v1.0's "Local multiplayer prototype" was single-player with bots, and it came before networking, which is the ordering this plan removes.

### 21.1 M0: Foundations (week 1)

- Monorepo, CI, lint, test runner, balance config file.
- Sim skeleton: fixed timestep, seeded RNG, entities, 2D collision.
- Colyseus room running the sim; two clients sending inputs and receiving snapshots.
- Three.js greybox renderer with the camera rules of §14.6.
- Dev server deployed in one region.
- Paper prototype of the counter triangle and Flux with 5 to 8 people (index cards and timers are enough).
- Name shortlist for the §1.1 check.

**Gate:** two browsers on different networks move smoothly in the same room with 150 ms of simulated latency.

### 21.2 M1: Core loop online (weeks 2 to 4)

- Sim: Runner movement and Dash, Pulse Pistol, damage, death, respawn, spawn protection.
- Sim: Beast and Turret forms, morph rules, Flux, matchup modifiers, Turret rules.
- Server: Frenzy match flow (timer, KOs, results, intermission, persistent room).
- Server: bots v1 (wander, target, shoot, simple counter-form morphs) and bot backfill.
- Client: prediction, reconciliation, interpolation; placeholder visuals per form; basic HUD (health, Flux, form, timer, kill feed).
- Client: mouse and keyboard, and keyboard-only without lock-on.
- Content: greybox Neon Junction with shards.

**Fun Gate 1:** three internal sessions with 4 to 8 humans plus bots. Average of 4 or more morphs per player per match; each form deals between 20% and 45% of total damage; testers can explain which form beats which without being told.

### 21.3 M2: Depth and access (weeks 5 to 7)

- Crates and the four launch crate weapons; one form ability per form.
- Volt, Bramble and Nova: signature abilities, Ultimates, Overdrive meter.
- Bots v2: counter-form choice, crates, retreating, difficulty tiers, adaptive difficulty.
- Keyboard-only soft lock-on; touch controls; input auto-detect and glyphs.
- Boot Camp, contextual counter hints, death recap.
- Bounty system; three arena events (Crate Storm, Reactor Surge, Route Closure).
- Guest identity, XP, Coins, persistence.

**Gate:** external playtest with 20+ players on mixed devices. Boot Camp completion 80% or more; keyboard-only hit rate within 10% of mouse; 60% or more play a second match.

### 21.4 M3: Production quality (weeks 8 to 10)

- Art: three commissioned riders with nine shells, environment kit, VFX (morph burst, hits, KOs), UI kit.
- Audio: SFX sprite, one menu track, one match track.
- Performance pass to the budgets in §16.6 and §18.5 on the device lab.
- CrazyGames SDK: loading and gameplay events, accounts, usernames, room status, invite link, instant multiplayer (Appendix B).
- Three regions, ping-based matchmaking, private rooms, reconnect, AFK and background-tab handover.
- Settings: remapping, aim assist, colorblind options, motion reduction, volume.
- Telemetry (Appendix D), Sentry, nightly bot soak test.

**Gate:** budgets enforced in CI; a 2-hour soak of 100 bot rooms with no crash and flat memory; a clean run in the CrazyGames QA tool.

### 21.5 M4: Launch (weeks 11 to 13)

- CrazyGames submission. Multiplayer games must meet the full integration requirements even in Basic Launch, so the SDK work in M3 is not optional.
- Cosmetics v1, earned only (three skins per character, trails); daily challenges.
- Load test to twice the expected peak; incident runbook.
- Balance pass from playtest telemetry; bug fixing.

**Gate:** crash-free sessions 99% or more; median time from click to gameplay under 10 s.

### 21.6 After launch

- **v1.1 (about weeks 14 to 19):** Reactor War with team bots, Overdrive Clash prototype (gate §8.6), Mira and Rook, controller support, CrazyGames Full Launch ads.
- **v1.2 and later:** King of the Morph, a second map, ranked (population permitting), shop and purchases (if invited by the portal), battle pass (if retention supports it), Last Engine (16-player rooms).

***

## 22. Legacy AI Development Instructions

When this design enters a repository, translate the relevant rules into a concise root `AGENTS.md`. Keep `AGENTS.md` as the canonical Codex guide and use `CLAUDE.md` only as a compatibility pointer if another tool needs that filename. Repository task and prototype documents should replace this broad long-term section.

When implementing this game, the coding agent should follow these instructions exactly.

### 22.1 Build order

Network-first: the server runs every match from step 3.
1. Monorepo, CI, linting, test runner, `packages/shared/balance.ts`.
2. `packages/sim`: fixed-timestep loop, seeded RNG, entity model, 2D collision, unit tests.
3. Server: Colyseus room running the sim at 30 Hz; clients send inputs; server sends snapshots.
4. Client: Three.js renders snapshots with placeholder shapes; camera rules (§14.6).
5. Prediction, reconciliation and interpolation, tested at 150 ms simulated latency.
6. Runner movement, Pulse Pistol, damage, death, respawn, spawn protection.
7. Beast and Turret forms, morph rules, Flux, matchup modifiers.
8. Bots v1 filling empty seats; Frenzy timer, scoring and results.
9. Shards, crates and the four crate weapons; form abilities.
10. Volt, Bramble, Nova and their Ultimates; Overdrive meter.
11. HUD, Boot Camp, keyboard-only lock-on, touch controls.
12. Guest accounts, XP, Coins, persistence.
13. Arena events, private rooms, invite links, CrazyGames SDK.
14. Art, VFX and audio pass; performance pass.
15. Telemetry, Sentry, load tests, launch.
16. v1.1: Reactor War, team bots, Overdrive Clash prototype, Mira, Rook, controller.

### 22.2 Mandatory implementation rules

- Use placeholder art first; do not block development on final assets.
- Keep game constants in a central configuration file. (`packages/shared/balance.ts`, Appendix E. No gameplay numbers anywhere else.)
- Separate game logic from rendering.
- Make all gameplay values tunable: health, speed, damage, cooldowns, energy costs, respawn time, crate spawn time.
- Use an authoritative server for multiplayer.
- Validate every gameplay action on the server.
- Ensure keyboard-only players can access every feature.
- Make all UI navigable with keyboard.
- Use responsive layout for desktop and mobile.
- Write modular code: input, combat, morphing, objectives, networking, UI, and audio should be separate systems.
- Add automated smoke tests for core systems: movement, morphing, damage, respawn, scoring, and match completion.
- `packages/sim` never imports from client or server code and never uses the DOM, `Date.now()` or `Math.random()`.
- Bots produce the same input packets as players and never change game state directly.
- Clients send inputs only: never positions, damage or results.
- New features ship behind a remote-config flag.
- Work only on the current milestone. If the spec has a gap, do not invent a rule: write the question in `OPEN_QUESTIONS.md`, report the blocker, and do not expand into another task unless the user's request covers queue progression.
- Every completed change on `main` passes unit tests, the determinism check and the bundle size check.

### 22.3 Definition of first playable version

The first playable version already runs through the authoritative server.

The first playable version is complete when:

- A player opens the game in a browser and joins a room on the server, with bots filling the other seats.
- A player can move with WASD.
- A player can aim and shoot.
- A player can morph between Runner, Beast, and Turret. (With Flux costs, cooldown and health-percentage carry-over.)
- Energy shards spawn and can be collected.
- Weapon crates spawn and provide temporary weapons.
- Seven bots move, attack, die, and respawn.
- A 3-minute match ends with a winner.
- The player earns XP after the match.
- The game runs in a browser without installation.

### 22.4 Definition of multiplayer alpha

The multiplayer alpha is complete when:

- Eight players can join one match.
- The server controls health, damage, score, and match state.
- Players can see each other move smoothly.
- Players can eliminate each other.
- Players can collect energy and open crates.
- Morphing works consistently across clients.
- Disconnected players are removed or allowed to reconnect.
- The match ends and rewards are saved.
- Play feels responsive at 150 ms simulated latency.
- Bots hand their seats to joining players, and a bot covers a player whose tab is hidden.

### 22.5 Key questions the team must answer through prototypes

Each question now has a measurable pass condition.

| # | Question | Pass condition |
|---|---|---|
| 1 | Does morphing feel useful during combat? | 4 or more morphs per player per match on average |
| 2 | Do all three forms have a reason to exist? | Each form deals 20% to 45% of total damage |
| 3 | Is keyboard-only aiming fair against mouse aiming? | Hit rate within 10%; win rate within 5 points in mixed rooms |
| 4 | Do objectives create strategic decisions beyond chasing kills? | (Reactor War) 3 or more zone flips per match; most Core deliveries come from teams holding 2 or more zones |
| 5 | Does the Living Arena encourage movement and planning? | No map area holds more than 25% of player time; players move within 15 s of an event warning |
| 6 | Is Overdrive Clash exciting or disruptive? | The gate in §8.6 |
| 7 | Are matches readable during chaos? | 80% or more of surveyed players can say what killed them |
| 8 | Does the game create a desire to immediately play another match? | 60% or more of sessions include 2 or more matches |

***

## 23. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Morphing feels unnecessary | Core concept fails | Give each form unique weapons, movement, and objectives plus the counter triangle, cheap morphs and counter hints; Fun Gate 1 tests this before any art spending |
| Keyboard-only aiming feels unfair | Players leave | Use soft lock-on, adjustable aim assist, and extensive testing against the 10% hit-rate rule |
| Too much randomness | Wins feel lucky | Visible crate spawns, fixed timers, and counterplay |
| Multiplayer netcode is unstable | Poor player experience | Build authoritative server early and test with artificial latency (from week 1, shared simulation) |
| Game becomes too complex | New players quit | Start with 3 forms, 3 form weapons plus 4 crate weapons, 1 map, and 1 main mode plus Boot Camp |
| Mobile controls feel bad | Loses large audience | Build dual joysticks, auto-fire option, and real-device testing |
| Pay-to-win perception | Community distrust | Cosmetic-only monetization and earnable gameplay content |
| Arena changes feel unfair | Frustration | Telegraph every major map event |
| Players camp instead of fighting | Boring matches | Deployed Turrets always on enemy minimaps, Heat, 0.5x Turret capture, Runner counters Turret |
| Empty lobbies at launch | Players leave before a match starts | Bot backfill, persistent rooms, one launch mode, three regions |
| Server cost exceeds ad revenue | Losing money per player | Cost per 1,000 player-hours tracked against revenue; close empty rooms; add regions only when justified |
| Art cost and schedule | Launch slips or looks inconsistent | Shell swap morphs, asset packs, three launch characters, style lock before M3 |
| Portal rejection | No distribution | Size and performance budgets in CI; CrazyGames QA tool from M3; full SDK integration before first submission |
| Safari and iOS quirks | Broken on iPhones | Chrome and Edge first (portal requirement); iPhone in the device lab; CrazyGames disables games in Safari that do not work well there |
| Scope creep | Never launches | Milestone gates; agents log gaps in OPEN_QUESTIONS.md instead of inventing features |
| Name or IP conflict | Forced rename after launch | Name check in §1.1 before the art pass |
| Young players' safety and privacy | Portal removal, legal exposure | No free chat, platform usernames, data minimization (Appendix C) |
| Cheating from readable client code | Unfair matches | Server authority, interest management, input replays |

***

## 24. Success Metrics

Targets are hypotheses. Replace them with CrazyGames genre benchmarks once Basic Launch data exists.

### Player experience metrics

- Average session length: 15-25 minutes.
- Matches per session: 3-5.
- D1 retention target: 30%+.
- D7 retention target: 10%+.
- Average match completion rate: 85%+.
- Percentage of players who use at least two forms per match: 70%+.
- Boot Camp completion: 80%+.
- Median time from click to gameplay: under 10 s.

### Gameplay health metrics

- Each form deals 20% to 45% of total damage, and each form holds 15% to 50% of total time alive. (Players switch forms, so "form win rate" cannot be measured.)
- No character above 1.5x its fair share of picks for long periods (with 3 characters: above 50%). A 25% cap is impossible with a 3-character roster.
- Average time to first elimination: under 30 seconds.
- Average objectives completed per match: 3+. (Reactor War)
- Player-reported confusion about morphing: under 10%.
- Average morphs per player per match: 4 to 8.
- Bot share of match seats, per region and hour (decides regions and the ranked rollout).
- Crash-free sessions: 99%+. Share of sessions with round-trip time above 150 ms.

### Business metrics

- Cosmetic conversion rate.
- Battle pass completion rate.
- Returning-player rate.
- Average revenue per paying user.
- Ad engagement without gameplay disruption.
- Server cost per 1,000 player-hours vs ad revenue per 1,000 player-hours.

***

## 25. Final Design Statement

**Shiftborn Arena** is not simply "cars with guns." It is a character-driven transformation battler where players constantly choose between speed, power, and control.

The game succeeds if a player can lose a gunfight but still win the match through smarter zone control, better energy management, stronger positioning, and smarter morph timing.

The central design rule is:

> **Kills create opportunities; objectives, energy, positioning, information, and transformation decide who wins.**

And one production rule sits beside it: **a match is never more than 10 seconds away.** Every feature that adds waiting, menus or empty rooms works against the game.

***

## Appendix A: Bot AI

- **Where bots run:** inside the server simulation. Each bot produces the same input packet a player sends, so bots obey every rule and validation.
- **Brain:** utility AI evaluated 5 times per second. Each candidate goal gets a score; the highest wins: collect Flux, grab a crate, fight a target, retreat (health under 30% and losing), capture or defend a zone (Reactor War), morph.
- **Morph logic:** enemy Beast within 12 m and room to shoot → Turret; enemy Turret ahead → Runner and flank; enemy Runner within 6 m → Beast. Only if Flux is 35 or more and the morph cooldown is ready.
- **Navigation:** a navigation mesh baked per map state (one per arena-event variant), plus local avoidance.
- **Difficulty tiers:**

| Tier | Reaction time | Aim error | Picks the right counter form |
|---|---|---|---|
| Easy | 450 ms | ±12° | 40% |
| Normal | 300 ms | ±7° | 70% |
| Hard | 180 ms | ±3° | 90% |

- **Adaptive difficulty:** a room's bots track the median skill of its human players. A player's first three matches use mostly Easy bots.
- **Comeback help:** bots slightly prefer targeting the leading human (§7.8).
- **Names and honesty:** bots use generated names and show a small bot icon on the post-match scoreboard.
- **Seat handover:** when a human joins, the lowest-scoring bot leaves at its next death (immediately in the first 30 s of a match).
- **Team bots (v1.1):** add role assignment (capturer, defender, escort) and Core-carrier escort behavior for Reactor War.

## Appendix B: CrazyGames integration checklist

Summary of the portal's published requirements as of October 2026. Re-check the official docs before each submission; they change.

- **Launch path:** Basic Launch first (limited real traffic, monetization disabled), then Full Launch with the SDK. Multiplayer games must meet the full integration requirements even in Basic Launch.
- **Size:** initial download 50 MB or less, 20 MB or less to qualify for the mobile homepage; total build 250 MB or less and 1,500 files or fewer.
- **Performance:** must work in Chrome and Edge; must run smoothly on a 4 GB RAM Chromebook; gameplay within 20 s when files load from external hosting. Games that do not work well in Safari are disabled there.
- **Readability:** text legible at common iframe sizes such as 821 x 462 and 907 x 510 px at devicePixelRatio 1.
- **SDK events:** loading start and stop; gameplay start and stop on every break (menus, results screens); "happy time" on big moments such as winning a match.
- **Ads:** only through the SDK, following the portal's ad rules.
- **Accounts:** progress linked to the CrazyGames account; use the CrazyGames username and avatar; automatic login for CrazyGames users.
- **Multiplayer:** pass the player's room information through the SDK so the portal's join and invite features work; support invite links; in instant multiplayer mode, put the first player of a party directly into a new private room; display CrazyGames usernames in game. If chat is ever added, respect the SDK's chat-disable preference.
- **Purchases:** through the CrazyGames Xsolla account and user ID; invite-only.
- **Privacy:** if the game collects personal data beyond the SDK's events, show Terms and a Privacy Policy notice to new players.
- **Content:** audience 13+, PEGI 12 compatible.
- **Before every submission:** run the build in the CrazyGames QA and Preview tools.

Sources: [CrazyGames requirements overview](https://docs.crazygames.com/requirements/intro/), [Technical requirements](https://docs.crazygames.com/requirements/technical), [Multiplayer requirements](https://docs.crazygames.com/requirements/multiplayer/), [Gameplay requirements](https://docs.crazygames.com/requirements/gameplay/).

## Appendix C: Player safety and compliance

Not legal advice. Get a legal review before launching accounts, purchases or chat on the own website.

- **Audience:** 13+ on CrazyGames. If the own site may attract under-13 players, follow children's privacy rules such as COPPA (US) and the UK and EU children's codes: a neutral age question, no personal data from under-13 players without parental consent, no behavioral ads for them.
- **Communication:** no free text chat at launch. Pings, about 12 preset quick-chat phrases, and emotes post-launch.
- **Names:** CrazyGames usernames on CrazyGames. On the own site, a generated name (adjective plus noun) or a filtered custom name, with reporting.
- **Reporting:** a report button on the scoreboard (cheating, offensive name); input replays kept 72 hours (§18.6).
- **Data minimization:** store the platform user ID, progression, cosmetics and pseudonymous telemetry. No email unless the player creates an own-site account.
- **Content:** cartoon violence only, no blood; eliminations burst into shards.
- **Purchases:** no paid random rewards; clear prices; every item shown before buying.

## Appendix D: Telemetry events

| Event | Key properties | Answers |
|---|---|---|
| session_start | platform, device class, input scheme, region, load time | Load speed, device mix |
| ftue_step | step id, time spent, skipped | Where new players quit |
| match_start | mode, map, humans, bots, region | Bot share, population |
| morph | from, to, Flux before, health %, match time | Is morphing used and when |
| death | killer type (human, bot, hazard), killer form, victim form, weapon, matchup modifier, distance | Triangle balance, readability |
| life_summary | damage dealt and taken per form, time per form | Form share metrics |
| crate_open | weapon, crate point | Crate balance, map flow |
| arena_event | event, time, player positions before and after | Does the arena move players |
| match_end | result, KOs, deaths, morphs, time per form, performance score, left early | Completion, engagement |
| net_sample (every 30 s) | round-trip time, jitter, corrections | Netcode quality per region |
| perf_sample (every 30 s) | median and 5th-percentile FPS, memory where available | Device performance |
| ad_shown, ad_reward | type, placement | Revenue vs disruption |

## Appendix E: Starter balance config

Starting values that match this document. Every system reads from this file; tune with telemetry.

```ts
// packages/shared/balance.ts
export const BALANCE = {
  match:  { frenzyDurationS: 180, respawnS: 3, teamRespawnS: 5,
            spawnProtectionS: 2, intermissionS: 15, lateJoinCutoffS: 60 },
  flux:   { max: 100, start: 60, regenPerS: 1, smallShard: 5, largeShard: 15,
            ko: 20, assist: 10, crateOpen: 10, coreDelivery: 50,
            deathDropPct: 0.4, respawnFloor: 40 },
  overdrive: { max: 100, perDamage: 0.2, ko: 10, assist: 5, zoneCapture: 10,
               coreDelivery: 20, passivePerS: 0.25, deathLossPct: 0.25 },
  morph:  { costBeast: 35, costTurret: 35, costRunner: 0,
            durationS: 0.5, cooldownS: 3, moveMultDuringMorph: 0.5 },
  forms: {
    runner: { hp: 80,  speed: 8.5, radius: 0.6, captureMult: 1.5, knockbackMult: 1.0, zoom: 1.0 },
    beast:  { hp: 140, speed: 6.0, radius: 1.0, captureMult: 1.0, knockbackMult: 0.5, zoom: 0.9 },
    turret: { hp: 110, speed: 0,   radius: 0.9, captureMult: 0.5, knockbackMult: 0.0, zoom: 1.3,
              turnRateDegPerS: 120, frontArcDeg: 120, frontArcDamageMult: 0.75 },
  },
  matchup: { // attacker form -> defender form
    runner: { runner: 1.0,  beast: 0.75, turret: 1.25 },
    beast:  { runner: 1.25, beast: 1.0,  turret: 1.0 },
    turret: { runner: 1.0,  beast: 1.25, turret: 1.0 },
  },
  weapons: {
    pulsePistol:   { damage: 9, ratePerS: 6, rangeM: 14, projSpeed: 45 },
    scatterCannon: { pellets: 7, damagePerPellet: 5, ratePerS: 1.25,
                     fullDamageRangeM: 4, rangeM: 9, minFalloff: 0.5, projSpeed: 35 },
    railRepeater:  { damage: 16, ratePerS: 3.5, rangeM: 18, projSpeed: 70,
                     armDistanceM: 4, closeDamageMult: 0.5, heatMaxS: 7, overheatS: 2 },
  },
  crates:  { respawnS: 20, maxHoldS: 30 },
  bounty:  { streak: 3, bonusKo: 1 },
  ccImmunityS: 2,
  softLock: { correctionDeg: 6, railCorrectionDeg: 3, breakAfterLosS: 0.5 },
} as const;
```

## Appendix F: Open questions for the team

1. Final name (after the §1.1 check)?
2. Budget and source for the three commissioned characters (rider plus three shells each)?
3. Launch only on CrazyGames, or on the own website at the same time?
4. Monthly server budget ceiling before ad revenue arrives?
5. Which three regions first, based on where the team expects players (default: EU, US East, Singapore)?
