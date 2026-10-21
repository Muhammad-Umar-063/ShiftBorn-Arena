# OPEN_QUESTIONS.md

> **LLM FILE CONTRACT:** Unresolved choices only. An entry here is a blocker or proposal, never a rule and never approval. Read only entries relevant to the active task.

Unresolved decisions. Codex (or any agent or engineer) writes a question here instead of silently inventing a gameplay rule, a number, or a product choice.

## How to use this file

1. **When to add a question:** a spec is missing, ambiguous or contradictory; a rule would need a number that is not in `docs/BALANCE.md`; a task needs a product or business choice; or a decision in `DECISIONS.md` seems wrong after testing.
2. **Format:** copy the template below, use the next free id, fill every field, and reference it from the affected task (`BLOCKED (OQ-xxx)` if the task cannot continue).
3. **Do not guess:** report the blocker. Take the next unblocked task only when the active request covers queue progression.
4. **Answering:** only Hamza answers. When answered, write the answer here, set status to `Answered → D-xxx`, and add the decision to `DECISIONS.md`. Then unblock the tasks.
5. **Never** treat a recommendation here as approved.

### Template

```text
### OQ-xxx Short question
- Asked: YYYY-MM-DD by <agent or name>, while working on <task id>
- Question:
- Context: (what the docs say, what is missing, why it matters)
- Options: A) ... B) ... C) ...
- Recommendation: (and why)
- Blocks: (task ids, or "nothing yet")
- Needed by: (task id or date)
- Status: Open
- Answer:
```

---

## Open

### OQ-001 Final game name
- Asked: 2026-10-14, doc pack
- Question: Is "Shiftborn Arena" the final name?
- Context: D-001. A trademark (USPTO, EUIPO), domain, CrazyGames search and web search check is needed before the production art pass. The prototype uses the working title.
- Options: A) Keep Shiftborn Arena after the check. B) Pick another name from a shortlist.
- Recommendation: Run the check during the prototype so the result is ready at the Approval Gate.
- Blocks: nothing in the prototype; production E-08 (art) and E-09 (portal listing).
- Needed by: T-150
- Status: Open
- Answer:

### OQ-002 Playtest server region
- Asked: 2026-10-14, doc pack
- Question: Where should the single playtest server run?
- Context: D-042. H10 and H11 need testers under about 150 ms round-trip time. The GDD lists Frankfurt, US East and Singapore for production. Testers' locations are not decided yet (OQ-013).
- Options: A) Frankfurt. B) Singapore. C) US East. D) Another region closest to most testers.
- Recommendation: Decide where most R1 and R2 testers are, then measure round-trip time from a few of their locations to two or three candidate VPS regions (a simple ping test) and pick the lowest median.
- Blocks: T-069, T-140
- Needed by: T-069
- Status: Open
- Answer:

### OQ-003 Playtest domain
- Asked: 2026-10-14, doc pack
- Question: Which domain or subdomain hosts the playtest build?
- Context: Caddy needs a domain for HTTPS and WSS (`docs/ARCHITECTURE.md` §12).
- Options: A) A subdomain of an existing company domain (for example `play.<company-domain>`). B) A new cheap domain for the game.
- Recommendation: A subdomain of an existing domain for the prototype; buy the game domain after OQ-001.
- Blocks: T-069 (can start with a temporary hostname), T-140
- Needed by: T-140
- Status: Open
- Answer:

### OQ-004 Health regeneration
- Asked: 2026-10-14, doc pack
- Question: Should health regenerate during a life?
- Context: The GDD does not mention regeneration. D-019 sets "no regeneration" provisionally. Without it, a damaged Runner stays fragile until death, which may push players to suicide-rush or to hide.
- Options: A) None (current). B) Out-of-combat regeneration: after 5 s without taking damage, regain 5% of max health per second. C) Regeneration only from shards.
- Recommendation: A for R0 and R1. If playtest notes show "I was stuck at low health with no way back" in 3 or more surveys, test B in R2 as one of the three allowed changes.
- Blocks: nothing
- Needed by: T-145
- Status: Open
- Answer:

