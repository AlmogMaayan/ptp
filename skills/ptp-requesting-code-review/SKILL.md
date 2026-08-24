---
name: ptp-requesting-code-review
description: Use when conducting a code or artifact review pass and emitting findings.
---

# Requesting a code review

A review pass over a supplied contract and diff. Assess contract compliance first, quality second.
Emit findings only, in the record shape below, and stop.

## Finding record

One block per finding, no prose around it:

```
key:      <computed per review-loop's stable key schema for the review kind in play>
severity: Critical | High | Medium | Low
location: <repo-relative/forward/slash/path>:<first-cited-line>, or for an artifact
          <basename> plus its nearest enclosing ##/### heading
defect:   <one sentence, at most 60 characters when used as the key summary>
evidence: <quoted current content at that location>
remedy:   <the concrete edit, or a named manual check / new test, that resolves it>
```

## Rules

- RCR-1 Assess contract compliance first — whether the work matches `proposal.md`, `design.md`,
  `tasks.md`, and the spec deltas — and code quality second. A quality finding never displaces an
  unreported contract violation.
- RCR-2 Emit findings only. No strengths section, no summary essay, no restatement of the rubric or
  of the contract being reviewed.
- RCR-3 Every finding carries exactly the six fields above and nothing else — no extra narrative
  fields.
- RCR-4 Key material: a code finding cites a repo-relative forward-slash path and the first relevant
  line; an artifact finding cites the basename and the nearest enclosing `##`/`###` heading; `defect`
  is at most 60 characters. The `key` is filled by applying the stable key computation that
  `review-loop` owns; this skill defines no key schema of its own.
- RCR-5 Severity is one of exactly `Critical`, `High`, `Medium`, `Low`, the four labels
  `review-severity` owns. An unlabeled severity's fail-safe treatment belongs to `review-severity`,
  not to this skill. Emit every finding at its true severity; never withhold one as too minor — the
  in-scope / below-threshold partition is the consumer's.
- RCR-6 `evidence` quotes the file's current content at the cited location. A finding without such
  evidence is not emitted.
- RCR-7 `remedy` names a concrete resolution — normally a concrete edit. Where the resolution is
  genuinely a manual check or a new test rather than an edit, say exactly that instead of inventing
  an edit, so `review-loop`'s manual-check / tests-required filter can act on it.
- RCR-8 Review only the supplied contract and diff — never session history, never a conversation
  transcript. Dispatch nothing; model and effort selection belong to the orchestrating skills.
