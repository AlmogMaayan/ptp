---
description: Apply-then-review-full every change in a single sequential Claude Code workflow — each story's apply agent runs at the model from its effort.md; collapses the former full-run-effort (uses Codex per codex.mode — only required hard-requires the codex CLI)
argument-hint: "[change-selector or id …] (epic:XXXX, id list, or omit to run all active changes)"
---

`/ptp:full-run` applies and code-reviews every change in one invocation by launching the `ptp-full-run` workflow, which runs `apply → review-full` per story sequentially — one story fully before the next. Each story's apply agent runs at the model read from that story's `effort.md`; review always runs at `opus.high`. The per-story loop, change discovery/ordering, and resume/report all live in the shared `ptp-full-run` skill and its workflow script (`workflows/ptp-full-run.js`, launched by the named form `Workflow({ name: 'ptp-full-run' })`) — this command defers to them rather than restating their detail.

This single command replaces the former `/ptp:full-run` / `/ptp:full-run-effort` pair. Because each workflow agent carries its own model (the apply agent at the story's `effort.md` model, the review agent at `opus`), there is no single-dial session model/effort thrash to gate against — so the old `effort_gate` and its stop-and-suggest-a-`/model`+`/effort`-switch behavior are gone.

## Inputs

Change ids: $ARGUMENTS

- A change **selector** (any `epic:`/`story:` form — `epic:XXXX`, `epic:XXXX story:NN`, or `story:NN`), one or more explicit change ids in apply order, or empty.
- If `$ARGUMENTS` **starts with `epic:` or `story:`**, classify the whole string as one selector via `ptp-change-selector`: `epic:XXXX` resolves to all that epic's active stories (story-ascending); `epic:XXXX story:NN` and an unambiguous `story:NN` each resolve to a single change. The resolved id(s) become the ordered id list.
- If **explicit ids** (whitespace-separated, no `epic:`/`story:` prefix) are provided, they are used **verbatim, in the given order** (you are asserting the apply/dependency order).
- If **omitted**, the skill discovers all active changes via `npx -y openspec list` and orders them by epic then story (`XXXX_NN_`) ascending, appending legacy/unprefixed ids after. The no-arg path triggers a one-time scope confirmation before any apply (see the skill) — because no-arg means *every* active change.

Selector resolution per `ptp-change-selector`; ordering by epic then story per that skill's §3.

## Branch safety (first step)

Run the **`ptp-branch-guard`** preamble **once up front**, before launching the workflow: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change ids (the epic / first story → `ptp/epic-XXXX`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** the apply/review workflow runs; if you are already on a feature branch it is a **no-op** — proceed as-is. The `ptp-apply` / `ptp-review` workflow agents then operate on that branch. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

Check before launching the workflow:

1. **Resolve `codex.mode` per the `ptp-codex-mode` skill** and apply its decision contract (the per-story `review-full` review agents are the Codex consumers). Under **`required`**, run `codex --version`; if missing, **STOP** and tell the user to install it or change the mode — do **not** launch the workflow. Under **`auto`** or **`off`**, **launch** the workflow: each story's `ptp-review` agent runs `review-full`, which applies the per-story Codex skip itself (Superpowers-only, non-silent) and reports a mode-skipped review as gate-success, so the run does not halt. The full resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.
2. Each resolved `openspec/changes/<id>/` directory must exist.

## What this command does

The command is a thin wrapper that does all the file I/O up front (impossible inside the workflow script), then hands off. Loop detail lives in the `ptp-full-run` skill.

1. **Resolve** `$ARGUMENTS` → an ordered list of story ids (selector / explicit ids / empty), per the skill's *Change discovery and ordering*. For the **empty (no-arg)** case, perform the one-time scope-confirmation **STOP** — print the full resolved ordered id list and wait for the user to re-invoke before any apply.
2. **Read each story's effort.** For each id, `Read` `openspec/changes/<id>/effort.md` and parse line 1 as `{model}.{effort}`. If the file is missing or line 1 is not a parseable `{model}.{effort}`, default to `opus.high` and **note the defaulting** (never crash, never stop on it). This yields `{ id, model, effort }` per story.
3. **Build** `stories = [{ id, model, effort }, …]` in apply order.
4. **Launch the workflow:**
   ```
   Workflow({ name: 'ptp-full-run', args: { stories } })
   ```
   (Use the named form — the plugin ships `workflows/ptp-full-run.js` whose `meta.name` is `ptp-full-run`; there is no project-relative `scriptPath` under a global plugin install.) The workflow loops the stories in order, spawning the `ptp-apply` agent at the story's `model` (effort injected as a prompt directive) then the `ptp-review` agent at `opus`, and returns `{ results, halted, total }`.
5. **On completion**, render the three-bucket terminal report (`processed` / `applied (review pending)` / `never-started`) + per-story outcome table + resume command + a `/ptp:archive <id>` recommendation per fully-processed story — **exactly as specified in the skill's "Terminal report" section** (defer to it; do not restate the bucket math here).

## Hard rules

- **Never archive** any story. Archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made by the apply or review agents.
- **Codex per `codex.mode`** (see the `ptp-codex-mode` skill) — resolve the mode once up front; only `required` hard-requires Codex (STOP without launching if `codex --version` fails). Under `auto`/`off`, launch: each story's `review-full` applies its own non-silent Codex skip and reports a mode-skipped review as gate-success.
- **Never invoke `/ptp:plan` or `/ptp:plan-multiple`.** This command orchestrates apply and review only; planning is out of scope.
- **The review convergence gate halts the whole run.** A story whose review is not gate-success sets the workflow's `halted` and stops the loop — do not continue to the next story. A review that converged its Superpowers phase and skipped Codex by `codex.mode` (the mode-skip terminal state) is **gate-success**, not a halt — the `ptp-review` agent reports it as `BOTH_PHASES_DONE` (per `ptp-codex-mode`) so the workflow continues to the next story.
- There is **no** effort-gate rule and **no** model/effort-switch suggestion: each workflow agent carries its own model, so there is nothing to gate or suggest switching.
