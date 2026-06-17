---
name: ptp-version
description: Use this skill to resolve and compare ptp plugin versions — the installed version (from claude plugin list --json → id ptp@ptp → .version), the latest available version (via a claude plugin marketplace update ptp refresh + local marketplace.json read, with a GitHub raw fallback), and an up-to-date / update-available / installed-ahead verdict. The single source of truth for ptp version resolution, reused by /ptp:version (and, later, /ptp:update). Read-only with respect to the repo and the installed plugin; never uses the --available flag; never emits a false verdict.
---

# ptp-version — version resolution + comparison

## Purpose

This skill owns ptp plugin **version resolution and comparison**. It is the **single source of
truth** for three things — the **installed** version, the **latest** available version, and the
**comparison verdict** between them — and is reused by every version-reporting ptp command. Today
that is `/ptp:version` (a read-only viewer); slice 02's `/ptp:update` will delegate the *resolution*
to this skill and then perform the mutation itself, so the resolution logic lives in exactly one
place and is never re-derived.

This skill is **read-only with respect to the repository and the installed plugin**: it shells out
to `claude` (read subcommands plus a cache-refreshing `marketplace update`, which mutates only the
CLI's marketplace cache — not the repo, not the installed plugin), reads files, and optionally
fetches a URL. It performs no git operation, no `ptp-branch-guard`, and no repository file write.

---

## Installed resolution

1. Run `claude plugin list --json`.
2. Parse stdout as a **JSON array** of plugin entries.
3. Select the entry whose `id` field equals **`ptp@ptp`**.
4. Read that entry's **`.version`** field — that string is the **installed** version.

If the `claude` CLI is not found, the output is not valid JSON, or there is no `ptp@ptp` entry,
installed is **unknown** (see the error-handling table). Never crash; never guess.

### Anti-pattern — do NOT use `--available`

**Never run `claude plugin list --json --available`** to resolve the installed or latest version.
The `--available` flag returns an **empty array (`[]`) for already-installed plugins**, so it cannot
report the latest version for ptp. It was verified to return `[]` for ptp. Use the marketplace
resolution below instead. Do not "simplify" latest resolution to `--available`.

---

## Latest resolution

### Primary — refreshed local marketplace cache

1. Run **`claude plugin marketplace update ptp`** to refresh the local marketplace cache.
2. **Only if that refresh succeeds** (zero exit), read the local file
   `~/.claude/plugins/marketplaces/ptp/.claude-plugin/marketplace.json` and take
   **`.plugins[0].version`** as the **latest** version.
   - `~` expands to the OS **home directory** — on Windows `C:\Users\<user>`, on POSIX `$HOME` —
     the same home-directory resolution `ptp-config` uses for the global config path
     (`~/.claude/ptp/config.json`).
3. If the refresh command itself **fails** (nonzero exit / offline), the local cache may be
   **stale** and is **NOT** read for the verdict — fall through to the fallback below.

### Fallback — GitHub raw manifest

If the refresh failed, **or** the local marketplace file is missing, unreadable, or unparseable,
fetch:

```
https://raw.githubusercontent.com/AlmogMaayan/ptp/master/.claude-plugin/marketplace.json
```

and read the **same `.plugins[0].version`** field as the **latest** version. If this fetch also
fails (offline / non-200 / bad JSON), latest is **unknown** — report it; do not emit a false
verdict.

---

## Comparison

Given the resolved **installed** and **latest** versions:

1. **Either unknown →** do not compare; emit a **partial** report naming the side that could not be
   resolved and why (see Reports). Never a false verdict.
2. **Both known and equal (string-equal) →** **up-to-date** (short-circuit).
3. **Both known and differ →** parse each as `MAJOR.MINOR.PATCH` and compare **numerically**, field
   by field (major, then minor, then patch):
   - latest strictly greater → **update-available** (cite both).
   - installed strictly greater → **installed-ahead** (cite both; do **NOT** recommend an update).

   Numeric comparison is required because a naive **string** compare gets it wrong — e.g. `0.1.17`
   is *newer* than `0.1.9`, but `"0.1.17" < "0.1.9"` lexicographically. Do not "simplify" this back
   to a string `==`/`<` compare.
4. **String-compare fallback —** if **either** version is unparseable as `MAJOR.MINOR.PATCH`, the
   numeric direction is unavailable: fall back to **string inequality**, treat the difference as
   **update-available**, and **state in the report that the comparison was string-based** (the
   ahead/behind direction is not known).

---

## Reports

Emit exactly one of these report shapes:

- **Up-to-date** — installed and latest are both known and equal. Cite the shared version.
  > ptp is up to date (installed `X.Y.Z`, latest `X.Y.Z`).
- **Update-available** — both known, latest strictly newer (or unparseable-and-differing under the
  string fallback). Cite **both** versions.
  > Update available: installed `X.Y.Z`, latest `A.B.C`. Run `/plugin marketplace update ptp` and
  > restart the session to update.
- **Installed-ahead** — both known, installed strictly newer than latest. Cite **both**; do **not**
  recommend an update.
  > Installed version `A.B.C` is ahead of the latest available `X.Y.Z` (no update recommended).
- **Partial / unknown** — one or both versions could not be resolved. State which side is unknown
  and why (CLI missing, parse failure, no entry, network failure). Emit **no** up-to-date /
  update-available / installed-ahead verdict.
  > Installed `X.Y.Z`; latest could not be determined (the marketplace refresh and the GitHub
  > fallback both failed). Cannot determine whether an update is available.

---

## Error handling

| Situation | Behavior |
|-----------|----------|
| `claude` CLI not found | Installed = unknown; report "claude CLI not found". No crash. |
| `plugin list --json` output not valid JSON | Installed = unknown; report the parse failure. |
| No `ptp@ptp` entry in the array | Installed = unknown; report ptp not found among installed plugins. |
| `marketplace update ptp` refresh fails (nonzero / offline) | Treat the local cache as **non-authoritative** (possibly stale); do **NOT** read it for the verdict — fall through to the GitHub raw fallback. |
| Local `marketplace.json` missing / unreadable / unparseable | Fall through to the GitHub raw fallback. |
| GitHub raw fetch fails (offline / non-200 / bad JSON) | Latest = unknown; report latest could not be determined. **No** false "up to date". |
| Both versions unknown | Report both unresolved; emit no verdict. |
| Versions unparseable as semver | String-compare; treat difference as update-available; note the comparison was string-based. |
| `--available` flag | **NEVER used** — explicit anti-pattern (returns `[]` for installed plugins, cannot report latest). |

---

## Hard rules

- **Read-only with respect to the repository and the installed plugin.** No git operation, no
  `ptp-branch-guard`, no repository file write, no installed-plugin mutation. The one permitted
  state-touching command is `claude plugin marketplace update ptp`, which refreshes only the CLI's
  **marketplace cache** — it does not touch the repo or the installed plugin.
- **Never use `--available`.** It returns `[]` for already-installed plugins and cannot report
  latest.
- **Never emit a false verdict.** If either version is unknown, emit a partial report naming the
  unresolved side — never report "up to date" when latest could not be determined.
- **Never trust a stale cache.** If `marketplace update ptp` fails, do not read the local
  marketplace file for the verdict — fall through to the GitHub raw fallback.
- **Comparison is semver-aware.** Compare `MAJOR.MINOR.PATCH` numerically; only fall back to a
  string compare for unparseable versions, and say so in the report.
