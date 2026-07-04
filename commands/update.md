---
description: Update the installed ptp plugin to the latest version; reports the installed-vs-latest verdict via the shared ptp-version skill, runs claude plugin update ptp@ptp to apply the update, and always surfaces that a Claude Code restart is required to apply the update.
argument-hint: "(no arguments)"
disable-model-invocation: true
---

You are running **`/ptp:update`** — the front door for updating the installed ptp plugin. It
delegates installed-vs-latest version resolution to the shared `ptp-version` skill, runs
`claude plugin update ptp@ptp` when appropriate, and **always** prints the Claude Code restart
caveat on every path where the `claude` CLI was reachable. It is a thin command: resolution
methodology lives in the `ptp-version` skill, not here.

## Steps

1. **Invoke the `ptp-version` skill** via the Skill tool. The skill resolves and reports the
   installed version, the latest available version, and an up-to-date / update-available verdict.
   Do not restate the skill's resolution methodology here.

2. **Decide on the verdict:**
   - **up-to-date** → report a no-op ("already on the latest version"); do NOT run
     `claude plugin update ptp@ptp`. Skip to step 4 to print the restart caveat.
   - **installed-ahead** (installed version is newer than the latest available) → report that the
     installed version is ahead of the latest and that no update is recommended; do NOT run
     `claude plugin update ptp@ptp`. Skip to step 4 to print the restart caveat.
   - **update-available** → proceed to step 3 to run the mutation.
   - **partial / unknown** (latest could not be resolved) → still proceed to step 3 (the update
     is idempotent and safe); report what was unknown. Do not claim a false up-to-date result.

3. **Run the mutation:** Execute `claude plugin update ptp@ptp`. Report the result:
   - On success: report that the plugin was updated.
   - On non-zero exit: report the failure verbatim. Do NOT claim the update succeeded.

4. **Always print the restart caveat:** Inform the user that **a Claude Code restart is required
   to apply the update**. This caveat is printed on every terminal path above — update applied,
   already up to date, installed-ahead, partial/unknown resolution, and update failure. The sole
   exception is the
   `claude`-CLI-not-found path (step 3 cannot be reached), which instead reports that the CLI was
   not found and that no update was applied.

5. **STOP.**

## Hard rules

- **CLI-only mutation.** Mutates only the installed plugin cache via `claude plugin update ptp@ptp`.
  Writes no repository files. Performs no git operations.
- **No `ptp-branch-guard`.** This command is branch-guard-exempt — it never touches the repo or
  git, so branch state is irrelevant. Same posture as `/ptp:status` and the read-only reviewers.
- **No change selector.** Takes no change-id or selector argument. Operates only on `ptp@ptp`.
- **Restart caveat on every CLI-reachable path.** The caveat ("a Claude Code restart is required
  to apply the update") is printed on every terminal path where the `claude` CLI was reachable:
  update applied, already up to date, installed-ahead, partial/unknown resolution, and update
  failure. The sole
  exception is the `claude`-CLI-not-found path — when the CLI is absent no update can occur, so
  the command reports that the CLI was not found and that no update was applied (the caveat is
  moot). Do not "optimize away" the caveat on the already-up-to-date path.
- **Never re-derive resolution.** Do not implement installed or latest version resolution in this
  command. Do not use `claude plugin list --json --available`. Resolution lives entirely in the
  `ptp-version` skill.
- **Never claim false success.** If `claude plugin update ptp@ptp` exits non-zero, report the
  failure verbatim and do not report a successful update.
