export const meta = {
  name: 'ptp-branch-prep',
  description: 'Minimal git prep for the ptp branch guard: stash any dirty changes, switch to the base branch (master or main), pull, then cut (or switch to) a fresh feature branch — run at the cheapest model before a ptp write-step that would otherwise land on the base branch. Never commits, never pushes.',
  phases: [{ title: 'Branch prep', detail: 'haiku agent: stash → checkout base → pull → cut branch', model: 'haiku' }],
}

// args may arrive as an object or, in some runtimes, as the verbatim JSON string.
let parsed = args
if (typeof args === 'string') {
  try { parsed = JSON.parse(args) } catch { parsed = { branch: args } }  // bare string → treat as the branch name
}
const branch = (parsed && parsed.branch ? String(parsed.branch) : '').trim()
const description = (parsed && parsed.description ? String(parsed.description) : '').trim()
// The base branch HEAD is currently on — `master` or `main`. Defaults to `master` for back-compat
// with callers that predate base-branch detection. Only these two names are accepted; anything else
// falls back to `master` so a stray value can never checkout an unexpected branch.
const baseRaw = (parsed && parsed.base ? String(parsed.base) : '').trim()
const base = baseRaw === 'main' ? 'main' : 'master'
// The invocation's already-resolved workspace root, git-root-relative with `/` separators and the
// literal `.` at the git-root workspace, so a supplied value is never empty. A caller that supplies
// nothing leaves the workspace UNKNOWN: the prep then records no binding and compares none, which is
// what keeps a pre-change caller working rather than stamping a guessed owner onto a branch.
const workspaceRaw = (parsed && parsed.workspace ? String(parsed.workspace) : '').trim()
// The value is interpolated into a `git config` command the agent runs, so only a conservative
// character set is accepted: ASCII letters, digits, space, `.`, `_`, `-`, `/`, plus any non-ASCII
// character (no shell metacharacter is non-ASCII, and a non-Latin directory name is legitimate).
// Anything else — a quote, `$`, a backtick, `;`, a control character — could break out of the
// quoting in that command, so the value is DROPPED and the workspace falls back to UNKNOWN, the
// same validate-then-fall-back posture `base` above uses rather than passing a stray value to git.
const WORKSPACE_SAFE = /^(?:[A-Za-z0-9 ._\/-]|[^\x00-\x7F])+$/
const workspace = WORKSPACE_SAFE.test(workspaceRaw) ? workspaceRaw : ''
const wsKnown = workspace !== ''
const workspaceRejected = workspaceRaw !== '' && !wsKnown

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
    error: { type: 'string' },            // set only on a read-only preflight refusal; tree and HEAD untouched
  },
  required: ['branch', 'onBranch'],
}

// Every PROPER prefix of the target ref: `ptp/foo/bar` yields `ptp` and `ptp/foo`. Git stores each
// branch as a file under refs/heads/, so any of those existing as a branch blocks creating the target.
const segments = branch.split('/').filter(Boolean)
const prefixes = segments.slice(0, -1).map((_, i) => segments.slice(0, i + 1).join('/'))
const prefixChecks = prefixes.length
  ? prefixes.map((pre) => `      - \`git show-ref --verify --quiet refs/heads/${pre}\``).join('\n')
  : '      - (this target has no proper prefix, so no `git show-ref --verify --quiet refs/heads/<prefix>` check applies — skip to b.)'

