> Loaded from skills/ptp-review-loop/SKILL.md when: deciding whether an existing code marker permits skipping a review.
## Code-marker skip eligibility

A caller MAY skip an otherwise-mandatory `/ptp:review-full` for a change **only** when all six of the
following hold, evaluated **at the moment the review would have been invoked**:

1. `openspec/changes/<change-id>/stages/code.json` exists, is readable, parses as JSON, and its `kind`
   is exactly `"code"`.
2. Its `terminalState` is `"converged"`. A `"cap-reached"` marker NEVER authorizes a skip. `gateState` is
   reported but never *decides* **this condition**: a `"PHASE1_DONE_CODEX_SKIPPED"` marker **satisfies
   condition 2**, that state already being a green, gate-success terminal state under `ptp-codex-mode`.
   Whether its single reviewer is *enough* is not asked here — reviewer sufficiency is decided solely by
   **condition 6**.
3. It carries a **well-formed** `fingerprint` whose `version` and `algorithm` the reader
   **recognizes** — well-formed meaning the whole object this skill defines is present: `version`,
   `algorithm`, `value`, a `footprint` object carrying all three lists by name (`codeTracked`,
   `codeUntracked`, `contract` — **any of which may be empty**), and an `inputs` object carrying all six
   component entries by name (`baseBranch` and `mergeBase`, which are a branch name and a commit id
   rather than digests, plus `footprintDigest`, `trackedDigest`, `untrackedDigest`, and
   `contractDigest`). A fingerprint that is merely *partial* — most plausibly one carrying `value` but no
   `inputs`, or one carrying `inputs` but no `footprint`, which leaves the reader unable to recompute
   over the writer's path set — is **malformed**, and the *Fail-closed* rule below already makes a
   malformed fingerprint ineligible; this condition simply says where that test is applied. The check is
   cheap and it is what keeps condition 4's mismatch **attributable**: the reporting obligation names the
   component that changed, which is unanswerable without `inputs`.

   A reader implementing this skill recognizes `version: 2` **only**. `version: 1` — the superseded
   algorithm, whose `trackedDigest` and `untrackedDigest` were repo-wide — is therefore an
   **unrecognized version**, and the *Fail-closed* rule makes such a marker ineligible with **no error,
   refusal, or halt**: the review simply runs, exactly as it would without any marker. No v1 marker is
   migrated, rewritten, or recomputed.
4. The fingerprint **recomputed at check time**, per **## Code-marker fingerprint**, equals the recorded
   `value`. The recomputation uses the marker's **recorded** `footprint` as its path set — never one
   re-derived at check time — and enumerates the contract set **by rule**.
5. `rank(marker.minSeverity, an absent field read as "low") <= rank(the currently resolved
   review.minSeverity)` — a run that converged at a stricter floor proves the looser requirement; the
   converse does not hold.
