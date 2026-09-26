> Loaded from references/scout-prestep.md when: the brainstorm scout pre-step runs with a change id.

## Scout map cache

The cache lives at `openspec/scout-cache/` under the resolved workspace root; `scripts/ptp-scout-map-cache.js` owns it. A hit is an index for the scout, never a substitute for it. Order:

1. The epic is the first four digits of the change id the invoking command resolved. A missing change id, or one with no `^\d{4}_` prefix, means no cache call at all.
2. Run `node scripts/ptp-scout-map-cache.js lookup --workspace <root> --epic <NNNN>` before the spawn, named relative to the ptp checkout like the map check.
3. On `hit`, append a `Prior map — INDEX, re-verify every line` section, holding the cached map verbatim, to the scout's spawn prompt only, never to part (i) or any main-run prompt. On `miss` or `invalidated`, spawn the scout cold.
4. The scout always runs. Run `store --workspace <root> --epic <NNNN> --map <the checked temp file>` only after the check exits 0.
5. Print `scout map cache: <state>; +<added>/-<removed>`. On a non-zero cache exit, print `scout map cache skipped: <code>` and spawn cold or skip the store; never STOP or retry.
