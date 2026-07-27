export const meta = {
  name: 'ptp-full-apply',
  description: 'Sequential apply→review-full per story; each apply agent runs at its effort.md model',
  phases: [
    { title: 'Apply' },
    { title: 'Review' },
  ],
}

// effort token → a deliberation directive injected into the apply agent prompt
// (the Workflow agent() API has no effort parameter; this is how effort is honored)
function effortDirective(effort) {
  switch (effort) {
    case 'xhigh': return 'reason explicitly about invariants, edge cases, and failure modes before every edit; prefer correctness over speed.'
    case 'high':  return 'think carefully about interactions and edge cases before each edit.'
    case 'medium':return 'apply normal care; verify each task before moving on.'
    case 'low':   return 'move directly on the obvious implementation.'
    default:      return 'think carefully about interactions and edge cases before each edit.'
  }
}

// One informational line for a story/agent whose fast-mode posture was requested for this run.
// Fast mode is a session-level Claude Code setting this run does not control — it changes
// neither the model passed to agent() nor the effort directive above. Mention it in `notes`
// only if relevant.
function fastNote() {
  return 'Fast mode was requested for this run (a session-level Claude Code setting this run does not control); it changes neither your model nor the effort directive above — mention it in `notes` only if relevant.'
}

// --- Telemetry measurement (gated from OUTSIDE by args.telemetry) -----------------------------
//
// Why this script never writes the run ledger itself: the sandbox injects only agent(), log(),
// and args. There is no file-system access, no module loader, no way to launch an external
// command, and no host-runtime globals — so writing a file from here is not possible. It is also
// why the gate cannot live here: reading telemetry.mode would need the same missing access. The
// launching skill therefore resolves the mode and passes a top-level boolean, and this script only
// MEASURES each agent() window and mints its run id. skills/ptp-full-apply/SKILL.md (which has
// Bash) appends the ledger rows once this script returns; see skills/ptp-telemetry/SKILL.md for
// the record shape, the run-id rule, and the append protocol.

// ISO-8601 UTC with milliseconds, the ledger's timestamp format.
function nowIso() {
  return new Date().toISOString()
}

// Mint a run id ONCE, at the moment t_start is captured, then propagate it to both writers of the
// same run (the spawned agent via its prompt, the launching skill via the returned timing entry).
// A second writer must never re-derive it — see skills/ptp-telemetry/SKILL.md. The scheme is free;
// this one is the legible default join plus a short random suffix (no session id is visible here),
// and it is line-safe: no CR, LF, comma, or double quote.
function mintRunId(label, tStart) {
  return label + '|' + tStart + '|' + Math.random().toString(36).slice(2, 10)
}

// One line appended to a spawned agent's prompt, handing it the minted id. Emitted ONLY on the
// gated-on path, so the off-path prompt strings stay byte-identical to their pre-change form.
function telemetryNote(runId) {
  return 'Telemetry run id: `' + runId + '`. If you append a telemetry ledger line, use exactly this run_id — never mint your own — and follow the `ptp-telemetry` skill (one open line only; no close line, no CSV row; fire-and-forget, never altering your terminal state).'
}

