> Loaded from skills/ptp-telemetry/SKILL.md when: emitting the report data-quality footer.
## 19. The data-quality footer — mandatory, never suppressed

**Every report ends with this footer, and it is never omitted, shortened, or suppressed** — not on an
empty store, not on a clean store, not when every item is nil. **Every item below appears in the
footer itself**, whether or not the section it came from also mentions it, so **a reader who reads
only the footer still sees every caveat**.

**Why it is non-negotiable:** a report that silently hides a broken join converts *"I have no data"*
into *"I have wrong conclusions"* — which is **worse than no report at all**. Every number in the
body is only as trustworthy as the footer says it is.

`§19.1`–`§19.5` moved to **`skills/ptp-telemetry-report/SKILL.md`** under those same numbers, taking the anchor id `report-footer-items` with it; the obligation above is substrate and stays here.

<!-- ptp-telemetry:anchor id=report-write-posture-stub class=substrate -->