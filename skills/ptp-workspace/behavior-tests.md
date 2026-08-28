```json
{
  "skill": "ptp-workspace",
  "assertions": [
    { "id": "owner-derived-script", "kind": "requires", "pattern": "scripts/ptp-resolve-workspace\\.js[\\s\\S]{0,20}derived[\\s\\S]{0,4}surface", "why": "the resolver script is named a derived surface rather than a second owner" },
    { "id": "owner-wins", "kind": "requires", "pattern": "where\\s+the\\s+script\\s+and\\s+this\\s+skill\\s+disagree,\\s+this\\s+skill\\s+wins", "why": "the skill wins wherever the script disagrees with it" },
    { "id": "not-under-openspec", "kind": "requires", "pattern": "neither\\s+committed,\\s+nor\\s+reviewed,\\s+nor\\s+shipped", "why": "the contract is not placed under the gitignored openspec directory" },
    { "id": "walk-nearest-openspec", "kind": "requires", "pattern": "first\\s+directory\\s+that\\s+contains\\s+an\\s+.openspec/.\\s+directory", "why": "the upward walk returns the nearest enclosing directory holding openspec" },
    { "id": "walk-bounded-by-git-root", "kind": "requires", "pattern": "no\\s+ancestor\\s+above\\s+the\\s+git\\s+root\\s+is\\s+ever\\s+examined", "why": "the walk is bounded by the git root and examines no ancestor above it" },
    { "id": "git-marker-dir-or-file", "kind": "requires", "pattern": "whether\\s+it\\s+is\\s+a\\s+directory\\s+or\\s+a\\s+file", "why": "the git marker counts whether the entry is a directory or a file" },
    { "id": "no-git-subprocess", "kind": "requires", "pattern": "resolution\\s+never\\s+invokes\\s+git", "why": "resolution is dependency-free and never shells out" },
    { "id": "no-workspace-code", "kind": "requires", "pattern": "no-workspace", "why": "a tree with no openspec below the git root fails with no-workspace" },
    { "id": "no-git-root-code", "kind": "requires", "pattern": "no-git-root", "why": "a directory with no git marker above it fails with no-git-root" },
    { "id": "root-workspace-backcompat", "kind": "requires", "pattern": "resolves\\s+exactly\\s+as\\s+it\\s+did\\s+before\\s+this\\s+contract\\s+existed", "why": "a single-product repository resolves exactly as it did before" },
    { "id": "empty-slug-exactly-at-root", "kind": "requires", "pattern": "slug\\s+is\\s+empty[\\s\\S]{0,4}exactly[\\s\\S]{0,4}when\\s+the\\s+workspace\\s+root\\s+is\\s+the\\s+git\\s+root", "why": "the slug is empty exactly at the git root and never elsewhere" },
    { "id": "path-slug-example", "kind": "requires", "pattern": "products/foo.\\s+carries\\s+the\\s+slug\\s+.products-foo", "why": "the slug is derived from the path, products/foo giving products-foo" },
    { "id": "hash-slug-substitution", "kind": "requires", "pattern": "ws-.\\s+followed\\s+by\\s+the\\s+first\\s+eight\\s+lowercase\\s+hexadecimal\\s+characters", "why": "a non-root path that collapses to nothing takes the ws- hash slug instead" },
    { "id": "path-is-identity", "kind": "requires", "pattern": "workspace\\s+root\\s+path\\s+is\\s+the\\s+identity", "why": "the path is the identity and the slug only a derived label" },
    { "id": "collisions-deferred", "kind": "requires", "pattern": "does\\s+not\\s+detect\\s+slug\\s+collisions", "why": "slug collisions belong to a later capability, not to this contract" },
    { "id": "override-suppresses-walk", "kind": "requires", "pattern": "the\\s+upward\\s+walk\\s+does\\s+not\\s+run", "why": "an explicit override replaces the walk rather than seeding it" },
    { "id": "override-codes-ordered", "kind": "ordered", "patterns": ["workspace-missing", "workspace-not-a-directory", "workspace-no-openspec", "workspace-outside-git-root"], "why": "the four override codes are stated in their fixed validation order" },
    { "id": "override-earlier-check-stops", "kind": "requires", "pattern": "a\\s+failure\\s+at\\s+an\\s+earlier\\s+check\\s+stops\\s+there", "why": "an earlier validation failure stops before any later check runs" },
    { "id": "git-root-from-working-directory", "kind": "requires", "pattern": "never\\s+one\\s+discovered\\s+from\\s+the\\s+supplied\\s+path", "why": "the containment check uses the git root found from the working directory" },
    { "id": "result-workspace-root-field", "kind": "requires", "pattern": "workspaceRoot", "why": "the result names its workspace-root field" },
    { "id": "result-git-root-field", "kind": "requires", "pattern": "gitRoot", "why": "the result names its git-root field" },
    { "id": "result-is-root-from-paths", "kind": "requires", "pattern": "isRoot.\\s+is\\s+decided\\s+by\\s+comparing\\s+the\\s+two\\s+paths", "why": "isRoot is decided from the paths, never from the slug" },
    { "id": "result-source-field", "kind": "requires", "pattern": "override.\\s+when\\s+.--workspace.\\s+was\\s+supplied", "why": "the source field distinguishes an override from a walk" },
    { "id": "success-exit-zero", "kind": "requires", "pattern": "written\\s+to\\s+stdout\\s+and\\s+the\\s+exit\\s+code\\s+is\\s+.0.", "why": "a successful resolution writes one object to stdout and exits 0" },
    { "id": "failure-stdout-empty", "kind": "requires", "pattern": "stdout\\s+stays\\s+..empty", "why": "a resolution failure leaves stdout empty so stdout parses unconditionally" },
    { "id": "failure-closed-set", "kind": "requires", "pattern": "from\\s+the\\s+closed\\s+set", "why": "a failure code comes from a closed set rather than free text" },
    { "id": "usage-error-exit-two", "kind": "requires", "pattern": "exit\\s+code\\s+.2.\\s+.\\s+never\\s+one\\s+of\\s+the", "why": "a malformed command line exits 2, not 1" },
    { "id": "usage-never-resolution-code", "kind": "requires", "pattern": "never\\s+one\\s+of\\s+the\\s+six\\s+resolution\\s+codes\\s+and\\s+never\\s+exit\\s+.1.", "why": "a usage error never borrows one of the six resolution codes" },
    { "id": "no-external-plugin-invocation", "kind": "forbids", "pattern": "superpower[s]:", "why": "delegates no rule to an external plugin skill" },
    { "id": "no-git-subprocess-call", "kind": "forbids", "pattern": "git\\s+rev-parse", "why": "root discovery is never delegated to a git subprocess" },
    { "id": "resolve-once-at-entry", "kind": "ordered", "patterns": ["once,\\s+at\\s+the\\s+start\\s+of\\s+the\\s+invocation", "supplied\\s+to\\s+that\\s+contract\\s+as\\s+its[\\s\\S]{0,6}override", "STOPs\\s+the\\s+step,\\s+naming\\s+the\\s+failure\\s+code", "never\\s+falls\\s+back\\s+to\\s+the\\s+process\\s+working\\s+directory"], "why": "a step resolves its root once at the start of the invocation, takes the stripped token as that contract's override, and STOPs on failure instead of falling back to the working directory" },
    { "id": "openspec-workspace-relative", "kind": "ordered", "patterns": ["literal\\s+appearing\\s+in\\s+ptp\\s+commands", "relative\\s+to\\s+the[\\s\\S]{0,4}resolved\\s+workspace\\s+root", "not\\s+to\\s+the\\s+repository\\s+root"], "why": "every openspec literal in ptp text is relative to the resolved workspace root rather than the repository root" },
    { "id": "telemetry-exception", "kind": "ordered", "patterns": ["exactly\\s+one\\s+exception[\\s\\S]{0,20}openspec/telemetry", "never\\s+introduced\\s+by\\s+analogy"], "why": "openspec/telemetry is the one named exception and a further one is never introduced by analogy" },
    { "id": "cli-cwd-same-invocation", "kind": "ordered", "patterns": ["runs\\s+it\\s+with\\s+the\\s+working\\s+directory\\s+set\\s+to\\s+the\\s+resolved", "in\\s+the\\s+same\\s+shell\\s+invocation", "No\\s+OpenSpec\\s+changes\\s+directory\\s+found", "resets\\s+the\\s+shell\\s+working\\s+directory\\s+between\\s+calls"], "why": "the openspec CLI runs with cwd at the resolved root in one shell invocation, because it is cwd-local and the harness resets cwd between calls" },
    { "id": "scripts-take-root-not-cd", "kind": "ordered", "patterns": ["not.{0,4}\\s+extend\\s+to\\s+ptp.s\\s+own\\s+scripts", "receives\\s+the\\s+resolved\\s+root\\s+as\\s+an[\\s\\S]{0,6}argument"], "why": "ptp's own scripts take the resolved root as an argument instead of a working-directory change" },
    { "id": "child-never-resolves", "kind": "ordered", "patterns": ["never\\s+resolves\\s+a\\s+workspace\\s+root\\s+of\\s+its\\s+own", "the\\s+child\\s+uses\\s+it\\s+verbatim", "is\\s+exactly\\s+the\\s+re-derivation\\s+this\\s+rule\\s+bans"], "why": "a spawned agent, subagent, or workflow never resolves a root of its own and uses the parent's verbatim" },
    {"id": "init-is-the-creating-surface", "kind": "requires", "pattern": "creating[\\s\\S]{0,4}surface\\s+is[\\s\\S]{0,4}ptp-workspace-init", "why": "ptp-workspace-init is named as the creating surface while this skill only resolves"},
    {"id": "init-directory-predicate", "kind": "requires", "pattern": "acquiring\\s+an\\s+.openspec.[\\s\\S]{0,8}directory", "why": "creation is bound to the same openspec directory predicate this skill's resolution tests"},
    {"id": "init-exemption-command-scoped", "kind": "requires", "pattern": "scoped\\s+to[\\s\\S]{0,4}/ptp:workspace-init[\\s\\S]{0,4}\\s+and\\s+to\\s+no\\s+other", "why": "the exemption is scoped to this one command and to no other step"},
    {"id": "init-three-departures", "kind": "ordered", "patterns": ["continues[\\s\\S]{0,4}on\\s+a\\s+.no-workspace.", "resolves\\s+a[\\s\\S]{0,4}second[\\s\\S]{0,4}\\s*time", "inside\\s+the\\s+spawned\\s+.ptp-run-at-model.\\s+main\\s+run"], "why": "all three departures are enumerated: the no-workspace continue, the second resolution, and that resolution running inside the spawned run"},
    {"id": "init-third-departure-forced", "kind": "requires", "pattern": "forced\\s+rather\\s+than[\\s\\S]{0,4}chosen", "why": "the third departure is recorded as forced rather than chosen, no parent being able to hand down a root that does not yet exist"},
    {"id": "init-not-a-general-licence", "kind": "requires", "pattern": "command-scoped\\s+exemption,\\s+not\\s+a\\s+general\\s+licence", "why": "the exemption is not phrased as a general licence available by analogy"},
    {"id": "init-four-departures", "kind": "requires", "pattern": "covers\\s+all\\s+four\\s+of\\s+that\\s+command.s\\s+departures", "why": "the exemption enumerates four departures, not three — the CLI-cwd departure is counted rather than left out of a closed enumeration"},
    {"id": "init-fourth-departure-cli-cwd", "kind": "ordered", "patterns": ["runs\\s+the\\s+OpenSpec\\s+CLI\\s+with\\s+its\\s+working[\\s\\S]{0,4}directory\\s+at\\s+the[\\s\\S]{0,140}despite[\\s\\S]{0,8}The\\s+openspec\\s+CLI\\s+runs\\s+with\\s+cwd\\s+at\\s+the\\s+resolved\\s+root", "one\\s+.openspec\\s+init.\\s+invocation\\s+and\\s+no\\s+other\\s+CLI\\s+call"], "why": "the fourth departure names the rule it departs from — the creating openspec init call runs at the invocation's current directory rather than at a resolved root — and the exemption reaches that one call only"}
  ]
}
```

