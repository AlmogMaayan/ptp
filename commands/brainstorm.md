---
description: Explore options and tradeoffs for one specific change, writing a brainstorm beside its artifacts
argument-hint: "<short description of the change> [change-id] (change-id optional — derived from the request if omitted)"
---

You are starting **step 1** of the ptp flow. Your job is to **brainstorm using the `ptp-brainstorming` skill** for a specific change, persist the result **inside that change's folder**, then stop. Do **not** create full OpenSpec artifacts (`proposal.md` / `design.md` / `tasks.md` / spec deltas) in this step — only `brainstorm.md`.

> Brainstorming something that is **not** yet tied to a specific change (open-ended exploration, comparing directions before you know what the change even is)? Use `/ptp:brainstorm-only` instead — it writes to the shared `openspec/brainstorms/` folder.

## Inputs

Request: $ARGUMENTS (a short description, optionally followed by an explicit change-id, and optionally
an anywhere-in-text `model:<sonnet|opus|haiku|fable>.<low|medium|high|xhigh>` override token — e.g.
`model:fable.high` — that overrides the `opus.high` default for this invocation only; see "Parse the
`model:` override" below)

## Branch safety (first step)

**Ordering note:** the cheap read-only `model:` override parse (see "Parse the `model:` override" at the
top of **Steps** below) runs in the outer session **before** this guard — an invalid `model:` token STOPs
the command before the guard evaluates or cuts any branch. This "(first step)" concerns only the
branch-affecting work; the token parse is a read-only precondition that precedes it.

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the change id you allocate in step 1 (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

**Parse the `model:` override (outer session, before step 1).** Scan the raw `$ARGUMENTS` text for an
optional `model:<model>.<effort>` override token per the "Optional caller-side `model:` override token"
section of **`ptp-run-at-model`** — do not restate that grammar/validation here.

- **Absent** → target = `opus.high` (unchanged path); proceed to step 1 with `$ARGUMENTS` as given.
- **Exactly one valid candidate** → strip it from `$ARGUMENTS` before step 1's change-id derivation;
  target = the resolved `<model>.<effort>` literal.
- **Invalid** (a `model:`-prefixed candidate with a bad model, bad effort, or wrong shape, or more than
  one candidate) → **STOP immediately, in the outer session**, before the branch guard, before step 1's
  change-id allocation, and before any subagent spawn. Report the offending candidate(s) and the two
  valid enums (`sonnet|opus|haiku|fable`, `low|medium|high|xhigh`).

Step 1 (pick the change id) and the "Branch safety (first step)" preamble above run **in the outer
session**, over the now token-free `$ARGUMENTS`. The actual brainstorm work — steps 2–8 — **runs at a
deterministic model** via the **`ptp-run-at-model`** skill at the resolved target (`opus.high` by
default, or the valid `model:` override): brainstorming is high-judgment creative work and must not
depend on whatever model the session happens to be on. The branch guard (already run above) and step 1's
change-id allocation (cheap, never a guaranteed abort, and the branch guard reads the allocated id to
name the branch on `master`) stay **outer**; then a single foreground subagent at the resolved target
performs steps 2–8 and reports.

1. **Pick the change id** (outer session). If the user supplied a fully-formed `XXXX_NN_` id, preserve it verbatim. Otherwise — no id, or only a partial id/description supplied — allocate a single-story epic `XXXX_01_<desc>` via the `ptp-change-selector` skill (§4, epic allocation), where `<desc>` is ≤ 5 kebab-case words derived from the supplied text or the request. **Never produce a legacy/plain id going forward** — a non-full supplied id is treated as a `<desc>` source, not preserved as-is. Do NOT pause to confirm — pick a reasonable description and proceed. Allocating the epic-prefixed id here ensures the later `/ptp:plan` keeps the same id. If it turns out wrong, the user can rename later.

**Run steps 2–8 via `ptp-run-at-model` at the resolved target.** Only after the branch guard and step
1's change-id allocation have settled in the outer session, invoke the **`ptp-run-at-model`** skill with
the resolved target (`opus.high` by default, or the valid `model:` override) and the work being
**steps 2–8 below** — load context, invoke `ptp-brainstorming` in autonomous mode,
compare material alternatives, decide, persist the decision capsule to
`openspec/changes/<change-id>/brainstorm.md`, then STOP and report. It
spawns one foreground subagent at the resolved model (with the matching effort directive) that performs
those steps and returns its terminal result (relayed per `ptp-run-at-model`'s *Result relay* — never
reporting a refusal or STOP as success). Reference the `ptp-run-at-model` skill for the spawn-and-relay
mechanics rather than restating them. One note the subagent prompt MUST carry: the subagent's own
`ptp-branch-guard` check is a **no-op** (HEAD is already on the feature branch from the outer guard), so
the subagent must **NOT** attempt to launch the `ptp-branch-prep` Workflow. Its brainstorm work spawns
nothing — it invokes `ptp-brainstorming` as an inline Skill call — so there is no nesting
concern.

2. **Load context** — read the relevant project files. If `openspec/project.md` exists, read it. **If
   `ptp-run-at-model`'s optional part (f) supplied an inlined `openspec list` / `openspec list --specs`
   snapshot, use that snapshot in place of running the commands below** — this step still runs
   unconditionally, only its *source* changes; a supplied-but-empty snapshot is honored as a real "no
   active changes" answer, not treated as missing. Re-run a listing anyway if you have yourself created,
   moved, or deleted anything under `openspec/changes/` during this run, or if you need information the
   snapshot does not carry (e.g. `--specs` when only the plain listing was inlined). **No caller
   supplies this command a snapshot today** (`/ptp:plan-multiple`'s per-slice members are `/ptp:plan`
   runs, not `/ptp:brainstorm` runs) — this wiring is uniform-contract groundwork, not a realized
   saving, so in practice this step still runs both commands below exactly as before. Otherwise run
   these to see existing specs and in-flight changes (use Bash):
   - `npx -y openspec list` (lists active changes)
   - `npx -y openspec list --specs` (lists existing capabilities/specs)
   - If `openspec` is installed globally, drop the `npx -y` prefix.
3. **Invoke the `ptp-brainstorming` skill** via the Skill tool, in autonomous mode.
4. **Make reasonable assumptions instead of pausing to ask** (autonomous mode). Do **not** use AskUserQuestion and do **not** stop to ask the user clarifying questions — this brainstorm runs autonomously in a non-interactive subagent. Where a real choice exists that you would otherwise have asked about, pick the most reasonable option, proceed, and **document the assumption inline in the brainstorm** so the reader can see what was assumed and revisit it. This mirrors `/ptp:plan`'s autonomous, no-clarifying-questions contract.
5. **Compare only material alternatives.** When a material design choice exists, weigh the real
   candidates — what each changes, risk / blast radius, effort, reversibility, interaction with
   existing specs (cite spec files). When only one direction is viable, record that fact and the
   reason instead; never manufacture an alternative to fill a slot.
6. **Decide.** State the chosen direction and why, in 1–3 sentences.
7. **Persist the decision capsule** to `openspec/changes/<change-id>/brainstorm.md` (create the
   directory if it doesn't exist) — the **decision**, the **material alternatives** each with its
   tradeoff and why it lost (or the single-direction reason), and the **assumptions** made in
   autonomous mode. Nothing else: no full design document, no implementation plan, no deliberation
   history. Write **current truth only**: when the file already exists, replace the superseded
   capsule in place and never append a correction, an earlier draft, or review-iteration narrative.
   Write the capsule to `openspec/changes/<change-id>/brainstorm.md`. Surface
   the absolute path back to the user.
8. **STOP.** Do not write `proposal.md`, `design.md`, `tasks.md`, or spec deltas — those belong to `/ptp:plan`. The next step is `/ptp:plan <change-id>`, which transcribes `brainstorm.md` into the OpenSpec artifacts.

## Hard rules

- Do **not** call `/opsx:propose` or `/opsx:explore` (nor the vendored `ptp:openspec-*` skills). The `ptp-brainstorming` skill owns this step.
- Do **not** create `proposal.md` / `design.md` / `tasks.md` / `specs/**` under `openspec/changes/<change-id>/` in this command. The **only** file you write into the change folder here is `brainstorm.md`.
- Do **not** write the brainstorm to `openspec/brainstorms/` — that location is reserved for `/ptp:brainstorm-only` (change-agnostic exploration). A change-scoped brainstorm lives in its change folder.
- Do **not** skip writing `openspec/changes/<change-id>/brainstorm.md` — `ptp:plan` reads it as its source-of-truth input. If the brainstorming skill stopped without writing it, write it explicitly yourself (you run autonomously in a non-interactive subagent — do **not** pause to ask the user for approval first).
- Do **not** start coding.
