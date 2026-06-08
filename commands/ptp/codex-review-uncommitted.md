---
description: Review only the UNCOMMITTED working-tree changes (staged + unstaged + untracked) using the external Codex CLI (codex exec) — read-only
argument-hint: "[change-selector] — any selector resolving to exactly one change (id, story:NN, or epic:XXXX story:NN) for contract context"
---

You are running a fast, **Codex-powered** review of the **uncommitted** changes in the working tree — what `git status` shows as modified, staged, or untracked. Use this mid-implementation, before committing, to catch issues early without reviewing already-committed history.

## Inputs

Change id: $ARGUMENTS  *(optional)* — if given, use `openspec/changes/<change-id>/` as the contract to grade against. If omitted, review the uncommitted diff for general correctness/quality with no spec context.

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill. Because this command grades a single working tree, the selector **must** resolve to **exactly one** change. If the selector resolves to more than one change (e.g. `epic:XXXX`), **STOP** and ask the user for a bare id or `epic:XXXX story:NN`. This command never iterates — it reviews the working tree once. Preserve the existing empty-arg default (review the uncommitted diff with no contract).

## Preconditions

- The `codex` CLI must be on PATH (`codex --version`). If missing, STOP and tell the user to install it.
- There must be uncommitted changes. Run `git status --porcelain` first; if it is empty, tell the user there is nothing to review and STOP (do not invoke Codex on an empty diff).

## Reliability: caller supplies the inputs, Codex runs no fragile commands

Codex runs under `codex exec -s read-only` with `approval: never`, shelling out via `pwsh` on Windows. Three things break runs: **`npx`/install commands** (sandbox auto-denies network), **nested-quote PowerShell one-liners** (rejected by policy), and **transient Windows sandbox spawn errors**. So **you (the caller) capture the diff, the untracked-file contents, and any validate/test results, and inline them into the prompt.** Codex should not need to run anything; it MAY do *simple* reads for extra context, but must never run `npx`/network/install commands or build complex one-liners. Pass the prompt over **stdin**.

## Steps

1. **Confirm there is something to review (you, via Bash):** `git status --porcelain`. Capture the list of changed + untracked files.
2. **Capture the uncommitted diff and untracked contents (you, via Bash/Read):**
   - Tracked changes: `git diff HEAD` (and `git diff --staged` if you want staged-only called out).
   - Untracked files (lines starting with `??`): read their contents directly (they have no diff yet).
   - If a change-id was given, also read the contract: `openspec/changes/<change-id>/{proposal,design,tasks}.md` + `specs/**/spec.md`.
   - If the change has cheap, relevant checks (typecheck/lint/tests), run them yourself and capture the results to inline as authoritative — do not make Codex run them.
3. **Build ONE prompt over stdin** containing, in order:
   - The review instructions (below).
   - The captured `git diff HEAD` (and staged diff if used), under a `=== UNCOMMITTED DIFF ===` delimiter.
   - The untracked files' contents, under `=== UNTRACKED <path> ===` delimiters.
   - The contract files (if a change-id was given) and any validate/test results, clearly labeled as authoritative.
   - A hard instruction block: *"The diff and untracked contents are inlined above — review those. Do NOT run `npx`, installers, or any network command; any test/validate results given are authoritative. You MAY read additional source files for context, but only with SIMPLE reads (`cat` / `Get-Content <path>`) — never nested-quote one-liners. If a read is blocked, note the point as 'unverifiable from sandbox' and continue; never retry with a more complex command."*

   The review instructions must tell Codex to:
   - If a change-id was given, grade the uncommitted work against the contract (proposal intent, spec deltas, tasks); otherwise review for general correctness, security, error handling, conventions, and missing tests.
   - Classify findings **Critical / High / Medium / Low**, each with file:line and a concrete suggested fix.
   - NOT classify required manual tests that have not yet been performed as findings — they are a future verification step, not a code defect.
   - End with exactly one line: `SAFE TO COMMIT` (only Medium/Low) or `FIX BEFORE COMMIT` (any Critical/High).
4. **Run Codex over stdin (you, via Bash from the repo root):**
   ```bash
   printf '%s' "$PROMPT" | codex exec -s read-only -
   ```
   - Always pipe via **stdin** (`-`); keep `-s read-only`. Do **not** pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
   - Running it in the background and polling the output file for the verdict line is fine.
   - Sandbox noise (`blocked by policy`, `spawn setup refresh`) is harmless here — the diff is inlined, so Codex needs no commands. Proceed to relay the verdict.
5. **Relay Codex's output** to the user, then add a one-line summary with the verdict and finding counts. Note that the review covers the diff you inlined.

## Hard rules

- Do **not** count required manual tests that have not yet been performed as findings. Manual tests are a future verification step; their absence is not a code defect.
- **This command only reviews and displays findings. It NEVER fixes anything.** Do not edit the working tree, do not stage, do not commit — not even if findings are obvious. Report the findings and stop. Fixing is a separate, explicit user action (`/ptp:review-fix`).
- The **caller** captures the diff and runs any checks; **Codex runs no `npx`/network/install commands**. Pass the prompt over stdin.
- Scope is **uncommitted changes only** — do not review committed history or the full merge-base diff (that's `/ptp:codex-review`).
- Do **not** run Codex with a writable or bypassed sandbox — review must not modify the working tree.
- Do **not** invoke `/ptp:apply` from here under any circumstance.
