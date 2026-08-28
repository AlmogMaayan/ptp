---
name: ptp-agent-roles
description: Resolve which agent plays the main role and which plays the reviewer role for a step
---

# ptp-agent-roles — resolve `roles.main` and derive the reviewer

## Purpose

ptp hardcodes Claude as the main planning/implementation agent and Codex as the (optional,
gated) reviewer everywhere. Supporting the reverse — Codex as main, Claude as reviewer —
requires one canonical, configurable notion of "which agent is main" before any orchestrator can
be generalized. This skill is that single source of truth: it resolves the `roles.main` config
key from layered config and exposes the derived role pair `{ main, reviewer }`.

This skill is a **pure resolver**: config-in, role-pair-out. It performs no git, no spawn, no CLI
probe, and edits nothing. It is the role-naming analog of `ptp-codex-mode` (reviewer gate) and
`ptp-change-selector` (id grammar).

**This slice (0027_01) only defines the contract.** No orchestrator, reviewer, implementer, or
apply/effort file references or consumes this skill yet — that wiring happens in 0027_02
(reviewer-gate direction), 0027_03 (review orchestrators), and 0027_04 (main-implementer path).

## Resolving `roles.main` (mirrors `ptp-codex-mode`'s `codex.mode` resolution)

Resolve `roles.main` through the layered configuration contract owned by **`ptp-workspace`**
(`skills/ptp-workspace/SKILL.md`), which owns the layers, their order, and the per-key merge; this
skill restates none of them and states only the key's own rule. Then — only if the layered read left
`roles.main` unset — fall back to an opt-in detection step, and only then to the ultimate fallback
`claude`:

```
# Tier 1 — the layered config, merged exactly as ptp-workspace defines:
main = the resolved value of `roles.main`, valid ⇔ ∈ {claude, codex}, else undefined
# any missing file / missing key / parse error / out-of-enum value → leave the prior value

# Tier 2 — detection (runs ONLY when main is still undefined here):
if main is undefined:
    env = PTP_MAIN_AGENT                     # opt-in env var, not driver detection
    if env ∈ {"claude", "codex"} (exact match):
        main = env
    # absent / empty / whitespace / wrong-case / any other value → leave undefined, fall through

# Tier 3 — ultimate fallback:
if main is undefined:
    main = "claude"
# never throw, never STOP at any tier
```

**Reader posture: never crash, never STOP over a config typo.** That posture is `ptp-workspace`'s
and holds here unchanged: a missing file, a missing key, unparseable JSON, or an out-of-enum value
all leave whatever an earlier layer validly set, and a later layer's invalid value never clears it.
The default `claude` applies only when no layer supplies a valid value and detection also yields
nothing.

### Precedence, highest to lowest

1. `roles.main` from the layered config, merged as `ptp-workspace` defines.
2. **Detection (opt-in, only when the layered read left `roles.main` unset):** the environment
   variable `PTP_MAIN_AGENT`, exact value `claude` or `codex`.
3. **Ultimate fallback:** `claude`.

Explicit config **always** wins over detection — detection only fills an *unset* `roles.main`; it
never overrides a value any config layer supplies. `PTP_MAIN_AGENT` is a best-effort, **opt-in
default**, not driver detection (see "Why true detection is impossible" below): an absent, empty,
whitespace-only, wrong-case, or otherwise invalid value is treated as absent and falls through to
`claude`. Nothing at any tier throws or STOPs.

### Why true CLI-driver detection is impossible here

Every `/ptp:*` command is a Claude Code slash command, so the CLI that launched the initial command
is **always** Claude Code — Codex cannot invoke a Claude Code slash command, so there is no runtime
signal that "Codex is driving." The Claude Code session is always the outer harness; `roles.main
= codex` never means a different CLI launched the command, it means the harness delegates the heavy
work to `codex exec` (see "Harness framing" below). Consequently `PTP_MAIN_AGENT` cannot be genuine
detection — it is a user-supplied, best-effort **default** for an unset key. Users who want
deterministic behavior should set `roles.main` explicitly via `/ptp:config` rather than relying on
the env var.

### No-fake-signal rule

The resolver **SHALL NOT** treat `codex` being present on PATH as a main-agent signal — PATH
presence is already the *reviewer-present* signal (`ptp-codex-mode`'s auto-mode uses it to decide
whether the reviewer Codex phase runs); using it to flip the *main* agent would silently change
behavior for every user who installed codex only for reviews. The resolver **SHALL NOT** inspect
process ancestry or parent-process names to guess a driver — unreliable, platform-specific, and
conceptually wrong (the driver is always Claude Code). The only detection input today is the
opt-in `PTP_MAIN_AGENT` env var; if a genuine session-provided "main agent" signal ever becomes
available, it could slot into tier 3 alongside or above the env var, but none is known today.

`roles.main` resolves **independently** of `codex.mode`, `codex.model`, and
`codex.reasoningEffort`. `codex.mode` answers "does the reviewer Codex phase run?"; `roles.main`
answers "which agent is main?" — orthogonal axes. Setting one never implies or requires the
other.

## Derived role pair

This skill exposes `{ main, reviewer }` where `main` is the resolved value above and `reviewer`
is the **other** agent:

```
reviewer = (main == "claude") ? "codex" : "claude"
```

**Only `roles.main` is stored in config.** `reviewer` is never a separate stored key — it is
always derived from `main` at resolution time. This makes a state where `main == reviewer`
unrepresentable.

| `roles.main` resolves to | `main` | `reviewer` |
|---------------------------|--------|------------|
| `claude` (default/unset) | `claude` | `codex` |
| `codex` | `codex` | `claude` |

## Harness framing

The Claude Code session is **always** the outer harness — every `/ptp:*` command is a Claude Code
slash command, so Codex can never "drive" the initial command. `roles.main=codex` therefore does
**not** mean the user launched a different CLI; it means the heavy planning/implementation work
is delegated to `codex exec` while Claude reviews in-session (the mirror of today's
Claude-main/Codex-reviewer default). Later slices (0027_02/03/04) consume this distinction when
they generalize the reviewer gate and the implementer path; this slice only names it.

## Default-preservation invariant

When `roles.main` resolves to the default `claude`, every existing ptp flow remains
**byte-identical** to its behavior before this change: Claude is the main planning/implementation
agent working in-session and Codex is the gated reviewer. This slice modifies no orchestrator,
reviewer, implementer, `ptp-run-at-model`, `ptp-codex-mode`, or apply/effort file — it is
deliberately inert at the default value.

## Summary of the contract

- Resolve `roles.main` from layered config, merged as `ptp-workspace` defines; never crash or STOP
  on a typo or out-of-enum value.
- If — and only if — the layered read leaves `roles.main` unset, fall back to the opt-in
  `PTP_MAIN_AGENT` env var (exact `claude`/`codex`); any other/absent value falls through.
- Ultimate fallback (no config, no valid env var): `claude`.
- Explicit config always overrides detection; detection only fills an unset key and stores
  nothing.
- No fake signal: never treats `codex` on PATH or process ancestry as a main-agent signal.
- Expose the derived pair `{ main, reviewer }`; only `main` is stored, `reviewer` is always
  `¬main`.
- Resolves independently of `codex.mode` / `codex.model` / `codex.reasoningEffort`.
- The Claude Code session is always the outer harness; `roles.main=codex` designates which agent
  runs the heavy work, not which CLI the user launched — genuine CLI-driver detection is
  impossible here, which is why `PTP_MAIN_AGENT` is opt-in/best-effort rather than detection.
- Default (`claude`, no config, no env var) preserves all existing behavior; this skill defines
  the contract only — no consumer wiring in this slice.
