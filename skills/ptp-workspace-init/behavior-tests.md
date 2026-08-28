```json
{
  "skill": "ptp-workspace-init",
  "assertions": [
    {
      "id": "owns-creation",
      "kind": "requires",
      "pattern": "how\\s+a\\s+ptp[\\s\\S]{0,20}is[\\s\\S]{0,8}created",
      "why": "this skill is the normative statement of how a workspace is created"
    },
    {
      "id": "no-arguments",
      "kind": "requires",
      "pattern": "takes[\\s\\S]{0,6}no\\s+arguments[\\s\\S]{0,6},\\s+is[\\s\\S]{0,6}non-interactive",
      "why": "the command takes no arguments and is non-interactive"
    },
    {
      "id": "current-directory-alone",
      "kind": "requires",
      "pattern": "current\\s+directory\\s+alone",
      "why": "the command acts on the invocation's current directory alone"
    },
    {
      "id": "thin-front-door",
      "kind": "requires",
      "pattern": "commands/workspace-init\\.md.\\s+is\\s+a\\s+thin\\s+front\\s+door",
      "why": "the command file is a thin front door onto this skill"
    },
    {
      "id": "states-no-resolution-rule",
      "kind": "requires",
      "pattern": "states[\\s\\S]{0,6}no[\\s\\S]{0,6}resolution\\s+rule\\s+of\\s+its\\s+own",
      "why": "this skill states no resolution rule of its own"
    },
    {
      "id": "resolution-owner-wins",
      "kind": "requires",
      "pattern": "ptp-workspace.\\s+wins",
      "why": "ptp-workspace wins wherever the two appear to speak to the same question"
    },
    {
      "id": "model-target-haiku-low",
      "kind": "requires",
      "pattern": "at\\s+.haiku\\.low.\\s+via[\\s\\S]{0,6}ptp-run-at-model",
      "why": "the work runs at haiku.low through ptp-run-at-model"
    },
    {
      "id": "cli-invocation",
      "kind": "requires",
      "pattern": "npx\\s+-y\\s+openspec\\s+init\\s+--tools\\s+none\\s+\\.",
      "why": "the creation step runs the openspec CLI with --tools none in the current directory"
    },
    {
      "id": "tools-none-deliberate",
      "kind": "requires",
      "pattern": "--tools\\s+none.\\s+is\\s+deliberate",
      "why": "--tools none is stated as a deliberate choice rather than an accident"
    },
    {
      "id": "created-tree",
      "kind": "ordered",
      "patterns": [
        "openspec/changes/archive/",
        "openspec/specs/"
      ],
      "why": "a successful CLI run produces the changes archive and specs directories"
    },
    {
      "id": "seed-empty-object",
      "kind": "requires",
      "pattern": "containing\\s*\\n?\\s*exactly\\s+.\\{\\}.\\s+plus\\s+a\\s+trailing\\s+newline",
      "why": "the config seed is exactly an empty object plus a trailing newline"
    },
    {
      "id": "seed-only-when-absent",
      "kind": "requires",
      "pattern": "only\\s+when\\s+that\\s+file\\s+is\\s+absent",
      "why": "the seed is written only when the config file is absent"
    },
    {
      "id": "existing-config-untouched",
      "kind": "requires",
      "pattern": "byte-identical",
      "why": "an existing config file is left byte-identical rather than merged or reformatted"
    },
    {
      "id": "empty-seed-is-inert",
      "kind": "requires",
      "pattern": "treats\\s+an\\s+absent\\s+layer\\s+and\\s+an\\s+empty\\s+one\\s+alike",
      "why": "the empty seed resolves no key because the layered read treats absent and empty alike"
    },
    {
      "id": "gates-in-order",
      "kind": "ordered",
      "patterns": [
        "Gate\\s+1[\\s\\S]{0,10}any\\s+supplied\\s+argument",
        "Gate\\s+2[\\s\\S]{0,120}not\\s+a\\s+directory",
        "Gate\\s+3[\\s\\S]{0,40}.openspec.\\s+directory",
        "Gate\\s+4[\\s\\S]{0,80}no-git-root"
      ],
      "why": "the four preflight gates are stated in their fixed order: any argument, a non-directory entry, an openspec directory, then no-git-root"
    },
    {
      "id": "first-gate-decides",
      "kind": "requires",
      "pattern": "the\\s+first\\s+one\\s+that\\s+fires\\s+decides\\s+the\\s+run",
      "why": "the first firing gate decides the run, so one input yields one outcome"
    },
    {
      "id": "workspace-token-refused-not-stripped",
      "kind": "requires",
      "pattern": "refused\\s+rather\\s+than\\s+silently\\s+stripped",
      "why": "the reserved workspace token is refused rather than silently stripped"
    },
    {
      "id": "workspace-token-is-the-negation",
      "kind": "requires",
      "pattern": "exact\\s+negation\\s+of\\s+this\\s+command.s\\s+precondition",
      "why": "the reserved token is named as the exact negation of this command's precondition"
    },
    {
      "id": "deletes-nothing",
      "kind": "requires",
      "pattern": "command\\s+deletes\\s+nothing",
      "why": "a non-directory openspec entry is reported and never deleted"
    },
    {
      "id": "same-predicate-as-resolution",
      "kind": "requires",
      "pattern": "same[\\s\\S]{0,6}predicate\\s+resolution\\s+tests",
      "why": "gate 3 uses the same openspec-directory predicate resolution tests, so the two cannot disagree"
    },
    {
      "id": "partial-tree-counts",
      "kind": "requires",
      "pattern": "An\\s+empty\\s+.openspec/.\\s+counts",
      "why": "an empty or partial openspec directory still counts as already a workspace"
    },
    {
      "id": "idempotent-repair-named",
      "kind": "requires",
      "pattern": "idempotent\\s+repair",
      "why": "the gate-3 refusal names the idempotent repair so a half-made workspace is not stranded"
    },
    {
      "id": "no-git-root-refuses",
      "kind": "requires",
      "pattern": "born\\s+unusable",
      "why": "a workspace outside a git repository would be unusable, so no-git-root refuses"
    },
    {
      "id": "refusal-writes-nothing",
      "kind": "requires",
      "pattern": "creates\\s+no\\s+directory,\\s+writes\\s+no\\s+file,\\s+and\\s+cuts\\s+no",
      "why": "every refusal creates no directory, writes no file, and cuts no branch"
    },
    {
      "id": "no-workspace-proceeds",
      "kind": "requires",
      "pattern": "no-workspace[\\s\\S]{0,8}lets\\s+the\\s+run[\\s\\S]{0,8}proceed",
      "why": "a no-workspace resolution lets the run proceed rather than stopping it"
    },
    {
      "id": "ancestor-proceeds",
      "kind": "requires",
      "pattern": "can\\s+only\\s+name\\s+an[\\s\\S]{0,6}ancestor",
      "why": "a successful entry resolution can only name an ancestor and likewise proceeds"
    },
    {
      "id": "two-resolutions-partitioned",
      "kind": "ordered",
      "patterns": [
        "entry[\\s\\S]{0,6}resolution\\s+decides\\s+the[\\s\\S]{0,6}preflight\\s+only",
        "post-creation[\\s\\S]{0,6}resolution",
        "completion\\s+check"
      ],
      "why": "the entry resolution decides the preflight only while the post-creation one governs the report and doubles as the completion check"
    },
    {
      "id": "exemption-is-cited-not-restated",
      "kind": "requires",
      "pattern": "command-scoped\\s+exemption[\\s\\S]{0,10}skills/ptp-workspace/SKILL\\.md.\\s+carries",
      "why": "the licence for resolving twice is cited from ptp-workspace rather than restated here"
    },
    {
      "id": "nothing-hand-derived",
      "kind": "requires",
      "pattern": "No\\s+reported\\s+value\\s+is\\s+hand-derived",
      "why": "no reported value is hand-derived, the post-creation resolution supplying them all"
    },
    {
      "id": "ancestor-warning",
      "kind": "ordered",
      "patterns": [
        "ancestor\\s+workspace\\s+is\\s+a\\s+warning",
        "absolute\\s+path",
        "Nearest-wins"
      ],
      "why": "an ancestor workspace is a warning inside a completed run, naming the absolute path, and nearest-wins leaves a nearer descendant unaffected"
    },
    {
      "id": "ancestor-never-prompts",
      "kind": "requires",
      "pattern": "never\\s+a\\s+prompt\\s+and\\s+never\\s+a\\s+refusal",
      "why": "the ancestor case is never a confirmation prompt and never a refusal"
    },
    {
      "id": "seed-failure-warning",
      "kind": "requires",
      "pattern": "points\\s+at\\s+./ptp:config.",
      "why": "an unwritable seed is a warning naming the path and the config command"
    },
    {
      "id": "one-needs-human-action",
      "kind": "ordered",
      "patterns": [
        "Exactly\\s+one\\s+case\\s+is[\\s\\S]{0,6}needs-human-action",
        "exiting\\s+non-zero",
        "exact\\s+follow-up\\s+command"
      ],
      "why": "exactly one case is needs-human-action, the CLI failing or leaving a directory absent, and it carries the exact follow-up command"
    },
    {
      "id": "report-fields",
      "kind": "ordered",
      "patterns": [
        "\\*\\*slug\\*\\*",
        "isRoot",
        "\\*\\*branch shape\\*\\*"
      ],
      "why": "the report prints the slug, isRoot, and the branch shape unconditionally"
    },
    {
      "id": "project-not-workspace-target",
      "kind": "ordered",
      "patterns": [
        "names[\\s\\S]{0,6}Project[\\s\\S]{0,6}as\\s+the\\s+./ptp:config.\\s+target",
        "offers\\s+its\\s+Workspace\\s+entry\\s+only\\s+where"
      ],
      "why": "at the git-root workspace the report names Project as the config target, because the config command offers Workspace only where the paths differ"
    },
    {
      "id": "no-external-plugin-invocation",
      "kind": "forbids",
      "pattern": "superpower[s]:",
      "why": "delegates no rule to an external plugin skill"
    },
    {
      "id": "no-override-code-restated",
      "kind": "forbids",
      "pattern": "workspace-outside-git-root",
      "why": "restates none of the resolution contract's override validation codes"
    },
    {
      "id": "no-slug-derivation-restated",
      "kind": "forbids",
      "pattern": "first\\s+eight\\s+lowercase\\s+hexadecimal",
      "why": "restates none of the resolution contract's slug derivation"
    }
  ]
}
```

