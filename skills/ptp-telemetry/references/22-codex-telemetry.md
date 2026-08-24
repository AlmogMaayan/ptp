> Loaded from skills/ptp-telemetry/SKILL.md when: instrumenting a codex exec window.
## 22. Codex telemetry — the repository-scoped mechanism

Everything in this section implements the outcome `0032_05_codex-telemetry-scope-spike`'s **decision
record** selected: the **repository-scoped** mechanism, at the fidelity that record's observations
support. It consumes §§1–15 and redefines none of them.

**No user-global Codex configuration is written, for any reason.** That is the defect that killed the
predecessor: one global file holds one endpoint and one credential while stores, ports, and credentials
are per repository, so repository B's setup redirects repository A and A's spans are *accepted* into B's
store on B's own credential. Shape R satisfies this by being repository-scoped — never by disclosure and
never by a documented caveat.

### 22.1 The mechanism, and the one invariant it relaxes

The record selected the Codex CLI's **`-c` / `--config` per-invocation override**, carrying dotted
`otel.*` keys, appended to the `codex exec` invocation. **No Codex configuration file of its own is
written anywhere**, no environment variable is set, and no `~/.codex/config.toml` write of any kind
occurs. The observed precedence, established by conflict rather than read, is
`-c` override > `-p` profile layer > `$CODEX_HOME/config.toml`.

That relaxes exactly one invariant the predecessor carried — *"no telemetry flag, environment variable,
or argument is added to any `codex exec` invocation"* — and it relaxes it **narrowly, explicitly, and as
a decided trade rather than a silent exception**. What is added: repeated `-c` arguments **confined to
the `otel.*` key space**, and nothing else. The bound: only those keys, and **only when telemetry is
on** — so a constructed `codex exec` command line is **byte-identical** to the pre-change one whenever
`telemetry.mode` is not `on`, *and* whenever the consent record of §22.3 does not record consent. The
rule itself lives with every other `codex exec` assembly rule, in
`skills/ptp-codex-mode/SKILL.md`'s canonical flag-append rule; this section does not restate it.

Two record-level values carry the whole design, and both arrive as OTLP **resource** attributes on
**both** signals:

| Value | Key | Meaning |
|---|---|---|
| Origin discriminator | `service.name` = **`codex_exec`** | **Codex-emitted**, not ptp-set. Established by paired comparison against a real Claude-originated record, which emits `service.name = claude-code` on the same signal at the same structural level. Persisted as the raw-only field `service_name` (§10.5) by `0032_07_raw-record-service-name` |
| Correlation value | `otel.environment="<run_id>"` → resource attr **`env`** | The ledger run's **existing `run_id`**. No new field on either record |

Both are read from the **resource** scope specifically, so a span- or log-level attribute of the same
name cannot shadow either one.

<!-- ptp-telemetry:anchor id=codex-canonical-rendering class=substrate -->
### 22.2 The canonical rendering — pinned once

This is the single definition `setup`'s writer, `status`'s parser, and the README example all consume. A
conceptual key list is not sufficient: the writing side and the reading side are separate contracts, and
two renderings that both satisfy the prose can fail to parse each other.

```
-c otel.environment=<the ledger run_id bracketing this invocation>
-c otel.exporter={"otlp-http"={endpoint="http://127.0.0.1:<telemetry.port>/v1/logs",protocol="json",headers={"x-ptp-store-token"="<the store credential>"}}}
```

and, **only when the trace signal is opted in**, one further argument of the same shape:

```
-c otel.trace_exporter={"otlp-http"={endpoint="http://127.0.0.1:<telemetry.port>/v1/traces",protocol="json",headers={"x-ptp-store-token"="<the store credential>"}}}
```

- **Each `-c` value is ONE argument, and it is quoted when the invocation is composed on a shell
  command line.** The rendering above is written as the argument vector Codex receives; the exporter
  value carries `"` characters, which a shell strips, and an unquoted value therefore reaches Codex as a
  different string from the one pinned here. So compose it as
  `-c 'otel.exporter={"otlp-http"={…}}'` — single-quoted, exactly the form the decision record exercised
  throughout the spike — or pass the vector without a shell at all. The `otel.environment` argument
  needs no quoting for a `run_id`, and quoting it anyway is harmless.
