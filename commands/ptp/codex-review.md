---
description: Code review of an implemented OpenSpec change using the external Codex CLI (codex exec), graded against its proposal/design/spec deltas
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running a **Codex-powered** variant of step 4 of the ptp flow. Instead of the Superpowers code-review skill, you delegate the review to the external **Codex CLI** via `codex exec`, then relay and classify its findings.

Use this when you want a second, independent reviewer (a different model/agent) to grade an implemented change against its OpenSpec contract.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Preconditions

- The `codex` CLI must be on PATH (`codex --version`). If it is missing, STOP and tell the user to install it — do **not** silently fall back to a different reviewer.
- `openspec/changes/<change-id>/` must exist. If it does not, STOP and tell the user to run `/ptp:brainstorm` / `/ptp:plan` first.

## Reliability: caller supplies the inputs, Codex runs no fragile commands

Codex runs under `codex exec -s read-only` with `approval: never`, shelling out via `pwsh` on Windows. Three things break runs: **`npx`/install commands** (the read-only sandbox auto-denies network, so `npx -y openspec validate` and `npm test` die), **nested-quote PowerShell one-liners** (rejected by policy), and **transient Windows sandbox spawn errors**. So **you (the caller) capture the diff and the contract, run any validation/tests yourself, and inline all of it into the prompt.** Codex MAY read additional source files for context with *simple* reads, but must never run `npx`/network/install commands. Pass the prompt over **stdin**. (Plain read-only `git diff`/`git show` are generally allowed inside Codex, but inlining the diff makes the run deterministic and immune to the spawn flakiness.)

## Steps

1. **Read the contract yourself (you, via Read):** `openspec/changes/<change-id>/` — `proposal.md`, `design.md`, `tasks.md`, and `specs/**/spec.md`. You will inline these so Codex grades against them without reading.
2. **Capture the diff scope (you, via Bash):** prefer the merge-base diff against main — `git merge-base HEAD master` then `git diff <base>...HEAD`. Fall back to the files the tasks touched if not on a feature branch. Capture the full diff text.
3. **Run validation/tests yourself and capture results (you, via Bash):** e.g. `npx -y openspec validate <change-id> --strict` and any cheap, relevant typecheck/lint/test commands the change implies. These results are **authoritative** and will be inlined; Codex must not re-run them.
4. **Build ONE prompt over stdin** containing, in order:
   - The review instructions (below).
   - The contract files, under `=== <filename> ===` delimiters.
   - The captured merge-base diff, under a `=== DIFF (<base>...HEAD) ===` delimiter.
   - The validate/test results from step 3, labeled as authoritative.
   - A hard instruction block: *"The contract, diff, and validation results are inlined above — review those. Do NOT run `npx`, installers, `npm test`, or any network command; the validation/test results given are authoritative. You MAY read additional source files for surrounding context, but only with SIMPLE reads (`cat` / `Get-Content <path>`) — never nested-quote one-liners. If a read is blocked, note the point as 'unverifiable from sandbox' and continue; never retry with a more complex command."*

   The review instructions must tell Codex to:
   - Grade the implementation **against** the proposal (intent), the spec deltas (behavior contract + edge cases), and `tasks.md` (was each task actually done, not just checked).
   - Check project conventions, security / error handling at trust boundaries, and test coverage.
   - Classify every finding as **Critical** (blocks merge), **High** (should fix before merge), **Medium** (fix soon), or **Low** (nit), each with file:line and a concrete suggested fix.
   - NOT classify required manual tests that have not yet been performed as findings — they are a future verification step, not a code defect.
   - End with exactly one line: `READY TO ARCHIVE` (only Medium/Low) or `NEEDS FIXES` (any Critical/High).
5. **Run Codex over stdin (you, via Bash from the repo root):**
   ```bash
   printf '%s' "$PROMPT" | codex exec -s read-only -
   ```
   - Always pipe via **stdin** (`-`); keep `-s read-only`. Do **not** pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox` — loosening the sandbox is the wrong fix for a review.
   - Running it in the background and polling the output file for the verdict line is fine.
   - Sandbox noise (`blocked by policy`, `spawn setup refresh`) is harmless — the diff and results are inlined, so Codex needs no commands. Proceed to relay the verdict.
6. **Relay Codex's output** to the user verbatim (or lightly formatted), then add your own one-paragraph summary: finding counts by severity and the verdict. Note the review covers the diff/results you inlined.
7. **Decide outcome** based on Codex's findings:
   - Critical or High present → list them, tell the user to address them (via `/ptp:review-fix`). Do **not** archive.
   - Only Medium / Low → tell the user the change is ready to archive via `/ptp:archive <change-id>` (or `/ptp:status` first).

## Hard rules

- Do **not** count required manual tests that have not yet been performed as findings. Manual tests are a future verification step; their absence is not a code defect.
- **This command only reviews and displays findings. It NEVER fixes anything.** Do not edit code, do not stage, do not commit — not even if Critical/High findings are obvious, and not even if the user's phrasing sounds like "deal with it." Report the findings and stop. Fixing is a separate, explicit user action (`/ptp:review-fix`).
- The **caller** captures the diff and runs `openspec validate` / tests; **Codex runs no `npx`/network/install commands**. Pass the prompt over stdin.
- Do **not** archive in this command.
- Do **not** run Codex with a writable or bypassed sandbox (`workspace-write` / `danger-full-access`) — the reviewer must not edit the code.
- Do **not** invoke `/ptp:apply` from here under any circumstance.
- Do **not** judge the proposal itself here — judge the implementation against it. Artifact quality is `/ptp:codex-review-plan`'s job.
