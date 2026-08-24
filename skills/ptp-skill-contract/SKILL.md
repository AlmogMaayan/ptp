---
name: ptp-skill-contract
description: Consult before authoring, reviewing, or delivering any of PTP's own replacement skills, or when deciding how a non-Claude role receives PTP-owned skill text
---

# ptp-skill-contract — the shared contract for PTP-owned replacement skills

This file is the single owner of the rules shared by PTP's seven replacement skills. A replacement
skill, a command, an agent, or a workflow references this file instead of restating any rule below.

## Scope

The four shared authoring rules below — the artifact-shape pointer, the structured-finding emission
format, agent neutrality, and the per-skill budget — bind exactly these seven skills:

- `ptp-brainstorming`
- `ptp-writing-plans`
- `ptp-test-driven-development`
- `ptp-systematic-debugging`
- `ptp-requesting-code-review`
- `ptp-receiving-code-review`
- `ptp-verification-before-completion`

## Artifact shapes

The `compact-artifact-contract` capability is the sole authority on the shape of every ptp artifact a
replacement skill writes or reads. Cite it; reproduce none of it here and none of it in a replacement
skill.

## Structured findings

Every PTP-owned skill that emits review findings emits exactly these six fields per finding, a closed
set:

| Field | Content |
|---|---|
| `key` | the stable finding key, computed per `skills/ptp-review-loop/SKILL.md` for the review kind in play |
| `severity` | one label from the `review-severity` capability's domain and ordering |
| `location` | the file plus line range (code), or the nearest enclosing heading (artifact, brainstorm, PRD) |
| `defect` | one sentence naming what is wrong |
| `evidence` | the quoted text, command output, or cited requirement that makes it wrong |
| `remedy` | the concrete change that resolves it |

The first field's canonical name is `key`, never `stable key`. Nothing else is emitted: no rubric
restatement, no review essay, no praise, no per-iteration narrative. Widening or narrowing the set
amends the `skill-contract` capability, not an individual skill.

`skills/ptp-review-loop/SKILL.md` owns key computation and the `review-severity` capability owns the
severity domain; neither is restated here. This is an emission shape only — it alters no loop behavior,
no `review.minSeverity` or `review.maxIterations` resolution, no convergence counting, no rejection
carry-over, no stage marker, and no code fingerprint.

## Agent neutrality

The same PTP-owned text binds a Claude role and a Codex role.

A Claude role invokes the replacement skill through the **Skill tool**. Because a replacement skill
references this contract rather than restating it, the skill also directs the Claude role to load
`ptp-skill-contract` — and any other PTP-owned file it references for a rule it does not restate —
through the Skill tool, so no role is left holding a dangling reference.

A Codex role has no Skill tool and does not inherit the outer command or skill context. It receives the
same text through exactly one of two modes:

1. **Verbatim inline carriage.** The caller inlines the skill's own text into the Codex prompt
   unaltered. Always admissible — no sandbox setting forbids it — and the required mode for a
   closed-book read-only Codex reviewer, which executes no commands by design. Admissible is not the
   same as succeeding: a caller that cannot itself obtain the PTP-owned text has nothing to inline, and
   takes the terminal state below.
2. **A path read from the plugin's resolved skill path.** The caller directs Codex to read
   `<plugin root>/skills/<skill-name>/SKILL.md`, the plugin root being the PTP plugin directory the
   session resolved (the installed plugin cache location, or the repository root when a ptp checkout is
   used directly). Used **only** when that path is verified readable from the Codex role's sandbox;
   never assumed readable.

**Transitive closure.** Either mode delivers the replacement `SKILL.md` **and** every PTP-owned file it
references for a rule it does not restate, `skills/ptp-skill-contract/SKILL.md` included. Mode 1 inlines
each verbatim; mode 2 verifies each path separately. Delivering the replacement skill without its
referenced contract is an undelivered contract.

**Banned:** a paraphrase, a summary, an abridgement, or any weaker inline fallback substituted when
neither mode is available. When neither mode delivers the PTP-owned text, the caller surfaces a
non-silent terminal state — `refused` or `needs-human-action` — naming the contract it could not
deliver, and does not proceed on a reduced instruction set.

## Skill budget

Each of the seven replacement `SKILL.md` files is normally under 500 words and carries a trigger-only
frontmatter `description` (a routing sentence, not a summary of the method). Four content bans: no
tutorial material, no narrative example, no mandatory worktree or commit behavior, and no meta-skill
machinery. Exceeding the word budget is permitted only with an explicit stated reason in the file; the
budget is enforced by removing duplication, never by truncating necessary normative content.

This file is **exempt** from the 500-word budget, being the single owner of material the seven skills
would otherwise each carry. In exchange it contains nothing already owned by another capability or
skill, and no replacement skill restates anything it owns. The single stated exception is the
Superpowers migration policy text owned by the `superpowers-migration` capability and hosted in the next
section: hosting it here gives the replacement program one entry point and is not a duplication defect.

## Supported environment and coexistence

Conflict-free operation of **PTP's replacement skills** requires Superpowers **absent or disabled**.
That is now the plugin's published supported environment: PTP's own runtime surfaces invoke no external
plugin skill, and every slice of the replacement program is written and verified against it.

The reason is a mechanism PTP does not control: an independently installed plugin registers its own
`SessionStart` hook, which can inject that plugin's own `using-superpowers` entry-point skill and direct
an agent toward its applicable skills. Rewiring PTP's own calls does not reach another plugin's hook, so
PTP cannot neutralize it. PTP material therefore never states or implies that removing every active
external invocation is a guarantee that no agent will ever invoke such a skill.

Coexistence with an installed, enabled instance of that plugin is an explicitly **out-of-scope** compatibility
mode. Discharging the deferral requires platform-specific precedence tests establishing which
instruction set governs when a hook and a PTP-owned skill are both live, on each supported platform —
*platform* meaning the agent runtime that receives the instruction set, a Claude Code session and a
`codex exec` run being distinct platforms. Enumerating the platform set is part of the deferred
obligation. The deferral is not permanent: a later change may add coexistence by discharging it.

## What this file does not own

| Rule | Owner |
|---|---|
| Artifact shapes for proposal, design, tasks, effort, brainstorm | the `compact-artifact-contract` capability |
| Severity labels, their domain and ordering | the `review-severity` capability |
| Stable finding key computation | `skills/ptp-review-loop/SKILL.md` |
| Review loop iteration, convergence, carry-over, stage markers, fingerprints | `skills/ptp-review-loop/SKILL.md` |
| Normative content of the Superpowers migration policy hosted above | the `superpowers-migration` capability |
| Codex mode resolution and the reviewer gate | `skills/ptp-codex-mode/SKILL.md` |
| Running a step at a named model or role | `skills/ptp-run-at-model/SKILL.md` |
