---
description: Return to a clean, up-to-date master — switches to master and fast-forward-pulls, but only when the working tree is clean (no staged, unstaged, or untracked changes).
argument-hint: "(no arguments — switches to master and pulls when the tree is clean)"
---

You are running **`/ptp:master`** — a convenience utility that switches to `master` and fast-forward-pulls, **only when the working tree is clean**. It is the inverse of the branch-cutting commands: where those commands *leave* master to start a change, this command *returns* to master once a change is merged or archived.

## Inputs

None. This command takes no arguments.

## Branch safety — not applicable

Unlike every other write-capable ptp command, `/ptp:master` does **not** run the `ptp-branch-guard` preamble: its purpose is to land on `master` deliberately, and it authors no ptp/OpenSpec artifact. The exemption is documented in the `ptp-branch-guard` skill's "Which steps run the guard" section as the single source of truth.

## Steps

1. **Invoke the `ptp-master` skill** via the Skill tool. The skill holds the full methodology: clean-tree gate (`git status --porcelain --untracked-files=all`), switch (`git switch master`), fast-forward pull (`git pull --ff-only`), and report. Do not duplicate the methodology here.
2. **STOP.** The skill reports the outcome. Do not proceed into any other ptp step.

## Hard rules

- Makes **no** git changes when the working tree is dirty — gates and reports only.
- Never uses plain `git pull` — always `--ff-only` to prevent an accidental merge commit.
- Never auto-stashes or relocates uncommitted work.
- Does **not** run `ptp-branch-guard` — this command is the deliberate land-on-master exception.
