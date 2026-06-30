---
description: Review an epic's PRD (openspec/changes/<id>/prd.md) using the external Codex CLI (codex exec) — read-only, single-pass, closed-book, no openspec validate
argument-hint: "<epic-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN (omit to audit all active epics' PRDs)"
---

You are running a **Codex-powered** variant of `/ptp:review-prd`. Instead of auditing the epic PRD
yourself, you delegate the PRD-quality audit to the external **Codex CLI** via `codex exec`, then relay
and classify its findings. This is the pre-`/ptp:plan` PRD gate: it judges the *PRD*, not the artifacts
or the code.

## Inputs

Epic selector: $ARGUMENTS  (omit to audit **all** active epics' PRDs)

Resolve `$ARGUMENTS` via the `ptp-prd` selector→epic projection (a bare id / `story:NN` → the change's
epic; `epic:XXXX` → that epic; `epic:all` / omitted → all active epics). If it resolves to more than
one epic, run the steps below for each, in epic order, reporting per epic. A legacy/unprefixed id that
cannot project to an epic is reported unsupported and skipped (per `ptp-prd`).

## Preconditions

- The `codex` CLI must be on PATH (`codex --version`). If missing, STOP and tell the user to install it
  — do **not** silently fall back to a different reviewer.
- For each targeted epic, resolve the PRD at `openspec/changes/<id>/prd.md` (where `<id>` is the
  epic's lowest-numbered story across active + archived changes, per `ptp-prd`). A **missing PRD file
  is NOT an abort**: surface it to Codex as a Critical "no PRD to review" finding in the prompt (in
  place of the PRD text), mirroring the single-pass `/ptp:review-prd` gate.

## Why this command is "closed-book"

Codex runs under `codex exec -s read-only` with `approval: never`. On Windows it shells out via
`pwsh -Command "…"`, and three things reliably break a run:

1. **`npx` / `openspec` are network/install commands** → the read-only sandbox auto-denies them (no
   human to approve).
2. **Nested-quote PowerShell one-liners** get mangled through Bash → `codex exec` → `pwsh` and are
   rejected by policy.
3. The **Windows sandbox child-process spawn** occasionally fails transiently
   (`windows sandbox: spawn setup refresh`).

So **the caller (you) does all the file reading**, and hands Codex a single self-contained prompt over
**stdin**. Codex executes **no commands** — it only reads the text you provide. This removes all three
failure modes.

**Divergence from `/ptp:codex-review-plan`:** that command runs `npx -y openspec validate <id>
--strict` itself and inlines the authoritative result into the prompt. **This command runs NO
`openspec validate`** — a PRD precedes any proposal/spec, so there is nothing to validate. There is no
validate result to inline; do not add one.

## Steps

This command is **read-only** — it runs **no** branch guard (it never writes). Its PRD-audit work runs
**at a deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`. The outer session
runs only the abort-guaranteeing preconditions first — the `codex --version` presence check (STOP if
missing) and selector disambiguation that must STOP and ask the user — while the empty-argument
audit-all-active-epics default is preserved (the per-epic PRD-existence check is **not** an abort; a
missing PRD is surfaced in the prompt). It then invokes **`ptp-run-at-model`** with target `opus.high`
to run the work below **over the already-resolved scope**; that spawns one foreground `opus` subagent
(high effort directive) which does the Claude-side work — reading the PRD, building the closed-book
prompt, running `codex exec -s read-only` over stdin (the external `codex exec` remains a Bash
subprocess governed by its own CLI config), and relaying + classifying the verdict — **editing
nothing**, and the subagent's outcome is relayed back per `ptp-run-at-model`'s *Result relay*. (For a
multi-epic or empty-argument audit-all selector, the one subagent handles the whole per-epic pass.)

1. **Resolve scope and read the PRD (you, via Read/Bash — not Codex).**
   - If `$ARGUMENTS` names an epic, audit just it. If empty, audit **every** active epic's PRD (repeat
     steps 2–4 per epic; do not stop at the first).
   - For each epic, resolve `openspec/changes/<id>/prd.md` and read it. If the file is absent, note
     "NO PRD — Critical: no PRD to review" in place of the PRD text (do **not** abort).

2. **Collect any cited context (you, via Read/Grep — optional).**
   - If the PRD cites source files or other docs, read a small window around each citation so Codex can
     judge them without shelling out. Keep it proportionate.

3. **Build ONE closed-book prompt** containing, in order:
   - The audit instructions (below).
   - The full text of the PRD under a clear `=== prd.md (<epic> epic) ===` delimiter (or the missing-PRD
     note from step 1).
   - Any cited excerpts from step 2, under `--- SOURCE <path> (around line N) ---` delimiters.
   - A hard instruction block: *"Do NOT run any commands. Review only the text provided above. There is
     no `openspec validate` to run (a PRD precedes any proposal/spec). If a check needs data not
     provided here, report that point as 'unverifiable from provided context' rather than trying to run
     a command."*

   The audit instructions must tell Codex to apply the **PRD rubric**:
   - Check **schema completeness**: Problem/Why, Goals, Non-goals, Scope, Users/Stakeholders,
     Requirements (functional + non-functional), Acceptance criteria, Dependencies, Risks, Open
     questions — each present and non-placeholder.
   - Check **acceptance criteria are specific & testable**.
   - Check **requirements trace to Goals** and are split functional/non-functional.
   - Check **Scope vs Non-goals consistency** and that **Goals are measurable outcomes** (not restated
     headings).
   - Treat a **missing PRD** as a Critical "no PRD to review" finding.
   - Classify findings **Critical / High / Medium / Low**, each with the section and a concrete fix.
   - End with exactly one line: `VERDICT: PASS` | `VERDICT: WARN` | `VERDICT: FAIL`.

4. **Run Codex closed-book over stdin (you, via Bash from the repo root):**
   ```bash
   printf '%s' "$PROMPT" | codex exec -s read-only -
   ```
   - Always pipe the prompt via **stdin** (`-`), never as a quoted argv string.
   - Keep `-s read-only`. Do **not** pass `--full-auto`, `--sandbox workspace-write`, or
     `--dangerously-bypass-approvals-and-sandbox` — loosening the sandbox is the wrong fix for a review.
   - If the run emits sandbox noise (`blocked by policy`, `spawn setup refresh`), it does **not** matter:
     Codex needs no commands here, so those lines are harmless — proceed to relay the verdict.

5. **Relay Codex's output** to the user, then add your own one-line summary with the verdict and finding
   counts per epic.

6. **Guidance, not a hard block:** a `WARN`/`FAIL` verdict means the user should re-run `/ptp:prd
   <epic>` (or `/ptp:codex-review-prd-loop` for targeted inline fixes) before `/ptp:plan`. It does
   **not** auto-block `/ptp:plan`.

## Hard rules

- **This command only reviews and displays findings. It NEVER fixes anything.** Do not edit the PRD or
  any other file — not even if findings are obvious. Report the findings and stop. To fix, the user
  runs `/ptp:codex-review-prd-loop` or re-runs `/ptp:prd`.
- This command reviews the **PRD only** — never the OpenSpec artifacts, never code.
- The **caller** does all file reads; **Codex runs no commands** (no `npx`, no `openspec validate`, no
  network, no installs). Pass the prompt over stdin.
- Do **not** run `openspec validate` — a PRD precedes any proposal/spec (the one divergence from
  `/ptp:codex-review-plan`).
- Do **not** run Codex with a writable or bypassed sandbox.
- Do **not** invoke `/ptp:plan` or `/ptp:prd` from here under any circumstance.
