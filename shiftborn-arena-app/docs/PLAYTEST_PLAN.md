# PLAYTEST_PLAN.md

> **LLM FILE CONTRACT:** Authoritative test operations and measurement plan for H1 to H14. Do not change hypotheses or pass rules; follow the named round, method, metric and report format.

What players will test, what we measure, how we measure it, and how the results change the design before the Approval Gate.

Related: `docs/PROTOTYPE_SCOPE.md` §5 (hypotheses H1 to H14), §8 (Approval Gate); `docs/ARCHITECTURE.md` §9 (telemetry); `docs/ACCEPTANCE_TESTS.md` §22.

---

## 1. Goals

1. Measure every hypothesis H1 to H14 with enough players to trust the result.
2. Decide the launch mode (Frenzy or Zone Frenzy, D-017).
3. Find the top problems that make the game less fun, readable or responsive, and fix the cheap ones between rounds.
4. Produce the prototype report for Hamza's decision (section 8).

---

## 2. Methods per hypothesis

| Id | Hypothesis | Method | Source |
|---|---|---|---|
| H1 | Players morph 4 to 8 times per match | Telemetry | `morph` events |
| H2 | 70% use 2 or more forms | Telemetry | `damage` events by attacker form |
| H3 | Each form deals 20% to 45% of damage | Telemetry | `damage` events |
| H4 | Each form holds 15% to 50% of time alive | Telemetry | `match_end` per-player time by form |
| H5 | 70% learn the triangle from play | Survey Q6 | Survey |
| H6 | 80% can say what killed them | Survey Q7 checked against their last logged death | Survey + `death` events (tester code) |
| H7 | Zone points are 30% to 60% of the top human's score | Telemetry | `match_end` |
| H8 | Zone Frenzy is at least as fun | Survey Q8, Q9; free-play continuation per mode | Survey + sessions |
| H9 | Keyboard hit rate within 10% of mouse | Fairness protocol (section 4.4) | `damage` and shot counts by `aimSource` |
| H10 | 80% rate controls responsive | Survey Q3, testers with median RTT under 150 ms | Survey + `client_stats` |
| H11 | Under 1 correction over 0.5 m per player-minute | Telemetry | `client_stats.corrections` |
| H12 | 60% choose to play 2 or more matches | Free-play continuation and open-link sessions (section 5) | Sessions |
| H13 | Median fun 4 of 5 or higher | Survey Q2 | Survey |
| H14 | 99% crash-free sessions; server tick under 4 ms | Telemetry | `client_stats.errors`, room errors, tick timer |

---

## 3. Rounds

| Round | Build | When | Who | Size | Purpose |
|---|---|---|---|---|---|
| R0 | Stage A (First Playable) | End of Stage A | Team plus up to 5 invited people | 3 sessions, 4 to 8 humans each | **Fun Gate** (`docs/PROTOTYPE_SCOPE.md` §5.1) |
| R1 | Stage B (Playtest Build) | Stage B complete | Friendly outsiders: friends, colleagues, contacts who did not see the game | 8 to 12 testers | Shake out bugs and confusion; first H metrics |
| R2 | Stage B plus R1 fixes | About 1 week after R1 | External players | 20 or more testers, including at least 5 keyboard-only | Main measurement for the Approval Gate |
| R3 (only if needed) | R2 plus fixes | About 1 week after R2 | New testers plus 5 from R2 | 10 or more | Re-test failed hypotheses after an "Iterate" decision |

### 3.1 R0: Fun Gate sessions

- Three sessions of 30 to 45 minutes, on a local or deployed build, Frenzy only, bots at Normal.
- At least half the players in each session have not played earlier builds.
- No explanation beyond the controls card. Do not explain which form beats which.
- After the third match, ask each player: "Which form beats which?" and note the answer.
- Run `pnpm analyze` on the session logs. Pass or fail per `docs/PROTOTYPE_SCOPE.md` §5.1.

### 3.2 R1

- Two or three group sessions (section 4.1) plus open-link play for a few days.
- Fix blockers and the top three annoyances before R2. Change at most three balance values (section 7.2).

### 3.3 R2

- Four to six group sessions plus open-link play for one week.
- The fairness protocol (section 4.4) with the keyboard-only cohort.
- This round's data is the basis of the prototype report.

