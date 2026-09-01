---
name: icefresh-graphify-policy
description: "Project policy for using Graphify efficiently in IceFresh.kz. Apply whenever Graphify is used for architecture, dependency, impact, or codebase questions."
---

# IceFresh Graphify Policy

Use Graphify as a code-intelligence accelerator, not as a mandatory expensive pipeline.

## Default behavior

1. If `graphify-out/graph.json` exists, query the existing graph first. Do not rebuild it merely because a new question was asked.
2. For architecture/dependency/change-impact questions, prefer `graphify query`, `graphify path`, and `graphify explain` before broad manual file scans.
3. If no graph exists and a graph would materially help, prefer one local code-only build. Structural code extraction is the default path.
4. After code changes, prefer incremental `--update` rather than a full rebuild.
5. Use the graph to narrow the relevant files, then read only those source files needed for implementation or verification.

## Credit guard

- Do not use `--mode deep` by default.
- Do not semantic-extract docs, images, PDFs, audio, or video unless the current task genuinely needs those materials.
- Do not launch semantic subagents merely to enrich an already sufficient code graph.
- Do not run multiple Graphify builds to answer the same question.
- Reuse extraction caches and existing `graphify-out/` outputs.
- Keep Graphify query budgets concise when a small scoped answer is enough.

## Release boundaries

Graphify is advisory code intelligence. It does not replace direct source verification, tests, build/lint/typecheck, browser/E2E evidence, Security, QA, UX acceptance, immutable artifact verification, or Admin production authorization.

For IceFresh production work, never infer a deployed version or PASS gate solely from Graphify output.