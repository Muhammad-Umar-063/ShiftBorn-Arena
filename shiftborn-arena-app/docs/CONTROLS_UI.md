# CONTROLS_UI.md

> **LLM FILE CONTRACT:** Client interaction source of truth for bindings, aiming, aim assist, HUD, screens, camera, greybox visuals, sound and accessibility. It does not define simulation outcomes.

Controls (mouse and keyboard, keyboard only), aiming behavior including the fragile aim assist, the HUD, menus and screens, the camera, the greybox visual language, sounds, and input accessibility for the Shiftborn Arena prototype.

Related: `DECISIONS.md` (D-024, D-037, D-040, D-044, D-045), `docs/GAME_RULES.md`, `docs/NETWORK_PROTOCOL.md` §5.2.

Design rule from the GDD (Pillar 7): every threat, form and objective must be identifiable within one second. No information is carried by color alone; every color cue has a matching shape, icon, label or outline.

---

## 1. Scope for the prototype

| In the prototype | Production only |
|---|---|
| Mouse and keyboard with pointer lock; keyboard only with the fragile assist (D-078, D-079) | Touch controls (M2), controller (v1.1) |
| Fixed default bindings | Full key remapping, one-hand preset |
| Settings in section 6.4 | Colorblind palettes, enemy highlight color picker, subtitles, visual sound indicators |
| Controls card | Boot Camp tutorial and contextual hints (D-024) |

---

## 2. Input schemes and bindings

### 2.1 Mouse and keyboard

| Action | Binding |
|---|---|
| Move | W A S D relative to facing: W forward, S back, A and D strafe (D-078, GR-4.19) |
| Sprint | Shift held with forward movement (Shift+W) (GR-4.16) |
| Turn | Horizontal mouse motion under pointer lock, in TPP and FPP; Left and Right arrows also turn |
| Aim distance | Vertical mouse motion under pointer lock; Up and Down arrows (GR-4.18) |
| Fire | Left mouse button (hold); Space also fires |
| Morph to Runner / Beast / Turret | 1 / 2 / 3 (locked forms are denied, GR-18.3) |
| Ability (Dash, Ram Charge, Rail Shot) | E |
| Reload | R |
| Swap the current form's guns | Q or mouse wheel |
| Dagger strike | V |
| Pick up a gun | Automatic on contact; no key (D-075) |
| Scoreboard | Tab (hold) |
| Menu (the match keeps running) | Esc or P |
| Switch camera view | C (TPP/FPP) |
| Debug overlay / hitbox view (dev builds) | F3 / F4 |
| Dev console (only if the server allows cheats) | Backtick |
| Reserved, do nothing yet | Right mouse (crate weapon), X (Ultimate), F (interact), Z (ping), B (emote) |

### 2.2 Keyboard only

| Action | Binding |
|---|---|
| Move | W A S D relative to facing |
| Sprint | Shift+W |
| Turn and aim distance | Left/Right turn, Up/Down change aim distance (section 3.2) |
| Fire | Space (hold, or toggle in settings); the fragile assist may help (section 3.3) |
| Morph to Runner / Beast / Turret | 1 / 2 / 3 |
| Ability | E |
| Reload, swap, dagger | R, Q, V |
| Scoreboard | Tab (hold) |
| Menu | Esc or P |
| Switch camera view | C (TPP/FPP) |
| Menus | Arrow keys or W A S D to move focus, Enter or Space to confirm, Esc to go back |

Both schemes work at the same time; nothing needs to be switched in settings.

### 2.3 Future schemes (reference only, not built)

- **Touch (production M2):** floating left joystick to move; right joystick to aim with auto-fire while dragged; quick tap on the right stick fires at the target picked by the lock acquire rule; three small form buttons above the right stick; ability button; landscape only.
- **Controller (v1.1):** left stick move, right stick aim, right trigger fire, left trigger crate weapon only, LB opens the morph wheel, D-pad left / up / right morphs to Runner / Beast / Turret, B ability, Y Ultimate, View scoreboard (D-044).

### 2.4 Scheme detection and glyphs

- The **aim scheme** is whatever produced the most recent aim input: pointer-locked mouse movement over 3 px → `mouse`; an arrow key press → `keys`; keyboard aim with the assist currently applying an offset → `lock` (wire code 2, now meaning "assist engaged"). This value is sent as `aimSource` in every input frame. It is telemetry only and is never trusted as proof of a player's scheme (D-079).
- On-screen key glyphs (controls card, HUD hints, ability button label) follow the current scheme: "LMB" or "Space" for fire, for example. Switch instantly.
- Moving the mouse releases the assist (section 3.3).

