---
name: ptp-brainstorm-full
description: Use this skill when orchestrating the two-phase brainstorm-then-review flow behind /ptp:brainstorm-full. Owns the Phase A brainstorm (ptp-run-at-model at opus.high → brainstorm-production subagent), the brainstorm-gate (missing brainstorm.md → STOP), and Phase B review (ptp-run-at-model at opus.high → ptp-review-brainstorm-full skill with pre-resolved codex.mode). Never re-allocates the change id, never re-runs the branch guard, never archives, never commits.
---

# ptp-brainstorm-full — brainstorm-then-review two-phase orchestration

## Purpose

This skill is the orchestration contract behind the single `/ptp:brainstorm-full` command. It is the
union of `/ptp:brainstorm` and `/ptp:review-brainstorm-full`: it runs the brainstorm phase (producing
`brainstorm.md`) and — without a user re-invocation in between — continues into the dual-reviewer
(main agent + reviewer agent; default Superpowers + Codex) inline-fix brainstorm-review loop. The seam between the two commands is exactly
why this skill exists: the change id produced by the brainstorm phase is passed *explicitly* into the
review phase, so the review phase skips any scope-confirmation stop. "Run brainstorm and continue
without stopping to review-brainstorm-full."

The `/ptp:brainstorm-full` command is the thin front door; this skill holds the substance. The command
has already resolved `codex.mode`, allocated the change id, and run the branch guard before invoking
this skill — the skill receives these as inputs and does **not** redo them.

