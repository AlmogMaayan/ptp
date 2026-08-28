---
name: ptp-workspace
description: Own the ptp workspace root, its resolution, its override rules, its slug, and the layered configuration merge every reader follows
---

# ptp-workspace — the workspace-root contract

## Purpose

This skill is the single normative statement of what a ptp **workspace root** is, how it is
resolved, how an explicit override is validated, and how a workspace **slug** is derived. Every
command, skill, agent, or workflow needing one of those rules references this skill; none restates
them. It mirrors the way `ptp-change-selector` already carries the shared change-id rules.

A **workspace** is one product inside a repository: a directory holding its own `openspec/`. A
repository may hold several, and the workspace root is what a run resolves to in order to say which
product it belongs to.

## Ownership

`scripts/ptp-resolve-workspace.js` is a **derived** surface. It introduces no workspace rule this
document does not state, names this skill as its authority, and is edited in the same change as this
document. Where the script and this skill disagree, this skill wins.

The contract lives here, under `skills/`, and deliberately not under `openspec/`: `.gitignore`
excludes `/openspec/` in this repository, so a document there is neither committed, nor reviewed, nor
shipped to a repository that installs the plugin. Only a tracked file under `skills/` reaches an
installed copy, which is why the owner is a skill and the specification under `openspec/specs/`
records the requirement rather than carrying the contract.

## Resolving the workspace root

Resolution starts at the working directory and walks **upward**, directory by directory, returning the
first directory that contains an `openspec/` directory. A nearer `openspec/` therefore wins over a
further one.

The walk is **bounded by the git repository root**: the git root is examined and the walk stops there.
No ancestor above the git root is ever examined, so an `openspec/` sitting outside the repository can
never be returned.

The **git repository root** is the nearest directory at or above the working directory containing a
`.git` entry. That entry counts whether it is a directory or a file — a linked worktree stores a
`.git` *file* holding a `gitdir:` pointer, and treating it as a marker resolves such a checkout to the
worktree root instead of walking past it. Resolution never invokes git, so it is deterministic,
dependency-free, and exercisable from a temporary tree.

Two failures come out of this walk:

- `no-workspace` — a git root was found, but no directory from the working directory up to and
  including the git root contains `openspec/`.
- `no-git-root` — no `.git` entry exists at or above the working directory. Resolution fails with
  `no-git-root` rather than continuing up to the filesystem root.

## The root workspace and back-compat

When the git root itself contains `openspec/` and no nearer ancestor of the working directory does,
the workspace root **is** the git root and the derived slug is the empty string. An existing
single-product repository therefore resolves exactly as it did before this contract existed, from
whatever subdirectory the working directory sits in.

## Deriving the slug

The slug is the workspace root's path relative to the git root, lowercased, with every run of
characters outside `[a-z0-9]` collapsed to a single `-` and leading and trailing `-` removed. Path
separators become `-`, so a workspace at `products/foo` carries the slug `products-foo`, and the git
root itself carries the empty string.

The slug is empty **exactly** when the workspace root is the git root, and non-empty for every other
workspace, so a consumer may read emptiness as "this is the root workspace" and omit whatever segment
it would otherwise add.

Collapse-and-trim alone does not preserve that property: a relative path carrying no `[a-z0-9]`
character at all — a directory named `_`, or one written in a non-Latin script — also collapses to the
empty string and would impersonate the root. So when the derivation would yield the empty string for a
workspace root that is **not** the git root, the slug is instead `ws-` followed by the first eight
lowercase hexadecimal characters of the SHA-256 of the `/`-separated relative path. That substituted
slug is non-empty, is a single segment, and contains only `[a-z0-9-]`, so emptiness stays a reliable
root test for every consumer.

**The workspace root path is the identity; the slug is a derived label.** Two distinct workspaces can
therefore slugify alike (`my.product` and `my-product` both give `my-product`). This contract does not
detect slug collisions: doing so needs an enumeration of sibling workspaces that a single-path
resolver deliberately does not perform, and it belongs to whichever later capability keys on the slug.

## The explicit override

`--workspace <path>` overrides the walk: when it is supplied the upward walk does not run and the
supplied path is used instead, resolved against the working directory when it is relative.

The supplied path is validated in this fixed order, each failure carrying its own code, so one input
yields one code:

1. It exists — otherwise `workspace-missing`.
2. It is a directory — otherwise `workspace-not-a-directory`.
3. It contains an `openspec/` directory — otherwise `workspace-no-openspec`.
4. It is at or below the git repository root — otherwise `workspace-outside-git-root`.

