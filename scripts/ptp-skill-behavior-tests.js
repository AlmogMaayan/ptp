#!/usr/bin/env node
"use strict";

/**
 * ptp-skill-behavior-tests.js
 * @ptp-generic-skill-harness
 *
 * Shared, content-agnostic fixture runner for PTP-owned skills. Handles two fixture shapes, each
 * with its own discovery rule and handler, and carries no skill-specific content of its own — every
 * skill name, rule-id prefix, category, banned token, pinned description, required reference, and
 * forbidden-restatement pattern comes from the fixture's own `meta` block:
 *
 *   1. `<skills-root>/<skill>/behavior-tests.md` — discovers every sibling of `SKILL.md`, evaluates
 *      its assertions against the skill body, and checks its pressure-test section structure
 *      (0057_09_ptp-tdd-and-systematic-debugging-skills).
 *   2. `tests/pressure/*.json` — discovers every case-fixture JSON file, validates its `meta` block,
 *      runs skill conformance / vocabulary / reference / finding-record / coverage passes against the
 *      skills it names (0057_10_ptp-code-review-and-verification-skills).
 *
 * Plain Node, zero dependencies, no network. Resolves every path from its own location so behavior
 * does not depend on the working directory.
 *
 * Usage: node scripts/ptp-skill-behavior-tests.js [skills-root]
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

// Sourced from the 0057_07 Superpowers migration slice: each replacement SKILL.md is
// "normally under 500 words", counted over the whole file (frontmatter included). The budget is soft
// per 0057_07; see the `budget-exception` handling below.
const MAX_SKILL_WORDS = 500;

const REQUIRED_LABELS = [
  "**Situation**",
  "**Pressure**",
  "**Required behavior**",
  "**Failure signature**",
];

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function stripFrontmatter(body) {
  const m = body.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? body.slice(m[0].length) : body;
}

function findJsonFences(text) {
  const fences = [];
  const re = /```json\n([\s\S]*?)\n```/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    fences.push({ index: match.index, raw: match[1] });
  }
  return fences;
}

function firstPressureHeadingIndex(text) {
  const m = text.match(/^## Pressure test:.*$/m);
  return m ? m.index : -1;
}

function parsePressureSections(text) {
  const headingRe = /^## .*$/gm;
  const headings = [];
  let m;
  while ((m = headingRe.exec(text)) !== null) {
    headings.push({ index: m.index, text: m[0] });
  }
  const sections = [];
  const malformed = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (!/^## Pressure test:/.test(h.text)) continue;
    const start = h.index;
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    const nameMatch = h.text.match(/^## Pressure test:\s*(.*)$/);
    const name = nameMatch ? nameMatch[1].trim() : "";
    if (name.length === 0) {
      malformed.push(h.text.trim());
      continue;
    }
    sections.push({ heading: h.text, body: text.slice(start, end) });
  }
  return { sections, malformed };
}

function isWithinRoot(root, target) {
  let realRoot;
  let realTarget;
  try {
    realRoot = fs.realpathSync(root);
    realTarget = fs.realpathSync(target);
  } catch (e) {
    return false;
  }
  const rel = path.relative(realRoot, realTarget);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function evaluateFixture(root, skillDir, skillName, results) {
  const fixturePath = path.join(skillDir, "behavior-tests.md");
  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!isWithinRoot(root, fixturePath)) {
    results.push({ skill: skillName, id: "fixture", why: "behavior-tests.md resolves outside the skills root (symlink escape)" });
    return;
  }
  const raw = normalize(fs.readFileSync(fixturePath, "utf8"));

  const fences = findJsonFences(raw);
  const pressureIdx = firstPressureHeadingIndex(raw);

  if (fences.length === 0) {
    results.push({ skill: skillName, id: "fixture", why: "no json fence found in behavior-tests.md" });
    return;
  }
  if (fences.length > 1) {
    results.push({ skill: skillName, id: "fixture", why: "more than one json fence found in behavior-tests.md" });
    return;
  }
  const fence = fences[0];
  if (pressureIdx !== -1 && fence.index > pressureIdx) {
    results.push({ skill: skillName, id: "fixture", why: "json fence appears after the first pressure-test heading" });
    return;
  }

  let declared;
  try {
    declared = JSON.parse(fence.raw);
  } catch (e) {
    results.push({ skill: skillName, id: "fixture", why: "json fence is not valid JSON: " + e.message });
    return;
  }

  if (!declared || typeof declared !== "object" || !Array.isArray(declared.assertions)) {
    results.push({ skill: skillName, id: "fixture", why: "fixture JSON must declare an assertions array" });
    return;
  }

  if (declared.skill !== skillName) {
    results.push({ skill: skillName, id: "fixture", why: "declared skill '" + declared.skill + "' does not match directory name" });
    return;
  }

  if (!fs.existsSync(skillMdPath)) {
    results.push({ skill: skillName, id: "fixture", why: "no sibling SKILL.md found for this skill" });
    return;
  }
  if (!isWithinRoot(root, skillMdPath)) {
    results.push({ skill: skillName, id: "fixture", why: "SKILL.md resolves outside the skills root (symlink escape)" });
    return;
  }

  const skillBody = stripFrontmatter(normalize(fs.readFileSync(skillMdPath, "utf8")));

  let assertionCount = 0;
  const seenIds = new Set();

  for (const assertion of declared.assertions) {
    const idLabel = assertion && typeof assertion.id === "string" && assertion.id.length > 0 ? assertion.id : "fixture";

    if (!assertion || typeof assertion.id !== "string" || assertion.id.length === 0) {
      results.push({ skill: skillName, id: "fixture", why: "an assertion is missing a non-empty id" });
      continue;
    }
    if (seenIds.has(assertion.id)) {
      results.push({ skill: skillName, id: "fixture", why: "duplicate assertion id '" + assertion.id + "'" });
      continue;
    }
    seenIds.add(assertion.id);

    if (typeof assertion.why !== "string" || assertion.why.length === 0) {
      results.push({ skill: skillName, id: idLabel, why: "assertion is missing a non-empty why" });
      continue;
    }

    if (!["requires", "forbids", "ordered"].includes(assertion.kind)) {
      results.push({ skill: skillName, id: idLabel, why: assertion.why + " (unknown assertion kind '" + assertion.kind + "')" });
      continue;
    }

    if (assertion.kind === "requires" || assertion.kind === "forbids") {
      if (typeof assertion.pattern !== "string" || assertion.pattern.length === 0) {
        results.push({ skill: skillName, id: idLabel, why: assertion.why + " (missing pattern)" });
        continue;
      }
      let re;
      try {
        re = new RegExp(assertion.pattern, "i");
      } catch (e) {
        results.push({ skill: skillName, id: idLabel, why: assertion.why + " (uncompilable pattern: " + e.message + ")" });
        continue;
      }
      const matched = re.test(skillBody);
      if (assertion.kind === "requires" && !matched) {
        results.push({ skill: skillName, id: idLabel, why: assertion.why });
        continue;
      }
      if (assertion.kind === "forbids" && matched) {
        results.push({ skill: skillName, id: idLabel, why: assertion.why });
        continue;
      }
      assertionCount++;
    } else {
      // ordered
      const patternsValid =
        Array.isArray(assertion.patterns) &&
        assertion.patterns.length >= 2 &&
        assertion.patterns.every((p) => typeof p === "string" && p.length > 0);
      if (!patternsValid) {
        results.push({ skill: skillName, id: idLabel, why: assertion.why + " (patterns must be an array of at least two non-empty strings)" });
        continue;
      }
      let offsets = [];
      let compileError = null;
      for (const p of assertion.patterns) {
        try {
          const re = new RegExp(p, "i");
          const m = re.exec(skillBody);
          offsets.push(m ? m.index : -1);
        } catch (e) {
          compileError = e;
          break;
        }
      }
      if (compileError) {
        results.push({ skill: skillName, id: idLabel, why: assertion.why + " (uncompilable pattern: " + compileError.message + ")" });
        continue;
      }
      let ok = offsets.every((o) => o !== -1);
      if (ok) {
        for (let i = 1; i < offsets.length; i++) {
          if (offsets[i] <= offsets[i - 1]) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) {
        results.push({ skill: skillName, id: idLabel, why: assertion.why });
        continue;
      }
      assertionCount++;
    }
  }

  const { sections, malformed } = parsePressureSections(raw);
  for (const heading of malformed) {
    results.push({
      skill: skillName,
      id: "structure",
      why: "pressure-test heading '" + heading + "' has no name after the colon",
    });
  }
  if (sections.length === 0) {
    results.push({ skill: skillName, id: "structure", why: "fixture carries no pressure-test section" });
  } else {
    for (const section of sections) {
      const missing = REQUIRED_LABELS.filter((label) => !section.body.includes(label));
      if (missing.length > 0) {
        results.push({
          skill: skillName,
          id: "structure",
          why: "pressure-test section '" + section.heading.trim() + "' is missing " + missing.join(", "),
        });
      }
    }
  }

  const priorFailures = results.filter((r) => r.skill === skillName).length;
  if (priorFailures === 0) {
    console.log("PASS " + skillName + " " + assertionCount + " assertions, " + sections.length + " pressure tests");
  }
}

// ---------------------------------------------------------------------------------------------
// Pressure-fixture pass: tests/pressure/*.json
// ---------------------------------------------------------------------------------------------

function wordCount(content) {
  return content.replace(/\r\n/g, "\n").trim().split(/\s+/u).filter(Boolean).length;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenPattern(token) {
  if (/^\w+$/.test(token)) {
    return new RegExp("\\b" + escapeRegExp(token) + "\\b");
  }
  return new RegExp(escapeRegExp(token));
}

function normPath(p) {
  return p.split(path.sep).join("/");
}

function collapseWhitespace(s) {
  return s.replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) break;
    count++;
    idx = found + 1;
  }
  return count;
}

function discoverPressureFixtures(repoRoot) {
  const dir = path.join(repoRoot, "tests", "pressure");
  if (!fs.existsSync(dir)) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => path.join(dir, e.name));
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function isArrayOfNonEmptyStrings(v) {
  return Array.isArray(v) && v.every((x) => isNonEmptyString(x));
}

function validatePressureMeta(meta, problems, fixtureLabel) {
  const push = (msg) => problems.push(fixtureLabel + ": " + msg);
  let ok = true;

  if (!Array.isArray(meta.skills) || meta.skills.length === 0) {
    push("meta.skills must be a non-empty array");
    ok = false;
  } else {
    const dirs = new Set();
    const prefixes = new Set();
    for (const s of meta.skills) {
      if (!s || typeof s !== "object" || !isNonEmptyString(s.dir) || !isNonEmptyString(s.prefix)) {
        push("every meta.skills entry must have a non-empty 'dir' and 'prefix'");
        ok = false;
        continue;
      }
      if (dirs.has(s.dir)) {
        push("meta.skills has a duplicate dir '" + s.dir + "'");
        ok = false;
      }
      dirs.add(s.dir);
      if (prefixes.has(s.prefix)) {
        push("meta.skills has a duplicate prefix '" + s.prefix + "'");
        ok = false;
      }
      prefixes.add(s.prefix);
    }
  }

  if (!Array.isArray(meta.categories) || meta.categories.length === 0 || !isArrayOfNonEmptyStrings(meta.categories)) {
    push("meta.categories must be a non-empty array of non-empty strings");
    ok = false;
  }

  for (const key of ["bannedTokens", "bannedContentPatterns", "forbiddenRestatements", "allowedAllCaps"]) {
    if (!Array.isArray(meta[key]) || !isArrayOfNonEmptyStrings(meta[key])) {
      push("meta." + key + " must be an array of non-empty strings");
      ok = false;
    }
  }

  if (!isNonEmptyString(meta.patternFlags)) {
    push("meta.patternFlags must be a non-empty string");
    ok = false;
  } else {
    const chars = meta.patternFlags.split("");
    if (new Set(chars).size !== chars.length) {
      push("meta.patternFlags must not repeat a flag character");
      ok = false;
    } else {
      try {
        // eslint-disable-next-line no-new
        new RegExp("x", meta.patternFlags);
      } catch (e) {
        push("meta.patternFlags is not a valid set of RegExp flags: " + e.message);
        ok = false;
      }
    }
  }

  if (ok) {
    for (const patSrc of [].concat(meta.bannedContentPatterns, meta.forbiddenRestatements)) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(patSrc, meta.patternFlags);
      } catch (e) {
        push("pattern '" + patSrc + "' does not compile as a regex: " + e.message);
        ok = false;
      }
    }
  }

  const dirsOk = Array.isArray(meta.skills) && ok !== undefined;
  const skillDirs = Array.isArray(meta.skills) ? meta.skills.filter((s) => s && isNonEmptyString(s.dir)).map((s) => s.dir) : [];

  if (!meta.descriptions || typeof meta.descriptions !== "object" || Array.isArray(meta.descriptions)) {
    push("meta.descriptions must be an object");
    ok = false;
  } else {
    for (const dir of skillDirs) {
      if (!isNonEmptyString(meta.descriptions[dir])) {
        push("meta.descriptions['" + dir + "'] must be a non-empty string");
        ok = false;
      }
    }
  }

  if (!meta.requiredReferences || typeof meta.requiredReferences !== "object" || Array.isArray(meta.requiredReferences)) {
    push("meta.requiredReferences must be an object");
    ok = false;
  } else {
    for (const dir of skillDirs) {
      const v = meta.requiredReferences[dir];
      if (!Array.isArray(v) || v.length === 0 || !isArrayOfNonEmptyStrings(v)) {
        push("meta.requiredReferences['" + dir + "'] must be a non-empty array of non-empty strings");
        ok = false;
        continue;
      }
      for (const p of v) {
        try {
          // eslint-disable-next-line no-new
          new RegExp(p, meta.patternFlags || "");
        } catch (e) {
          push("meta.requiredReferences['" + dir + "'] pattern '" + p + "' does not compile: " + e.message);
          ok = false;
        }
      }
    }
  }

  if (!meta.expectedRuleIds || typeof meta.expectedRuleIds !== "object" || Array.isArray(meta.expectedRuleIds)) {
    push("meta.expectedRuleIds must be an object");
    ok = false;
  } else {
    for (const skillEntry of Array.isArray(meta.skills) ? meta.skills : []) {
      if (!skillEntry || !isNonEmptyString(skillEntry.dir) || !isNonEmptyString(skillEntry.prefix)) continue;
      const dir = skillEntry.dir;
      const prefix = skillEntry.prefix;
      const v = meta.expectedRuleIds[dir];
      if (!Array.isArray(v) || v.length === 0 || !isArrayOfNonEmptyStrings(v)) {
        push("meta.expectedRuleIds['" + dir + "'] must be a non-empty array of non-empty strings");
        ok = false;
        continue;
      }
      const seen = new Set();
      const idRe = new RegExp("^" + escapeRegExp(prefix) + "-\\d+$");
      for (const id of v) {
        if (!idRe.test(id)) {
          push("meta.expectedRuleIds['" + dir + "'] contains '" + id + "', which is not correctly prefixed");
          ok = false;
        }
        if (seen.has(id)) {
          push("meta.expectedRuleIds['" + dir + "'] contains a duplicate id '" + id + "'");
          ok = false;
        }
        seen.add(id);
      }
    }
  }

  if (!isArrayOfNonEmptyStrings(meta.severityVocabulary) || meta.severityVocabulary.length === 0) {
    push("meta.severityVocabulary must be a non-empty array of non-empty strings");
    ok = false;
  }
  if (!isArrayOfNonEmptyStrings(meta.verdictVocabulary) || meta.verdictVocabulary.length === 0) {
    push("meta.verdictVocabulary must be a non-empty array of non-empty strings");
    ok = false;
  }
  if (!isNonEmptyString(meta.severitySource)) {
    push("meta.severitySource must be a non-empty string");
    ok = false;
  }

  if (!meta.findingRecord || typeof meta.findingRecord !== "object" || Array.isArray(meta.findingRecord)) {
    push("meta.findingRecord must be an object");
    ok = false;
  } else {
    if (!isNonEmptyString(meta.findingRecord.source)) {
      push("meta.findingRecord.source must be a non-empty string");
      ok = false;
    }
    if (!isArrayOfNonEmptyStrings(meta.findingRecord.fields) || meta.findingRecord.fields.length === 0) {
      push("meta.findingRecord.fields must be a non-empty array of non-empty strings");
      ok = false;
    } else if (new Set(meta.findingRecord.fields).size !== meta.findingRecord.fields.length) {
      push("meta.findingRecord.fields must not contain a duplicate field");
      ok = false;
    }
    if (!isNonEmptyString(meta.findingRecord.skill) || !skillDirs.includes(meta.findingRecord.skill)) {
      push("meta.findingRecord.skill must be one of meta.skills' directory names");
      ok = false;
    }
  }

  return ok;
}

function checkSkillConformance(repoRoot, dirName, ownPrefix, allPrefixes, meta, problems) {
  const relSkillPath = "skills/" + dirName + "/SKILL.md";
  const skillPath = path.join(repoRoot, "skills", dirName, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    problems.push(relSkillPath + ": file does not exist");
    return null;
  }
  const raw = normalize(fs.readFileSync(skillPath, "utf8"));

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\r?\n?/);
  if (!fmMatch) {
    problems.push(relSkillPath + ": missing YAML frontmatter delimited by '---' lines");
    return null;
  }
  const frontmatter = fmMatch[1];
  const body = raw.slice(fmMatch[0].length);

  // `name` and `description` are read line-wise below, which is only equivalent to reading the YAML
  // scalar when the frontmatter carries no multi-line scalar. A folded (`>`), literal (`|`), or
  // plain multi-line value would let a line-wise read see a first line that matches the pinned
  // trigger while the real description carries more, defeating the character-for-character pin. So
  // require every non-empty frontmatter line to be a `key: value` line, and reject anything else
  // rather than mis-reading it.
  for (const fmLine of frontmatter.split("\n")) {
    if (fmLine.trim() === "") continue;
    if (!/^[A-Za-z_][\w-]*:\s*\S.*$/.test(fmLine)) {
      problems.push(relSkillPath + ": frontmatter line is not a single-line 'key: value' pair: '" + fmLine.trim().slice(0, 80) + "'");
    }
  }

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : null;
  if (name !== dirName) {
    problems.push(relSkillPath + ": frontmatter name '" + name + "' does not equal directory name '" + dirName + "'");
  }

  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  let description = descMatch ? descMatch[1].trim() : null;
  if (description && ((description.startsWith('"') && description.endsWith('"')) || (description.startsWith("'") && description.endsWith("'")))) {
    description = description.slice(1, -1);
  }
  const expectedDescription = meta.descriptions[dirName];
  if (description !== expectedDescription) {
    problems.push(relSkillPath + ": frontmatter description does not exactly equal the pinned trigger sentence");
  }

  const words = wordCount(raw);
  const hasBudgetException = /^<!--\s*budget-exception:\s*\S.*-->\s*$/m.test(body);
  if (words >= MAX_SKILL_WORDS && !hasBudgetException) {
    problems.push(relSkillPath + ": whole-file word count " + words + " is at or over the " + MAX_SKILL_WORDS + "-word budget with no budget-exception line");
  }

  if (/superpower[s]:/.test(raw)) {
    problems.push(relSkillPath + ": contains an external-plugin invocation token");
  }
  if (/\bclaude\b/i.test(raw)) {
    problems.push(relSkillPath + ": names an agent ('claude')");
  }
  if (/\bcodex\b/i.test(raw)) {
    problems.push(relSkillPath + ": names an agent ('codex')");
  }

  for (const token of meta.bannedTokens) {
    const re = tokenPattern(token);
    if (re.test(raw)) {
      problems.push(relSkillPath + ": contains the banned token '" + token + "'");
    }
  }

  // Whole-file scope, frontmatter included: the agent-neutrality clause these patterns enforce
  // (no model choice, no effort choice, no subagent dispatch) is stated over the whole file, not
  // over the body alone. The reference and restatement passes below stay body-scoped, which is the
  // scope their own clauses name.
  const contentBanRes = meta.bannedContentPatterns.map((p) => ({ source: p, re: new RegExp(p, meta.patternFlags) }));
  for (const cp of contentBanRes) {
    if (cp.re.test(raw)) {
      problems.push(relSkillPath + ": matches banned content pattern '" + cp.source + "'");
    }
  }

  const forbiddenRes = meta.forbiddenRestatements.map((p) => ({ source: p, re: new RegExp(p, meta.patternFlags) }));
  for (const fp of forbiddenRes) {
    if (fp.re.test(body)) {
      problems.push(relSkillPath + ": matches forbidden-restatement pattern '" + fp.source + "'");
    }
  }

  const requiredRefs = (meta.requiredReferences[dirName] || []).map((p) => ({ source: p, re: new RegExp(p, meta.patternFlags) }));
  for (const rp of requiredRefs) {
    if (!rp.re.test(body)) {
      problems.push(relSkillPath + ": missing required reference matching '" + rp.source + "'");
    }
  }

  const allCapsRe = /\b[A-Z]{3,}\b/g;
  let cm;
  while ((cm = allCapsRe.exec(body)) !== null) {
    const tok = cm[0];
    if (!meta.verdictVocabulary.includes(tok) && !meta.allowedAllCaps.includes(tok)) {
      problems.push(relSkillPath + ": uses an invented all-caps token '" + tok + "' outside meta.verdictVocabulary/meta.allowedAllCaps");
    }
  }
  const sevLineRe = /^\s*severity:\s*(.+)$/gm;
  let sm;
  while ((sm = sevLineRe.exec(body)) !== null) {
    const sevWords = sm[1].match(/\b[A-Z][a-zA-Z]*\b/g) || [];
    for (const w of sevWords) {
      if (!meta.severityVocabulary.includes(w)) {
        problems.push(relSkillPath + ": severity line uses an undeclared label '" + w + "'");
      }
    }
  }

  const allPrefixAlt = allPrefixes.map(escapeRegExp).join("|");
  const idRe = new RegExp("\\b(" + allPrefixAlt + ")-(\\d+)\\b", "g");
  const occurrences = [];
  let m;
  while ((m = idRe.exec(body)) !== null) {
    occurrences.push({ id: m[0], prefix: m[1], index: m.index });
  }
  const own = occurrences.filter((o) => o.prefix === ownPrefix);
  const foreign = occurrences.filter((o) => o.prefix !== ownPrefix);
  for (const f of foreign) {
    problems.push(relSkillPath + ": uses a foreign rule-id prefix '" + f.id + "'");
  }
  if (own.length === 0) {
    problems.push(relSkillPath + ": declares no rule ids");
  }
  const seenOwn = new Set();
  const dupIds = new Set();
  for (const o of own) {
    if (seenOwn.has(o.id)) dupIds.add(o.id);
    seenOwn.add(o.id);
  }
  for (const d of dupIds) {
    problems.push(relSkillPath + ": declares a duplicate rule id '" + d + "'");
  }

  // A rule's own text is its bullet inside the single '## Rules' section, never the whole tail of
  // the file. Without the section bound the last rule's span runs to the end of the body, so that
  // rule could be emptied while its anchor survived in a later section and the gate would still
  // pass -- exactly the failure the anchor exists to catch.
  const rulesSectionStart = (() => {
    const m = body.match(/^## Rules\s*$/m);
    return m === null ? -1 : body.indexOf("\n", m.index) + 1;
  })();
  const spanFrom = rulesSectionStart === -1 ? 0 : rulesSectionStart;
  const spanTo = (() => {
    if (rulesSectionStart === -1) return body.length;
    const rel = body.slice(rulesSectionStart).search(/^## /m);
    return rel === -1 ? body.length : rulesSectionStart + rel;
  })();
  const inRulesSection = own.filter((o) => o.index >= spanFrom && o.index < spanTo);
  const ruleSpans = new Map();
  for (let i = 0; i < inRulesSection.length; i++) {
    if (ruleSpans.has(inRulesSection[i].id)) continue;
    const start = inRulesSection[i].index;
    const end = i + 1 < inRulesSection.length ? inRulesSection[i + 1].index : spanTo;
    ruleSpans.set(inRulesSection[i].id, body.slice(start, end));
  }

  const expectedIds = meta.expectedRuleIds[dirName] || [];
  const missingFromBody = expectedIds.filter((id) => !seenOwn.has(id));
  const extraInBody = [...seenOwn].filter((id) => !expectedIds.includes(id));
  if (missingFromBody.length || extraInBody.length) {
    problems.push(
      relSkillPath +
        ": extracted rule-id set does not equal meta.expectedRuleIds (missing: " +
        (missingFromBody.join(", ") || "none") +
        "; extra: " +
        (extraInBody.join(", ") || "none") +
        ")"
    );
  }

  const rulesHeadingRe = /^## Rules\s*$/gm;
  const rulesHeadings = [];
  let rh;
  while ((rh = rulesHeadingRe.exec(body)) !== null) rulesHeadings.push(rh.index);
  if (rulesHeadings.length !== 1) {
    problems.push(relSkillPath + ": must carry exactly one '## Rules' heading (found " + rulesHeadings.length + ")");
  } else {
    const headingIdx = rulesHeadings[0];
    const afterHeadingLineStart = body.indexOf("\n", headingIdx) + 1;
    const rest = body.slice(afterHeadingLineStart);
    const nextHeadingRel = rest.search(/^## /m);
    const sectionEnd = nextHeadingRel === -1 ? body.length : afterHeadingLineStart + nextHeadingRel;
    const section = body.slice(afterHeadingLineStart, sectionEnd);
    const ownIdRe = new RegExp("^" + escapeRegExp(ownPrefix) + "-\\d+\\s");
    for (const line of section.split("\n")) {
      const bulletMatch = line.match(/^-\s+(.*)$/);
      if (!bulletMatch) continue;
      if (!ownIdRe.test(bulletMatch[1])) {
        problems.push(relSkillPath + ": a rule bullet does not begin with its own rule id: '" + line.trim().slice(0, 80) + "'");
      }
    }
  }

  return { ownIds: seenOwn, ruleSpans, body, raw };
}

function checkFindingRecord(skillResult, meta, problems) {
  const dirName = meta.findingRecord.skill;
  if (!skillResult) return;
  const body = skillResult.body;
  const fenceRe = /```\n([\s\S]*?)\n```/g;
  const fences = [];
  let m;
  while ((m = fenceRe.exec(body)) !== null) fences.push(m[1]);
  if (fences.length === 0) {
    problems.push(dirName + ": no untagged fenced code block found for the finding record");
    return;
  }
  if (fences.length > 1) {
    problems.push(dirName + ": more than one untagged fenced code block found (expected exactly one, the finding record)");
    return;
  }
  const labels = [];
  let malformed = false;
  for (const line of fences[0].split("\n")) {
    if (line.trim() === "") continue;
    if (/^[ \t]/.test(line)) continue; // indented continuation line
    const lm = line.match(/^([a-z]+):\s/);
    if (!lm) {
      problems.push(dirName + ": finding-record line does not match the '<label>: ' shape: '" + line + "'");
      malformed = true;
      continue;
    }
    labels.push(lm[1]);
  }
  if (malformed) return;
  const expected = meta.findingRecord.fields;
  const seen = new Set();
  const dupSet = new Set();
  for (const l of labels) {
    if (seen.has(l)) dupSet.add(l);
    seen.add(l);
  }
  if (dupSet.size > 0) problems.push(dirName + ": finding-record has duplicate labels: " + [...dupSet].join(", "));
  const unknown = labels.filter((l) => !expected.includes(l));
  if (unknown.length) problems.push(dirName + ": finding-record has unknown labels: " + unknown.join(", "));
  const missing = expected.filter((f) => !labels.includes(f));
  if (missing.length) problems.push(dirName + ": finding-record is missing labels: " + missing.join(", "));
  const sameOrder = labels.length === expected.length && labels.every((l, i) => l === expected[i]);
  if (!sameOrder && dupSet.size === 0 && unknown.length === 0 && missing.length === 0) {
    problems.push(dirName + ": finding-record labels are out of order (expected: " + expected.join(", ") + ")");
  }
}

function validateAndScoreCases(cases, meta, skillResults, problems) {
  const seenIds = new Set();
  const perSkillCoveredRules = {};
  const perCategoryCovered = new Set();
  for (const dir of meta.skills.map((s) => s.dir)) perSkillCoveredRules[dir] = new Set();
  const skillDirs = meta.skills.map((s) => s.dir);
  let anchorCount = 0;

  cases.forEach((c, idx) => {
    const label = c && isNonEmptyString(c.id) ? c.id : "case#" + idx;
    const requiredStrFields = ["id", "skill", "ruleId", "ruleAnchor", "category", "scenario", "expectedOutcome"];
    let structOk = true;
    for (const f of requiredStrFields) {
      if (!c || !isNonEmptyString(c[f])) {
        problems.push("case " + label + ": field '" + f + "' must be a non-empty string");
        structOk = false;
      }
    }
    for (const f of ["mustContain", "mustNotContain"]) {
      if (!c || !isArrayOfNonEmptyStrings(c[f]) || c[f].length === 0) {
        problems.push("case " + label + ": field '" + f + "' must be a non-empty array of non-empty strings");
        structOk = false;
      }
    }
    if (!structOk) return;

    if (seenIds.has(c.id)) {
      problems.push("case " + c.id + ": duplicate case id");
    }
    seenIds.add(c.id);

    if (!skillDirs.includes(c.skill)) {
      problems.push("case " + c.id + ": skill '" + c.skill + "' is not one of meta.skills");
      return;
    }
    if (meta.categories.includes(c.category)) {
      perCategoryCovered.add(c.category);
    } else {
      problems.push("case " + c.id + ": category '" + c.category + "' is not one of meta.categories");
    }

    const skillResult = skillResults[c.skill];
    if (!skillResult) {
      problems.push("case " + c.id + ": skill '" + c.skill + "' has no conformance result to check against");
      return;
    }
    if (!skillResult.ownIds.has(c.ruleId)) {
      problems.push("case " + c.id + ": ruleId '" + c.ruleId + "' does not resolve to a rule declared in " + c.skill);
      return;
    }
    perSkillCoveredRules[c.skill].add(c.ruleId);

    // Whitespace (including a Markdown soft-wrap newline) is collapsed before comparison: line
    // wrapping is a formatting artifact of the source file, not a break in the rule's own text, so
    // an anchor spanning a wrap point is still "verbatim" in the sense that matters here.
    const ruleText = collapseWhitespace(skillResult.ruleSpans.get(c.ruleId) || "");
    const anchor = c.ruleAnchor;
    const anchorWordCount = anchor.trim().split(/\s+/).filter(Boolean).length;
    if (anchorWordCount < 4) {
      problems.push("case " + c.id + ": ruleAnchor must be at least four words long");
    }
    const occ = countOccurrences(ruleText, collapseWhitespace(anchor));
    if (occ !== 1) {
      problems.push("case " + c.id + ": ruleAnchor does not occur exactly once within rule " + c.ruleId + "'s own text (found " + occ + ")");
    } else {
      anchorCount++;
    }
  });

  for (const dir of skillDirs) {
    const skillResult = skillResults[dir];
    if (!skillResult) continue;
    for (const id of skillResult.ownIds) {
      if (!perSkillCoveredRules[dir].has(id)) {
        problems.push(dir + ": rule '" + id + "' has no covering pressure case");
      }
    }
  }
  for (const cat of meta.categories) {
    if (!perCategoryCovered.has(cat)) {
      problems.push("category '" + cat + "' has no covering pressure case");
    }
  }

  return { anchorCount };
}

function runPressureFixture(fixturePath, repoRoot, problems) {
  const relPath = normPath(path.relative(repoRoot, fixturePath));
  let raw;
  try {
    raw = fs.readFileSync(fixturePath, "utf8");
  } catch (e) {
    problems.push(relPath + ": fixture is unreadable: " + e.message);
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    problems.push(relPath + ": fixture is not valid JSON: " + e.message);
    return;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.meta !== "object" || data.meta === null || Array.isArray(data.meta) || !Array.isArray(data.cases)) {
    problems.push(relPath + ": fixture root must be an object with a 'meta' object and a 'cases' array");
    return;
  }
  if (data.cases.length === 0) {
    problems.push(relPath + ": fixture 'cases' array is empty");
    // Do not return here: the skill-conformance pass below still names any missing/nonconforming
    // SKILL.md files even while the corpus is empty, so both problems are reported together.
  }

  const metaProblems = [];
  const metaOk = validatePressureMeta(data.meta, metaProblems, relPath);
  if (!metaOk) {
    problems.push(...metaProblems);
    problems.push(relPath + ": meta validation failed; skill-conformance and corpus passes skipped for this fixture");
    return;
  }

  const meta = data.meta;
  const allPrefixes = meta.skills.map((s) => s.prefix);
  const skillResults = {};
  for (const s of meta.skills) {
    skillResults[s.dir] = checkSkillConformance(repoRoot, s.dir, s.prefix, allPrefixes, meta, problems);
  }

  checkFindingRecord(skillResults[meta.findingRecord.skill], meta, problems);

  const beforeCaseCount = problems.length;
  const { anchorCount } = validateAndScoreCases(data.cases, meta, skillResults, problems);

  if (problems.length === beforeCaseCount || problems.length === 0) {
    // No-op branch retained for clarity; summary is printed by the caller.
  }

  return {
    skillCount: meta.skills.length,
    ruleCount: meta.skills.reduce((acc, s) => acc + ((skillResults[s.dir] && skillResults[s.dir].ownIds.size) || 0), 0),
    caseCount: data.cases.length,
    anchorCount,
  };
}

function runPressurePass(repoRoot, problems) {
  const fixtures = discoverPressureFixtures(repoRoot);
  if (fixtures.length === 0) {
    problems.push("tests/pressure/*.json: no pressure-fixture files found");
    return;
  }
  let totals = { skillCount: 0, ruleCount: 0, caseCount: 0, anchorCount: 0 };
  for (const fixturePath of fixtures) {
    const before = problems.length;
    const stats = runPressureFixture(fixturePath, repoRoot, problems);
    if (stats && problems.length === before) {
      totals.skillCount += stats.skillCount;
      totals.ruleCount += stats.ruleCount;
      totals.caseCount += stats.caseCount;
      totals.anchorCount += stats.anchorCount;
      console.log(
        "PASS " +
          normPath(path.relative(repoRoot, fixturePath)) +
          " " +
          stats.skillCount +
          " skills, " +
          stats.ruleCount +
          " rules, " +
          stats.caseCount +
          " cases, " +
          stats.anchorCount +
          " anchors"
      );
    }
  }
}

function main() {
  const root = process.argv[2] || path.join(__dirname, "..", "skills");

  let entries = [];
  if (fs.existsSync(root)) {
    entries = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
  }

  const fixtureDirs = entries
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(root, name, "behavior-tests.md")));

  // Absence of one fixture shape is not a failure while the other shape is present: the two shapes
  // land in independent changes and either may apply first. Report the absence and continue; the
  // "neither shape found" case still fails, because runPressurePass records its own problem when
  // tests/pressure/*.json is empty and that problem is accounted for below.
  if (fixtureDirs.length === 0) {
    console.log("no behavior-test fixtures found under " + root);
  }

  const results = [];
  for (const name of fixtureDirs) {
    evaluateFixture(root, path.join(root, name), name, results);
  }

  for (const r of results) {
    console.log("FAIL " + r.skill + " " + r.id + ": " + r.why);
  }

  // Second fixture shape: tests/pressure/*.json (0057_10_ptp-code-review-and-verification-skills).
  const pressureProblems = [];
  runPressurePass(REPO_ROOT, pressureProblems);
  for (const p of pressureProblems) {
    console.log("FAIL " + p);
  }

  if (results.length > 0 || pressureProblems.length > 0) {
    process.exit(1);
  }

  console.log(
    "OK: " +
      fixtureDirs.length +
      " behavior-test skill(s) clean; pressure fixtures clean (see PASS lines above for per-fixture skill/rule/case/anchor counts)"
  );
  process.exit(0);
}

main();
