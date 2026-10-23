# T-037 AT-NET-09 input catch-up trace

Captured 2026-10-21 with a real Colyseus server, production Schema patches, and a Chromium Playwright client. The client test is `apps/client/e2e/projectiles.e2e.ts`; the deterministic reproduction is `apps/server/test/projectileCatchupContract.test.ts`. Temporary server trace logging was removed after capture. The failing measurements below are from protocol version 2, before D-072 approval. Version 3 implementation and acceptance results are tracked separately below.

## Failing 150 ms RTT, 2% head-of-line hold

The client sampled Fire on input sequence 117 at 4758.5 ms with `nextShotIn = 0`. `predictStep` emitted `(inputSeq=117, shotIdx=0)` and set the Runner timer to 0.133333 s. The local visual existed in the pointer-down handler at 4758.9 ms and its instanced mesh drew on the next animation frame at 4765.0 ms. Held Fire frames 118, 119 and 120 produced no new predicted shot: the timer stepped 0.133333 → 0.100000 → 0.066667 → 0.033333 s.

At server tick 132, the human input queue held four Fire frames, `[117,118,119,120]`. `InputQueue.consume()` took `[117,118]`, applied sequence 118 (the newer frame), and merged the Fire rising edge (`pressedButtons=1`). Before the step, the authoritative Runner timer was 0, `lastShotInputSeq=-1`, and `nextShotIdx=0`. The server emitted projectile id 0 with `(inputSeq=118, shotIdx=0, advancedTicks=3)` and afterward had timer 0.133333 s, `lastShotInputSeq=118`, `nextShotIdx=1`. Earlier queued frames 115 and 116 had no Fire and were consumed on prior ticks. This is a ready-weapon acceptance, not a rejected client prediction.

At 5057.3 ms the client replayed pending frames after an authoritative patch with acknowledgement 116; replay retained frames 117 onward. At 5057.8 ms it received the spawn tagged `(118,0)`. The exact lookup found no own visual with `(owner,118,0)`, because the visible click shot was `(owner,117,0)`. The spawn did not link to that visual. Replay does not retag already-created visuals, and the exact projectile linker correctly rejects the unequal tuple.

The original version 2 contract reproduction built the same ready-weapon state and four-frame queue, verified the client's `(117,0)` prediction and no shot on 118, then verified the server's merged Fire edge and `(118,0)` spawn. The current regression test has been updated to assert D-072's version 3 identity rule; this historical trace remains evidence of the earlier failure.

## Path and classification

1. `InputManager` sends each newly sampled frame and `Predictor.onFrame` immediately runs the shared `predictStep` (§6.1), so the local visual uses the first firing frame's sequence.
2. Under backlog, `InputQueue.consume` applies the newer of two frames while merging their rising edges (§5.4). The authoritative sim uses that applied frame sequence for D-069 shot allocation.
3. `Predictor.adopt` restores authoritative state and replays pending frames; it does not change the identity of the already-rendered visual.
4. `ProjectileTimeline.onReceipt` requires exact owner, sequence and shot index (§8.2). It could not join `(117,0)` to `(118,0)` under the then-approved version 2 identity rule.

**Classification B: an approved-contract conflict in version 2.** The queue, predictor, sim and linker each followed their documented rule. The client could not know which adjacent frames the server would coalesce when it rendered the first shot. OQ-022 was subsequently approved as D-072 for a versioned, durable intent identity. Approximate matching remains prohibited.

## Live measurements

The test asserts first-rendered-frame appearance, exact server-id linking, unchanged visual id and position on link, and no page errors. `drawnCount=1` on the first animation frame in every measured run below. A failed link is an AT-NET-09 failure even when the server accepted the shot. The event route may report the same spawn twice; the table uses its first confirmation.

