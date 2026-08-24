> Loaded from skills/ptp-review-loop/SKILL.md when: computing or comparing a code marker fingerprint.
## Code-marker fingerprint

A `kind = code` marker carries a `fingerprint` object describing **the content the review evaluated**, so
a later reader can prove that a recorded convergence still describes the current code rather than
guessing from a timestamp. It is written for `kind = code` only.

**Shape.** `version` (the integer `2` for the algorithm defined here), `algorithm` (the string
`"sha256"`), `value` (the composite hex digest), `footprint` (the path set the digests were taken over,
recorded verbatim so a later reader recomputes over **exactly** the writer's paths), and `inputs` (the
individual component digests and scalars, recorded so a mismatch can be attributed to a component rather
than reported as an opaque boolean). `footprint` is a **sibling** of `inputs`, never a member of it:
`inputs` holds scalars (a branch name, a commit id, four hex digests) and is the object condition 3
checks entry-by-entry and a mismatch report attributes against, so keeping the arrays out of it leaves
both shapes homogeneous.

```json
"fingerprint": {
  "version": 2,
  "algorithm": "sha256",
  "value": "<hex>",
  "footprint": {
    "codeTracked":   ["skills/ptp-review-loop/SKILL.md", "skills/ptp-full-apply/SKILL.md"],
    "codeUntracked": ["scripts/new-helper.js"],
    "contract":      ["proposal.md", "design.md", "tasks.md", "specs/review-loop/spec.md"]
  },
  "inputs": {
    "baseBranch": "master",
    "mergeBase": "2ec92c1…",
    "footprintDigest": "9b41…",
    "trackedDigest": "1a7b…",
    "untrackedDigest": "c033…",
    "contractDigest": "77de…"
  }
}
```

**Value.** The `sha256` of the LF-joined sequence:

```
value = sha256( "ptp-code-fingerprint/2" LF
                baseBranch              LF
                mergeBase               LF
                footprintDigest         LF
                trackedDigest           LF
                untrackedDigest         LF
                contractDigest )
```

The leading literal is a domain-separation tag carrying the same number as `fingerprint.version`, so a
**v2 value can never collide with a v1 value** even over identical inputs, and a future algorithm change
cannot collide with either.

**The footprint.** The footprint is the path set the reviewed change occupied, captured **at write time**
and frozen into the marker. It is three **bytewise-sorted, duplicate-free** lists of
repository-root-relative, forward-slash-separated paths:

| List | Source at capture |
|---|---|
| `codeTracked` | `git diff --no-renames --name-only -z <mergeBase>` — the **one-revision form** (neither `..` nor `...`), which names every path differing between the merge base and the **working tree**, staged and unstaged |
| `codeUntracked` | `git ls-files --others --exclude-standard -z --full-name` |
| `contract` | the change folder's **review contract set** (below), relative to `openspec/changes/<change-id>/`, recorded for attribution only |

The footprint is captured at the **same ordering point as the fingerprint itself** — after the run's
final fix edit and final verification, immediately before the marker write. That placement is
load-bearing: it guarantees every file the review evaluated, and every file the review's own fixes
touched, is inside the footprint.

The marker-directory exclusion below is applied **at capture**, so an excluded path never enters a frozen
list and therefore cannot re-enter at read time; the reader applies **no** exclusion of its own, hashing
a list that is already clean.

**An empty footprint is legitimate, and is not an uncomputable one.** A change touching no tracked and no
untracked file yields two empty lists, over which both code digests are well defined, and the marker is
normal — its contract set still binds it. A capture that *failed* is a different thing entirely and is
handled by *Failure* below; conflating the two would produce a marker that covers nothing while claiming
to cover everything.

`codeTracked` and `codeUntracked` are disjoint by construction (a path is either differing-from-merge-base
or untracked-and-unignored, never both). `contract` overlaps neither where `openspec/` is gitignored (as
here), and may overlap `codeTracked` where `openspec/` is tracked — harmless, the same bytes simply being
hashed twice, exactly as in v1.

