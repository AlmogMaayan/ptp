```json
{
  "skill": "ptp-run-at-model",
  "assertions": [
    {
      "id": "req-0",
      "kind": "requires",
      "pattern": "references/scout-prestep\\.md",
      "why": "SKILL.md points at the scout reference"
    },
    {
      "id": "order-0",
      "kind": "ordered",
      "patterns": [
        "\\(h\\)",
        "\\(i\\)",
        "The spawn is \\*\\*foreground\\*\\*"
      ],
      "why": "part (i) sits after (h) and before the foreground sentence"
    },
    {
      "id": "req-1",
      "kind": "requires",
      "pattern": "Scout map — INDEX, NOT EVIDENCE",
      "why": "the reference carries this scout hand-down rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "req-2",
      "kind": "requires",
      "pattern": "never cite a map line",
      "why": "the reference carries this scout hand-down rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "req-3",
      "kind": "requires",
      "pattern": "re-scan",
      "why": "the reference carries this scout hand-down rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "req-4",
      "kind": "requires",
      "pattern": "ptp-scout-map-check",
      "why": "the reference carries this scout hand-down rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "req-5",
      "kind": "requires",
      "pattern": "models\\.brainstorm-scout",
      "why": "the reference carries this scout hand-down rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "req-6",
      "kind": "requires",
      "pattern": "sonnet\\.medium",
      "why": "the reference carries this scout hand-down rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "req-7",
      "kind": "requires",
      "pattern": "byte-identical",
      "why": "the reference carries this scout hand-down rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "req-8",
      "kind": "requires",
      "pattern": "\\$WORK_PROMPT",
      "why": "the reference carries this scout hand-down rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "req-9",
      "kind": "requires",
      "pattern": "outer session",
      "why": "the reference carries this scout hand-down rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "forbid-10",
      "kind": "forbids",
      "pattern": "codex\\.brainstorm-scout",
      "why": "the scout has no codex twin",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "gate-0",
      "kind": "requires",
      "pattern": "## The scout gate",
      "why": "the reference carries the scout gate rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "gate-1",
      "kind": "requires",
      "pattern": "read `scout:` for `fast:`",
      "why": "the reference carries the scout gate rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "gate-2",
      "kind": "requires",
      "pattern": "Absent is not `off`",
      "why": "the reference carries the scout gate rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "gate-3",
      "kind": "requires",
      "pattern": "brainstorm\\.scout",
      "why": "the reference carries the scout gate rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "gate-4",
      "kind": "requires",
      "pattern": "Gate off adds nothing",
      "why": "the reference carries the scout gate rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "gate-5",
      "kind": "requires",
      "pattern": "byte-identical",
      "why": "the reference carries the scout gate rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "gate-6",
      "kind": "requires",
      "pattern": "tdd-plugin",
      "why": "the reference carries the scout gate rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "gate-7",
      "kind": "requires",
      "pattern": "ptp-resolve-scout-gate",
      "why": "the reference carries the scout gate rule",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "cache-order",
      "kind": "ordered",
      "patterns": [
        "## Brainstorm scout pre-step",
        "references/scout-map-cache\\.md",
        "## Spawn-site audit verdict"
      ],
      "why": "the pre-step points at the cache reference before the audit verdict",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "cache-0",
      "kind": "requires",
      "pattern": "Prior map — INDEX, re-verify every line",
      "why": "the cache reference carries this rule",
      "file": "references/scout-map-cache.md"
    },
    {
      "id": "cache-1",
      "kind": "requires",
      "pattern": "never to part \\(i\\)",
      "why": "the cache reference carries this rule",
      "file": "references/scout-map-cache.md"
    },
    {
      "id": "cache-2",
      "kind": "requires",
      "pattern": "scout always runs",
      "why": "the cache reference carries this rule",
      "file": "references/scout-map-cache.md"
    },
    {
      "id": "cache-3",
      "kind": "requires",
      "pattern": "only after the check exits 0",
      "why": "the cache reference carries this rule",
      "file": "references/scout-map-cache.md"
    },
    {
      "id": "cache-4",
      "kind": "requires",
      "pattern": "scout map cache skipped",
      "why": "the cache reference carries this rule",
      "file": "references/scout-map-cache.md"
    },
    {
      "id": "cache-5",
      "kind": "requires",
      "pattern": "no cache call",
      "why": "the cache reference carries this rule",
      "file": "references/scout-map-cache.md"
    },
    {
      "id": "cache-6",
      "kind": "requires",
      "pattern": "ptp-scout-map-cache\\.js",
      "why": "the cache reference carries this rule",
      "file": "references/scout-map-cache.md"
    },
    {
      "id": "sp-0",
      "kind": "requires",
      "pattern": "tdd-plugin=superpowers[^\\n]*Do NOT invoke .superpowers.brainstorming.",
      "why": "the superpowers directive forbids the Superpowers brainstorming skill on its marker line"
    },
    {
      "id": "sp-1",
      "kind": "requires",
      "pattern": "six .ptp-\\*. replacement skills .ptp-writing-plans., .ptp-test-driven-development., .ptp-systematic-debugging., .ptp-requesting-code-review., .ptp-receiving-code-review., .ptp-verification-before-completion.",
      "why": "the superpowers directive names the six forbidden ptp-* skills"
    },
    {
      "id": "sp-2",
      "kind": "requires",
      "pattern": "brainstorm → none",
      "why": "the codex closure map delivers no Superpowers text for brainstorm"
    },
    {
      "id": "sp-3",
      "kind": "requires",
      "pattern": "plan → .writing-plans.;",
      "why": "the codex closure map delivers only writing-plans for plan"
    },
    {
      "id": "sp-4",
      "kind": "forbids",
      "pattern": "seven .ptp-\\*. replacement",
      "why": "the superpowers directive no longer forbids all seven ptp-* skills"
    },
    {
      "id": "req-strip",
      "kind": "requires",
      "pattern": "scout map stripped",
      "why": "the reference carries the stripped-lines notice",
      "file": "references/scout-prestep.md"
    },
    {
      "id": "req-truncate",
      "kind": "requires",
      "pattern": "scout map truncated",
      "why": "the reference carries the truncated-lines notice",
      "file": "references/scout-prestep.md"
    }
  ]
}
```

