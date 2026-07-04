---
name: ptp-workflow-cache-heal
description: Single-source CRLF self-heal for cached ptp workflow scripts. Run this step (via the Bash tool) before any named-workflow invocation to strip carriage-return characters from every file matching ~/.claude/plugins/cache/ptp/*/*/workflows/*.js. Idempotent, safe when the cache is absent, and never nests a Workflow() call.
---

# ptp-workflow-cache-heal — CRLF self-heal for cached ptp workflow scripts

## Why this skill exists

Claude Code resolves a named workflow by reading the cached `workflows/*.js` into a `script` field and
running a permission-system validator. CRLF (`\r`) in that content is rejected as a hidden control
character **before any of the workflow's own code executes**. So a `\r`-strip placed inside the
workflow JS would never run — the file is rejected before it is interpreted.

Skills, by contrast, are loaded as plain markdown text and are **not** passed through the `script`
validator, so a skill-documented Bash step does run — in the agent's tool context, immediately before
the `Workflow({ name: ... })` call. That is the only layer where the heal can live.

## The canonical heal step

Run the following via the **Bash tool** (Git Bash on Windows, bash on macOS/Linux — the `$'\r'` gate
is bash ANSI-C quoting, which the Bash tool provides on every platform):

```sh
for f in ~/.claude/plugins/cache/ptp/*/*/workflows/*.js; do
  [ -f "$f" ] || continue
  if LC_ALL=C grep -q $'\r' "$f"; then
    if command -v perl >/dev/null 2>&1; then
      perl -i -pe 's/\r//g' "$f"
    else
      tmp=$(mktemp "$f.heal.XXXXXX") && tr -d '\r' < "$f" > "$tmp" && mv "$tmp" "$f" || rm -f "$tmp"
    fi
  fi
done
```

## Contract

- **Idempotent** — the `LC_ALL=C grep -q $'\r'` gate means files already free of `\r` are never
  rewritten (no mtime churn, no spurious change). Running the step twice on a healed cache is a no-op.

- **Safe when cache is absent** — `[ -f "$f" ] || continue` turns an unmatched glob (no cache
  directory, or no `*.js` files) into a silent no-op. The step exits `0` with no output and no error.

- **Whole-glob** — the glob `~/.claude/plugins/cache/ptp/*/*/workflows/*.js` covers every cached version
  directory and both workflow script files in one pass, so stale versions are healed too. The two `*`
  segments are the **marketplace/plugin-name** directory (`ptp/`) and the **version** directory: the real
  installed layout is `~/.claude/plugins/cache/ptp/ptp/<version>/workflows/*.js`, so a single-`*` glob
  (`cache/ptp/*/workflows/*.js`) reaches one level too shallow and silently matches **zero** files.

- **Auto-selected fallback** — the rewrite auto-selects `perl -i -pe 's/\r//g'` when `perl` is
  present (typical on all platforms with Git Bash), and automatically falls back to `tr -d '\r'` (via a
  unique same-directory `mktemp` temp + atomic `mv`, with `rm -f` cleanup on failure) when `perl` is not
  on PATH. A perl-less environment still heals automatically without any manual intervention. The fallback's
  unique temp file (`$f.heal.XXXXXX`) prevents concurrent fallback runs from colliding. `tr -d '\r'`
  matches perl's remove-all-CR semantics and is portable; `sed -i 's/\r$//'` is deliberately avoided
  because `-i` argument handling and `\r` escape differ across GNU/BSD `sed`.

- **Not a Workflow call** — the step is plain Bash in the **outer agent context** (never a
  `Workflow()` call, never launches `ptp-branch-prep`). It therefore never nests a workflow and never
  violates the "workflow agents must reach only the no-op path" rule of `ptp-branch-guard`.

## Invocation sites

This skill is the **single source of truth** for the heal command. Invocation sites reference it
rather than inlining the command body, so the logic lives in exactly one place:

- `skills/ptp-branch-guard/SKILL.md` — first action of the guard, before the branch check
- `skills/ptp-full-run/SKILL.md` — before both `Workflow({ name: 'ptp:ptp-full-run' })` invocations
  (normal launch and `resumeFromRunId` resume launch)
- `skills/ptp-full/SKILL.md` — before the `Workflow({ name: 'ptp:ptp-full-run' })` launch
- `commands/full-run.md` — before the `Workflow({ name: 'ptp:ptp-full-run' })` launch
- `commands/full.md` — before the `Workflow({ name: 'ptp:ptp-full-run' })` launch
