#!/usr/bin/env node
"use strict";

/**
 * ptp-resolve-roles.js
 *
 * DERIVED SURFACE. The `roles.main` resolution contract is owned by
 * `skills/ptp-agent-roles/SKILL.md`, and the layered configuration contract it reads through is owned
 * by `skills/ptp-workspace/SKILL.md`. This script only IMPLEMENTS them by reusing
 * `ptp-resolve-workspace.js`'s `configLayers`/`resolveConfigKey`; it introduces no resolution rule
 * the skills do not state -- it states no layer order and no precedence of its own -- and where the
 * two disagree the skill (ptp-agent-roles) wins. It is the tested embodiment of the contract, not a
 * runtime dependency of any consuming project.
 *
 * Resolves the role pair for the working directory and prints one JSON object on stdout:
 *
 *   { "main": "claude" | "codex", "reviewer": "codex" | "claude" }
 *
 * Only `roles.main` is stored in config; `reviewer` is always the OTHER agent, derived here, so a
 * state where main == reviewer is unrepresentable (ptp-agent-roles).
 *
 * Precedence, highest to lowest (ptp-agent-roles):
 *   1. `roles.main` from the layered config, merged as ptp-workspace defines, valid iff in
 *      {claude, codex}; any missing file / key / parse error / out-of-enum value leaves the prior
 *      value, and a later layer's invalid value never clears an earlier layer's valid one.
 *   2. Detection (opt-in), ONLY when the layered read left `roles.main` unset: the `PTP_MAIN_AGENT`
 *      env var, exact `claude` or `codex`; anything else (absent / empty / whitespace / wrong-case)
 *      falls through.
 *   3. Ultimate fallback: `claude`.
 * Never throws, never STOPs over a config typo.
 *
 * Usage: node scripts/ptp-resolve-roles.js
 *        node scripts/ptp-resolve-roles.js --self-test
 *
 * Exit codes: 0 success (JSON result on stdout), 2 usage error (usage text on stderr, stdout empty).
 *
 * Plain Node, zero dependencies, no network, no git subprocess.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const { configLayers, resolveConfigKey, REJECT } = require("./ptp-resolve-workspace.js");

const USAGE = "Usage: node scripts/ptp-resolve-roles.js | --self-test";

// The closed set of agent values (ptp-agent-roles).
const AGENTS = ["claude", "codex"];

// `roles.main` is valid iff it is exactly `claude` or `codex`; any other value is rejected FOR THIS
// KEY, leaving whatever an earlier layer validly set (ptp-agent-roles / ptp-workspace).
function mainNormalizer(v) {
  return v === "claude" || v === "codex" ? v : REJECT;
}

// The reviewer is always the OTHER agent; never a stored key.
function reviewerOf(main) {
  return main === "claude" ? "codex" : "claude";
}

/**
 * Resolve `{ main, reviewer, source }` for the given options.
 *
 *   cwd / repoRoot / workspaceRoot  passed straight through to configLayers (all optional)
 *   env                             the environment object read for PTP_MAIN_AGENT (default process.env)
 *
 * `source` is `default` | `global` | `project` | `workspace` | `env`, for diagnostics; only `main`
 * and `reviewer` are printed on stdout.
 */
function resolveRoles(options) {
  const opts = options || {};
  const env = opts.env || process.env;

  // Tier 1 -- the layered config. fallback `undefined` means "no layer supplied a valid value".
  const layers = configLayers(opts);
  const resolved = resolveConfigKey(layers, "roles.main", mainNormalizer, undefined);
  let main = resolved.value;
  let source = resolved.layer;

  // Tier 2 -- opt-in detection, ONLY when tier 1 left main unset.
  if (main === undefined) {
    const raw = env.PTP_MAIN_AGENT;
    if (raw === "claude" || raw === "codex") {
      main = raw;
      source = "env";
    }
  }

  // Tier 3 -- ultimate fallback.
  if (main === undefined) {
    main = "claude";
    source = "default";
  }

  return { main: main, reviewer: reviewerOf(main), source: source };
}

/* ------------------------------------------------------------------ self-test (--self-test) */

