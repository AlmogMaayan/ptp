> Loaded from skills/ptp-telemetry/SKILL.md when: resolving the telemetry.* config keys for any telemetry subcommand.
## 1. Config resolution

Four keys under a `telemetry` parent — `mode` and `root` (every layer of this skill), `port` (the
span layer only), and `retentionDays` (the report layer only) — resolve through the layered
configuration contract owned by **`ptp-workspace`** (`skills/ptp-workspace/SKILL.md`), the same
contract `codex.mode` resolves through (see `skills/ptp-codex-mode/SKILL.md`) and with the same
**forgiving reader posture**. That contract owns the layers, their order, and the per-key merge; this
skill restates none of them and states only each key's own rule:

```
mode = "off"                                 # default, applied LAST
mode = the resolved value of `telemetry.mode`, valid ⇔ ∈ {off, on}
# any missing file / missing key / parse error / out-of-enum value → leave the prior value
# (ultimately "off" if nothing valid is found) — never throw, never STOP
```

```
root = "openspec/telemetry"                  # default, applied LAST
root = the resolved value of `telemetry.root`, valid ⇔ a VALID root (see §1.1)
# any missing file / missing key / parse error / wrong type / invalid root → leave the prior value
# (ultimately "openspec/telemetry" if nothing valid is found) — never throw, never STOP
```

```
port = 4318                                  # default, applied LAST
port = the resolved value of `telemetry.port`, valid ⇔ an INTEGER in 1..65535
# any missing file / missing key / parse error / non-integer / out of TCP range → leave the prior
# value (ultimately 4318 if nothing valid is found) — never throw, never STOP
```

```
retentionDays = 30                           # default, applied LAST
retentionDays = the resolved value of `telemetry.retentionDays`, valid ⇔ a POSITIVE INTEGER
# any missing file / missing key / parse error / non-integer / ZERO / negative → leave the prior
# value (ultimately 30 if nothing valid is found) — never throw, never STOP
```

`telemetry.retentionDays` is read by the **report layer only** (§21); no write point consults it.
**Zero is named explicitly** in the invalid set rather than lumped under "not a positive integer":
`/ptp:config` rejects it at write time, so it can only arrive by a hand edit, and reading it
literally would mean *"retain nothing"* — the most destructive possible interpretation of a value the
editor refuses to write. Its layering is the same as the other three keys: an invalid layer is
*ignored*, so a valid global `retentionDays` survives an invalid project one, and `30` applies only
when **no** layer supplied a valid value.

`telemetry.port` is read by the span layer only (§§9–15); the ledger layer never binds a port. Its
posture is **layered exactly like the mode and the root**: an invalid layer is *ignored*, leaving
whatever an earlier layer validly resolved, and `4318` applies only when **no** layer supplied a
valid value — so a valid global port survives an invalid project one.

**Reader posture: never crash, never STOP over a config typo.** That posture is `ptp-workspace`'s: a
missing file, a missing key, unparseable JSON, a wrong-typed value, or an out-of-enum value all leave
whatever the prior layer validly resolved. **A later layer's invalid value never clears an earlier layer's valid value**: a
valid global `telemetry.mode: "on"` survives a project layer whose `telemetry` block is malformed or
out of enum, and `off` is the result only when **no** layer validly set a value.

(Contrast `ptp-config`, the *writer*, which is strict — it rejects and re-prompts an invalid value
rather than writing it. Reader forgives, writer protects; do not align one to the other.)

<!-- ptp-telemetry:anchor id=telemetry-root-validation class=substrate -->
### 1.1 `telemetry.root` validation

**`telemetry.root` is REPOSITORY-relative, whichever layer supplied it.** The resolved value is
interpreted relative to the repository root and validated by the rules below; it never becomes
relative to any other root, so one repository holds its telemetry store beneath its own root no
matter which layer named the path.

A `telemetry.root` value is **valid** only when it is:

- a **non-empty** string, and
- a **repository-relative** path, and
- a path that resolves **strictly below** the repository root.

Rejected, therefore, are:

- **absolute paths** (`/var/telemetry`, `C:\telemetry`, `\\server\share`, and any drive- or
  UNC-rooted form);
- **any value containing a `..` segment** (`../telemetry`, `openspec/../..`, `a/../../b`);
- **any value resolving to the repository root itself** — the empty string `""`, `.`, `./`, and `/`.

Rejection follows §1's layered posture rather than jumping to the default: an invalid value in a
layer is **ignored**, leaving whatever value the prior layer validly resolved, and
`openspec/telemetry` applies only when **no** layer supplied a valid one. A valid global root
therefore survives an invalid project root.

Both rejection classes are load-bearing:

1. A typo must never cause a write **outside the repository**.
2. A **root-resolving** value would point the store at the repository root, where the store's own
   create-if-absent `.gitignore` / `.gitattributes` (§2.1) would collide with — and could overwrite —
   the repository's own git-policy files.

---

<!-- ptp-telemetry:anchor id=store-layout class=substrate -->