A failure at an earlier check stops there; the later checks do not run. The git root used by check 4
is the one discovered from the **working directory**, never one discovered from the supplied path,
which is what makes the check meaningful rather than vacuous and what rejects an override aimed at a
different repository. When no git root exists at all, `no-git-root` is reported before any override
check runs.

Containment compares both sides after resolving each through its real path, so a symlinked checkout
and a case-differing path decide the same way.

## The emitted result

On success exactly one JSON object is written to stdout and the exit code is `0`. The object carries
at least:

| Field | Value |
|-------|-------|
| `workspaceRoot` | absolute path of the workspace root, `/`-separated |
| `gitRoot` | absolute path of the git repository root, `/`-separated |
| `relative` | the workspace root's path relative to the git root, `/`-separated, empty at the root |
| `slug` | the derived slug, empty exactly at the root |
| `isRoot` | `true` exactly when the workspace root equals the git root |
| `source` | `override` when `--workspace` was supplied, `walk` otherwise |

`isRoot` is decided by comparing the two paths, not by testing the slug, so the two can never
disagree.

On a resolution failure stdout stays **empty**, one JSON object is written to stderr carrying a `code`
from the closed set `no-git-root`, `no-workspace`, `workspace-missing`, `workspace-not-a-directory`,
`workspace-no-openspec`, `workspace-outside-git-root` together with a human-readable `message`, and
the exit code is `1`. A consumer may therefore parse stdout unconditionally.

The accepted command line is exactly zero or one `--workspace <path>` pair and nothing else. A
`--workspace` with no path after it, a second `--workspace`, and any other argument are each a **usage
error**: stdout empty, a human-readable usage message on stderr, and exit code `2` — never one of the
six resolution codes and never exit `1`.

## Anchoring openspec to the resolved root

### One resolution, at the step's entry

A ptp step resolves its workspace root **once, at the start of the invocation**, and reuses that one
value for every openspec path it resolves, every CLI call it issues, every script argument it passes,
and every run it spawns. The resolution itself is the contract stated above, together with its derived
`scripts/ptp-resolve-workspace.js`; this rule cites that contract and restates neither the search, nor
the override validation, nor the slug.

Where a command accepts a `--workspace <path>` token, the value stripped from its argument string is
supplied to that contract as its **override**, so the token selects the workspace rather than being
discarded. Where no token is present, the contract's own search decides the root.

**Every command that accepts the token strips it, whether or not it classifies a selector.** A
command that hands its argument string to `ptp-change-selector` gets the strip from that skill's §2
*Selector grammar* rule. A command that runs **no** §2 classification — one whose argument is free
text, such as `/ptp:analyze`, `/ptp:brainstorm-only`, and `/ptp:brainstorm`, which reach
`ptp-change-selector` only through its §4 epic allocation — performs the same strip itself at its
entry, before the remainder becomes a subject, a topic, a derived branch name, a derived change id,
or a written filename. The strip point differs; the obligation does not. Leaving the token in free
text would advertise a flag in the command's `argument-hint` that nothing acts on, and would leak
`--workspace <path>` verbatim into whatever the command derives from that text.

A **failed** resolution STOPs the step, naming the failure code the resolver reported. It never falls
back to the process working directory, nor to the repository root: a step that silently continued
against the working directory would reintroduce exactly the ambiguity this contract removes.

### Every `openspec/…` literal is workspace-relative

Every `openspec/…` literal appearing in ptp commands, skills, agents, workflows, and scripts is
relative to the **resolved workspace root** — not to the repository root, and not to whatever
directory a step happens to run in. This one statement anchors all of them, so adding the workspace
concept rewrites none of the bare relative paths already spelled throughout ptp text.

The rule names exactly one exception: `openspec/telemetry`, which stays anchored to the repository
root through `scripts/ptp-otel-sink.js`'s own `--repo <repo root>` argument. A further exception
requires amending this skill, and is never introduced by analogy.

### The openspec CLI runs with cwd at the resolved root

Every ptp step invoking the openspec CLI runs it with the working directory set to the resolved
workspace root, and issues the directory change and the CLI call **in the same shell invocation** —
`cd <resolved workspace root> && npx -y openspec …`.

Two facts make that shape necessary. The CLI is strictly cwd-local: from a directory holding no
`openspec/` it errors with `No OpenSpec changes directory found` instead of searching upward, so cwd
is the only way to aim it at a workspace. And the agent harness resets the shell working directory
between calls, so a directory change made in one call does not persist into the next.

