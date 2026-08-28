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

// Parse a review agent's `{model}.{effort}` fix target into its two halves, or null when it is
// absent, not a string, or not exactly two dot-joined tokens drawn from the closed vocabularies.
// The vocabularies are passed in from the call site (REVIEW_MODELS / REVIEW_EFFORTS) rather than
// restated here, so this script carries exactly one copy of each.
function parseFixTarget(raw, models, efforts) {
  if (typeof raw !== 'string') return null
  const parts = raw.trim().toLowerCase().split('.')
  if (parts.length !== 2) return null
  if (models.indexOf(parts[0]) < 0 || efforts.indexOf(parts[1]) < 0) return null
  return { model: parts[0], effort: parts[1] }
}

// The review result's fix counts, read per ROLE and never per pair.
//
// The role-named fields (mainFixes / reviewerFixes) are preferred; a result written before the
// rename carries the agent-named superpowersFixes / codexFixes instead, and each role falls back
// to ITS OWN legacy field independently — so a mixed result such as { mainFixes, codexFixes } is
// read correctly rather than treated as wholly legacy or wholly new. A role resolved through its
// legacy field implies its agent under the default roles.main=claude pairing (main=claude,
// reviewer=codex); that agent is an INFERENCE, not a record — the agent-named fields did not
// predate roles.main — so it is flagged agentInferred and must never be presented as evidence of
// which agent actually ran. The counts themselves are exact either way. A role carrying neither
// field is reported as the string "unknown": no absent value is ever substituted by 0.
function readReviewFixCounts(review) {
  const r = review || {}
  const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const role = (fresh, legacy, inferredAgent, agentField) => {
    const own = int(r[fresh])
    const recordedAgent = typeof r[agentField] === 'string' && r[agentField] !== '' ? r[agentField] : null
    if (own !== null) {
      return { count: own, agent: recordedAgent, agentInferred: false }
    }
    const old = int(r[legacy])
    if (old !== null) {
      return recordedAgent
        ? { count: old, agent: recordedAgent, agentInferred: false }
        : { count: old, agent: inferredAgent, agentInferred: true }
    }
    return { count: 'unknown', agent: recordedAgent, agentInferred: false }
  }
  return {
    main: role('mainFixes', 'superpowersFixes', 'claude', 'mainAgent'),
    reviewer: role('reviewerFixes', 'codexFixes', 'codex', 'reviewerAgent'),
  }
}

// The review result's reviewer-keyed review-cycle tally, carried through verbatim.
//
// Mirrors readReviewFixCounts's absent-is-"unknown" discipline: a `null` review result (which this
// script already tolerates) or a result carrying no usable `reviewTally` yields the STRING
// "unknown", never `{}` and never a zero-filled tally — a fabricated measurement is worse than an
// admitted gap. Nothing here re-derives, clamps, sums, or reshapes the object: the review agent
// aggregated it, and the launching skill renders it. This sandbox has no file access, so the
// returned value is the only in-run source; the on-disk stages/code.json fallback belongs to
// skills/ptp-full-apply/SKILL.md, which holds Bash. Arrays are rejected alongside null because a
// tally is a reviewer-keyed map, not a list.
function readReviewTally(review) {
  const t = review && review.reviewTally
  if (t === null || typeof t !== 'object' || Array.isArray(t)) return 'unknown'
  // A tally with no reviewer key at all is no tally: passing `{}` on would render as the shared
  // format's empty-reviewer-set case and falsely assert that the run was configured with no
  // reviewer, so it resolves to "unknown" like any other absent value.
  if (Object.keys(t).length === 0) return 'unknown'
  return t
}