**Both capture commands are NUL-delimited (`-z`), and that is mandatory.** In their default output both
commands **C-quote** any path carrying a non-ASCII byte or a shell-special character (`core.quotePath`) —
`café.md` is emitted as `"caf\303\251.md"`, quotes and escapes included. Recorded verbatim, that quoted
string is not the path; fed back as a `:(literal)` pathspec it matches **nothing**, so the file
contributes no hunk to the scoped diff and no line to `untrackedDigest`. Writer and reader agree — both
drop it — so the mismatch is invisible and the path is effectively **deleted from the footprint**, every
later edit to it authorized. That is silent **under-scoping**, the one direction this change must not
move, and it is reached by an ordinary filename rather than an attack. (`-c core.quotePath=false`
suppresses the quoting but not an embedded NUL/LF hazard, so `-z` is the required form, not merely the
preferred one.)

**Paths are hashed and sorted over their raw bytes**, so ordering is locale-independent. A captured path
containing an **LF byte** — which the LF-joined serializations of `footprintDigest` and
`untrackedDigest` cannot represent unambiguously — or one that is **not valid UTF-8** — which has no
faithful JSON-string representation, so writer and reader would round-trip different bytes — makes the
fingerprint **uncomputable** (see *Failure*), never ambiguously serialized. Git permits both and `-z`
reads them back faithfully; the limit is the marker's JSON and the LF-joined serialization, not the
capture.

**`--no-renames` is mandatory on the `--name-only` capture too, for an independent reason.** Rename
detection is on by default (`diff.renames`), and under it `git diff --name-only` reports a rename as its
**destination path alone**. The source path is a *deletion the review evaluated*, and if it never enters
`codeTracked` no digest covers it: restoring or re-creating that file after the marker was written
changes reviewed content while every recorded digest stays put, and the skip is authorized — fail-open,
reached by an ordinary `git mv`. With `--no-renames` the same rename renders as an unpaired deletion
**and** an unpaired addition, so **both** paths enter `codeTracked`. This is a **different** reason from
the scoped diff's `--no-renames` rule below (which prevents out-of-pathspec coupling); the two rules are
independent and **neither implies the other**.

**Every command runs with the repository root as its working directory, and `git ls-files` carries
`--full-name`.** `git ls-files` is implicitly scoped to the current directory and emits paths relative to
it; run from a subdirectory it would silently omit every untracked path outside that subtree and record
the rest under the wrong strings. `--full-name` fixes the rendering, but only executing from the
repository root fixes the scope — so "repository-root-relative" is a property the commands actually
produce rather than one this prose merely asserts. Every capture, every digest, and every read-time
recomputation obeys this.

**The six inputs.**

| Input | How it is derived |
|---|---|
| `baseBranch` | the base branch `ptp-branch-guard` recognizes — `master`, else `main` |
| `mergeBase` | `git merge-base HEAD <baseBranch>` |
| `footprintDigest` | `sha256` over the LF-joined lines `T\0<path>` for each `codeTracked` path, then `U\0<path>` for each `codeUntracked` path, then `C\0<relpath>` for each `contract` path — each list bytewise-sorted, the three groups in that fixed order |
| `trackedDigest` | `sha256` of the bytes of `git diff --no-renames --no-ext-diff --no-textconv --no-color <mergeBase> -- :(literal)<p1> :(literal)<p2> …` over **exactly** the recorded `codeTracked` paths in bytewise-sorted order — the **one-revision form**; an empty list yields the `sha256` of the empty byte string, the command not being run at all |
| `untrackedDigest` | `sha256` over the LF-joined `<path>\0<sha256 of bytes>` lines — or `<path>\0<absent>` when the path does not exist at hash time — for **exactly** the recorded `codeUntracked` paths in bytewise-sorted order. `git ls-files --others --exclude-standard` is **not** re-run when the fingerprint is recomputed |
| `contractDigest` | `sha256` over the LF-joined, bytewise-path-sorted `<relpath>\0<sha256 of bytes>` lines for the change folder's **review contract set** (below), enumerated **by rule** at the moment of computation — **never** from the recorded `contract` list |

**Why `footprintDigest` is an input and not merely recorded.** Two reasons, and both matter.
*Attribution:* condition 4 reports which component moved, and without a footprint component a marker
whose recorded footprint had been altered would surface as a `trackedDigest` mismatch, pointing at the
code when the path set was what changed. *Binding:* the composite value commits to the exact path set the
other digests were taken over, so editing `footprint` in a marker file — narrowing it to hide a file,
say — moves `footprintDigest` and therefore `value`, and the marker fails condition 4 rather than
authorizing a skip over a smaller set than the writer hashed. The footprint is thereby self-protecting,
and the reader's obligation to recompute over exactly the writer's paths is *enforced* rather than merely
stated.

