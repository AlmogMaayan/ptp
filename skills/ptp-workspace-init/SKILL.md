---
name: ptp-workspace-init
description: Own creating a ptp workspace in the current directory, its preflight gates, and its report
---

# ptp-workspace-init — declaring the current directory a ptp workspace

## Purpose

This skill is the single normative statement of how a ptp **workspace** is **created**. `/ptp:workspace-init`
takes **no arguments**, is **non-interactive**, and acts on the invocation's current directory alone:
it turns that one directory into a directory `ptp-workspace` can resolve, and it does nothing else.

`commands/workspace-init.md` is a thin front door that invokes this skill and reports;
`skills/ptp/SKILL.md`'s command table names this skill as that command's owner.

Every **resolution** rule — the upward walk, the git-root bound, the override codes, the slug, the
branch shape, the layered configuration merge — stays with `ptp-workspace`
(`skills/ptp-workspace/SKILL.md`). This skill states **no** resolution rule of its own and restates
none of that contract; it cites it. Where the two appear to speak to the same question,
`ptp-workspace` wins.

**Model dispatch target.** `/ptp:workspace-init` runs this skill's work at `haiku.low` via
`ptp-run-at-model` (`skills/ptp-run-at-model/SKILL.md`), which owns the spawn-and-relay mechanics and
requires its caller to supply the target. This names the target only; it restates none of that
contract. The work is mechanical by the test that skill states — fully specified, no design judgment,
a single verifiable outcome — which is why the cheapest tier is the right one.

## The creation action

Reached only once every preflight gate below has passed.

**Step 1 — create the openspec tree.** Run, with the working directory at the invocation's current
directory:

```
npx -y openspec init --tools none .
```

Running it there, rather than at a resolved workspace root, is the fourth departure covered by the
command-scoped exemption in `skills/ptp-workspace/SKILL.md`: at this moment there is no resolved root
to aim the CLI at, only the directory this one call is about to make resolvable.

`--tools none` is deliberate: this command declares a workspace, and wiring an assistant's tool
configuration is a separate decision the user did not ask for here. A successful run produces
`openspec/changes/archive/` and `openspec/specs/` beneath the current directory, and that pair is what
makes the directory resolvable.

**Step 2 — seed the workspace configuration.** Write `<cwd>/.claude/ptp/config.json` containing
exactly `{}` plus a trailing newline, creating `<cwd>/.claude/ptp/` as needed.

Write it **only when that file is absent.** When the file already exists it is left **byte-identical**
— not merged, not reformatted, not re-indented, not rewritten with the same bytes — and the report
says the existing file was kept. An existing file is the user's, and this command has no content of
its own worth overwriting it with.

The seed is an empty object on purpose. It resolves no key and changes no resolved value: the layered
read `ptp-workspace` owns treats an absent layer and an empty one alike. Its only job is to exist, so
that `/ptp:config` has a workspace layer to offer as a write target and the user has a file to open.

## The preflight gates, in a fixed order

The gates are evaluated in **this order**, and the first one that fires decides the run, so one input
yields exactly one outcome. Every refusal **creates no directory, writes no file, and cuts no
branch**.

**Gate 1 — any supplied argument → `refused`, naming the argument.** This command takes no arguments
and acts on the current directory, so a supplied token always means the user asked for something the
command does not do. Stripping it and proceeding against the current directory would act on a
directory the user did not name.

`--workspace <path>` is named in the refusal as the specific case it is: a reserved selector prefix
meaning "resolve to this already-existing workspace", which is the exact negation of this command's
precondition that no workspace exists here yet. It is refused rather than silently stripped, and the
refusal says so, because a user who typed it wanted a different command.

**Gate 2 — an `openspec` entry at the current directory that exists and is not a directory →
`refused`.** A file, a symlink to a file, or any other non-directory entry named `openspec` is
reported and left exactly where it is. **The command deletes nothing.**

**Gate 3 — an `openspec` directory at the current directory → `refused`.** This is the **same
predicate resolution tests** — an `openspec` **directory** at the path — so this gate and
`ptp-workspace`'s walk can never disagree about whether a directory is already a workspace. An empty
`openspec/` counts. One missing its `changes/` subdirectory counts. The refusal names
`npx -y openspec init --tools none .`, run from the current directory, as the **idempotent repair**
for a partial tree, so a user holding a half-made workspace is not stranded.

**Gate 4 — the workspace resolution reporting `no-git-root` → `refused`.** `ptp-workspace` makes that
code a STOP for every later step, so a workspace created outside a git repository would be born
unusable: it would resolve for nothing. The OpenSpec CLI itself needs no git repository; ptp does, and
this gate is ptp's rule rather than the CLI's.

### The two resolutions that let the run proceed

A resolution reporting **`no-workspace`** lets the run **proceed**. That code is the ordinary case
here — a git repository holding no `openspec/` at or above the current directory is exactly the tree
this command exists to populate.

A **successful** entry resolution can only name an **ancestor**, gate 3 having already excluded the
current directory itself, and likewise lets the run proceed — under the ancestor warning below.

