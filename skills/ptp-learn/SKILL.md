---
name: ptp-learn
description: Own the learning-mode key and the learnings file locations that ptp sessions resolve through one script
---

# ptp-learn — learning mode and learnings files

## The key

`learning-mode` is a top-level configuration key owned here. Its value is matched exactly, with default `off`. Any other string, any non-string, and any case or spacing variant (`Learn-Only`, ` off`) is not a value: that layer is skipped for this key only.

| Value | Meaning |
|-------|---------|
| `off` | Nothing is recorded and nothing is read back. |
| `learn-only` | Recording is permitted; there is no read-back. |
| `learn-and-suggest` | Recording is permitted; a read-back shows a matching insight beside the run's own default without applying it. |
| `learn-and-use` | Recording is permitted; a read-back adopts a matching insight as the default, named so the user can override it. |

Switching to `off` deletes no file. The key resolves through the layered configuration contract of `ptp-workspace`, which owns layer order and provenance; `off` applies only when no layer holds a valid value. Resolution never fails a command.

## The files

- Project file: `<root>/.claude/ptp/learnings.md`. `<root>` is the workspace root the caller passes. With none passed it is the workspace root found by the `ptp-workspace` walk, else the git root (fallback `repo`), else the working directory (fallback `cwd`). A workspace root that equals the git root is not a fallback. The config file under the same `<root>` is one of the layers that resolve the mode.
- User file: `<home>/.claude/ptp/learnings.md`, where `PTP_HOME_DIR` overrides the home folder.
- Same file: when both paths name one file (symbolic links followed on the existing part, case-insensitive on Windows, works before the file exists), `sameFile` is true and a writer records once.

## The script

`node scripts/ptp-learn.js [--workspace <root>]` prints one JSON line (`mode`, `modeLayer`, `project.path`, `project.fallback`, `user.path`, `sameFile`) and exits 0. A usage error exits 2 with empty stdout: an unknown argument, a missing or repeated `--workspace` value, or a `--workspace` path that is not an existing directory. `--append`, `--size` and `--list-insights` are the operation selectors, all implemented (see *Append*, *Size line* and *Read-back*); at most one runs per call, and one with another or with `--self-test` exits 2. `node scripts/ptp-learn.js --self-test` checks all of this.

## Lesson format

A learnings file is an append-only sequence of lessons and nothing else; no writer rewrites or deletes a lesson.

