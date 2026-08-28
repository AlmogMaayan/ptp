---
description: Archive a completed, reviewed change and sync its delta specs into the main specs
argument-hint: "[change-selector] — id, epic:all, epic:XXXX, story:NN, or epic:XXXX story:NN; empty = all active changes (openspec list disambiguation)"
---

You are running **step 5** (the final step) of the ptp flow. The change has been implemented and reviewed. Your job is to **enforce the ptp archive gates, then archive the change via the OpenSpec CLI** (which also syncs the delta specs into the main specs).

Archiving uses the native `openspec` CLI, not opsx — consistent with every other ptp command, and `openspec archive` already does "move to archive + update main specs + validate" in one step. There is no cross-plugin dependency.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change (e.g. `epic:XXXX`), archive each in story order, each through the existing per-change archive gates below. Preserve the existing empty-argument default: omitting `$ARGUMENTS` falls back to the `openspec list` disambiguation.

## Branch safety (first step)

Archiving moves the change folder and rewrites `openspec/specs/`, so before any move run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the resolved change id (leaf: the change id; shape per `ptp-workspace`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

The archive work runs **at a deterministic model** via the **`ptp-run-at-model`** skill at
`sonnet.medium` — but only the **non-interactive, already-confirmed** archive operation runs inside
that subagent. Everything that needs the outer session (id resolution, the branch guard, the gate
*inspection* that builds the confirmation, and the two interactive confirmations) runs **first, in
the outer session**, in this exact order:

1. **Resolve the change id** (outer session). The branch guard and the spawn both need the resolved
   id, so resolve it first:
   - If `$ARGUMENTS` is empty, run `npx -y openspec list` and, if it is ambiguous, ask the user which change to archive. **Never** guess or auto-select. (This is an abort-guaranteeing precondition — a guaranteed abort must never spawn a subagent.)

2. **Run the `ptp-branch-guard` preamble** (outer session) per the *Branch safety* section above —
   the subagent cannot cut the branch (it cannot launch the `ptp-branch-prep` Workflow), so HEAD must
   already be on the feature branch before the spawn.

3. **Inspect the ptp archive gates** (outer session — *inspection only*, to build the confirmation
   payload; the gates are **re-enforced as hard refusals inside the subagent**, step 6):
   - **Tasks complete** — read `openspec/changes/<change-id>/tasks.md`. If any `- [ ]` remain, **STOP**, list them, and refuse — without spawning. (ptp hard prohibition: never archive with unchecked tasks.)
   - **Validation passes** — run `npx -y openspec validate <change-id> --strict`. If it fails, **STOP** and surface the error without spawning; do not archive a failing change.
   - **Spec-delta path** — determine whether `openspec/changes/<change-id>/specs/` contains at least one delta `<capability>/spec.md` (so the confirmation can state whether the archive will use `--skip-specs`).

4. **Review-clean confirmation** (outer session — interactive).

   **Severity threshold.** Resolve `review.minSeverity` from layered ptp config **once**, here in the
   **outer session** (the confirmation is interactive and must display it), and hold it fixed —
   layered as `ptp-workspace` (`skills/ptp-workspace/SKILL.md`) defines, default `low`; a missing
   file, missing key, unparseable JSON, or unrecognized value falls back to the prior valid value
   (ultimately `low`) rather than erroring, and **never** STOPs the archive. The `/ptp:config`
   parameter registry (`commands/config.md`, `skills/ptp-config/`) owns the key, its domain, and its
   validation — this is a pointer to that contract, not a second reader definition. Severity order
   is `low < medium < high < critical`. A finding is **actionable** when its severity is **at or
   above** the resolved threshold; a Critical or High finding **below** the resolved threshold does
   not block the archive. Because this gate never counted Medium or Low toward a refusal, `low`,
   `medium`, and `high` behave identically here; only `critical` changes an outcome, by demoting
   High to non-blocking — do **not** "repair" that apparent no-op by making Medium findings block.
   **Never** reword this gate as "unresolved findings at or above the resolved
   `review.minSeverity`": at the default `low` that admits *every* severity and would make an
   unresolved **Low** nit block the archive. The *actionable* qualifier only ever **narrows** the
   pre-existing Critical/High test, never widens it. State the resolved threshold **and the layer it
   resolved from** (a `ptp-workspace` provenance label) **in the confirmation prompt**, and when it
   is not the default, name which severities it is no longer blocking on, so the user confirms with
   that in view.

   `/ptp:review <change-id>` must have been run with no unresolved **actionable** Critical or High findings — Critical or High findings whose severity is at or above the resolved `review.minSeverity` (at the default `low`, that is Critical and High, exactly as today). OpenSpec does not track review state, so **ask the user to confirm** review is done and the actionable Critical/High findings are resolved before continuing. If they haven't reviewed, redirect them to `/ptp:review <change-id>` first. This confirmation must happen in the outer session — the subagent is non-interactive and cannot ask the user.

   **The other two gates are unaffected by the threshold.** `review.minSeverity` governs **only** this
   review-clean confirmation. The **tasks-complete** gate (step 3) and the
   `npx -y openspec validate <change-id> --strict` gate (step 3, re-enforced in step 6) are not
   severity-based: they remain **absolute** at every threshold, and no threshold value can soften
   them. The `sonnet.medium` subagent likewise gains **no new refusal** — it re-enforces exactly the
   tasks-complete and validation refusals it enforces today, and review-clean stays an outer human
   confirmation as it always was.

5. **Confirm the action** (outer session — interactive) — show the user exactly what will happen (which change moves to `openspec/changes/archive/`, that delta specs under `specs/` will be merged into `openspec/specs/`, and whether `--skip-specs` will be used per the step-3 inspection). Proceed once confirmed (the user invoking this command counts as intent, but show the summary first).

6. **Run the already-confirmed archive operation via `ptp-run-at-model` at `sonnet.medium`.** Invoke
   the **`ptp-run-at-model`** skill with target `sonnet.medium` and the work below; it spawns one
   foreground `sonnet` subagent (medium effort directive) that performs **only the non-interactive
   archive operation** and **re-enforces the gates as hard refusals** (any refusal relays back per
   `ptp-run-at-model`'s *Result relay*):
   - **Re-enforce tasks-complete and validation as hard refusals** — if `tasks.md` still has any `- [ ]`, or `npx -y openspec validate <change-id> --strict` fails, **refuse** (return a `refused` terminal state) and do not archive.
   - **Archive via the CLI**: `npx -y openspec archive <change-id> --yes` — this moves the change to `openspec/changes/archive/` **and** updates the main specs from the delta specs, then validates. For changes with no spec deltas (per the step-3 inspection), add `--skip-specs`.
   - **Fallback if the CLI rejects the change** (e.g. an older change folder whose name does not start with a letter, which the CLI refuses): perform the archive manually, preserving the CLI's semantics — sync each delta spec in `openspec/changes/<change-id>/specs/<capability>/spec.md` into `openspec/specs/<capability>/spec.md` (apply ADDED/MODIFIED/REMOVED/RENAMED; a pure-ADDED delta with no existing main spec becomes a new canonical spec); then move `openspec/changes/<change-id>` → `openspec/changes/archive/<YYYY-MM-DD>-<change-id>` (using today's date; fail clearly if the target already exists). Then continue into the **Stage record** bullet below, which is the **single** place `<archive-location>/stages/archive.json` is written on either path — the fallback performs no write of its own, so the record is written exactly once per successful archive, never twice. On this path the archive location is the folder this bullet just moved the change to, and `specsSynced` is `true` when at least one delta spec was manually synced and `false` when the change had none — this path never runs the CLI, so it can never carry `--skip-specs`.
   - **Stage record** — this bullet runs **once**, on whichever of the two routes above succeeded (the CLI archive or the manual fallback), and is the only writer of the record. **Only after** the archive reports success (never before, and never into the pre-move change folder), resolve the archive location: take it from the archive operation's own report — for the fallback, the folder it moved the change to — else fall back to the deterministic `openspec/changes/archive/<YYYY-MM-DD>-<change-id>`. If that folder exists, write `<location>/stages/archive.json` (creating `stages/` on demand) with `kind: "archive"`, `terminalState: "archived"`, an ISO-8601 UTC `timestamp`, and — when known — `archivedTo` (repo-relative) and `specsSynced`. `specsSynced` is defined by **outcome, not by flag**: `true` when delta specs were synchronized into the main specs, `false` when none were — on the CLI path that `false` is exactly the `--skip-specs` case. Write it atomically: serialize to a uniquely named temp file in the same `stages/` directory, then replace via a replace-if-exists rename only after the complete write succeeds; on failure clean up the temp file and leave any existing file untouched. This write is **not a gate**: if the location cannot be resolved or the write fails, report that and continue — the archive already succeeded, its terminal state is unchanged, and the archive stage simply reads as unknown. A refused archive writes no record anywhere.
   - **Report** — change id, archive location, whether specs were synced (or skipped), and any gate warnings.

7. **Relay** the subagent's result to the user verbatim in meaning — the success report, or a gate
   refusal — never reporting a refusal as success. The flow is then complete.

If `$ARGUMENTS` resolved to more than one change, repeat steps 1–7 per change in story order — one
sequential `ptp-run-at-model` invocation (one blocking subagent) per change, never a parallel
fan-out (the branch guard is a no-op after the first cut).

## Hard rules

- **Never** archive a change with unchecked tasks or unresolved **actionable** Critical/High review findings (Critical/High at or above the resolved `review.minSeverity`; default `low` ⇒ Critical/High, exactly as today). Refuse and redirect. The unchecked-tasks half of this rule is absolute and unaffected by the threshold.
- **Never** silently skip the spec sync. Use `--skip-specs` only for changes that genuinely have no spec deltas, and say so in the report.
- Do **not** edit the spec deltas to make validation pass — if validation fails, bounce back to `/ptp:plan`.
- Prefer the `openspec` CLI; only fall back to a manual move when the CLI cannot handle the change name.
- The archive gates are exactly tasks-complete, strict validation, and the review-clean confirmation —
  artifact presence is never a gate, so an absent `design.md` / `TLDR.md` / `brainstorm.md` /
  `analysis.md` / `effort.md` never refuses, warns, or delays an archive.
- The archive rewrites, compacts, trims, reformats, or deletes **no** artifact of the change being
  archived and **no** artifact already under `openspec/changes/archive/` — its only writes are the
  folder move, the delta-spec sync, and `stages/archive.json`.
