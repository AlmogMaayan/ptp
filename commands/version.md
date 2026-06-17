---
description: Read-only viewer that reports the installed ptp plugin version, the latest available version, and an up-to-date / update-available verdict. Delegates all resolution and comparison to the shared ptp-version skill.
argument-hint: "(no arguments — read-only)"
---

You are running **`/ptp:version`** — a read-only viewer for ptp plugin versions. It reports the
installed version, the latest available version, and an up-to-date / update-available verdict. It is
a thin front door: all resolution and comparison methodology lives in the `ptp-version` skill.

## Steps

1. **Invoke the `ptp-version` skill** via the Skill tool. The skill holds the complete methodology:
   installed resolution (`claude plugin list --json` → `id ptp@ptp` → `.version`), latest resolution
   (`claude plugin marketplace update ptp` refresh + local `marketplace.json` read, with a GitHub raw
   fallback), the `--available` anti-pattern, the semver-aware comparison with its string fallback,
   and the up-to-date / update-available / installed-ahead / partial report shapes. Do not restate
   the skill's steps here.
2. **STOP** when the skill reports its verdict (up-to-date, update-available, installed-ahead, or a
   partial/unknown report). Write no file.

## Hard rules

- **Read-only.** No git operation, no `ptp-branch-guard`, no change selector, no repository file
  write, and no installed-plugin mutation. `/ptp:version` is exempt from the branch guard exactly as
  `/ptp:status` and the read-only reviewers are.
- The delegated skill **may** run `claude plugin marketplace update ptp`, which refreshes only the
  CLI's marketplace cache — it does **not** touch the repository or the installed plugin.
- **Never report a false verdict.** If the skill cannot resolve a version, relay its partial report
  verbatim — never claim "up to date" when latest is unknown.
