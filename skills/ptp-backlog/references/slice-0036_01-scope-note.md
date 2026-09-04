> Loaded from skills/ptp-backlog/SKILL.md when: auditing slice 0036_01's original shipped scope.
## What `0036_01` did not ship

This section is a **historical scope note about slice `0036_01`**, not a live prohibition on the
commands that exist today. It describes the contract as it stood when the backlog was a local JSON file;
that store was replaced by the board in `0042_03`, which is also why no path described below still
exists.

**No consumer wiring, and above all no writer, landed in `0036_01`.**

- **No writer of any kind.** Nothing in `0036_01` created, modified, or deleted the backlog. The write
  path of the day was *specified* for later changes; nothing in that slice performed it.
- **No epic-dependency inference in `0036_01`** — that feature landed in **`0036_02`**, which was also
  the first consumer of the id-allocation and writer-eligibility rules above. It was **removed
  entirely in `0042_01`**, so nothing of it remains in this contract and no section of it
  describes it.
- **No entry edit, no status transition, no crash recovery, and no disposition gate** —
  the transition table, the `runBaseline` reconciliation, and the `claim` / `disown` / `rerun anyway`
  availability rules are **`0036_03`**. (Entry **add** landed in `0036_02`.)
- **No runner, no `rounds:` token, no `/ptp:full` invocation, and no ready-set recomputation loop** —
  **`0036_04`**, which references this skill's ready-set definition rather than restating it.
- **No config key and no per-invocation token.** This change adds no `backlog.*` parameter, so the
  `config` contract's every-enumeration-agrees obligation is untouched.
- **No selector grammar.** `ptp-change-selector`, `ptp-run-at-model`, `ptp-branch-guard`,
  `ptp-codex-mode`, `ptp-parallel-fanout`, and `ptp-config` are **referenced, never modified**.

The only consumer `0036_01` shipped was the read-only `/ptp:backlog` view; `/ptp:backlog-add` joined it
in `0036_02`, and `/ptp:backlog-edit` — the writer governed by the *Status transitions and their
guards* and *Recovery and reconciliation* sections above — in `0036_03`.