const prompt = [
  `You are doing a small, mechanical git preparation task. HEAD is currently on \`${base}\` (the repo's base branch) and a ptp write-step must not write onto it. Run the steps below with the Bash tool, in order, then return the JSON object. Do not reason at length — this is plumbing.`,
  `Target feature branch: \`${branch}\`${description ? ` (for: ${description})` : ''}.`,
  ``,
  `1. READ-ONLY PREFLIGHT — run this ENTIRE step before anything else. Every command in it only reads refs or config: it must not stash, checkout, create, or write anything. On ANY refusal below, return immediately with { branch: "${branch}", onBranch: false, created: false, stashed: false, error: "<the message described>" } — having stashed nothing, switched nothing, and created nothing.`,
  `   a. Ref/directory conflict, PREFIX direction. Git cannot hold both a branch and a branch directory at one path, so run each of these:`,
  prefixChecks,
  `      If any of them exits 0, that prefix already exists as a branch and blocks \`${branch}\`. REFUSE: the error must name the conflicting ref (\`refs/heads/<prefix>\`) and the remedy — rename it with \`git branch -m\`, or delete it once merged.`,
  `   b. Ref/directory conflict, BENEATH direction. Run \`git for-each-ref --count=1 refs/heads/${branch}/\`. If it prints ANY line, a ref lives beneath the target and blocks it. REFUSE: the error must name that ref and the same rename-or-delete remedy.`,
  ...(wsKnown ? [
    `   c. Workspace binding. This invocation's workspace root is \`${workspace}\`. Run \`git rev-parse --verify --quiet refs/heads/${branch}\`; if the branch does not exist there is nothing to compare, so continue. If it does exist, run \`git config --local --get branch.${branch}.ptpWorkspace\` (\`--local\` so only THIS repository's config is consulted — never a value inherited from the user's global config) and act on exactly one of these three dispositions:`,
    `      - absent (non-zero exit, or empty output) — the binding is unknown: CONTINUE unchanged and do NOT write one, because a branch this prep did not cut carries no evidence of which workspace owns it.`,
    `      - equal to this invocation's workspace root — CONTINUE unchanged.`,
    `      - different from this invocation's workspace root — REFUSE: the error must name BOTH roots (the recorded one and this invocation's) and the remedy — run the step from the recorded workspace, or derive a different branch name.`,
  ] : [
    `   c. Workspace binding. ${workspaceRejected ? 'This invocation supplied a workspace root carrying characters this workflow refuses to interpolate into a command, so it was DROPPED and the workspace is UNKNOWN' : 'This invocation supplied NO workspace root, so the workspace is UNKNOWN'}. There is nothing to compare a recorded binding against, so skip this check entirely: do NOT read \`branch.${branch}.ptpWorkspace\`, do NOT write one, and NEVER refuse on its account.${workspaceRejected ? ' Record in notes that the workspace binding was skipped because the supplied workspace root was rejected as unsafe.' : ''} CONTINUE to step 2.`,
  ]),
  `2. Run \`git status --porcelain\`. If it prints ANY lines (dirty working tree, including untracked), run \`git stash push -u -m "ptp-branch-prep autostash"\` and set stashed=true. If it is empty, set stashed=false and skip stashing.`,
  `3. Run \`git checkout ${base}\`.`,
  `4. Run \`git pull --ff-only\`. If it succeeds set baseUpdated=true. If it fails (no upstream, offline, or non-fast-forward), set baseUpdated=false, record the reason in notes, and CONTINUE — do not abort the prep.`,
  `5. Check \`git rev-parse --verify --quiet ${branch}\`. If that branch already exists, run \`git checkout ${branch}\` and set created=false. Otherwise run \`git checkout -b ${branch}\` and set created=true${wsKnown ? `, then — ONLY when you created it — run \`git config --local branch.${branch}.ptpWorkspace "${workspace}"\` — \`--local\` so it lands in THIS repository's config, and the value stays quoted because the path may contain spaces — to record the workspace it was cut for` : ' (record no workspace binding: the workspace is unknown, per step 1c)'}.`,
  `6. If you stashed in step 2, run \`git stash pop\` to bring the changes onto \`${branch}\`. If it pops cleanly set stashRestored=true; if it conflicts, set stashRestored=false, LEAVE the stash in place (do not drop it), and record in notes that the stash must be resolved manually.`,
  `7. Confirm with \`git rev-parse --abbrev-ref HEAD\` that HEAD is now \`${branch}\` and set onBranch accordingly.`,
  ``,
  `Hard limits: do NOT \`git commit\`, do NOT \`git push\`, do NOT \`git stash drop\`/\`clear\`, and do NOT edit any non-git files. The only \`git config\` write permitted is the \`--local\` branch.<branch>.ptpWorkspace record in step 5, on a branch you created. Return: { branch, onBranch, created, stashed, stashRestored, baseUpdated, notes, error }.`,
].join('\n')

const result = await agent(prompt, {
  agentType: 'general-purpose',
  model: 'haiku',
  phase: 'Branch prep',
  label: `branch-prep:${branch}`,
  schema: PREP_SCHEMA,
})

return result || { branch, onBranch: false, error: 'ptp-branch-prep agent returned null' }