---

## 4. Session formats

### 4.1 Group session (60 minutes, 4 to 8 testers, remote or in person)

| Time | Step |
|---|---|
| 0:00 | Welcome, consent (section 9), tester code check (shown in the in-game menu). Say: "We are testing an early prototype. Play naturally. We cannot answer gameplay questions during play." |
| 0:05 | Everyone opens the code room link (`?room=CODE&tag=R2`). Host sets the first mode (section 4.3). |
| 0:07 | Block 1: 3 matches of mode A |
| 0:20 | Block 1 mini-survey (Q9 for that mode only, 30 seconds) |
| 0:22 | Block 2: 3 matches of mode B |
| 0:35 | Block 2 mini-survey |
| 0:37 | **Free play:** "You are free to stop now, or keep playing as long as you like." Record who starts another match (H12). |
| 0:45 | Full survey (section 6) |
| 0:50 | Open discussion: best moment, most confusing moment, anything that felt unfair |
| 1:00 | End |

Facilitator duties in section 10.

### 4.2 Open-link play

- Share the quick-play link (`?tag=R2open`) in the recruitment channels with a one-line description. Players play as long as they like. The survey prompt appears after the third match (B11).
- Quick play alternates Frenzy and Zone Frenzy per match (`QUICKPLAY_MODE=alternate`).

### 4.3 Counterbalancing

- Half the group sessions play Frenzy first, half Zone Frenzy first, so mode order does not bias H8.

### 4.4 Keyboard fairness protocol (H9)

Run internally (team) and with the R2 keyboard-only cohort, on a build with `DEV_CHEATS=1` (internal server, never the public playtest server):

1. Code room, bots set to dummy mode: `/dummies on 8.5` (BOT_SPEC §11). Every tester plays as a Runner (Pulse Pistol) for 3 minutes per scheme.
2. Each tester does 3 minutes with mouse aiming and 3 minutes keyboard-only with lock-on, order alternated between testers.
3. Repeat with the Turret (Rail Repeater) for 2 minutes per scheme.
4. Hit rate per scheme = hits / shots, from the match log (`aimSource` on shots and damage).
5. Relative difference = |keyboard − mouse| / mouse. Pass if 10% or less for the group average per weapon.
6. If it fails, change `softLock.leadFactor` by 0.1 in the direction that closes the gap and repeat with the same testers. Record each value tried.

Also report hit rates by scheme from normal R2 matches (informational, uncontrolled).

### 4.5 Network conditions

- Record each tester's median RTT from `client_stats`. Testers above 150 ms are reported separately for H10 and H11.
- One internal session per round plays with `?lag=150&loss=2` on purpose to confirm H11 under stress.

---

## 5. Metric definitions (`tools/analyze`)

Inputs: a folder of match logs. Output: `report.md` with a table per hypothesis, and CSV files per metric. All gameplay metrics count **humans only** and only time a human controlled their own seat (`controller = human`).

| Term | Definition |
|---|---|
| Participation | One human in one match, with at least 90 s of PLAYING time under human control |
| Completed participation | A participation where the human was in the match at `match_end` |
| Session | One continuous connection including reconnects (ARCHITECTURE §9.4) |
| Free-play continuation | In a group session, the tester started at least one match after being told they could stop |

| Metric | Formula | Pass |
|---|---|---|
| H1 morphs per match | mean over completed participations of the number of `morph` events (all directions) | 4 to 8 |
| H2 multi-form use | share of completed participations with damage dealt in 2 or more attacker forms | 70% or more |
| H3 damage share by form | human damage by attacker form / all human damage | each 20% to 45% |
| H4 time share by form | human alive ticks by form / all human alive ticks | each 15% to 50% |
| H7 zone share | median over Zone Frenzy matches of (zone points / total points) for the top-scoring human | 30% to 60% |
| H8 second-match rate per mode | open-link sessions whose first match was mode M and that played a second match / all open-link sessions starting with M | Zone Frenzy equal or better |
| H9 hit rate by scheme | hits / shots per `aimSource` group in the fairness protocol | relative difference 10% or less |
| H11 corrections | sum of corrections / human-controlled minutes, from `client_stats` | under 1 |
| H12 continuation | (group free-play continuations + open-link sessions with 2 or more consecutive matches) / (group testers + open-link sessions) | 60% or more |
| H14 crash-free | sessions with no client error and no room error / all sessions | 99% or more |
| H14 tick time | mean and p99 server tick time across all rooms | under 4 ms mean, under 8 ms p99 |

