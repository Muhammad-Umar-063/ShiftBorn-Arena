# NETWORK_PROTOCOL.md

> **LLM FILE CONTRACT:** Authoritative wire and netcode specification. A message, field or rate change must update shared protocol code and bump its version in the same task.

Input messages, authoritative state, tick rates, prediction and reconciliation, interpolation, and the connection lifecycle for the Shiftborn Arena prototype.

Related: `DECISIONS.md` (D-033 to D-039, D-043), `docs/ARCHITECTURE.md` §5 to §7, `docs/GAME_RULES.md` §15.

All message names, numeric type ids and encodings live in `packages/shared/src/protocol.ts`. Client and server import the same file.

---

## 1. Principles

1. **Inputs up, state down.** Clients send input frames. The server sends state patches and event batches. Clients never send positions, damage or results (D-036).
2. **One input per tick.** Each 30 Hz client tick produces exactly one input frame with a sequence number.
3. **Redundancy instead of retransmission.** Each input packet repeats the last 3 frames, so a delayed packet is covered by the next one.
4. **Predict yourself, interpolate others.** The local player is predicted with the shared sim and corrected by the server. Everyone else is drawn 100 ms in the past between two known states.
5. **Events for things that happen; state for things that are.** Positions, health and timers are state. Shots, hits, deaths and pickups are events.

---

## 2. Transport, encoding and versioning

- **Transport:** Colyseus over WebSocket. `ws://` locally, `wss://` in the playtest deployment (Caddy terminates TLS).
- **State:** `@colyseus/schema` binary delta patches.
- **Messages:** Colyseus messages with numeric type ids (smaller than strings), payloads encoded by Colyseus (msgpack). Payloads are flat arrays where noted, to keep them small.
- **Protocol version:** `PROTOCOL_VERSION = 1` (initial integer version) in `protocol.ts`. Bump it on any later change to messages, schema or input encoding. The client sends it in the join options; the server rejects a mismatch with close code 4000 and the client shows "A new version is available. Reload."
- **Balance check:** the `welcome` message carries `balanceVersion` and `balanceHash` (a stable hash of the `BALANCE` object). If the client's hash differs, it shows the same reload prompt. Prediction with different numbers would cause constant corrections.

---

## 3. Rooms and joining

### 3.1 Quick play

`client.joinOrCreate('arena', { code: '', name, protocolVersion, inputScheme })`. The matchmaker prefers the room with the most humans that is not locked. If none exists, a new room is created and filled with bots.

### 3.2 Code rooms (playtests)

- URL: `https://<playtest-host>/?room=ABC234`. The landing screen also has "Create room" (generates a code on the client) and "Join room" (enter a code).
- `client.joinOrCreate('arena', { code: 'ABC234', name, protocolVersion, inputScheme })`, with the room definition filtered by `code`.
- Codes: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. Invalid codes are rejected with close code 4002.
- The first human to join is the **host**. When the host leaves, the next human by seat order becomes host. The host may send `hostSettings` (§5.1); changes apply at the next COUNTDOWN (GR-2.9).
- Code rooms never lock. A player joining with 60 s or less left waits on an overview camera (GR-2.6).

### 3.3 Locking

Quick-play rooms call the Colyseus room lock when PLAYING has 60 s or less remaining (`match.lateJoinCutoffS`) and unlock at the start of RESULTS. A locked room is skipped by matchmaking.

### 3.4 Join options

| Field | Type | Rules |
|---|---|---|
| `code` | string | Empty for quick play, else a valid code |
| `name` | string | Sanitized server-side (1 to 16 characters; invalid becomes a generated name) |
| `protocolVersion` | integer | Must equal the server's |
| `inputScheme` | `mouse` or `keys` | Initial scheme, for telemetry |
| `testerTag` | string, optional | From URL `?tag=` for playtest grouping (for example `R1`) |

### 3.5 Seat assignment on join

1. If a seat is empty (bot fill off), take the lowest empty seat.
2. Else replace one bot immediately (D-038): prefer a bot with no damage dealt or taken in the last 3 s (`backfill.outOfCombatS`); among those, the lowest score; if none is idle, the lowest-scoring bot. Ties: highest seat index. The bot leaves with a `botReplaced` event and a warp-out effect. It is not a death.
3. If all 8 seats hold humans, the room is full; the matchmaker sends the player elsewhere (quick play) or rejects with 4001 (code room).
4. The human spawns at once if the phase allows (GR-2.6), else waits for the next COUNTDOWN.

