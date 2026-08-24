> Loaded from skills/ptp-github-projects-gh/SKILL.md when: emitting the non-silent preflight stop message.
## The STOP message

A failed preflight is a **non-silent STOP** — never a warning-and-continue, never a fallback — for
every operation that would reach the store **and whose required tier did not pass**, and for no other
operation. That qualifier is part of the rule, not a later exception to it: under `read-only` the read
tier passed, so readers proceed and only writers stop (see [STOP scoping](#stop-scoping)). Reading "any
verdict but `ready` stops everything" would collapse the third verdict into `unavailable` and discard
the one distinction it exists to draw.

The message's shape is fixed so it can be reviewed and grepped:

```
GitHub Projects backlog preflight FAILED — no backlog operation ran.
  stage:         token scope
  gh:            2.89.0
  account:       <login> on github.com   (resolved by gh; token from keyring)
  board:         <owner> / project #<n>  (backlog.projectOwner — project config;
                                          backlog.projectNumber — global config)
  likely cause:  the authenticated token carries neither the read:project nor the
                 project scope, so no Projects data can be read
  repair:        gh auth refresh -s read:project
ptp does NOT silently proceed. No backlog operation ran and no local backlog file was
read, created, or written.
```

The login, the owner, and the board number above are **placeholders**, and deliberately so: this block
is the most-copied rendering exemplar in the file, so it names no live account, no live owner, and no
live board — see [The acting identity](#the-acting-identity).

### The label set is invariant at six

In this order:

1. `stage:`
2. `gh:`
3. `account:`
4. `board:`
5. `likely cause:`
6. `repair:`

— followed by the **unlabeled** trailing prohibition line.

The shape exists to be reviewable and greppable, so a conforming implementation **SHALL NOT** substitute
its own label names and **SHALL NOT** reorder them.

The retired **seven-label** set lost five labels with the MCP artifacts they named —
`server:`, `namespace:`, `required:`, `found:`, `missing:` — and gained four: `stage:`, `gh:`,
`account:`, and `board:`. `likely cause:` and `repair:` survive unchanged in purpose.

### Per-label content rules

- **`stage:`** renders the **last stage reached**, in words, matching the record's four values.
- **`gh:`** renders the captured version — including the literal `unreported` where the binary ran
  but bound no version token. Where **S1 failed** it names **which** of S1's two failures occurred:
  *"not found on PATH"*, or *"on PATH, but `gh --version` failed"* carrying `gh`'s stderr verbatim.
  Rendering *"not found on PATH"* for a binary that **is** on PATH would be a false disclosure, which
  the same discipline that governs the `account:` label forbids.
- **`account:`** renders `<login> on <host>`, annotated **resolved by gh** and carrying the token
  source. A configuration key **SHALL NOT** be named as its source — none supplied it.
- **`account:` where S2 has not passed** — a binary-stage or authentication-stage stop — renders
  *"not established — the `<stage>` stage did not pass"* and **no value at all**. The label is still
  **present**, because the set is invariant at six. It **SHALL NOT** invent a login, **SHALL NOT**
  render `unavailable` as though it were the account, and **SHALL NOT** borrow an
  authenticated-but-inactive account from `gh`'s own list. Why in one line: the **label** is mandatory
  and the **value** is not, so naming an absence *discloses* rather than *renders*, and
  `0047_02_backlog-config-gate-enforcement`'s *a value no source supplied has no legal rendering*
  absolute survives unweakened. Leaving this case unstated is what forces an implementer to invent one.
- **`board:`** renders owner and project number **each with its configuration layer, by role**
  (`global config` / `project config`), per `0047_02`'s provenance discipline. It is rendered on
  **every** stopping branch, because the configuration gate has already established that both values
  resolved — which is why `board:` needs no not-yet-established case of its own.
- **`archiveReachable` gets no label.** It is a record field consumers read, not a line this message
  renders, and adding one would breach the invariant set of six.

### The repair ladder

One row per stopping branch — eight of them — and `gh` writes two of the rows itself.

| Stage / condition | Verdict | `repair:` renders |
|---|---|---|
| **binary** — `gh` not on PATH or `--version` failed | `unavailable` | install the GitHub CLI and put `gh` on PATH (`https://cli.github.com`). Names **no** ptp configuration key: no key can install a binary. |
| **authentication** — not logged in, or the active account's `state` is not `success` | `unavailable` | `gh auth login`; where an account exists but the intended one is not active, `gh auth switch`. |
| **authentication** — more than one host carries an active account, so no single entry can be identified | `unavailable` | leave exactly **one** host with an active account — `gh auth logout --hostname <the host you do not want>` — or make the intended one active with `gh auth switch`. ptp names these and runs none of them, and it **never** falls back to a default host: a guessed host is a guessed identity. Names **no** ptp configuration key: no key supplies the identity. |
| **authentication** — `gh auth status` exited non-zero, its output did not parse, or the selected entry carried no usable `login`/`host` | `unavailable` | re-run `gh auth status` yourself and repair what it reports, **carrying `gh`'s stderr verbatim** where the call produced any; where it produced none, state which of those conditions held. Names **no** ptp configuration key. |
| **scope** — neither tier present | `unavailable` | `gh auth refresh -s read:project` — **`gh`'s own words**, quoted verbatim from the insufficient-scope error a Projects call raises under this condition. **No live stderr exists at this branch** — S3 decides from S2's *successful* payload and runs no command of its own — so the line is rendered from the quotation below, never captured. |
| **scope** — `read:project` only (writers) | `read-only` | `gh auth refresh -s project` — **`gh`'s own words**, from `gh project --help`. |
| **scope** — indeterminate (writers) | `read-only` | states that the token's scopes could not be established, that reads are demonstrated by the successful board call while writes are not, and offers `gh auth refresh -s project` as the route. |
| **board** — non-zero exit, unparseable JSON, **or a parsed payload carrying no usable `.id`** | `unavailable` | `/ptp:config → backlog.projectOwner` / `backlog.projectNumber`, **carrying `gh`'s stderr verbatim** where the call produced any — and, on the no-`.id` branch (which exits zero and produces none), stating that the board was retrieved but carried no node identifier. The **only** stage where a ptp configuration change can help. |

Three rules bind the ladder.

1. **Each stage's failure is itself the diagnosis.** There is **no branch without a defined repair** and
   **no best-effort step whose skipping degrades a line** — which is why the retired contract's
   corroboration mechanism and its six-row conditional-repair table are **deleted wholesale** rather
   than ported. That table needed corroboration because *"is the server there at all?"* had no cheap
   answer, and it needed a catch-all default row because corroboration was explicitly skippable, leaving
   a branch whose repair was mandatory but whose input might never arrive. Neither condition exists
   here.
2. **A configuration key SHALL NOT be named as the repair where no configuration change can help.**
   Carried forward verbatim from the retired contract, and now trivially satisfiable: exactly one of the
   eight rows names one.
3. **ptp never runs `gh auth refresh`, `gh auth login`, `gh auth switch`, or `gh auth logout`.** They
   are named as the **user's** action and never performed: each changes a credential ptp does not own,
   and `refresh` additionally opens a browser consent flow. This is the direct analogue of
   `ptp-branch-prep` being a user-facing repair rather than something a command performs on the user's
   behalf.

### STOP scoping

`unavailable` stops **every** operation that would reach the store, read or write. `read-only` stops
**writers only**, because the tier gating reads passed — which is the entire purpose of reporting it
distinctly rather than as an undifferentiated failure.

### Why never-proceed is an absolute

A silent fallback records a backlog locally while the user believes their board is the record. They then
plan against a board missing everything ptp recorded — **data loss by divergence**, discovered late,
leaving two half-backlogs and no merge story. A hard STOP costs one repair.

The asymmetry is not close, so the rule takes **no exceptions and no `--force`**. Concretely: no read,
no creation, and no write of any local file in place of the configured board.

---
