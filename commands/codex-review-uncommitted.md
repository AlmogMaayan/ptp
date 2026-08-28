---
description: Run one closed-book Codex review of the uncommitted working tree, with or without a change
argument-hint: "[change-selector] — any selector resolving to exactly one change (id, story:NN, or epic:XXXX story:NN) for contract context"
---

You are running a fast, **Codex-powered** review of the **uncommitted** changes in the working tree — what `git status` shows as modified, staged, or untracked. Use this mid-implementation, before committing, to catch issues early without reviewing already-committed history.

This command never fixes, so the fix-target contract in `ptp-review-loop` is a **no-op** here: no
fix pass is dispatched and this command's `opus.high` review target is unchanged.

## Inputs

Change id: $ARGUMENTS  *(optional)* — if given, use `openspec/changes/<change-id>/` as the contract to grade against. If omitted, review the uncommitted diff for general correctness/quality with no spec context.

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill. Because this command grades a single working tree, the selector **must** resolve to **exactly one** change. If the selector resolves to more than one change (e.g. `epic:XXXX`), **STOP** and ask the user for a bare id or `epic:XXXX story:NN`. This command never iterates — it reviews the working tree once. Preserve the existing empty-arg default (review the uncommitted diff with no contract).

## Preconditions

- The `codex` CLI must be on PATH (`codex --version`). If missing, STOP and tell the user to install it.
- There must be uncommitted changes. Run `git status --porcelain` first; if it is empty, tell the user there is nothing to review and STOP (do not invoke Codex on an empty diff).

## Reliability: caller supplies the inputs, Codex runs no fragile commands

Codex runs under `codex exec -s read-only` with `approval: never`, shelling out via `pwsh` on Windows. Three things break runs: **`npx`/install commands** (sandbox auto-denies network), **nested-quote PowerShell one-liners** (rejected by policy), and **transient Windows sandbox spawn errors**. So **you (the caller) capture the diff, the untracked-file contents, and any validate/test results, and inline them into the prompt.** Codex opens **no** file by path and runs **no** command at all — every excerpt it needs is inlined by you, which is what keeps the review closed-book. Pass the prompt over **stdin**.

## Steps