// The review agent's prompt, used for BOTH the first review spawn and the (at most one) escalated
// re-spawn — the escalated run gets the identical protocol with the target's model/effort
// substituted plus one extra directive line. The running model is stated explicitly because an
// agent cannot otherwise know it, and the ladder comparison in agents/ptp-review.md depends on it.
function reviewPromptLines(id, model, effort, escalated) {
  return [
    `Run the review-full protocol (the main-agent loop then the reviewer-agent loop; at the default roles.main=claude this is the Claude loop then the Codex loop) on the OpenSpec change \`${id}\`, per your system prompt.`,
    `Change folder: ${changeFolderPrefix}openspec/changes/${id}/`,
    ...(workspaceRoot ? [`Workspace root: ${workspaceRoot} — every openspec path in this prompt is relative to it, and an openspec CLI call runs as cd <that root> && npx -y openspec … in one shell invocation. Take it verbatim and resolve no root of your own.`] : []),
    `You are running at model \`${model}\`.`,
    `Work at **${effort}** effort: ${effortDirective(effort)} Fix only confirmed findings inline. Do NOT commit. Do NOT archive.`,
    ...(escalated
      ? [`This is the escalated fix run for this story. Run the whole protocol from a fresh review pass at this model. You MUST NOT return \`FIX_TARGET_ESCALATION\`; if your fix-target evaluation names a still-more-capable model, note it and fix at this model anyway.`]
      : []),
    `Return the JSON object.`,
  ]
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
    // The first three values (and the BOTH_PHASES_DONE gate below) are intentionally unchanged.
    // FIX_TARGET_ESCALATION is a DISPATCH signal, not an outcome: the review agent returns it,
    // having made no edit, when its freshly evaluated fix target names a model more capable than
    // the one it is running on. It is consumed by the escalation block below — BEFORE the gate —
    // and is never gate-success. terminalState remains the ONLY gate key and BOTH_PHASES_DONE the
    // ONLY gate-success value.
    terminalState: { type: 'string', enum: ['BOTH_PHASES_DONE', 'PHASE1_CAP', 'PHASE2_CAP', 'FIX_TARGET_ESCALATION'] },
    // Internal telemetry only (not read by the gate). These are the fix counts the
    // ptp-review agent (agents/ptp-review.md) actually returns; keep the names matching
    // that producer's contract. The counts are ROLE-named, not agent-named: mainFixes is the
    // main phase's confirmed fix count and reviewerFixes the reviewer phase's, in either
    // roles.main direction. Which AGENT filled each role is carried separately, by the optional
    // mainAgent/reviewerAgent strings ("claude" | "codex"), so the role/agent split is explicit
    // rather than implied by a field name. None of the four is required: a result predating the
    // rename carries superpowersFixes/codexFixes instead and is read by readReviewFixCounts().
    mainFixes: { type: 'integer' },
    reviewerFixes: { type: 'integer' },
    mainAgent: { type: 'string' },
    reviewerAgent: { type: 'string' },
    openFindings: { type: 'integer' },
    // The effective review.minSeverity floor the review actually ran at (lowercase canonical:
    // low | medium | high | critical). Reporting-only — no gate keys on it — so it is a plain
    // string rather than an enum: the load-bearing enum is terminalState, and a malformed value
    // here must never fail an otherwise converged story. Optional; absence reads as "low".
    minSeverity: { type: 'string' },
    // The fix target the review agent's fix-target evaluation produced, lowercase and dot-joined
    // (`{model}.{effort}`), and whether the fix work actually ran at it. Reporting plus the
    // escalation dispatch input — no gate keys on either. Both optional: an iteration with no fix
    // work to size omits both, and a degraded evaluation sets fixTargetHonored false and omits
    // fixTarget. See agents/ptp-review.md § Fix-target evaluation.
    fixTarget: { type: 'string' },
    fixTargetHonored: { type: 'boolean' },
    // The reviewer-keyed review-cycle tally the review agent returns (agents/ptp-review.md), so a
    // returned tally survives this structured-result boundary and reaches the launching skill.
    // OPTIONAL and deliberately absent from `required`: a review that could not produce a tally
    // omits it entirely rather than fabricating zeroes, and that must never fail an otherwise
    // converged story. Reporting only — no gate reads it; terminalState remains the ONLY gate key
    // and BOTH_PHASES_DONE its ONLY gate-success value. The object's field names and semantics are
    // owned upstream (the review-cycle-tally capability); this script neither validates nor
    // interprets them, it only carries the object through.
    reviewTally: { type: 'object' },
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
// The caller's ONE resolved workspace root (skills/ptp-workspace/SKILL.md), supplied by the two
// launching skills beside `stories`. Every openspec path a spawned agent reads is relative to it,
// and the agent is TOLD it rather than recovering it by stripping openspec/changes/<id>/ off the
// change-folder path, which is exactly the re-derivation that contract bans. A launch omitting it
// (a resume predating this field, or a hand-built call) keeps the pre-change bare relative path and
// emits no root line, so no prompt ever interpolates an absent value.
const workspaceRoot =
  parsedArgs && typeof parsedArgs.workspaceRoot === 'string' ? parsedArgs.workspaceRoot.trim() : ''
// The separator is appended only when the root does not already end in one, so no input ever
// yields a DOUBLED separator in the change-folder path: a root that is itself a filesystem root
// ('/') would otherwise produce '//openspec/…', which POSIX leaves implementation-defined and
// which MSYS/Cygwin reads as a UNC share name — a different path entirely. A backslash-terminated
// root is treated the same way rather than gaining a mixed '\/' seam.
const changeFolderPrefix = !workspaceRoot
  ? ''
  : /[\\/]$/.test(workspaceRoot)
    ? workspaceRoot
    : workspaceRoot + '/'
const results = []
let halted = null

for (let i = 0; i < stories.length; i++) {
  const s = stories[i]
  const eff = s.effort || 'high'
  const mdl = s.model || 'opus'
  // The review target is a per-story arg, not a literal. STRICT MEMBERSHIP, never `||`
  // truthiness: an absent, null, non-string, or unrecognized value falls back to `opus` / `high`
  // — exactly the constants this capability replaced — so a resume, a hand-built launch, or any
  // caller predating these fields spawns the review agent at the same model and renders the same
  // effort level as before. REVIEW_MODELS is also the escalation ladder, in ascending order of
  // capability (haiku < sonnet < opus).
  const REVIEW_MODELS = ['haiku', 'sonnet', 'opus']
  const REVIEW_EFFORTS = ['low', 'medium', 'high', 'xhigh']
  const revMdl = REVIEW_MODELS.indexOf(s.reviewModel) >= 0 ? s.reviewModel : 'opus'
  const revEff = REVIEW_EFFORTS.indexOf(s.reviewEffort) >= 0 ? s.reviewEffort : 'high'
  // Only a value that was actually SUPPLIED and then rejected is worth reporting; an omitted
  // field is the documented default path, not a fallback.
  const revFellBack = []
  if (s.reviewModel !== undefined && s.reviewModel !== null && s.reviewModel !== revMdl) revFellBack.push(`reviewModel=${JSON.stringify(s.reviewModel)}`)
  if (s.reviewEffort !== undefined && s.reviewEffort !== null && s.reviewEffort !== revEff) revFellBack.push(`reviewEffort=${JSON.stringify(s.reviewEffort)}`)
  log(`Story ${i + 1}/${stories.length}: ${s.id} — apply at ${mdl}.${eff}, review at ${revMdl}.${revEff}${revFellBack.length ? ` (unrecognized supplied ${revFellBack.join(', ')} — fell back to the default)` : ''}${fast ? ' (fast requested)' : ''}`)

  const applyLabel = `apply:${s.id}`
  const applyStart = telemetry ? nowIso() : null
  const applyRunId = telemetry ? mintRunId(applyLabel, applyStart) : null

  const applyPrompt = [
    `Implement the OpenSpec change \`${s.id}\` end-to-end, following the apply protocol in your system prompt.`,
    `Change folder: ${changeFolderPrefix}openspec/changes/${s.id}/`,
    ...(workspaceRoot ? [`Workspace root: ${workspaceRoot} — every openspec path in this prompt is relative to it, and an openspec CLI call runs as cd <that root> && npx -y openspec … in one shell invocation. Take it verbatim and resolve no root of your own.`] : []),
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
    ...reviewPromptLines(s.id, revMdl, revEff, false),
    ...(fast && revMdl === 'opus' ? [fastNote()] : []),
    ...(telemetry ? [telemetryNote(reviewRunId)] : []),
  ].join('\n\n')

  const review = await agent(reviewPrompt, {
    agentType: 'ptp:ptp-review',
    model: revMdl,
    phase: 'Review',
    label: reviewLabel,
    schema: REVIEW_SCHEMA,
  })

  const reviewEnd = telemetry ? nowIso() : null
  const reviewTiming = telemetry
    ? { run_id: reviewRunId, t_start: reviewStart, t_end: reviewEnd, agent_label: reviewLabel }
    : null

  // --- Fix-target escalation: AT MOST ONE re-spawn per story, and never a loop -----------------
  //
  // The review agent evaluates its fix target inside itself and adopts the EFFORT half on its own
  // (effort is only ever a prompt directive here). The MODEL half can only be honored at an
  // agent() spawn, which is this script's boundary — so an agent whose target outranks the model
  // it runs on makes no edit and hands the decision back as FIX_TARGET_ESCALATION. The ladder has
  // three rungs and the producer floors reviewModel at `sonnet`, so at most one strict ascent is
  // possible; a second one is evidence of a contract violation, not a case to service.
  let finalReview = review
  let escalatedFrom = null
  let escTiming = null
  let escalationHalt = null

  if (review && review.terminalState === 'FIX_TARGET_ESCALATION') {
    const target = parseFixTarget(review.fixTarget, REVIEW_MODELS, REVIEW_EFFORTS)
    if (target && REVIEW_MODELS.indexOf(target.model) > REVIEW_MODELS.indexOf(revMdl)) {
      const escLabel = `review:${s.id}#esc`
      const escStart = telemetry ? nowIso() : null
      const escRunId = telemetry ? mintRunId(escLabel, escStart) : null

      const escPrompt = [
        ...reviewPromptLines(s.id, target.model, target.effort, true),
        ...(fast && target.model === 'opus' ? [fastNote()] : []),
        ...(telemetry ? [telemetryNote(escRunId)] : []),
      ].join('\n\n')

      log(`Story ${i + 1}/${stories.length}: ${s.id} — review escalating once from ${revMdl} to fix target ${target.model}.${target.effort}`)

      const escReview = await agent(escPrompt, {
        agentType: 'ptp:ptp-review',
        model: target.model,
        phase: 'Review',
        label: escLabel,
        schema: REVIEW_SCHEMA,
      })

      const escEnd = telemetry ? nowIso() : null
      escTiming = telemetry
        ? { run_id: escRunId, t_start: escStart, t_end: escEnd, agent_label: escLabel }
        : null

      escalatedFrom = review
      finalReview = escReview

      if (escReview && escReview.terminalState === 'FIX_TARGET_ESCALATION') {
        escalationHalt = `review requested a fix-target escalation that cannot be honored (the escalated run at ${target.model} escalated again; fixTarget=${escReview.fixTarget === undefined || escReview.fixTarget === null ? 'absent' : JSON.stringify(escReview.fixTarget)})`
      }
    } else {
      // Absent, unparseable, or non-escalating fixTarget — including any escalation reported by a
      // run already at the `opus` ceiling, where nothing can outrank it. Halt; do NOT re-spawn.
      escalationHalt = `review requested a fix-target escalation that cannot be honored (running model=${revMdl}, fixTarget=${review.fixTarget === undefined || review.fixTarget === null ? 'absent' : JSON.stringify(review.fixTarget)})`
    }
  }

  // `reviewTally` rides beside `fixCounts` and is scoped identically: only a record whose review
  // call was actually REACHED (applyOk: true) carries either field, and both are derived from the
  // FINAL review result — the escalated run's when an escalation was honored. The first run's
  // result stays reachable under `reviewEscalatedFrom` below, but it carries no tally of its own:
  // `escalatedFrom` is set only for a FIX_TARGET_ESCALATION return, which resolves no phase and so
  // omits reviewTally entirely (agents/ptp-review.md). Nothing here fills that gap — no borrowing
  // from the escalated run, no zeroes.
  const storyRecord = { id: s.id, applyOk: true, apply, review: finalReview || null, fixCounts: readReviewFixCounts(finalReview), reviewTally: readReviewTally(finalReview) }
  // An escalated story keeps the ESCALATED run's result in `review` — that is the one the gate
  // reads — and retains the first run's result for reporting only.
  if (escalatedFrom) storyRecord.reviewEscalatedFrom = escalatedFrom
  // One timing entry per agent() call, in call order, so a story that ran two agents surfaces two
  // windows rather than one ambiguous pair, and an escalated story surfaces three.
  if (telemetry) {
    storyRecord.timings = escTiming
      ? [applyTiming, reviewTiming, escTiming]
      : [applyTiming, reviewTiming]
  }
  results.push(storyRecord)

  // The unhonorable escalation is consumed HERE, before the gate, so the gate below keeps its
  // exact existing form and FIX_TARGET_ESCALATION never appears in a green-state list.
  if (escalationHalt) {
    halted = { id: s.id, reason: escalationHalt }
    break
  }

  if (!finalReview || finalReview.terminalState !== 'BOTH_PHASES_DONE') {
    halted = { id: s.id, reason: `review did not converge (terminalState=${finalReview ? finalReview.terminalState : 'null'})` }
    break
  }
}

return { results, halted, total: stories.length }