The directory change does **not** extend to ptp's own scripts. They are spelled as paths relative to
the ptp checkout — `node scripts/ptp-compact-lint.js` — so a directory change into a workspace
subdirectory would make that path unresolvable. A ptp script receives the resolved root as an
**argument** instead, such as `--workspace <resolved workspace root>`.

### A spawned run never resolves a root of its own

A spawned agent, subagent, or workflow **never resolves a workspace root of its own**. The parent
passes its already-resolved root and the child uses it verbatim: `ptp-run-at-model` carries it among
the values its main-run prompt hands over, `ptp-parallel-fanout` gives every fan-out member the
caller's one resolved root, `agents/ptp-apply.md` and `agents/ptp-review.md` take it as an input they
never re-derive, and `workflows/ptp-full-apply.js` both anchors the change folder it names in each
agent prompt and states the root on its own prompt line.

Recovering the root by stripping `openspec/changes/<change-id>/` off an artifact path is exactly the
re-derivation this rule bans.

### Creating a workspace belongs to `ptp-workspace-init`

This skill **resolves** a workspace and creates none. The **creating** surface is
`ptp-workspace-init` (`skills/ptp-workspace-init/SKILL.md`), which owns every creation rule and
restates no rule of this contract, exactly as `ptp-branch-guard` owns *when* the guard runs while
this skill owns the branch shape. Creation is bound to the predicate *Resolving the workspace root*
above already states: a directory becomes a workspace by acquiring an `openspec` **directory** at its
path, and nothing else makes it one, so the creating surface and this resolver can never disagree
about whether a directory is already a workspace.

One exemption from this skill's rules is granted, **scoped to `/ptp:workspace-init`** and to no other
step, and it covers all four of that command's departures: it **continues** on a `no-workspace`
resolution instead of STOPping, which is the ordinary case for a directory about to become a
workspace; it resolves a **second** time, after creation, despite *One resolution, at the step's
entry*; that second resolution runs **inside the spawned `ptp-run-at-model` main run**, despite
*A spawned run never resolves a root of its own*; and it runs the OpenSpec CLI with its working
directory at the **invocation's current directory** rather than at a resolved workspace root, despite
*The openspec CLI runs with cwd at the resolved root*. The third and fourth departures are **forced
rather than chosen**. The third: that rule works by having the parent hand its already-resolved root
down to the child, and no parent can hand down a root that does not exist until the child creates it.
The fourth: that rule exists to *aim* the CLI at an already-resolved workspace, and `openspec init` is
the one CLI call whose purpose is to create the root the rule presupposes — at the moment it runs
there is no resolved root to aim at, only the directory it is about to make resolvable. The exemption
reaches that one `openspec init` invocation and no other CLI call: every openspec call
`/ptp:workspace-init` might make **after** creation is anchored to the post-creation resolution like
any other step's. This is a
command-scoped exemption, not a general licence: no other step acquires any of these four
departures by analogy to it, and extending it to a second command requires amending this skill.

## Branch-name shape

This skill owns the **shape** of every branch ptp cuts. `ptp-branch-guard` owns *when* the guard runs
and *which leaf* its naming cases produce, and `ptp-deploy` owns only its own leaf; both reference
this section rather than restate it, so no file states the segment count twice.

### The two forms

| Resolved workspace | Branch name |
|---|---|
| not the git-root workspace | `ptp/<workspace-slug>/<leaf>` |
| the git-root workspace | `ptp/<leaf>` |

`<workspace-slug>` is the slug *Deriving the slug* above defines for the resolved workspace. `<leaf>`
is the single segment the cutting step derives: one of `ptp-branch-guard`'s naming cases — a
`<change-id>`, an `epic-XXXX` selector, or a summary of at most five kebab words — or the
`deploy-fix-<id>` leaf `ptp-deploy` cuts for a deploy-failure fix. The leaf is lowercase-kebab and is
a **single** path segment containing no `/`, so a branch name carries three segments in a nested
workspace and two at the root, and never more.

### The segment is omitted at the root, which is what makes back-compat total

The workspace segment is inserted whenever the slug is non-empty and **omitted** whenever it is
empty. Emptiness is exactly the root case — this skill makes the slug empty *exactly* at the git root
and substitutes `ws-<8 hex>` for any non-root path that would otherwise collapse to nothing — so the
omission needs no fallback, and a repository whose only `openspec/` sits at the git root keeps
cutting the same two-segment names it cuts today, byte for byte, with nothing to migrate.

