---
name: ptp
description: Use this skill whenever the user is in a repo that has an `openspec/` directory AND is starting a non-trivial change (new feature, refactor, behavior change, ambiguous task). The skill routes brainstorming/planning/review to Superpowers and routes durable proposal/spec/tasks artifacts to OpenSpec. Trigger phrases include "let's design X", "I want to add X", "how should we approach X", "refactor X", or any time the user opens an OpenSpec change folder. Do NOT use for typos, one-line bug fixes, dependency bumps, or renames.
---

# ptp — Superpowers reasoning, OpenSpec artifacts

## Role split (memorize this)

| Concern                             | System          |
| ----------------------------------- | --------------- |
| Brainstorm, options, tradeoffs      | **Superpowers** |
| Design exploration, plan sketch     | **Superpowers** |
| Implementation plan                 | **Superpowers** |
| Artifact-quality review (pre-apply) | **Superpowers** |
| Code review                         | **Superpowers** |
| Confirm + fix review findings       | **Superpowers** |
| Change IDs                          | **OpenSpec**    |
| `proposal.md` / `design.md`         | **OpenSpec**    |
| `tasks.md` (execution order)        | **OpenSpec**    |
| Spec deltas under `specs/`          | **OpenSpec**    |
| `openspec validate --strict`        | **OpenSpec**    |
| Sync / archive of done changes      | **OpenSpec**    |

Superpowers decides **what should be done and why**.
OpenSpec **records the decision and controls execution order**.

## The flow

For any non-trivial change, route through these commands in order:

1. `/ptp:brainstorm "<request>"` *(optional, interactive)* — Superpowers brainstorm + options + tradeoffs with clarifying-question Q&A for a **specific change**. Derives a change-id and writes the result to `openspec/changes/<id>/brainstorm.md` (co-located with the change). Stops before writing the full OpenSpec artifacts. Use this when you want to think out loud with the user before committing to a direction.
   - `/ptp:brainstorm-only "<topic>"` *(optional, interactive)* — same brainstorm, but **change-agnostic**: for exploring a direction *before* it's a concrete change. Writes to the shared `openspec/brainstorms/` folder instead of a change folder. When the idea crystallizes into a change, `/ptp:plan` finds it there and copies it into the change folder.
