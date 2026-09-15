# Optional caller-side `codex-model:` override token

Any command that references this skill MAY additionally support an **opt-in, per-invocation**
`codex-model:<model>--<effort>` token that a user embeds anywhere in that command's free-text
argument text, to override — **for that single invocation only, and only when `ptp-agent-roles`
resolves `main=codex`** — the Codex model/reasoning-effort that *The `main=codex` direction* would
otherwise resolve (the tier-based sourcing, or the `effort.md` line-2 arm for `/ptp:apply`). This
section is the single source of truth for the token's grammar, validation, and refusal contract; a
supporting command references this section rather than restating it. It is the `main=codex` sibling of
the `model:` section above, and follows the same detect-then-validate shape with a different
delimiter and enum. **In scope, `codex-model:` targets the same commands that support `model:`** —
`/ptp:brainstorm`, `/ptp:prd`, `/ptp:brainstorm-full`, `/ptp:prd-full`, `/ptp:analyze`, `/ptp:prompt`,
`/ptp:prompt-fix`, and `/ptp:prompt-write` (the same list the `model:` section names); no other caller
of this skill is in scope. **As of this writing those command files have not yet been updated with an
explicit `codex-model:` parse step** — only this skill's contract exists so far, matching this slice's
own documentation-and-contract-only scope; wiring the parse step into each of those command files is
tracked as separate follow-up work, and until it lands the token has no effect for any invocation.

## Grammar

```
codex-model:<model>--<effort>
```

- `<model>` is a free-form, non-empty model identifier segment (Codex model names are not drawn from a
  fixed enum the way the Claude Agent-tool's four models are).
- `<effort>` ∈ `{minimal, low, medium, high}` — the Codex `model_reasoning_effort` enum.
- The delimiter is the **double dash** `--`, not a single dot: `codex-model:gpt-5.1-codex--high`, not
  `codex-model:gpt-5.1-codex.high`.

## Two-stage detect-then-validate

1. **Detect a candidate.** Scan the argument text for a whitespace-delimited token that **begins with
   the lowercase literal prefix `codex-model:`** — bounded by start-of-string or whitespace on the
   left, and whitespace or end-of-string on the right. A `codex-model:` substring inside a larger word
   is **not** a candidate. Detection is keyed on the **prefix alone**, **not** on the presence of `--`
   anywhere in the token — mirroring the `model:` section's own prefix-first detection, so a near-miss
   typo (e.g. `codex-model:gpt-5.1-codex`, missing the `--effort` suffix entirely) is still detected as
   a candidate rather than silently falling through as absent.
2. **Validate each candidate.** Split the candidate's body (the text after the `codex-model:` prefix)
   on the **last** `--` — mirroring the `effort.md` line-2 split rule for the same grammar shape. The
   split MUST yield a **non-empty model segment** (the text before the last `--`) and an effort segment
   (the text after it) that is exactly one of `minimal`, `low`, `medium`, `high`, matched
   case-sensitively against these lowercase values. A candidate that begins with the lowercase
   `codex-model:` prefix but does **not** satisfy this — no `--` present, an empty model segment (e.g.
   `codex-model:--high`), a missing or unrecognized effort segment — is **recognized-but-invalid**: it
   REFUSES. It does **not** fall through as "absent."

**Case is the one deliberate exception**, mirroring `model:`: only the exact lowercase `codex-model:`
prefix is scanned for, so a non-lowercase prefix (e.g. `Codex-Model:gpt-5.1-codex--high`) is **never**
a candidate and falls through as **absent**.

**At most one candidate is recognized.** Two or more `codex-model:` candidates in the same argument
text is treated as **invalid** — not "last one wins" — and the refusal reports **all** detected
candidates, not a single "offending token."

## Resolution outcomes

- **Absent** (no candidate detected at all) → Codex model/effort resolution is unaffected — resolved
  exactly as *The `main=codex` direction* already specifies, as if this section did not exist.
- **Exactly one valid candidate, and `main=codex` for this invocation** → the resolved
  `<model>`/`<effort>` pair **replaces** the Codex model/reasoning-effort that *The `main=codex`
  direction* would otherwise have resolved (tier-based sourcing, or the `effort.md` line-2 arm), for
  this invocation only. No ptp config file is read or written; nothing persists past the invocation.
- **Exactly one valid candidate, but `main=claude` for this invocation** → the token is still detected,
  validated, and stripped (per *Strip-before-use ordering* below), but it contributes nothing to target
  resolution — see the symmetric note under *Interaction with `main=codex`* in the skill body.
- **Invalid** (a recognized-but-invalid candidate, or two or more candidates) → the calling command
  **refuses and stops**, reporting the offending candidate(s) and the grammar
  (`codex-model:<model>--<effort>`, effort ∈ `{minimal, low, medium, high}`), **before** evaluating any
  branch guard or spawning any subagent or Codex shell-out. This refusal fires regardless of the
  resolved `main` — an invalid token is a caller error independent of which agent ends up running the
  work.

## Strip-before-use ordering

The parse-and-strip step runs in the calling command's **outer session**, **before** that command's own
argument grammar (change-id derivation, selector/free-text classification) and **before** that
command's own branch-name derivation or branch guard — the same ordering the `model:` and `fast:`
sections already give, and for the same reasons: a leftover token could contaminate a derived
description or be misread as part of a selector, and an invalid token must abort before a branch-name
derivation and branch cut, not after. `codex-model:`, `model:`, and `fast:` are **independent**: any
subset MAY appear together in the same argument text, each is detected and stripped by its own section,
and an invalid candidate of any one kind refuses independently of the others.
