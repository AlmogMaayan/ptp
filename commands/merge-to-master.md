---
description: Merge the current feature branch to master without running the deploy or deploy-fix phases
argument-hint: "(no arguments — operates on the current feature branch; configure via deploy.* in .claude/ptp/config.json)"
disable-model-invocation: true
---

## Arguments

This command takes no arguments. It operates on the current feature branch and runs the merge-only variant, skipping the deploy and deploy-fix phases.

## Owner

Invoke the `ptp-deploy` skill (`skills/ptp-deploy/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
