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

### OQ-014 Simultaneous morph targets
- Asked: 2026-10-20 by Codex, while working on T-014
- Question: What should happen when two or three morph target buttons acquire a rising edge on the same tick?
- Context: GR-5.1 defines one target request, but gives no priority for simultaneous targets. T-014 isolates this case by selecting no target and emitting no morph event until a decision is approved.
- Options: A) Fixed form priority. B) Reject the ambiguous press. C) Use input bit order.
- Recommendation: B, because it does not select a form the player may not have intended.
- Blocks: T-014 simultaneous-target behavior only; normal single-target morphing proceeds.
- Needed by: Before final input handling is shipped
- Status: Open
- Answer:

---

## Answered

(None yet. Answered questions move here with a link to their decision.)
