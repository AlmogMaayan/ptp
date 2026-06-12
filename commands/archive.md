---
description: Archive a completed, reviewed OpenSpec change — syncs delta specs into main specs via the OpenSpec CLI
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running **step 5** (the final step) of the ptp flow. The change has been implemented and reviewed. Your job is to **enforce the ptp archive gates, then archive the change via the OpenSpec CLI** (which also syncs the delta specs into the main specs).

Archiving uses the native `openspec` CLI, not opsx — consistent with every other ptp command, and `openspec archive` already does "move to archive + update main specs + validate" in one step. There is no cross-plugin dependency.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change (e.g. `epic:XXXX`), archive each in story order, each through the existing per-change archive gates below. Preserve the existing empty-argument default: omitting `$ARGUMENTS` falls back to the `openspec list` disambiguation.

## Branch safety (first step)

Archiving moves the change folder and rewrites `openspec/specs/`, so before any move run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

1. **Invoke the `ptp-model-effort-check` skill** via the Skill tool. This checks whether the
   session model is Sonnet and effort is medium before archiving. If they already match the
   baseline, the skill is a no-op and execution proceeds immediately. If they differ, the user
   is prompted to switch or continue — if they choose to switch, STOP and let them re-run after
   switching.

2. **Resolve the change id**:
   - If `$ARGUMENTS` is empty, run `npx -y openspec list` and, if it is ambiguous, ask the user which change to archive. **Never** guess or auto-select.

3. **Enforce the ptp archive gates** (this is what makes this more than a raw CLI call). Archiving moves the change folder out of the active set, so do not proceed until all three hold:
   - **Tasks complete** — read `openspec/changes/<change-id>/tasks.md`. If any `- [ ]` remain, **STOP**, list them, and refuse. (ptp hard prohibition: never archive with unchecked tasks.)
   - **Review clean** — `/ptp:review <change-id>` must have been run with no unresolved **Critical** or **High** findings. OpenSpec does not track review state, so **ask the user to confirm** review is done and Critical/High are resolved before continuing. If they haven't reviewed, redirect them to `/ptp:review <change-id>` first.
   - **Validation passes** — `npx -y openspec validate <change-id> --strict`. If it fails, **STOP** and surface the error; do not archive a failing change.

4. **Confirm the action** — show the user exactly what will happen (which change moves to `openspec/changes/archive/`, and that delta specs under `specs/` will be merged into `openspec/specs/`). Proceed once confirmed (the user invoking this command counts as intent, but show the summary first).

5. **Archive via the CLI**:
   - `npx -y openspec archive <change-id> --yes`
   - This moves the change to `openspec/changes/archive/` **and** updates the main specs from the delta specs, then validates.
   - For infrastructure / tooling / doc-only changes with no spec deltas, add `--skip-specs`.

6. **Fallback if the CLI rejects the change** (e.g. an older change folder whose name does not start with a letter, which the CLI refuses): perform the archive manually, preserving the CLI's semantics —
   - Sync each delta spec in `openspec/changes/<change-id>/specs/<capability>/spec.md` into `openspec/specs/<capability>/spec.md` (apply ADDED/MODIFIED/REMOVED/RENAMED; a pure-ADDED delta with no existing main spec becomes a new canonical spec).
   - Move `openspec/changes/<change-id>` → `openspec/changes/archive/<YYYY-MM-DD>-<change-id>` (using today's date; fail clearly if the target already exists).

7. **Report** — change id, archive location, whether specs were synced (or skipped), and any gate warnings. The flow is now complete.

## Hard rules

- **Never** archive a change with unchecked tasks or unresolved Critical/High review findings. Refuse and redirect.
- **Never** silently skip the spec sync. Use `--skip-specs` only for changes that genuinely have no spec deltas, and say so in the report.
- Do **not** edit the spec deltas to make validation pass — if validation fails, bounce back to `/ptp:plan`.
- Prefer the `openspec` CLI; only fall back to a manual move when the CLI cannot handle the change name.