---

## 4. Rates and authoritative state

### 4.1 Rates

| What | Rate | Key |
|---|---|---|
| Server simulation | 30 Hz (every 33.33 ms) | `tick.rateHz` |
| State patches to clients | 20 Hz (every 50 ms) | `tick.patchRateHz` |
| Event batches | Every server tick that produced events | |
| Client input frames | 30 per second | |
| Client ping | Every 2 s | `net.pingIntervalS` |
| Server RTT probe | Every 2 s | `net.pingIntervalS` |
| Client stats | Every 30 s | |
| Remote interpolation delay | 100 ms | `net.interpDelayMs` |

### 4.2 Schema

The server mirrors the sim into this schema every tick (`apps/server/src/rooms/mirror.ts`). Assign only changed values so patches stay small. Types are `@colyseus/schema` types.

```text
ArenaState
  tick: uint32                 current server tick
  phase: uint8                 0 COUNTDOWN, 1 PLAYING, 2 RESULTS
  phaseEndTick: uint32
  mode: uint8                  0 frenzy, 1 zoneFrenzy
  matchId: string
  matchIndex: uint16
  hostId: string               empty in quick play
  settings: RoomSettings       botFill: boolean, botDifficulty: uint8, nextMode: uint8
  players: MapSchema<PlayerState>     key = player id
  shards: MapSchema<ShardState>       key = shard id
  clusterAnnounces: ArraySchema<ClusterAnnounce>   pointIndex: uint8, spawnTick: uint32
  cover: ArraySchema<CoverState>      intact: boolean, rebuildTick: uint32 (index = cover index)
  zone: ZoneState              active: boolean, point: int8, nextPoint: int8 (-1 none),
                               moveTick: uint32, state: uint8 (0 empty, 1 held, 2 contested), holderId: string

PlayerState
  id: string, name: string, seat: uint8, isBot: boolean
  controller: uint8            0 human, 1 bot, 2 proxy
  connected: boolean
  alive: boolean
  x, y, vx, vy: float32
  aim: float32                 radians
  form: uint8                  0 runner, 1 beast, 2 turret
  morphTarget: int8            -1 none
  morphEndTick: uint32
  morphReadyTick: uint32
  hpFrac: float32
  flux: float32
  abilityId: int8              -1 none, 0 dash, 1 ramCharge, 2 railShot
  abilityPhase: uint8          0 none, 1 windup, 2 active
  abilityStartTick, abilityEndTick: uint32
  abilityDirX, abilityDirY: float32
  abilityReadyRunner, abilityReadyBeast, abilityReadyTurret: uint32
  heat: float32, overheatEndTick: uint32
  stunEndTick: uint32
  knockbackEndTick: uint32, kbvx, kbvy: float32
  protectedEndTick: uint32
  respawnTick: uint32
  kos, deaths, assists: uint16
  points: float32, damageDealt: float32
  lastInputSeq: uint32         last input applied by the server for this player
  aimSource: uint8

ShardState
  x, y: float32, value: uint8, kind: uint8 (0 small, 1 large, 2 drop), expiresTick: uint32 (0 = never)
```

Everything any client needs to predict the local player is in `PlayerState`. The full state goes to every client in the prototype (D-039).

Bot difficulty uses D-063 codes in both existing fields: 0 Easy, 1 Normal, 2 Hard. `nextMode` uses 0 Frenzy and 1 Zone Frenzy.

---

## 5. Messages

### 5.1 Catalog

| Id | Name | Direction | Payload | When |
|---|---|---|---|---|
| 1 | `input` | client → server | Flat array of up to 3 frames (§5.2) | Every client tick |
| 2 | `ping` | client → server | `[clientTimeMs]` | Every 2 s |
| 3 | `vis` | client → server | `[hidden 0 or 1]` | On `visibilitychange` |
| 4 | `hostSettings` | client → server | `{ botFill, botDifficulty, nextMode }` | Host only |
| 5 | `devCmd` | client → server | `{ cmd: string }` | Only accepted with `DEV_CHEATS=1` |
| 6 | `clientStats` | client → server | `{ fpsMedian, fpsP5, rttMs, corrections, inputScheme, windowW, windowH, browser, hiddenMs, errors }` (`errors` = uncaught client errors and WebGL context losses since the last report) | Every 30 s |
| 7 | `probeReply` | client → server | `[serverTimeMs]` echoed | On `probe` |
| 100 | `welcome` | server → client | `{ protocolVersion, buildId, playerId, seat, isHost, roomCode, mapId, balanceVersion, balanceHash, serverTick, tickRate, patchRate, testerCode }` | After join and after reconnect |
| 101 | `pong` | server → client | `[clientTimeMs, serverTick, serverTimeMs]` | On `ping` |
| 102 | `ev` | server → client | `[tick, ...events]` (§5.3) | Ticks with events |
| 103 | `probe` | server → client | `[serverTimeMs]` | Every 2 s |
| 104 | `afkWarn` | server → client | `[secondsLeft]` | §9.4 |
| 105 | `control` | server → client | `[controller]` | Controller changed for this player (hidden, AFK, reconnect) |
| 106 | `notice` | server → client | `{ kind, text }` | Host changed, settings applied, bot difficulty |
| 107 | `devResult` | server → client | `{ ok, text }` | Reply to `devCmd` |

