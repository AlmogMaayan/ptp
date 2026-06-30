---
name: ptp-prd
description: Use this skill when orchestrating the PRD-authoring flow behind /ptp:prd. Owns selector-to-epic projection (additive layer on top of ptp-change-selector), ptp-run-at-model at opus.high (one foreground subagent per epic in sequence), Phase-0 prd-taskmaster backend detection, epic-context pre-load, prd:generate invocation and output relocation to openspec/changes/<id>/, and the inline auto-degrade fallback when the plugin is absent or fails. Never emits proposal/design/tasks/spec deltas/code. Non-interactive. Recommends /ptp:plan next.
---

# ptp-prd — PRD-authoring protocol

## Purpose

This skill is the single source of truth for the `/ptp:prd` command's protocol. It is a thin
orchestrator that wraps the external `prd-taskmaster` plugin's `prd:generate` skill with graceful
auto-degrade, projecting selector inputs onto a set of epics and producing one epic-scoped PRD per
epic co-located in the change folder. When prd-taskmaster is available, the skill detects its backend
(Phase 0), pre-loads the epic's existing OpenSpec context as the discovery summary (replacing the
interactive `prd:discover` flow), invokes `prd:generate` non-interactively, and relocates its output
to `openspec/changes/<id>/prd.md` (where `<id>` is the epic's lowest-numbered story). When the plugin
or backend is absent — or generation produces no fresh output — the skill authors a structured PRD
inline and says so explicitly, mirroring the Superpowers graceful-degrade contract. The `/ptp:prd`
command is the thin front door; this skill holds the substance.

No standalone `openspec/prds/` folder is created — the PRD is written directly into the existing
change folder (`openspec/changes/<id>/`), co-located with `brainstorm.md`, `proposal.md`, and the
other ptp artifacts for that change.

---

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| `selectors` | One or more of: bare change id, `epic:XXXX`, `story:NN`, `epic:XXXX story:NN`, multiple whitespace-separated; omit = all active epics | `$ARGUMENTS` from the command |

The branch guard has already run in the outer session before this skill is invoked. This skill does
**not** re-run the branch guard. It receives the selectors and performs the projection and authoring.

---

## Selector → epic projection (additive layer)

The base selector grammar is owned by `ptp-change-selector` and is **not** modified by this skill.
This skill adds an additive projection layer on top to map resolved targets to a set of epics:

- **`<bare-id>`** or **`story:NN`** → the change's epic (PRDs are epic-scoped, not story-scoped).
- **`epic:XXXX`** → that epic directly.
- **`epic:all`** → all active epics.
- **Multiple selectors** (`epic:0019 epic:0020`, etc.) → union of the projected epics,
  order- and grouping-independent.
- **Omit** → all active epics.

**Compound form:** the `epic:XXXX story:NN` form (from the base grammar) binds as a **single**
selector projecting to epic `XXXX`; remaining whitespace-separated tokens are independent selectors.
For example, `/ptp:prd epic:0019 story:02 epic:0020` parses as the compound `epic:0019 story:02`
(projecting to `0019`) plus the independent `epic:0020`, yielding epics `{0019, 0020}`.

**Legacy ids:** a legacy/unprefixed bare id (one with no `XXXX` epic component, per
`ptp-change-selector`) cannot be projected to an epic — report it as unsupported for PRD authoring
and skip it (PRDs are epic-scoped). If every supplied selector is a legacy id, report nothing-to-do
and exit without writing.

**Empty result:** if the selector resolves to no active epics, report nothing-to-do and exit without
writing any file (no error).

**v1:** always one PRD per epic. A combined multi-epic PRD is out of scope for this skill — the
non-interactive command exposes no selector form to name a unified initiative.

Use the `ptp-change-selector` skill for base resolution, then apply the projection above.

---

## Run at model — `ptp-run-at-model` at `opus.high`

PRD authoring is high-judgment work. For each targeted epic, invoke the **`ptp-run-at-model`** skill
at target **`opus.high`**, one foreground subagent per epic, in sequence (one subagent per
invocation, no fan-out). The selector projection and the "empty result" check stay in the outer
session (cheap, abort-capable). Only the per-epic authoring work runs in the subagent.

The subagent prompt **must carry** the following instruction: *the subagent's own `ptp-branch-guard`
check is a **no-op** (HEAD is already on the feature branch from the outer guard) — it MUST NOT
launch `ptp-branch-prep`.*

Reference the `ptp-run-at-model` skill for the spawn-and-relay mechanics rather than restating them
here.

---

## Phase 0 — backend resolution

At the start of each per-epic subagent invocation:

1. **Probe for the atlas-engine MCP backend**: perform a ToolSearch for
   `mcp__atlas-engine__engine_preflight`. If found → **MCP mode**.
2. **Else**: check for the `script.py` CLI fallback (as specified by prd-taskmaster's own Phase-0
   protocol). If available → **script.py CLI mode**.
3. **Else**: mark the backend as **absent (inline mode)** — do **not** skip ahead. Context pre-load
   (below) still runs unconditionally, and the **inline fallback** (A4) authors the PRD from that
   pre-loaded epic context.

This mirrors prd-taskmaster v5.3.0's own Phase-0 backend requirement. If neither backend resolves,
do not hard-fail — degrade gracefully.

---

## Context pre-load (replacing `prd:discover`)

Context pre-load runs **unconditionally** — for both the `prd:generate` path and the inline-fallback
path (it is step (2) of the per-epic sequence, before the plugin-availability branch). Aggregate the
epic's existing OpenSpec context to use as the discovery summary. This replaces the interactive
`prd:discover` flow (which uses `AskUserQuestion` and MUST NOT be invoked from the non-interactive
subagent).

For each targeted epic, collect in **ascending story order** across **every change in that epic —
active and archived** (scan both `openspec/changes/<id>/` and `openspec/changes/archive/<id>/`,
matching the `ptp-change-selector` epic scan; strip any archive date prefix when reading the story
number):
- Each change's `brainstorm.md` (if present)
- Each change's `proposal.md` (if present)
- The epic's change listing (from `npx -y openspec list` plus the archived folders)

Skip missing files silently. Feed this aggregated context as the discovery summary to
`prd:generate`.

---

## Invoke `prd:generate`

When the backend resolves (Phase 0 succeeded), invoke the **`prd:generate`** skill via the Skill
tool, passing the aggregated epic context as the discovery summary.

**MUST NOT invoke:**
- `prd:go` — starts the interactive `AskUserQuestion` discovery flow
- `prd:atlas` — starts the interactive `AskUserQuestion` discovery flow
- `prd:discover` — starts the interactive `AskUserQuestion` discovery flow

Invoking any of the above from the non-interactive subagent would hang on `AskUserQuestion`. Only
`prd:generate` is the correct non-interactive entry point.

---

## Relocate output

prd-taskmaster writes its output to `.taskmaster/docs/prd.md`. To prevent mistaking a stale
prior-run file for fresh output:

1. **Before** invoking `prd:generate`: if `.taskmaster/docs/prd.md` already exists, rename it
   aside (e.g. `.taskmaster/docs/prd.md.bak-<timestamp>`) — **preservation-safe: never deleted**.
2. **After** `prd:generate` completes: check for a freshly created, **non-empty**
   `.taskmaster/docs/prd.md`.
   - If present and non-empty: **move** (relocate, not copy) it to
     `openspec/changes/<id>/prd.md`. No `openspec/prds/` directory is created; the change folder
     already exists.
   - If absent or empty: report the failure and proceed to the **inline fallback**. First delete the
     empty fresh `.taskmaster/docs/prd.md` if the current invocation created one — so no stale
     staging file lingers (the spec's end-state allows only a renamed pre-existing backup to
     remain). The renamed pre-existing backup, if any, remains on disk undisturbed.

**Output naming:** `<id>` is the epic's **lowest-numbered story** — determined across **both active
and archived** changes in the epic (scanning `openspec/changes/<id>/` and
`openspec/changes/archive/<date>-<id>/`, stripping any archive date prefix), so the anchor stays
stable even after the first story is archived. The output filename is the constant `prd.md` under
the resolved change folder — the change folder disambiguates the epic, so no slug is encoded in the
filename. This is the single naming rule — the same epic always produces the same path, regardless
of which selector targeted it. Re-running for the same epic overwrites that epic's PRD
deterministically (idempotent).

---

## Inline fallback

Author a structured PRD inline — autonomously, using the **pre-loaded epic context** as the basis
and documenting assumptions — when any of the following occur:

- The prd-taskmaster plugin or its backend is absent (Phase 0 found neither backend).
- The `prd:generate` skill entry point cannot be resolved (interface drift).
- `prd:generate` produced no fresh, non-empty `.taskmaster/docs/prd.md`.

The inline PRD MUST carry the **minimum PRD schema**:

1. **Problem / Why** — what pain or opportunity this epic addresses
2. **Goals** — measurable outcomes the epic targets
3. **Non-goals** — explicitly out of scope
4. **Scope** — what is and isn't included
5. **Users / Stakeholders** — who is affected and how
6. **Requirements** — functional and non-functional
7. **Acceptance criteria** — specific, testable conditions for done
8. **Dependencies** — external systems, teams, or changes this depends on
9. **Risks** — known unknowns and mitigations
10. **Open questions** — decisions still to be made

Write the inline PRD directly to `openspec/changes/<id>/prd.md` (same path as the relocation
target) and **state explicitly** in the report that the inline authoring path was taken (say why —
plugin absent, interface drift, or generation failure).

The inline fallback MUST NOT hard-fail: `/ptp:prd` never fails to start over a missing optional
plugin.

---

## Hard rules

- **Non-interactive**: never call `AskUserQuestion`. Never invoke `prd:go`, `prd:atlas`, or
  `prd:discover`.
- **No code or spec artifacts**: do not write `proposal.md`, `design.md`, `tasks.md`, spec deltas,
  or source code.
- **One PRD per epic**: never merge multiple epics into a single combined PRD (deferred — no
  selector form names a unified multi-epic initiative in v1).
- **Never hard-fail over the missing optional plugin**: always produce a PRD (inline if needed) or
  report nothing-to-do on an empty selection.
- **Recommend `/ptp:plan`** as the next step after writing the PRD.
- **Output location**: the PRD is written to `openspec/changes/<id>/prd.md` (the change folder for
  the epic's lowest-numbered story). No standalone `openspec/prds/` folder is created; the change
  folder already exists, and the `reviews/` subfolder is created on demand as needed.
