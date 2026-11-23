> Loaded from skills/ptp-run-at-model/SKILL.md when: step 5 carries an optional part (j) learned insights block, or an outer session runs the `ptp-learn` read-back listing.

## Part (j) — learned insights

Part (j) is the sibling of part (f): the same opt-in and supplier-side rules apply. The skill never runs the listing itself; a caller that has no block simply omits the part. It applies under either `tdd-plugin` value.

`ptp-learn` owns which runs receive it (`skills/ptp-learn/SKILL.md` § *Read-back*). This file owns the block's text. `scripts/ptp-learn.js --list-insights` embodies it, and where they disagree this file wins.

## Block shape

When present, the part is the `--list-insights` output carried verbatim: the header, one line per lesson, a blank line, the rules line, the four shared rules, and the one mode rule.

```
Learned insights — <mode>
- [<label>] <id> · <source> · <date>: <insight>

Rules for these insights:
```

- `<mode>` is `learn-and-suggest` or `learn-and-use`.
- `<label>` is `project` for a lesson from the project file, `user` for one from the user file, and `shared` when both paths name one file.
- After `<date>`, the line adds `· origin <tag>` when the lesson carries an origin, then `· project-specific` when its scope is `project-specific`, before the colon.
- `<insight>` is the lesson's Insight block on one line.
- Project lessons come first, in file order, then user lessons in file order. A user lesson whose id a project lesson already has is left out, so the project copy wins. There is no cap and no relevance filter.

## The four shared rules

Every block carries these four lines, verbatim:

- Use an insight only at a choice it covers: an assumption, an open question, or a default you would otherwise pick yourself.
- When a project insight and a user insight disagree, follow the project insight.
- An insight is a preference, never evidence: every fact you state still cites code you read.
- Ask the user nothing about an insight.

## The mode rule

The block ends with the one line for its mode, verbatim.

Under `learn-and-suggest`:

- learn-and-suggest: keep your own default at each choice an insight covers, and write `Suggested by learned insight <id>: <what it would change>` beside it without applying it.

Under `learn-and-use`:

- learn-and-use: adopt the insight as your default at each choice it covers, and mark that choice `Assumed from learned insight <id>`.

## Carriage

- The part is carried in both branches. Under `main=claude` it goes in the subagent's prompt after part (i). Under `main=codex` it goes inline in `$WORK_PROMPT`, which must be self-contained.
- With the part absent, the spawned prompt is byte-identical to today's. Under `off`, under `learn-only`, and with no stored insight, the listing prints nothing and the caller adds no part and no line.

## Supplier rules

- Only an **outer session** runs the listing, after its branch guard and any id allocation and right before its `ptp-run-at-model` call. It passes the output verbatim as part (j) when it is non-empty. A main run never runs the listing.
- Run it as `node scripts/ptp-learn.js --list-insights [--workspace <root>]`, named relative to the ptp checkout. Pass `--workspace <root>` when the caller resolved a workspace root, and omit it when it resolved none.
- A non-zero exit, or a script that cannot run, never stops the command. The caller omits part (j), emits the single line `learned insights omitted: <reason>`, and continues. Never retry.
- A multi-run caller runs the listing once and may hand the same block to several runs. No member write makes it stale, because a main run never writes learnings.
- A caller MUST NOT edit, trim, or summarize the block. It is passed whole or not at all.
