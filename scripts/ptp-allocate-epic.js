#!/usr/bin/env node
"use strict";

/**
 * ptp-allocate-epic.js
 *
 * DERIVED SURFACE. Reserves the next epic number for one ptp workspace on its git remote, so two
 * branches, worktrees or clones can never pick the same number. The local half of the scan is
 * `ptp-change-selector` section 4's; the slug is `ptp-resolve-workspace.js`'s `deriveSlug`.
 *
 * It reads the highest `refs/ptp/[<slug>/]epics/NNNN` claim on the remote, takes the maximum with
 * the local scan, and reserves `max + 1` by pushing a fresh empty-tree commit under an absent-ref
 * lease. Only a porcelain `*` (new reference) result wins. A lost race retries from a fresh read,
 * five attempts in total. `--seed` claims the local maximum itself when it is above the remote's.
 *
 * The key `epic-id-generator` gates all of this. Under `self` (the default) it prints the local
 * maximum + 1 with no git call and no claim; `--seed` then STOPs. Only `github` runs the claim path.
 *
 * Usage: node scripts/ptp-allocate-epic.js --workspace <root> [--seed]
 *        node scripts/ptp-allocate-epic.js --self-test
 *
 * Exit codes: 0 success (one line on stdout, the 4-digit epic number; stderr empty except the
 * one-line no-remote notice), 1 STOP (stdout empty, one message on stderr), 2 usage error.
 *
 * Plain Node, zero dependencies. Every git call is non-interactive (GIT_TERMINAL_PROMPT=0,
 * GCM_INTERACTIVE=never, stdin ignored).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");
const { deriveSlug, configLayers, resolveConfigKey, REJECT } = require("./ptp-resolve-workspace.js");

const USAGE = "Usage: node scripts/ptp-allocate-epic.js --workspace <root> [--seed] | --self-test";
const NOTICE = "ptp-allocate-epic: no git remote; allocated from the local scan only";
const MAX_ATTEMPTS = 5;
const NETWORK_TIMEOUT_MS = 60000;
const CLAIM_IDENTITY = {
  GIT_AUTHOR_NAME: "ptp-allocate-epic",
  GIT_AUTHOR_EMAIL: "ptp-allocate-epic@invalid",
  GIT_COMMITTER_NAME: "ptp-allocate-epic",
  GIT_COMMITTER_EMAIL: "ptp-allocate-epic@invalid",
};

/* ------------------------------------------------------------------------------- STOP + git */

class Stop extends Error {}

function stop(message) {
  throw new Stop(message);
}

// When the self-test sets this to an array, every git spawn records its args and the two
// non-interactive variables, so a case can assert them.
let spawnRecorder = null;

// The one git spawn wrapper. Every git call goes through here.
function git(args, options) {
  const opts = options || {};
  const env = Object.assign({}, process.env, opts.env || {}, {
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
  });
  if (spawnRecorder) {
    spawnRecorder.push({
      args: args.slice(),
      env: { GIT_TERMINAL_PROMPT: env.GIT_TERMINAL_PROMPT, GCM_INTERACTIVE: env.GCM_INTERACTIVE },
    });
  }
  const run = childProcess.spawnSync("git", args, {
    cwd: opts.cwd,
    env: env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    timeout: opts.timeout || 0,
    windowsHide: true,
  });
  if (run.error && run.error.code === "ENOENT") stop("git is not available on PATH");
  return {
    status: run.status,
    stdout: run.stdout || "",
    stderr: run.stderr || "",
    error: run.error || null,
    signal: run.signal || null,
  };
}

// Names a failed network call. Exit 128 and a spawn timeout are "unreachable"; any other non-zero
// result is "failed"; a clean exit is null.
function classifyGitFailure(result) {
  if (!result) return "failed";
  if (result.status === 128) return "unreachable";
  if (result.error && result.error.code === "ETIMEDOUT") return "unreachable";
  if (result.error || result.status !== 0) return "failed";
  return null;
}

/* ------------------------------------------------------------------------------- allocation */

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (e) {
    return false;
  }
}

function pad4(n) {
  return String(n).padStart(4, "0");
}

function oneLine(text) {
  return String(text || "")
    .trim()
    .replace(/\s*\r?\n\s*/g, " / ");
}

function realpath(p) {
  try {
    return fs.realpathSync.native(p);
  } catch (e) {
    return fs.realpathSync(p);
  }
}

function dirNames(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (e) {
    // Only a missing directory adds nothing; an unreadable one would understate the local maximum.
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return [];
    stop("cannot read " + dir + ": " + e.message);
  }
}

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;
const EPIC_PREFIX = /^(\d{4})_/;

