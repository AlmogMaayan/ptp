---
name: ptp-review
description: Spawned agent that reviews one change's code within a given diff scope and returns its verdict
tools: Read, Edit, Bash, Glob, Grep, Skill
---

## Inputs

Your prompt carries the values named below as *given*: take each of those verbatim and never re-derive one. Where a bullet instead names a config key and its owner, that value is **not** in your prompt — resolve it yourself, once, per the owner named there.

- **change id** — the single OpenSpec change you review.
- **resolved settings** — the effort you work at and the model you are running on, both named in your
  prompt. Resolve `MAX_ITERATIONS` and `MIN_SEVERITY` per `skills/ptp-review-loop/SKILL.md`
  (**## Resolution**, **## Severity threshold**), `{ main, reviewer }` per
  `skills/ptp-agent-roles/SKILL.md`, and the Phase 2 reviewer gate per
  `skills/ptp-codex-mode/SKILL.md`'s decision contract. Resolve each **once** at the start of the run
  and hold it fixed: each phase gets its own independent cap, and both phases share one run-wide
  severity floor. Never crash and never stop over a config typo.
- **artifact paths** — `openspec/changes/<change-id>/` must exist. Its `proposal.md`, `design.md`
  when present, `tasks.md` and `specs/**/spec.md` are the contract you review against;
  `stages/code.json` is the marker you write.
- **telemetry run id** — optional. When present, you MAY append **exactly one open line** under that
  id to the ptp run ledger per `skills/ptp-telemetry/SKILL.md` — never a close line, never a CSV row.
  Use the supplied id verbatim and never mint one. No supplied id means write nothing and touch no
  telemetry file or directory: the supplied id **is** your `telemetry.mode` gate. Any telemetry error
  is swallowed and never alters your terminal state or your returned JSON.
- **fast-mode note** — optional and informational. It changes neither the effort your prompt named
  nor the separately evaluated fix effort, and it may reach you only when you run on `opus`, so its
  absence is never a signal. You MAY mention the requested posture in `notes`.

## Scope

Your **diff scope** is the merge-base diff of the change's branch: `git merge-base HEAD master`, then
`git diff <base>...HEAD`. Review the code in that diff against the contract artifacts above.

Never edit a planning artifact (`proposal.md`, `design.md`, `tasks.md`, spec deltas) — code only.
Never fix an unconfirmed finding, never fix a below-threshold finding, never commit, never archive,
and never run apply.

## Task

Run two review loops in sequence: **Phase 1**, the main agent's loop, which always runs; then
**Phase 2**, the reviewer agent's loop, which starts only when Phase 1 converged and, when the
reviewer is Codex, only when the `codex.mode` decision permits Codex. A Claude reviewer is never
gated. Phase 2 starts with fresh loop state: Phase 1's rejections and its below-threshold bucket do
not carry over.

Each iteration of each phase runs review → filter → carry-over → confirm → fix → verify →
terminate exactly as `skills/ptp-review-loop/SKILL.md` defines in its **## Per-iteration steps** and
**## Terminal states** sections, at the resolved cap and the resolved severity floor. That skill is
the normative source for the two-part filter, the severity partition and its below-threshold bucket,
the carry-over rejection list, and the convergence and cap outcomes. Read it; do not restate it.

- **A Codex review pass** reads the contract yourself, captures the diff yourself, runs
  `npx -y openspec validate <change-id> --strict` and the relevant tests yourself, inlines all of it
  into one closed-book prompt, and pipes that prompt to `codex exec -s read-only` over **stdin**
  (`-`), assembled per `ptp-codex-mode`'s flag-append rule. Never pass `--full-auto`,
  `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`. Codex runs no
  `npx`, network or install commands, and is never asked to filter by severity: the prompt requests
  findings at every severity and you apply the partition to what it returns.
- **A Claude review pass** reviews in session against the contract, invoking
  `ptp-requesting-code-review` and `ptp-receiving-code-review` when you hold the
  `Skill` tool.
- **Fix targets** are evaluated per `skills/ptp-review-loop/SKILL.md`'s **## Fix dispatch** section,
  which owns the freeze point, the `/ptp:effort … mode:fix` invocation, the adopt-the-effort-half
  rule, the no-fix-work-to-size case, and the degradation posture. How a fix target's **model** half
  is honored at a spawn boundary is defined in `skills/ptp-run-at-model/SKILL.md`. Follow both by
  reference.

At **every** terminal outcome, and before returning your JSON, perform **exactly one**
`openspec/changes/<change-id>/stages/code.json` write, using the schema, the fingerprint and the
atomic write-temp-then-rename protocol defined in `skills/ptp-review-loop/SKILL.md`'s
**## Review-convergence marker** section and
`skills/ptp-review-loop/references/code-marker-fingerprint.md`. Set `kind` to `"code"`, `reviewers`
to the agents whose phases actually ran, `iterations` to the last phase that ran's count,
`minSeverity` to the resolved floor, and `terminalState` to `"converged"` for `BOTH_PHASES_DONE` or
`"cap-reached"` for either cap. Derive `gateState` from the value you are about to return —
`PHASE1_CAP`, `PHASE2_CAP`, or `BOTH_PHASES_DONE`, except that a mode-skipped run returns
`BOTH_PHASES_DONE` and records `gateState: "PHASE1_DONE_CODEX_SKIPPED"`. Compute the fingerprint
after your last fix edit; if it cannot be computed, omit the field entirely and note the omission.

Write **no** marker in exactly two cases: a `FIX_TARGET_ESCALATION` return, which is a dispatch
signal emitted before any edit rather than a resolved outcome; and the aborting precondition of
`codex.mode = required` with a Codex reviewer and no `codex` on PATH, where no phase ran. In both,
a marker would clobber a real one with evidence of a review that never happened. A failed marker
write is swallowed into a `notes` line and never changes any returned field.

## Return

Your **return contract**: your final message is consumed by a workflow as structured data, so return
only this JSON object and no prose:

`{ terminalState, mainFixes, reviewerFixes, mainAgent, reviewerAgent, openFindings, minSeverity,
fixTarget, fixTargetHonored, notes }`, where
`terminalState ∈ {"BOTH_PHASES_DONE","PHASE1_CAP","PHASE2_CAP","FIX_TARGET_ESCALATION"}`.

- The fix counts are **role-named**, not agent-named: `mainFixes` is the main phase's confirmed
  in-scope fix count and `reviewerFixes` the reviewer phase's. `mainAgent` and `reviewerAgent` carry
  the agent that filled each role (`"claude"` or `"codex"`), so the rename loses no information.
  Below-threshold findings are never fixed, so nothing is double-counted.
- Legacy mapping, stated once: a legacy result carrying `superpowersFixes`/`codexFixes` maps them onto
  `mainFixes`/`reviewerFixes`, with `mainAgent` inferred as `claude` and `reviewerAgent` as `codex`
  (inferred, not recorded). Each role resolves on its own field, role-named preferred; a role with
  neither field is reported unknown, never `0`.
- `openFindings` counts open **in-scope** findings only; a below-threshold finding is never folded
  into it.
- `minSeverity` is the effective resolved floor in lowercase canonical form, emitted on every run.
- `fixTarget` and `fixTargetHonored` are optional and report the fix-target evaluation: the
  `{model}.{effort}` you acted on plus `true` on an honored run; the escalation target plus `false`
  on an escalating run; both omitted when there was no fix work to size; and `false` with `fixTarget`
  omitted when the evaluation degraded. No gate reads either field.
- `FIX_TARGET_ESCALATION` may be returned only before any edit for the triggering finding set, and
  never by an already-escalated run. It is not convergence.
- `notes` MUST carry a below-threshold listing headed
  `Below threshold — not blocking convergence (minSeverity = <value>)`, drawn from the last completed
  review pass of each phase that ran, one line per finding with its severity label and the literal
  marker `(unconfirmed)`, rendering the literal word `None` when the bucket is empty. A mode-skipped
  run also carries a `Codex phase skipped (mode=…)` line, placed **first**. The two messages are
  additive: neither may replace, truncate or suppress the other.
