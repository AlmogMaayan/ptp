---
description: Apply-then-review-full every change in a single sequential Claude Code workflow — each story's apply agent runs at the model from its effort.md (uses Codex per codex.mode — only required hard-requires the codex CLI)
argument-hint: "[change-selector or id …] (epic:XXXX, id list, or omit to run all active changes)"
---

`/ptp:full-apply` applies and code-reviews every change in one invocation by launching the `ptp-full-apply` workflow, which runs `apply → review-full` per story sequentially — one story fully before the next. Each story's apply agent runs at the model read from that story's `effort.md`; each story's **review target** is derived from the same file — `reviewModel` = that story's model floored at `sonnet`, `reviewEffort` = that story's effort floored at `high` — so a missing or unparseable `effort.md` still yields `opus.high`. Within a review, the **fix** work runs at a freshly evaluated fix target (`/ptp:effort … mode:fix` over that phase's frozen confirmed finding set), which may differ from the target the review itself is running at. The per-story loop, change discovery/ordering, and resume/report all live in the shared `ptp-full-apply` skill and its workflow script (`workflows/ptp-full-apply.js`, launched by the named form `Workflow({ name: 'ptp:ptp-full-apply' })`) — this command defers to them rather than restating their detail.

Because each workflow agent carries its own model (the apply agent at the story's `effort.md` model, the review agent at its resolved review target), there is no single-dial session model/effort thrash to gate against — the run needs no model/effort gate and never stops to suggest a `/model`+`/effort` switch.

## Inputs

Change ids: $ARGUMENTS

- A change **selector** (any `epic:`/`story:` form — `epic:XXXX`, `epic:XXXX story:NN`, or `story:NN`), one or more explicit change ids in apply order, or empty. `$ARGUMENTS` may additionally carry an anywhere-in-text `fast:on` / `fast:off` switch (default off) declaring that this invocation's opus agents should run in Claude Code fast mode. See "Parse the `fast:` switch" below (precondition 2); the grammar/validation/refusal contract is not restated here — it lives in `ptp-run-at-model`'s `fast:` section.
- If `$ARGUMENTS` **starts with `epic:` or `story:`**, classify the whole string as one selector via `ptp-change-selector`: `epic:XXXX` resolves to all that epic's active stories (story-ascending); `epic:XXXX story:NN` and an unambiguous `story:NN` each resolve to a single change. The resolved id(s) become the ordered id list.
- If **explicit ids** (whitespace-separated, no `epic:`/`story:` prefix) are provided, they are used **verbatim, in the given order** (you are asserting the apply/dependency order).
- If **omitted**, the skill discovers all active changes via `npx -y openspec list` and orders them by epic then story (`XXXX_NN_`) ascending, appending legacy/unprefixed ids after. The no-arg path triggers a one-time scope confirmation before any apply (see the skill) — because no-arg means *every* active change.

Selector resolution per `ptp-change-selector`; ordering by epic then story per that skill's §3. Both the selector/id resolution above and the branch guard below run **after** the preconditions — see "Preconditions" for the full ordering.

## Preconditions

Check before launching the workflow, **in this order**:

1. **Resolve `codex.mode` per the `ptp-codex-mode` skill** and apply its decision contract (the per-story `review-full` review agents are the Codex consumers). Under **`required`**, run `codex --version`; if missing, **STOP** and tell the user to install it or change the mode — do **not** launch the workflow. Under **`auto`** or **`off`**, **launch** the workflow: each story's `ptp-review` agent runs `review-full`, which applies the per-story reviewer skip itself (main-agent-only when a Codex reviewer is skipped, non-silent) and reports a mode-skipped review as gate-success, so the run does not halt. A Claude reviewer is never gated and always runs. The full resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.

2. **Parse the `fast:` switch.** Scan the raw `$ARGUMENTS` text for an optional `fast:on` / `fast:off` candidate per the "Optional caller-side `fast:` switch" section of **`ptp-run-at-model`** — do not restate that grammar/validation here.

   - **Absent** → fast off; behavior unchanged; nothing to strip.
   - **`fast:off`** → strip the token from `$ARGUMENTS`, resolve the boolean to `false`; run **no** preflight and emit **no** announcement (an unstripped `fast:off` would contaminate the selector/id resolution exactly as `fast:on` would).
   - **`fast:on`** → strip the token from `$ARGUMENTS` and resolve the boolean to `true` **here**. The fast-mode preflight itself runs **once**, but **later** — after step 2 has derived every story's apply and review target — because its non-opus classification reads the union of those targets, which does not exist yet at this point (see the preflight-input pin below). It still emits exactly one announcement, and still before the workflow is launched.
   - **Invalid** (bad value or two or more candidates) → **STOP in the outer session** — before selector/id resolution (precondition 3), before branch-name derivation and the branch guard, and before launching the workflow — reporting the offending candidate(s) and the two valid values (`on`, `off`).

   **Preflight-input pin.** This command has no single target model, so the **non-opus no-op is decided from the union of this invocation's resolved spawn targets** — its resolved apply targets *plus* its resolved review targets (this command runs no plan-phase stage). If **any** of them is `opus`, the no-op does **not** fire and the settings read is performed; if **none** is — an all-`sonnet`/`haiku` story set whose review targets are likewise below `opus` — the no-op **does** fire and is the announced outcome, because the invocation will spawn no Opus agent and fast mode exists only on Opus. Resolve the review targets before making that classification; never classify from the apply stories' models alone. The **`main=codex` no-op never fires**, because the workflow always spawns the Claude `ptp:ptp-apply` / `ptp:ptp-review` agents regardless of `roles.main`. So the announced outcome here is **verified-on**, the **non-blocking advisory**, or the non-opus no-op. See `ptp-run-at-model`'s outcome list — its precedence rules are not restated here.

   **Ordering follows from that input.** The union is only known once the ids are resolved and each story's `effort.md` has been read, so the **preflight** — its settings read and its one announcement — runs at step 3 below, not here. What stays here is everything that can abort: the scan, the grammar validation, the strip, and the invalid-candidate STOP. Deferring the preflight therefore defers no refusal and adds no second announcement; an invocation whose posture is on emits its one announcement at step 3, and an invocation that never reaches step 3 (an invalid token, a missing change folder, the no-arg scope-confirmation STOP) correctly emits none.

   This parse runs after the `codex.mode` guaranteed-abort (precondition 1) and before precondition 3's selector/id resolution (so a stripped token is never misclassified as an explicit change id) and before the branch guard (so an invalid token aborts before a branch is cut). The preflight is the **only** part deferred past those points; the parse, the validation, and the STOP all happen here.

3. Each resolved `openspec/changes/<id>/` directory must exist.

## Branch safety (first write-affecting step)

Run the **`ptp-branch-guard`** preamble **once**, after the abort-guaranteeing preconditions above, before launching the workflow: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the resolved change ids (the epic / first story → `ptp/epic-XXXX`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** the apply/review workflow runs; if you are already on a feature branch it is a **no-op** — proceed as-is. The `ptp-apply` / `ptp-review` workflow agents then operate on that branch. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## What this command does

The command is a thin wrapper that does all the file I/O up front (impossible inside the workflow script), then hands off. Loop detail lives in the `ptp-full-apply` skill.

1. **Resolve** `$ARGUMENTS` → an ordered list of story ids (selector / explicit ids / empty), per the skill's *Change discovery and ordering*. For the **empty (no-arg)** case, perform the one-time scope-confirmation **STOP** — print the full resolved ordered id list and wait for the user to re-invoke before any apply.
2. **Read each story's effort.** For each id, `Read` `openspec/changes/<id>/effort.md` and parse line 1 as `{model}.{effort}`. If the file is missing or line 1 is not a parseable `{model}.{effort}`, default to `opus.high` and **note the defaulting** (never crash, never stop on it). Then derive that story's **review target** from the same pair: `reviewModel` = `model` floored at `sonnet` (`haiku` → `sonnet`; `sonnet` and `opus` unchanged) and `reviewEffort` = `effort` floored at `high` (`low`/`medium` → `high`; `high` and `xhigh` unchanged). The defaulted `opus.high` therefore yields `reviewModel: 'opus'` / `reviewEffort: 'high'` too. This yields `{ id, model, effort, reviewModel, reviewEffort }` per story.
3. **Build** `stories = [{ id, model, effort, reviewModel, reviewEffort }, …]` in apply order. **Then, if precondition 2 resolved the posture to `on`, run the fast-mode preflight once** — classifying the non-opus no-op from the union of the apply and review targets just built, per the preflight-input pin — and emit its single announcement. This is the one and only preflight for the invocation; nothing downstream re-runs or re-announces it.
4. **Run the `ptp-workflow-cache-heal` step** (see that skill for the canonical Bash command) via the
   Bash tool, then **launch the workflow:**
   ```
   Workflow({ name: 'ptp:ptp-full-apply', args: { stories, fast } })
   ```
   where `stories` carries the `{ id, model, effort, reviewModel, reviewEffort }` entries from step 3 and `fast` is the resolved invocation-level boolean from precondition 2 (top-level, **not** per story) — an omitted `fast` is read as `false` by the script, and an omitted or unrecognized `reviewModel` / `reviewEffort` falls back to `opus` / `high`. (Use the named form — the plugin ships `workflows/ptp-full-apply.js` whose `meta.name` is `ptp-full-apply`; there is no project-relative `scriptPath` under a global plugin install.) The workflow loops the stories in order, spawning the `ptp-apply` agent at the story's `model` and then the `ptp-review` agent at the story's `reviewModel` (each agent's effort injected as a prompt directive). If a review reports that its freshly evaluated fix target names a **more capable** model than the one it is running on, the workflow re-spawns that story's review **once** at that model and the convergence gate reads the escalated run's terminal state. It returns `{ results, halted, total }`.
5. **On completion**, render the three-bucket terminal report (`processed` / `applied (review pending)` / `never-started`) + per-story outcome table + resume command + a `/ptp:archive <id>` recommendation per fully-processed story — **exactly as specified in the skill's "Terminal report" section** (defer to it; do not restate the bucket math here).

## Hard rules

- **Never archive** any story. Archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made by the apply or review agents.
- **Codex per `codex.mode`** (see the `ptp-codex-mode` skill) — resolve the mode once up front; only `required` hard-requires Codex (STOP without launching if `codex --version` fails). Under `auto`/`off`, launch: each story's `review-full` applies its own non-silent Codex skip and reports a mode-skipped review as gate-success.
- **Never invoke `/ptp:plan` or `/ptp:plan-multiple`.** This command orchestrates apply and review only; planning is out of scope.
- **The review convergence gate halts the whole run.** A story whose review is not gate-success sets the workflow's `halted` and stops the loop — do not continue to the next story. A review that converged its main-agent phase and skipped a Codex reviewer by `codex.mode` (the mode-skip terminal state) is **gate-success**, not a halt — the `ptp-review` agent reports it as `BOTH_PHASES_DONE` (per `ptp-codex-mode`) so the workflow continues to the next story.
- **A story's review may escalate to a more capable model exactly once.** An escalation that cannot be honored — reported by an already-escalated run, carrying an absent/unparseable/non-escalating target, or coming from a run already at the `opus` ceiling — halts that story with an explicit reason instead of re-spawning, and the escalation state is **never** gate-success.
- There is **no** effort-gate rule and **no** model/effort-switch suggestion: each workflow agent carries its own model, so there is nothing to gate or suggest switching.
- The `fast:` switch is parsed once in the outer session and the preflight/announcement happens once per invocation that resolves `fast:on` (absent / `fast:off` → no preflight, no announcement) — never per story; the switch never enables fast mode and never writes any settings file (per `ptp-run-at-model`).