### OQ-005 Repository visibility and license
- Asked: 2026-10-14, doc pack
- Question: Private repository with "All rights reserved", or another license?
- Context: The README needs a license line. Third-party asset licenses matter later (production art).
- Options: A) Private, all rights reserved. B) Other.
- Recommendation: A.
- Blocks: nothing
- Needed by: T-001
- Status: Open
- Answer:

### OQ-006 Testers aged 13 to 17
- Asked: 2026-10-14, doc pack
- Question: Should prototype playtests include players aged 13 to 17?
- Context: The production audience is 13 and older (D-003), but testing with minors needs guardian consent and extra care with data. `docs/PLAYTEST_PLAN.md` §9 defaults to adults only.
- Options: A) Adults only for the prototype. B) Include 13 to 17 with written guardian consent.
- Recommendation: A for the prototype; test with teens during production with a proper consent process.
- Blocks: nothing
- Needed by: T-144
- Status: Open
- Answer:

### OQ-007 Survey tool
- Asked: 2026-10-14, doc pack
- Question: Which survey tool?
- Context: The survey must accept a pre-filled tester code in the URL (`docs/PLAYTEST_PLAN.md` §6).
- Options: A) Google Forms. B) Tally. C) Typeform.
- Recommendation: A (free, supports pre-filled fields, easy export).
- Blocks: T-132 (needs the URL format), T-144
- Needed by: T-132
- Status: Open
- Answer:

### OQ-008 Tester rewards
- Asked: 2026-10-14, doc pack
- Question: Do testers get anything for playing?
- Context: R2 needs 20 or more outside testers. Small rewards raise turnout but add cost and admin.
- Options: A) Thanks and an optional name in the credits. B) A small gift card for completing a full session. C) A draw for one larger reward.
- Recommendation: A for R1; decide B or C for R2 if recruitment is slow.
- Blocks: nothing
- Needed by: T-144
- Status: Open
- Answer:

### OQ-009 Production art budget
- Asked: 2026-10-14, doc pack
- Question: What is the budget for a freelance 3D artist (3 riders plus 9 vehicle shells) and asset packs?
- Context: Production only (E-08). Needed for the production re-plan at the Approval Gate.
- Options: A) Set a ceiling now. B) Get two or three artist quotes during the prototype and decide at the Approval Gate.
- Recommendation: B.
- Blocks: nothing in the prototype
- Needed by: T-150
- Status: Open
- Answer:

### OQ-010 Server budget
- Asked: 2026-10-14, doc pack
- Question: What is the monthly server budget for the prototype and for production before ad revenue?
- Context: The prototype needs one VPS with 2 to 4 vCPU and 4 to 8 GB RAM (`docs/ARCHITECTURE.md` §12). Production needs three regions.
- Options: A) Set a monthly ceiling for each phase.
- Recommendation: Approve one prototype VPS now; set the production ceiling at the Approval Gate using the load test results (T-141).
- Blocks: T-069
- Needed by: T-069
- Status: Open
- Answer:

### OQ-011 Launch channel
- Asked: 2026-10-14, doc pack
- Question: Launch on CrazyGames only, or also on the own website at the same time?
- Context: Production only. The own website needs its own identity and privacy work (GDD Appendix C).
- Options: A) CrazyGames first, own site later. B) Both at launch.
- Recommendation: A.
- Blocks: nothing in the prototype
- Needed by: T-150
- Status: Open
- Answer:

### OQ-012 Team time
- Asked: 2026-10-14, doc pack
- Question: How does the 7 to 9 week prototype fit with the team's other work?
- Context: Estimates assume about 90 team hours per week (`docs/PROTOTYPE_SCOPE.md` §2.1).
- Options: A) Full team time. B) Part time, with a longer timeline.
- Recommendation: Decide before T-001 and re-estimate the timeline in `docs/PROTOTYPE_SCOPE.md` §2.1 if part time.
- Blocks: nothing
- Needed by: T-001
- Status: Open
- Answer:

### OQ-013 Playtest recruitment and facilitation
- Asked: 2026-10-14, doc pack
- Question: Who recruits testers and runs the sessions, and where are the testers?
- Context: `docs/PLAYTEST_PLAN.md` §3 and §9. Tester location also decides OQ-002.
- Options: A) One team member owns playtests for the whole prototype. B) Rotate.
- Recommendation: A, so sessions are run the same way every time.
- Blocks: T-144
- Needed by: T-144
- Status: Open
- Answer:

### OQ-018 Detailed FPP mouse-turn control
- Asked: 2026-10-21 by Codex, following D-065
- Question: What detailed mouse control rule should turn horizontal aim in FPP without pointer lock?
- Context: D-065 approves disabled FPP mouse aim for the current build. The camera and V switch remain, but mouse movement cannot turn the player in FPP. A future implementation needs an explicit browser-safe control rule and its acceptance tests.
- Options: A) Visible on-canvas cursor turning. B) Mouse deltas while over the canvas. C) Another fully specified rule.
- Recommendation: None until the control behavior is specified and approved.
- Blocks: Complete FPP mouse playability only; not T-034 or T-031.
- Needed by: Before FPP mouse aim is enabled
- Status: Open
- Answer:

---

## Answered

### OQ-021 Complete network restoration for prediction
- Asked: 2026-10-21 by Codex, during T-040
- Question: How should T-035 restore per-form weapon timers, input held/edge history and shot-index bookkeeping from a real authoritative patch?
- Context: The prior `PlayerState` Schema omitted `weapon[*].nextShotIn`, `lastButtonInputSeq`, `lastHeldButtons`, `lastShotInputSeq` and `nextShotIdx`. A complete in-memory `PlayerRecord` test did not establish live patch restoration. D-069 governs shot-index meaning.
- Options: A) Add these authoritative fields to a versioned protocol. B) Approve a deterministic reconstruction method and define its resync cases.
- Recommendation: A for weapon timers and edge history; include D-069 bookkeeping or approve an exact reconstruction method.
- Blocks: Resolved for T-035.
- Needed by: T-035.
- Status: Answered → D-071
- Answer: Option A approved on 2026-10-21. Add the required authoritative restoration fields to protocol version 2. See [D-071](DECISIONS.md#d-071-complete-local-prediction-restoration).

### OQ-015 Projectile shot index across repeated inputs
- Asked: 2026-10-20 by Codex, while working on T-016
- Question: How should `shotIdx` be allocated when one held input frame is reused across ticks, and when should its counter reset?
- Context: D-034 and NETWORK_PROTOCOL §5.3/§6.1 require `(inputSeq, shotIdx)` to match predicted and authoritative spawns. T-016 allocated indexes in firing order per sequence; Scatter pellets consumed consecutive indexes.
- Options: A) Per-sequence increasing index (current). B) A lifetime increasing index. C) Another protocol-defined allocation rule.
- Recommendation: A.
- Blocks: Resolved for T-040 and T-037.
- Needed by: T-037
- Status: Answered → D-069
- Answer: Option A approved on 2026-10-21. The same held sequence keeps increasing its index; a different accepted sequence starts at zero on its first shot. See [D-069](DECISIONS.md#d-069-projectile-shot-index-per-input-sequence).

### OQ-019 T-040 versus T-035 reconciliation ownership
- Asked: 2026-10-21 by Codex, during T-040
- Question: Does T-040 own only the shared `predictStep` state contract and equivalence tests, with browser reconciliation in T-035, or must T-040 also implement reconciliation as D-061 states?
- Context: D-061 assigned reconciliation to T-040 while `TASKS.md` assigned it to T-035.
- Options: A) T-040 shared sim and T-035 browser reconciliation. B) Keep D-061's T-040 ownership.
- Recommendation: A.
- Blocks: Resolved for T-040 and T-035 ownership.
- Needed by: T-040 signoff.
- Status: Answered → D-067
- Answer: Option A approved on 2026-10-21. D-067 supersedes only D-061's task assignment. See [D-067](DECISIONS.md#d-067-t-040-and-t-035-ownership).

