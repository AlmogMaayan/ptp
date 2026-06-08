---
description: Review the OpenSpec change ARTIFACTS (proposal/design/tasks/spec deltas) using the external Codex CLI (codex exec) — read-only, no code
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN (omit to audit all active changes)"
---

You are running a **Codex-powered** variant of `/ptp:review-plan`. Instead of auditing the planning artifacts yourself, you delegate the artifact-quality audit to the external **Codex CLI** via `codex exec`, then relay and classify its findings. This is the pre-`apply` gate: it judges the *plan*, not the code.

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

1. **Resolve scope and gather artifacts (you, via Bash — not Codex).**
   - If `$ARGUMENTS` names a change, audit just it. If empty, run `npx -y openspec list` and audit **every** active change (repeat steps 2–4 per change; do not stop at the first).
   - For each change, read every artifact in `openspec/changes/<change-id>/`: `proposal.md`, `design.md` (if present), `tasks.md`, `specs/**/spec.md` (if present), `brainstorm.md` (if present), `TLDR.md` (if present).

2. **Run validation yourself and capture the result (you, via Bash):**
   - `npx -y openspec validate <change-id> --strict` — capture stdout+stderr and the exit status. This result is **authoritative**; Codex will be told it and instructed **not** to re-run it.

3. **Collect the cited source excerpts (you, via Read/Grep — optional but preferred).**
   - Scan the artifacts for source references of the form `path:line` (e.g. `IllustrationPicker.tsx:202`, `page.tsx:820`). For each distinct file, read a small window (±~15 lines) around each cited line, or the whole file if it is short.
   - This is what lets Codex verify line-reference accuracy without shelling out. If a cited file/line is missing, that is itself a finding worth surfacing — include what you found (or "NOT FOUND") so Codex can flag the drift.
   - Keep it proportionate: inline the excerpts the artifacts actually cite, not entire large files.

4. **Build ONE closed-book prompt** containing, in order:
   - The audit instructions (below).
   - The **authoritative** `openspec validate --strict` result from step 2.
   - The full text of every artifact, under clear `=== <filename> ===` delimiters.
   - The cited source excerpts from step 3, under `--- SOURCE <path> (around line N) ---` delimiters.
   - A hard instruction block: *"Do NOT run any commands. Review only the text provided above. The `openspec validate` result is given — do not attempt to run it. If a check needs data not provided here, report that point as 'unverifiable from provided context' rather than trying to run a command."*

   The audit instructions must tell Codex to:
   - Check `proposal.md` for required sections (Context, Goals, Non-goals, Alternatives considered, Design, Risks & edge cases, Impact, Success criteria, Source) and flag any missing or thin.
   - Check **cross-artifact consistency**: every Goal maps to ≥1 task; every spec-delta `### Requirement:` has an implementing task; proposal `Impact` names the capability the spec delta touches; `design.md` does not contradict `proposal.md`; the `Source` brainstorm path is referenced.
   - Check **spec-delta format**: `## ADDED/MODIFIED/REMOVED/RENAMED Requirements` → `### Requirement:` with SHALL/MUST → ≥1 `#### Scenario:` each.
   - Check **line-reference accuracy** against the inlined source excerpts (flag stale/ambiguous `path:line` citations).
   - Classify findings **Critical / High / Medium / Low**, each with the artifact + section and a concrete fix.
   - End with exactly one line: `VERDICT: PASS` | `VERDICT: WARN` | `VERDICT: FAIL`.

5. **Run Codex closed-book over stdin (you, via Bash from the repo root):**
   ```bash
   printf '%s' "$PROMPT" | codex exec -s read-only -
   ```
   - Always pipe the prompt via **stdin** (`-`), never as a quoted argv string — this avoids the argv quoting failures.
   - Keep `-s read-only`. Do **not** pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox` — loosening the sandbox is the wrong fix for a review.
   - `codex exec` may take a while; running it in the background and polling the output file for the `VERDICT:` line is fine.
   - If the run still emits sandbox noise (`blocked by policy`, `spawn setup refresh`), it does **not** matter: Codex needs no commands here, so those lines are harmless — proceed to relay the verdict and findings. The closed-book prompt means a clean audit even if Codex's shell is fully unavailable.

6. **Relay Codex's output** to the user, then add your own one-line summary with the verdict and finding counts. If you supplied the validate result and/or source excerpts, say so (the audit is only as current as what you inlined).

7. **Guidance, not a hard block**: a `WARN`/`FAIL` verdict means the user should re-run `/ptp:plan` (or `/ptp:review-fix` for targeted fixes) before `/ptp:apply`. It does **not** auto-block apply.

## Hard rules

- **This command only reviews and displays findings. It NEVER fixes anything.** Do not edit the artifacts, the code, or anything else — not even if findings are obvious. Report the findings and stop. To fix, the user runs `/ptp:review-fix` or re-runs `/ptp:plan`.
- This command reviews **artifacts only** — never code logic, never the implementation diff. That's `/ptp:codex-review`'s job. (Inlining source excerpts here is solely to verify the artifacts' line references, not to review the code.)
- The **caller** runs `openspec validate` and all file reads; **Codex runs no commands**. Pass the prompt over stdin.
- Do **not** run Codex with a writable or bypassed sandbox.
- Do **not** invoke `/ptp:apply` from here under any circumstance.