**Why `--no-renames` on the scoped diff, and why `:(literal)`.** With a pathspec, git's rename detection
may pair a footprint path against a counterpart **outside** the pathspec, making the diff text for an
in-footprint path a function of files the footprint deliberately excludes — precisely what scoping exists
to prevent, and liable to differ between writer and reader as those out-of-scope files change.
`--no-renames` makes each footprint path's rendering **path-local**. (v1 had no pathspec and therefore no
such hazard, which is why it did not need the flag.) `:(literal)` pathspec magic is likewise mandatory:
paths come out of git verbatim and may contain `*`, `?`, `[`, or a leading `:`, which passed bare would
be read as globs or as pathspec magic and would silently widen or narrow the set.

**Why the scoped diff is pinned against ambient rendering config.** Its *bytes* are hashed, so anything
that changes how git renders a patch changes the digest. `--no-ext-diff` and `--no-textconv` are
required: an external diff driver or a `textconv` filter can render two different byte sequences
identically — fail-open — and either can be introduced via `.gitattributes` between write and read.
`--no-color` keeps the digest independent of a terminal. Writer and reader use the **byte-identical**
invocation.

**Why the contract set is still enumerated by rule at read time.** `footprint.contract` is recorded for
attribution only. Were `contractDigest` to iterate the frozen list instead, a `spec.md` delta **added**
after the write would be invisible to the reader — a file the review never saw and never approved would
escape the digest entirely. Re-enumerating by rule keeps the v1 property that creating or deleting a
contract member moves the digest.

**The one-revision `git diff` rule**, which applies to **both** the `--name-only` capture and the scoped
`trackedDigest` diff. Each is written with **neither `..` nor `...`** — a single revision argument, which
diffs the merge base against the **working tree** (staged *and* unstaged). This is mandatory, not
stylistic: ptp never commits during apply or review, so the reviewed work is *uncommitted*. Both
`git diff <mergeBase>..HEAD` and `git diff <mergeBase>...HEAD` are **commit-to-commit** forms that omit
the working tree entirely, and so carry **none** of the state this fingerprint must describe. Never use
them here.

**The review contract set** (paths relative to `openspec/changes/<change-id>/`): `tasks.md`,
`proposal.md`, `design.md`, and every `specs/**/spec.md`. A member of the fixed three that does not exist
contributes `<relpath>\0<absent>`, so creating or deleting one moves the digest.

**Direct hashing, not git, for the contract set.** `contractDigest` is computed by hashing those files'
bytes directly. In a repository where `openspec/` is gitignored — as it is in this one — `git diff`,
`git status`, and `git ls-files --others --exclude-standard` are all blind to a `tasks.md` edit, so a
git-derived signal could not see the very edit the fingerprint most needs to catch. Direct hashing is
also correct where `openspec/` *is* tracked: the same bytes are simply hashed twice (once inside
`trackedDigest`, once in `contractDigest`), which is harmless.

**Exclusions.**

- **`HEAD` is not an input.** A commit that changes no bytes leaves the reviewed content identical;
  including `HEAD` would invalidate a still-valid marker for free. `mergeBase` **is** an input, because a
  rebase changes what "the diff" means.
- **Every marker directory is excluded, at capture.** A marker is never reviewed content, so **no** path
  under **any** `openspec/changes/*/stages/` — not merely this change's own — may enter `codeTracked`,
  `codeUntracked`, or the contract set. Under v2 this is a **capture-time filter**: the paths are dropped
  while the footprint lists are built, so they are absent from the frozen set and cannot re-enter at read
  time. The reader subtracts nothing, hashing an already-clean recorded list — strictly simpler than v1,
  where writer and reader each had to subtract the same paths from a re-derived set. Where `openspec/` is
  **gitignored** (as here) the code-list filter is a no-op, git being blind to the folder; where
  `openspec/` **is tracked** it does real work. Two reasons, both fatal without it: the write that creates
  or updates `stages/code.json` would itself move the very digests the marker records, a moment after they
  were computed, so the marker could **never** match itself; and a **sibling** marker — another kind's
  under this change, or any marker under **another** change folder, as a multi-story `/ptp:full-apply` run
  writes one per story — would invalidate this marker for a write that changed no reviewed content at all.
  The exclusion removes marker files, and **only** marker files, from view, so the predicate is
  **narrowed, never weakened**: a marker still cannot survive any edit to any reviewed file.