// ptp-change-selector section 4: directory names under openspec/changes/ (minus archive) as is,
// plus archive/ and epics_00/ names with a leading YYYY-MM-DD- stripped. Files are ignored and a
// missing directory adds nothing. Returns the highest epic, 0 when there is none.
function scanLocal(root) {
  const openspec = path.join(root, "openspec");
  const names = dirNames(path.join(openspec, "changes")).filter((n) => n !== "archive");
  for (const n of dirNames(path.join(openspec, "changes", "archive"))) names.push(n.replace(DATE_PREFIX, ""));
  for (const n of dirNames(path.join(openspec, "epics_00"))) names.push(n.replace(DATE_PREFIX, ""));
  let max = 0;
  for (const n of names) {
    const m = EPIC_PREFIX.exec(n);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// `origin` if listed, else the only remote; none returns null; several without origin STOP.
function chooseRemote(root) {
  const run = git(["remote"], { cwd: root });
  if (run.status !== 0) stop("git remote failed: " + oneLine(run.stderr));
  const remotes = run.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (remotes.length === 0) return null;
  if (remotes.indexOf("origin") >= 0) return "origin";
  if (remotes.length === 1) return remotes[0];
  stop("several git remotes and no origin (" + remotes.join(", ") + "); add an origin remote");
}

function remoteUrl(root, remote, forPush) {
  const args = forPush ? ["remote", "get-url", "--push", "--all", remote] : ["remote", "get-url", remote];
  const run = git(args, { cwd: root });
  const urls = run.status === 0 ? run.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  // A push goes to every push URL, but a claim is read and won at exactly one destination.
  if (urls.length > 1) stop("remote " + remote + " has several push URLs (" + urls.join(", ") + "); give it one");
  return urls.length === 1 ? urls[0] : remote;
}

function unreachableMessage(state, forPush, run) {
  const url = forPush ? state.pushUrl : state.fetchUrl;
  const reason = run.error && run.error.code === "ETIMEDOUT" ? "timed out" : oneLine(run.stderr) || "exit " + run.status;
  return (
    "remote " + state.remote + " at " + url + " is unreachable without a prompt (" + reason + "); " +
    "fix its credentials, or point it at an SSH host alias whose key has write access: " +
    "git remote set-url" + (forPush ? " --push " : " ") + state.remote + " git@<ssh-host-alias>:<owner>/<repo>.git"
  );
}

// One ls-remote of the namespace. Only refs that match ^<namespace>(\d{4})$ exactly count. Claims
// land at the push URL, so a remote whose push URL differs from its fetch URL is read there.
function readRemote(state) {
  const readsPush = state.pushUrl !== state.fetchUrl;
  const run = git(["ls-remote", readsPush ? state.pushUrl : state.remote, state.namespace + "*"], {
    cwd: state.root,
    timeout: NETWORK_TIMEOUT_MS,
  });
  const failure = classifyGitFailure(run);
  if (failure === "unreachable") stop(unreachableMessage(state, readsPush, run));
  if (failure !== null) {
    const url = readsPush ? state.pushUrl : state.fetchUrl;
    stop("git ls-remote " + state.remote + " at " + url + " failed: " + (oneLine(run.stderr) || "exit " + run.status));
  }
  const pattern = new RegExp("^" + escapeRegExp(state.namespace) + "(\\d{4})$");
  const refs = new Set();
  let max = 0;
  for (const line of run.stdout.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const ref = line.slice(tab + 1).trim();
    const m = pattern.exec(ref);
    if (!m) continue;
    refs.add(ref);
    max = Math.max(max, parseInt(m[1], 10));
  }
  return { max: max, refs: refs };
}

// Everything allocation reads: the workspace, its slug and namespace, the local scan, the chosen
// remote and, when there is one, the remote's highest claim.
function readState(options) {
  const opts = options || {};
  const root = opts.workspace;
  if (typeof root !== "string" || root === "") stop("no workspace root given");
  if (!isDirectory(path.join(root, "openspec"))) stop("no openspec/ directory under " + root);

  const top = git(["rev-parse", "--show-toplevel"], { cwd: root });
  if (top.status !== 0 || top.stdout.trim() === "") stop("not inside a git repository: " + root);
  const realTop = realpath(top.stdout.trim());
  const realRoot = realpath(root);
  const rel = path.relative(realTop, realRoot);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    stop("workspace " + root + " is outside the git toplevel " + realTop);
  }
  // isRoot is decided from the paths, as ptp-resolve-workspace.js does, never from the slug.
  const isRoot = rel === "";
  const relative = rel.split(path.sep).join("/");
  const slug = deriveSlug(relative, isRoot);
  const namespace = isRoot ? "refs/ptp/epics/" : "refs/ptp/" + slug + "/epics/";

  const state = {
    root: root,
    slug: slug,
    isRoot: isRoot,
    namespace: namespace,
    localMax: scanLocal(root),
    remote: chooseRemote(root),
    fetchUrl: null,
    pushUrl: null,
    remoteMax: 0,
    remoteRefs: new Set(),
  };
  if (state.remote === null) return state;
  state.fetchUrl = remoteUrl(root, state.remote, false);
  state.pushUrl = remoteUrl(root, state.remote, true);
  const read = readRemote(state);
  state.remoteMax = read.max;
  state.remoteRefs = read.refs;
  return state;
}

// The flag of the porcelain push line whose destination is `ref`, or null when there is none.
function porcelainFlag(stdout, ref) {
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const spec = parts[1];
    const colon = spec.lastIndexOf(":");
    const dst = colon >= 0 ? spec.slice(colon + 1) : spec;
    if (dst === ref) return parts[0];
  }
  return null;
}

// Only `*` (new reference) is a win; `=` (up to date), `!` and a missing line are not.
function isWin(stdout, ref) {
  return porcelainFlag(stdout, ref) === "*";
}

// A fresh claim commit over the empty tree, with a fixed identity and no signature.
function makeClaimCommit(state, ref) {
  if (!state.emptyTree) {
    const tree = git(["mktree"], { cwd: state.root });
    if (tree.status !== 0) stop("git mktree failed: " + oneLine(tree.stderr));
    state.emptyTree = tree.stdout.trim();
  }
  const head = git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: state.root });
  const branch = head.status === 0 && head.stdout.trim() !== "" ? head.stdout.trim() : "unknown";
  const nonce = crypto.randomBytes(8).toString("hex");
  const message = "ptp epic claim " + ref + "\n\nbranch: " + branch + "\nnonce: " + nonce + "\n";
  const commit = git(["commit-tree", "--no-gpg-sign", "-m", message, state.emptyTree], {
    cwd: state.root,
    env: CLAIM_IDENTITY,
  });
  if (commit.status !== 0 || commit.stdout.trim() === "") stop("git commit-tree failed: " + oneLine(commit.stderr));
  return commit.stdout.trim();
}