6. The marker's `reviewers` set is **sufficient for the reviewer set a `/ptp:review-full` invoked at this
   moment would run**, per `ptp-codex-mode`'s decision contract **resolved at check time** — the
   **whole** contract, which means resolving `{ main, reviewer }` per `ptp-agent-roles` **first** and
   only then, **iff the resolved reviewer is Codex**, both halves of the mode gate: the layered
   `codex.mode` value **and**, under `auto`, the `codex` CLI-presence test it already specifies. That
   resolution is performed **when the marker is evaluated**, and is NEVER a role, mode, or CLI verdict
   cached from the marker's write, stamped into the marker, or inferred from it: every part of it can
   change between the write and this check, and it is the **current** requirement the skip must satisfy.
   Sufficiency is defined by the **number of phases** that contract yields, never by the mode string —
   and the mode string alone does not yield it, `ptp-codex-mode`'s *Composition rule* gating the
   reviewer phase **iff the reviewer is Codex**:

   - **Two phases** — the default `roles.main = claude` direction (reviewer = Codex) at
     `codex.mode = required`, and at `codex.mode = auto` with the `codex` CLI **present** on PATH;
     **and, unconditionally, the `roles.main = codex` direction**, where the reviewer is Claude, is
     **never** gated, and `codex.mode` is **not consulted for the reviewer gate at all** — so a review
     invoked now runs both phases there even at `codex.mode = off` or with `codex` absent from PATH.
     All of these require `reviewers` to contain **both** `"ptp"` and `"codex"`, the two phases
     a completed two-phase run always comprises in either `roles.main` direction (a marker carrying the
     legacy literal `"superpowers"` is read as `"ptp"`, so `["superpowers","codex"]` satisfies this too).
     **No** single-reviewer
     marker qualifies: neither the `["ptp"]` `"LOOP_DONE"` a standalone `/ptp:review-loop`
     writes, nor the `["codex"]` `"LOOP_DONE"` a standalone `/ptp:codex-review-loop` writes, nor a
     `"PHASE1_DONE_CODEX_SKIPPED"` marker written while the CLI was absent — a lone `"codex"` being no
     more sufficient than a lone `"ptp"`, what is required being **both phases** and not merely
     the Codex one.
   - **One phase** — reachable **only** in the `roles.main = claude` direction, where the reviewer is
     Codex and the mode gate therefore applies: `codex.mode = off`, and `codex.mode = auto` with the
     `codex` CLI **absent**, both of which make a single-reviewer terminal state the run's own green
     outcome — accepts a single-reviewer marker, preserving `"PHASE1_DONE_CODEX_SKIPPED"` eligibility in
     exactly that narrowed form. Reading `codex.mode = off` as one phase **without** first resolving the
     role would reopen, under `roles.main = codex`, precisely the gate-weakening this condition exists
     to close.

   **The role-resolution step above is a narrowing refinement of the `review-loop` capability's
   condition-6 wording, recorded here rather than left silent** — and, with the marker-directory
   exclusion carried by the capability **as change `0054_01` amends it**, the **only** such divergence
   left in this skill; **## Code-marker fingerprint** restates the capability rather than refining it.
   The condition-6 requirement enumerates the one-phase case as
   `codex.mode = off` and `auto`-with-`codex`-absent without qualifying the `roles.main` direction;
   taken literally it would admit a single-reviewer marker under `roles.main = codex`, where
   `ptp-codex-mode` never consults the mode for the reviewer gate and a review invoked now runs **both**
   phases regardless. The refinement only ever **narrows** eligibility, so it can weaken no gate. **The
   capability text should be amended to resolve the role first**; until it is, **this section is the
   operative predicate**.

   **`reviewers` is the load-bearing field; `gateState` stays reported-never-deciding.** "Only
   `BOTH_PHASES_DONE` qualifies under a two-phase mode" is therefore a **consequence** for the markers
   this skill's writers can produce, not a second test. A marker whose `gateState` and `reviewers`
   disagree is producible by no writer defined here; should one appear, `reviewers` decides.

**Fail-closed.** Any other outcome — absent, unreadable, malformed, wrong-`kind`, `cap-reached`,
fingerprint-less, unrecognized-version, mismatched, weaker-floor, or **reviewer-insufficient** for the
reviewer set a review invoked now would run — makes the marker **ineligible**,
and an ineligible marker causes the review to run **exactly as it does without this feature**.
Ineligibility is never an error, never a refusal, never a halt, and is never reported as a failure. The
worst outcome of any bug in this check is the status quo.

**Read-only.** Evaluating eligibility NEVER writes, repairs, overwrites, or deletes a marker. Producing a
marker is the reviewer's job, not the reader's.

**Reporting obligation.** A caller that skips a review on this basis MUST report the skip explicitly,
naming the marker's `timestamp`, `reviewers`, `gateState`, and `minSeverity`, and MUST NOT report a
review as having run in that invocation, nor flatten a `PHASE1_DONE_CODEX_SKIPPED` marker into a plain
both-phases run. A caller that finds an ineligible marker MUST name the reason it was ineligible
alongside the review that consequently ran — including **reviewer insufficiency for the reviewer set
resolved at check time** (naming the resolved `roles.main` direction and, where the mode gate applied,
the resolved `codex.mode`), when that is the failing condition.