### 5.2 Input frame

One frame per client tick:

| Field | Type | Range | Meaning |
|---|---|---|---|
| `seq` | uint32 | starts at 1, +1 per frame, continues across reconnects | Sequence number |
| `moveX`, `moveY` | int8 | -127 to 127 | Movement intent (GR-4.2) |
| `aim` | uint16 | 0 to 65535 | Aim angle = `aim / 65536 × 2π` |
| `buttons` | uint16 | bitmask | Below |
| `aimSource` | uint8 | 0 mouse, 1 keys, 2 lock, 3 touch (reserved), 4 pad (reserved) | Telemetry and validation |

Buttons (held state, not edges):

| Bit | Button |
|---|---|
| 0 | fire |
| 1 | ability |
| 2 | morph to Runner |
| 3 | morph to Beast |
| 4 | morph to Turret |
| 5 | crate (reserved, ignored) |
| 6 | ultimate (reserved, ignored) |
| 7 | interact (reserved, ignored) |
| 8 to 15 | unused, must be 0 |

**Latching.** A key pressed and released between two client ticks is still reported as held in the next frame, so a quick tap is never lost.

**Packet.** `input` payload = the newest frame followed by up to 2 previous frames, flattened: `[seq, moveX, moveY, aim, buttons, aimSource, seq-1, ..., seq-2, ...]` (6, 12 or 18 numbers).

**Validation** (server, per frame): integers in range, `seq` within 1000 of the last received, `aimSource` known, unused bits 0. A frame that fails is dropped. 50 dropped frames within 10 s closes the connection with 4003.

### 5.3 Events

`ev` payload: `[tick, e1, e2, ...]` where each event is a flat array starting with its numeric event type (from `protocol.ts`). The table lists the payload after the type. Ids are short player ids (seat index) where possible.

| Id | Event | Payload |
|---|---|---|
| 1 | `projectileSpawn` | id, ownerSeat, weapon, x, y, angle, spawnTick, advancedTicks, inputSeq, shotIdx |
| 2 | `projectileHit` | id, targetSeat, damage, tags bitmask (1 EFFECTIVE, 2 RESISTED, 4 ARMOR), x, y |
| 3 | `projectileImpact` | id, x, y |
| 4 | `projectileExpire` | id |
| 5 | `blocked` | id, targetSeat |
| 6 | `morphStart` | seat, from, to, endTick |
| 7 | `morphEnd` | seat, form |
| 8 | `morphDenied` | seat, target, reason (0 cooldown, 1 flux, 2 busy, 3 phase) |
| 9 | `abilityStart` | seat, ability, startTick, endTick, dirX, dirY |
| 10 | `abilityEnd` | seat, ability, cancelled (0 or 1) |
| 11 | `abilityHit` | seat, ability, targetSeat, damage, tags |
| 12 | `railShotFired` | seat, x1, y1, x2, y2 |
| 13 | `stun` | seat, endTick |
| 14 | `knockback` | seat, vx, vy, endTick |
| 15 | `overheat` | seat, endTick |
| 16 | `death` | victimSeat, killerSeat, cause, killerForm, victimForm, finalDamage, counterForm, assistSeats... |
| 17 | `spawn` | seat, x, y, protectedEndTick |
| 18 | `respawn` | seat, x, y, protectedEndTick |
| 19 | `shardSpawn` | shardId |
| 20 | `shardPickup` | shardId, seat, value |
| 21 | `shardExpire` | shardId |
| 22 | `clusterAnnounce` | pointIndex, spawnTick |
| 23 | `coverDestroyed` | coverIndex |
| 24 | `coverRebuilt` | coverIndex |
| 25 | `zoneAnnounce` | nextPoint, moveTick |
| 26 | `zoneMoved` | point |
| 27 | `zoneState` | state, holderSeat (-1 none) |
| 28 | `phase` | phase, phaseEndTick |
| 29 | `matchEnd` | ranking (seat list) |
| 30 | `botReplaced` | seat, newPlayerId |