- **Full paths, not a base URL** (**advisory A-1**). Codex does **not** append `/v1/logs` or
  `/v1/traces`; it posts to the configured endpoint URL **verbatim**, and §9 accepts only those two
  exact paths. A base-URL endpoint silently reaches nothing.
- **The log signal is the default; the trace exporter is opt-in** (**advisory A-6**). One trivial turn
  produced 932 spans across ~2.4 MB, almost all Rust `tracing` internals, while the **log** signal
  carries the timing data the epic wants.
- **No metrics exporter is enabled, ever.** The receiver serves `/v1/traces` and `/v1/logs` and answers
  nothing at `/v1/metrics`, so a metrics exporter would aim at a route nothing serves. Version-dependent
  metrics support is why metrics are **out of scope for this slice** — not a degradation of it and not an
  emptied column.
- **The credential is the store's existing one**, read from `<telemetry.root>/.ptp-telemetry-credential`
  and **never re-minted**. It is mandatory, not hardening: of the batches surviving the `telemetry.mode`
  and port-drift gates — which **accept and discard** ahead of it, a distinct outcome from rejection —
  the receiver rejects every credential-less one before writing anything (§9.4).
- **The credential is read live at construction time**, so the wiring can never carry a *stale* value.
  What it can be is **absent**, which is the delivery-breaking state §22.6 check 4 exists for.

<!-- ptp-telemetry:anchor id=codex-consent-record class=substrate -->
### 22.3 `setup`'s second, separately-consented Codex step

`/ptp:telemetry setup` gains a **second** step, consented **separately** from the Claude-side
`<repo>/.claude/settings.local.json` step of §13. (Never a `settings.json` step — the baseline forbids
that target.) Declining the Codex step leaves the Claude-side setup fully completed.

**Where the consent lives.** A per-invocation mechanism with no configuration file of its own still
needs the one-time answer to survive: it must govern a later `codex exec` construction and be readable by
`status`. So `setup` records it in a **repository-scoped ptp telemetry-consent record**,
`<telemetry.root>/.ptp-codex-telemetry-consent.json`, written **only** on confirmation. The two
shortcuts are both wrong and both forbidden: inferring consent from the credential file configures a user
who declined, and wiring unconditionally makes declining meaningless.

**That record is not a gate over whether Codex runs**, and the distinction is exact. `codex.mode` alone
decides whether Codex runs. This record decides only whether telemetry wiring is appended to an
invocation `codex.mode` has *already* decided to make, so it cannot disagree with `codex.mode` about
whether Codex ran — a run without consent proceeds identically and simply produces no Codex rows.

**The managed keys — exactly seven**, and the write is **managed-key replacement, never whole-file
replacement**: every other key in the record, including one a user or a future slice put beside them, is
preserved byte-for-byte.

| Key | Value |
|---|---|
| `ptp_consent_kind` | `ptp.codex_telemetry_consent` |
| `ptp_consent_version` | `1` |
| `consent` | `granted` — the only value that authorizes wiring |
| `granted_at` | ISO-8601 UTC |
| `log_endpoint` | `http://127.0.0.1:<telemetry.port>/v1/logs` |
| `trace_endpoint` | the `/v1/traces` form when the trace signal was opted in, empty otherwise |
| `credential_fingerprint` | a **one-way digest** of the store credential — never the credential |

**Why a fingerprint and not the credential.** Under this mechanism nothing ptp writes carries the
credential value, so there is no file to protect at rest and the ignored-and-untracked precondition has
no target. Writing the credential here would create one — inside the repository, and outside the store's
managed `.gitignore` set (a `0032_02` contract this slice does not touch). The fingerprint discloses
nothing and is never printed either way. What it buys is **detectability, not authorization**: it records
*which* credential the consent was given against, so a consent record that was committed and cloned into
another checkout — or left behind by a credential rotation — is reported by §22.6 check 4 as **stale
consent** rather than passing unnoticed. It is deliberately **not** part of the authorization test:
`consent: granted` remains the only value that authorizes wiring, because gating on the fingerprint would
silently switch telemetry off after a routine rotation — the very state §22.6 records as *not*
delivery-breaking.

