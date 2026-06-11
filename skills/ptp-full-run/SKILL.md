---
name: ptp-full-run
description: Workflow-backed sequential apply→review-full orchestration for /ptp:full-run. Resolves a change selector, reads each story's effort.md model, and launches the ptp-full-run workflow which runs apply (at the story's model, effort as a prompt directive) then review-full (opus.high) per story, one story fully before the next. Stops the whole run if a story's review fails to converge. Never commits, never archives.
---

# ptp-full-run — workflow-backed sequential apply→review orchestration

## Purpose

This skill is the orchestration contract behind the single `/ptp:full-run` command. The command is a thin wrapper that resolves a change selector, reads each story's `effort.md`, and launches the `ptp-full-run` workflow; the actual per-story `apply → review-full` loop lives in the workflow script `workflows/ptp-full-run.js` (launched by the named form `Workflow({ name: 'ptp-full-run' })`), which runs each story to completion before the next and halts the whole run if a story fails to converge. The former `effort_gate` / two-command (`full-run` vs `full-run-effort`) split is **gone**: a workflow apply agent carries its own model (read from the story's `effort.md` and passed in `args.stories`), so there is no interactive single-dial model/effort thrash to gate against — nothing to stop and suggest a `/model`+`/effort` switch for.

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| `change-ids` | change selector, list of change ids, or empty | Passed through from `$ARGUMENTS`. Resolved via `ptp-change-selector`: a `epic:XXXX` / `story:NN` selector is pre-resolved to its story id(s) before launch; explicit ids are used verbatim; empty → discover via `npx -y openspec list` (see ordering below). |

There is no `effort_gate` input. Per-story model/effort comes from each story's `effort.md`, read by the command before launch.

## Command → workflow handoff

The command is a thin wrapper that performs four steps, then hands off to the workflow. File I/O is impossible inside a workflow script, so the command does all reading and builds `args.stories` first.

1. **Resolve the selector** → an ordered list of story ids (see *Change discovery and ordering*).
2. **Read each story's effort.** For each id, `Read` `openspec/changes/<id>/effort.md` and parse line 1 as `{model}.{effort}`. If the file is missing or line 1 is not a parseable `{model}.{effort}`, default to `opus.high` and **note the defaulting** (never crash). This yields `{ id, model, effort }` per story.
3. **Precondition: resolve `codex.mode` (per the `ptp-codex-mode` skill).** The per-story review agents run `review-full`, whose Codex phase is governed by `codex.mode`. Apply the decision contract: under **`required`** run `codex --version`, and if it is missing → **STOP** with the install-or-change-mode message and **do not launch the workflow**; under **`auto`** or **`off`** **launch** the workflow — each story's `review-full` applies the per-story Codex skip itself (Superpowers-only, non-silent) and reports a mode-skipped review as gate-success, so the run does not halt. The full resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.
4. **Launch the workflow:**
   ```
   Workflow({ name: 'ptp-full-run', args: { stories } })
   ```
   where `stories = [{ id, model, effort }, …]` in apply order. (Use the named form — the plugin ships `workflows/ptp-full-run.js` whose `meta.name` is `ptp-full-run`. There is no project-relative `scriptPath` under a global plugin install.) The workflow loops the stories in order, spawning `agentType:'ptp:ptp-apply'` at the story's `model` (effort injected as a prompt directive) then `agentType:'ptp:ptp-review'` at `opus`, and returns `{ results, halted, total }`.

## Change discovery and ordering

- **Explicit `change-ids`** → use that list **verbatim, in the given order** (the user is asserting the dependency order). Skip discovery entirely.
- **Selector input** (the argument starts with `epic:` or `story:`) → pre-resolve the whole string via `ptp-change-selector`: `epic:XXXX` → all that epic's active stories in ascending story order; `epic:XXXX story:NN` / unambiguous `story:NN` → the single resolved change. Treat the resolved id(s) as an explicit id list (no discovery, no scope confirmation).
- **Empty `change-ids`** → discover:
  1. Run `npx -y openspec list` to enumerate active changes.
  2. Order by epic then story (`XXXX_NN_`) ascending; append any legacy/unprefixed ids after in `openspec list` order.
  3. If the list is empty → **STOP**: "no active changes to run."
  4. **One-time scope confirmation — no-arg path only.** Print the full resolved ordered id list and **STOP before any apply**, so the user confirms they really mean *every* active change. The active set may include changes unrelated to the current work or not yet plan-reviewed (no `tasks.md`, still being planned). The user re-invokes — with the confirmed set or an explicit id subset — to proceed.

This scope-confirmation stop fires **only** when discovery happened (no ids were passed). An invocation that passed explicit ids or a selector skips it — the user already asserted the scope. It is a **one-time gate at the start of the run**, before the workflow launches.

## Sequencing