Most of these duplicate state that also arrives in patches (for example shard lists). The event exists so the client can play effects and sounds at the right moment. **State is the truth; events are for presentation**, except projectile events, which exist only as events (D-034).

### 5.4 Server input processing

Per player, the server keeps a buffer of frames ordered by `seq` (max `net.inputBufferMax` = 8; when full, the oldest is dropped and a counter increments).

On each `input` packet: add every frame with `seq` greater than the last received `seq`, ignore duplicates.

Each tick, for each human seat:

1. If the buffer has 4 or more frames, consume 2 frames: move, aim, fire and `aimSource` come from the newer one; button rising edges are the union of both (catch-up after a lag spike).
2. Else if the buffer has frames, consume 1.
3. Else repeat the last applied frame (no new edges, because the held bits are unchanged).
4. Rising edges are computed against the previously applied frame's buttons.
5. Set `lastInputSeq` to the newest consumed `seq`.

Bot and proxy seats get their frame from the bot controller (`docs/BOT_SPEC.md`), built the same way.

Rate limit: more than 40 frames per second (`net.maxInputsPerS`) over a 1 s window are dropped and counted.

---

## 6. Client prediction and reconciliation (local player)

### 6.1 Predicting

Each client tick:

1. Build the frame (§5.2) and send it.
2. Store it in `pending` (frames not yet acknowledged).
3. Run `predictStep` (`docs/ARCHITECTURE.md` §4.6) on the predicted local state.
4. If the predicted fire timer fires, spawn a **local shot** visual tagged `(seq, shotIdx)` (§8.2).

What is predicted: position, velocity, aim (with the Turret cap), morph start and end (if the last known Flux covers the cost and the cooldown is ready), Dash movement, Ram Charge windup and movement (stopping at walls and cover only), Rail Shot charge visuals, cooldown timers, fire timers and heat.

What is never predicted: damage, deaths, Flux gains, shard pickups, Ram contacts, KOs, scores.

### 6.2 Reconciling

When a patch updates the local `PlayerState`:

1. Drop every frame in `pending` with `seq ≤ lastInputSeq`.
2. Set the predicted state to the authoritative fields (position, velocity, aim, form, morph, ability, cooldowns, heat, stun, knockback, protection, Flux, alive).
3. Replay the remaining `pending` frames through `predictStep`.
4. Compare the new predicted position with the position currently displayed:
   - Error under 0.5 m (`net.smoothErrorM`): keep a visual offset equal to the error and decay it to 0 over 100 ms (`net.smoothMs`).
   - Error 0.5 m or more: snap (no offset) and count one **correction** for telemetry (H11).
5. Discrete differences (form, alive, morph rejected) apply immediately with no smoothing. A predicted morph that the server rejected disappears here, and the HUD flashes the form button.

### 6.3 Special cases

- **Death:** when the local player's `alive` becomes false, clear `pending`, stop predicting until `respawn`.
- **Respawn and teleports:** snap, never smooth.
- **Knockback and stun** come from the server; the predictor applies them from the authoritative state and replays inputs on top (input movement is ignored during them, as in the sim).
- **Visibility return or reconnect:** clear `pending`, snap to the authoritative state, restart `seq` counting from the last used value + 1.

---

## 7. Interpolation of remote entities

- For each patch, record `(state.tick, receivedAtMs)` and each remote player's `x, y, aim, form, alive, morph, ability` fields in a ring buffer (last 1 s).
- Render time = estimated current server tick (§10) minus 100 ms (`net.interpDelayMs`), expressed in ticks.
- Find the two buffered samples around the render time and interpolate position linearly and aim along the shorter arc. Discrete fields (form, alive, ability phase) switch when the render time passes the sample that changed them.
- If the render time is past the newest sample: extrapolate with velocity for up to 100 ms, then hold.
- If two consecutive samples are more than 5 m apart (respawn), snap instead of interpolating.
- World effects for events (projectile flights, impacts, Rail Shot beams, remote morph bursts, deaths of others) play on the same render timeline: an event for tick `T` plays when the render time reaches `T`.
- HUD changes for the local player (own health, Flux, damage taken direction, own death, hit markers for own hits, death recap) apply when the message arrives, for responsiveness.

