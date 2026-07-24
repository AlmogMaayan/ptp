---
description: Brainstorm-then-review in one uninterrupted flow — allocates a change id, runs the Superpowers brainstorm phase (producing brainstorm.md), then continues without a manual re-invocation into the dual-reviewer (main agent + reviewer agent; default Superpowers + Codex) inline-fix brainstorm-review loop. The seam-free union of /ptp:brainstorm and /ptp:review-brainstorm-full.
argument-hint: "<short description of the change> (or a fully-formed XXXX_NN_<desc> id to re-run on an existing change)"
---

You are running **`/ptp:brainstorm-full`** — the union of `/ptp:brainstorm` and
`/ptp:review-brainstorm-full`, connected by a brainstorm-gate. It allocates a change id, runs the
brainstorm phase (producing `brainstorm.md`), and — **without a manual re-invocation in between** —
continues into the dual-reviewer (main agent + reviewer agent; default Superpowers + Codex) inline-fix convergence loop. The point of
having one command is the **automatic handoff**: no second `/ptp:review-brainstorm-full <id>` needed.
The orchestration detail lives in the **`ptp-brainstorm-full`** skill — this command is the thin
front door.

## Inputs

Change request: $ARGUMENTS (a short description of the change, optionally a fully-formed
`XXXX_NN_<desc>` id to re-run on an existing change, and optionally an anywhere-in-text
`model:<sonnet|opus|haiku|fable>.<low|medium|high|xhigh>` override token — e.g. `model:fable.high` —
that overrides the `opus.high` default for this invocation only; see "Parse the `model:` override"
below. Do NOT restate the grammar here — see `ptp-run-at-model`.)

## Preconditions (outer session, abort-guaranteeing — checked first, in order)

The outer session runs only the abort-guaranteeing preconditions before doing any work:

1. **Resolve `codex.mode` per the `ptp-codex-mode` skill** — this check runs **first** because it is
   the only guaranteed-abort condition. Under **`required`** run `codex --version`; if `codex` is not
   on PATH → **STOP** immediately with the install-or-change-mode message and do **no** further work:
   do not allocate a change id, do not write any file, do not launch any subagent. Under **`auto`** or
   **`off`** proceed — the review phase applies its own non-silent Codex skip. The full resolution +
   decision rule lives in the `ptp-codex-mode` skill — do not restate it here.

2. **Parse the `model:` override.** Scan the raw `$ARGUMENTS` text for an optional
   `model:<model>.<effort>` override token per the "Optional caller-side `model:` override token"
   section of **`ptp-run-at-model`** — do not restate that grammar/validation here.
   - **Absent** → target = `opus.high`; `$ARGUMENTS` unchanged; proceed to precondition 3.
   - **Exactly one valid candidate** → strip it from `$ARGUMENTS` before precondition 3 (change-id
     allocation); target = the resolved `<model>.<effort>` literal.
   - **Invalid** (bad model, bad effort, wrong shape, or more than one candidate) → **STOP in the
     outer session**, before change-id allocation, before the branch guard, before any subagent
     spawn, reporting the offending candidate(s) and the two valid enums (`sonnet|opus|haiku|fable`,
     `low|medium|high|xhigh`).

   **Ordering note:** this parse runs after only the `codex.mode` guaranteed-abort (precondition 1,
   which spawns/cuts nothing) and before change-id allocation and the branch guard, so a stripped
   token never contaminates the derived `<desc>` and an invalid token aborts before any branch is cut
   — mirroring `ptp-run-at-model`'s "Strip-before-use ordering" (reference it; do not restate it).

