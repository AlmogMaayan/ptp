> Loaded from skills/ptp-github-projects-gh/SKILL.md when: building a concrete gh call.
## The shell-invocation contract

The retired contract needed nothing here: MCP tool calls are structured, so quoting, exit codes, and
parsing were somebody else's problem. A `gh` call is a process. This section is therefore the one place
those decisions are made, and it is what `0047_06_backlog-gh-read-path` and
`0047_07_backlog-gh-write-path` build **every** concrete call from. No consumer decides quoting,
exit-code, parsing, or error-surface behaviour for itself.

**1. One contract call is one `gh` process.** No pipelines, no `&&` / `;` / `|` chaining, and no command
substitution **that produces, filters, or transforms the call's data**, inside a contract call. `--jq`
performs in-process the filtering a pipe to `jq` would, so no second binary is required and no quoting
crosses a pipe boundary.

**Exactly one body-construction form is admitted, and it sits outside a contract call.** Rule 3's
heredoc capture, `body=$(cat <<'PTP_BODY' … )`, is a **separate statement executed before the call** —
the call itself then passes only `"$body"`, so no substitution occurs inside it and rule 1's prohibition
never engages. Stating this reconciliation is not optional — without it the contract reads as forbidding
its own prescribed example.

**The temp-file form, `--body "$(cat "$f")"`, is retired and is admitted no longer.** It was once
admitted here by name; that admission contradicted the write path, which had already rejected the same
form with its reasons stated. That rejection lives at `skills/ptp-backlog-write/SKILL.md` §*The composed
body's emission obligations*, under **Rejected: a temp file plus `--body "$(cat <file>)"`** — read its
grounds there. It is the **governing rule**, and it is **cited here, never restated**: it sits in the one
normative home of the obligations it belongs to, and a second statement of its grounds, here, would be a
second home that could later drift from it.

**No command substitution is admitted inside a contract call, and there is no exception** — not for a
just-written file, not for any other materialization, and on neither route. A statement **feeding** a
call is not itself a contract call, and rule 3's heredoc capture — the only body construction this
contract prescribes — is the **one** substitution such a statement may perform. **Any substitution other
than that one** is prohibited in a feeding statement, in particular one invoking `gh`, `jq`, `git`, or
any command whose output the call would then act on.

**2. Argument construction.** Every value originating in configuration, on the board, or in an entry is
passed as **its own argv element**, never interpolated into a single command string. That is what makes
an owner login containing a hyphen, a title containing a quote, and a body containing `$` safe without a
per-value escaping rule.

**3. Multi-line `--body` on Windows / Git-Bash.** The environment is Windows 11 with Git-Bash as the
POSIX shell, and an entry body carries newlines plus a sentinel-fenced JSON block containing `"`, `{`,
`}`, and `$`.

- Build the body with a **single-quoted heredoc** captured into a shell variable and pass `"$body"`:

  ```bash
  body=$(cat <<'PTP_BODY'
  …prose…
  <!-- ptp-backlog-meta -->
  { "changeEpics": [ … ] }
  <!-- /ptp-backlog-meta -->
  PTP_BODY
  )
  gh project item-edit --id "$item" --body "$body"
  ```

- **Never** a PowerShell here-string (`@'…'@`); **never** a double-quoted heredoc (`<<EOF`, which
  expands `$`); **never** `echo -e`; **never** a temp file plus `--body "$(cat "$f")"` — retired under
  rule 1, and rejected at its home in `skills/ptp-backlog-write/SKILL.md`.
- **CRLF is prohibited in a body.** Bodies are **LF-only**. A carriage return that survives into
  `--body` is stored on the board and then breaks the metadata block's byte-for-byte preservation rule
  on the next read — the same CRLF discipline `ptp-workflow-cache-heal` already applies to cached
  scripts, applied here to board content.
- **A composed body SHALL NOT depend on a trailing newline**, because the one admitted form is a command
  substitution and POSIX `$( … )` strips **every** trailing newline. That is the one byte a composed body
  cannot carry through this route, so *byte-for-byte as composed* is to be read over a body with no
  trailing-newline significance: compose the body so its last byte is its last meaningful character, and
  never treat a differing trailing newline on read-back as a changed body. The sentinel-fenced region is
  unaffected — its closing sentinel is content, not a terminator — so the metadata block's preservation
  rule still binds exactly as written.

**3a. The same body on a GraphQL variable argument — the same six obligations, and none added per route.**
The composed body's **six** emission obligations bind **identically** whether the body arrives as a
body-carrying flag value on `gh project item-edit` or as a **GraphQL variable argument** on
`gh api graphql`, and **no obligation is added for either route beyond the six the home states**.