- **`TLDR.md`, `brainstorm.md`, and `effort.md` are excluded** — none is loaded by a code review (step
  (b) names the contract as proposal / design / tasks / spec deltas), so their churn must not force a
  re-review.

**Scope: the change's own diff footprint.** The claim a code marker makes is, and has always been, *the
content this review evaluated has not moved since the review converged* — never *the working tree is
unchanged*. `trackedDigest` and `untrackedDigest` are therefore scoped to the reviewed change's own
recorded footprint. Content outside it is, by construction, content this review did not evaluate, and it
is covered by the review gate of whatever change owns it; a marker only ever authorizes skipping a review
**for its own change**.

The whole-tree scope of `version: 1` was a **defect, not the expected shape**. It implemented the
stronger statement only because nothing recorded which paths a review covered, and it produced two
sibling bugs: across epics, `/ptp:backlog-run`'s shared, never-committed branch let one epic's apply
destroy an earlier epic's converged proof, so `/ptp:backlog-continue` re-ran a full dual-reviewer review
over byte-identical content; and inside one epic, a multi-story `/ptp:full-apply` invalidated every
story's marker but the last — the concession `skills/ptp-full-apply/SKILL.md` used to carry. Recording
the path set removes both without weakening the gate: every edit inside the footprint, every contract-set
edit, and every merge-base move still deny.

**The residual, named rather than left implicit.** "Covered by whatever change owns it" answers a file
owned by a *different* change. It is circular for a **brand-new file added to _this_ change after its own
marker was written**: that file is outside the frozen footprint, its owner is this change, and this
change's gate is the very marker being consulted, so no digest denies on its account. The residual is
real and it is accepted, for two reasons beyond the circular sentence. First it is **bounded**: capture
happens at the last possible moment, so the residual can only be opened by work performed *after* a
converged review — out-of-band work by construction. Second it is **covered in practice** by
`contractDigest`, which is enumerated by rule and includes `tasks.md`: any implementation work on this
change flips a `- [ ]` to `- [x]` or adds a spec delta, either of which moves that digest and denies.
What escapes is only a source edit made with no accompanying change-folder edit at all. Closing it would
reinstate exactly the repo-wide scope this algorithm removes, so the trade is taken deliberately.

**Read-time recomputation.** Given a marker with `fingerprint.version == 2`:

1. Read `fingerprint.footprint`'s three arrays **as recorded**. Do not re-run `git diff --name-only`, do
   not re-run `git ls-files`, do not re-derive or re-sort into a different order, do not subtract
   exclusions.
2. Resolve `baseBranch` and `mergeBase` **fresh** (per `ptp-branch-guard` and
   `git merge-base HEAD <baseBranch>`). A moved merge base changes what "the diff" means and must deny —
   it does so as a plain scalar mismatch.
3. Recompute `footprintDigest` from the recorded arrays, `trackedDigest` and `untrackedDigest` over
   exactly those arrays, and `contractDigest` by re-enumerating the contract set **by rule**.
4. Recompute `value` and compare it to the recorded `value`.

A reader that cannot complete any step — no git, no merge base, a command error — treats the marker as
**ineligible** (the *Fail-closed* rule under **## Code-marker skip eligibility**), never as matching.

**Ordering.** The fingerprint is computed **after the run's final fix edit and final verification**,
immediately before the marker write, so it describes the state the reviewer signed off — never an
intermediate one.

**Failure — uncomputable, which is never the same as empty.** The fingerprint is **uncomputable** iff any
capture or digest command failed (no git, a detached state with no merge base, a command error, an
unreadable file) **or** a captured path carries an LF byte **or** a captured path is not valid UTF-8. In
that case the writer **still writes the marker**, omitting the `fingerprint` field **entirely**, and
notes the omission; the terminal state the review reached is unchanged either way. There is no partial
fingerprint and no fabricated one, and an **empty** footprint is never substituted for an uncomputable
one — an empty footprint means every command succeeded and returned no paths, and its digests are well
defined. Every reader treats an absent or malformed fingerprint as **not skip-eligible**.

The two non-exit-status triggers are not exceptions to that rule: each is a deterministic, one-pass
property of the captured bytes, checkable identically by writer and reader, and each exists because the
LF-joined serializations and the marker's JSON respectively cannot represent such a path unambiguously.
A capture that succeeds but is merely *suspected* incomplete has **no** third disposition — exit status
is the test — and nothing may be added to that disjunction without the same standard of proof: a
mechanical, writer-and-reader-identical test, never an inference about completeness.
