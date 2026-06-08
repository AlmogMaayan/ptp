---
description: Show OpenSpec state — active changes, validation status, and current spec capabilities
argument-hint: "[change-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit for full status)"
---

Show the current OpenSpec state so the user can decide what to do next in the ptp flow.

## Inputs

Optional change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change (e.g. `epic:XXXX` narrows the report to that epic's stories), run the steps below for each, in story order, reporting per change.

## Steps

1. **List active changes** (Bash):
   - `npx -y openspec list`
2. **List existing capabilities/specs**:
   - `npx -y openspec list --specs`
3. **If a change id was provided**, also run:
   - `npx -y openspec show <change-id>` (if supported in installed version; otherwise read the change folder directly)
   - `npx -y openspec validate <change-id> --strict`
   - Read `openspec/changes/<change-id>/tasks.md` and report:
     - Tasks total / done / remaining
     - First unchecked task (this is the next thing to do)
4. **Recommend the next ptp command** based on what you see:
   - No change folder yet → `/ptp:brainstorm "<request>"` (or `/ptp:plan-multiple "<request>"` if the request is clearly too big to ship as one change)
   - Change folder exists but validation fails → `/ptp:plan` to fix
   - Change folder exists but is clearly too big to ship as one unit (many capabilities, an unwieldy `tasks.md`) and implementation hasn't started → `/ptp:plan-multiple <change-id>` to re-cut it into independently-shippable slices
   - Change valid, no tasks done yet → `/ptp:review-plan <change-id>` (optional artifact-quality gate) then `/ptp:apply <change-id>`
   - Change valid, some tasks done → `/ptp:apply <change-id>`
   - All tasks checked, not reviewed → `/ptp:review <change-id>`
   - Reviewed, clean → `/ptp:archive <change-id>`

## Hard rules

- This command is **read-only**. Do not edit any files. Do not run `openspec apply` / `openspec archive`.