This command is **read-only** — it runs **no** branch guard (it never writes). Its review work runs
**at a deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`. The outer session
runs only the abort-guaranteeing preconditions first — the `codex --version` presence check (STOP if
missing), the **single-change resolution** (STOP and ask if the selector resolves to more than one
change, per *Inputs*), and the **non-empty working-tree gate** (`git status --porcelain`; STOP if it
is empty — nothing to review) — so a guaranteed abort never spawns a subagent. It then invokes
**`ptp-run-at-model`** with target `opus.high` to run the work below **after that outer gate has
passed** (steps 2–5 plus the capture half of step 1; step 1's empty-tree STOP gate is the outer
precondition above — the subagent only re-captures the changed/untracked file list for its own use,
it does not re-decide whether to abort); that spawns **one**
foreground `opus` subagent (high effort directive) which reviews the working tree **exactly once** and
**never iterates** — capturing the diff/untracked contents, building the prompt, running `codex exec
-s read-only` over stdin (the external `codex exec` remains a Bash subprocess governed by its own CLI
config), and relaying the verdict — **fixing nothing**, and the subagent's outcome is relayed back per
`ptp-run-at-model`'s *Result relay*.

1. **Confirm there is something to review (you, via Bash):** `git status --porcelain`. Capture the list of changed + untracked files.
2. **Gather this command's required set (you, via Bash/Read) — and nothing outside it.** Its scope
   is the **staged, unstaged and untracked working tree**, never a merge-base diff, and it stays
   runnable with no change folder at all:
   - Tracked changes: `git diff HEAD`, plus `git diff --staged` when staged-only needs calling out.
   - Untracked files (lines starting with `??`): read their contents directly (they have no diff yet).
   - **Optional contract rule:** inline the contract artifacts — `proposal.md`, `design.md` when
     present, `tasks.md`, and `specs/**/spec.md` — **only when a change selector was supplied**, and
     omit them entirely when none was.
   - The cited source excerpts for any `path:line` reference the working-tree changes make.
   - Any cheap, relevant checks (typecheck/lint/tests) the change implies: run them yourself and
     capture the results to inline as authoritative — do not make Codex run them.
   - This kind carries **no** `openspec validate` result: there may be no change folder to validate.

`TLDR.md` and `effort.md` are never inlined for any kind.

3. **Build ONE prompt over stdin.**

   **Severity threshold (resolved caller-side, inlined as a literal).** Resolve `review.minSeverity`
   from layered ptp config **once**, at the start of this pass, and hold it fixed for the pass —
   layered as `ptp-workspace` (`skills/ptp-workspace/SKILL.md`) defines, default `low`; a missing
   file, missing key, unparseable JSON, or unrecognized value falls back to the prior valid value
   (ultimately `low`) rather than erroring, and **never** STOPs the review. The `/ptp:config`
   parameter registry (`commands/config.md`, `skills/ptp-config/`) owns the key, its domain, and its
   validation — this is a pointer to that contract, not a second reader definition.
   **You** read the config, exactly as you capture the diff; **Codex is never asked to read
   `config.json`, to resolve the threshold, or to run any additional command** — the prompt is
   closed-book by design. Severity order is `low < medium < high < critical`. A finding is
   **actionable** when its severity is **at or above** the resolved threshold. Findings **below** the
   threshold are still classified and still listed under their own severity, marked *(below the
   configured `review.minSeverity` — reported, non-blocking)*; they never by themselves produce `FIX
   BEFORE COMMIT`. Because this verdict never counted Medium or Low toward its outcome, `low`,
   `medium`, and `high` behave identically here; only `critical` changes a verdict, by demoting High
   to reported-only — do **not** "repair" that apparent no-op by making Medium findings block. State
   the resolved threshold **and the layer it resolved from** (a `ptp-workspace` provenance label) in
   your step-5 summary, and when the threshold demoted at least one finding out of the blocking set,
   say so beside the verdict.

   The prompt contains, in order:
   - The review instructions (below).
   - The captured `git diff HEAD` (and staged diff if used), under a `=== UNCOMMITTED DIFF ===` delimiter.
   - The untracked files' contents, under `=== UNTRACKED <path> ===` delimiters.
   - The contract artifacts (only when a change selector was supplied) and any test results, clearly labeled as authoritative.
   - A hard instruction block: *"The diff and untracked contents are inlined above — review those. Do NOT run `npx`, installers, or any network command; any test/validate results given are authoritative. Open **no** file by path and run **no** command: every source excerpt the working-tree contents cite is inlined above. If something you would need is not inlined, note the point as 'not inlined — unverifiable closed-book' and continue."*

   The review instructions must tell Codex to:
   - If a change-id was given, grade the uncommitted work against the contract (proposal intent, spec deltas, tasks); otherwise review for general correctness, security, error handling, conventions, and missing tests.
   - Classify findings **Critical / High / Medium / Low**, each with file:line and a concrete suggested fix.
   - NOT classify required manual tests that have not yet been performed as findings — they are a future verification step, not a code defect.
   - Honor the inlined severity threshold, stated as a literal line in the prompt:
     *"Severity threshold: `<T>`. Classify every finding Critical/High/Medium/Low as usual and list
     them all. Findings below `<T>` MUST be marked non-blocking and MUST NOT affect the verdict
     line. Do not read any config file and do not run any command to determine the threshold — the
     value above is authoritative."*
   - End with exactly one line: `SAFE TO COMMIT` (no **actionable** Critical/High) or `FIX BEFORE COMMIT` (any **actionable** Critical/High). The single-line-at-the-end format is unchanged — the verdict tokens and their placement are byte-identical to today; only which findings count toward them is qualified.
4. **Run Codex over stdin (you, via Bash from the repo root):**
   ```bash
   printf '%s' "$PROMPT" | codex exec -s read-only -
   ```
   Assemble the invocation per the `ptp-codex-mode` flag-append rule: append `-m <model>` and/or
   `-c model_reasoning_effort=<effort>` before the trailing `-` when `codex.model` /
   `codex.reasoningEffort` resolve to a set value; both unset yields exactly the invocation shown above.
   - Always pipe via **stdin** (`-`); keep `-s read-only`. Do **not** pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
   - **Run it synchronously**, per `ptp-codex-mode`'s *Every round runs synchronously*.
   - Sandbox noise (`blocked by policy`, `spawn setup refresh`) is harmless here — the diff is inlined, so Codex needs no commands. Proceed to relay the verdict.
5. **Relay Codex's output** to the user, then add a one-line summary with the resolved threshold and the layer it came from, the verdict, and finding counts by severity (below-threshold findings still counted and listed, marked non-blocking; an all-below-threshold report still enumerates them and is never rendered as "no findings"). Note that the review covers the diff you inlined. **Apply the threshold rule yourself** rather than trusting Codex's line blindly: if Codex's emitted verdict line disagrees with the threshold-correct verdict (for example `FIX BEFORE COMMIT` for a High the resolved threshold demoted), **say so explicitly** and report the threshold-correct verdict.

## Hard rules

- Do **not** count required manual tests that have not yet been performed as findings. Manual tests are a future verification step; their absence is not a code defect.
- **This command only reviews and displays findings. It NEVER fixes anything.** Do not edit the working tree, do not stage, do not commit — not even if findings are obvious. Report the findings and stop. Fixing is a separate, explicit user action (`/ptp:review-fix`).
- The **caller** captures the diff, runs any checks, **and resolves `review.minSeverity`**, inlining the resolved value as a literal; **Codex runs no `npx`/network/install commands** and is never asked to read `config.json` or resolve the threshold itself. Pass the prompt over stdin.
- Scope is **uncommitted changes only** — do not review committed history or the full merge-base diff (that's `/ptp:codex-review`).
- Do **not** run Codex with a writable or bypassed sandbox — review must not modify the working tree.
- Do **not** invoke `/ptp:apply` from here under any circumstance.
