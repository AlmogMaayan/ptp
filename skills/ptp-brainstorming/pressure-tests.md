# ptp-brainstorming — pressure tests

Maintenance-only fixtures for `SKILL.md`. Not loaded at runtime. Each scenario is graded by a
reviewer against an agent's transcript for the prose, and by an automated structural check for the
six-label shape (see `design.md` §4/§5).

### PT-B1 — Autonomous stall on ambiguity

- **Failure mode:** Planning ambiguity, autonomous mode — stalls or asks instead of assuming and
  recording.
- **Setup:** Change request: "add a retry to the telemetry sink write path"
  (`scripts/ptp-otel-sink.js`'s `writeBatch` is the sink's write path; no retry count is stated
  anywhere in the repository).
- **Prompt:** Run `ptp-brainstorming` with `mode: autonomous` against that request, writing the
  capsule to `openspec/changes/0057_08_ptp-brainstorming-and-writing-plans-skills/brainstorm.md`.
- **Required behavior:** Pick a reasonable retry count (e.g. 3, exponential backoff) after
  inspecting the sink code, record it under `## Assumptions` with the file cited as evidence, and
  finish the capsule without pausing.
- **Failing behavior:** The agent asks "how many retries do you want?" or leaves the capsule
  half-written pending an answer.
- **Observable check:** `brainstorm.md` exists, contains a `## Assumptions` section naming the retry
  count and a cited path, and the transcript shows no user-question tool call (e.g. `AskUserQuestion`)
  and no pause awaiting a user answer, for either a Claude or a Codex role.

### PT-B2 — Interactive over-asking

- **Failure mode:** Planning ambiguity, interactive mode — asks what the repository already answers.
- **Setup:** Change request: "which package manager does this repo use for skill checks?" — the
  answer (`node`, no `package.json` script runner) is directly readable from `tasks.md`'s own
  `verify:` commands in this change.
- **Prompt:** Run `ptp-brainstorming` with `mode: interactive` against that request.
- **Required behavior:** Answer from inspection without asking; a question is permitted only when
  its answers would change the decision, scope, or a contract.
- **Failing behavior:** The agent asks the user which package manager or runner to assume, despite
  the repository already settling it.
- **Observable check:** The transcript contains no question whose answer is derivable from a file the
  agent already had open, and the capsule cites the file it read instead.

### PT-B3 — Artificial alternatives

- **Failure mode:** Artificial alternatives — invents a second option to reach a count.
- **Setup:** Change request: "write the pressure-tests fixture format for `ptp-writing-plans`" —
  `design.md` §4 already fixes the six-label shape as the only viable format given the existing
  automated structural check.
- **Prompt:** Run `ptp-brainstorming` against that request.
- **Required behavior:** Record "Only one viable direction — <reason>" in `## Alternatives` rather
  than padding the list with a rejected format nobody would choose.
- **Failing behavior:** The capsule lists two or three fixture formats, one of them contrived solely
  to hit a "propose options" habit.
- **Observable check:** `## Alternatives` in the capsule contains either the single-viable-direction
  line or only options that differ in observable behavior, contract, risk, or blast radius — no
  option exists purely to pad a count.

### PT-B4 — Ceremony

- **Failure mode:** Ceremony — writes a `docs/plans` copy, commits, or opens an approval gate.
- **Setup:** Any change request run under `mode: autonomous`.
- **Prompt:** Run `ptp-brainstorming` end to end and inspect the working tree and shell history
  afterward.
- **Required behavior:** Exactly one file is written, at the caller-named path; no `docs/plans` or
  other documentation-folder copy exists; no `git commit`, `git add`, or other git command runs; no
  approval wait blocks completion.
- **Failing behavior:** A second copy appears under `docs/plans/` or any other documentation folder, or the
  agent runs `git commit`, or the agent pauses for a `<HARD-GATE>`-style approval.
- **Observable check:** `find . -path ./node_modules -prune -o -name '*.md' -newer <run-start> -print`
  lists exactly the one capsule path, and the shell history for the run contains no `git commit` or
  `git add` invocation.

### PT-B5 — History

- **Failure mode:** History — a re-run appends an amendment instead of replacing the capsule.
- **Setup:** A capsule already exists at
  `openspec/changes/0057_08_ptp-brainstorming-and-writing-plans-skills/brainstorm.md` from a prior
  run; the change request is re-run with new information.
- **Prompt:** Run `ptp-brainstorming` a second time against the same target path with an updated
  request.
- **Required behavior:** The capsule file is fully replaced — one `## Decision`, one
  `## Alternatives`, one `## Assumptions` section reflecting only the current run.
- **Failing behavior:** The file grows a second `## Decision` section, a "Revision history" heading,
  or a pasted copy of the previous run's content above the new one.
- **Observable check:** The post-run capsule contains exactly one `## Decision` heading and exactly
  one `## Assumptions` heading, and no heading or text matching `history`, `revision`, or `previous`
  (case-insensitive) appears anywhere in the file.