3. **Allocate the change id and capture the request** — per the `ptp-change-selector` skill (§4 epic
   allocation), over the now token-free `$ARGUMENTS`. Two cases, mirroring `/ptp:brainstorm`:
   - **Free-text request** (the common path): derive `XXXX_01_<desc>` from the supplied text, and the
     **request** threaded into Phase A is that supplied text.
   - **Fully-formed `XXXX_NN_<desc>` id** (re-run on an existing change): preserve the id verbatim. There
     is no separate request text in this path, so Phase A brainstorms from the change context (the id's
     `<desc>` plus any existing `brainstorm.md`/artifacts in `openspec/changes/<id>/`), exactly as
     `/ptp:brainstorm <id>` does — it does **not** brainstorm the literal id string as if it were prose.
   Do NOT pause to confirm — pick a reasonable description and proceed. **Never produce a legacy/plain id
   going forward.**

4. **Branch guard** — run the `ptp-branch-guard` preamble on the allocated change id: if HEAD is
   the base branch (`master`/`main`), derive `ptp/<change-id>` and launch the minimal `ptp-branch-prep` workflow (stash →
   checkout the base branch → pull → cut the branch) **before** any file write; if already on a feature branch
   it is a **no-op** — proceed as-is. The full rule lives in the `ptp-branch-guard` skill — do not
   restate it here.

## What this command does

After the four outer preconditions above have settled, delegate the two-phase orchestration to the
**`ptp-brainstorm-full`** skill. Pass the original change request (`$ARGUMENTS`), the allocated change
id, the resolved `codex.mode` decision, and the resolved target (`opus.high` by default, or the valid
`model:` override). The request must be threaded through to Phase A so the
brainstorm subagent brainstorms the actual request, not the lossy slug derived for the id. The skill
performs, both phases at the resolved target (`opus.high` by default):

- **Phase A (brainstorm):** invokes `ptp-run-at-model` at the resolved target (`opus.high` by default)
  to run the brainstorm-production
  subagent (steps 2–7 of `/ptp:brainstorm`: load context → invoke `superpowers:brainstorming` on the
  passed-through request → present options → recommend → persist
  `openspec/changes/<change-id>/brainstorm.md`). Step 8's STOP and
  `/ptp:plan` recommendation are suppressed — the outer session continues to the brainstorm-gate.
- **Brainstorm-gate:** reads `openspec/changes/<change-id>/brainstorm.md`; if missing → STOP (do not
  enter Phase B). Reports the brainstorm failure and recommends `/ptp:brainstorm <change-id>` to debug.
- **Phase B (review):** invokes `ptp-run-at-model` at the resolved target (`opus.high` by default) to
  run the `ptp-review-brainstorm-full`
  skill with the pre-resolved `codex.mode`. Relays the combined terminal state.

Keep this command **thin**: the two phases, the brainstorm-gate, the terminal report, and the hard rules
all live in the **`ptp-brainstorm-full`** skill. Do not restate the skill's methodology here.

## Model/effort posture

This command has **no effort gate** and no `full-effort` variant. Both phases run at the resolved
target, `opus.high` by **default** — overridable for a single invocation via the `model:` token (see
"Parse the `model:` override" above; reference `ptp-run-at-model` for the grammar). No `effort.md` is
read — this is a brainstorm-phase command, not an apply command. If the session is below the resolved
target's model/effort (`opus.high` by default) when the outer preconditions run, **note a reminder**
but do **not** stop.

## Hard rules

- **Codex per `codex.mode`** (see the `ptp-codex-mode` skill) — resolve the mode once up front; only
  `required` hard-requires Codex (STOP with no work if `codex --version` fails). Under `auto`/`off`
  the command proceeds and the review phase applies its own non-silent Codex skip.
- **Brainstorm-gate blocks Phase B** — do not enter the review phase if `brainstorm.md` is missing
  after Phase A.
- **Never archive** the change. Archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made during brainstorming or brainstorm review.
- **Never re-confirm scope between phases** — the handoff from Phase A to Phase B is automatic; the
  allocated change id is passed explicitly so Phase B does not stop.
- **No `openspec validate`** — a brainstorm precedes any proposal/spec; there is nothing to validate.
- **Never re-allocate the change id** in the skill — the outer session allocates it once and passes it
  through.
