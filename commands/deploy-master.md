---
description: Ship work that already sits on master, committing, pushing, and running the deploy action
argument-hint: "(no arguments — deploys the current master; configure via deploy.* in .claude/ptp/config.json)"
disable-model-invocation: true
---

## Arguments

This command takes no arguments. It operates on the current master.

## Owner

Invoke the `ptp-deploy-master` skill (`skills/ptp-deploy-master/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