**The rules the write obeys**, each about not damaging what the user already has:

- **Diff first, against what is actually there.** An existing block is shown changing, never silently
  repointed. Nothing is written before explicit confirmation of *this* step.
- **Refuse rather than overwrite** a record that does not parse as a JSON object, reusing `/ptp:config`'s
  writer posture rather than inventing a second one. The file is left exactly as it was.
- **Create on confirmation only** — an absent record and any missing parent directory are created
  containing only the managed keys. Declining creates nothing.
- **Gated on the credential file, not on the Claude-side answer.** The step proceeds whenever
  `<telemetry.root>/.ptp-telemetry-credential` exists — *including* on a re-run where the Claude-side
  write is declined, since the baseline mints the credential once and reuses it. **Only** when no
  credential file exists does the step report that it cannot produce a working configuration, write
  nothing, and mint nothing of its own.

**What the consent text says, and what it does not.** It names the **absolute path of the consent
record** and the **per-invocation `-c otel.*` wiring that record authorizes** — never a path for a Codex
configuration file, which this mechanism does not have. It states the scope: repository-scoped, nothing
user-global. It does **not** carry the predecessor's out-of-repository framing or cross-repository
repointing disclosure — that failure mode does not exist here and describing it would misstate the
design. And it discloses the **residual exposure the record actually names**: the `-c otel.*` arguments,
credential included, are visible in **any process listing** and in **Codex's own session record**.
Redaction covers this command's *display* and is never presented as the protection.

**What `setup` may claim.** It starts no Codex process, so it never claims the installed Codex *will*
transmit the header. The record did observe `x-ptp-store-token` transmitted verbatim by the pinned
`codex-cli 0.145.0`, **lower-cased** (**advisory A-8**), so header support may be stated for that
version. The result is described as **written but unverified end to end**.

```
node <plugin>/scripts/ptp-otel-sink.js codex-setup-plan  --repo <repo root> [--with-traces]  # writes NOTHING
node <plugin>/scripts/ptp-otel-sink.js codex-setup-apply --repo <repo root> [--with-traces]  # only after confirmation
```

Render the plan's diff verbatim, ask for explicit confirmation of the Codex step, and run
`codex-setup-apply` only on an affirmative answer. Never reconstruct or print the credential value. A
`blocked` result (no credential file) and a `refused` result (unparseable record) are relayed verbatim
and nothing is run.

### 22.4 The Codex join

Slice 2's join asks *which run's `(session_id, window)` contains this span?* For Codex that fails at the
first term: a separate OS process has its own session identity and its own trace roots.

**Routing is positive, and decided at trace-group scope before either join.** The cheap answer —
"whatever matches no ledger run is Codex" — is **forbidden**, and the reason is recorded: a Claude
session in this same store that never ran a ptp command also matches no run, and its spans would be
handed to the Codex join and attributed to whichever Codex window overlapped them in wall-clock time.
Routing therefore uses the §22.1 discriminator, read from the record's persisted `service_name`, and
**never** the configuration path or the span-name catalogue — neither of which is record-level origin
evidence.

**Unanimity is required.** A group goes to the Codex join only where **every** member carries the
discriminator and every value agrees. Two failures send the group **wholly** to `_unattributed/`:

| Case | `notes` |
|---|---|
| members carry **differing** values, **or** some carry it and others carry none | `unattributed:mixed-origin`; `origins=<every observed value, sorted, pipe-joined, with `(none)` standing for empty>`; `origin-missing=<count of members carrying none>` |

Routing on the positive members alone is the tempting shortcut and is wrong for the same reason the
negative predicate is: a group holding even one record that is not demonstrably Codex-originated is
precisely the unknown-origin case.

