---
description: Plan an oversized change as multiple smaller OpenSpec changes — decompose into independently-shippable slices, then run /ptp:plan for each
argument-hint: "<change-id-or-request> (the big change to split; kebab-case id of an existing monolithic plan, or a short description)"
---

You are running **step 2 of the ptp flow — the multi-change variant**. Use this instead of `/ptp:plan` when a single change is too big to plan and ship as one unit. Your job is to:

1. **Decompose** the oversized change into a small set of coherent, independently-shippable OpenSpec changes ("slices").
2. **Delete the monolithic plan** if one was already created.
3. **Run `/ptp:plan` for each slice** so every slice gets the full OpenSpec artifact treatment.

`/ptp:plan-multiple` does **not** itself write `proposal.md` / `design.md` / `tasks.md` — it only decides the split and then delegates each slice to `/ptp:plan`, which produces those artifacts. There is **no umbrella decomposition doc**; the split rationale and inter-slice dependencies are cross-referenced inside each slice's `proposal.md` (see step 5).

## Inputs

The oversized change id or request: $ARGUMENTS

Interpret it both ways: if `$ARGUMENTS` names an existing `openspec/changes/<id>/` folder, treat that as a **monolithic plan to re-cut** (and a candidate for deletion in step 4); otherwise treat it as a **fresh request** to plan as multiple slices from scratch (nothing to delete).

Epic allocation: allocate one fresh epic for all slices per the `ptp-change-selector` skill (§4, epic allocation).

## Branch safety (first step)

Run the **`ptp-branch-guard`** preamble **once up front**, before delegating to any sub-step that writes: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from this request (or the fresh epic you allocate → `ptp/epic-XXXX`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** any sub-step runs; if you are already on a feature branch it is a **no-op** — proceed as-is. Delegated `/ptp:plan` runs re-run the guard as a no-op once HEAD is on the branch. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## When to use this vs `/ptp:plan`

- Use **`/ptp:plan`** when the change is one coherent unit of work.
- Use **`/ptp:plan-multiple`** when the work is large enough that a single `tasks.md` would be unwieldy, spans multiple spec capabilities, or naturally factors into stages that can each be reviewed, applied, and archived on their own.
- If you inspect it and it turns out **not** to be big enough to split, do **not** force a split — fall back to a single `/ptp:plan` (step 3).

## Steps

1. **Gather input — do not delete anything yet.**
   - If `openspec/changes/<id>/` already exists (a monolithic plan was created from `/ptp:plan` or `/ptp:brainstorm`), read its artifacts first (`brainstorm.md`, `proposal.md`, `design.md`, `tasks.md`, spec deltas). That existing thinking is your richest decomposition input — fold it in, don't discard it.
   - **Check whether implementation has already started** on that monolithic change: any checked task (`- [x]`) in its `tasks.md`, or a non-empty `git diff` touching the surface area its `proposal.md`/spec deltas describe. If so, **STOP** — do not decompose or delete. Report that the change is partially applied and that deleting it would orphan the implemented code from its spec; let the user decide how to proceed (e.g. finish/revert it first, or split only the not-yet-built remainder by hand). Deleting an in-progress change is never automatic.
   - Run `npx -y openspec list` and `npx -y openspec list --specs` to see existing changes/capabilities and avoid id collisions.

2. **Decompose (autonomous brainstorm).** Invoke **`superpowers:brainstorming`** via the Skill tool in **autonomous mode** (no clarifying questions — document assumptions instead, exactly as `/ptp:plan` does), focused on a single question: *what is the smallest set of coherent, independently-shippable changes that together cover this request?* Produce an ordered list where each slice has:
   - a sub-change id `XXXX_NN_<kebab-description>` — a single epic allocated via `ptp-change-selector` (§4, epic allocation), then two-digit zero-padded story, then kebab description (e.g. `0001_01_landing-page-list-bulk-export`, `0001_02_landing-page-bulk-import`, `0001_03_landing-page-server-side-import`). The story number is the recommended apply order. All slices share the same epic.
   - a one-paragraph scope (what's in, what's out).
   - explicit dependencies — a slice may depend **only on lower-story slices** (no cycles, no forward references). State them as `depends on XXXX_NN_…`.
   - one sentence on why it stands alone (can be reviewed / applied / archived independently).

   A good decomposition: every slice is shippable on its own, slices are ordered by dependency, and their union covers the original request with no overlap and no gap.

   Do **not** persist this decomposition as its own file. It is working reasoning; it gets recorded durably inside each slice's `proposal.md` in step 5 (cross-reference only — no umbrella doc).

3. **Decide: split or fall back.**
   - If the work genuinely factors into **≥ 2** independently-shippable slices → continue to step 4.
   - If it is really one unit → **fall back**: invoke the **`ptp:plan`** skill via the Skill tool with the original id/request as args, report that no split was needed, and stop. Do not create artificial slices.

4. **Delete the monolithic plan if one exists.** If step 1 found an existing `openspec/changes/<id>/` **and confirmed no implementation had started**, delete that folder now — its content has been folded into the decomposition, and leaving a half-planned giant change beside the slices is confusing. If no such folder existed, skip this step. Never delete before its thinking has been captured in step 2, and never delete a change whose implementation has already started (step 1 already stopped you in that case).

5. **Plan each slice — in dependency order.** For each sub-change, invoke the **`ptp:plan`** skill via the Skill tool, passing the slice's id **and its scope paragraph + dependency notes** as the request (so each `/ptp:plan`'s own autonomous brainstorming stays scoped to that slice, not the whole feature).

   Run slices **sequentially**; let each `/ptp:plan` finish — including its `openspec validate <id> --strict` — before starting the next. Each `/ptp:plan` will also emit its own recommended apply model/effort; collect those.

   **Then guarantee the cross-reference is durable.** Because you chose *cross-reference only* (no umbrella doc), that cross-ref is the **only** record of the split — so don't rely on `/ptp:plan` having transcribed it. After each slice's `/ptp:plan` returns, **read its `proposal.md` and confirm** the cross-reference line is present; if it is missing or thin, **append it yourself** under `## Context` (or `## Source`):
   - *"Part of splitting `<original request>` into slices `XXXX_01_…`, `XXXX_02_…`, … . This slice depends on `XXXX_NN_…`."*

   Editing `proposal.md` for this single line is the one exception to "let `/ptp:plan` write the proposal" — you are adding provenance metadata, not authoring design content.