Also reported (no threshold): KOs per minute, time to first KO, average life length per form, ability use and hit rates, Flux spent per match, shards collected, deaths by cause, kill share by matchup (who kills whom by form), median RTT and FPS by browser.

Sample size: report `n` for every metric. A hypothesis with fewer than 15 completed human participations (or fewer than 15 survey answers) is marked "insufficient data", not pass or fail.

---

## 6. Survey

Tool: Google Forms by default (OQ-007). The in-game link pre-fills the tester code: `...?entry.<id>=<testerCode>`. Takes about 2 minutes.

| # | Question | Answers |
|---|---|---|
| Q1 | Tester code | Pre-filled, editable |
| Q2 | How fun was the game overall? | 1 Not fun at all … 5 Very fun |
| Q3 | How responsive did the controls feel? | 1 Very laggy or unresponsive … 5 Very responsive |
| Q4 | Which controls did you mostly use? | Mouse and keyboard; Keyboard only; Both |
| Q5 | (If keyboard only or both) How easy was aiming with the keyboard? | 1 Very hard … 5 Very easy |
| Q6 | Which form is strongest against which? (one answer per row) | Runner is strongest against: Beast / Turret / Not sure. Beast is strongest against: Runner / Turret / Not sure. Turret is strongest against: Runner / Beast / Not sure |
| Q7 | Think about the last time you were knocked out. What form was the player who knocked you out? | Runner; Beast; Turret; I don't know |
| Q8 | Which mode did you prefer? | Frenzy (most KOs); Zone Frenzy (KOs plus holding the zone); No preference; I only played one |
| Q9 | How fun was each mode? | Frenzy 1 to 5; Zone Frenzy 1 to 5 (also asked in the block mini-surveys) |
| Q10 | How often did you change form in a match? | Never; 1 or 2 times; 3 to 5 times; 6 or more |
| Q11 | Would you play this again? | Definitely; Probably; Not sure; Probably not; Definitely not |
| Q12 | What was the best moment? | Short text |
| Q13 | What was the most confusing or annoying thing? | Short text |
| Q14 | Which games like this do you play? | Smash Karts; Brawl Stars; .io games; Krunker; Shell Shockers; Other; None |

Scoring: H5 counts a tester as correct only if all three rows of Q6 are right (Runner→Turret, Beast→Runner, Turret→Beast). H6 counts Q7 as correct if it matches the killer's form in the tester's last logged death.

---

## 7. How feedback changes the design

### 7.1 Levers

| Signal | Threshold | First lever | Second lever |
|---|---|---|---|
| Too few morphs (H1) | under 4 | `morph.costBeast` and `costTurret` 35 → 30 | `flux.regenPerS` 1 → 1.5 |
| Mindless flipping | over 8 morphs and players say "I just spam forms" | `morph.cooldownS` 3 → 4 | cost up 5 |
| A form deals too much damage (H3) | over 45% | Its weapon DPS −10% | Its ability damage −15% |
| A form deals too little (H3) | under 20% | Its weapon DPS +10% | Its ability cooldown −1 s |
| "Beast deletes Runners" | complaints in 3 or more surveys | `scatterCannon.damagePerPellet` 5 → 4.5 | `fullDamageRangeM` 4 → 3 |
| Turret camping | complaints or Turret over 50% of time | `forms.turret.turnRateDegPerS` 120 → 100 | `railRepeater.heatMaxS` 7 → 6 |
| Triangle not learned (H5) | under 70% | Bigger EFFECTIVE and RESISTED feedback (size, sound) | Proposal to add contextual hints (needs a decision, D-024) |
| Readability (H6) | under 80% | Stronger silhouettes and damage direction | Kill feed and death recap clarity |
| Zone too weak (H7) | under 30% | `zoneFrenzy.pointsPerS` 1 → 1.5 | `koPoints` 5 → 4 |
| Zone too strong (H7) | over 60% | `pointsPerS` 1 → 0.75 | `koPoints` 5 → 6 |
| Keyboard unfair (H9) | difference over 10% | `softLock.leadFactor` ±0.1 | `softLock.acquireConeDeg` ±10 |
| Corrections (H11) | 1 or more | Fix mismatches between `predictStep` and the server step | Raise `net.smoothErrorM` to 0.75 (needs a decision) |
| Long sightlines complaints | 3 or more mentions | Add a cover piece per MAP_SPEC §14 | Move a wall block |
| Low fun (H13) | median under 4 | Group the Q12 and Q13 answers; fix the top three annoyances | Discuss with Hamza before R3 |

