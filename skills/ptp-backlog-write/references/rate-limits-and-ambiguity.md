> Loaded from skills/ptp-backlog-write/SKILL.md when: handling a rate limit or a timed-out call.
## Rate limits, timeouts, and the ambiguity rule

One operation is now **O(fields)** calls instead of one write, so transport failure stops being rare.

- **Retry only what is unambiguously pre-application** — a rate-limit response that performed no
  mutation, a connection refused, a DNS failure — with **bounded** attempts and backoff.
- **Never retry an ambiguous outcome** — a timeout, a 5xx, a connection closed mid-request. Resolve it
  by **re-reading the single field** and comparing to the intended value: present →
  `landed (verified by re-read)`; absent → `failed`, and the operation **halts**.
- **Ambiguity is resolved by re-read, never by retry.** For a **field** write this is **exact so long as
  the field can be read** — the very constraint that makes this store awkward is what makes verification
  precise. Stated at dispatch granularity: a dispatch sets every field of every carrier it carries, so
  verification re-reads **each** of that dispatch's planned fields before settling their rows.
- **A mixed verification is not a split landing, and is never recorded as one.** Where that re-read
  finds **some** of one dispatch's planned fields at their intended values and **others** not, the
  honest reading is **not** that the write landed in part — a carrier write is all-or-nothing, so a
  split through it stays unreachable — but that **the carrier has changed under the operation** since
  the write, which the check-to-write and write-to-verify windows both permit and neither closes. So
  **every** planned row of that dispatch is settled **together** as **`unresolved`** — whether the write
  landed can no longer be established from the carrier's current contents — the operation **halts**, and
  the report names the **mixed observation field by field** and directs **inspection**, while claiming
  **neither** that the write landed nor that it did not. Settling the matching rows `landed` and the
  others `failed` is **forbidden**: it would assert a split the store cannot produce, and it would make
  *rows sharing a dispatch share that write's outcome* false exactly where it is load-bearing.
- **The mixed-verification rule is UNCHANGED by the per-content-type routes, and its re-read now has a
  readable surface on all three of them.** The compose read returns a **title and a body for every
  content type**, so the verification re-read of a content mutation's planned fields is the **same**
  re-read it already was on a draft — the rule reaches the new route **unchanged** rather than by
  extension, and nothing about it is weakened, narrowed or made content-type-conditional.
- **When the verification read itself cannot be completed within its bounded budget, the row is
  `unresolved`** — the honest floor — and the operation halts. For a **payload** row the verdict is
  `uncommitted-partial`; for the **commit** row it is `unresolved-commit`.
- **Cost is reported, not capped.** The report states the **number of calls dispatched**, and **no
  ceiling refusal is added**, because a cap would make a legitimate large operation impossible with no
  safe alternative.

The transport mechanics are **`ptp-github-projects-gh`'s**. What this section fixes is **which classes
are retryable**, and nothing else about transport.

---

# Creation: the ambiguous-create scan and the orphan refusal