| Network condition | Run | Client click tag | Server spawn tag | Exact link |
|---|---:|---|---|---|
| 150 ms + 2% HOL loss | 1–5 | 113, 117, 114, 100, 114 | 113, 118, 114, 100, 114 | pass, **fail**, pass, pass, pass |
| 150 ms + 20 ms jitter + 2% HOL loss | 1–5 | 116, 114, 118, 114, 119 | 116, 114, 118, 114, 119 | 5 pass |
| 150 ms + 20 ms jitter + 2% HOL loss | 6–10 | 114, 116, 125, 116, 124 | 114, 116, 126, 116, 124 | pass, pass, **fail**, pass, pass |
| 0 ms | single full-matrix run | 123 | 123 | pass |
| 100 ms | single full-matrix run | 118 | 119 | **fail** |
| 200 ms | single full-matrix run | 123 | 124 | **fail** |
| 150 ms + 2% HOL loss | single full-matrix run | 110 | 110 | pass |
| 150 ms + 20 ms jitter + 2% HOL loss | single full-matrix run | 115 | 115 | pass |

The full-matrix run produced 3 passes and 2 failures. Its 100 ms failure had client tag `(118,0)` and a server tick-129 queue `[118,119,120,121]`: the server consumed `[118,119]`, applied 119 with the merged Fire edge, and emitted `(119,0)` with a ready pre-step timer. Its 200 ms failure had client tag `(123,0)` and a tick-141 queue `[123,124,125,126]`: the server consumed `[123,124]`, applied 124 with the merged edge, and emitted `(124,0)` with a ready pre-step timer. Thus a four-frame backlog can occur without injected loss. After removing the temporary trace code and rebuilding the server, three more complete matrix repetitions against that production server produced:

| Network condition | Client → server first-spawn sequences | AT-NET-09 |
|---|---|---|
| 0 ms | 104→104, 124→124, 108→108 | 3 pass |
| 100 ms | 127→128, 115→115, 123→124 | **2 fail**, 1 pass |
| 200 ms | 121→121, 120→120, 127→128 | **1 fail**, 2 pass |
| 150 ms + 2% HOL loss | 122→122, 125→126, 126→126 | **1 fail**, 2 pass |
| 150 ms + 20 ms jitter + 2% HOL loss | 115→115, 117→117, 117→117 | 3 pass |

Overall: 11 passed and 4 failed in the uninstrumented 15-run matrix. The dedicated ten-run jitter series also reproduced a failure, so its three later passes do not establish acceptance. No failed run is counted as a pass.

## Protocol version 3 follow-up

D-072 carries ordered, unacknowledged client shot sequences in subsequent redundant input frames. When catch-up applies frame 118 after consuming `[117,118]`, the frame's pending intent 117 supplies the accepted projectile tag; the queue marks it resolved only after an authoritative spawn. The deterministic test verifies exact `(117,0)` agreement and duplicate suppression. An uninstrumented real-server 15-run matrix produced:

| Network condition | Client → server first-spawn sequences | AT-NET-09 |
|---|---|---|
| 0 ms | 123→123, 107→107, 98→98 | 3 pass |
| 100 ms | 116→116, 124→124, 118→118 | 3 pass |
| 200 ms | 124→124, 113→113, 91→91 | 3 pass |
| 150 ms + 2% HOL loss | 99→99, 115→115, 119→119 | 3 pass |
| 150 ms + 20 ms jitter + 2% HOL loss | 121→121, 112→112, 112→112 | 3 pass |

In those three loss cases, frame N had no intent before prediction, while frames N+1 through N+3 carried intent N in the client trace. All 15 runs drew the local shot on the next rendered frame, preserved visual id and position on exact server-id linking, and reported no page errors. A separate five-repeat run of each stress condition passed 10/10: loss sequences 112, 117, 125, 119, 125 and jitter/loss sequences 112, 126, 120, 114, 114, each confirmed under the same sequence. The test server was stopped after these runs. These measurements support AT-NET-09 for the approved version 3 behavior; they do not relabel the version 2 failures as passes.
