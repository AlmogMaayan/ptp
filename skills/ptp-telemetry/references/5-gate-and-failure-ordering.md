> Loaded from skills/ptp-telemetry/SKILL.md when: deciding whether telemetry is enabled before any write.
## 5. Gate and failure ordering

Every write point applies this ordering, identically:

1. **Resolve `telemetry.mode`** (§1, forgiving).
2. **If it is not `on` → abandon the telemetry path immediately and let the observed command
   continue unchanged.** "Return" here means returning from *this telemetry write*, never from the
   observed ptp command, skill, or step — telemetry never decides whether observed work runs. No
   directory creation, no file touch, no output, no
   change to any prompt, argument, or command line. (The layered config read is itself a filesystem
   read; it is the only one the off path performs.)
3. **Resolve `telemetry.root`** (§1, §1.1, forgiving and layered exactly like the mode).
4. **Resolve the epic** per `skills/ptp-change-selector/SKILL.md` §1. Unresolvable → `_unattributed/`.
5. **Create directories lazily**, create the store root's `.gitignore` / `.gitattributes` if absent
   (§2.1), then **append the line**.
6. **Any error at any step is swallowed** and the observed ptp command proceeds unchanged.

**Hard rule: telemetry never blocks, never retries in a way that stalls the pipeline, never alters a
terminal state, and is never a precondition of any ptp step.** An observability feature that can fail
a pipeline is worse than no observability feature.

The rule has exactly **two** halves, and they are not the same rule:

- **Telemetry *writes* — every one of them, ledger and span alike — are silent and non-delaying.**
  Any error is swallowed; nothing is emitted; the observed command's output is byte-identical to
  telemetry-off; nothing waits past the write itself.
- **The lifecycle preflight — the §15 auto-start preamble, and nothing else — MAY additionally emit
  at most ONE non-blocking advisory line** for a condition the user can act on (no telemetry
  environment, a port conflict, a failed auto-start) **and MAY consume the single bounded readiness
  window of §15.4**. Terminal state, ordering, and every other output line stay identical to
  telemetry-off.

That second half is the one narrowing `0032_02_otel-sink-and-csv` adds, folded in here rather than
stated as a second, competing rule elsewhere. No artifact may claim byte-identical output in a case
where that advisory is emitted; with `telemetry.mode` not `on` the advisory can never fire, so the
byte-identical claim holds unconditionally there.

**The one permitted variation** is a writer that cannot read the configuration on its own behalf: a
spawned `ptp-full-apply` agent treats **possession of an injected `run_id`** as its **delegated**
mode gate, because the workflow mints and injects one **only** when the launching skill had already
resolved the mode to `on`. An agent handed no `run_id` writes nothing. Steps 3–6 apply to it
unchanged.

---

<!-- ptp-telemetry:anchor id=write-points class=substrate -->