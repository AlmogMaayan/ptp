---
description: Review the OpenSpec change ARTIFACTS (proposal/design/tasks/spec deltas) using the external Codex CLI (codex exec) — read-only, no code
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN (omit to audit all active changes)"
---

You are running a **Codex-powered** variant of `/ptp:review-plan`. Instead of auditing the planning artifacts yourself, you delegate the artifact-quality audit to the external **Codex CLI** via `codex exec`, then relay and classify its findings. This is the pre-`apply` gate: it judges the *plan*, not the code.

This command never fixes, so the fix-target contract in `ptp-review-loop` is a **no-op** here: no
fix pass is dispatched and this command's `opus.high` review target is unchanged.

## Inputs

Change id: $ARGUMENTS  (omit to audit **all** active changes under `openspec/changes/`)

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change. Preserve the existing empty-argument default: omitting `$ARGUMENTS` audits all active changes.

## Preconditions

- The `codex` CLI must be on PATH (`codex --version`). If missing, STOP and tell the user to install it.
- The target `openspec/changes/<change-id>/` (or at least one active change) must exist.

## Why this command is "closed-book"

Codex runs under `codex exec -s read-only` with `approval: never`. On Windows it shells out via `pwsh -Command "…"`, and three things reliably break a run:

1. **`npx` / `openspec` are network/install commands** → the read-only sandbox auto-denies them (no human to approve).
2. **Nested-quote PowerShell one-liners** (the kind Codex generates to read files with line numbers) get mangled through Bash → `codex exec` → `pwsh` and are rejected by policy.
3. The **Windows sandbox child-process spawn** occasionally fails transiently (`windows sandbox: spawn setup refresh`).