**That last clause is a PER-ROUTE prohibition, and it survives the home gaining a sixth obligation.** What
it forbids is one route acquiring an obligation the other does not have; it has never forbidden the
**home** from stating more of them. Obligation 6 was added in the home and binds both routes identically,
exactly as 1–5 do, so this contract still adds none.

Their **one normative home** is `skills/ptp-backlog-write/SKILL.md` §*The composed body's emission
obligations*. They are **cited here, never restated and never renumbered** — a second statement of them
would be a second home, and two homes eventually disagree about what they are and how many there are.

What this contract states is the **argv shape they bind to on the passthrough**: the whole `name=value`
field argument is the **one argument** those obligations govern, so each of them has an unambiguous
subject on this route.

**With one qualification, and it is load-bearing rather than pedantic.** That sentence is right for the
obligations whose subject **is** the argv encoding. It is **wrong** for any obligation whose subject is
the composed **value**, and wrong in the one direction that matters:

> **Where an obligation's subject is the composed VALUE rather than its argv encoding, its subject on this
> route is the VALUE PORTION AFTER THE FIRST `=`, never the whole `name=value` element.**

An argument spelled `body=` is a **present, non-empty argument whose VALUE is empty** — *empty* and not
*absent*, the two being distinguished everywhere the obligations speak of a failed limb. Reading a
presence-or-integrity obligation over the **element** would therefore satisfy it on
**precisely the input it exists to reject**, the element being non-empty exactly when the value it
carries is not. **This fixes the obligation's SUBJECT and decides no outcome** — an empty value portion
is not refused *by this rule*, a value composed empty passing here exactly as it does on any other route.
This is a **further application of the rule stated below as application 3** — *a `name=value` argument's
value is everything after the first `=`* — and, exactly like the three applications that follow, it is an
application of an existing rule and **not a new obligation**.

Three passthrough-specific **applications** follow. Each is an application of a rule that already exists;
**none is a new obligation**.

1. **The body rides a variable; the query document is a constant.** Interpolating a composed body into a
   query string is the GraphQL form of interpolating a value into a command string, which **rule 2**
   already prohibits for exactly the same reason: a body carrying `"`, `{`, `}`, or `$` would otherwise
   change the document's **meaning** rather than its data. So the query document carries **no** value of
   configuration, board, or entry origin, and every such value rides a **variable**.
2. **The variable argument is a raw string field (`-f`), never a typed one (`-F`).** A typed field reads
   a leading `@` as a **file path** and coerces number- and boolean-shaped values. A body beginning `@`
   is ordinary prose and a title of `true` is an ordinary title, so either coercion would silently change
   ordinary content.
3. **A `name=value` argument's value is everything after the *first* `=`.** A body or a title containing
   `=` therefore needs **no escaping rule of its own** — the same *no per-value escaping rule* property
   rule 2 exists to deliver.

**Rule 3's one body-construction form carries over unchanged, and rule 1's prohibition binds this route
identically.** The heredoc capture is a statement executed before the call, so it never engages rule 1 on
either route; the call then passes `-f body="$body"` exactly as the flag route passes `--body "$body"`.
The retired temp-file form is **not** admitted here either: `-f body="$(cat "$f")"` is a call-site command
substitution, which rule 1 now prohibits without exception, on this route as on the other. Reading the
retirement as bound to the `--body` **spelling** would re-admit on this route precisely the form the write
path rejects — rule 1 turns on what a construct **is**, not on which flag carries it, which is the same
property that made the extension to this route obvious while the form was still admitted. Beyond that one
heredoc capture, no command substitution is admissible on this route — not at the call site, and not in a
statement feeding it.

**The typed field's `@file` form is deliberately deferred, not forbidden on principle.** It is genuinely
attractive: it would remove the `$( … )` substitution entirely, and with it the trailing-newline caveat
above. It is deferred because **whether the typed field coerces *file* contents was not verified
first-hand**, and an unverified form has no place on the carrier that holds the metadata fence.
**Verification alone would no longer suffice to admit it.** An `@file` form reads a file that something
must first have written, so it would also put a composed body on disk — the very ground the temp-file
form was retired on, and what `skills/ptp-backlog-write/SKILL.md` rejects at its home. A later change may
admit it only by clearing **both** bars, and the second is not a verification question.

**4. Exit-code handling.** `gh help exit-codes` states the whole vocabulary:

```
- If a command completes successfully, the exit code will be 0
- If a command fails for any reason, the exit code will be 1
- If a command is running but gets cancelled, the exit code will be 2
- If a command requires authentication, the exit code will be 4
```

The rule: **only `0` is success; every non-zero exit is a failure carrying `gh`'s stderr; no non-zero
exit is ever read as an empty result.** Explicitly, this contract **SHALL NOT branch on exit `4`** to
detect an authentication problem — the scope failures verified while this contract was written exit
**`1`**, not `4`, so a `4`-keyed branch would miss the most common authentication-shaped failure
entirely. Authentication is decided at S2, from `gh auth status`'s JSON.

**5. `--format json` and `--jq`.** Every data-consuming **`gh project`** contract call passes
`--format json`. `gh api graphql` is the one admitted data call that does **not** take that flag — it
emits JSON natively — so the rule binds it as *the response is consumed as JSON*, never as *the flag is
passed*, a formulation that would make an admitted call unconstructable.

**A zero exit whose stdout does not parse as JSON is a failure, never an empty result.** This is the
single most dangerous misreading available here, because it turns a broken call into *"the board has no
entries"* — which `commands/backlog.md` already names *"the single worst outcome this command can
produce."* The rule binds every data-consuming call identically, whichever route produced the JSON.
`--jq` is permitted for **projection**, never for a decision this contract owns: record fields bind from
the parsed JSON, so a `--jq` typo can never yield a `null` that reads as a value.

**6. The stderr surface.** `gh` writes diagnostics to **stderr** and data to **stdout**, and a contract
call **never merges them** — `2>&1` is prohibited, because it can corrupt the JSON on stdout. A
failure's reported detail is `gh`'s stderr **verbatim, untruncated and unparaphrased**: the scope errors
this contract quotes are self-repairing *because* they name their own fix, and paraphrasing destroys
that property.

**7. The closed prohibited-verb list**, binding every call this contract admits outside **the write
path** — the write path being `skills/ptp-backlog-write/SKILL.md` (defined by
`0047_07_backlog-gh-write-path`, kept here as **provenance only**: a live prohibition is anchored on the
live skill that holds the exception, never on an archived change id): `item-create`, `item-edit`,
`item-add`, `item-archive`, `item-delete`, `field-create`, `field-delete`, `create`, `edit`, `delete`,
`close`, `copy`, `link`, `unlink`, `mark-template` — and, with **no exception at all and in no slice**,
`gh auth refresh`, `gh auth login`, `gh auth switch`, and `gh auth logout`.

**The fifteen verbs are unchanged in membership by the content-mutation admission**, which adds no
`gh project` verb at all. The credential-changing limb takes **no** exception either — not the write
path's, not any other's.

**8. `gh api graphql` is a query everywhere, and a mutation only on the write path.**

- **Query everywhere.** The passthrough is admitted as a **query on every path**, and **outside the
  write path it is a query and never a mutation** — the preflight's calls, archive reachability's, and
  the read path's alike, all unchanged by this admission. A query may carry any **connection argument**
  the schema defines — page size, cursor, `archivedStates`, and **`orderBy`** — arguments being part of
  the query the passthrough already admits and not a further permission. Where an order is load-bearing
  it is passed **explicitly**, never left to a default, on the same ground as the explicit-limit rule.
- **Mutation only on the write path, and only from the closed enumerated set.** The write path
  (`skills/ptp-backlog-write/SKILL.md`) may issue a mutation through the passthrough, and **only** one of
  the admitted mutations enumerated in the companion table under [The gh surface](#the-gh-surface) and
  specified in `skills/ptp-github-projects-gh/references/content-body-mutation-route.md` §*The
  content-body mutation route*. Issuing any other
  mutation through the passthrough is a contract violation, anywhere. Concretely, **no mutation that
  moves an item's position is admitted anywhere** — it is outside the closed set, and stating it here is
  an **application** of that set rather than a new prohibition. ptp reads the board's arrangement and
  never authors it.
- **The non-`GET` prohibition binds an *explicitly set* method.** `gh api` with `--method` / `-X` **set**
  to anything other than `GET` is prohibited outside the write path. The GraphQL endpoint's **own
  intrinsic** HTTP method is **not** such a setting, so this rule does not read as forbidding the very
  call the contract admits. That is a **clarification of what the rule always meant, not a new
  permission**: a `gh api` call that sets a non-`GET` method **by flag** is still prohibited outside the
  write path.

**9. No `--web` and no interactive call.** `--web` opens a browser. Every contract call is fully
specified on argv, and a call that would prompt is a contract violation.

---
