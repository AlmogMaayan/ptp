# ptp-writing-plans — pressure tests

Maintenance-only fixtures for `SKILL.md`. Not loaded at runtime. Each scenario is graded by a
reviewer against an agent's transcript for the prose, and by an automated structural check for the
six-label shape (see `design.md` §4/§5).

### PT-W1 — Plan verbosity

- **Failure mode:** Plan verbosity — pastes full implementation code into the checkboxes.
- **Setup:** A decided change needs a new `parseCapsule(path)` function in
  `scripts/lib/capsule.js`; the design capsule already states its exact signature and return shape.
- **Prompt:** Run `ptp-writing-plans` against that change, writing
  `openspec/changes/<id>/tasks.md`.
- **Required behavior:** The checkbox names the file, the function, and the observable outcome
  ("returns `{decision, alternatives, assumptions}`"), with a `verify:` command — no function body
  or code block is pasted into the task text.
- **Failing behavior:** The checkbox contains a fenced code block with the full function
  implementation, or several lines of pasted JavaScript.
- **Observable check:** No checkbox body contains a fenced code block (` ``` ` or ` ```` `) other
  than the `verify:` command itself, and no checkbox exceeds a few lines of prose before its
  `verify:` line.

### PT-W2 — Microsteps

- **Failure mode:** Microsteps — expands one deliverable into 2-5 minute steps and a commit task.
- **Setup:** A decided change needs one new test and one new function to make it pass, in the same
  file pair.
- **Prompt:** Run `ptp-writing-plans` against that change.
- **Required behavior:** One checkbox covers writing the test, the implementation, and its
  verification together; no separate "write the test" / "run the test" / "commit" boxes exist.
- **Failing behavior:** The plan has four checkboxes for one deliverable: write test, run test (red),
  implement, run test (green), plus a fifth `git commit` box.
- **Observable check:** No checkbox text matches `git add`, `git commit`, or `git push`
  (case-insensitive), and the plan has no adjacent pair of checkboxes whose file targets are
  identical and whose combined scope is a single deliverable split across steps.

### PT-W3 — Rationale duplication

- **Failure mode:** Rationale duplication — restates spec and design reasoning inside tasks.
- **Setup:** `design.md` for the change already carries two paragraphs explaining why a retry count
  of 3 was chosen.
- **Prompt:** Run `ptp-writing-plans` against that change.
- **Required behavior:** The checkbox that implements the retry references `design.md` by name for
  the reasoning and states only the action, file, and outcome.
- **Failing behavior:** The checkbox re-explains why 3 retries with exponential backoff was chosen,
  duplicating the design paragraph inside `tasks.md`.
- **Observable check:** No checkbox body exceeds roughly three sentences of prose before its
  `verify:` line, and no checkbox reproduces a sentence of 8 or more consecutive words found
  verbatim in `design.md` or the spec deltas, unless those words are a literal the requirement
  needs byte-for-byte (a flag, a string, a path).

### PT-W4 — Unverifiable task

- **Failure mode:** Unverifiable task — writes a checkbox only a human could complete or confirm.
- **Setup:** A decided change touches a UI flow with no automated browser check available in the
  repository.
- **Prompt:** Run `ptp-writing-plans` against that change.
- **Required behavior:** The checkbox's `verify:` names an automated check the implementing agent can
  run itself (a test, a command plus an assertion, a file-content assertion, or
  `npx -y openspec validate <change-id> --strict`); when no automated check is possible, the task is
  reshaped, substituted, or relocated per `tasks-authoring`, never left as a manual confirmation.
- **Failing behavior:** A checkbox ends with "verify: manually confirm the button works" or
  "verify: ask the user to check."
- **Observable check:** Every `verify:` line names a command, a test invocation, a file-content
  assertion, an automated browser check, or an `openspec validate` call — no `verify:` line contains
  `manually`, `ask the user`, or `confirm visually`.

### PT-W5 — Ordering

- **Failure mode:** Ordering — places a checkbox before the checkbox that creates the file it edits.
- **Setup:** A decided change creates `skills/example/SKILL.md` in one checkbox and then edits that
  same file's frontmatter in another.
- **Prompt:** Run `ptp-writing-plans` against that change.
- **Required behavior:** The creation checkbox is numbered before the edit checkbox, so every
  checkbox relies only on checkboxes above it.
- **Failing behavior:** The edit checkbox (e.g. 1.1) is numbered before the creation checkbox (e.g.
  1.2), so running the plan in order fails at the edit step.
- **Observable check:** For every checkbox that edits a path also created by another checkbox in the
  same plan, the creating checkbox's number sorts before the editing checkbox's number.