---

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| `request` | the original change request text (free-text path), or empty for the re-run-with-bare-id path | `$ARGUMENTS` from the command; threaded through to the Phase A brainstorm subagent so it brainstorms the actual request, not the lossy id slug. In the bare-id re-run path there is no request text — Phase A brainstorms from the change context (the id's `<desc>` and any existing `openspec/changes/<id>/` artifacts), exactly as `/ptp:brainstorm <id>` does. |
| `change-id` | fully-formed `XXXX_NN_<desc>` change id | Allocated/preserved by the outer session (derived from the request text, or preserved verbatim when `$ARGUMENTS` is already a fully-formed id). |
| `codex.mode` decision | already-resolved mode decision from `ptp-codex-mode` | Resolved once in the outer session; threaded through to Phase B so the review subagent does not re-resolve it. |

There is no effort/model input. Both phases run at `opus.high` via `ptp-run-at-model`.

---

## Precondition

`codex.mode` is **pre-resolved** by the command's outer session. The skill does NOT re-resolve it.
The outer session guarantees:

- Under `required` with `codex` not on PATH: the command already STOPped before invoking this skill —
  this skill is never entered in that case.
- Under `auto` or `off`: this skill proceeds; Phase B applies the pre-resolved mode decision to
  determine whether the Codex loop runs.

---

## Phase A — brainstorm

Invoke **`ptp-run-at-model`** at `opus.high` with the work being the brainstorm-production steps
(steps 2–7 of `/ptp:brainstorm`). The subagent prompt MUST include the original `request` text (the
command's `$ARGUMENTS`) so the brainstorm operates on the actual request, not the lossy slug derived
for the change id. In the bare-id re-run path (no request text) the subagent brainstorms from the
change context — the id's `<desc>` and any existing `openspec/changes/<id>/` artifacts — exactly as
`/ptp:brainstorm <id>` does:

1. Load context — read `openspec/project.md` if present, run `npx -y openspec list` and
   `npx -y openspec list --specs` to see existing specs and in-flight changes.
2. Invoke the `superpowers:brainstorming` skill in autonomous mode on the passed-through `request`
   (no clarifying questions — make reasonable assumptions and document them inline).
3. Present 2–3 options with tradeoffs (what it changes, risk/blast radius, effort, reversibility,
   interaction with existing specs).
4. Recommend one option with rationale.
5. Persist the brainstorm to `openspec/changes/<change-id>/brainstorm.md` (create the directory if
   absent).

**Step 8's STOP and `/ptp:plan` recommendation are suppressed** — the brainstorm subagent writes
`brainstorm.md` and returns its terminal result to the outer session; the outer session continues to
the brainstorm-gate. The subagent prompt MUST carry: the original `request` text (so the brainstorm
targets the real request, not the id slug); the branch guard is a **no-op** (HEAD is already
on the feature branch from the outer guard); the subagent MUST NOT attempt to launch the
`ptp-branch-prep` workflow; the brainstorm work invokes `superpowers:brainstorming` as an inline Skill
call — no nesting concern.

Relay the Phase A result: the absolute path of the written `brainstorm.md` (or the failure description
if the subagent did not write it).

---

## Brainstorm-gate

After Phase A returns, read `openspec/changes/<change-id>/brainstorm.md`:

- **Present** → proceed to Phase B.
- **Missing** → **STOP**. Do NOT invoke `ptp-run-at-model` for Phase B.
  Report: Phase A failed to write `brainstorm.md`. Recommend
  `/ptp:brainstorm <change-id>` to debug and produce the brainstorm manually, then re-run
  `/ptp:review-brainstorm-full <change-id>` for the review.

---

## Phase B — review (the `/ptp:review-brainstorm-full` flow)

**Only if the brainstorm-gate passed**, invoke **`ptp-run-at-model`** at `opus.high` with the work
being "run the `ptp-review-brainstorm-full` skill over `<change-id>` with the pre-resolved
`codex.mode`." Pass the already-resolved `codex.mode` decision so the review subagent does not
re-resolve it.

The subagent prompt MUST carry:
- The branch guard is a **no-op** (HEAD is already on the feature branch).
- The change-folder existence check passes (`brainstorm.md` was just written by Phase A).
- `codex.mode` is pre-resolved: `<decision>`. Apply it directly; do NOT re-resolve via `ptp-codex-mode`.

The subagent runs the full `ptp-review-brainstorm-full` skill: Phase 1 main-agent brainstorm loop →
Phase-1-gates-Phase-2 gate → Phase 2 reviewer-agent brainstorm loop (gated for a Codex reviewer) →
combined terminal state + report. At the default `roles.main=claude` this is Phase 1 Superpowers →
Phase 2 Codex, byte-identical to before.

Relay the Phase B terminal state exactly as `ptp-review-brainstorm-full` emits it — never downgrade
or misreport it.

---

## Terminal report

Report at whichever terminal point is reached:

| Terminal state | Meaning | Next-step recommendation |
|---|---|---|
| `BOTH PHASES DONE` | Phase A wrote brainstorm.md; Phase 1 (main agent) and Phase 2 (reviewer agent) both converged (default: Superpowers then Codex) | `/ptp:plan <change-id>` |
| `PHASE 1 DONE — CODEX SKIPPED (mode=…)` | Phase A wrote brainstorm.md; Phase 1 converged; a Codex reviewer skipped per `codex.mode` | `/ptp:plan <change-id>` |
| `ITERATION CAP REACHED` | Phase A wrote brainstorm.md; Phase 1 hit the iteration cap before converging; Phase 2 not started | Fix remaining Phase 1 findings → re-run `/ptp:review-brainstorm-full <change-id>` |
| `PHASE 2 ITERATION CAP REACHED` | Phase A wrote brainstorm.md; Phase 1 converged; Phase 2 hit the cap | Fix remaining Phase 2 findings → re-run `/ptp:review-brainstorm-full <change-id>` |
| Brainstorm-gate STOP | Phase A completed but `brainstorm.md` is absent | Debug Phase A → run `/ptp:brainstorm <change-id>`, then re-run `/ptp:review-brainstorm-full <change-id>` |

Report format:
1. Phase A result — absolute path of `brainstorm.md` written (or gate-stop reason if missing).
2. Brainstorm-gate status.
3. Phase B combined terminal state and loop summary (per `ptp-review-brainstorm-full`'s report shape)
   — or omitted (with the gate-stop note) if the brainstorm-gate fired.
4. The next-step recommendation (one of the five rows above).

---

## Hard rules

- **Branch safety is the outer session's responsibility.** The command runs the `ptp-branch-guard`
  preamble before invoking this skill. The Phase A and Phase B subagents' own branch guards are
  **no-ops** — both subagent prompts MUST carry this note.
- **`codex.mode` is pre-resolved.** Do NOT invoke `ptp-codex-mode` in this skill. Apply the pre-
  resolved decision the command passed in.
- **Never re-allocate the change id.** The outer session allocated it; the skill uses it verbatim.
- **Brainstorm-gate blocks Phase B.** If `brainstorm.md` is missing after Phase A, do NOT invoke
  `ptp-run-at-model` for Phase B — STOP and report.
- **Never archive** the change. Archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made during brainstorming or brainstorm review.
- **Never re-confirm scope between phases.** The change id is passed explicitly; Phase B does not
  stop to ask the user.
- **No `openspec validate`.** A brainstorm precedes any proposal/spec — there is nothing to validate.
- **Relay terminal states accurately.** Do not collapse `PHASE 1 DONE — CODEX SKIPPED (mode=…)` into
  a plain done state — the mode-skip must remain visible in the terminal report.
- **One `ptp-run-at-model` call per phase.** Phase A and Phase B are sequential; the outer session
  calls `ptp-run-at-model` twice in sequence, never concurrently. No nesting concern.
