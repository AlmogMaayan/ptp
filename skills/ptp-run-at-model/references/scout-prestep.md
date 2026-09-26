> Loaded from skills/ptp-run-at-model/SKILL.md when: step 5 carries an optional part (i) scout map, or an outer session runs the brainstorm scout pre-step.

## Part (i) — the scout map hand-down

Part (i) is the sibling of part (f): the same opt-in and supplier-side rules apply. A caller with no map simply omits it, and with the part absent the spawned prompt is byte-identical to today's. It is carried in both branches, and under `main=codex` it goes inline in `$WORK_PROMPT`. It applies under either `tdd-plugin` value.

When present, the part is a block headed exactly `Scout map — INDEX, NOT EVIDENCE`, carrying the map verbatim, followed by these rules for the main run:

- Use the map only to choose where to look first.
- For every capsule fact or finding, cite code you yourself read; never cite a map line.
- Drop a map line your own read does not confirm.
- A gap in the map is not absence of impact: re-scan rather than read a gap as "no impact".

A caller MUST NOT supply a map that failed the map check, or one that cites a file its own flow has since modified.

## Brainstorm scout pre-step

Run only by an outer session, after step 4 and before step 5. A main run never spawns the scout, and a caller-side `model:` token never retargets it.

1. Resolve `models.brainstorm-scout` through the layered configuration. A layer counts only when it matches the `model:` grammar; otherwise the value is `sonnet.medium`. Never STOP, under either `roles.main`.
With a change id, consult the scout map cache per `references/scout-map-cache.md` around this spawn.
2. Run a foreground spawn of `subagent_type: ptp:ptp-brainstorm-scout` at that model, with the effort directive.
3. Write the returned map to an OS temp file outside the workspace.
4. Run `node scripts/ptp-scout-map-check.js <file>`, named relative to the ptp checkout as `/ptp:plan` names its linter.
5. On a failed check, a spawn error or an empty result, omit part (i), emit the single line `scout map omitted: <reason>`, and continue. Never STOP and never retry.

A multi-run caller may hand one checked map to several runs. The scout has no Codex twin key: it is always a Claude spawn.

## Spawn-site audit verdict

`sonnet.medium` is admissible for the scout, because the main run re-verifies the map (a map line is never evidence). The scout is a new spawn site, not a downgrade of an existing one, and the nil result for the existing sites stands.

## The scout gate

Whether a command requests the *Brainstorm scout pre-step* is decided by one gate. The `scout:on|off` token is defined by reference to `SKILL.md` § *Optional caller-side `fast:` switch*: read `scout:` for `fast:`. Its grammar, strip and refusal rules are that section's, with these four deltas:

1. Absent is not `off`. With no `scout:` token the gate reads the layered `brainstorm.scout` key (`off` or `on`, default `off`); a token overrides the key for that one run.
2. Only a command that names this section parses the token; every other command leaves `scout:` in its text untouched.
3. The gate is independent of `fast:`, `model:` and `parallel:`: each is parsed and stripped on its own and none implies another.
4. The gate is independent of `tdd-plugin`: it resolves the same under either value.

A gate resolving on requests the *Brainstorm scout pre-step*. Gate off adds nothing: no pre-step, no part (i), no added line, and a byte-identical spawned prompt.

`scripts/ptp-resolve-scout-gate.js` embodies this section; where they disagree the section wins.
