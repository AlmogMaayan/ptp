> Loaded from skills/ptp-telemetry/SKILL.md when: mapping a received span onto the spans CSV schema.
## 10. The span record, the CSV schema, and the two mapping tables

<!-- ptp-telemetry:anchor id=span-csv-columns class=substrate -->
### 10.1 The 26 columns

`spans.csv` carries exactly these columns, in exactly this order:

`schema_version`, `epic`, `change_id`, `command`, `phase`, `agent_role`, `agent_label`, `cli`,
`run_id`, `session_id`, `trace_id`, `span_id`, `parent_span_id`, `span_kind`, `tool_name`,
`tool_class`, `model`, `start_ts`, `end_ts`, `duration_ms`, `success`, `error`, `input_tokens`,
`output_tokens`, `cost_usd`, `notes`.

The column set is **additive-only within a `schema_version`**, which is column 1 so a reader can
detect a column-set change; `export` is how an existing store is brought to a new column set.
`trace_id` / `span_id` / `parent_span_id` carry the **containment** structure of a run. They feed the
report layer's secondary nested-chain diagnostic (§17.5) — **not** a critical path: the rows record
which span happened inside which, never which sibling had to wait for which, so a dependency analysis
is not derivable from them (§17.2 states why at length).

<!-- ptp-telemetry:anchor id=span-value-encodings class=substrate -->
### 10.2 Value encodings

Fixed here rather than left to the implementer, because a reader that guesses them mis-aggregates
silently:

- `schema_version` starts at **`1`**.
- `success` is the literal `true` or `false`, and **empty** only when the source carries no status.
- `error` is the source message with CR and LF stripped; **empty** when there is none.
- Timestamps are **ISO-8601 UTC with milliseconds**; `duration_ms` is an **integer when populated**
  and **empty** — never a fabricated zero — when the record has no usable duration.
- A source with **no usable start or end timestamp** is written with `start_ts`, `end_ts`, and
  `duration_ms` all empty and `missing-timestamp` in `notes` — never with an invented time.
- `input_tokens`, `output_tokens`, `cost_usd` are populated for LLM rows (`span_kind` ∈
  {`llm_request`, `api_request`}) and left **empty, not zero**, for every other row.
- `notes` is a `;`-separated list of the tokens §11 defines. No field may contain a CR or an LF.

<!-- ptp-telemetry:anchor id=span-kind-set class=substrate -->
### 10.3 `span_kind` — a closed set

The source name is taken as-is, its `claude_code.` prefix stripped, and matched against the closed
set `llm_request`, `tool`, `tool.execution`, `interaction`, `api_request`, `tool_result`. **Any other
name maps to `other`**, and its raw name is preserved in the raw NDJSON (§10.5) rather than the record
being dropped.

The spike found this build of Claude Code emitting **no spans at all** — LLM and tool timing arrive as
`/v1/logs` events named `claude_code.api_request` and `claude_code.tool_result`, both already members
of the set, with every other event (`user_prompt`, `tool_decision`, `assistant_response`, hook,
plugin, and MCP events) landing in `other`.

