# CONTROLS_UI.md

> **LLM FILE CONTRACT:** Client interaction source of truth for bindings, aiming, lock-on, HUD, screens, camera, greybox visuals, sound and accessibility. It does not define simulation outcomes.

Controls (mouse and keyboard, keyboard only), aiming behavior including soft lock-on, the HUD, menus and screens, the camera, the greybox visual language, sounds, and input accessibility for the Shiftborn Arena prototype.

Related: `DECISIONS.md` (D-024, D-037, D-040, D-044, D-045), `docs/GAME_RULES.md`, `docs/NETWORK_PROTOCOL.md` §5.2.

Design rule from the GDD (Pillar 7): every threat, form and objective must be identifiable within one second. No information is carried by color alone; every color cue has a matching shape, icon, label or outline.

---

## 1. Scope for the prototype

| In the prototype | Production only |
|---|---|
| Mouse and keyboard; keyboard only with soft lock-on | Touch controls (M2), controller (v1.1) |
| Fixed default bindings | Full key remapping, one-hand preset |
| Settings in section 6.4 | Colorblind palettes, enemy highlight color picker, subtitles, visual sound indicators |
| Controls card | Boot Camp tutorial and contextual hints (D-024) |

---

## 2. Input schemes and bindings

### 2.1 Mouse and keyboard

| Action | Binding |
|---|---|
| Move | W A S D |
| Aim | Mouse cursor in TPP; disabled in FPP until OQ-018 |
| Fire | Left mouse button (hold); Space also fires |
| Morph to Runner / Beast / Turret | 1 / 2 / 3 |
| Ability (Dash, Ram Charge, Rail Shot) | E |
| Scoreboard | Tab (hold) |
| Menu (the match keeps running) | Esc or P |
| Switch camera view | V (TPP/FPP) |
| Debug overlay / hitbox view (dev builds) | F3 / F4 |
| Dev console (only if the server allows cheats) | Backtick |
| Reserved, do nothing yet | Right mouse (crate weapon), R (crate weapon), X (Ultimate), F (interact), Z (ping), B (emote) |

### 2.2 Keyboard only

| Action | Binding |
|---|---|
| Move | W A S D |
| Aim | Arrow keys (section 3.2) |
| Fire | Space (hold, or toggle in settings) |
| Morph to Runner / Beast / Turret | 1 / 2 / 3 |
| Ability | E |
| Lock target | Q (tap to lock or cycle; hold 0.5 s to release) |
| Scoreboard | Tab (hold) |
| Menu | Esc or P |
| Switch camera view | V (TPP/FPP) |
| Menus | Arrow keys or W A S D to move focus, Enter or Space to confirm, Esc to go back |

Both schemes work at the same time; nothing needs to be switched in settings.

### 2.3 Future schemes (reference only, not built)

- **Touch (production M2):** floating left joystick to move; right joystick to aim with auto-fire while dragged; quick tap on the right stick fires at the target picked by the lock acquire rule; three small form buttons above the right stick; ability button; landscape only.
- **Controller (v1.1):** left stick move, right stick aim, right trigger fire, left trigger crate weapon only, LB opens the morph wheel, D-pad left / up / right morphs to Runner / Beast / Turret, B ability, Y Ultimate, View scoreboard (D-044).

### 2.4 Scheme detection and glyphs

- The **aim scheme** is whatever produced the most recent aim input: mouse movement over 3 px → `mouse`; an arrow key press → `keys`; an active lock → `lock`. This value is sent as `aimSource` in every input frame.
- On-screen key glyphs (controls card, HUD hints, ability button label) follow the current scheme: "LMB" or "Space" for fire, for example. Switch instantly.
- Moving the mouse releases any keyboard lock (section 3.3).

### 2.5 Browser input rules

