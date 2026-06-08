---
name: ptp-master
description: Use this skill when the user wants to switch to master, go to master, return to master, get back to master, or pull the latest — runs only when the working tree is clean (no staged, unstaged, or untracked changes). Safe "return to up-to-date master" utility: gates on a clean tree, switches to master, and fast-forward-pulls.
---

# ptp-master — safe return to up-to-date `master`

## Purpose

This skill is the **inverse of the ptp branch-cutting flow**: where `ptp-branch-prep` *leaves* master
(auto-stashing dirty work and cutting a `ptp/<...>` feature branch), this skill *returns* to master —
fast-forward-pulling to bring it up to date. It gates conservatively on a clean working tree, so dirty
work is never relocated or lost. It is a convenience utility, not a change-producer: it authors no
files of its own and allocates no epic.

Contrast with `ptp-branch-prep`, which auto-stashes and leaves master; this skill **gates** (stops on
a dirty tree rather than stashing and proceeding).

## Branch safety — N/A by intent

This skill does **not** run `ptp-branch-guard`. Its purpose is to land on `master` deliberately, and
it authors no ptp/OpenSpec artifact — a `git switch` / fast-forward pull may update tracked files to
match `master`, but no file the command itself writes needs to be kept off master. The exemption is
recorded in the `ptp-branch-guard` skill's "Which steps run the guard" section as the single source of
truth.

## Clean-tree gate

Before making any git change, run:

```
git status --porcelain --untracked-files=all
```

Evaluate the result:

1. **Command fails (non-zero exit)** — e.g. not inside a git repository, or a damaged repo. Treat as
   not-clean: **STOP**, report the status command error, and make **no** git changes. Never interpret
   empty stdout from a failed command as a clean tree.

2. **Non-empty output (dirty tree)** — staged changes, unstaged modifications, or untracked files are
   present. **STOP**: print the full porcelain output, recommend the user commit or stash first, and
   make **no** git changes (no switch, no pull).

3. **Empty output (clean tree)** — proceed to the Switch + pull step below.

"Clean" is defined as **empty porcelain output** from this specific command. The explicit
`--untracked-files=all` flag is required so that a repo or user `status.showUntrackedFiles=no`
(or `=normal`) configuration cannot hide untracked files from the gate — untracked files always count.

## Switch + pull

Reached only when the clean-tree gate passes (empty porcelain output, non-failed command).

**Step 1 — `git switch master`**

Run `git switch master` (plain, no extra flags). Git's default behavior:
- If a local `master` branch exists, switch to it.
- If local `master` is absent but a matching remote-tracking `*/master` exists (typically
  `origin/master`, or the remote chosen by `checkout.defaultRemote`), git creates a local `master`
  tracking that remote branch (git's DWIM/guess) — the desired outcome for a "return to master"
  utility (it bootstraps master from the remote).
- If already on `master`, this is a harmless no-op.
- If in a detached HEAD state with `master` reachable, re-attaches to `master`.

If `git switch master` **fails** (no `master` to switch to — neither a local branch nor a matching
remote-tracking `*/master` — or a checkout conflict such as an ignored file that `master` tracks;
note that a clean porcelain result does not guarantee the switch succeeds — porcelain does not list
ignored files): **STOP**, report the switch error, and **do not run the pull**. Nothing destructive
is attempted.

**Step 2 — `git pull --ff-only`** (only if the switch succeeded)

Run `git pull --ff-only`. This fast-forwards local `master` to match its upstream. Possible outcomes:
- **Fast-forwarded** — local `master` advances to the remote HEAD; report the new HEAD or the
  summary git prints.
- **Already up to date** — no changes; report that.
- **Fails (diverged / offline / no upstream configured)** — `--ff-only` exits non-zero with no commit
  created. Report the pull error. The switch already succeeded, so report that too. Never create a
  merge commit or auto-rebase — the user reconciles deliberately.

`--ff-only` is required so this command can **never create a merge commit**, consistent with ptp's
never-auto-commit rule.

## Report

After the sequence completes (or stops early), report the final state clearly:

- **Current branch** at the time of reporting.
- **Clean-tree stop**: print the porcelain output (or status error), explain why the command stopped,
  and recommend `git commit` or `git stash` before retrying.
- **Switch stop**: print the switch error; note that no pull was attempted.
- **Success**: confirm the branch switched to `master` (or was already there) and report the pull
  outcome — what fast-forwarded to (commit hash / message), or "already up to date", or the pull
  error if `--ff-only` failed.

## Hard rules

- **Authors no files of its own.** This skill only drives git. A fast-forward pull may update tracked
  files to match `master`, but the skill creates no ptp/OpenSpec artifact.
- **Does not run `ptp-branch-guard`.** The branch-guard skill documents this as the deliberate
  "land-on-master exception."
- **Never plain `git pull`.** Always use `git pull --ff-only` to prevent an accidental merge commit.
- **Never auto-stashes / never relocates dirty work.** On a dirty tree, this skill gates (STOPs) —
  it does not move uncommitted work the way `ptp-branch-prep` does.
- **Never merges or rebases a diverged master.** On divergence, `--ff-only` fails and the skill
  reports — the user resolves deliberately.
- **Makes no git changes when the tree is dirty.** The gate is conservative: if porcelain output is
  non-empty (or the status command itself failed), no git commands are run.
- **Never pulls if the switch failed.** The pull step is only reached after a successful
  `git switch master`.
- **STOP.** After reporting the final state, the skill ends. It does not invoke any other ptp step.
