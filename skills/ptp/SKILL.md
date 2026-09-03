---
name: ptp
description: Route a ptp request to the command that owns it and to each policy's owning file
---

# ptp — router

This skill routes. It names the file that owns each `/ptp:*` command and the file that owns each
indexed policy, and it states none of their behavior: no steps, no variants, no terminal states.
Read the owning file for those.

## Commands

A command whose owner is a skill is a thin front door: it parses its arguments, invokes that one
skill, and reports. A command that owns itself carries its own contract.

| Command | Owner |
|---|---|
| `commands/analyze.md` | `skills/ptp-analyze/SKILL.md` |
| `commands/apply.md` | `commands/apply.md` |
| `commands/archive-and-deploy.md` | `skills/ptp-archive-and-deploy/SKILL.md` |
| `commands/archive-and-merge-to-master.md` | `skills/ptp-archive-and-merge-to-master/SKILL.md` |
| `commands/archive-force.md` | `skills/ptp-archive-force/SKILL.md` |
| `commands/archive.md` | `commands/archive.md` |
| `commands/backlog-add.md` | `skills/ptp-backlog/SKILL.md` |
| `commands/backlog-continue.md` | `skills/ptp-backlog-continue/SKILL.md` |
| `commands/backlog-edit.md` | `skills/ptp-backlog/SKILL.md` |
| `commands/backlog-run.md` | `skills/ptp-backlog-run/SKILL.md` |
| `commands/backlog.md` | `skills/ptp-backlog/SKILL.md` |
| `commands/brainstorm-full.md` | `skills/ptp-brainstorm-full/SKILL.md` |
| `commands/brainstorm-only.md` | `commands/brainstorm-only.md` |
| `commands/brainstorm.md` | `commands/brainstorm.md` |
| `commands/codex-review-loop.md` | `skills/ptp-review-loop/SKILL.md` |
| `commands/codex-review-plan-loop.md` | `skills/ptp-review-loop/SKILL.md` |
| `commands/codex-review-plan.md` | `commands/codex-review-plan.md` |
| `commands/codex-review-prd-loop.md` | `skills/ptp-review-loop/SKILL.md` |
| `commands/codex-review-prd.md` | `commands/codex-review-prd.md` |
| `commands/codex-review-uncommitted.md` | `commands/codex-review-uncommitted.md` |
| `commands/codex-review.md` | `commands/codex-review.md` |
| `commands/config.md` | `skills/ptp-config/SKILL.md` |
| `commands/deploy-master.md` | `skills/ptp-deploy-master/SKILL.md` |
| `commands/deploy-pr-approved.md` | `skills/ptp-deploy/SKILL.md` |
| `commands/deploy.md` | `skills/ptp-deploy/SKILL.md` |
| `commands/effort.md` | `commands/effort.md` |
| `commands/full-apply.md` | `skills/ptp-full-apply/SKILL.md` |
| `commands/full-plan.md` | `skills/ptp-full/SKILL.md` |
| `commands/full.md` | `skills/ptp-full/SKILL.md` |
| `commands/master.md` | `skills/ptp-master/SKILL.md` |
| `commands/merge-to-master.md` | `skills/ptp-deploy/SKILL.md` |
| `commands/plan-multiple.md` | `commands/plan-multiple.md` |
| `commands/plan.md` | `commands/plan.md` |
| `commands/prd-full.md` | `skills/ptp-prd-full/SKILL.md` |
| `commands/prd.md` | `skills/ptp-prd/SKILL.md` |
| `commands/review-brainstorm-full.md` | `skills/ptp-review-brainstorm-full/SKILL.md` |
| `commands/review-brainstorm.md` | `skills/ptp-review-brainstorm/SKILL.md` |
| `commands/review-fix.md` | `commands/review-fix.md` |
| `commands/review-full.md` | `commands/review-full.md` |
| `commands/review-loop.md` | `skills/ptp-review-loop/SKILL.md` |
| `commands/review-plan-full.md` | `commands/review-plan-full.md` |
| `commands/review-plan-loop.md` | `skills/ptp-review-loop/SKILL.md` |
| `commands/review-plan.md` | `commands/review-plan.md` |
| `commands/review-prd-full.md` | `skills/ptp-review-prd-full/SKILL.md` |
| `commands/review-prd.md` | `skills/ptp-review-prd/SKILL.md` |
| `commands/review.md` | `commands/review.md` |
| `commands/status.md` | `commands/status.md` |
| `commands/telemetry-analyze.md` | `skills/ptp-telemetry-analyze/SKILL.md` |
| `commands/telemetry-export.md` | `skills/ptp-telemetry-export/SKILL.md` |
| `commands/telemetry-report.md` | `skills/ptp-telemetry-report/SKILL.md` |
| `commands/telemetry-setup.md` | `skills/ptp-telemetry-setup/SKILL.md` |
| `commands/telemetry-start.md` | `skills/ptp-telemetry-start/SKILL.md` |
| `commands/telemetry-status.md` | `skills/ptp-telemetry-status/SKILL.md` |
| `commands/telemetry-stop.md` | `skills/ptp-telemetry-stop/SKILL.md` |
| `commands/telemetry.md` | `skills/ptp-telemetry/SKILL.md` |
| `commands/update.md` | `commands/update.md` |
| `commands/version.md` | `skills/ptp-version/SKILL.md` |
| `commands/workspace-init.md` | `skills/ptp-workspace-init/SKILL.md` |

## Policies

Each policy below is carried, as a section of that name, by exactly one file. No other file
under `commands/`, `skills/` or `agents/` carries that section heading.

| Policy | Owner |
|---|---|
| Model + effort rubric | `commands/effort.md` |
| Review severity behavior | `skills/ptp-review-loop/SKILL.md` |
| Branch safety | `skills/ptp-branch-guard/SKILL.md` |
| Model dispatch | `skills/ptp-run-at-model/SKILL.md` |
| Terminal states | `skills/ptp-review-loop/SKILL.md` |
| Codex mode resolution | `skills/ptp-codex-mode/SKILL.md` |
| Selector grammar | `skills/ptp-change-selector/SKILL.md` |