## Pressure test: the argument that looks harmless

**Situation** - A user types `/ptp:workspace-init --workspace ./apps/foo`, expecting the workspace to
be created at that path.

**Pressure** - The token names a plausible directory, and stripping it and creating a workspace in
the current directory would produce a working workspace and a happy-looking report.

**Required behavior** - Gate 1 refuses, naming the token and saying that `--workspace` means "resolve
to this already-existing workspace" - the exact negation of this command's precondition. Nothing is
created and nothing is written.

**Failure signature** - A workspace created in a directory the user never named.

## Pressure test: the half-made openspec tree

**Situation** - The current directory already holds an `openspec/` directory that carries `specs/`
but no `changes/`.

**Pressure** - Resolution would not treat it as complete, and re-running the CLI would repair it, so
quietly finishing the job looks like the helpful move.

**Required behavior** - Gate 3 fires on the `openspec` **directory** predicate alone, the run is
`refused`, and the refusal hands the user `npx -y openspec init --tools none .` as the idempotent
repair to run themselves.

**Failure signature** - A gate-3 predicate that inspects the tree's contents and so disagrees with
what resolution tests.

## Pressure test: the ancestor that invites a prompt

**Situation** - The entry resolution names an ancestor workspace two directories up, and creation
then succeeds in the current directory.

**Pressure** - Shadowing an existing workspace feels like something to confirm first, or to refuse
outright, so asking looks safer than proceeding.

**Required behavior** - The run is `completed` and the report carries a warning naming the ancestor's
absolute path and the shift in what resolves here. The command is non-interactive, and deleting the
new `openspec/` restores the previous resolution exactly.

**Failure signature** - A confirmation prompt, or a refusal, in a command declared non-interactive.

## Pressure test: the seed that would not write

**Situation** - The `openspec` tree is created, then `<cwd>/.claude/ptp/config.json` cannot be
written - a read-only parent, say.

**Pressure** - A failed write during the action reads like a failed run, so reporting
`needs-human-action` looks like the honest call.

**Required behavior** - The run is `completed` with a warning naming the path and `/ptp:config`. The
workspace exists and resolves, and an unwritten `{}` changes no resolved value.

**Failure signature** - A terminal state other than `completed` for a run whose workspace was created
and resolves.