// One claim of `ref`. Returns { won: true } or { won: false, read } when a fresh read lists `ref`
// as taken; STOPs on an unreachable push or a refusal that leaves `ref` absent.
function claim(state, ref, beforePush) {
  const sha = makeClaimCommit(state, ref);
  if (typeof beforePush === "function") beforePush(ref);
  const run = git(
    ["push", "--porcelain", "--force-with-lease=" + ref + ":", state.remote, sha + ":" + ref],
    { cwd: state.root, timeout: NETWORK_TIMEOUT_MS }
  );
  if (classifyGitFailure(run) === "unreachable") stop(unreachableMessage(state, true, run));
  if (isWin(run.stdout, ref)) return { won: true };
  const read = readRemote(state);
  if (read.refs.has(ref)) return { won: false, read: read };
  const line = String(run.stdout)
    .split(/\r?\n/)
    .filter((l) => porcelainFlag(l, ref) !== null)
    .join(" ");
  const reason = [oneLine(run.stderr), oneLine(line)].filter(Boolean).join(" / ") || "exit " + run.status;
  stop("push of " + ref + " to " + state.remote + " at " + state.pushUrl + " did not take the ref: " + reason);
}

// The epic-id-generator key: only the exact strings self and github are valid, anything else is
// rejected so a lower layer or the default applies. Layers are read for <root>, not process.cwd().
function normalizeGenerator(v) {
  return v === "self" || v === "github" ? v : REJECT;
}

function resolveGenerator(root) {
  const layers = configLayers({ cwd: root, workspaceRoot: root });
  return resolveConfigKey(layers, "epic-id-generator", normalizeGenerator, "self");
}

function allocate(options) {
  const opts = options || {};
  const root = opts.workspace;
  if (typeof root !== "string" || root === "") stop("no workspace root given");
  if (!isDirectory(path.join(root, "openspec"))) stop("no openspec/ directory under " + root);
  const generator = resolveGenerator(root);
  if (generator.value === "self") {
    if (opts.seed) {
      stop("--seed needs epic-id-generator set to github, and it resolves to self (" + generator.layer + ")");
    }
    const next = scanLocal(root) + 1;
    if (next > 9999) stop("the next epic number " + next + " is above 9999");
    return { number: pad4(next), ref: null, notice: null };
  }
  const state = readState(opts);
  if (state.remote === null) {
    if (opts.seed) stop("--seed needs a git remote, and this repository has none");
    const next = state.localMax + 1;
    if (next > 9999) stop("the next epic number " + next + " is above 9999");
    return { number: pad4(next), ref: null, notice: NOTICE };
  }
  if (opts.seed) {
    // Claim the local maximum itself, with no +1, only when it is above zero and above the
    // remote's highest claim. Print the namespace's highest claim after the run.
    if (!(state.localMax > 0 && state.localMax > state.remoteMax)) {
      return { number: pad4(state.remoteMax), ref: null, notice: null };
    }
    const seedRef = state.namespace + pad4(state.localMax);
    const outcome = claim(state, seedRef, opts.beforePush);
    if (outcome.won) return { number: pad4(state.localMax), ref: seedRef, notice: null };
    // Someone else took the ref first: the claim is done all the same.
    return { number: pad4(Math.max(outcome.read.max, state.localMax)), ref: null, notice: null };
  }

  let remoteMax = state.remoteMax;
  let ref = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const next = Math.max(remoteMax, state.localMax) + 1;
    if (next > 9999) stop("the next epic number " + next + " is above 9999");
    ref = state.namespace + pad4(next);
    const outcome = claim(state, ref, opts.beforePush);
    if (outcome.won) return { number: pad4(next), ref: ref, notice: null };
    // The race was lost: the next attempt starts from this fresh read.
    remoteMax = outcome.read.max;
  }
  stop(
    "lost the race for an epic number " + MAX_ATTEMPTS + " times on " + state.remote + " at " +
      state.pushUrl + "; the last attempt was " + ref
  );
}

/* ------------------------------------------------------------------------------------- CLI */

function parseArgs(argv) {
  const out = { workspace: null, seed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") {
      if (out.seed) return { usageError: "--seed given twice" };
      out.seed = true;
    } else if (a === "--workspace" || a.startsWith("--workspace=")) {
      if (out.workspace !== null) return { usageError: "--workspace given twice" };
      let value;
      if (a === "--workspace") {
        if (i + 1 >= argv.length) return { usageError: "--workspace needs a value" };
        value = argv[++i];
      } else {
        value = a.slice("--workspace=".length);
      }
      if (value === "") return { usageError: "--workspace needs a value" };
      out.workspace = value;
    } else {
      return { usageError: "unknown argument: " + a };
    }
  }
  if (out.workspace === null) return { usageError: "--workspace <root> is required" };
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === "--self-test") {
    process.exitCode = await runSelfTest();
    return;
  }
  const parsed = parseArgs(argv);
  if (parsed.usageError) {
    process.stderr.write(USAGE + "\n" + parsed.usageError + "\n");
    process.exitCode = 2;
    return;
  }
  let result;
  try {
    result = allocate({ workspace: parsed.workspace, seed: parsed.seed });
  } catch (e) {
    const message = e instanceof Stop ? e.message : "unexpected error: " + (e && e.message ? e.message : e);
    process.stderr.write("ptp-allocate-epic: " + message + "\n");
    process.exitCode = 1;
    return;
  }
  if (result.notice) process.stderr.write(result.notice + "\n");
  process.stdout.write(result.number + "\n");
  process.exitCode = 0;
}

/* ------------------------------------------------------------------------------- self-test */

function runCli(args) {
  const run = childProcess.spawnSync(process.execPath, [__filename].concat(args), {
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  return { status: run.status, stdout: run.stdout || "", stderr: run.stderr || "" };
}

function runCliAsync(args) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(process.execPath, [__filename].concat(args), {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status: status, stdout: stdout, stderr: stderr }));
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
  }
}

function expectStop(fn, label) {
  try {
    fn();
  } catch (e) {
    if (e instanceof Stop) return e.message;
    throw new Error(label + ": expected a STOP, got " + (e && e.stack ? e.stack : e));
  }
  throw new Error(label + ": expected a STOP, got a result");
}

function mustGit(args, cwd, extraEnv) {
  const run = git(args, { cwd: cwd, env: extraEnv });
  if (run.status !== 0) {
    throw new Error("fixture git " + args.join(" ") + " failed: " + run.stderr.trim());
  }
  return run.stdout.trim();
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeConfig(root, data) {
  const dir = path.join(root, ".claude", "ptp");
  mkdirp(dir);
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(data));
}