**An absent `service_name` key reads as an empty one.** Raw lines written before
`0032_07_raw-record-service-name` carry no such key, and the raw store is append-only so they are never
rewritten. Both shapes mean *carrying no discriminator* — never a malformed entry — and **key presence is
never the test**.

**A positive discriminator is necessary and not sufficient.** It proves the telemetry is *Codex's*, not
that it is *the `codex exec` ptp launched*. That gap is closed by the **correlated branch**, which the
decision record selected:

1. The correlation value is normalized at **group** scope first, because the never-split-a-trace
   guarantee means the decision cannot be made per record: a group carries exactly one value, the one
   every member carrying a value agrees on.
2. A group whose members carry **differing** values, or where **some** carry one and some do not, goes
   wholly to `_unattributed/` with `unattributed:conflicting-correlation`, `correlations=<every observed
   value>`, and `correlation-missing=<count>`.
3. A group where **no** member carries one goes to `_unattributed/` with `unattributed:no-correlation` —
   **never matched by window instead**.
4. A single agreed value is matched to the **`cli=codex` run that `run_id` names**. No such run →
   `unattributed:no-such-codex-run` with `correlation=<value>`.
5. That run's window must contain the group's usable timestamps, as a **consistency check on the
   correlation** and never as a substitute for it. Disagreement → `unattributed:correlation-window-mismatch`
   with **both** `correlation=<value>` and `window=<start>..<end>` recorded. One of the two is wrong and
   guessing which is exactly what this design forbids.
6. Zero usable timestamps makes that check vacuous rather than failed — the group is joined on an
   explicit correlation value, strictly stronger evidence than the baseline's session-id term — and the
   condition is recorded as `no-usable-timestamp` rather than hidden.

**The reconciliation, settled here.** The decision record notes in passing that "the baseline's existing
ledger-window attribution remains the fallback for records that carry no correlation value", which is
**not** the same rule as step 3. This slice implements **step 3**, which is what its spec delta requires:
a Codex group carrying no correlation value goes to `_unattributed/`. The consequence is that the
**scoped-configuration branch — window containment alone — is specified but never reached**, because
every `codex exec` ptp launches carries `otel.environment=<run_id>`, and a Codex process ptp did *not*
launch is exactly the one that must not be adopted. The innermost-window tiebreak that branch would have
needed replacing is therefore **never applied to a Codex group at all** — a strictly stronger guarantee
than "replaced", and the one that matters, since that tiebreak resolves *nested* windows within one
session and applying it across concurrent sessions would hand one session's Codex time to the other with
no trace of the mistake.

**Inherited versus replaced**, enumerated rather than summarized as "unchanged":

- **Inherited:** trace grouping, missing-`start_ts` handling, the total ordering, and single-candidate
  resolution — with the candidate set drawn from `cli=codex` windows. A Codex trace resolves as **one
  group and is never split**; a timestamp-less record is excluded from candidate narrowing and inherits
  its group's attribution.
- **Substituted — the near-miss set.** The baseline defines it with a `session_id`-matching term **no
  Codex run can satisfy**, so a literal reuse would always record an empty set and discard the one
  debugging artifact a miss leaves behind. For a Codex group it is **the `cli=codex` runs whose window
  contains at least one usable-timestamp member, in ascending `run_id` order**, emitted as `near-miss=`
  on every unattributed Codex outcome — emitted even when empty, so "no near-miss runs" stays
  distinguishable from "the token is missing".

**What attribution copies**, all of it from the **ledger run** and none of it from the span: `epic`,
`change_id`, `command`, `phase`, `agent_role`, `agent_label`, and `run_id`, with `cli` set to `codex`.

**`agent_role` comes from the ledger, never the span.** Codex appears at two sites with two meanings —
the read-only reviewer (`agent_role=codex`, owned by `skills/ptp-codex-mode/SKILL.md`) and the
`main=codex` implementer (`agent_role=main`, owned by `skills/ptp-run-at-model/SKILL.md`). **Nothing in a
Codex span distinguishes them**; the ledger does, because slice 1 recorded the role at the call site.
Collapsing them makes "how long does the reviewer take?" unanswerable — one of the questions the epic
exists to answer.