6. **STOP and report.** Do not start implementation. Report:
   - The slices created, in order, each with its one-line scope.
   - Whether a monolithic plan was deleted (and which id).
   - Per-slice validation result and the recommended apply model/effort each `/ptp:plan` produced.
   - The exact next command: `/ptp:apply <first-slice-id>`.

## Hard rules

- Do **not** force a split. If the change is one coherent unit, fall back to a single `/ptp:plan` (step 3).
- Do **not** delete the monolithic `openspec/changes/<id>/` folder until its thinking has been folded into the decomposition (step 2 before step 4).
- Do **not** decompose or delete a monolithic change whose implementation has already started (checked tasks or matching code changes). STOP and hand the decision to the user (step 1).
- Each slice **must** be independently shippable and may depend **only on lower-numbered slices** — no cycles, no forward dependencies.
- Do **not** write any slice's `proposal.md` content yourself from the raw request — it must come from that slice's `/ptp:plan` brainstorming, exactly like a normal single change.
- Do **not** create an umbrella decomposition doc. The rationale + dependencies live as cross-references inside each slice's `proposal.md` (step 5).
- Do **not** ask the user clarifying questions mid-flow. `/ptp:plan-multiple` is autonomous end-to-end, same contract as `/ptp:plan`: make reasonable assumptions, document them, produce validated artifacts.
- Do **not** invoke or trigger `/ptp:apply` automatically — not after the slices are planned, not for any reason. `/ptp:apply` runs only when the user explicitly types it. (Chaining `/ptp:plan` per slice is expected and allowed; chaining `/ptp:apply` is forbidden.)
- Do **not** edit any OpenSpec managed/regenerated instruction blocks.