// A fixture: a work repository holding the workspace, plus one bare repository per remote.
function makeFixture(tmp, name, spec) {
  const s = spec || {};
  const dir = path.join(tmp, name);
  mkdirp(dir);
  const work = path.join(dir, "work");
  mustGit(["init", "-q", work], dir);
  if (s.branch) {
    mustGit(["checkout", "-q", "-b", s.branch], work);
    mustGit(["commit", "-q", "--allow-empty", "--no-gpg-sign", "-m", "init"], work, CLAIM_IDENTITY);
  }
  const remotes = s.remotes === undefined ? ["origin"] : s.remotes;
  const bares = {};
  for (const r of remotes) {
    const bare = path.join(dir, r + ".git");
    mustGit(["init", "-q", "--bare", bare], dir);
    mustGit(["remote", "add", r, bare], work);
    bares[r] = bare;
  }
  const ws = s.nested ? path.join.apply(path, [work].concat(s.nested.split("/"))) : work;
  const openspec = path.join(ws, "openspec");
  mkdirp(path.join(openspec, "changes"));
  for (const n of s.changes || []) mkdirp(path.join(openspec, "changes", n));
  for (const n of s.archive || []) mkdirp(path.join(openspec, "changes", "archive", n));
  for (const n of s.epics00 || []) mkdirp(path.join(openspec, "epics_00", n));
  for (const f of s.files || []) {
    mkdirp(path.dirname(path.join(openspec, f)));
    fs.writeFileSync(path.join(openspec, f), "x\n");
  }
  // The generator key lives in the workspace layer; `generator: null` writes no file.
  const generator = s.generator === undefined ? "github" : s.generator;
  if (generator !== null) writeConfig(ws, { "epic-id-generator": generator });
  return { dir: dir, work: work, ws: ws, bare: bares.origin || bares[remotes[0]], bares: bares };
}

function listRefs(bare) {
  const out = mustGit(["--git-dir", bare, "for-each-ref", "--format=%(refname)", "refs/ptp/"], undefined);
  return out === "" ? [] : out.split(/\r?\n/).sort();
}

// Writes a claim ref straight into a bare repository, as another claimant would.
function plantRef(bare, ref) {
  const tree = mustGit(["--git-dir", bare, "mktree"], undefined);
  const nonce = crypto.randomBytes(8).toString("hex");
  const sha = mustGit(
    ["--git-dir", bare, "commit-tree", "--no-gpg-sign", "-m", "planted " + ref + " " + nonce, tree],
    undefined,
    CLAIM_IDENTITY
  );
  mustGit(["--git-dir", bare, "update-ref", ref, sha], undefined);
}