If the resolved workspace is **not** the root workspace and its slug is empty, or a resolved slug
contains a `/`, the cutting step **STOPs**, writes no file, and launches no prep workflow: that
combination violates this skill's own resolver contract and is not a shape to guess at.

The workspace is already resolved when the guard runs. An invocation resolves its root **once** (see
*One resolution, at the step's entry*) and the guard consumes that resolution rather than deriving
one of its own, so the guard preamble is ordered **after** resolution in every command running both.

### Readers take the final segment

Every consumer that *parses* a branch name reads the leaf from the branch's **final segment**, so
`ptp/<leaf>` and `ptp/<workspace-slug>/<leaf>` resolve identically for every leaf — a change id, an
epic selector, a kebab summary, and a `deploy-fix-` leaf alike. A two-segment name is both the root
workspace's **current** shape and the shape of every branch cut before this shape existed, so no
consumer distinguishes the two and none requires a rename.

**Nothing is renamed automatically.** Existing branches are never renamed, deleted, or re-cut — one
may already carry a pushed PR — and a session already sitting on such a branch is respected by the
guard's already-on-a-feature-branch no-op, whatever that branch's shape.

### The git ref directory/file conflict, in both directions

Git stores every branch as a file under `refs/heads/`, so a ref and a ref *directory* cannot share a
path. Keeping the two-segment root form makes both directions reachable from ptp's own output:

- an existing two-segment branch — cut by the root workspace, or before this shape existed — blocks a
  nested workspace whose slug equals that leaf from creating any branch beneath it; and
- an existing three-segment branch blocks the **root** workspace from creating the two-segment name
  whose leaf happens to equal that nested workspace's slug.

`ptp-branch-prep` therefore tests both directions in one **read-only preflight**, before its stash
step and before the base checkout — ahead of any action that touches the working tree or HEAD: every
proper prefix of the target ref with `git show-ref --verify --quiet refs/heads/<prefix>`, and the
existence of any ref beneath the target with `git for-each-ref --count=1 refs/heads/<branch>/`. On a
hit in either direction it returns `{ branch, onBranch: false, created: false, stashed: false, error }`
whose `error` names the conflicting ref and the remedy — rename the conflicting branch with
`git branch -m`, or delete it once merged — having stashed nothing, switched nothing, and created
nothing. The guard's existing "proceed only if `onBranch === true`" rule turns that into a STOP that
writes no file.

Ordering is the point: the prep stashes at its first step and creates the branch near its last, so
discovering the conflict late would leave the caller on the base branch with its work in a stash.

### The recorded workspace keeps two equal slugs apart

Switching to an already-existing derived branch stays **kept** rather than made a failure, because
the workspace segment already separates workspaces whose slugs differ. The residual case is a **slug
collision** — `apps/foo` and `apps_foo` both slug to `apps-foo` — which *Deriving the slug* above
declines to detect and assigns to whichever capability keys on the slug. This one keys on it, for
branch names, so it owns that concern and closes it with a binding rather than a scan.

The guard passes the resolved workspace root to `ptp-branch-prep` as a `workspace` argument,
expressed relative to the git root with `/` separators and as the literal `.` for the git-root
workspace, so the passed value is never empty. On **creating** a branch — and only then — the prep
records that value as `branch.<branch>.ptpWorkspace` in the repository's git config; the leaves this
shape permits contain no `.`, so the branch name is unambiguously the git-config subsection. Before
**switching** to an already-existing branch it reads that key, in the same read-only preflight as the
ref-conflict test above and likewise before the stash:

- **absent** — treated as unknown, and the switch proceeds unchanged. The prep does **not** backfill
  a value, because a branch it did not cut carries no evidence of which workspace owns it, and a
  guessed binding would refuse the rightful owner later. This is what keeps every pre-existing branch
  working.
- **equal** to this invocation's — the switch proceeds exactly as it does today.
- **different** — the prep returns `{ branch, onBranch: false, created: false, stashed: false, error }`
  naming both workspace roots and the remedy, having stashed nothing, switched nothing, and created
  nothing, and the guard STOPs.

The binding is O(1) and keyed on the workspace **path** — this skill's identity — rather than on the
derived label, so it needs no enumeration of the repository's workspaces and catches every cause of a
shared branch name, not only equal slugs.

## The layered configuration contract

This skill is also the **sole normative statement** of how ptp resolves layered configuration. Every
other surface — skill, command, spec requirement, README section, or script — **cites** this section
and restates neither the layer list nor its precedence. Two carve-outs apply, each conditioned on the
citing surface stating no precedence, override, or merge rule of its own: a surface may name a
**single** layer it acts on for its own reason, and a surface that **writes** configuration may
enumerate the files it offers as write targets — naming which files are written is not restating how
they are merged. The first carve-out is not available to a surface that **resolves** configuration.
`README.md`'s Configuration section may additionally render the layer paths as a non-normative
discovery table, so a user can find where configuration lives, provided it cites this section for the
merge.

### The layers and their order

Three candidate layers are considered, in this order, each later one overriding the earlier ones
**key by key**:

| # | Label | File |
|---|-------|------|
| 1 | `global` | `~/.claude/ptp/config.json` |
| 2 | `project` | `<repo>/.claude/ptp/config.json` |
| 3 | `workspace` | `<workspace>/.claude/ptp/config.json` |

`<repo>` is the git repository root and `<workspace>` is the workspace root this skill resolves. When
the command is not inside a git repository, candidate 2 falls back to the working directory, exactly
as the interactive editor already does. `PTP_HOME_DIR`, when set, overrides the home directory
candidate 1 sits under; it exists so a verification harness can resolve configuration without touching
the real user config.

A candidate whose root cannot be determined is **absent, not an error**: where no workspace root
resolves, the list is candidates 1 and 2 alone, which is every repository that has never heard of a
workspace. No **containment test** is applied between the workspace root and the repository root;
whatever this skill resolved is used.

### The duplicate-path rule

Each candidate is reduced to an absolute, normalized path **without** symbolic-link resolution, and a
candidate whose reduced path equals an earlier candidate's is **dropped, keeping the earliest
occurrence and its position in the order**. Comparison is exact on POSIX and case-insensitive on
Windows. A dropped candidate is not read a second time and changes neither the precedence nor the
reported provenance of the occurrence that was kept.

Keeping the **earliest** is what leaves the ordinary repository byte-identical: when the workspace
root is the git root, candidates 2 and 3 are the same file, it is read once, at position 2, and its
provenance stays `project`. Keeping the latest would report `workspace` for a repository that has no
workspace concept. The pathological case — a workspace root equal to the home directory — resolves by
the same one rule to `global` and lowest precedence.

### Provenance labels

A resolved value's provenance is reported with exactly one of `default`, `global`, `project`, or
`workspace`. `project` names the repository-root layer and keeps the meaning it has today; `default`
names the key's own default, applied only when no layer supplied a valid value.

### The forgiving posture

Resolution is forgiving across all three layers, preserving four properties:

- **Per-key independence.** An invalid value for one key in a layer neither discards that layer's
  valid values for other keys nor resets an earlier layer's valid value for the same key.
- **A default applies last**, only when no layer supplied a valid value.
- **Trimming applies to the resolved value**: a key whose rule trims resolves to the trimmed form
  rather than merely being validated in trimmed form.
- **Resolution never throws and never STOPs.** A configuration typo never fails an unrelated command.

A layer that is missing, unreadable, unparseable as JSON, whose parsed root is not an object, whose
required parent block is not an object, or that does not carry the key at all is **skipped for that
key only**, leaving whatever an earlier layer validly resolved. A later layer's invalid value never
clears an earlier layer's valid value.

Validity is decided by a caller-supplied **normalizer** rather than a boolean predicate: it returns
either the value to resolve — `undefined`, `null`, and `0` included — or a **rejection** of that layer
for that key, so that validation and normalization are one step and trim-then-resolve is expressible.
A normalizer that raises is treated as a rejection: the never-throw prohibition outranks a caller's
defect. How a rejection is spelled on the wire is internal to the executable half.

### This contract owns no key's validity rule

It states no parameter's kind, domain, default, or validity. Each of those stays with the skill that
already owns that parameter — `codex.*` with `ptp-codex-mode`, `roles.*` with `ptp-agent-roles`,
`review.*` with `ptp-review-loop`, `parallel.*` with `ptp-parallel-fanout`, `deploy.*` with
`ptp-deploy`, `telemetry.*` with `ptp-telemetry`, `backlog.*` with `ptp-github-projects-gh` — so this
contract adds no second authority over any configuration key. A key whose value is interpreted
relative to some root keeps that rule with its owner as well; this contract decides only which layer
supplied it.

### The executable half

`scripts/ptp-resolve-workspace.js` publishes this half of the contract too: a function returning the
ordered, deduplicated layer list with each entry's provenance label, and a per-key resolver applying a
caller-supplied normalizer over that list. Every ptp script that resolves layered configuration takes
its layer list from that builder and constructs no array of configuration paths of its own. The script
remains a derived surface: where it and this skill disagree, this skill wins.