### 2.5 Browser input rules

- Call `preventDefault` on Space, arrow keys, Tab, Shift and Backtick during gameplay so the page does not scroll or move focus.
- Disable the right-click context menu on the game canvas.
- Esc may only exit fullscreen in some browsers, so P is a second menu key.
- Never use Ctrl or Cmd shortcuts.
- On window blur, `visibilitychange`, pointer-lock loss and focus moving to a form field, release every held key and mouse button, so a player does not keep moving, sprinting or firing.
- Request pointer lock on a canvas click during gameplay (D-078). While locked, hide the cursor and draw the reticle at the aim point (aim angle and aim distance). Browsers consume Esc to exit pointer lock without delivering a keydown, so a `pointerlockchange` that loses the lock during gameplay opens the menu exactly as Esc or P would. When the lock is refused or lost, mouse turning stops; keyboard turning still works.

### 2.6 Input mapper

- All input goes through `InputManager` and a bindings table (`apps/client/src/input/bindings.ts`). Game code reads **actions** (`fire`, `ability`, `morphBeast`, `reload`, `swap`, `dagger`, `sprint`), never raw key codes. This is what makes remapping, touch and controller possible later.
- Movement intent (forward, strafe) is converted to the frame's world `moveX`, `moveY` with the shared `encodeFacingMove` using the same aim the frame sends (GR-4.19).
- **Latching:** an action pressed and released between two 30 Hz ticks is reported as held for one frame (`docs/NETWORK_PROTOCOL.md` §5.2).
- **Fire mode Toggle:** Space or left mouse toggles the fire state on and off; the frame sends fire held while toggled on.

---

## 3. Aiming

### 3.1 Mouse aim (pointer lock, D-078)

- After a canvas click, pointer lock captures the mouse. Horizontal motion turns the aim by `mouseSensitivity × deltaX` radians (a client setting, section 6.4); vertical motion changes the aim distance by `mouseDistanceSensitivity × deltaY` meters, clamped to `aimDistance.minM` to `maxM` (2 to 24 m).
- TPP and FPP use the same rule; the camera follows the aim in both views.
- The reticle is drawn at the aim point: the player's displayed position plus the aim direction times the aim distance. Its color shows weapon state: normal, reloading, swapping, empty, overheated (Rail Repeater), or out of range (dimmed when the aim distance exceeds the selected gun's range). With the Arc Mortar selected, the reticle shows the clamped landing point (GR-7.26).

### 3.2 Keyboard turn and aim distance (arrow keys)

- Left turns counter-clockwise and Right turns clockwise with the ramped, frame-rate-independent model in `docs/BALANCE.md` §9.6 (`keyboardAim.*`): 90°/s at first, rising to 300°/s after 0.35 s held. Taps give fine steps of a few degrees; holds turn quickly.
- Holding both Left and Right turns nothing and resets the ramp. Releasing stops turning at once and keeps the aim.
- Up increases and Down decreases the aim distance at 10 m/s within 2 to 24 m.
- A Turret is still limited to 120° per second by the sim (GR-4.13).
- The shared integrators live in `packages/sim` so the client and tests use one implementation.

### 3.3 Fragile aim assist (keyboard aim only, D-079)

The assist is a small, breakable correction. It runs on the client and produces normal aim angles (D-037). It never affects mouse aiming.

- **Acquire:** only on a fire press (rising edge), and only when the player's **raw** aim (their own keyboard aim, before any assist) is within `aimAssist.acquireHalfAngleDeg` (5°) of the bearing to an eligible enemy: alive, not spawn-protected, within the selected weapon's range (dagger reach for the dagger) and in line of sight through walls and intact cover. The smallest angle wins, then the shorter distance, then the lower seat. Held fire never acquires.
- **Effect:** the sent aim is `raw + offset`. The offset moves toward `clamp(bearing − raw, ±maxCorrection)` at `aimAssist.pullDegPerS` (40°/s), where `maxCorrection = aimAssist.maxCorrectionDeg` (3°) × strength. The bearing uses the target's interpolated position with no lead.
- **Retention:** the assist stays engaged while fire is held, the target stays eligible, and the raw aim stays within `aimAssist.retainHalfAngleDeg` (7°) of the bearing. Retention is measured from raw aim, never from the assisted aim, so a target moving away breaks it unless the player turns manually.
- **Break and release:** on any failed condition, the target is forgotten and the offset decays to 0 at 40°/s (no snap). The same target cannot be acquired again for `aimAssist.reacquireDelayS` (0.75 s), and nothing is acquired again without a new fire press.
- **Never:** target cycling, lead, autonomous tracking, homing projectiles, wider hitboxes or extra damage.
- **Feedback:** a small "ASSIST" mark under the reticle while the offset is not 0. No target ring.

