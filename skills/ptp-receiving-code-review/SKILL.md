---
name: ptp-receiving-code-review
description: Use when judging review findings before changing anything in response.
---

# Receiving a code review

Judge every finding record — the finding record `ptp-requesting-code-review` emits — against the
repository's current content before touching anything. Fix only what is confirmed.

## Rules

- RCV-1 Read the current content at the cited location before forming any verdict.
- RCV-2 The verdict vocabulary is exactly `CONFIRMED` and `REJECTED`, and every rejection carries a
  reason.
- RCV-3 Reject a false positive — the cited content is already correct, or the reviewer misread
  intent or convention — with a reason naming what was checked.
- RCV-4 Reject a stale finding — the cited location no longer holds the cited content, having been
  fixed or moved already — with the reason `stale`.
- RCV-5 A finding that cannot be verified is `REJECTED` with the reason `unverifiable: <what could
  not be checked>`. Never pause for a human partner on a finding, and never confirm on assumption.
- RCV-6 Fix only `CONFIRMED` findings, minimally, at the cited location, one finding at a time.
- RCV-7 After fixing, re-run the verification relevant to what changed and report its command and
  result — the per-kind verification step itself stays owned by `review-loop`.
- RCV-8 No performative agreement, praise, or gratitude. State the verdict, a rejection's required
  reason, and the change — nothing else.
- RCV-9 Reject a request for unused capability with the reason `yagni: <evidence that nothing uses
  it>`.
- RCV-10 Never edit on account of a finding that was not confirmed, and never carry a rejected
  finding's reason forward as if it were confirmed — the rejection carry-over set stays owned by
  `review-loop`.
