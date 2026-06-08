export const meta = {
  name: 'ptp-branch-prep',
  description: 'Minimal git prep for the ptp branch guard: stash any dirty changes, switch to master, pull, then cut (or switch to) a fresh feature branch — run at the cheapest model before a ptp write-step that would otherwise land on master. Never commits, never pushes.',
  phases: [{ title: 'Branch prep', detail: 'haiku agent: stash → checkout master → pull → cut branch', model: 'haiku' }],
}

// args may arrive as an object or, in some runtimes, as the verbatim JSON string.
let parsed = args
if (typeof args === 'string') {
  try { parsed = JSON.parse(args) } catch { parsed = { branch: args } }  // bare string → treat as the branch name
}
const branch = (parsed && parsed.branch ? String(parsed.branch) : '').trim()
const description = (parsed && parsed.description ? String(parsed.description) : '').trim()

if (!branch) {
  // The guard must always pass a branch name; refuse rather than guess one here.
  return { branch: '', error: 'no branch name provided to ptp-branch-prep' }
}

const PREP_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string' },          // the branch HEAD is on after prep
    onBranch: { type: 'boolean' },        // true once HEAD is on `branch`
    created: { type: 'boolean' },         // true if newly created; false if it already existed and we switched
    stashed: { type: 'boolean' },         // true if dirty changes were stashed
    stashRestored: { type: 'boolean' },   // true if the stash popped cleanly onto the new branch
    baseUpdated: { type: 'boolean' },     // true if `git pull` on master succeeded
    notes: { type: 'string' },            // anything that needed attention (pull failure, pop conflict, …)
  },
  required: ['branch', 'onBranch'],
}

const prompt = [
  `You are doing a small, mechanical git preparation task. HEAD is currently on \`master\` and a ptp write-step must not write onto master. Run the steps below with the Bash tool, in order, then return the JSON object. Do not reason at length — this is plumbing.`,
  `Target feature branch: \`${branch}\`${description ? ` (for: ${description})` : ''}.`,
  ``,
  `1. Run \`git status --porcelain\`. If it prints ANY lines (dirty working tree, including untracked), run \`git stash push -u -m "ptp-branch-prep autostash"\` and set stashed=true. If it is empty, set stashed=false and skip stashing.`,
  `2. Run \`git checkout master\`.`,
  `3. Run \`git pull --ff-only\`. If it succeeds set baseUpdated=true. If it fails (no upstream, offline, or non-fast-forward), set baseUpdated=false, record the reason in notes, and CONTINUE — do not abort the prep.`,
  `4. Check \`git rev-parse --verify --quiet ${branch}\`. If that branch already exists, run \`git checkout ${branch}\` and set created=false. Otherwise run \`git checkout -b ${branch}\` and set created=true.`,
  `5. If you stashed in step 1, run \`git stash pop\` to bring the changes onto \`${branch}\`. If it pops cleanly set stashRestored=true; if it conflicts, set stashRestored=false, LEAVE the stash in place (do not drop it), and record in notes that the stash must be resolved manually.`,
  `6. Confirm with \`git rev-parse --abbrev-ref HEAD\` that HEAD is now \`${branch}\` and set onBranch accordingly.`,
  ``,
  `Hard limits: do NOT \`git commit\`, do NOT \`git push\`, do NOT \`git stash drop\`/\`clear\`, and do NOT edit any non-git files. Return: { branch, onBranch, created, stashed, stashRestored, baseUpdated, notes }.`,
].join('\n')

const result = await agent(prompt, {
  agentType: 'general-purpose',
  model: 'haiku',
  phase: 'Branch prep',
  label: `branch-prep:${branch}`,
  schema: PREP_SCHEMA,
})

return result || { branch, onBranch: false, error: 'ptp-branch-prep agent returned null' }