### OQ-020 Prediction equivalence boundary
- Asked: 2026-10-21 by Codex, during T-040
- Question: May T-040 compare every predictable local field exactly with the same authoritative Flux, phase, cover and status inputs, and separately test stale-authority divergence?
- Context: Full `PlayerRecord` equality would require predicting server-owned outcomes contrary to D-036.
- Options: A) Conditional exact equality of predictable fields plus authority-boundary tests. B) Another testable criterion consistent with D-036.
- Recommendation: A.
- Blocks: Resolved for T-040 acceptance.
- Needed by: T-040 signoff.
- Status: Answered → D-068
- Answer: Option A approved on 2026-10-21. See [D-068](DECISIONS.md#d-068-t-040-prediction-equivalence-boundary).

### OQ-014 Simultaneous morph targets
- Asked: 2026-10-20 by Codex, while working on T-014
- Question: What should happen when two or three morph target buttons acquire a rising edge on the same tick?
- Context: GR-5.1 defines one target request, but gives no priority for simultaneous targets. T-014 isolates this case by selecting no target and emitting no morph event until a decision is approved.
- Options: A) Fixed form priority. B) Reject the ambiguous press. C) Use input bit order.
- Recommendation: B, because it does not select a form the player may not have intended.
- Blocks: Resolved for T-014 and T-034.
- Needed by: Before final input handling is shipped
- Status: Answered → D-064
- Answer: Option B approved on 2026-10-21. Distinct morph-target rising edges on one simulation tick are ignored; other input and timers continue. See [D-064](DECISIONS.md#d-064-ambiguous-morph-input-edges).

### OQ-016 T-031 netsim acceptance timing
- Asked: 2026-10-21 by Codex, while working on T-031
- Question: May T-031 be signed off after its production socket, clock, and Schema netsim checks pass, with the full playable portion of AT-NET-17 verified after rendering and input are implemented?
- Context: `TASKS.md` says T-031 is done when AT-NET-17 passes. `docs/ACCEPTANCE_TESTS.md` defines that manual test as the game staying playable at `?lag=150&loss=2` with no decode errors. The client currently has a connected shell and live tick readout, while rendering and gameplay input belong to T-032 and T-034. T-031 tests verify live Schema patches through seeded 2% holds, true server-tick clock accuracy, and a browser session without console errors, but cannot verify playability yet.
- Options: A) Accept T-031's network-layer evidence now and assign the full playable check to the first task with rendering and input. B) Keep T-031 blocked until the complete AT-NET-17 manual test can run.
- Recommendation: A, because it preserves the documented scope and task order while keeping the full manual requirement visible.
- Blocks: Resolved for staged T-031 signoff; full AT-NET-17 remains mandatory in T-068.
- Needed by: T-031
- Status: Answered → D-066
- Answer: Option A approved on 2026-10-21. T-031 may finish on verified production networking and AT-NET-19; attempt full AT-NET-17 after T-034 and complete remaining verification in T-068. See [D-066](DECISIONS.md#d-066-staged-t-031-acceptance).

### OQ-017 FPP mouse aim without pointer lock
- Asked: 2026-10-21 by Codex, while working on T-034
- Question: How should mouse movement change the player's horizontal aim in FPP when pointer lock is disallowed?
- Context: `docs/CONTROLS_UI.md` §3.1 specifies a cursor-to-ground ray for TPP. FPP looks horizontally from eye height, so the TPP ground intersection cannot supply a useful aim direction. §2.5 forbids pointer lock. The FPP camera and V switch remain available. The user chose option C for the current build; a detailed rule is still needed before enabling FPP mouse turning.
- Options: A) Use a visible on-canvas cursor position to set a turning direction. B) Use mouse movement deltas while the cursor is over the canvas. C) Keep FPP mouse aim disabled until a detailed rule is approved.
- Recommendation: None pending a detailed FPP control rule.
- Blocks: T-034 resolved for interim behavior; future FPP mouse playability is OQ-018.
- Needed by: T-034 interim behavior
- Status: Answered → D-065
- Answer: Option C approved on 2026-10-21. FPP mouse movement does not change aim; show the system cursor and hide the aiming reticle without pointer lock. The detailed follow-up is OQ-018. See [D-065](DECISIONS.md#d-065-interim-fpp-mouse-controls).