2. `/ptp:plan [change-id]` — Autonomous end-to-end planning. If a design doc from step 1 exists, it's consumed as input. **If not, `/ptp:plan` runs brainstorming inline in autonomous mode** (no clarifying questions; documents assumptions instead), writes the design doc, then transcribes everything into `openspec/changes/<id>/proposal.md` / `design.md` / `tasks.md` / spec deltas, and runs `openspec validate <id> --strict`. Single invocation, no mid-flow prompts.
   - `/ptp:plan-multiple <change-id-or-request>` *(multi-change variant)* — for changes too big to plan and ship as one unit. Autonomously decomposes the work into a small set of coherent, independently-shippable slices (`XXXX_NN_<kebab-description>` under one freshly-allocated epic, e.g. `0001_01_landing-page-list-bulk-export`, `0001_02_landing-page-bulk-import`), **deletes the monolithic plan** if one was already created, then runs `/ptp:plan` for each slice in dependency order. If the change turns out not to be big enough to split, it falls back to a single `/ptp:plan`. No umbrella doc — the split rationale and inter-slice dependencies are cross-referenced inside each slice's `proposal.md`.
   - `/ptp:review-plan [change-id]` *(optional, read-only)* — Artifact-quality gate. Audits the planning artifacts (`proposal.md` / `design.md` / `tasks.md` / spec deltas) for completeness, cross-artifact consistency, spec-delta format, and validation — **before** any code is written. Omit the id to review all active changes. Reports findings + a PASS/WARN/FAIL verdict; it does **not** edit artifacts (re-run `/ptp:plan` to fix) and does **not** review code (that's step 4). Advisory: a non-PASS verdict does not hard-block `/ptp:apply`.
3. `/ptp:apply <change-id>` — Implement tasks sequentially. Check off each task only after it's verified.
4. `/ptp:review <change-id>` — Superpowers code review against the proposal, design, and spec deltas. Fix Critical + High before archiving.
   - `/ptp:review-fix [change-id]` *(optional, the fix counterpart to review)* — takes the findings of the **latest** review in the conversation (code **or** artifacts), independently **confirms** each one (rejecting false positives via the Superpowers `receiving-code-review` skill), and **fixes the confirmed ones** — code findings inline, artifact findings as targeted hand-edits. It then runs tests/lint/validate and reports. It is the **only** ptp command that edits in response to review findings; the review commands themselves never fix. Explicit-invocation only; never invokes `/ptp:apply` or `/ptp:plan`, never archives, never auto-commits.

   **Loop alternatives** — when you want the review→confirm→fix cycle automated rather than driven turn-by-turn, these commands iterate until zero open findings at all severities or the iteration cap (5) is hit. The same hard rules apply: no `/ptp:apply`, no archive, no auto-commit, no fixing unconfirmed findings, no counting manual-check / tests-required suggestions against convergence. Rejected findings carry over across iterations so they cannot cause infinite loops.

   - `/ptp:review-loop <change-id>` *(loop variant of `/ptp:review`)* — Superpowers code-review loop. Alternates review, confirmation, and inline code-fix passes automatically.
   - `/ptp:review-plan-loop <change-id>` *(loop variant of `/ptp:review-plan`)* — Superpowers artifact-review loop. Alternates the artifact-quality rubric, confirmation, and targeted artifact-fix passes automatically. Per-iteration verification is `openspec validate --strict`.
   - `/ptp:review-full <change-id>` *(full dual-reviewer variant of `/ptp:review-loop`)* — Runs the Superpowers code-review loop to convergence, then the Codex code-review loop to convergence, in a single invocation. Phase 2 starts only if Phase 1 terminates DONE. Requires the `codex` CLI on PATH; checked before Phase 1 begins.
   - `/ptp:review-plan-full <change-id>` *(full dual-reviewer variant of `/ptp:review-plan-loop`)* — Same two-phase pattern for artifact review: Superpowers artifact loop → Codex artifact loop. Phase 2 starts only if Phase 1 terminates DONE. Requires the `codex` CLI on PATH; checked before Phase 1 begins.
5. `/ptp:archive <change-id>` — enforce the archive gates (tasks checked, review clean, validation passes), then `openspec archive` to move the change and sync delta specs into the main specs.
   - `/ptp:archive-force [change-id]` *(escape hatch)* — bypasses the three archive gates (tasks-complete, review-clean, validation-passes) but still syncs delta specs. Use for abandoned, superseded, or done-but-never-reviewed changes. Empty argument = all active changes (with one-time scope-confirmation stop). Always reports which gates were bypassed — force is never silent. `/ptp:archive` remains the default safe path.

`/ptp:status [change-id]` is a read-only command that tells the user where they are in the flow and what to run next.

`/ptp:analyze "<subject>"` is an auxiliary, epic-less, diagnostic command. Use it to root-cause a bug, explain an observed behavior, or investigate a subsystem *before* deciding whether a change is warranted. It writes a structured analysis doc to `openspec/analysis/` and never produces a change proposal or modifies source. Contrast with `/ptp:brainstorm-only`, which explores *prospective* design options — `/ptp:analyze` diagnoses an *existing* phenomenon.

`/ptp:master` is an auxiliary utility command — a "return to clean master" convenience. Use it after a change is merged/archived and you want to switch back to `master` and pull the latest. It runs only when the working tree is clean (empty `git status --porcelain --untracked-files=all`), uses `--ff-only` so it can never create a merge commit, and is **exempt from `ptp-branch-guard`** (its purpose is to land on master, not leave it).

`/ptp:deploy` is the terminal **"ship it"** step — the one ptp command that deliberately
commits, pushes, and merges. After a change is applied and reviewed (and typically archived),
run it from the feature branch to commit → push → open a PR → squash-merge to `master` → delete
the branch → run the project's deploy CI/CD action → fix conflicts/CI/deploy failures within a
bounded retry budget → return to a clean `master` (via `/ptp:master`). It **never self-approves**
(GitHub forbids approving your own PR) and merges straight through whenever the repo doesn't
*require* an approving review; if branch protection requires one it stops at the open PR, and
`/ptp:deploy-pr-approved` finishes the merge+deploy after a *different* collaborator approves. It
refuses to run on `master`/`main` (the inverse of `/ptp:master`) and is a documented special case in
`ptp-branch-guard`. See the README Configuration section for the `deploy` block.

### Codex-powered review alternatives (external second opinion)

These commands delegate review to the external **Codex CLI** (`codex exec -s read-only "<prompt>"`) instead of the Superpowers code-review skill. Use them when you want an independent reviewer (a different model/agent) as a second opinion. The single-shot variants (`codex-review`, `codex-review-plan`, `codex-review-uncommitted`) only review and display findings — **they NEVER fix anything.** Codex runs read-only and never edits code or artifacts; applying any fix is always a separate, explicit user action — `/ptp:review-fix`, which independently confirms each Codex finding before touching anything.

- `/ptp:codex-review <change-id>` — Codex variant of step 4: grades the implemented diff against the change's proposal/design/spec deltas.
- `/ptp:codex-review-plan <change-id>` — Codex variant of `/ptp:review-plan`: audits the OpenSpec **artifacts** (proposal/design/tasks/spec deltas) only, no code.
- `/ptp:codex-review-uncommitted [change-id]` — Codex review of the **uncommitted** working-tree changes only (staged + unstaged + untracked); for catching issues mid-implementation before committing.
- `/ptp:codex-review-loop <change-id>` *(loop variant of `/ptp:codex-review`)* — Codex code-review loop; same posture as `/ptp:review-loop` but the reviewer is Codex. Caller inlines diff + validation results each iteration; Codex runs no `npx`/network/install commands.
- `/ptp:codex-review-plan-loop <change-id>` *(loop variant of `/ptp:codex-review-plan`)* — Codex artifact-review loop; caller assembles the closed-book prompt each iteration; Codex runs no commands.
- `/ptp:review-full <change-id>` *(full dual-reviewer code-review loop)* — Superpowers code-review loop followed by Codex code-review loop in a single invocation; both must converge. Phase 2 (Codex) starts only if Phase 1 (Superpowers) terminates DONE. Unlike the single-shot commands, this loop does fix confirmed findings inline.
- `/ptp:review-plan-full <change-id>` *(full dual-reviewer artifact-review loop)* — Same two-phase pattern for artifact review: Superpowers artifact loop → Codex artifact loop; Phase 2 starts only if Phase 1 terminates DONE.

Requires the `codex` CLI on PATH. The single-shot and pure-Codex-loop commands (`codex-review`, `codex-review-plan`, `codex-review-uncommitted`, `codex-review-loop`, `codex-review-plan-loop`) supplement, not replace, the Superpowers review steps — the role split above still holds. The `-full` commands (`review-full`, `review-plan-full`) are self-contained: each runs the Superpowers loop as Phase 1 and the Codex loop as Phase 2, so they replace separately running both loops.

### When to use `/ptp:brainstorm` vs jumping straight to `/ptp:plan`

- **Use `/ptp:brainstorm` first** when the request is ambiguous, you want to compare options interactively, or the user explicitly asks to think before planning.
- **Jump straight to `/ptp:plan`** when the request is concrete enough that autonomous assumptions are acceptable. `/ptp:plan` will still produce a design doc (via inline autonomous brainstorming) — you just won't be consulted while it's being written.

## Branch safety

Every ptp step that **creates or updates files** runs the **`ptp-branch-guard`** preamble as its first write-affecting action: if HEAD is on `master`, it derives a feature-branch name from the change's context and launches the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** any file is written; if you are already on a feature branch, it is a no-op and you proceed on that branch. The read-only review/status steps skip it. The rule — including the exact write-capable/read-only split and the order relative to a command's own preconditions — is defined once in the **`ptp-branch-guard`** skill; every write-capable command references it rather than restating it.

## Artifact chain

Each step produces a durable artifact the next step reads. **Downstream steps refuse to proceed if the upstream artifact is missing** — no fabricating, no shortcutting.

| Step | Produces | Consumed by |
| ---- | -------- | ----------- |
| `/ptp:brainstorm` | `openspec/changes/<id>/brainstorm.md` (alternatives, tradeoffs, recommended approach, success criteria) | `/ptp:plan` |
| `/ptp:brainstorm-only` *(optional)* | `openspec/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md` (change-agnostic exploration) | `/ptp:plan` (copies it into the change folder) |
| `/ptp:plan` | `openspec/changes/<id>/proposal.md` (with required sections: Context, Goals, Non-goals, Alternatives, Design, Risks, Impact, Success criteria, Source), `tasks.md`, `design.md`, spec deltas, `effort.md` (machine-readable apply recommendation; first line `{model}.{effort}`), `TLDR.md` (human-facing at-a-glance summary — not an apply input) | `/ptp:review-plan`, `/ptp:apply`, `/ptp:review` |
| `/ptp:plan-multiple` *(variant of `/ptp:plan`)* | several sibling change folders `XXXX_NN_<id>` under one epic (each the full `/ptp:plan` output, cross-referencing its siblings); deletes the monolithic folder if one existed | `/ptp:apply` (one slice at a time, in story order) |
| `/ptp:review-plan` *(optional)* | artifact-review notes; verdict PASS/WARN/FAIL; Critical/High to fix by re-running `/ptp:plan` | `/ptp:apply` (advisory — does not hard-block) |
| `/ptp:apply` | source-code changes; checked tasks in `tasks.md` | `/ptp:review` |
| `/ptp:review` | review notes; Critical/High to fix | `/ptp:archive` (or `/ptp:review-fix` to act on the findings) |
| `/ptp:review-fix` *(optional)* | confirmed findings fixed in place (code inline / artifacts hand-edited); rejected findings reported; tests/lint/validate run | re-review, then `/ptp:archive` |
| `/ptp:review-loop` *(optional)* | zero-or-cap residual findings (no new persistent files — state is in-conversation only); same result as manually alternating `/ptp:review` + `/ptp:review-fix` until clean | `/ptp:archive` |
| `/ptp:codex-review-loop` *(optional)* | same as `/ptp:review-loop` but reviewer is Codex | `/ptp:archive` |
| `/ptp:review-plan-loop` *(optional)* | zero-or-cap residual artifact findings (no new persistent files); same result as manually alternating `/ptp:review-plan` + `/ptp:review-fix` until clean | `/ptp:apply` |
| `/ptp:codex-review-plan-loop` *(optional)* | same as `/ptp:review-plan-loop` but reviewer is Codex | `/ptp:apply` |
| `/ptp:review-full` *(optional)* | Phase 1 (Superpowers) + Phase 2 (Codex) combined code-review summary; zero-or-cap residual findings per phase | `/ptp:archive` |
| `/ptp:review-plan-full` *(optional)* | Phase 1 (Superpowers) + Phase 2 (Codex) combined artifact-review summary; zero-or-cap residual findings per phase | `/ptp:apply` |

### Why this matters

If `/ptp:plan` runs on the raw user request (no brainstorming artifact), the `proposal.md` will be thin — it will name what was built but not record *why this approach, what alternatives lost, what could go wrong*. That defeats the entire purpose of OpenSpec as a durable design record. **Superpowers brainstorming is the source of depth; OpenSpec is the format for persisting it. You need both.**

## Change ids & selectors

Every change born through the ptp flow is named `XXXX_NN_<kebab-description>` — a 4-digit zero-padded epic, a 2-digit zero-padded story, and a kebab description (e.g. `0001_01_landing-page-list-bulk-export`). The full id format, selector grammar, resolution algorithm, and epic allocation are defined in exactly one place — the **`ptp-change-selector`** skill — and every command that takes a change argument resolves it through that skill rather than restating the rules.

Quick selector reference:

| Form | Resolves to |
| ---- | ----------- |
| `epic:XXXX` | All active changes in epic `XXXX`, ascending by story |
| `epic:XXXX story:NN` | The single change `XXXX_NN_*` |
| `story:NN` | The one active change with that story (if unambiguous) |
| bare id | That one change by exact folder match |
| empty | Command's own existing default |

Legacy ids (pre-epic `NN_…` or plain `kebab` ids) still resolve by exact match only.

## Conflict-resolution rule

If OpenSpec's own prompts conflict with Superpowers reasoning:

- **Superpowers wins** for *reasoning process*.
- **OpenSpec wins** for *artifact format, validation, and lifecycle*.

## Hard prohibitions

- **Never** invoke `/openspec:propose` or `/openspec:explore` as the primary planning step — that is what `/ptp:brainstorm` and `/ptp:plan` replace.
- **Never** start implementation directly from OpenSpec explore/propose output.
- **Never** edit OpenSpec's managed/regenerated instruction blocks.
- **Never** skip `openspec validate <id> --strict` before implementation.
- **Never** archive a change with unchecked tasks or unresolved Critical/High review findings.
- **Never** write `proposal.md` content from the raw user request — it must come from brainstorming output (a change-scoped `openspec/changes/<id>/brainstorm.md`, a general `openspec/brainstorms/*-brainstorm.md`, or one produced inline by `/ptp:plan` in autonomous mode). Going straight from request → proposal.md produces thin records that defeat OpenSpec's purpose.
- **Never** stop `/ptp:plan` to ask the user to run `/ptp:brainstorm` first. If the design doc is missing, run brainstorming inline (autonomous mode) and continue. The user opted into end-to-end execution by invoking `/ptp:plan`.
- **Never** ask the user clarifying questions during `/ptp:plan` execution. Make reasonable assumptions and document them in the design doc / proposal so the user can correct course at review time.
- **Never** invoke or trigger `/ptp:apply` automatically — not after `/ptp:plan` completes, not after `/ptp:review` findings, not in response to "fix the findings" or any other implicit prompt. `/ptp:apply` runs **only** when the user explicitly types `/ptp:apply <change-id>`. When review findings need fixing, apply the fixes inline (edit the code directly) without invoking the apply command — or, when the user explicitly types `/ptp:review-fix`, let that command confirm and fix them (it also never calls `/ptp:apply`).
- **Never** trigger `/ptp:review-fix` automatically. Like the review and apply commands, it runs **only** on explicit user invocation; a review command finishing, or the user saying "fix the findings" to a review command, does not invoke it. The review commands report and stop; fixing is always a separate, deliberate `/ptp:review-fix` (or inline edit).
- **Never** write ptp files (planning artifacts, code, inline review fixes, or archive moves) onto `master`. Every write-capable step runs the `ptp-branch-guard` preamble first; on `master` it cuts a feature branch via the `ptp-branch-prep` workflow before writing. Already on a feature branch → no-op (proceed on it). Read-only review/status commands are exempt. The full rule lives in the `ptp-branch-guard` skill. The sole command that *does* commit/push/merge — `/ptp:deploy` — is the documented exception: it ships an already-cut feature branch and still never commits directly to `master` (its deploy-fixes go through `ptp/deploy-fix-*` PR mini-flows).

## When the user just asks for something directly

If the user types `/ptp:apply X` without going through brainstorm/plan first, **check** whether `openspec/changes/<X>/` exists and is valid. If not, redirect them to `/ptp:brainstorm` first instead of fabricating a change folder.

## Triviality exception

Typos, comment fixes, dependency bumps, renames, and single-line bug fixes: skip the flow. Edit directly. The flow exists for changes that warrant a spec delta.
