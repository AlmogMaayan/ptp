---
description: Read-only view of the epic backlog — renders the board's entries table, the computed ready set in run order (or the stated reason it is withheld), stale in-progress and provisional-attribution flags, a scope note, and any validation problems. Delegates the store contract, the field mapping, validation, and the ready-set rules to the shared ptp-backlog skill, and the board coordinates, the acting gh account and the capability preflight to ptp-github-projects-gh. Creates nothing — not on the board, not on disk.
argument-hint: "(no arguments — read-only)"
---

You are running **`/ptp:backlog`** — a **read-only** view of the epic backlog, which lives on a
**GitHub Projects v2 board**. It renders what the board says and what the `ptp-backlog` skill computes
from it, and it writes nothing at all — not on the board, not on disk. It is a thin front door: the
store contract, the field mapping, the validation vocabulary, the identity rule, and the ready-set
definition all live in the `ptp-backlog` skill; the board coordinates, the acting `gh` account, the
capability preflight and its STOP message all live in `ptp-github-projects-gh`.

## Steps

1. **Take the configuration gate — before the `ptp-backlog` skill is consulted and before any `gh`
   command is run.** Resolve the `backlog.*` configuration per **`ptp-github-projects-gh`** and take
   **`ptp-backlog`**'s *Read protocol* **step 0**, refusing non-silently on either of its **two**
   grounds — an **incomplete `backlog.*` configuration** (naming the missing keys, which are only ever
   `backlog.projectOwner` and/or `backlog.projectNumber`) and a **colliding resolved status-option
   table**. Each
   ground's content is that skill's — **name the ground, do not restate the rule.** **No `gh` command
   is run on either**, and **no board header is rendered** on the incomplete ground. This
   step is **this command's own**, taken **ahead of** step 2, precisely because a gate reachable only
   through the skill's read protocol is a gate the read protocol's own step 1 — the preflight — can be
   reached without.
   **"Before the `ptp-backlog` skill is consulted" scopes step 2's consultation of the whole contract
   and any entry into the read protocol — never the reading of the two rules this step cites.** The
   collision ground is decided against `ptp-backlog`'s **built-in status-option table**, its merge, and its
   collision rule, which `ptp-github-projects-gh` deliberately does not hold, so this step reads
   exactly those rules and decides the ground **here**. What it must never do is reach the gate
   **through** the read protocol, or defer either ground to step 3 — deferring the collision ground
   would put a configuration ground behind the preflight, which is the failure this step exists to
   prevent.
2. **Invoke / consult the `ptp-backlog` skill** via the Skill tool. The skill holds the complete
   contract: the store identity, the entry model and its tolerant read, the field mapping onto board
   carriers, the version marker and its gate, the read protocol with its configuration-completeness
   and preflight preconditions, the validation problem codes with their fatal / structural
   classification and the `unreachable-store` outcome, and the ready-set definition with its
   deterministic order. **Do not restate any of it here** — not the field list, not the mapping table,
   not the read protocol, not the problem-code table, not the identity rule, and not the
   ready-set rule.
3. **Read** the backlog through the skill's read protocol and **compute** the validation problems and
   (subject to the suppression rule below) the ready set.
4. **Render the output sections** below.
5. **STOP** with the rendered view. Write nothing, and create nothing on the board.

## Output

When the backlog carries **no fatal** validation problem, render these six sections in order:

| # | Section | Contents |
|---|---|---|
| 1 | **Header** | the resolved **board** — owner, project number, project title, and URL — the resolved **acting account and host**, the `version`, and the entry count, **alongside** the preflight verdict line (below). The board-identity values carry their **provenance** — owner and project number the configuration layer that supplied them, account and host the fact that `gh` resolved them — while the project title and the URL carry none (see *The header's board identity and verdict line*) |
| 2 | **Entries** | one row per entry, in the **canonical creation-stamp order**: the entry's **board item node id rendered verbatim in its own column**, title, status, the entry's `changeEpics` links **counted by `attribution`**, and a flags cell |
| 3 | **Ready set** | the ready entries **in run order** — or the reason it is withheld (see *The ready-set suppression rule*) |
| 4 | **Attention** | stale `in-progress` entries, entries holding a `folder-diff-unconfirmed` change-epic link, entries holding an undispositioned `attributionWarnings` prefix. **`in-review` raises no flag here** — see below |
| 5 | **Validation** | one row per problem — code, affected entries, message — or an explicit "no problems found" |
| 6 | **Recommendation** | the next ptp command, in `/ptp:status`'s style — **`/ptp:backlog-continue` when any entry is `blocked` with a non-empty `changeEpics`, or any entry is `in-review` with a non-empty `changeEpics`**, the `blocked` case named first |

The entries table renders in **canonical order, not ready order**, so section 2 is a stable picture of
the board and section 3 is the derived answer. **The node id column is rendered verbatim so it can be
copied**: it is exactly what `/ptp:backlog-edit` takes as its target. A **scope note** (below) is rendered above the
recommendation whenever it has anything to say.

**`in-review` is a healthy resting state, not a defect and not un-reconciled residue, so it raises no
Attention flag.** It renders in the entries table's status column like any other status, through the
resolved option table. The Attention section carries defects and residue only.

**The Recommendation's `changeEpics` qualifier is on both limbs deliberately.** Nothing guarantees an
`in-review` entry carries a recorded change — a hand edit, or a WRITE 1 that failed before a later
attempt's WRITE 2 succeeded, can leave it empty — and recommending `/ptp:backlog-continue` for an entry
its own candidate predicate excludes would send the user into a refusal. `blocked` is named first,
mirroring `/ptp:backlog-continue`'s own selection precedence.

### The header's board identity and verdict line

- **The version renders per the skill's gate**, including the assumed case: a board with no marker
  renders `1 (assumed — no version marker on the board)` rather than a bare `1`.
- **The preflight verdict line is rendered here, and this command installs it.**
  `ptp-github-projects-gh` defines the preflight and its record but installs **no rendering of its
  own**, so the verdict line is this view's to place — **alongside**, never instead of, the board
  identity. Take the **verdict**, the **account**, and the **host** from the preflight record; render
  the account annotated as **resolved by `gh`**, with **no configuration key named as its source**;
  derive none of them.
- **The board identity's parts differ in where they come from, and the rendering must respect that.**
  The **owner** and the **project number** come from the resolved configuration, so on every path
  **past the configuration-completeness gate** — which is every read exit, the failing ones included —
  both have resolved and are **always shown**. The one path where they have not is the pre-read
  refusal below, on its **incomplete-configuration** ground — precisely the case of one of them not
  resolving: that refusal renders **no
  board header at all**, only the non-silent refusal naming the missing keys, because a
  header identifying a board no configuration named would be an invention. **On the gate's
  colliding-status-option-table ground the owner and the project number *have* resolved**, so naming
  them is no invention and they are shown alongside that refusal. The **project title** and the
  **URL** require a board call, so on any path that never retrieved the project — a preflight that did
  not admit the read, or a post-preflight failure to obtain it — they render as `unavailable`.
  Rendering them `unavailable` satisfies the always-show-the-store-identity rule; guessing or omitting
  them does not.

  **Where the resolved transport's project payload carries the URL, it is rendered from the payload.** It
  is **never composed** from the owner, the owner type and the project number — a composed link that is
  wrong points the user at someone else's board — and with the payload carrying it, composing is
  unnecessary as well as forbidden.
- **Every configuration-sourced value in the header carries its provenance.** The **owner** and the
  **project number** each render **together with where the value came from**,
  per `ptp-github-projects-gh` §*The acting identity* — **cited, not restated**:
  the configuration layer that supplied it, named **by role** (`global config` / `project config`) and
  never as a resolved filesystem path. A value that **no** configuration layer and **no** contract constant supplied has
  **no legal rendering**, so the header can never name a board that no configuration named. Provenance
  does **not** attach to the project title or the URL — those come from a board call, and their
  existing `unavailable` rendering already discloses that they were not obtained. Nothing above is
  weakened by this: owner and number are still **always shown** on every path past the gate, the
  incomplete-configuration refusal still renders **no board header at all**, and on the
  colliding-status-option ground they are still shown — each simply now carries its source.
- **The acting identity is a third rendered value, and its provenance is not a configuration layer.**
  The resolved **account** and **host** render **together with the fact that `gh` resolved them** —
  never a configuration layer, never a contract constant, and **no configuration key named as their
  source**, none having supplied them. Where the preflight stopped **before authentication passed**,
  the header **discloses that the acting identity was not established** and **names the stage that did
  not pass**, rendering **no** account, **no** host, and **no** placeholder in their place: naming an
  absence is a disclosure, whereas rendering a value nothing supplied is what the provenance rule
  forbids.

### The scope note

Render a **scope note** section listing, **when each is non-empty**:

- entries that are **board-archived**;
- **metadata-block keys ignored** — **every** key the skill's block grammar does not recognize,
  wherever it sits (the block's top level, or inside a `changeEpics` element), each retained and read
  into nothing. `createdAt` / `updatedAt` and any `dependsOn` / `dependencyEvidence` /
  `dependencyRejected` are the ones a hand-edited or pre-`0042_01` board most often carries — they are
  **examples, not the whole list**, and a key outside them is reported exactly the same way;
- the **degraded-scope** state and exactly what it withholds (the ready set);
- entries whose **`createdAt` could not be established** — reported as ordering **last** rather than as
  having no creation stamp on the board, the two being different claims.
- the **missing-status-option advisory** below;
- the **legacy-file line** below.

### The missing-status-option advisory

Emit a note naming **every** entry status the board's `Status` field can carry **no option** for — that
is, every status whose row in the resolved option table matches none of the board's `Status` options.
The board's options are already in hand from the field read, so the note costs no extra call.

Its bounds are `ptp-backlog`'s, cited and not restated: the advisory raises **no problem code**,
withholds **nothing**, and changes **no verdict**. See that skill's §*The `status` option table —
configurable, with a built-in default* for the rule, the resolved table, and the write path's
corresponding refusal.

### The legacy `openspec/backlog.json` notice

Perform a **presence check only** on `openspec/backlog.json` — does the path exist. When it does, emit
**one** scope-note line stating that the file is **legacy**, is **no longer read**, has **not been
migrated**, and that its entries must be **re-created on the board**.

Its bounds are stated here so it can never grow back into a store: **zero bytes are read**. There is
**no parse, no entry count, no schema, no version gate, no validation problem, no effect on any
computation, and no blocking.** The file is never modified and never deleted.

**It is board-independent, so it renders on every path.** The check reads the filesystem and nothing
else, so it is unaffected by the configuration, the preflight and the board alike: emit the line
whenever the path exists — under a successful read, under the short fatal form, under
`unreachable-store`, under a preflight that did not admit the read, and under the pre-read
configuration refusal, where it is appended below the refusal. The migration warning is most needed
exactly when the board could not be reached, so no failure path suppresses it.

### The empty state

"**No entries yet**" names the **board** — its owner, number and title — and how entries are added. It
**never** names `openspec/backlog.json` or any other local file.

**Hard rule: this wording is reachable only from a successfully-read board that carries the required
custom field and no items at all.** It is **never** rendered from a failed preflight, **never** from the
`unreachable-store` outcome, and **never** from an `unparseable-file` problem. An unreadable board that
rendered as an empty backlog is the single worst outcome this command can produce.

### Under a fatal problem the output is shorter

The six-section output above is **conditional on the absence of a fatal problem**. When a **fatal**
problem — or the `unreachable-store` outcome — is present, render **only** section 1 (header),
section 5 (validation, naming the problem or the outcome), and section 6 (recommendation) — no entries
table, no ready set, no attention section — because nothing further is computable.

In that header the **board identity is always shown** (per the rendering rule above), and any value
that is uncomputable under the problem — the `version` and/or the entry count — is rendered as
`unavailable` rather than guessed. **The same applies to the failed-preflight path**, where no board
call ran at all: the `version` and the entry count render as `unavailable` there too, so no read exit
leaves a header value undefined. Still nothing is written.

**The legacy-file line survives the short output; every other scope-note item does not.** The legacy
line is a **presence check on disk**, computed without reading the board, so it is unaffected by any
board-side problem: when the path exists it is rendered **alongside** the three sections above. Every
other scope-note item — archived entries, ignored block keys, degraded scope, **and the
missing-status-option advisory** — is a
**board-derived** fact, and under a fatal problem or the `unreachable-store` outcome nothing board-derived
is computed at all (that is what *fatal* means in the `ptp-backlog` skill). Those items are therefore
**withheld, not emptied**: the short output never asserts that a board carries no archived entry.

**The advisory is withheld under the short output, and that bound is load-bearing rather than
incidental.** The fatal problem that most often produces the short output is exactly *the board has no
`Status` field, or its type is not the transport's single-select type literal* — under which the board offers **no options at all**, so an
advisory computed anyway would name **every status in the schema's `status` enum** and send the user
chasing a configuration mismatch that does not exist. The `malformed-file` problem already names the real defect.

### The three read exits and their two renderings

| Exit | Rendering |
|---|---|
| the **preflight did not admit the read** | the **full STOP message** in `ptp-github-projects-gh`'s specified shape — its **six** labels in order — **alongside**, never instead of, the header verdict line |
| a **post-preflight failure to obtain the board** | the **short fatal form** naming the `unreachable-store` outcome, the `gh` call that failed, and the transport error |
| the board was **obtained but is uninterpretable** | the **same short fatal form**, naming an `unparseable-file` problem row instead |

**Alongside, never instead of** — substituting one of these renderings for another is the error.

A fourth case is deliberately **not** in that table: the `ptp-backlog` read protocol's **step-0
configuration gate**, refused **before any read is attempted** and running **no** `gh` command. It is a
pre-read refusal, not a read exit, and it must never surface as an `unreachable-store` or a
project-not-found error. **This command takes that gate at its own Step 1**, ahead of consulting the
skill — this paragraph explains why the refusal is not a read exit; Step 1 is where the gate is taken.
(The **step 0** named here is `ptp-backlog`'s read-protocol step, which does **not** renumber.) Its
**two** grounds are that skill's, cited and not restated, and each names
its own cause: an **incomplete `backlog.*` configuration** (the missing keys), and a **colliding
resolved status-option table** — which names
`backlog.statusOptions`, the colliding option name, and every status claiming it, rather than any
missing key.

### The attention section

The attention section is a **requirement, not a nicety**. It MUST:

- surface **every** entry holding a `folder-diff-unconfirmed` `changeEpics` id, so a provisional link
  is visible rather than silently permanent;
- surface **every** entry holding an **undispositioned** `attributionWarnings` prefix;
- **distinguish all three `attribution` values** — `terminal-report` (authoritative),
  `folder-diff-unconfirmed` (provisional), and `user-confirmed-reconciliation` (a human vouched for
  it) — so a provisional or human-vouched link is **never** presented as an authoritative one;
- report an entry whose block-carried fields are **unavailable** as exactly that — never as an entry
  with no warnings and no links.

**The entries table obeys the same rule.** For an entry the unavailable mask covers, the
`changeEpics` cell renders **`unavailable`**, never a count and never `0` — a count of zero would be
the very assertion (*this entry links to no change epic*) the skill's *unavailable is not empty* rule
forbids. Its id, title and status still render normally; only the mask-covered cell degrades.

### The ready-set suppression rule

**Hard rule: a ready set is displayed only when the backlog carries no fatal and no structural
problem.** When any such problem is present the ready set is **withheld** and the defect is named in
its place, so the view can **never** show a ready set that a backlog runner would refuse to consume.

**A second, store-shaped withholding condition stands alongside it:** under **degraded scope** — the
transport cannot return archived items — the ready set is withheld, with the reason named in the scope
note, even though no problem code is raised.

One condition of an **otherwise valid** board is **not** a defect and is reported as such rather than
as a problem:

- **An empty backlog** (no entries at all) — a **no-op**, not a defect. Report it as such, naming the
  board and how entries are added.

**No dependency cell is rendered in any entry row**, and **an empty ready set means no entry carries the
`ready` status** — readiness is `status` alone, per the `ptp-backlog` skill's ready-set definition, so
there is nothing else for the view to explain in its place. **That is not the same as an empty backlog**:
entries may still sit in `backlog`, and the view SHALL point at `/ptp:backlog-edit` performing
`backlog` → `ready` as the promotion.

### The stale `in-progress` flag

Flag every entry whose `status` is `in-progress` **and** whose `runBaseline` is **non-null**.

Word the flag **conditionally**, e.g. *"in-progress with a pending run baseline — un-reconciled from a
crashed run **if no backlog run is currently live**."*

The conditional wording is required, and the **reason** is that a **live** run sets both fields in one
write *before* its work begins, so a running epic and a crashed one look **identical** in the store.
The command **never asserts a crash** and performs **no process inspection** — it reports honestly,
the same posture `/ptp:telemetry status` uses for its Codex preflight ("configured; delivery not
verified") rather than overclaiming.

## Hard rules

- **Read-only in the strongest sense.** It creates **nothing on the board** — no project, no custom
  field, no `Status` option, no item, no version marker — and **nothing on disk**. It modifies nothing
  and deletes nothing. A missing required custom field is **reported, never created**.
- **No fallback, ever.** No failure path reads, creates, or writes a local backlog file or any other
  store.
- **No branch guard, no `openspec validate`, no git command.** `/ptp:backlog` is exempt from the
  branch guard exactly as `/ptp:status` and `/ptp:version` are.
- **Not wrapped in `ptp-run-at-model`.** Like `/ptp:status`, it does no work that needs a deterministic
  model, and wrapping it would start a main run (and a telemetry window) for a read.
- **Takes no argument and no change selector.** Backlog entry identifiers are outside the `epic:` /
  `story:` selector grammar. An argument is reported as **unsupported** in a **single diagnostic line above the header**,
  and the backlog view below that line is **identical to the no-argument rendering** — the argument
  never filters, reorders, or otherwise alters it — and nothing is written.
- **No reconciliation affordance.** The view never performs, and never triggers, reconciliation — an
  affordance would either make a read-only command write or make it invoke a write command. It names
  `/ptp:backlog-edit` in the **recommendation only**, exactly as `/ptp:status` recommends a next
  command without running it.
- **Never restate the skill's contract here** — the entry model, the field mapping, the read protocol,
  the problem codes, the identity rule, and the ready-set definition are defined once, in
  `ptp-backlog`; the acting identity, the `gh` surface, the preflight and its STOP message once, in
  `ptp-github-projects-gh`.