function buildCases() {
  const cases = [];
  const add = (name, fn) => cases.push({ name: name, fn: fn });

  /* 2.1 -- CLI, exit codes */
  add("usage: no arguments exits 2", () => {
    const r = runCli([]);
    assertEq(r.status, 2, "exit");
    assertEq(r.stdout, "", "stdout");
  });
  add("usage: an unknown flag exits 2", () => {
    const r = runCli(["--workspace", ".", "--bogus"]);
    assertEq(r.status, 2, "exit");
  });
  add("usage: --workspace without a value exits 2", () => {
    const r = runCli(["--workspace"]);
    assertEq(r.status, 2, "exit");
  });
  add("stop: a --workspace with no openspec/ exits 1", (ctx) => {
    const dir = path.join(ctx.tmp, "no-openspec");
    mkdirp(dir);
    const r = runCli(["--workspace", dir]);
    assertEq(r.status, 1, "exit");
    assertEq(r.stdout, "", "stdout");
    assert(/openspec/.test(r.stderr), "stderr names openspec: " + r.stderr);
  });

  /* 2.2 -- read side */
  add("scan: changes/ as is, archive/ and epics_00/ date-stripped", (ctx) => {
    const f = makeFixture(ctx.tmp, "scan", {
      remotes: [],
      changes: ["0003_01_a", "2026-01-01-0050_01_dated-in-changes"],
      archive: ["2026-02-03-0007_01_b", "0004_01_undated"],
      epics00: ["2026-02-03-0009_00_c"],
    });
    assertEq(scanLocal(f.ws), 9, "local max");
    const g = makeFixture(ctx.tmp, "scan-archive", { remotes: [], changes: ["0002_01_a"], archive: ["2025-12-31-0008_01_b"] });
    assertEq(scanLocal(g.ws), 8, "archive max");
  });
  add("scan: files are ignored", (ctx) => {
    const f = makeFixture(ctx.tmp, "files", {
      remotes: [],
      changes: ["0002_01_a"],
      files: ["changes/0099_01_note.md", "changes/archive/2026-01-01-0098_01_x.md", "epics_00/0097_00_y.md"],
    });
    assertEq(scanLocal(f.ws), 2, "local max");
  });
  add("scan: a missing epics_00/ adds nothing", (ctx) => {
    const f = makeFixture(ctx.tmp, "no-epics00", { remotes: [], changes: ["0002_01_a"] });
    assert(!isDirectory(path.join(f.ws, "openspec", "epics_00")), "fixture has no epics_00/");
    assertEq(scanLocal(f.ws), 2, "local max");
    const g = makeFixture(ctx.tmp, "empty", { remotes: [] });
    assertEq(scanLocal(g.ws), 0, "empty max");
  });
  add("read: near-miss and other-namespace refs are ignored", (ctx) => {
    const f = makeFixture(ctx.tmp, "near-miss", { changes: ["0001_01_a"] });
    for (const ref of [
      "refs/ptp/epics/0003",
      "refs/ptp/epics/12345",
      "refs/ptp/epics/007",
      "refs/ptp/epics/0050x",
      "refs/ptp/epics/0060/sub",
      "refs/ptp/products-foo/epics/0090",
      "refs/heads/refs/ptp/epics/0070",
    ]) {
      plantRef(f.bare, ref);
    }
    const s = readState({ workspace: f.ws });
    assertEq(s.namespace, "refs/ptp/epics/", "namespace");
    assertEq(s.remote, "origin", "remote");
    assertEq(s.remoteMax, 3, "remote max");
    assertEq(s.localMax, 1, "local max");
  });
  add("read: a nested workspace reads under its slug, equal to ptp-resolve-workspace.js", (ctx) => {
    const f = makeFixture(ctx.tmp, "nested", { nested: "products/foo", changes: ["0002_01_a"] });
    plantRef(f.bare, "refs/ptp/epics/0040");
    plantRef(f.bare, "refs/ptp/products-foo/epics/0004");
    const s = readState({ workspace: f.ws });
    const resolved = childProcess.spawnSync(
      process.execPath,
      [path.join(__dirname, "ptp-resolve-workspace.js"), "--workspace", path.join("products", "foo")],
      { cwd: f.work, encoding: "utf8", windowsHide: true }
    );
    assertEq(resolved.status, 0, "ptp-resolve-workspace.js exit (" + resolved.stderr + ")");
    const slug = JSON.parse(resolved.stdout).slug;
    assertEq(slug, "products-foo", "resolver slug");
    assertEq(s.slug, slug, "slug");
    assertEq(s.namespace, "refs/ptp/" + slug + "/epics/", "namespace");
    assertEq(s.remoteMax, 4, "remote max");
  });
  add("remote: none prints the local max + 1 with exactly the fallback notice", (ctx) => {
    const f = makeFixture(ctx.tmp, "no-remote", { remotes: [], changes: ["0005_01_a"] });
    const r = runCli(["--workspace", f.ws]);
    assertEq(r.status, 0, "exit (" + r.stderr + ")");
    assertEq(r.stdout, "0006\n", "stdout");
    assertEq(r.stderr, NOTICE + "\n", "stderr");
    assertEq(mustGit(["for-each-ref", "refs/ptp/"], f.work), "", "local refs");
  });
  add("remote: a lone non-origin remote is used", (ctx) => {
    const f = makeFixture(ctx.tmp, "lone", { remotes: ["upstream"], changes: ["0001_01_a"] });
    plantRef(f.bares.upstream, "refs/ptp/epics/0004");
    const s = readState({ workspace: f.ws });
    assertEq(s.remote, "upstream", "remote");
    assertEq(s.remoteMax, 4, "remote max");
  });
  add("remote: a separate push URL is where claims are read", (ctx) => {
    const f = makeFixture(ctx.tmp, "push-url", { changes: ["0001_01_a"] });
    const pushBare = path.join(f.dir, "push.git");
    mustGit(["init", "-q", "--bare", pushBare], f.dir);
    mustGit(["remote", "set-url", "--push", "origin", pushBare], f.work);
    plantRef(pushBare, "refs/ptp/epics/0004");
    assertEq(allocate({ workspace: f.ws }).number, "0005", "first number");
    assertEq(allocate({ workspace: f.ws }).number, "0006", "second number");
    assertEq(listRefs(pushBare).join(","), "refs/ptp/epics/0004,refs/ptp/epics/0005,refs/ptp/epics/0006", "push refs");
    mustGit(["remote", "set-url", "--add", "--push", "origin", f.bare], f.work);
    const message = expectStop(() => allocate({ workspace: f.ws }), "several push URLs");
    assert(/several push URLs/.test(message), "message names several push URLs: " + message);
  });
  add("remote: two remotes without origin STOP", (ctx) => {
    const f = makeFixture(ctx.tmp, "two", { remotes: ["a", "b"], changes: ["0001_01_a"] });
    const message = expectStop(() => readState({ workspace: f.ws }), "two remotes");
    assert(/origin/.test(message), "message names origin: " + message);
    const r = runCli(["--workspace", f.ws]);
    assertEq(r.status, 1, "cli exit");
    assertEq(r.stdout, "", "cli stdout");
  });

  /* 2.3 -- claim push */
  add("claim: 0006 over local 0005, then the next run claims 0007", (ctx) => {
    const f = makeFixture(ctx.tmp, "claim", { changes: ["0005_01_a"] });
    const first = allocate({ workspace: f.ws });
    assertEq(first.number, "0006", "first number");
    assertEq(first.ref, "refs/ptp/epics/0006", "first ref");
    assertEq(first.notice, null, "first notice");
    assertEq(listRefs(f.bare).join(","), "refs/ptp/epics/0006", "refs after first");
    const r = runCli(["--workspace", f.ws]);
    assertEq(r.status, 0, "second exit (" + r.stderr + ")");
    assertEq(r.stdout, "0007\n", "second stdout");
    assertEq(r.stderr, "", "second stderr");
    assertEq(listRefs(f.bare).join(","), "refs/ptp/epics/0006,refs/ptp/epics/0007", "refs after second");
  });
  add("claim: remote claims outrank a lower local scan", (ctx) => {
    const f = makeFixture(ctx.tmp, "outrank", { changes: ["0005_01_a"] });
    plantRef(f.bare, "refs/ptp/epics/0007");
    assertEq(allocate({ workspace: f.ws }).number, "0008", "number");
  });
  add("claim: a nested workspace claims under its slug", (ctx) => {
    const f = makeFixture(ctx.tmp, "nested-claim", { nested: "products/foo", changes: ["0002_01_a"] });
    const result = allocate({ workspace: f.ws });
    assertEq(result.ref, "refs/ptp/products-foo/epics/0003", "ref");
    assertEq(listRefs(f.bare).join(","), "refs/ptp/products-foo/epics/0003", "refs");
  });
  add("claim: the commit is an empty tree with branch: and nonce: in its message", (ctx) => {
    const f = makeFixture(ctx.tmp, "message", { branch: "ptp/feature", changes: ["0001_01_a"] });
    const result = allocate({ workspace: f.ws });
    const ref = result.ref;
    const emptyTree = mustGit(["--git-dir", f.bare, "mktree"], undefined);
    assertEq(mustGit(["--git-dir", f.bare, "rev-parse", ref + "^{tree}"], undefined), emptyTree, "tree");
    assertEq(mustGit(["--git-dir", f.bare, "log", "-1", "--format=%P", ref], undefined), "", "parents");
    const body = mustGit(["--git-dir", f.bare, "log", "-1", "--format=%B", ref], undefined);
    assert(body.indexOf("ptp epic claim " + ref) === 0, "subject: " + body);
    assert(/^branch: ptp\/feature$/m.test(body), "branch line: " + body);
    assert(/^nonce: [0-9a-f]{16}$/m.test(body), "nonce line: " + body);
    const author = mustGit(["--git-dir", f.bare, "log", "-1", "--format=%an <%ae>|%cn <%ce>", ref], undefined);
    assertEq(author, "ptp-allocate-epic <ptp-allocate-epic@invalid>|ptp-allocate-epic <ptp-allocate-epic@invalid>", "identity");
  });
  add("claim: commit.gpgsign=true and no identity still claims", (ctx) => {
    const f = makeFixture(ctx.tmp, "gpgsign", { changes: ["0001_01_a"] });
    mustGit(["config", "commit.gpgsign", "true"], f.work);
    mustGit(["config", "gpg.program", "ptp-no-such-gpg-program"], f.work);
    mustGit(["config", "user.useConfigOnly", "true"], f.work);
    const result = allocate({ workspace: f.ws });
    assertEq(result.number, "0002", "number");
    assertEq(listRefs(f.bare).join(","), "refs/ptp/epics/0002", "refs");
  });
  add("claim: only a porcelain * line for the ref is a win", () => {
    const ref = "refs/ptp/epics/0001";
    const sha = "8b7339c048d65ee7fc486548fe219e1d2016f3de";
    const up = "To /x\n=\t" + sha + ":" + ref + "\t[up to date]\nDone\n";
    assertEq(porcelainFlag(up, ref), "=", "= flag");
    assertEq(isWin(up, ref), false, "= is no win");
    const won = "To /x\r\n*\t" + sha + ":" + ref + "\t[new reference]\r\nDone\r\n";
    assertEq(isWin(won, ref), true, "* is a win");
    const other = "To /x\n*\t" + sha + ":refs/ptp/epics/00010\t[new reference]\nDone\n";
    assertEq(isWin(other, ref), false, "another ref's * is no win");
    const stale = "To /x\n!\t" + sha + ":" + ref + "\t[rejected] (stale info)\nDone\n";
    assertEq(isWin(stale, ref), false, "! is no win");
    assertEq(isWin("", ref), false, "no line is no win");
  });

  /* 2.4 -- retry and STOP */
  add("race: a ref taken once before the push claims the next number", (ctx) => {
    const f = makeFixture(ctx.tmp, "race-once", { changes: ["0005_01_a"] });
    const taken = [];
    const result = allocate({
      workspace: f.ws,
      beforePush: (ref) => {
        if (taken.length === 0) {
          plantRef(f.bare, ref);
          taken.push(ref);
        }
      },
    });
    assertEq(taken.join(","), "refs/ptp/epics/0006", "taken");
    assertEq(result.number, "0007", "number");
    assertEq(listRefs(f.bare).join(","), "refs/ptp/epics/0006,refs/ptp/epics/0007", "refs");
  });
  add("race: a ref taken before every push STOPs after five attempts", (ctx) => {
    const f = makeFixture(ctx.tmp, "race-always", { changes: ["0005_01_a"] });
    const taken = [];
    const message = expectStop(
      () =>
        allocate({
          workspace: f.ws,
          beforePush: (ref) => {
            plantRef(f.bare, ref);
            taken.push(ref);
          },
        }),
      "always taken"
    );
    assertEq(taken.length, 5, "attempts");
    assertEq(taken[4], "refs/ptp/epics/0010", "last attempt");
    assert(/5 times/.test(message), "message names the attempts: " + message);
    assert(message.indexOf(f.bare) >= 0, "message names the URL: " + message);
  });
  add("refusal: a refusing pre-receive hook STOPs naming the URL, with no retry", (ctx) => {
    const f = makeFixture(ctx.tmp, "hook", { changes: ["0001_01_a"] });
    const hook = path.join(f.bare, "hooks", "pre-receive");
    fs.writeFileSync(hook, "#!/bin/sh\necho refused-by-fixture >&2\nexit 1\n");
    fs.chmodSync(hook, 0o755);
    spawnRecorder = [];
    const message = expectStop(() => allocate({ workspace: f.ws }), "hook");
    const pushes = spawnRecorder.filter((r) => r.args[0] === "push").length;
    spawnRecorder = null;
    assertEq(pushes, 1, "push attempts");
    assert(message.indexOf(f.bare) >= 0, "message names the URL: " + message);
    assert(/refused-by-fixture|pre-receive/.test(message), "message carries git's reason: " + message);
    assertEq(listRefs(f.bare).length, 0, "no ref");
  });
  add("unreachable: a missing remote path STOPs naming the URL and an SSH host alias", (ctx) => {
    const f = makeFixture(ctx.tmp, "missing", { remotes: [], changes: ["0001_01_a"] });
    const url = path.join(f.dir, "missing.git");
    mustGit(["remote", "add", "origin", url], f.work);
    const message = expectStop(() => allocate({ workspace: f.ws }), "missing remote");
    assert(message.indexOf(url) >= 0, "message names the URL: " + message);
    assert(/SSH host alias/.test(message), "message suggests an SSH host alias: " + message);
    const r = runCli(["--workspace", f.ws]);
    assertEq(r.status, 1, "cli exit");
    assertEq(r.stdout, "", "cli stdout");
    assert(r.stderr.indexOf(url) >= 0, "cli stderr names the URL: " + r.stderr);
  });
  add("race: four concurrent CLI claimants get distinct numbers", async (ctx) => {
    const first = makeFixture(ctx.tmp, "c0", { changes: ["0001_01_a"] });
    const workspaces = [first.ws];
    for (let i = 1; i < 4; i++) {
      const f = makeFixture(ctx.tmp, "c" + i, { remotes: [], changes: ["0001_01_a"] });
      mustGit(["remote", "add", "origin", first.bare], f.work);
      workspaces.push(f.ws);
    }
    const runs = await Promise.all(workspaces.map((ws) => runCliAsync(["--workspace", ws])));
    for (const r of runs) assertEq(r.status, 0, "exit (" + r.stderr + ")");
    const numbers = runs.map((r) => r.stdout.trim()).sort();
    assertEq(new Set(numbers).size, 4, "distinct numbers " + numbers.join(","));
    assertEq(
      listRefs(first.bare).join(","),
      numbers.map((n) => "refs/ptp/epics/" + n).join(","),
      "a claim ref per number"
    );
  });

  /* 2.5 -- --seed */
  add("seed: an empty remote with local 0091 claims 0091, then a normal run prints 0092", (ctx) => {
    const f = makeFixture(ctx.tmp, "seed-empty", { changes: ["0091_01_a"] });
    const r = runCli(["--workspace", f.ws, "--seed"]);
    assertEq(r.status, 0, "seed exit (" + r.stderr + ")");
    assertEq(r.stdout, "0091\n", "seed stdout");
    assertEq(r.stderr, "", "seed stderr");
    assertEq(listRefs(f.bare).join(","), "refs/ptp/epics/0091", "refs after seed");
    const n = runCli(["--workspace", f.ws]);
    assertEq(n.stdout, "0092\n", "normal stdout");
  });
  add("seed: a remote holding 0095 above local 0091 claims nothing and prints 0095", (ctx) => {
    const f = makeFixture(ctx.tmp, "seed-below", { changes: ["0091_01_a"] });
    plantRef(f.bare, "refs/ptp/epics/0095");
    const result = allocate({ workspace: f.ws, seed: true });
    assertEq(result.number, "0095", "number");
    assertEq(result.ref, null, "ref");
    assertEq(listRefs(f.bare).join(","), "refs/ptp/epics/0095", "refs");
  });
  add("seed: no local epic claims nothing", (ctx) => {
    const f = makeFixture(ctx.tmp, "seed-none", {});
    const result = allocate({ workspace: f.ws, seed: true });
    assertEq(result.number, "0000", "number");
    assertEq(listRefs(f.bare).length, 0, "refs");
  });
  add("seed: a ref taken before the push counts as done", (ctx) => {
    const f = makeFixture(ctx.tmp, "seed-taken", { changes: ["0091_01_a"] });
    const result = allocate({ workspace: f.ws, seed: true, beforePush: (ref) => plantRef(f.bare, ref) });
    assertEq(result.number, "0091", "number");
    assertEq(listRefs(f.bare).join(","), "refs/ptp/epics/0091", "refs");
  });
  add("seed: no remote STOPs", (ctx) => {
    const f = makeFixture(ctx.tmp, "seed-no-remote", { remotes: [], changes: ["0091_01_a"] });
    const r = runCli(["--workspace", f.ws, "--seed"]);
    assertEq(r.status, 1, "exit");
    assertEq(r.stdout, "", "stdout");
    assert(/remote/.test(r.stderr), "stderr names the remote: " + r.stderr);
  });

  /* 2.6 -- non-interactive env */
  add("env: every git spawn carries GIT_TERMINAL_PROMPT=0 and GCM_INTERACTIVE=never", (ctx) => {
    const f = makeFixture(ctx.tmp, "env", { changes: ["0001_01_a"] });
    const saved = { p: process.env.GIT_TERMINAL_PROMPT, g: process.env.GCM_INTERACTIVE };
    process.env.GIT_TERMINAL_PROMPT = "1";
    process.env.GCM_INTERACTIVE = "always";
    let records;
    try {
      spawnRecorder = [];
      allocate({ workspace: f.ws });
      records = spawnRecorder;
    } finally {
      spawnRecorder = null;
      if (saved.p === undefined) delete process.env.GIT_TERMINAL_PROMPT;
      else process.env.GIT_TERMINAL_PROMPT = saved.p;
      if (saved.g === undefined) delete process.env.GCM_INTERACTIVE;
      else process.env.GCM_INTERACTIVE = saved.g;
    }
    const verbs = records.map((r) => r.args[0]);
    for (const v of ["rev-parse", "remote", "ls-remote", "mktree", "commit-tree", "push"]) {
      assert(verbs.indexOf(v) >= 0, "a " + v + " spawn was recorded: " + verbs.join(","));
    }
    for (const r of records) {
      assertEq(r.env.GIT_TERMINAL_PROMPT, "0", "GIT_TERMINAL_PROMPT for " + r.args.join(" "));
      assertEq(r.env.GCM_INTERACTIVE, "never", "GCM_INTERACTIVE for " + r.args.join(" "));
    }
  });
  add("env: classifyGitFailure names exit 128 and ETIMEDOUT unreachable", () => {
    assertEq(classifyGitFailure({ status: 128, error: null }), "unreachable", "exit 128");
    const timedOut = new Error("spawnSync git ETIMEDOUT");
    timedOut.code = "ETIMEDOUT";
    assertEq(classifyGitFailure({ status: null, signal: "SIGTERM", error: timedOut }), "unreachable", "ETIMEDOUT");
    assertEq(classifyGitFailure({ status: 1, error: null }), "failed", "exit 1");
    assertEq(classifyGitFailure({ status: 0, error: null }), null, "exit 0");
  });

  /* 0093_01 -- the epic-id-generator gate */
  add("gate: unset generator prints local max + 1, no git, no notice, no ref", (ctx) => {
    const f = makeFixture(ctx.tmp, "gate-default", { generator: null, changes: ["0005_01_a"] });
    plantRef(f.bare, "refs/ptp/epics/0007");
    const r = runCli(["--workspace", f.ws]);
    assertEq(r.status, 0, "exit (" + r.stderr + ")");
    assertEq(r.stdout, "0006\n", "stdout");
    assertEq(r.stderr, "", "stderr");
    assertEq(listRefs(f.bare).join(","), "refs/ptp/epics/0007", "no new ref");
    spawnRecorder = [];
    const result = allocate({ workspace: f.ws });
    const spawns = spawnRecorder.length;
    spawnRecorder = null;
    assertEq(result.number, "0006", "number");
    assertEq(result.ref, null, "ref");
    assertEq(result.notice, null, "notice");
    assertEq(spawns, 0, "git spawns");
    const g = makeFixture(ctx.tmp, "gate-default-no-remote", { generator: null, remotes: [], changes: ["0005_01_a"] });
    const n = runCli(["--workspace", g.ws]);
    assertEq(n.stdout, "0006\n", "no-remote stdout");
    assertEq(n.stderr, "", "no-remote stderr");
  });
  add("gate: self works outside any git repository", (ctx) => {
    const dir = path.join(ctx.tmp, "plain");
    mkdirp(path.join(dir, "openspec", "changes", "0003_01_a"));
    const r = runCli(["--workspace", dir]);
    assertEq(r.status, 0, "exit (" + r.stderr + ")");
    assertEq(r.stdout, "0004\n", "stdout");
  });
  add("gate: resolveGenerator rejects non-exact values", (ctx) => {
    for (const value of [5, null, " github"]) {
      const f = makeFixture(ctx.tmp, "gate-bad-" + String(value).trim(), { generator: value });
      const got = resolveGenerator(f.ws);
      assertEq(got.value, "self", "value for " + JSON.stringify(value));
      assertEq(got.layer, "default", "layer for " + JSON.stringify(value));
    }
  });
  add("gate: a rejected workspace value falls to the project layer and claims", (ctx) => {
    const f = makeFixture(ctx.tmp, "gate-nested", { generator: null, nested: "products/foo", changes: ["0002_01_a"] });
    writeConfig(f.work, { "epic-id-generator": "github" });
    writeConfig(f.ws, { "epic-id-generator": "GitHub" });
    const got = resolveGenerator(f.ws);
    assertEq(got.value, "github", "value");
    assertEq(got.layer, "project", "layer");
    const result = allocate({ workspace: f.ws });
    assertEq(result.ref, "refs/ptp/products-foo/epics/0003", "ref");
  });
  add("gate: layering global < project < workspace", (ctx) => {
    const f = makeFixture(ctx.tmp, "gate-layers", { generator: null, nested: "products/foo" });
    const home = path.join(ctx.tmp, "home");
    mkdirp(home);
    writeConfig(home, { "epic-id-generator": "github" });
    writeConfig(f.work, { "epic-id-generator": "self" });
    process.env.PTP_HOME_DIR = home;
    try {
      const a = resolveGenerator(f.ws);
      assertEq(a.value + "/" + a.layer, "self/project", "project over global");
      writeConfig(f.ws, { "epic-id-generator": "github" });
      const b = resolveGenerator(f.ws);
      assertEq(b.value + "/" + b.layer, "github/workspace", "workspace over project");
    } finally {
      process.env.PTP_HOME_DIR = ctxHome;
    }
  });
  add("gate: --seed under self STOPs with no git and no ref", (ctx) => {
    const f = makeFixture(ctx.tmp, "gate-seed", { generator: null, changes: ["0091_01_a"] });
    const r = runCli(["--workspace", f.ws, "--seed"]);
    assertEq(r.status, 1, "exit");
    assertEq(r.stdout, "", "stdout");
    assertEq(
      r.stderr,
      "ptp-allocate-epic: --seed needs epic-id-generator set to github, and it resolves to self (default)\n",
      "stderr"
    );
    assertEq(listRefs(f.bare).length, 0, "no ref");
    spawnRecorder = [];
    expectStop(() => allocate({ workspace: f.ws, seed: true }), "seed under self");
    const spawns = spawnRecorder.length;
    spawnRecorder = null;
    assertEq(spawns, 0, "git spawns");
  });

  return cases;
}