### 3.4 Aim assist and fairness

- Assist strength (settings, 0 to 100%, default 100%) scales `maxCorrection` from 0 to 3°. At 0% the assist does nothing.
- The fairness test (H9, `docs/PLAYTEST_PLAN.md` §4.4) compares keyboard and mouse hit rates. Levers, in order: `aimAssist.maxCorrectionDeg`, then `acquireHalfAngleDeg`, within BALANCE ranges. `aimSource` is recorded for analysis but never treated as proof of honesty.

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
| Reticle | At the aim point (aim angle and aim distance) | State colors (section 3.1); "ASSIST" mark while the assist applies an offset. |
| Weapon panel | Bottom-right, beside the ability button | Selected gun name and tier ("T1" or "T2"), `mag / reserve`, reload progress from `reloadEndTick`, swap state, and the other gun of the form if owned. "DAGGER" when the form has no usable gun. |
| Inventory strip | Above the form buttons | Six small slots (two per form) showing owned guns and their ammunition; slots of locked forms show a lock and the KO progress ("Beast 2/3", "Turret 4/6"). |
| Unlock toast | Center | "Beast unlocked" or "Turret unlocked" on `formUnlocked` for the local player. |
| Loot | World | Each gun item at its exact schema position with its icon and tier; pickup feedback from `lootPickup`. |
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
- Content, using the current scheme's glyphs: Move (facing-relative); Sprint Shift+W; Turn and aim distance; Fire; Reload R; Swap Q; Dagger V; Morph 1 Runner (free), 2 Beast (35 Flux, unlocks at 3 KOs), 3 Turret (35 Flux, unlocks at 6 KOs); Ability E; Scoreboard Tab; Camera C; Menu Esc. One line: "Guns are on the map. Walk over them to pick them up."
- One line about the forms: "Each form beats one other form. Watch for EFFECTIVE and RESISTED hits." It does not say which form beats which (H5 measures whether players learn it).

### 6.4 Settings (B8)

Saved in `localStorage` with every read and write wrapped in try/catch; the game works with defaults if storage is unavailable.

| Setting | Values | Default |
|---|---|---|
| Aim assist strength (keyboard aim) | 0 to 100% | 100% |
| Keyboard aim assist | On, Off | On |
| Mouse turn sensitivity | 0.1 to 5 mrad per pixel | 2.5 |
| Mouse aim-distance sensitivity | 0.005 to 0.1 m per pixel | 0.03 |
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

The match keeps running (D-080). Opening the menu, or losing pointer lock, sends neutral input (no movement, sprint, fire, reload, swap, dagger, ability or morph; aim unchanged) and clears held input. The player can still be damaged and killed. Opening the menu never triggers a proxy by itself, but the ordinary AFK rule (`NETWORK_PROTOCOL.md` §9.4) still applies to a player who stays in it, exactly as for any other idle player. Items: Resume, Settings, Controls, Room (code and "Copy link" for code rooms), Host settings (host only), Leave match. The tester code is shown at the bottom ("Tester code: K7Q2MX").

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

- Two local presentation views: **TPP** follows behind and above the player in the aim direction; **FPP** is at the player's eye height and looks along the aim. TPP is the saved default. C or the in-match View button switches between them (D-078). The server's movement, aim and hit rules do not change.
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
- Fire Hold or Toggle; aim assist strength; keyboard aim assist on or off; mouse sensitivities.
- Screen shake off; reduced motion; damage numbers off.
- No information by color alone (section 8 pairs every color with a shape or label).
- Text sizes: minimum 14 px at 1280 x 720, 12 px at 821 x 462.
- Deferred to production (section 1): remapping, colorblind palettes, enemy highlight color picker, subtitles, visual sound indicators, one-hand preset, touch, controller.