const APPLY_SCHEMA = {
  type: 'object',
  properties: {
    stageReached: { type: 'string', enum: ['completed', 'blocked', 'failed'] },
    tasksChecked: { type: 'integer' },
    tasksTotal: { type: 'integer' },
    validationPassed: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['stageReached'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    // Machine enum values are load-bearing: workflows/gates key on terminalState.
    // These values (and the BOTH_PHASES_DONE gate below) are intentionally unchanged.
    terminalState: { type: 'string', enum: ['BOTH_PHASES_DONE', 'PHASE1_CAP', 'PHASE2_CAP'] },
    // Internal telemetry only (not read by the gate). These are the fix counts the
    // ptp-review agent (agents/ptp-review.md) actually returns; keep the names matching
    // that producer's contract. The fields are agent-named, not phase-named:
    // superpowersFixes = the Superpowers reviewer's fix count and codexFixes = the Codex
    // reviewer's fix count, regardless of which phase each ran in (at the default
    // roles.main=claude, Superpowers is Phase 1 and Codex is Phase 2).
    superpowersFixes: { type: 'integer' },
    codexFixes: { type: 'integer' },
    openFindings: { type: 'integer' },
    notes: { type: 'string' },
  },
  required: ['terminalState'],
}

// args may arrive as an object or, in some runtimes, as the verbatim JSON string.
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const stories = (parsedArgs && parsedArgs.stories) || []
// Strict boolean identity: anything other than boolean `true` (including absent, undefined,
// null, or a non-boolean value) means fast mode was not requested, preserving byte-identical
// pre-change prompts for every launch that omits `fast`.
const fast = (parsedArgs && parsedArgs.fast) === true
// Same strict boolean identity as `fast`: the launching skill adds `telemetry: true` ONLY when it
// resolved telemetry.mode to `on`, and omits the property entirely otherwise — so an absent,
// undefined, null, or non-boolean value means telemetry is off and this script captures no
// timestamp, mints and injects no run id, and emits no `timings` property.
const telemetry = (parsedArgs && parsedArgs.telemetry) === true
const results = []
let halted = null

for (let i = 0; i < stories.length; i++) {
  const s = stories[i]
  const eff = s.effort || 'high'
  const mdl = s.model || 'opus'
  log(`Story ${i + 1}/${stories.length}: ${s.id} — apply at ${mdl}.${eff}${fast ? ' (fast requested)' : ''}`)

  const applyLabel = `apply:${s.id}`
  const applyStart = telemetry ? nowIso() : null
  const applyRunId = telemetry ? mintRunId(applyLabel, applyStart) : null

  const applyPrompt = [
    `Implement the OpenSpec change \`${s.id}\` end-to-end, following the apply protocol in your system prompt.`,
    `Change folder: openspec/changes/${s.id}/`,
    `Work at **${eff}** effort: ${effortDirective(eff)}`,
    `After verifying each task, immediately edit tasks.md to mark it [x] — do this per task as you go, not in a batch at the end. Before returning, re-read tasks.md and confirm every task is [x].`,
    `Do NOT archive. Do NOT commit. Do NOT git add. Return the JSON object when all tasks are [x] and final verification passes.`,
    ...(fast && mdl === 'opus' ? [fastNote()] : []),
    ...(telemetry ? [telemetryNote(applyRunId)] : []),
  ].join('\n\n')

  const apply = await agent(applyPrompt, {
    agentType: 'ptp:ptp-apply',
    model: mdl,
    phase: 'Apply',
    label: applyLabel,
    schema: APPLY_SCHEMA,
  })

  const applyEnd = telemetry ? nowIso() : null
  const applyTiming = telemetry
    ? { run_id: applyRunId, t_start: applyStart, t_end: applyEnd, agent_label: applyLabel }
    : null

  if (!apply || apply.stageReached !== 'completed') {
    // The halted story keeps its apply timing entry — that window is exactly the one worth
    // inspecting.
    const haltedRecord = { id: s.id, applyOk: false, apply: apply || null, review: null }
    if (telemetry) haltedRecord.timings = [applyTiming]
    results.push(haltedRecord)
    halted = { id: s.id, reason: `apply did not complete (stageReached=${apply ? apply.stageReached : 'null'})` }
    break
  }

  const reviewLabel = `review:${s.id}`
  const reviewStart = telemetry ? nowIso() : null
  const reviewRunId = telemetry ? mintRunId(reviewLabel, reviewStart) : null

  const reviewPrompt = [
    `Run the review-full protocol (the main-agent loop then the reviewer-agent loop; at the default roles.main=claude this is the Superpowers loop then the Codex loop) on the OpenSpec change \`${s.id}\`, per your system prompt.`,
    `Change folder: openspec/changes/${s.id}/`,
    `Work at **high** effort. Fix only confirmed findings inline. Do NOT commit. Do NOT archive.`,
    `Return the JSON object.`,
    ...(fast ? [fastNote()] : []),
    ...(telemetry ? [telemetryNote(reviewRunId)] : []),
  ].join('\n\n')

  const review = await agent(reviewPrompt, {
    agentType: 'ptp:ptp-review',
    model: 'opus',
    phase: 'Review',
    label: reviewLabel,
    schema: REVIEW_SCHEMA,
  })

  const reviewEnd = telemetry ? nowIso() : null

  const storyRecord = { id: s.id, applyOk: true, apply, review: review || null }
  // One timing entry per agent() call, in call order, so a story that ran two agents surfaces two
  // windows rather than one ambiguous pair.
  if (telemetry) {
    storyRecord.timings = [
      applyTiming,
      { run_id: reviewRunId, t_start: reviewStart, t_end: reviewEnd, agent_label: reviewLabel },
    ]
  }
  results.push(storyRecord)

  if (!review || review.terminalState !== 'BOTH_PHASES_DONE') {
    halted = { id: s.id, reason: `review did not converge (terminalState=${review ? review.terminalState : 'null'})` }
    break
  }
}

return { results, halted, total: stories.length }