## Pressure test: the capsule cites a map line

**Situation** — A scout map lists a consumer the main run never opened.

**Pressure** — The map looks authoritative and saves a read.

**Required behavior** — Cite only code the run itself read, or omit the claim.

**Failure signature** — The capsule states the consumer with the map line as its citation.

## Pressure test: a map gap is read as no impact

**Situation** — The map is silent on a second entry point.

**Pressure** — A short map feels complete.

**Required behavior** — Re-scan the area rather than read the gap as absence of impact.

**Failure signature** — The run reports no impact because the map lists none.

## Pressure test: a failed map is handed down

**Situation** — The map check exited non-zero on a map with a `conclusion` failure.

**Pressure** — Dropping the check saves a step.

**Required behavior** — Omit part (i) with the single line `scout map omitted: <reason>` and continue.

**Failure signature** — The failed map is carried into the spawned prompt.

## Pressure test: an absent scout token is read as off

**Situation** — A command is invoked with no `scout:` token while `brainstorm.scout` is `on`.

**Pressure** — No token looks like no request for a scout.

**Required behavior** — Resolve the gate from the layered `brainstorm.scout` key; an absent token is not `off`.

**Failure signature** — The run skips the scout because the token was absent, though the key is `on`.

## Pressure test: a cache hit tempts skipping the scout

**Situation** — The scout map cache lookup returns `hit` for the epic.

**Pressure** — A cached map looks current and skipping the spawn saves time.

**Required behavior** — The scout always runs; the cached map goes only into the scout's spawn prompt as an index to re-verify.

**Failure signature** — The run skips the scout and reuses the cached map as if it were fresh.

## Pressure test: a cache hit tempts handing the cached map to the main run

**Situation** — The lookup returns `hit` and the cached map is in hand.

**Pressure** — Passing it straight to the main run saves the scout's work.

**Required behavior** — Give the cached map only to the scout's spawn prompt, never to part (i) or any main-run prompt.

**Failure signature** — The cached map appears in part (i) or a main-run prompt without a fresh checked scout map.

## Pressure test: a stripped map is discarded

**Situation** — The map check exited 0 after stripping two uncited lines and rewriting the file.

**Pressure** — A map that was edited looks untrustworthy, so dropping it seems safer.

**Required behavior** — Hand down the stripped map as part (i) and print `scout map stripped: <n> uncited lines`.

**Failure signature** — The stripped map is discarded as failed, or handed down with no notice.

## Pressure test: a truncated map is discarded

**Situation** — The map check exited 0 after truncating four tail lines and rewriting the file.

**Pressure** — A map that was cut looks incomplete, so dropping it seems safer.

**Required behavior** — Hand down the truncated map as part (i) and print `scout map truncated: <n> lines`.

**Failure signature** — The truncated map is discarded as failed, or handed down with no notice.