### 7.2 Change control

- Change at most three values between rounds, so effects can be attributed.
- Every change: bump `BALANCE.version`, add a row to `docs/BALANCE.md` §10, add a provisional decision in `DECISIONS.md` if it is outside the tuning range, and note it in the next round's report.
- Never change the rules of a hypothesis's measurement between rounds.

---

## 8. Prototype report template

Saved as `docs/reports/PROTOTYPE_REPORT.md` at task T-150.

```text
# Shiftborn Arena prototype report
Date, builds tested (build ids), balance versions, rounds run, tester counts

## Recommendation
Approve / Iterate / Stop, in one paragraph. Suggested launch mode (H8).

## Hypotheses
| Id | Metric | Value | Threshold | n | Result (pass, fail, insufficient) |
(H1 to H14)

## What players said
Top 5 best moments; top 5 problems (with counts)

## Changes made between rounds
| Round | Change | Reason | Effect |

## Technical health
Crash-free rate, tick times, bandwidth, FPS by device, known issues by severity

## Production re-plan
Real velocity from the prototype, updated estimate for production M2 to M4

## Attachments
analyze output, survey export, match video, build link
```

---

## 9. Recruitment, consent and privacy

- **Who:** adults (18 or older) by default; testing with players aged 13 to 17 needs guardian consent and a decision (OQ-006). Mix: at least 5 keyboard-only testers, at least 10 who play .io or kart battle games, at least 5 who rarely play shooters.
- **Where:** friends and colleagues (R1); browser game communities, Discord servers for web games, university gaming groups, and players of similar games (R2), following each community's rules on posting.
- **Location:** testers should be within about 150 ms of the playtest server (OQ-002 picks the region accordingly).
- **Consent text** (shown before a group session and on the survey's first page): "This is a prototype test. We record anonymous gameplay data (your chosen display name, a random tester code, your actions in matches, frame rate and connection speed) to improve the game. We do not record your IP address in game logs. Survey answers are linked to your tester code only. You can stop at any time."
- **Data:** keep match logs and survey exports for 90 days after the Approval Gate, then delete or aggregate. Scheduling contacts (emails) are kept separately and never in game logs.
- **Thanks:** a thank-you message and credit in the game's eventual credits list if testers want it (OQ-008 for any rewards).

---

## 10. Facilitator checklist

Before:
- [ ] Deployed build passes `docs/ACCEPTANCE_TESTS.md` §22.
- [ ] Code room created; link with `tag` ready; survey link tested with tester-code pre-fill.
- [ ] Recording ready (for the report video; ask permission).

During:
- [ ] Do not explain the counter triangle or give tactical advice.
- [ ] Help only with technical problems or if a tester is stuck for over a minute; note it.
- [ ] Observation sheet per tester: time to first morph, first ability use, moments of confusion (what and when), remarks out loud, rage-quits, which form they gravitate to.

After:
- [ ] Survey completed by every tester.
- [ ] Logs copied from the server (`MATCH_LOG_DIR`) into the round folder.
- [ ] Run `pnpm analyze`; file the notes with the round's data.
- [ ] Add issues found to the tracker with severity.

---

## 11. Schedule (relative to the start of the prototype)

| Week | Activity |
|---|---|
| 4 to 5 | R0 Fun Gate sessions; fixes |
| 6 to 7 | Stage B build; deployment; R1 |
| 8 | R1 fixes; R2 group sessions and open-link week; fairness protocol |
| 9 | Analysis, report, Approval Gate meeting with Hamza |
| 10 (if Iterate) | R3 and a second report |
