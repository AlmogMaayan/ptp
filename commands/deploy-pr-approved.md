---
description: Resume a deploy whose pull request is now approved, merging and finishing the release
argument-hint: "(no arguments — operates on the current feature branch's open, approved PR)"
---

## Arguments

This command takes no arguments. It operates on the current feature branch's open, approved pull request, and resumes the deploy at the merge step.

## Owner

Invoke the `ptp-deploy` skill (`skills/ptp-deploy/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