One story is fully processed (`apply → review-full`) before the next begins — never interleaved. The **workflow script enforces this**: it loops `args.stories` in order, runs the apply agent to its `APPLY_SCHEMA` result, and only then runs the review agent. The review convergence gate is the workflow's `halted`: if a story's apply does not reach `stageReached === 'completed'`, or its review `terminalState !== 'BOTH_PHASES_DONE'`, the workflow stops the loop and returns `halted` set to that story. A non-converged review therefore halts the **whole run**, not just the story — applying the next story on top of an unreviewed one compounds risk.

**Mode-skip is gate-success (per `ptp-codex-mode`).** When a story's `review-full` converges its Superpowers phase and skips the Codex phase because `codex.mode` resolved to `off` (or `auto` with `codex` absent), that is the mode-skip terminal state `PHASE 1 DONE — CODEX SKIPPED (mode=…)` — a **converged**, gate-success outcome, not a halt. So `workflows/ptp-full-run.js` needs no logic change, the `ptp-review` agent reports a mode-skipped review with `terminalState === 'BOTH_PHASES_DONE'` (the human-facing report still names the skip); the existing `terminalState === 'BOTH_PHASES_DONE'` gate then continues to the next story. The run halts only on a genuinely non-converged review (an iteration cap), never on a legitimate mode-skip.

## Terminal report

After the workflow returns `{ results, halted, total }`, the command renders a report derived from that result.

1. **Three buckets** (derived from `results` + `halted`):
   - `processed` — stories whose review reached `BOTH_PHASES_DONE`.
   - `applied (review pending)` — the `halted` story when its apply succeeded but its review is missing/non-converged (apply ok, review not `BOTH_PHASES_DONE`).
   - `never-started` — stories after the halt point that the workflow never ran (the unprocessed tail), plus the `halted` story itself if its apply failed.
2. **Per-story outcome table** — id, model used (from `effort.md`), apply `stageReached`, review `terminalState` (`BOTH_PHASES_DONE` / `PHASE1_CAP` / `PHASE2_CAP` / not yet reviewed), and the `effort.md` recommendation read for that story. When a story's review was a mode-skip (the `ptp-review` agent returns `BOTH_PHASES_DONE` with a `Codex phase skipped (mode=…)` note), surface that `notes` line in the row so the skip is **never silent** at the run level — a mode-skipped story reads as converged *and* names the skipped Codex phase, not as a plain both-phases run.
3. **Resume command** for the unprocessed tail — `/ptp:full-run <ids…>` listing the `never-started` ids (and the `applied (review pending)` story handled per the Resume hint below).
4. **`/ptp:archive <id>` per fully-processed story** — recommend to the user for each `processed` story; **never auto-run**.

## Resume

The workflow's run journal is the **primary resume mechanism**. Re-launch the same workflow with `resumeFromRunId`:

```
Workflow({ name: 'ptp-full-run', resumeFromRunId: '<id>', args })
```

The three-bucket terminal report is the **context-loss recovery contract** for when the run journal is unavailable (new session, journal lost). Context-loss hint:

- Resume an `applied (review pending)` story by running **`/ptp:review-full <id>` directly** (its review runs at `opus.high`) — *not* `/ptp:full-run`, which would re-apply.
- Reserve `/ptp:full-run <ids…>` for the `never-started` tail.

## Hard rules

- **Branch safety, once up front.** The `/ptp:full-run` command runs the `ptp-branch-guard` preamble before launching the workflow: if HEAD is `master`, it cuts a feature branch (`ptp/epic-XXXX`) via the `ptp-branch-prep` workflow so the `ptp-apply` agents never write onto master; if already on a feature branch, no-op. Defined once in the `ptp-branch-guard` skill.
- **Never auto-archive** any story. Archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made by the apply or review agents.
- **Never invoke `/ptp:plan` or `/ptp:plan-multiple`.** This skill orchestrates apply and review only; planning is out of scope.
- **Apply fully precedes review for a story, and a story fully precedes the next.** The workflow enforces this ordering.
- **The review convergence gate halts the whole run.** A story whose review is not gate-success sets the workflow's `halted` and stops the loop; do not silently continue to the next story. A mode-skipped review (Superpowers converged, Codex skipped by `codex.mode`) is **gate-success** — the `ptp-review` agent reports it as `terminalState === 'BOTH_PHASES_DONE'` (per `ptp-codex-mode`), so the run continues to the next story rather than halting.
- **Codex per `codex.mode`** (see the `ptp-codex-mode` skill). The command resolves the mode before launching; only `required` hard-requires Codex (STOP without launching if `codex --version` fails). Under `auto`/`off` it launches, and each story's `review-full` applies its own non-silent Codex skip.
- **A missing/unparseable `effort.md` defaults to `opus.high`** and is noted — never crash, never stop on it.
