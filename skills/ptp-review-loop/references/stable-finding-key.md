# Stable finding key

Loaded by `skills/ptp-review-loop/SKILL.md` when computing or comparing a stable finding
key. That skill remains the owner of key computation; this file is its detail.

Used to match findings across iterations for carry-over rejection deduplication.

**For `kind=code`:**

```
key = {
  normalized_repo_path: path with backslashes normalised to forward slashes,
  line_range_bucket:    round(first_cited_line / 5) * 5,   // tolerates small drift
  severity:             Critical | High | Medium | Low,
                        // fail-safe case only: an unrankable finding records the reviewer's raw
                        // label verbatim, or `<unlabeled>` when none was emitted
                        // (see ## Severity threshold)
  summary:              finding_one_line_description[:60]
}
```

The `line_range_bucket` rounding tolerates the few-line drift that a fix typically introduces in surrounding line numbers.

**For `kind=artifact`:**

```
key = {
  artifact_filename: basename of the artifact file (e.g. "proposal.md", "spec.md"),
  section_heading:   nearest enclosing ## / ### heading text,
  summary:           finding_one_line_description[:60]
}
```

Artifact keys do not use line numbers because section headings renumber after edits.

**For `kind=brainstorm`:** reuse the `kind=artifact` key with `artifact_filename = "brainstorm.md"` (plus the nearest enclosing `section_heading` and the truncated `summary`). Like artifact keys, it uses no line numbers so findings deduplicate across iterations as section headings renumber. The missing-`brainstorm.md` Critical finding has no enclosing heading, so it uses the sentinel `section_heading = "<missing file>"` — `artifact_filename` + this sentinel + its constant `summary` stay stable across iterations, so the unfixable finding deduplicates correctly until the iteration-cap backstop.

**For `kind=prd`:** reuse the `kind=artifact` key with `artifact_filename = "prd.md"` (the constant PRD basename; plus the nearest enclosing `section_heading` and the truncated `summary`). Like artifact keys, it uses no line numbers so findings deduplicate across iterations as section headings renumber. The missing-PRD Critical finding has no enclosing heading, so it uses the sentinel `section_heading = "<missing file>"` — `artifact_filename` + this sentinel + its constant `summary` stay stable across iterations, so the unfixable finding deduplicates correctly until the iteration-cap backstop.
