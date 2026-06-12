---
name: ptp-model-effort-check
description: Use this skill to check whether the current session model is Sonnet and effort is medium before or after key ptp commands. If the settings differ from the recommended baseline, it prompts the user to switch or continue.
---

# ptp-model-effort-check

## Purpose

Ship and archive commands should run at a predictable quality/cost baseline. This skill checks the
current session's **model** and **effort** level against the recommended defaults (**Sonnet** /
**medium**) and, when they differ, prompts the user with a clear choice before proceeding.

The check is **soft** — the user always has the option to continue with their current settings.

## How to determine the current model and effort

**Model**: Read the system prompt. Look for the phrase "You are powered by the model named" — the
word immediately after is the model family (e.g. "Sonnet", "Opus", "Haiku"). Extract it.

**Effort level**: Look in the recent conversation context and system reminders for a phrase like
"Set effort level to [level]" or "effort level … [level]". Extract the level token (e.g. "low",
"medium", "high", "xhigh"). If no effort system message is visible, treat the effort as unknown.

## Decision logic

After extracting the model family and effort level:

1. **Both match the baseline** (`model` contains "sonnet" case-insensitively AND `effort` == `"medium"`):
   — **No-op.** Do not prompt the user. Proceed immediately to the next step of the calling command.

2. **One or both differ** (model is Opus, Haiku, or unknown; OR effort is not medium):
   — Use `AskUserQuestion` with the question, header, and options below, substituting the actual
     current values into the label and description.

## AskUserQuestion spec

```
question: "Current session: model=[ACTUAL_MODEL], effort=[ACTUAL_EFFORT]. The recommended baseline for ship/archive commands is Sonnet / medium. Switch before continuing?"
header: "Model/effort"
options:
  - label: "Switch to Sonnet / medium (Recommended)"
    description: "Run /model sonnet then /effort medium, then re-run this command."
  - label: "Continue with current ([ACTUAL_MODEL] / [ACTUAL_EFFORT])"
    description: "Proceed with the current settings. Costs and quality may differ from the baseline."
```

Replace `[ACTUAL_MODEL]` and `[ACTUAL_EFFORT]` with the values you read from context (use
`"unknown"` if a value could not be determined).

## After AskUserQuestion

- **User selects "Switch"**: output the instructions below and **STOP** — do not proceed with the
  calling command. The user runs the switch commands and re-invokes the ptp command themselves.

  > To switch: run `/model sonnet`, then `/effort medium`, then re-run this command.

- **User selects "Continue with current"** (or "Other" with any text): **proceed immediately** to
  the next step of the calling command. Do not prompt again.

## Hard rules

- This skill **never blocks unconditionally** — the user can always proceed with their current settings.
- **Do not run this check more than once** per command invocation. If the model/effort gate was
  already answered (user chose "continue"), do not re-ask.
- **Never suggest stopping for a model switch when the settings already match** (sonnet / medium).
  Silence is the correct behavior when the baseline is met.
- Replace placeholder tokens (`[ACTUAL_MODEL]`, `[ACTUAL_EFFORT]`) with the real values before
  calling `AskUserQuestion`. Never display placeholder text literally.
