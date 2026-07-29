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

This command is **read-only** — it runs **no** branch guard (it never writes). Its review work runs
**at a deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`. The outer session
runs only the abort-guaranteeing preconditions first — the `codex --version` presence check (STOP if
missing), per resolved change the change-folder existence check, and selector disambiguation that must
STOP and ask the user — so a guaranteed abort never spawns a subagent. It then invokes
**`ptp-run-at-model`** with target `opus.high` and the work below (steps 1–7); that spawns one
foreground `opus` subagent (high effort directive) which does the Claude-side work — capturing the
diff/contract, building the closed-book prompt, running `codex exec -s read-only` over stdin (the
external `codex exec` remains a Bash subprocess governed by its own CLI config), and relaying +
classifying the findings — **fixing nothing**, and the subagent's outcome is relayed back per
`ptp-run-at-model`'s *Result relay*. (For a multi-change selector, the one subagent handles the whole
per-change pass.)

1. **Read the contract yourself (you, via Read):** `openspec/changes/<change-id>/` — `proposal.md`, `design.md`, `tasks.md`, and `specs/**/spec.md`. You will inline these so Codex grades against them without reading.
2. **Capture the diff scope (you, via Bash):** prefer the merge-base diff against main — `git merge-base HEAD master` then `git diff <base>...HEAD`. Fall back to the files the tasks touched if not on a feature branch. Capture the full diff text.
3. **Run validation/tests yourself and capture results (you, via Bash):** e.g. `npx -y openspec validate <change-id> --strict` and any cheap, relevant typecheck/lint/test commands the change implies. These results are **authoritative** and will be inlined; Codex must not re-run them.
4. **Build ONE prompt over stdin.**

   **Severity threshold (resolved caller-side, inlined as a literal).** Resolve `review.minSeverity`
   from layered ptp config **once**, at the start of this pass, and hold it fixed for the pass —
   global `~/.claude/ptp/config.json`, then project `<repo>/.claude/ptp/config.json` overriding,
   default `low`; a missing file, missing key, unparseable JSON, or unrecognized value falls back to
   the prior valid value (ultimately `low`) rather than erroring, and **never** STOPs the review. The
   `/ptp:config` parameter registry (`commands/config.md`, `skills/ptp-config/`) owns the key, its
   domain, and its validation — this is a pointer to that contract, not a second reader definition.
   **You** read the config, exactly as you read the diff and run the validation; **Codex is never
   asked to read `config.json`, to resolve the threshold, or to run any additional command** — the
   prompt is closed-book by design. Severity order is `low < medium < high < critical`. A finding is
   **actionable** when its severity is **at or above** the resolved threshold. Findings **below** the
   threshold are still classified and still listed under their own severity, marked *(below the
   configured `review.minSeverity` — reported, non-blocking)*; they never by themselves produce
   `NEEDS FIXES`. Because this verdict never counted Medium or Low toward its outcome, `low`,
   `medium`, and `high` behave identically here; only `critical` changes a verdict, by demoting High
   to reported-only — do **not** "repair" that apparent no-op by making Medium findings block. State
   the resolved threshold **and the layer it resolved from** (default / global / project) in your
   step-6 report, and when the threshold demoted at least one finding out of the blocking set, say so
   beside the verdict.

   The prompt contains, in order:
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
   - Honor the inlined severity threshold, stated as a literal line in the prompt:
     *"Severity threshold: `<T>`. Classify every finding Critical/High/Medium/Low as usual and list
     them all. Findings below `<T>` MUST be marked non-blocking and MUST NOT affect the verdict
     line. Do not read any config file and do not run any command to determine the threshold — the
     value above is authoritative."*
   - End with exactly one line: `READY TO ARCHIVE` (no **actionable** Critical/High) or `NEEDS FIXES` (any **actionable** Critical/High). The single-line-at-the-end format is unchanged — the verdict tokens and their placement are byte-identical to today; only which findings count toward them is qualified.
5. **Run Codex over stdin (you, via Bash from the repo root):**
   ```bash
   printf '%s' "$PROMPT" | codex exec -s read-only -
   ```
   Assemble the invocation per the `ptp-codex-mode` flag-append rule: append `-m <model>` and/or
   `-c model_reasoning_effort=<effort>` before the trailing `-` when `codex.model` /
   `codex.reasoningEffort` resolve to a set value; both unset yields exactly the invocation shown above.
   - Always pipe via **stdin** (`-`); keep `-s read-only`. Do **not** pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox` — loosening the sandbox is the wrong fix for a review.
   - Running it in the background and polling the output file for the verdict line is fine.
   - Sandbox noise (`blocked by policy`, `spawn setup refresh`) is harmless — the diff and results are inlined, so Codex needs no commands. Proceed to relay the verdict.
6. **Relay Codex's output** to the user verbatim (or lightly formatted), then add your own one-paragraph summary: the resolved threshold and the layer it came from, finding counts by severity (below-threshold findings still counted and listed, marked non-blocking), and the verdict. Note the review covers the diff/results you inlined. **Apply the threshold rule yourself** rather than trusting Codex's line blindly: if Codex's emitted verdict line disagrees with the threshold-correct verdict (for example it emits `NEEDS FIXES` for a finding set whose worst finding is a High that the resolved threshold demoted), **say so explicitly** and report the threshold-correct verdict.
7. **Decide outcome** based on Codex's findings, using the threshold-correct verdict from step 6:
   - **Actionable** Critical or High present → list them, tell the user to address them (via `/ptp:review-fix`). Do **not** archive.
   - Otherwise (only Medium / Low, or a High demoted below the threshold — Critical is actionable at every threshold) → report every finding, including the below-threshold ones under their own severity and marked non-blocking, and tell the user the change is ready to archive via `/ptp:archive <change-id>` (or `/ptp:status` first). A report in which every finding is below the threshold still enumerates those findings; it is never rendered as "no findings".

## Hard rules

- Do **not** count required manual tests that have not yet been performed as findings. Manual tests are a future verification step; their absence is not a code defect.
- **This command only reviews and displays findings. It NEVER fixes anything.** Do not edit code, do not stage, do not commit — not even if Critical/High findings are obvious, and not even if the user's phrasing sounds like "deal with it." Report the findings and stop. Fixing is a separate, explicit user action (`/ptp:review-fix`).
- The **caller** captures the diff, runs `openspec validate` / tests, **and resolves `review.minSeverity`**, inlining the resolved value as a literal; **Codex runs no `npx`/network/install commands** and is never asked to read `config.json` or resolve the threshold itself. Pass the prompt over stdin.
- Assemble the `codex exec` invocation per the `ptp-codex-mode` flag-append rule (append resolved `-m`/`-c` flags before the trailing `-` when `codex.model`/`codex.reasoningEffort` are configured).
- Do **not** archive in this command.
- Do **not** run Codex with a writable or bypassed sandbox (`workspace-write` / `danger-full-access`) — the reviewer must not edit the code.
- Do **not** invoke `/ptp:apply` from here under any circumstance.
- Do **not** judge the proposal itself here — judge the implementation against it. Artifact quality is `/ptp:codex-review-plan`'s job.