// Isolates git from the user's own configuration for the whole run, then restores it.
const ISOLATED_UNSET = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_COMMON_DIR",
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
];

// The empty home the run points PTP_HOME_DIR at; a case with its own global layer restores it.
let ctxHome = null;

async function runSelfTest() {
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "ptp-allocate-epic-")));
  const emptyConfig = path.join(tmp, "empty-gitconfig");
  fs.writeFileSync(emptyConfig, "");
  const emptyHome = path.join(tmp, "empty-home");
  mkdirp(emptyHome);
  const touched = ["GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_GLOBAL", "PTP_HOME_DIR"].concat(ISOLATED_UNSET);
  const saved = {};
  for (const k of touched) saved[k] = Object.prototype.hasOwnProperty.call(process.env, k) ? process.env[k] : undefined;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.PTP_HOME_DIR = emptyHome;
  ctxHome = emptyHome;
  process.env.GIT_CONFIG_GLOBAL = emptyConfig;
  for (const k of ISOLATED_UNSET) delete process.env[k];

  let failed = 0;
  let passed = 0;
  try {
    const cases = buildCases();
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const ctx = { tmp: path.join(tmp, "case-" + i) };
      mkdirp(ctx.tmp);
      try {
        spawnRecorder = null;
        await c.fn(ctx);
        passed++;
        process.stdout.write("ok - " + c.name + "\n");
      } catch (e) {
        failed++;
        process.stdout.write("not ok - " + c.name + ": " + (e && e.message ? e.message : e) + "\n");
      } finally {
        spawnRecorder = null;
      }
    }
  } finally {
    for (const k of touched) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    } catch (e) {
      process.stdout.write("note: could not remove " + tmp + ": " + e.message + "\n");
    }
  }
  process.stdout.write(passed + " passed, " + failed + " failed\n");
  return failed === 0 ? 0 : 1;
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write("ptp-allocate-epic: unexpected error: " + (e && e.message ? e.message : e) + "\n");
    process.exitCode = 1;
  });
}

module.exports = {
  allocate: allocate,
  classifyGitFailure: classifyGitFailure,
  resolveGenerator: resolveGenerator,
  Stop: Stop,
  NOTICE: NOTICE,
};