So **the caller (you) does all the file reading and validation**, and hands Codex a single self-contained prompt over **stdin**. Codex executes **no commands** — it only reads the text you provide. This removes all three failure modes. The trade-off (Codex can't independently open source files to verify line references) is covered by inlining the cited source excerpts into the prompt.

## Steps

This command is **read-only** — it runs **no** branch guard (it never writes). Its artifact-audit
work runs **at a deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`. The outer
session runs only the abort-guaranteeing preconditions first — the `codex --version` presence check
(STOP if missing), per resolved change the change-folder existence check, and selector disambiguation
that must STOP and ask the user — while the empty-argument audit-all-active default is preserved (see
*Inputs* and step 1). It then invokes **`ptp-run-at-model`** with target `opus.high` to run the work
below **over the already-resolved scope** (steps 2–7 plus the artifact-gathering half of step 1; step
1's scope resolution and its STOP-and-ask disambiguation are the outer precondition above, so the
subagent does not re-decide scope); that spawns one foreground `opus` subagent (high effort directive)
which does the Claude-side work — gathering artifacts, building the closed-book prompt, running `codex exec -s
read-only` over stdin (the external `codex exec` remains a Bash subprocess governed by its own CLI
config), and relaying + classifying the verdict — **editing nothing**, and the subagent's outcome is
relayed back per `ptp-run-at-model`'s *Result relay*. (For a multi-change or empty-argument audit-all
selector, the one subagent handles the whole per-change pass.)

1. **Resolve scope and gather artifacts (you, via Bash — not Codex).**
   - If `$ARGUMENTS` names a change, audit just it. If empty, run `npx -y openspec list` and audit **every** active change (repeat steps 2–4 per change; do not stop at the first).
   - For each change, read every artifact in `openspec/changes/<change-id>/`: `proposal.md`, `design.md` (if present), `tasks.md`, `specs/**/spec.md` (if present), `brainstorm.md` (if present), `TLDR.md` (if present).

2. **Run validation yourself and capture the result (you, via Bash):**
   - `npx -y openspec validate <change-id> --strict` — capture stdout+stderr and the exit status. This result is **authoritative**; Codex will be told it and instructed **not** to re-run it.

3. **Collect the cited source excerpts (you, via Read/Grep — optional but preferred).**
   - Scan the artifacts for source references of the form `path:line` (e.g. `IllustrationPicker.tsx:202`, `page.tsx:820`). For each distinct file, read a small window (±~15 lines) around each cited line, or the whole file if it is short.
   - This is what lets Codex verify line-reference accuracy without shelling out. If a cited file/line is missing, that is itself a finding worth surfacing — include what you found (or "NOT FOUND") so Codex can flag the drift.
   - Keep it proportionate: inline the excerpts the artifacts actually cite, not entire large files.

4. **Build ONE closed-book prompt.**

   **Severity threshold (resolved caller-side, inlined as a literal).** Resolve `review.minSeverity`
   from layered ptp config **once**, at the start of this pass, and hold it fixed for the pass —
   global `~/.claude/ptp/config.json`, then project `<repo>/.claude/ptp/config.json` overriding,
   default `low`; a missing file, missing key, unparseable JSON, or unrecognized value falls back to
   the prior valid value (ultimately `low`) rather than erroring, and **never** STOPs the review. The
   `/ptp:config` parameter registry (`commands/config.md`, `skills/ptp-config/`) owns the key, its
   domain, and its validation — this is a pointer to that contract, not a second reader definition.
   **You** read the config, exactly as you run the validation and read the artifacts; **Codex is
   never asked to read `config.json`, to resolve the threshold, or to run any command** — the prompt
   is closed-book by design. Severity order is `low < medium < high < critical`. A finding is
   **actionable** when its severity is **at or above** the resolved threshold. Findings **below** the
   threshold are still classified and still listed under their own severity, marked *(below the
   configured `review.minSeverity` — reported, non-blocking)*; they never by themselves produce a
   `WARN` or a `FAIL`. Because this verdict never counted Medium or Low toward its outcome, `low`,
   `medium`, and `high` behave identically here; only `critical` changes a verdict, by demoting High
   to reported-only — do **not** "repair" that apparent no-op by making Medium findings `WARN`. State
   the resolved threshold **and the layer it resolved from** (default / global / project) in your
   step-6 summary, and when the threshold demoted at least one finding out of the blocking set, say
   so beside the verdict. One threshold governs the whole pass, including an empty-argument
   audit-all run, so the per-change verdicts can never mix thresholds.

   The prompt contains, in order:
   - The audit instructions (below).
   - The **authoritative** `openspec validate --strict` result from step 2.
   - The full text of every artifact, under clear `=== <filename> ===` delimiters.
   - The cited source excerpts from step 3, under `--- SOURCE <path> (around line N) ---` delimiters.
   - A hard instruction block: *"Do NOT run any commands. Review only the text provided above. The `openspec validate` result is given — do not attempt to run it. If a check needs data not provided here, report that point as 'unverifiable from provided context' rather than trying to run a command."*

   The audit instructions must tell Codex to:
   - Check `proposal.md` for required sections (Context, Goals, Non-goals, Alternatives considered, Design, Risks & edge cases, Impact, Success criteria, Source) and flag any missing or thin.
   - Check **cross-artifact consistency**: every Goal maps to ≥1 task; every spec-delta `### Requirement:` has an implementing task; proposal `Impact` names the capability the spec delta touches; `design.md` does not contradict `proposal.md`; the `Source` brainstorm path is referenced.
   - Check **spec-delta format**: `## ADDED/MODIFIED/REMOVED/RENAMED Requirements` → `### Requirement:` with SHALL/MUST → ≥1 `#### Scenario:` each.
   - Check `tasks.md` for **banned manual tasks**: flag any checkbox whose completion depends on a
     person acting **outside the reach of the agent** that runs `/ptp:apply` — the test is *who must
     act*, never which words appear (illustrations: manual QA; manual or exploratory testing;
     "manually verify"; "verify by hand"; "check in the browser"; "have a human confirm"; "ask the
     user to try"; "visually inspect"; a human sign-off step; "test on a physical device"). One
     **narrow** exception: a task that authors an automated test, or runs a command and asserts on
     its output, is fine even when its prose describes user-facing behavior — but it applies only
     where the checkbox is otherwise completable by the agent unaided, and the executor test
     applies to the checkbox **as a whole**, so a checkbox that authors a test *and* also asks a
     human to perform, observe, or confirm anything is still flagged. Classify such a finding
     **High**, quote the **exact offending checkbox** as a task line inside the change's own
     `tasks.md`, and state an intent-preserving remedy that is a concrete edit to that same
     `tasks.md`: substitute an automatable replacement checkbox (where an existing task already
     carries the intent, fold the offending checkbox into that task), else — only when no automated
     equivalent exists — remove the checkbox from `tasks.md` and record its intent in
     `proposal.md > Success criteria` as a non-checkbox note. Never state the remedy as deletion.
     The evidence is the `tasks.md` text already inlined below; run no command and read no file for
     this check.
   - Check **line-reference accuracy** against the inlined source excerpts (flag stale/ambiguous `path:line` citations).
   - Classify findings **Critical / High / Medium / Low**, each with the artifact + section and a concrete fix.
   - Honor the inlined severity threshold, stated as a literal line in the prompt:
     *"Severity threshold: `<T>`. Classify every finding Critical/High/Medium/Low as usual and list
     them all. Findings below `<T>` MUST be marked non-blocking and MUST NOT affect the verdict
     line. Do not read any config file and do not run any command to determine the threshold — the
     value above is authoritative."*
   - End with exactly one line: `VERDICT: PASS` | `VERDICT: WARN` | `VERDICT: FAIL`, computed as
     `FAIL` = any **actionable** Critical; `WARN` = any **actionable** High with no actionable
     Critical; `PASS` otherwise. The `VERDICT:` line's shape is **byte-identical** to today (this
     command polls the output file for it); only which findings count toward it is qualified.

5. **Run Codex closed-book over stdin (you, via Bash from the repo root):**
   ```bash
   printf '%s' "$PROMPT" | codex exec -s read-only -
   ```
   Assemble the invocation per the `ptp-codex-mode` flag-append rule: append `-m <model>` and/or
   `-c model_reasoning_effort=<effort>` before the trailing `-` when `codex.model` /
   `codex.reasoningEffort` resolve to a set value; both unset yields exactly the invocation shown above.
   - Always pipe the prompt via **stdin** (`-`), never as a quoted argv string — this avoids the argv quoting failures.
   - Keep `-s read-only`. Do **not** pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox` — loosening the sandbox is the wrong fix for a review.
   - `codex exec` may take a while; running it in the background and polling the output file for the `VERDICT:` line is fine.
   - If the run still emits sandbox noise (`blocked by policy`, `spawn setup refresh`), it does **not** matter: Codex needs no commands here, so those lines are harmless — proceed to relay the verdict and findings. The closed-book prompt means a clean audit even if Codex's shell is fully unavailable.

6. **Relay Codex's output** to the user, then add your own one-line summary with the resolved threshold and the layer it came from, the verdict, and finding counts by severity (below-threshold findings still counted and listed, marked non-blocking; an all-below-threshold report still enumerates them and is never rendered as "no findings"). If you supplied the validate result and/or source excerpts, say so (the audit is only as current as what you inlined). **Apply the threshold rule yourself** rather than trusting Codex's line blindly: if Codex's emitted `VERDICT:` line disagrees with the threshold-correct verdict (for example `VERDICT: WARN` for a High the resolved threshold demoted), **say so explicitly** and report the threshold-correct verdict.

7. **Guidance, not a hard block**: a threshold-correct `WARN`/`FAIL` verdict (per step 6) means the user should re-run `/ptp:plan` (or `/ptp:review-fix` for targeted fixes) before `/ptp:apply`. It does **not** auto-block apply. The threshold changes which findings produce that verdict; it does not make this gate any more or less blocking than it is today.

## Hard rules

- **This command only reviews and displays findings. It NEVER fixes anything.** Do not edit the artifacts, the code, or anything else — not even if findings are obvious. Report the findings and stop. To fix, the user runs `/ptp:review-fix` or re-runs `/ptp:plan`.
- This command reviews **artifacts only** — never code logic, never the implementation diff. That's `/ptp:codex-review`'s job. (Inlining source excerpts here is solely to verify the artifacts' line references, not to review the code.)
- The **caller** runs `openspec validate`, all file reads, **and the `review.minSeverity` resolution**, inlining the resolved value as a literal; **Codex runs no commands** and is never asked to read `config.json` or resolve the threshold itself. Pass the prompt over stdin.
- Assemble the `codex exec` invocation per the `ptp-codex-mode` flag-append rule (append resolved `-m`/`-c` flags before the trailing `-` when `codex.model`/`codex.reasoningEffort` are configured).
- Do **not** run Codex with a writable or bypassed sandbox.
- Do **not** invoke `/ptp:apply` from here under any circumstance.