## The two resolutions this command runs, and what each is for

This command resolves twice, which departs from `ptp-workspace`'s one-resolution-at-entry rule, and
the second resolution runs inside the spawned `ptp-run-at-model` main run, which departs from that
skill's rule that a spawned run never resolves a root of its own. Both departures — and the
`no-workspace` continue above — are permitted by the **command-scoped exemption**
`skills/ptp-workspace/SKILL.md` carries. That paragraph is the licence; this section only says what
each of the two resolutions is used for.

- The **entry** resolution decides the **preflight only** — gate 4, the `no-workspace` continue, and
  the ancestor case. It is deliberately **not** a root that any path is built from or any CLI call is
  anchored to, because at entry the root this command is about to create does not exist yet. It
  leaves behind exactly one value the report later quotes: the **ancestor's own path**, retained
  as evidence for the ancestor warning the preflight raised. That is warning context, not a workspace
  field, and no later resolution could supply it — the ancestor is by definition not the workspace
  this run created.
- The **post-creation** resolution, run after **step 1** of the creation action succeeds — the
  openspec tree; the best-effort seed of step 2 never gates it — **governs every path and every
  workspace field the report prints** (see *The report* below), and doubles as the **completion
  check**: a resolution that now names the current directory is the proof that the directory became a
  workspace. The two paths the run builds *before* it — the `openspec init` working directory and the
  `<cwd>/.claude/ptp/config.json` seed path — are fixed by this command's current-directory scope and
  by the exemption above, not by any resolution. No reported value is hand-derived: every **workspace**
  value the report carries comes from one of these two resolutions, never from a name or a path the
  reporting agent assembled itself, and the rest of the report — the seed outcome, the warnings, the
  terminal state — is the run's own observed result rather than a derived one.

## Warnings inside a completed run, and the one case that needs a human

**An ancestor workspace is a warning, never a prompt and never a refusal.** Where the entry
resolution named an ancestor and the creation then succeeded, the run is **`completed`** and the
report warns. It is not a confirmation prompt, because the command is non-interactive; it is not a
refusal, because nesting is the very thing the resolution contract exists to support, and deleting
the newly created `openspec/` restores the previous resolution exactly. The warning names the
ancestor's **absolute path** and states that runs from the current directory — and from any
descendant carrying no nearer `openspec/` — now resolve **here** rather than there. Nearest-wins, so
a descendant holding its own `openspec/` is unaffected.

**A config seed that cannot be written is also a warning inside a `completed` run.** It names the
path it could not write and points at `/ptp:config`, and it is **not** a terminal state of its own:
the workspace was created and it resolves, and an unwritten `{}` is inert.

**Exactly one case is `needs-human-action`,** and it is discovered mid-run: the OpenSpec CLI exiting
non-zero, or exiting zero without producing both `openspec/changes/archive/` and `openspec/specs/`.
The report carries the exact follow-up command, to be run from the current directory:

```
npx -y openspec init --tools none .
```

**How the second trigger is checked.** *Exiting zero without producing both directories* is tested by
checking `openspec/changes/archive/` and `openspec/specs/` **directly**. The post-creation resolution
cannot stand in for that test and never substitutes for it: the resolver's predicate is an `openspec`
**directory** at the path, which — as gate 3 says of the same predicate — an empty or partial tree
already satisfies. The direct check is the whole of this trigger.

**Why the completion check adds no terminal state.** Once gate 4 has excluded `no-git-root` and that
direct check has passed, an `openspec` directory provably exists at the current directory and a git
root provably exists above it — which is exactly what the resolver tests, on the very first directory
it examines, invoking no git of its own. The post-creation resolution therefore **cannot** fail to
name the current directory, and it stays what the section above says it is: the completion check and
the source of the report's workspace values, not a third trigger. A resolver that fails anyway has
failed to *execute*, which is a tool error the harness surfaces — not an outcome this command
enumerates, and not a reason to widen its single `needs-human-action` case.

## The report

On a **`completed`** run the report prints, unconditionally:

- the **slug** and **`isRoot`**, taken from the post-creation resolution;
- the **branch shape** ptp will now cut for this workspace, per `ptp-workspace`'s branch-name section;
- the **`/ptp:config` target** to edit this workspace's configuration — **Workspace** wherever its
  config path differs from the project one, and **Project** in the coinciding case below;
- whether the config seed was **written** or an existing file was **kept**;
- every warning above that applies, and the terminal state.

*Unconditionally* binds that list to **every** `completed` run — no field of it is ever dropped as
uninteresting. It never demands a field the run has no resolution to supply: a **`refused`** run
created no workspace and reports the gate that fired and what it refused, and a
**`needs-human-action`** run reports that state, the failure that produced it, and the exact follow-up
command above. Neither prints a workspace field, there being no workspace to describe.

Where the workspace configuration path **coincides** with the project one — the git-root workspace —
the report names **Project** as the `/ptp:config` target rather than **Workspace**. `/ptp:config`
offers its Workspace entry only where those two paths differ, so naming Workspace there would send
the user to an entry that is not on the menu.
