---
description: Declare the current directory a ptp workspace, creating its openspec tree and seeding its config
argument-hint: "(no arguments — acts on the current directory)"
---

## Arguments

This command takes no arguments. Any supplied token — `--workspace <path>` included — is refused
rather than stripped, and the command acts on the invocation's current directory alone.

## Owner

Invoke the `ptp-workspace-init` skill (`skills/ptp-workspace-init/SKILL.md`).

## Report

Report the change id where the command resolved one (this command resolves none), the resulting
state, any failures or warnings, and the next command to run.
