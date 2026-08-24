---
name: ptp-telemetry-setup
description: Own setting up local ptp telemetry, its store, and its receiver configuration
---

# ptp-telemetry-setup — the confirm-first `setup` contract

## Purpose

This skill owns the **leaf-owned methodology** of `/ptp:telemetry setup`: the target file and the
already-tracked refusal, the merge semantics, the confirm-first write ordering across the credential
and both `.gitignore` files, and the two sink invocations that implement it. That methodology is
stated **here, once**, and nowhere else.

**Two front doors, one methodology.** `/ptp:telemetry setup` reaches this skill through the
`/ptp:telemetry` router and `/ptp:telemetry-setup` reaches it directly. Both ask the same questions,
render the same diff, perform the same writes in the same order, and take the same refusal paths.
Neither command carries methodology of its own, so the two can never disagree.

**Retained numbering.** This skill **retains the subsection numbering it inherited from**
`` `ptp-telemetry` [setup-methodology] ``, so every existing `§13.x` cross-reference — in
`scripts/ptp-otel-sink.js` and in the other files that cite `setup` by number — resolves unchanged.
That is why its sections start at `13.1` rather than at `1`, and why nothing here is renumbered to
read more naturally.

**`13.2` is deliberately absent from that sequence.** The eight-key `env` block is classified
substrate and was therefore not extracted with the rest; it is not lost, and a reader looking for the
key table follows `` `ptp-telemetry` [telemetry-env-keys] `` in the *Substrate dependencies* list
below.

**Citation posture.** This skill owns its subcommand's methodology and **reads** the substrate for
everything else. Every substrate contract it depends on stays in `skills/ptp-telemetry/SKILL.md` and
is cited here by its **anchor id** — the form `` `ptp-telemetry` [anchor-id] `` — never restated,
never paraphrased, and never cited by section number.

## Substrate dependencies

Every entry is an anchor in the `ptp-telemetry` skill. This list exists so a change to a substrate
region can find this dependent by grepping for the anchor id. Two entries are **depended on** by the
procedure itself; the rest are context a reader may follow.

| Anchor (`ptp-telemetry`) | What this skill needs from it | Depended on? |
|---|---|---|
| `telemetry-env-keys` | the exactly-eight-key `env` block and the credential row's redaction — **what `setup` writes** | **yes** |
| `codex-consent-record` | the second, separately-consented Codex step **in full** — its procedure and its record contract alike | **yes** |
| `codex-canonical-rendering` | the canonical `-c otel.*` rendering that step appends | context |
| `codex-telemetry` | the repository-scoped Codex telemetry mechanism the step belongs to | context |
| `store-layout` | the per-repository store the credential and `<telemetry.root>/.gitignore` live in | context |
| `receiver-write-path` | the managed lines `setup` reconciles into `<telemetry.root>/.gitignore` | context |
| `otel-attribute-mapping` | the attributes `OTEL_LOG_TOOL_DETAILS` feeds, and the column they populate | context |
| `tool-class-mapping` | the `tool_class` buckets that go empty without that key | context |
| `sink-lifecycle` | the receiver whose ingestion credential this block carries | context |
| `lifecycle-status-read` | the `status` credential verdict rendered without printing either value | context |
| `auto-start-preamble` | the preamble that detects the restart-required condition and that must never reach `setup` | context |

<!-- ptp-telemetry:anchor id=setup-methodology class=leaf owner=setup -->
## 13. `/ptp:telemetry setup` — the one confirm-first setting writer

### 13.1 What it writes, and where

`setup` writes the **local project** settings file **`<repo>/.claude/settings.local.json`** — never
`~/.claude/settings.json` and never the shared `<repo>/.claude/settings.json`. Two independent
properties are required and only that file has both:

- **Per-repository**, because the telemetry store is per-repository and a user-global write would
  enable emission in every repository the user opens.
- **Untracked**, because the block carries the ingestion credential, and the shared project settings
  file is the one a team commits.

Because ignoring a path does not untrack a file git already tracks, `setup` **refuses non-fatally,
writing nothing**, when `.claude/settings.local.json` is already tracked, saying it must be untracked
first. A secret written into a tracked file while claiming it is ignored is a false guarantee.

<!-- ptp-telemetry:anchor id=setup-merge-semantics class=leaf owner=setup -->
### 13.3 Merge semantics

