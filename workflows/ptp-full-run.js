export const meta = {
  name: 'ptp-full-run',
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
    terminalState: { type: 'string', enum: ['BOTH_PHASES_DONE', 'PHASE1_CAP', 'PHASE2_CAP'] },
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
const results = []
let halted = null

for (let i = 0; i < stories.length; i++) {
  const s = stories[i]
  const eff = s.effort || 'high'
  const mdl = s.model || 'opus'
  log(`Story ${i + 1}/${stories.length}: ${s.id} — apply at ${mdl}.${eff}`)

  const applyPrompt = [
    `Implement the OpenSpec change \`${s.id}\` end-to-end, following the apply protocol in your system prompt.`,
    `Change folder: openspec/changes/${s.id}/`,
    `Work at **${eff}** effort: ${effortDirective(eff)}`,
    `Do NOT archive. Do NOT commit. Stop when all tasks are checked and verification passes, and return the JSON object.`,
  ].join('\n\n')

  const apply = await agent(applyPrompt, {
    agentType: 'ptp-apply',
    model: mdl,
    phase: 'Apply',
    label: `apply:${s.id}`,
    schema: APPLY_SCHEMA,
  })

  if (!apply || apply.stageReached !== 'completed') {
    results.push({ id: s.id, applyOk: false, apply: apply || null, review: null })
    halted = { id: s.id, reason: `apply did not complete (stageReached=${apply ? apply.stageReached : 'null'})` }
    break
  }

  const reviewPrompt = [
    `Run the review-full protocol (Superpowers loop then Codex loop) on the OpenSpec change \`${s.id}\`, per your system prompt.`,
    `Change folder: openspec/changes/${s.id}/`,
    `Work at **high** effort. Fix only confirmed findings inline. Do NOT commit. Do NOT archive.`,
    `Return the JSON object.`,
  ].join('\n\n')

  const review = await agent(reviewPrompt, {
    agentType: 'ptp-review',
    model: 'opus',
    phase: 'Review',
    label: `review:${s.id}`,
    schema: REVIEW_SCHEMA,
  })

  results.push({ id: s.id, applyOk: true, apply, review: review || null })

  if (!review || review.terminalState !== 'BOTH_PHASES_DONE') {
    halted = { id: s.id, reason: `review did not converge (terminalState=${review ? review.terminalState : 'null'})` }
    break
  }
}

return { results, halted, total: stories.length }