---

## 8. Projectiles, hits and lag handling

### 8.1 Server

- Projectiles are simulated only on the server for outcomes (D-034).
- **Spawn advance:** a human's new projectile is advanced by `A = min(round(oneWayLatencyMs / 33.33), 3)` ticks immediately, with full collision checks (GR-7.9). `oneWayLatencyMs` = half of the server-measured RTT (§10). This hides most of the shooter's latency without rewinding other players.
- The `projectileSpawn` event carries the spawn tick, `advancedTicks`, and `(inputSeq, shotIdx)` for the shooter's client.
- **Rail Shot** has no lag compensation; the 0.6 s telegraph keeps it fair (GR-8.15).
- Future: if playtests show "I clearly hit him" complaints at normal latency, evaluate `allowRewindState` (Colyseus) or a custom position history for hit checks. Record any change as a decision.

### 8.2 Shooter's client

- On a predicted shot, spawn a local visual immediately at the muzzle, moving at the weapon speed.
- When `projectileSpawn` arrives with this player's seat, `inputSeq` and `shotIdx`: link the local visual to the server id (keep drawing the local one; do not jump).
- If no matching spawn arrives within 500 ms, fade the local visual out (the server did not accept the shot, for example because the player was stunned).
- `projectileHit`, `projectileImpact`, `projectileExpire` and `blocked` for linked ids destroy the visual with the right effect.

### 8.3 Other clients

- On `projectileSpawn`, schedule the projectile visual to start at the render time of its spawn tick, from the spawn position, then simulate it forward visually (straight line, its speed). It is destroyed by the hit, impact, expire or blocked event for its id, played on the render timeline.

### 8.4 Damage feedback

- Hit markers and damage numbers for the local player's hits appear when `projectileHit` or `abilityHit` arrives, using the damage and tags from the event.
- Damage taken by the local player updates health from state and shows a direction indicator toward the attacker's latest known position.

---

## 9. Connection lifecycle

### 9.1 Client states

```text
Landing ──Play──► Connecting ──joined──► InMatch
   ▲                  │ fail                │ drop
   │                  ▼                     ▼
   └────────────── Error ◄──── failed ── Reconnecting (retry at 0.5, 1, 2, 4, 8 s; give up at 30 s)
                                            │ success
                                            ▼
                                         InMatch
```

### 9.2 Joining

1. Landing: name, Play (quick play) or room code.
2. Connecting: `joinOrCreate` with join options (§3.4). Timeout after 10 s with "Could not connect. Try again."
3. On `welcome`: compare `protocolVersion` and `balanceHash`; start clock sync (§10); show the match.

### 9.3 Drop and reconnect

- Unexpected disconnect: the server keeps the seat for 30 s (`net.reconnectS`) and switches it to a proxy bot (`controller = proxy`). The player's score and stats continue.
- The client shows "Reconnecting..." and retries with the reconnection token at 0.5, 1, 2, 4 and 8 s, then every 8 s until 30 s have passed.
- On success: the server returns control (`control` message), sends `welcome` again, and the client resyncs (§6.3).
- After 30 s: the seat becomes a normal bot; the client shows "Connection lost" with "Play again".

### 9.4 Hidden tab and AFK

- **Hidden tab:** on `visibilitychange` to hidden, the client sends `vis [1]`. The server switches the seat to a proxy bot at once. On visible, the client sends `vis [0]`, the server returns control, and the client resyncs (§6.3). Score earned by the proxy still counts for the seat in the match.
- **AFK:** the server tracks the last tick with meaningful input from a human seat (any non-zero move, aim change over 2°, or any button). After 30 s without it (`net.afkWarnS`) while the tab is visible, send `afkWarn [15]`. At 45 s (`net.afkBotS`), switch to proxy and send `control`. Any meaningful input returns control.

### 9.5 Leaving

- The menu's "Leave match" calls `room.leave(true)` (consented). The seat becomes a bot immediately (or empty if bot fill is off).

### 9.6 Room disposal

- A room with no human clients and no pending reconnections disposes itself. Bot-only rooms are never kept alive, except those started by `pnpm loadtest`.

### 9.7 Server shutdown

- On SIGTERM: stop accepting joins, send `notice { kind: 'shutdown' }`, wait up to 10 s for current RESULTS phases if any, close rooms with code 4004, flush logs, exit. Clients show "The server is restarting. Play again in a moment."

