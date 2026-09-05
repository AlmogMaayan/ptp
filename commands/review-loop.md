---
description: Loop main-agent code review and inline fixes until findings clear or the iteration cap is reached
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

## Arguments

Take `$ARGUMENTS` as a change selector. Resolve the change selector through the `ptp-change-selector` skill.

Resolve `{ main, reviewer }` from `roles.main` via the **`ptp-agent-roles`** skill, then run the loop
with kind `code` and `reviewer` = **the dispatch of the agent playing `main`** — `ptp` at
`main = claude`, `codex` at `main = codex` — per `ptp-review-loop`'s reviewer-input dispatch-naming
rule; never hardcode `reviewer = ptp`. At the default `main = claude` this is byte-identical to
before this change. The role-aware inline fix is the one `ptp-review-loop`'s fix-dispatch resolution
already provides; this command wires no fix path of its own.

A *main* phase carries no `codex.mode` gate (that gates a *reviewer*), so this command owns its own
precondition: when the resolved dispatch is `codex`, verify `codex --version` is on PATH before
invoking the loop; if `codex` is absent, **STOP** and tell the user to install `codex` or set
`roles.main = claude` in `/ptp:config`, rather than silently falling back to `ptp`.

## Owner

Invoke the `ptp-review-loop` skill (`skills/ptp-review-loop/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