- Call `preventDefault` on Space, arrow keys, Tab and Backtick during gameplay so the page does not scroll or move focus.
- Disable the right-click context menu on the game canvas.
- Esc may only exit fullscreen in some browsers, so P is a second menu key.
- Never use Ctrl or Cmd shortcuts.
- On window blur or `visibilitychange`, release every held key and mouse button, so a player does not keep moving or firing.
- In TPP, hide the system cursor over the canvas and draw the game reticle instead. In FPP, mouse aim is disabled pending the detailed control rule in OQ-018 (D-065), so show the system cursor and hide the aiming reticle. Do not use pointer lock.

### 2.6 Input mapper

- All input goes through `InputManager` and a bindings table (`apps/client/src/input/bindings.ts`). Game code reads **actions** (`fire`, `ability`, `morphBeast`, `lockToggle`), never raw key codes. This is what makes remapping, touch and controller possible later.
- **Latching:** an action pressed and released between two 30 Hz ticks is reported as held for one frame (`docs/NETWORK_PROTOCOL.md` §5.2).
- **Fire mode Toggle:** Space or left mouse toggles the fire state on and off; the frame sends fire held while toggled on.

---

## 3. Aiming

### 3.1 Mouse aim

- Cast a ray from the camera through the cursor onto the ground plane. Aim angle = direction from the local player's displayed position to that point.
- If the point is within 0.75 m of the player, keep the previous aim (avoids spinning).
- The reticle is drawn at the cursor. Its color shows weapon state: normal, cooling down, overheated (Turret), or out of range (dimmed when the cursor is beyond the current weapon's range).
- The ground-ray cursor rule describes TPP. FPP looks along the player's last aim from eye height. Mouse movement does not change aim in FPP until a detailed rule is approved (D-065, OQ-018); V switches back to TPP for mouse aiming. This interim view is not complete FPP playability.

### 3.2 Keyboard aim (arrow keys)

- Arrow keys pick one of 8 directions (single arrows: N, E, S, W; two arrows: diagonals).
- The aim rotates toward that direction at 720° per second (`keyboardAim.turnDegPerS`) along the shorter way; a Turret is still limited to 120° per second by the sim.
- Releasing all arrows keeps the current aim.
- Pressing an arrow while locked releases the lock (section 3.3).

### 3.3 Soft lock-on (keyboard only)

Arrow keys aim in 8 directions, 45° apart, which is too coarse to hit anything in between. Lock-on therefore controls where the player faces, not just a small correction on each shot. It runs on the client and produces normal aim angles (D-037).

- **Who gets it:** keyboard-only aiming. Lock-on is off while the last aim input was the mouse, and moving the mouse releases any lock. It can be turned off in settings.
- **Acquire:** Q locks the enemy with the smallest angle from the current aim direction inside a 60° cone (`softLock.acquireConeDeg`, so ±30°), within the current form weapon's range and in line of sight. If none is in the cone, it locks the nearest valid enemy. If there is no valid enemy, nothing happens and the reticle flashes. Spawn-protected enemies can be locked.
- **Facing:** while locked, the aim turns toward the aim point at up to 720° per second (`softLock.trackTurnDegPerS`); a Turret keeps its 120° per second cap. W A S D keeps full control of movement, so players can strafe while tracking.
- **Aim point:** the target's predicted position with lead: `aimPoint = targetPos + targetVel × travelTime × leadFactor`, where `travelTime = distance / projectileSpeed` of the current weapon and `leadFactor = softLock.leadFactor × aimAssistStrength` (0.5 at default strength). Use the target's interpolated position and velocity. Moving targets can still dodge; there is no homing once a shot leaves.
- **Firing:** Space fires along the current aim direction, locked or not.
- **Manual override:** pressing any arrow key releases the lock and aims in that direction.
- **Cycling:** tapping Q while locked moves to the next valid target clockwise (by angle around the player) from the current one.
- **Release:** holding Q for 0.5 s (`softLock.releaseHoldS`) releases the lock.
- **Breaking:** the lock breaks when the target dies or leaves the match, or stays out of line of sight or out of weapon range for 0.5 s (`softLock.breakAfterS`), and when the player dies. Morphing keeps the lock if the target is within the new form's weapon range. After a break, aim stays where it was; there is no automatic re-lock.
- **Abilities with lock:** Ram Charge uses the aim at the moment E is pressed, which points at the locked target. Rail Shot keeps tracking during its charge (with the Turret cap). Dash uses movement direction as normal.
- **Feedback:** the locked target gets a ring and corner brackets that only the locking player sees. A small "LOCK" label sits under the reticle.

### 3.4 Aim assist and fairness

- Aim assist strength (settings, 0 to 100%, default 100%) scales the lead factor from 0 to 0.5. At 0% the lock still tracks the target's current position, without lead.
- Aim assist never affects mouse aiming.
- The fairness test (H9, `docs/PLAYTEST_PLAN.md` §4.4) tunes `softLock.leadFactor` until keyboard-only hit rate is within 10% of mouse hit rate.

---

## 4. Action feedback rules

| Action | Immediate feedback (predicted) | Server confirmation |
|---|---|---|
| Morph pressed and allowed locally | Morph burst starts, form button shows progress | `morphEnd` or a rejection that reverts it |
| Morph denied | Form button shakes and flashes red; toast "Need 35 Flux" or "Morph ready in 1.2 s" or "Can't morph now" | `morphDenied` reason (the toast uses it if the local check missed) |
| Fire | Muzzle flash and local shot | Hit marker and damage number on `projectileHit` |
| Ability | Dash trail, Ram crouch, Rail Shot line | `abilityEnd`, `abilityHit` |
| Ability on cooldown | Ability icon shakes, shows seconds left | |
| Fire while overheated | Reticle shows overheated, dry-click sound | |

---

## 5. HUD

Layout at 1280 x 720 (scale with the window; minimum text 14 px at 1280 x 720 and 12 px at 821 x 462).

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Kill feed (top-left)        Timer · Mode · Rank and score     Minimap │
│                                   (top-center)               (top-right)
│                                                                      │
│             off-screen arrows at the screen edges                    │
│                                                                      │
│                        world, reticle, damage numbers                │
│                                                                      │
│ Health bar                [1 Runner][2 Beast 35][3 Turret 35]   Heat  │
│ Flux bar (35, 70 notches)        form buttons (bottom-center)  [E] ability
└──────────────────────────────────────────────────────────────────────┘
```

| Element | Position | Content and behavior |
|---|---|---|
| Health bar | Bottom-left | `hp / max` as numbers (rounded up, GR-6.8) and a bar. Turns red under 25% with a slow pulse. Max changes with form. |
| Flux bar | Bottom-left, under health | Green bar 0 to 100 with notches at 35 and 70 and the number. Briefly glows on gain; shows a red ghost segment on spend. |
| Form buttons | Bottom-center | Three buttons with key glyph, form icon (Runner arrow, Beast horns, Turret crosshair) and cost (Runner "free"). Current form highlighted. Greyed when Flux is below cost or the morph cooldown is running, with a cooldown ring. Progress fill during a morph. |
| Ability button | Bottom-right | Key glyph (E), current form's ability icon and name, cooldown sweep with seconds. Each form's cooldown is tracked separately (D-014); the button shows the current form's. |
| Rail heat | Above the ability button, Turret only | Bar 0 to 7 s; "OVERHEATED" label and countdown while overheated. |
| Timer | Top-center | `m:ss` remaining; red in the last 10 s; "3, 2, 1, GO" during COUNTDOWN. |
| Mode and score | Top-center, under the timer | "Frenzy" or "Zone Frenzy"; your rank and score ("2nd · 5 KOs" or "2nd · 31 pts"). |
| Kill feed | Top-left | Last 5 entries, 5 s each: killer name, cause icon, victim name; your name highlighted; EFFECTIVE icon if the killing hit was effective. |
| Minimap | Top-right | Section 5.1. |
| Reticle | At the cursor (mouse) or in front of the player (keyboard) | State colors (section 3.1); "LOCK" label when locked. |
| Hit marker | On the reticle | Short X on each confirmed hit; bigger on a KO. |
| Damage numbers | World space above the target | `round(damage)`. EFFECTIVE: yellow-green with the word EFFECTIVE. RESISTED: grey with the word RESISTED. ARMOR: a small shield icon. Can be turned off. |
| Damage taken | Screen edge | Red wedge pointing toward the attacker for 1 s. |
| Off-screen threat arrows | Screen edges | Red arrow toward any off-screen enemy that damaged you in the last 2 s. Pulsing red arrow labeled "RAIL" when an enemy Rail Shot line currently passes through you (computed from the latest state, not the delayed render). |
| Zone indicator (Zone Frenzy) | Screen edge when off-screen | Purple arrow with the zone state (empty, held by you, held by other, contested) and the distance. Toast "Zone moves in 10 s". |
| Cluster announce | World and minimap | Green dashed circle with a 3 s countdown where shards will appear. |
| Toasts | Center, above the form buttons | Morph denial reasons, notices, AFK warning ("Move or you will be replaced by a bot in 15 s"). |
| Scoreboard | Center while Tab is held | All 8 players ranked: name, bot icon, KOs, deaths, assists, points (Zone Frenzy), damage, ping for humans. |
| Network indicator | Top-right, under the minimap | RTT in ms; a warning icon above 150 ms. |
| Respawn and death recap | Center while dead | Section 5.2. |
| Spawn protection | World | A white bubble around the player; no HUD label. |

### 5.1 Minimap

- Square, top-right, 180 px at 1280 x 720, north up, whole map visible.
- Shows: walls, intact cover, the local player (white arrow), enemies currently on screen (red dots), **every deployed Turret** (red Turret icon, always, even off-screen; this is the Turret anti-camping rule from GDD §5.3), the Surge Zone (purple circle, filled when held, striped when contested) and its preview (dashed), active shard clusters and announced points (green).
- Enemies that are not on screen and are not Turrets are not shown.

### 5.2 Death recap (B6)

Shown during the 3 s respawn timer:

```text
 KO'd by  RedFox        as  BEAST   with Scatter Cannon (32)
 Try TURRET: Turret beats Beast.
 Respawning in 2…
```

- Killer name, killer form icon and name, cause, final hit damage.
- Counter hint: `counterForm` from the death event (GR-11.8) with its key glyph.
- No other in-match counter hints in the prototype (D-024).

---

## 6. Screens and menus

All screens are DOM over the canvas (D-040), fully usable by keyboard only, mouse only, or both. Focus is always visible.

### 6.1 Landing screen

- Title "Shiftborn Arena" with the label "Prototype".
- Name field: prefilled with a generated name (adjective + noun), editable, saved in settings.
- Buttons: **Play** (quick play, default focus, Enter starts), **Create room** (creates a code room and shows the code), **Join room** (code field, 6 characters, uppercase automatically), **How to play** (controls card), **Settings**.
- If the URL has `?room=CODE`, the landing screen shows "Joining room CODE" with one **Join** button.
- Footer: build id, "Prototype build: greybox visuals".

### 6.2 Connecting and errors

- "Connecting..." with a Cancel button; 10 s timeout.
- Error messages per close code (`docs/NETWORK_PROTOCOL.md` §11) with the matching action button.
- "Reconnecting..." banner over the game during a drop (the proxy bot keeps playing).

### 6.3 Controls card

- Shown automatically at the start of the first match of a session (during COUNTDOWN), dismissed by any key or click, and auto-hidden at GO. Also available from the menu and the landing screen.
- Content, using the current scheme's glyphs: Move; Aim; Fire; Morph 1 Runner (free), 2 Beast (35 Flux), 3 Turret (35 Flux); Ability E; Lock Q (keyboard); Scoreboard Tab; Menu Esc.
- One line about the forms: "Each form beats one other form. Watch for EFFECTIVE and RESISTED hits." It does not say which form beats which (H5 measures whether players learn it).

### 6.4 Settings (B8)

Saved in `localStorage` with every read and write wrapped in try/catch; the game works with defaults if storage is unavailable.

| Setting | Values | Default |
|---|---|---|
| Aim assist strength (keyboard lock) | 0 to 100% | 100% |
| Keyboard lock-on | On, Off | On |
| Fire mode | Hold, Toggle | Hold |
| Camera view | TPP, FPP | TPP |
| Master volume | 0 to 100 | 80 |
| Effects volume | 0 to 100 | 100 |
| Interface volume | 0 to 100 | 80 |
| Screen shake | On, Off | On |
| Reduced motion | On, Off (turns off screen shake, camera lead smoothing becomes instant, fewer particles) | Off |
| Damage numbers | On, Off | On |
| Show FPS and ping | On, Off | Off |

### 6.5 In-match menu (Esc or P)

The match keeps running; a proxy bot does **not** take over while the menu is open (the player is still present). Items: Resume, Settings, Controls, Room (code and "Copy link" for code rooms), Host settings (host only), Leave match. The tester code is shown at the bottom ("Tester code: K7Q2MX").

### 6.6 Host settings (code rooms)

Mode for the next match (Frenzy, Zone Frenzy), Bot fill (On, Off), Bot difficulty (Easy, Normal, Hard). Note: "Changes apply at the next match." The server confirms with a `notice` to everyone.

### 6.7 Waiting overlay

For late joiners in a code room with 60 s or less left: "Match in progress. You will join the next match in 0:42." The camera shows a slow overview of the map.

### 6.8 Results screen

- Shown during RESULTS (15 s). Ranking table: rank, name, bot icon, score, KOs, deaths, assists, damage, zone points (Zone Frenzy). The local player's row is highlighted. Winner banner.
- "Next match in 12 s". Buttons: Leave, Settings.
- **Survey prompt** (B11): after the session's third completed match, a non-blocking banner: "Thanks for playtesting! Tell us what you think (2 minutes)." with the survey link and the tester code. Shown once per session; also available from the menu afterwards.

---

## 7. Camera

- Two local presentation views: **TPP** follows behind and above the player in the aim direction; **FPP** is at the player's eye height and looks along the aim. TPP is the saved default. V or the in-match View button switches between them. The server's movement, aim and hit rules do not change.
- Until T-033 supplies form silhouettes, TPP shows a neutral local greybox body. FPP hides the local body to keep the eye view clear.
- TPP has a 55° vertical field of view. The camera follows 4 m behind and 2.8 m above the player at Runner zoom, looks toward a point ahead, and moves toward the player if a wall or intact cover would contain it. Aim lead shifts the look target by up to one third of the smoothed lead. FPP sits 1.6 m above the player's ground point with a 65° vertical field of view at Runner zoom and a horizontal look direction.
- Form zoom uses `forms.<form>.cameraZoom` (1.0 Runner, 0.9 Beast, 1.3 Turret). TPP scales follow distance and height. FPP divides its field of view by zoom. Form zoom changes over 0.3 s. Switching TPP/FPP is immediate.
- TPP aim lead uses `aimDir × 6 m × k`, where `k = clamp(cursorDistance / 12 m, 0, 1)` for mouse aim and `k = 0.6` for keyboard aim. It is smoothed with a critically damped spring (time constant 0.15 s), or updates instantly with reduced motion. FPP stays at the eye and does not shift its origin for aim lead.
- **Fairness check (pending live aim and threat-arrow work):** measure whether each form's weapon range fits in the aim direction at 16:9 (Runner 14 m, Beast 9 m, Turret 18 m). Threat arrows are required for off-screen attackers.
- **Occlusion:** in TPP, walls and cover whose north face is within 2.5 m south of any visible player, or that cross the line from the camera to the local player, fade to 30% opacity. In FPP they remain opaque. Players behind cover also draw a solid silhouette in later entity work.
- Mild screen shake on the local player's own KO, on being hit by Ram Charge, and on Rail Shot release (off when screen shake is off).

---

## 8. Greybox visual language

| Thing | Look |
|---|---|
| Floor | Dark grey with a 1 m grid; lanes slightly different in brightness (Market west, Reactor Core center, Scrapyard east) |
| Walls | Light grey boxes, 3 m tall |
| Destructible cover | Medium grey boxes, 1.2 m tall, with diagonal crack lines; when destroyed, a flat rubble outline that pulses 3 s before it rebuilds |
| Local player | Blue body, white ground ring |
| Enemies (humans and bots alike) | Orange-red body, red outline, red nameplate with name |
| Runner | Small capsule (radius 0.6) on a flat board, arrow nose pointing along the aim |
| Beast | Large rounded box (radius 1.0) with two horns |
| Turret | Cylinder base (radius 0.9) with a long barrel along the aim and a faint 120° wedge on the floor showing the armored front arc |
| Morph | 0.5 s expanding white-green burst that hides the swap; the new shape pops in at the end |
| Projectiles | Own: blue-white. Enemy: orange-red. Pistol small sphere, Scatter pellets tiny spheres, Rail bolts elongated |
| Rail Shot telegraph | Thin line along the Turret's aim, brightening over 0.6 s (red for enemies, blue for own); bright beam flash on release |
| Dash | Short motion trail |
| Ram Charge | Crouch (scale squash) during windup, trail during charge, impact ring on hit |
| Stun | Three small stars circling above the player |
| Knockback | Motion trail on the knocked player |
| Spawn protection | Translucent white bubble |
| Shards | Green octahedrons, small 0.3 m, large 0.5 m, slowly bobbing and spinning |
| Surge Zone | Purple ring, 6 m radius, light fill; held: fill brightens in blue (you) or red (other); contested: purple and yellow stripes moving; preview: dashed purple ring with "NEXT" |
| Hazard yellow | Reserved; nothing in the prototype uses yellow-and-black stripes |

Colors are defined as named constants in one file (`apps/client/src/render/palette.ts`).

---

## 9. Sounds (synthesized, A24)

All sounds are generated with Web Audio at runtime (no audio files, D-045). The audio context unlocks on the first key press, click or tap. Sounds mute while the tab is hidden. Positional sounds pan left or right by screen position and fade with distance (silent beyond 25 m).

| Event | Sound |
|---|---|
| Pulse Pistol shot | Short square-wave blip |
| Scatter Cannon shot | Noise burst |
| Rail Repeater shot | Short sine zap |
| Hit confirm (your hit) | High tick |
| EFFECTIVE hit | Two-tone rising chirp |
| RESISTED hit | Dull low thud |
| KO (yours) | Bright chime |
| You died | Falling tone |
| Morph | Rising sweep (0.5 s) |
| Morph denied | Low buzz |
| Dash | Short noise whoosh |
| Ram windup / impact | Low growl / heavy thud |
| Rail Shot charge / fire | Rising tone over 0.6 s / loud zap |
| Overheat | Hiss |
| Shard pickup | Ding; higher pitch for large shards |
| Zone held by you / contested | Soft hum / alternating two-note pulse |
| Zone moves soon | Three soft beeps |
| Countdown | Beep per second, higher beep on GO |
| Low health (under 25%) | Slow heartbeat |
| Beast footsteps | Low thump per step, audible within 20 m (the Beast's loudness weakness, GDD §5.2) |

Volume groups: master, effects, interface.

---

## 10. Accessibility in the prototype

- Every gameplay feature and every menu works with keyboard only.
- Fire Hold or Toggle; aim assist strength; lock-on on or off.
- Screen shake off; reduced motion; damage numbers off.
- No information by color alone (section 8 pairs every color with a shape or label).
- Text sizes: minimum 14 px at 1280 x 720, 12 px at 821 x 462.
- Deferred to production (section 1): remapping, colorblind palettes, enemy highlight color picker, subtitles, visual sound indicators, one-hand preset, touch, controller.