---

## 10. Clock sync and RTT

- **Client clock:** every 2 s the client sends `ping [clientTimeMs]`; the server replies `pong [clientTimeMs, serverTick, serverTimeMs]`. RTT = now − clientTimeMs. Keep the last 10 samples; `rtt` = median. Estimated server tick now = `serverTick + (rtt / 2 + msSincePong) / 33.33`. Re-anchor on every pong, but change the estimate by at most 5 ms per frame to avoid jumps.
- **Server RTT** (used for spawn advance): every 2 s the server sends `probe [serverTimeMs]`; the client echoes `probeReply` immediately. Server RTT = median of the last 10. The server never trusts a client-reported latency.

---

## 11. Close codes and errors

| Code | Meaning | Client shows |
|---|---|---|
| 4000 | Protocol or balance version mismatch | "A new version is available." + Reload |
| 4001 | Room full | "That room is full." + Play (quick play) |
| 4002 | Invalid room code | "Room code not found." |
| 4003 | Kicked for invalid input | "Disconnected." + Play again |
| 4004 | Server shutting down | "The server is restarting." + Play again |
| 4010 | Room error (internal) | "Something went wrong." + Play again |

---

## 12. Network simulation and testing

- **Client netsim** (`apps/client/src/net/netsim.ts`), enabled by URL parameters:
  - `lag=<ms>`: adds half to outgoing and half to incoming messages (so `lag=150` adds 150 ms RTT).
  - `jitter=<ms>`: random extra delay up to this value per message, never reordering messages.
  - `loss=<percent>`: WebSocket runs on TCP, so real loss shows up as delay, not missing messages. With this probability, a message and every message behind it are held an extra 200 ms (head-of-line blocking). Messages are never dropped, because dropping a schema patch would corrupt state decoding.
- Required test conditions for every network-related task: 0 ms, 100 ms and 200 ms added RTT, and 150 ms with 2% loss.
- Chrome DevTools network throttling is a second option for manual checks.

---

## 13. Bandwidth estimate (full room, 8 players)

| Stream | Estimate |
|---|---|
| Patches: about 25 bytes per moving player per patch × 8 × 20 Hz, plus overhead | about 5 KB/s down |
| Events: about 30 projectile spawns per second × 30 bytes, plus others | about 1.5 KB/s down |
| Input: 18 numbers × 30 per second, msgpack | about 1.5 KB/s up |
| **Total** | **about 7 KB/s down, 1.5 KB/s up** (budget: 10 down, 4 up) |

Measure actual numbers with server byte counters in the soak test and record them in the prototype report.

---

## 14. Validation and abuse protection

- Every input field is range-checked (§5.2). The sim also clamps movement to 1 and aim to [0, 2π).
- Unknown message ids are dropped and counted.
- Maximum WebSocket message size: 4 KB.
- `hostSettings` from a non-host is dropped. `devCmd` is dropped unless `DEV_CHEATS=1`.
- `clientStats` values are clamped and treated as informational only.
- 50 dropped or invalid messages within 10 s closes the connection (4003).

---

## 15. Colyseus netcode helpers: spike checklist (task T-020)

Recent Colyseus versions provide `setFixedTimestep`, `defineInput` (per-client input buffers), a client `Predict` helper with `reconciler` and `spawns`, `allowRewindState` for lag compensation, and `onDrop` / `onReconnect` hooks. Use them only if every check below passes in a small test room with the shared sim:

| Check | Requirement |
|---|---|
| Fixed timestep | Exactly 30 steps per second on average, with bounded catch-up |
| Input buffer | Supports our frame shape, redundancy (§5.2), held-button edge semantics and the 2-frame catch-up (§5.4), or allows us to implement them on top |
| Reconciler | Can call our `predictStep` with our full local state (morph, ability, cooldowns), and exposes the error so we can apply the 0.5 m smooth-or-snap rule and count corrections |
| Predicted spawns | Can match local shots to server projectile events by `(inputSeq, shotIdx)`, or we keep our own projectile matching |
| Reconnection | `onDrop` and `onReconnect` behave as §9.3 with a 30 s window |
| Measured quality | At 150 ms added RTT: fewer than 1 correction over 0.5 m per player-minute while walking, dashing and morphing |

Record the result in `DECISIONS.md` as D-061: "Colyseus helpers" (list which ones) or "custom implementation". Either path must implement every behavior in this document.