**The Codex half of the mapping** (`0032_06_codex-telemetry`, from the catalogue
`0032_05_codex-telemetry-scope-spike`'s decision record recorded in §7a/§7b). It is applied **only** to
a record whose persisted `service_name` (§10.5) is `codex_exec`, and to nothing else — the catalogue maps
**kinds of Codex work** and is **never origin evidence**, so it is consulted only after the record-level
discriminator has already said the record is Codex's. A Claude record whose span happened to be named
`shell_command` keeps the baseline mapping above.

| Codex source name | `span_kind` | Why |
|---|---|---|
| `codex.sse_event` (log) | `llm_request` | carries `input_token_count` / `output_token_count` with `event.kind = response.completed` |
| `codex.tool_result` (log) | `tool_result` | carries `tool_name`, `call_id`, `duration_ms`, `success` |
| `codex.tool_decision` (log) | `tool` | carries `tool_name`, `decision`, `call_id` |
| `codex.api_request` (log) | `other` | **deliberately not LLM** — its `endpoint` is `/models`, an HTTP metadata/auth call. Mapping it to an LLM kind is the one entry that would inflate LLM time with non-LLM work |
| `session_task.turn` (span) | `llm_request` | the turn aggregate: `codex.turn.token_usage.*` plus `model` |
| `shell_command` (span) | `tool` | `tool_name = shell_command`, `call_id`, `aborted` |
| `handle_responses` (span) | **per record** | **mixed per instance** — some instances carry `gen_ai.usage.*` and some carry `tool_name`, so the name carries no single class. It resolves to `llm_request` when the record carries any token attribute, `tool` when it carries a non-empty `tool_name`, and `other` otherwise. This is the one rule that keys off attributes rather than the name |
| every other Codex name | `other` | the record's stated rule: a name carrying no `model`, `tool_name`, or token attribute is `other`. The raw name is retained per §10.5 |

An uncovered Codex name mapping to `other` is the baseline's own unknown-name rule and the decision
record's **advisory A-2** mapping gap — a recorded gap escalated to a separately authorized change, never
a reason to stop and never a reason to drop the record. Crucially, a group the record-level discriminator
did **not** identify stays in `_unattributed/` and yields **no** `cli=codex` row of kind `other`, however
well its names match this table.

<!-- ptp-telemetry:anchor id=otel-attribute-mapping class=substrate -->
### 10.4 OTel source → column mapping

The single table both the receiver and `export` derive from (§10.7), written from the attribute shapes
the spike observed:

| Column | Source |
|---|---|
| `session_id` | attribute `session.id`, else `session_id` |
| `trace_id` / `span_id` / `parent_span_id` | the span's own ids; a log record's `traceId` / `spanId` where present, empty where not (`parent_span_id` is always empty for a log record) |
| `span_kind` | the span name, or a log record's `body.stringValue`, else `claude_code.` + `event.name` — mapped per §10.3 |
| `tool_name` | attribute `tool_name`, else `tool.name` |
| `model` | attribute `model`, else `gen_ai.request.model`, else `gen_ai.response.model` |
| `input_tokens` / `output_tokens` | attributes `input_tokens` / `output_tokens` (or their `gen_ai.usage.*` forms), LLM rows only |
| `cost_usd` | attribute `cost_usd`, LLM rows only |
| `success` | attribute `success` (`true`/`false`, string or boolean); else the span status (`OK` → `true`, `ERROR` → `false`); else empty |
| `error` | attribute `error`, `error.message`, or `exception.message`; else the span status message |
| `start_ts` / `end_ts` / `duration_ms` | the timestamp rule below |
| the Bash command text (raw-only) | the JSON payload in attribute `tool_parameters`, field `full_command`; else the JSON payload in `tool_input`, field `command`; else `tool_parameters`'s `bash_command` field (the command's **first token only** — a degraded last resort, not a synonym for this record's `bash_command` extra); else the flat attributes `command`, `tool.command`, `tool_input.command`, `bash.command`. The first **three** read fields out of **JSON strings** rather than flat scalars — `tool_parameters` and `tool_input` are each one attribute holding a JSON-encoded payload — and all three are emitted **only when `OTEL_LOG_TOOL_DETAILS` is set** (§13.2), the gate being on the whole attribute and not on any single field — without that key the text is absent from the wire and every Bash row's retained command is empty |

**The Codex source paths**, appended to the rows above rather than replacing them, so a record carrying
both keeps the baseline answer. Availability was recorded **per column** by the decision record (§7c),
and is honored per column here — token counts are obtainable and cost is not, and the three are never
treated as jointly available:

| Column | Codex source appended | Availability |
|---|---|---|
| `input_tokens` | …then `codex.turn.token_usage.input_tokens`, then log `input_token_count` | **available** |
| `output_tokens` | …then `codex.turn.token_usage.output_tokens`, then log `output_token_count` | **available** |
| `cost_usd` | — nothing appended | **UNAVAILABLE.** An exhaustive key sweep over every captured Codex span and log record found no cost-bearing key: Codex emits token counts and no cost. This is the decision record's **advisory A-3** — the column is left empty on Codex LLM rows, named as an escalated gap here and in the README, with **no** field added and **no** silent Codex exception to the LLM-row rule |
| `model` | already covered by the baseline `model` key | **available** (observed `gpt-5.6-sol`) |
| `tool_name` | already covered by the baseline `tool_name` key | **available** (observed `shell_command`) |
| `tool_class` | — nothing appended | **derives `other` for every Codex record** (**advisory A-4**): Codex's command text sits in an `arguments` attribute the baseline neither reads nor retains outside `tool_name === 'Bash'` |

**The timestamp rule**, in this order:

1. A source supplying **both** a start and an end (a span): those are `start_ts` / `end_ts`, and
   `duration_ms` is their difference.
2. A source supplying **one** timestamp **that is an end** (a log event — the event is emitted when
   the thing it describes **finished**): that timestamp is `end_ts`. When the source carries a
   numeric `duration_ms` attribute, `start_ts` = `end_ts` − `duration_ms`; when it does not, the
   event is instantaneous — `start_ts` = `end_ts` and `duration_ms` is **empty**.
2a. A source supplying **one** timestamp **that is a start** (a span with a start but no end — an
   unfinished span): that timestamp stays `start_ts`, and it is **never** relabelled as an end. With
   a numeric `duration_ms` attribute `end_ts` = `start_ts` + `duration_ms`; without one, `end_ts`
   and `duration_ms` are **empty**. The distinction is which end of the interval the source supplies,
   not how many timestamps it carries: forcing an unfinished span's start into `end_ts` would invent
   a completion that never happened.
3. Neither: all three empty, `missing-timestamp` in `notes`.

`duration_ms` arrives as a string on some events and an integer on others; it is coerced
numerically, never by type.

<!-- ptp-telemetry:anchor id=raw-record-superset class=substrate -->
### 10.5 The raw record is a superset — by exactly three fields

A raw entry's `record` carries the 26 projected fields **plus** a closed set of raw-only fields: the
derivation inputs the CSV has no column for, and the emitting CLI's own `service.name` observation —
which derives no projected column at all and is kept for a later consumer to route on. There is **no
second copy of `tool_name`** — the projected column *is* the value as received — so the extra fields are
exactly **three**:

| Extra field | Value |
|---|---|
| `bash_command` | the retained `Bash` command as `{ text, truncated }` — one field, not two — or `null` when the row is not a `Bash` row |
| `raw_span_name` | the raw source name, **only** when it mapped to `span_kind=other`; empty otherwise |
| `service_name` | the OTel **resource** attribute `service.name` as received — the emitter's own identifier (`claude-code` from Claude Code, `codex_exec` from Codex) — read from the resource scope so a record-level attribute of the same name cannot shadow it, carried through only the same CR/LF-stripping coercion every other field gets (§10.2) and otherwise uninterpreted, and empty when the resource supplies none |

`service_name` is persisted for **every** record, whatever the emitter — it is a value to compare, not a
Codex marker to test for presence. It is a routing **input** and deliberately has **no CSV column**: the
CSV stays exactly the 26 documented columns. Every record written from now on carries the key, empty when
the resource supplies no value; raw lines written **before** this field existed carry no such key at all
and are never rewritten, so a reader SHALL treat an **absent** `service_name` as equivalent to an empty
one and SHALL NOT use key presence as the test for whether a record carries a discriminator.

**The retained command text, exactly:** the command as received with CR and LF replaced by single
spaces (keeping the entry one physical line), truncated to **512 characters**, with truncation
flagged inside that same field. Classification examines **only** that retained, normalized text —
never the untruncated original — so the receiver and every later `export` derive the same bucket from
the same bytes. A stated number matters: two writers with different limits would bucket the same
command differently.

That superset is what makes the raw store authoritative rather than a duplicate of the CSV, and it is
what lets `export` reclassify without re-collecting a single span.

<!-- ptp-telemetry:anchor id=tool-class-mapping class=substrate -->
### 10.6 `tool_class` — the mapping table

The bucket set is `search`, `read`, `write`, `build_test`, `git`, `agent`, `other`.

| Bucket | Rule |
|---|---|
| `search` | tool `Grep`, `Glob` |
| `read` | tool `Read` |
| `write` | tool `Write`, `Edit`, `NotebookEdit` |
| `agent` | tool `Agent`, `Workflow`, `Skill` |
| `git` | `Bash` whose command matches the git pattern — **first** of the `Bash` rules |
| `build_test` | `Bash` matching the build/test pattern — **second** |
| `search` | `Bash` matching the search pattern — **third** |
| `other` | everything else, including a tool name outside this table and a row with no command text |

`tool_class` is **empty** when `tool_name` is empty (the row is not a tool row at all).

**The `Bash` sub-rules are ordered — `git`, then `build_test`, then `search`, then `other` — and the
order is the rule**, because one command can match several (`git grep`, `npm test -- --grep`). Only a
stated order makes the bucket reproducible on a later `export`.

**The patterns, written out rather than described.** The retained text is split on `&&`, `||`, `|`,
and `;`, and the **first token of each segment** is taken, its directory and any `.exe` / `.cmd` /
`.bat` / `.ps1` suffix stripped, lowercased. That is what makes `cd repo && npm test` a `build_test`
row rather than a `cd` row. Then, in order:

- **git** — any segment head is `git`.
- **build_test** — any segment head is one of: `npm`, `pnpm`, `yarn`, `bun`, `npx`, `jest`, `vitest`,
  `mocha`, `ava`, `tsc`, `tsx`, `pytest`, `tox`, `nox`, `unittest`, `go`, `cargo`, `mvn`, `gradle`,
  `gradlew`, `dotnet`, `make`, `cmake`, `ninja`, `msbuild`, `rake`, `rspec`, `ctest`, `eslint`,
  `prettier`, `ruff`, `mypy`, `pylint`, `flake8`, `phpunit`, `bazel`, `meson`.
- **search** — any segment head is one of: `rg`, `grep`, `egrep`, `fgrep`, `ag`, `ack`, `find`, `fd`,
  `locate`, `ls`, `dir`, `tree`, `which`, `where`, `awk`, `sed`.
- **other** — everything else.

The `Bash` **search** row is not optional: agents search through `Bash rg` at least as often as
through `Grep`, and routing that time to `other` would understate exactly the bucket this column
exists to measure.

**The derivation is heuristic, and it is stated as heuristic.** What makes that acceptable is that
both classification inputs survive in the **raw NDJSON record** — `tool_name` as the projected column
and the Bash command text as `bash_command` — so a wrong bucket is *re-derivable* by `export`, not
baked in.

<!-- ptp-telemetry:anchor id=single-source-mapping-rule class=substrate -->
### 10.7 Single-source rule for both tables

The tables in §10.4 and §10.6 are defined **here and nowhere else** in the shipped plugin surface
(`skills/`, `commands/`, `workflows/`, `scripts/`, `README.md`). What that means for an executable,
since a Node process cannot read rules out of Markdown at runtime:

- **This skill is normative.** `scripts/ptp-otel-sink.js` carries **exactly one** executable
  implementation of each table.
- **`export` calls that same implementation** rather than reimplementing either table, which is what
  guarantees a reclassification produces the buckets the receiver produced.
- What is forbidden is a **second operative statement** of the rules — one an agent or a process would
  act on — not their expression in code. The OpenSpec proposal, design, tasks, and spec deltas
  necessarily state them in order to mandate them; that is the specification, not a second copy.
- **Changing a table here and changing the executable copy is one change, never two.**

---

<!-- ptp-telemetry:anchor id=ledger-join class=substrate -->