**`session_id`** carries **Codex's own** session identity as received, empty when absent. It is recorded
because the fixed 26-column schema has the column, is **never** used as a join key, and is **never**
borrowed from the shelling-out Claude session — that would make one column mean two things in one file.

**`run_id` on a Codex record is the transported correlation value, always.** This is the one behavior
change to the baseline attribution pass, and it is a change of *use*, not of schema: the baseline
overwrites `run_id` from the window join and **blanks** it when no window contains the record, which
would discard a value that arrived in resource `env`. For a Codex-origin record the join only **confirms**
the value and never overwrites or blanks it. Two things depend on this and nothing else does:

- the value survives an unattributed outcome, so it is still there to debug with; and
- a later `export` re-derives the correlation **from the persisted raw record by the same extraction the
  receiver used**, rather than reading back a `run_id` some earlier export projected — which, for a Codex
  record, it never is, by this very rule. Routing on re-export likewise reads the **persisted origin
  evidence**, never the `cli` value a previous export derived.

**What a later `export` recovers**, stated precisely because attribution tests `start_ts` and not arrival
time. A span flushed long after its window closed still has a start inside it and attributes normally. A
record whose `start_ts` **genuinely lies outside every `cli=codex` window is permanently unattributed** —
it resolves identically forever, and is reported as a settled outcome rather than as pending recovery.
The genuinely recoverable cases are exactly those where the **ledger** was unreadable at join time: the
run's open line not yet visible, or a trailing line torn. A **missing close line is not among them** —
§11.2 already treats an open run as extending to the present, so those attribute immediately.

### 22.5 The mapping, and the gaps that are escalated rather than fixed

The Codex span-name catalogue and the Codex column sources are **not defined here**: they are additions
to the **one** table each, in §10.3 and §10.4, consumed by both the receiver and `export` under §10.7's
single-source rule. Three recorded gaps travel with them, each an **advisory consequence** of the
decision record — noted as out of scope and proceeded past, never silently relaxed and never a reason to
add a field:

- **`cost_usd` is empty on every Codex LLM row** (**A-3**). Codex emits token counts and no cost; an
  exhaustive key sweep found no cost-bearing key at all. Availability is per column, so token counts
  populate while cost does not — the three are never treated as jointly available.
- **`tool_class` derives `other` for every Codex record** (**A-4**).
- **`span_kind` maps an uncatalogued Codex name to `other`** with its raw name retained (**A-2**).

Two further advisories are recorded without work: **A-5** — `otel.span_attributes` reaches spans only
(0/35 log records), so anything wanted per-record on the log signal must travel through
`otel.environment` → resource `env`; and **A-7** — Codex log events carry `user.email`,
`user.account_id`, a `prompt` attribute, and `arguments` / `output` **even with**
`otel.log_user_prompt = false`, so what the receiver retains is a deliberate decision.

<!-- ptp-telemetry:anchor id=codex-status-preflight class=substrate -->
### 22.6 The `status` Codex preflight — four read-only checks

`status` reports four checks. **None invokes Codex and none writes any file.**

| # | Check | How |
|---|---|---|
| 1 | Is `codex` on `PATH`? | a **filesystem lookup** along `PATH` (with `PATHEXT` on Windows) — never `codex --version`, which would *invoke* Codex and would miss `codex.cmd` |
| 2 | Is the configuration present? | the repository-scoped consent record of §22.3 records `consent: granted` |
| 3 | Does the endpoint match? | the record's `log_endpoint` versus `http://127.0.0.1:<resolved telemetry.port>/v1/logs` — compared at the **full path form** advisory A-1 requires |
| 4 | Does the credential match? | the store's credential against the record's `credential_fingerprint` — a **match verdict with neither value printed**, mirroring the credential verdict `status` already reports for the Claude side (§14.6) |