- **Heading.** Each lesson begins with `## Lesson <lesson-id>`, matching `^## Lesson [0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$`: a UTC time, a hyphen and 6 random hex digits. `scripts/ptp-learn.js` exports that pattern, with no flags, as `LESSON_HEADING_RE`. Every reader tests single lines with it and declares no pattern of its own.
- **Fields.** After the heading and one blank line: `- date: <YYYY-MM-DD>` (the UTC date of the id), `- source: <prompt-fix|learn>`, then, on the user copy only, `- origin: <tag>` and `- scope: <general|project-specific>`.
- **Blocks.** `### Reference`, `### Response`, `### Insight`, in that order, each heading preceded and followed by one blank line.
- **Quoting.** Every content line carries a `> ` prefix; an empty content line is `>`. Content is normalized only by turning CRLF into LF and removing trailing line breaks, so a pasted `## Lesson` line is never at column 0. A reader strips `> ` or `>` to get the text back.
- **Copies.** The project copy's Insight is the specific insight, which may name project files and terms. The user copy's Insight is the general insight; `scope` is `project-specific` when nothing generalizes and the narrowest transferable preference was written instead.
- **Origin.** The repo folder name (the git root found from the workspace root, else the project copy's base folder outside git), then `/<slug>` only when the `ptp-workspace` slug is not empty. A git-root workspace or a fallback path has no slug.
- **Separators.** An append to a non-empty file writes one blank line first; the file always ends with a line break.

## Append

`node scripts/ptp-learn.js [--workspace <root>] --append <input.json>` reads `source`, `reference`, `response`, `specificInsight`, `generalInsight` and `scope` from a JSON object file.

- **Order.** Input checks first: a missing or repeated `--append` value, an unreadable or non-object JSON file, or a missing, empty or out-of-domain field exits 2 with empty stdout before any write. Then the mode check: under `off` it writes nothing, runs no git command, prints `{"written":false,"reason":"learning-mode off"}` and exits 0. Then the writes.
- **Writes.** It creates missing `.claude/ptp/` folders, then appends the project copy, then the user copy, under one lesson id with identical Reference and Response. When `sameFile` is true it writes one lesson in the user form.
- **Output.** One JSON line: `written`, `lessonId`, `writes` (each `{copy, path}`, `copy` being `project`, `user` or `shared`) and `git`. A failed write keeps any copy already written, exits 1 with `written:false`, the `writes` that succeeded and an `error` naming the failing path.
- **Git.** It runs only the read-only `git check-ignore -q -- <project path>` from the project file's folder, never stages or records anything and never edits `.gitignore`. The caller reports the sentence for the value:

| Exit | `git` | Report sentence |
|------|-------|-----------------|
| 0 | `ignored` | the project copy stays local |
| 1 | `not-ignored` | the next `/ptp:deploy` stages the project copy |
| other | `no-git` | the project copy is not in a git repository |

## Size line

`node scripts/ptp-learn.js [--workspace <root>] --size` counts both learnings files read-only and never creates a file or folder. Pass `--workspace <root>` when the command resolved a workspace root, and omit it when it resolved none. `--size` with `--append` or `--self-test` exits 2. It exits 0 and prints one line, or nothing:

| Case | stdout |
|------|--------|
| mode `off` | nothing |
| two files | `learnings — project: 12 issues, 340 lines · user: 30 issues, 810 lines` |
| one missing file | that slot reads `0 issues, 0 lines (no file yet)` |
| same file | `learnings — project + user (same file): 12 issues, 340 lines` |
| unreadable path | that slot reads `unreadable` |

Issues are the lines `LESSON_HEADING_RE` matches. Lines are physical lines split on `\r?\n`: blank lines count, a final newline adds none, an empty file has 0. Plurals stay fixed (`1 issues`).

Placement rule:

- **Who.** Only the outer session of the command the user invoked prints the line. A command run inline by another command in the same session, a subagent, a Codex run and a workflow agent never print it.
- **When.** The outer session runs the `--size` call after every other part of its report, including any learnings write the command made, and prints stdout word for word as the last line. This holds on every outcome that reaches a report: success, STOP, refusal, `NEEDS SPLIT` and `needs-human-action`.
- **Where.** In a wrapped command, the line follows the relayed main-run result. For `/ptp:prompt`, `/ptp:prompt-fix` and `/ptp:prompt-new`, it follows the confirm-or-correct question when the turn asks one.
- **Silence.** Empty stdout, a non-zero exit, or a script that cannot run prints nothing: no size line and no hint line. Without the script the mode is unknown, and printing anything could break the silence of `off`.
- **Trailer.** The line is a trailer. A requirement that fixes a report's shape, first or last line, or line count governs the report without the trailer; the `/ptp:effort` single line is one example. Machine readers of a report are always nested callers, and nested callers never print the line.

Every `commands/*.md` file carries the sentence `` If the user invoked this command and you are the outer session, the `ptp-learn` size line ends your report. `` once, inside its `## Report` section when it has one. `scripts/check-learnings-size-line.js` enforces it.

## Read-back

Under `learn-and-suggest` and `learn-and-use` a run that states assumptions reads stored insights back. `learn-and-suggest` shows a matching insight beside the run's own default without applying it; `learn-and-use` adopts it as the default and names it. `off` and `learn-only` read nothing back.

- **Operation.** `node scripts/ptp-learn.js --list-insights [--workspace <root>]` merges both learnings files read-only and prints the `ptp-run-at-model` part (j) block, or nothing under `off`, under `learn-only`, or when no insight survives. Pass `--workspace <root>` when the caller resolved a workspace root, and omit it when it resolved none. The block's text, its merge order and its rules are owned by `skills/ptp-run-at-model/references/learnings-readback.md`.
- **Callers.** The outer session of `/ptp:prompt`, `/ptp:prompt-fix` (every turn, the first-request fallback included), `/ptp:prompt-new` (only when it starts a main run), `/ptp:brainstorm`, `/ptp:brainstorm-only`, Phase A of `ptp-brainstorm-full`, and `/ptp:brainstorm-decompose` beat 3 runs the listing before its main run and passes non-empty output verbatim as part (j). Empty output means no part (j). `/ptp:brainstorm-decompose` runs it once and hands the same block to every beat-3 member, under either `roles.main`.
- **Excluded runs.** `/ptp:brainstorm-decompose` beat 2, `/ptp:plan-multiple`, `/ptp:plan`'s inline brainstorm and `ptp-brainstorm-full` Phase B receive no part (j).
- **Failure.** A non-zero exit, or a script that cannot run, never stops the command: the caller passes no part (j), prints the single line `learned insights omitted: <reason>`, and continues.
- **Timing.** The listing is taken before the main run, so a lesson `/ptp:prompt-fix` records in a turn is read back from the next turn on.

## /ptp:learn

Owns command: /ptp:learn

`/ptp:learn "<paste>" [model:<model>.<effort>]` records one lesson from a pasted model message and the user's answer to it. The outer session runs these steps in order; every step that can end the command runs before the main run starts. Scripts are named relative to the ptp checkout.

1. **Token.** Parse and strip the optional `model:` token per `ptp-run-at-model`'s *Optional caller-side `model:` override token*. An invalid or duplicate token STOPs here. A pasted `--workspace` stays in the text; the command takes no `--workspace` token.
2. **Workspace.** Run `node scripts/ptp-resolve-workspace.js` once. When it resolves a root, pass `--workspace <root>` to every `ptp-learn.js` call below. A `no-workspace` or `no-git-root` result does not stop the command: omit `--workspace` from every call, so the script's `repo` or `cwd` fallback applies and the report names it.
3. **Mode.** Run `node scripts/ptp-learn.js [--workspace <root>]`. Under `off` (the default), start no run, touch no file and report `learning off`: say to set `learning-mode` via `/ptp:config`, name `learn-only`, `learn-and-suggest` and `learn-and-use`, and recommend the global layer to learn across all repos. This precedes the empty-paste check, so an empty `/ptp:learn` under `off` still shows the opt-in message.
4. **Empty paste.** If the token-stripped paste is empty or whitespace only, stop with state `not recorded`.
5. **Main run.** Start one foreground `ptp-run-at-model` main run at the `prompt` family target (`skills/ptp-run-at-model/references/family-default-target.md`: `models.prompt`, else `opus.high`) or the valid `model:` override. Its prompt carries the token-stripped paste and the `## Lesson insights` request from `skills/ptp-prompt-draft/SKILL.md` *Lesson recording*, as text, with no Skill call. It returns either a lesson (Reference, Response, `Specific insight:`, `General insight:`, `Scope:` of `general` or `project-specific`) or `unsplittable` with a one-line reason. It writes no file, asks nothing, and records any real choice as an assumption inside the insight.
6. **Verify.** Before any write, compare Reference and Response with the paste after changing CRLF to LF and trimming the ends: each must occur in the paste as exact text, and the two must differ. On `unsplittable`, a failed check, or a missing or malformed result, write nothing and report `not recorded`.
7. **Append.** Write the input JSON (`source: "learn"`, `reference`, `response`, `specificInsight`, `generalInsight`, `scope`) to a file outside the repository tree and run `node scripts/ptp-learn.js [--workspace <root>] --append <input.json>`. Relay the operation's own outcome: lesson id, written paths, any named fallback, and the git sentence from *Append* mapped from the `git` value. Never retry and never read an insight back. A failed or partial append is reported as a failure with the operation's message and is never reported as `recorded`.

Report states are exactly `recorded`, `learning off` and `not recorded`. There is no change id, because a lesson belongs to no change, and the command runs no branch guard: it writes only the learnings files and the append's input file outside the repository tree.