## Pressure test: the tempting ancestor

**Situation** — A run starts inside a repository whose tree holds no `openspec/` anywhere, while the
repository's parent directory does hold one.

**Pressure** — Walking one directory further would find an `openspec/` and let the run proceed
instead of failing, so it looks like the helpful thing to do.

**Required behavior** — The walk stops at the git root and the run fails with `no-workspace`; the
parent's directory is never examined and never returned.

**Failure signature** — A resolved workspace root that lies outside the git repository root.

## Pressure test: the override from another repository

**Situation** — An explicit `--workspace` names an existing directory that holds `openspec/` but
lives in a different repository.

**Pressure** — Every check except containment passes, and rediscovering the git root from the
supplied path would make the containment check pass too.

**Required behavior** — Containment is decided against the git root discovered from the working
directory, so the override is rejected with `workspace-outside-git-root`.

**Failure signature** — An accepted override whose workspace root sits outside the working
directory's own repository.

## Pressure test: the slug that impersonates the root

**Situation** — A workspace root one level below the git root is named so that its relative path
carries no `[a-z0-9]` character at all.

**Pressure** — The plain collapse-and-trim derivation yields the empty string, which is cheap to
emit and looks harmless.

**Required behavior** — A non-root workspace takes the `ws-` hash slug instead, so the empty slug
stays a reliable test for the root workspace.

**Failure signature** — An empty slug reported for a workspace root that is not the git root.

## Pressure test: the child that could just look around

**Situation** — A spawned apply agent is handed a change folder and must run `openspec validate` for
it. Its own working directory sits at the repository root, which holds an `openspec/` of its own.

**Pressure** — Re-running the walk, or stripping `openspec/changes/<id>/` off the change-folder path,
would produce a root without the parent having to state one, and in a single-workspace repository both
shortcuts return the right answer.

**Required behavior** — The child uses the root its parent passed, verbatim, and resolves none of its
own; a prompt carrying no root is a defect in the parent, never a licence to re-derive.

**Failure signature** — A child that reads or validates a different openspec tree than the one its
parent resolved.