Checks 3 and 4 exist because of one silent failure reached two ways. A `telemetry.port` change after
setup leaves a **stale endpoint**, and an **absent credential** makes the receiver reject every batch —
either way Codex spans simply stop arriving with no error anywhere. Check 4 separates its two states
honestly, because they are not equally severe: an **absent credential file** is delivery-breaking and is
reported as such, while a **fingerprint mismatch** means the store's credential was replaced after
consent — the wiring reads the current credential, so delivery is unaffected and what is stale is the
**consent**, which is what the advice says.

The **overall verdict honors that separation** rather than flattening it: a fingerprint mismatch with a
credential present is reported as **configured, but the recorded consent is stale — delivery not
verified**, never as "rows will be absent", which is reserved for the states that genuinely break
delivery (no consent, a stale endpoint, or no credential at all). A verdict claiming absent rows beside
an advice line saying delivery is unaffected would be one report contradicting itself.

**An absent CLI is reported as absent**, with the remaining checks marked **not applicable** rather than
erroring; they are still computed from files, so nothing about the report depends on having probed a
process.

**The verdict is scoped honestly.** All four checks read `PATH` and files and none observes a batch, so a
fully-matching result is reported as **configured; delivery not verified** — never as a claim that Codex
is emitting or that the receiver is accepting. It is **not** described as detecting credential-*rejected
batches*: it detects a configured value that *will* be rejected, which is a weaker and different
statement, and conflating them would let a green preflight coexist with an empty store.

<!-- ptp-telemetry:anchor id=codex-degradation-ladder class=substrate -->
### 22.7 The degradation ladder, and why still no gate

`skills/ptp-codex-mode/SKILL.md` already resolves `codex.mode` ∈ `auto | required | off`, already decides
whether a Codex phase runs, and already forbids a silent skip. Every rung below is a **consequence of
that existing resolution, reused verbatim** — not a new design, and **not a new authority**:

| Rung | State | Outcome |
|---|---|---|
| 1 | `codex.mode = off`, or `auto` with the CLI absent | No process, nothing to attribute, **no Codex rows**. The absence is **stated, not silent** — the existing non-silent-skip rule already guarantees that |
| 2 | `required` with the CLI absent | **Exactly** what the existing mode resolution already does (it STOPs). No shell-out window and no rows. Listed because a ladder claiming to enumerate the states cannot skip one of the three modes |
| 3 | Codex runs, telemetry unconfigured — no consent recorded | The ledger still brackets the process, so the **wall time survives in the run ledger** for `0032_04_telemetry-report` to present. This slice claims **no presentation surface of its own** for it |
| 4 | Codex runs, configured, but **credential-rejected** | The same outcome as rung 3, and **the dangerous one: from outside it looks identical to success**, because the receiver rejects those batches (§9.4) without leaving even an `_unattributed` record. That is precisely why the credential belongs in what `setup` records and in what `status` checks |
| 5 | `codex mcp-server` | ptp does not use it and configures no telemetry for it. **Out of scope**, and nothing stronger is asserted about it |

**Metrics are deliberately not a rung.** Nothing answers `/v1/metrics`, so no metrics exporter is
configured at all; calling that a degradation would imply a signal is being collected and lost.

**Every rung degrades a row set or nothing. None degrades a ptp command.**

**The no-gate claim, scoped exactly.** What is forbidden is a ptp-side switch that could disagree with
`codex.mode` about **whether Codex ran**. It is **not** written as "no new key or decision point of any
kind", because that would be false: the user's consented opt-in is theirs to give, and the §22.3 consent
record is a ptp-read **telemetry-wiring** decision point. Both are permitted precisely because neither
can cause or suppress a Codex run.

**The rationale for adding no run gate**, recorded rather than assumed: a second authority over whether
Codex ran can disagree with the first, and the resulting failure is a report that **confidently shows
zero Codex time when Codex ran normally** — worse than no report at all.

---

# The analyze layer (`0039_01_telemetry-analyze-engine`)

<!-- ptp-telemetry:anchor id=analyze-methodology class=leaf owner=analyze -->