function writeDeep(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function removeTree(dir) {
  try {
    if (typeof fs.rmSync === "function") fs.rmSync(dir, { recursive: true, force: true });
    else fs.rmdirSync(dir, { recursive: true });
  } catch (e) {
    /* a leftover temp directory is never a test failure */
  }
}

function configFileIn(root) {
  return path.join(root, ".claude", "ptp", "config.json");
}

// A repo fixture with `.git` and `openspec`, and a project config carrying the given `roles.main`
// (or none when `rolesMain` is undefined). The global layer is redirected to an empty home so the
// real user config is never read.
function buildFixture(globalMain, projectMain) {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ptp-roles-"));
  const home = path.join(base, "home");
  const repo = path.join(base, "repo");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.mkdirSync(path.join(repo, "openspec"), { recursive: true });
  fs.mkdirSync(home, { recursive: true });

  if (globalMain !== undefined) writeDeep(configFileIn(home), JSON.stringify({ roles: { main: globalMain } }));
  if (projectMain !== undefined) writeDeep(configFileIn(repo), JSON.stringify({ roles: { main: projectMain } }));

  return { base: base, home: home, repo: repo };
}

function runSelfTest() {
  const failures = [];
  let passed = 0;
  const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passed += 1;
    else failures.push(name + ": expected " + e + ", got " + a);
  };

  const previousHome = process.env.PTP_HOME_DIR;
  const hadHome = Object.prototype.hasOwnProperty.call(process.env, "PTP_HOME_DIR");
  const cleanupFixtures = [];

  // Run one case: build a fixture, point PTP_HOME_DIR at its home, resolve with the workspace layer
  // suppressed (it equals the repo root here, and precedence between global and project is the point).
  const resolveCase = (globalMain, projectMain, env) => {
    const fx = buildFixture(globalMain, projectMain);
    cleanupFixtures.push(fx.base);
    process.env.PTP_HOME_DIR = fx.home;
    return resolveRoles({ cwd: fx.repo, repoRoot: fx.repo, workspaceRoot: null, env: env || {} });
  };

  try {
    // (a) Project config sets codex -> main codex, reviewer claude, from the project layer.
    check("project-codex", resolveCase(undefined, "codex"), { main: "codex", reviewer: "claude", source: "project" });

    // (b) Global config sets codex, project unset -> resolves from the global layer.
    check("global-codex", resolveCase("codex", undefined), { main: "codex", reviewer: "claude", source: "global" });

    // (c) Layered precedence: a distinct project value overrides the global one (later layer wins).
    check("project-over-global", resolveCase("codex", "claude"), { main: "claude", reviewer: "codex", source: "project" });

    // (d) A later layer's INVALID value never clears an earlier layer's valid one.
    check("invalid-project-keeps-global", resolveCase("codex", "bogus"), { main: "codex", reviewer: "claude", source: "global" });

    // (e) Out-of-enum with no env opt-in -> ultimate default claude.
    check("out-of-enum-defaults-claude", resolveCase(undefined, "gpt", {}), { main: "claude", reviewer: "codex", source: "default" });

    // (f) PTP_MAIN_AGENT fills an unset roles.main.
    check("env-fills-unset", resolveCase(undefined, undefined, { PTP_MAIN_AGENT: "codex" }), { main: "codex", reviewer: "claude", source: "env" });

    // (g) Explicit config ALWAYS wins over the env opt-in.
    check("config-beats-env", resolveCase(undefined, "claude", { PTP_MAIN_AGENT: "codex" }), { main: "claude", reviewer: "codex", source: "project" });

    // (h) An invalid PTP_MAIN_AGENT (wrong case) is treated as absent -> default claude.
    check("bad-env-defaults-claude", resolveCase(undefined, undefined, { PTP_MAIN_AGENT: "Codex" }), { main: "claude", reviewer: "codex", source: "default" });

    // (i) No config, no env -> the ultimate fallback.
    check("bare-default", resolveCase(undefined, undefined, {}), { main: "claude", reviewer: "codex", source: "default" });
  } catch (e) {
    failures.push("self-test harness threw: " + (e && e.message));
  } finally {
    if (hadHome) process.env.PTP_HOME_DIR = previousHome;
    else delete process.env.PTP_HOME_DIR;
    for (const dir of cleanupFixtures) removeTree(dir);
  }

  for (const f of failures) process.stdout.write("self-test FAIL: " + f + "\n");
  process.stdout.write("self-test checks passed: " + passed + "/" + (passed + failures.length) + "\n");
  return failures.length === 0 ? 0 : 1;
}

function failUsage(reason) {
  process.stderr.write(USAGE + "\n" + reason + "\n");
  process.exit(2);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === "--self-test") process.exit(runSelfTest());
  if (argv.length !== 0) failUsage("unexpected argument '" + argv[0] + "'");

  const roles = resolveRoles({});
  process.stdout.write(JSON.stringify({ main: roles.main, reviewer: roles.reviewer }) + "\n");
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  resolveRoles: resolveRoles,
  reviewerOf: reviewerOf,
  mainNormalizer: mainNormalizer,
  AGENTS: AGENTS,
};
