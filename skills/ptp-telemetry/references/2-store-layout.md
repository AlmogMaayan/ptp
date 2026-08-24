> Loaded from skills/ptp-telemetry/SKILL.md when: locating or creating the telemetry store on disk.
## 2. Store layout

Under `<telemetry.root>/<epic>/`, where `<epic>` is the four-digit **epic** segment of the change id
as defined in `skills/ptp-change-selector/SKILL.md` §1:

```
openspec/telemetry/
├── .gitignore          # writer-maintained managed lines (§2.1): ignores *.ndjson and the two
│                       # secrets/pidfile, keeps *.csv
├── .gitattributes      # writer-created, create-if-absent: `*.csv -text`
├── 0032/
│   ├── runs.ndjson     # append-only run ledger, one JSON object per line
│   └── runs.csv        # dual-written flat view of the same rows
└── _unattributed/      # runs whose epic could not be resolved (same two files)
```

**The directory key is the epic, never the change id.** Every story in an epic accumulates into the
same two files, and a per-change breakdown is a *grouping over the `change_id` field*, not a separate
path.

**Archive-stability rationale (why the store is not inside the change folder).** `/ptp:archive`
**moves** `openspec/changes/<id>/` to `openspec/changes/archive/YYYY-MM-DD-<id>/`. Telemetry held
inside a change folder would therefore be relocated and date-prefixed the moment its first story
archived, splitting an epic's timing history across the active and archived trees — exactly what
"accumulate all of an epic's timing data in one place" forbids. The store is a top-level sibling of
`openspec/changes/` for that reason.

Directories are created **lazily on first write**. Rows whose epic cannot be resolved go to
`<telemetry.root>/_unattributed/` rather than being dropped or guessed.

<!-- ptp-telemetry:anchor id=store-git-policy class=substrate -->
### 2.1 The store carries its own git policy

On **every** gated write into `<telemetry.root>/` — not only on the write that happens to create the
root — the writer also reconciles the store's two policy files:

| File | Rule | Content | Why |
|---|---|---|---|
| `<telemetry.root>/.gitignore` | **Managed-line reconciliation** — add only the missing managed lines, preserve every other line | the managed set enumerated in §9.3 (`*.ndjson`, `.ptp-telemetry-credential`, `.ptp-otel-sink.pid`, `!*.csv`) | The NDJSON is per-machine raw capture that would conflict on every merge; the credential and the pidfile must never be committable; the CSV is the shareable flat view. |
| `<telemetry.root>/.gitattributes` | **Create-if-absent** — an existing file is left untouched | `*.csv -text` | A consumer repo's own `text=auto eol=lf` default would otherwise normalize `runs.csv` to LF in the index. Excel on Windows needs the CRLF endings; **the BOM alone is not sufficient.** |

The two rules are deliberately **different**, and §9.3 is the single place the managed set is
enumerated. Create-if-absent would be wrong for `.gitignore`: a store created before the credential
and the pidfile existed already **has** that file without their rules, so an "only if absent" writer
would never upgrade it and the credential would stay committable forever. `.gitattributes` carries no
such evolving set, so it stays create-if-absent — an existing one is never appended to, rewritten, or
merged. Both operations are **idempotent**: a file that already carries every managed line is left
byte-unchanged.

**Why every gated write, not just the creating write.** Scoping the creation to the write that
happens to create the root would leave a pre-existing root, a root a user made by hand, a customized
`telemetry.root`, or a root whose policy files were deleted permanently without a policy. Repeating
the cheap reconciliation makes the policy self-healing.

**Why per-directory rather than a root-level entry in ptp's own repository.** ptp's `.gitignore`
ignores `/openspec/` outright, and the plugin ships only `commands/`, `skills/`, `workflows/`,
`scripts/`, `agents/`, and `.claude-plugin/`. A policy file authored under ptp's own `openspec/`
would be untracked here *and* absent from every consumer repo — the only repos where a store actually
exists. A per-directory `.gitattributes` additionally follows a customized `telemetry.root` for free,
which a fixed root-level entry could not. **This skill never authors a policy file into the ptp
repository's own tree, and never modifies a repository's root `.gitattributes`.** It modifies a
repository's root `.gitignore` in exactly **one** place — `setup`'s confirmed managed-line addition of
`.claude/settings.local.json` (`ptp-telemetry-setup` [setup-consent-scope]), required because that file carries the ingestion credential and
must stay untracked. Every other telemetry policy write stays inside `<telemetry.root>/`.

Both operations run inside the **same gated, fire-and-forget path** as any other telemetry write
(§5): nothing is created when `telemetry.mode` is not `on`, and a failure to create either file is
swallowed and never fails the observed ptp command.

---

<!-- ptp-telemetry:anchor id=ledger-record class=substrate -->