Touch **only those eight keys**. Every other `env` key and every key outside `env` is left untouched.
A key already present with a different value is shown **old and new** in the diff and changed only on
confirmation. A **higher-precedence layer that already defines one** is called out rather than
silently shadowed. Refuse — **without overwriting** — a settings file that does not parse as JSON or
whose root is not an object. This is `/ptp:config`'s writer posture, not a second one.

**The endpoint does not track `telemetry.port` afterwards.** Changing the port means re-running
`setup`, whose diff then shows a single line — so "I changed the port and telemetry broke" is
documented rather than discovered.

<!-- ptp-telemetry:anchor id=setup-consent-scope class=leaf owner=setup -->
### 13.4 Confirm-first covers the credential and both `.gitignore` files

Nothing at all is written before explicit confirmation — not the settings file, not the credential,
not either `.gitignore`. After confirmation the order is fixed, so neither secret is ever briefly
tracked:

1. Reconcile the **repository-level `.gitignore`** so it covers `.claude/settings.local.json`;
2. reconcile **`<telemetry.root>/.gitignore`** (the managed lines of `` `ptp-telemetry` [receiver-write-path] ``);
3. persist the credential;
4. write `settings.local.json`.

Both reconciliations are shown in the diff. Both are managed-line additions: only missing lines are
added, all other content preserved.

On a confirmed write, `setup` states that **the block takes effect at process start**, so the session
that just ran it must **restart Claude Code** before spans are emitted. That is the same condition the
`` `ptp-telemetry` [auto-start-preamble] `` preamble detects from the live environment.

### 13.5 Running it

```
node <plugin>/scripts/ptp-otel-sink.js setup-plan  --repo <repo root>    # writes NOTHING
node <plugin>/scripts/ptp-otel-sink.js setup-apply --repo <repo root>    # only after confirmation
```

`setup-plan` returns the diff (`env_diff` with `old` / `new` / `shadowed_by_live_env` per key — the
credential row redacted per `` `ptp-telemetry` [telemetry-env-keys] `` — both reconciliations, and whether the credential already exists).
**Render that diff verbatim, ask for explicit confirmation, and run `setup-apply` only on an
affirmative answer.** Never reconstruct or print the credential value while rendering it. A refusal (`action: refused`) is
relayed verbatim and nothing is run. `setup` is **never** invoked from any automatic path, including
the `` `ptp-telemetry` [auto-start-preamble] `` preamble.

`setup` has a second, separately-consented **Codex step**, whose procedure and record contract both
live in the substrate. Follow `` `ptp-telemetry` [codex-consent-record] `` for that step in full, and
`` `ptp-telemetry` [codex-canonical-rendering] `` for the `-c otel.*` form.

## Hard rules

These bind **both** entry points — `/ptp:telemetry-setup` and `/ptp:telemetry setup` — because they
resolve to this one document.

- **Writes only on explicit confirmation.** Not the settings file, not the credential, not either
  `.gitignore`, not the Codex telemetry-consent record. The exact diff is rendered first, and an
  answer that is not affirmative leaves every one of them untouched.
- **Never reached automatically.** No ptp path invokes `setup`, **explicitly including** the
  `` `ptp-telemetry` [auto-start-preamble] `` auto-start preamble, which may start the receiver but
  must never write a Claude Code setting.
- **Runs no `ptp-run-at-model` invocation and no auto-start preamble.**
- **No branch guard, no `openspec validate`, no `ptp-change-selector`.** `setup` resolves no selector
  and defines no flag.
- **Reads git only for one refusal.** The single git read is the check that
  `.claude/settings.local.json` is not already tracked; `setup` makes no git write.
- **Takes no argument.** Any argument is reported as **unsupported without writing anything**.

**Where these are also stated.** The first two rules above — *writes only on explicit confirmation*
and *is never reached automatically* — are deliberately duplicated at two other sites, and each of
the three names the other two so an editor of one is shown the rest: `commands/telemetry.md`'s
`setup` delegation bullet, and `commands/telemetry-setup.md`. Only those two invariants are
duplicated; no procedure is.

**One further invariant, noted rather than owned.** That `/ptp:telemetry setup` is the only ptp step
permitted to write a Claude Code setting is asserted in `ptp-telemetry`'s own `## Hard rules` and in
`skills/ptp-run-at-model/SKILL.md`. This note is a one-directional courtesy so the set stays
discoverable; it places no reciprocal obligation on either of those files.
