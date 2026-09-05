#!/usr/bin/env node
"use strict";

/**
 * ptp-apply-role-tests.js
 *
 * Asserts, over the REAL repository files, the role-aware contract of the workflow apply agent
 * introduced by 0067_01_apply-stage-codex-role:
 *
 *   - `agents/ptp-apply.md` resolves the role pair via `ptp-agent-roles`, keeps a byte-identical
 *     `claude` in-session path, and defines a `main=codex` write-capable `codex exec -s workspace-write`
 *     shell-out (model/effort from `ptp-codex-mode`) whose `$WORK_PROMPT` is self-contained, that
 *     blocks (never silently falls back) when `codex` is missing from PATH, and that never uses the
 *     sandbox-bypass flag.
 *   - `workflows/ptp-full-apply.js` reads NO role/codex config itself yet still defines `APPLY_SCHEMA`.
 *
 * These are prose/source assertions against the shipped files — the `agents/ptp-apply.md` branch is a
 * spawned-agent prompt, so it is driven RED->GREEN by this reader rather than by an executed harness.
 *
 * Plain Node, zero dependencies, no network. Resolves every path from its own location.
 *
 * Usage: node scripts/ptp-apply-role-tests.js
 * Exit codes: 0 all assertions hold, 1 one or more failed (each printed as a FAIL line).
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

function readFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

// Each assertion: { file, kind: "requires" | "forbids", pattern, why }. A "requires" fails when the
// pattern is absent; a "forbids" fails when it is present. Patterns are matched case-insensitively.
const ASSERTIONS = [
  // --- agents/ptp-apply.md: role resolution ---------------------------------------------------
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "ptp-agent-roles",
    why: "the apply agent must resolve { main, reviewer } via ptp-agent-roles",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "byte-identical",
    why: "the claude direction must be stated as byte-identical to the pre-change in-session behavior",
  },
  // --- agents/ptp-apply.md: the codex direction -----------------------------------------------
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "codex exec -s workspace-write",
    why: "the main=codex direction must shell out to a write-capable codex exec -s workspace-write",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "codex\\.model",
    why: "the codex direction's model must come from codex.model",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "codex\\.reasoningEffort",
    why: "the codex direction's reasoning effort must come from codex.reasoningEffort",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "ptp-codex-mode",
    why: "the codex direction's model/effort resolution is owned by ptp-codex-mode",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "\\$WORK_PROMPT",
    why: "the codex direction must build a $WORK_PROMPT for the shell-out",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "self-contained",
    why: "the $WORK_PROMPT must be self-contained per ptp-skill-contract",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "openspec-apply-change",
    why: "the self-contained prompt directs Codex to read skills/openspec-apply-change/SKILL.md (delivery mode 2)",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "ptp-branch-prep",
    why: "the codex prompt must note HEAD is already on the feature branch so ptp-branch-prep is not launched",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "install .{0,14}codex.{0,32}roles\\.main=claude",
    why: "a missing codex CLI must block with remediation (install codex, or set roles.main=claude)",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "requires",
    pattern: "blocked",
    why: "a missing codex CLI on the codex path must return stageReached: blocked, never a silent fallback",
  },
  {
    file: "agents/ptp-apply.md",
    kind: "forbids",
    pattern: "--dangerously-bypass-approvals-and-sandbox",
    why: "the write-capable invocation must never bypass the sandbox/approvals",
  },
  // --- workflows/ptp-full-apply.js: stays role-agnostic ---------------------------------------
  {
    file: "workflows/ptp-full-apply.js",
    kind: "requires",
    pattern: "APPLY_SCHEMA",
    why: "the orchestrator keeps defining APPLY_SCHEMA",
  },
  {
    file: "workflows/ptp-full-apply.js",
    kind: "forbids",
    pattern: "configLayers",
    why: "the orchestrator must read no layered config itself",
  },
  {
    file: "workflows/ptp-full-apply.js",
    kind: "forbids",
    pattern: "resolveConfigKey",
    why: "the orchestrator must read no config key itself",
  },
  {
    file: "workflows/ptp-full-apply.js",
    kind: "forbids",
    pattern: "ptp-resolve-roles",
    why: "the orchestrator must not resolve roles itself; the spawned agent does",
  },
  {
    file: "workflows/ptp-full-apply.js",
    kind: "forbids",
    pattern: "readFileSync",
    why: "the orchestrator runs in a sandbox with no file access and must read no config file",
  },
];

function main() {
  const failures = [];
  const cache = {};
  for (const a of ASSERTIONS) {
    let body = cache[a.file];
    if (body === undefined) {
      try {
        body = readFile(a.file);
      } catch (e) {
        failures.push(a.file + ": unreadable (" + e.message + ")");
        cache[a.file] = null;
        continue;
      }
      cache[a.file] = body;
    }
    if (body === null) continue;
    let re;
    try {
      re = new RegExp(a.pattern, "i");
    } catch (e) {
      failures.push(a.file + ": uncompilable pattern '" + a.pattern + "': " + e.message);
      continue;
    }
    const matched = re.test(body);
    if (a.kind === "requires" && !matched) {
      failures.push("FAIL " + a.file + " [requires /" + a.pattern + "/]: " + a.why);
    } else if (a.kind === "forbids" && matched) {
      failures.push("FAIL " + a.file + " [forbids /" + a.pattern + "/]: " + a.why);
    }
  }

  for (const f of failures) process.stdout.write(f + "\n");
  if (failures.length > 0) {
    process.stdout.write(failures.length + " assertion(s) failed\n");
    return 1;
  }
  process.stdout.write("OK: " + ASSERTIONS.length + " apply-role assertions hold\n");
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { ASSERTIONS };
