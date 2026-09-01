# IceFresh.kz — Codex project instructions

## Graphify-first code intelligence

For tasks involving codebase architecture, file relationships, dependency/call paths, change impact, or broad source discovery:

1. Check whether `graphify-out/graph.json` already exists.
2. If it exists, use the installed `graphify` skill and query/path/explain the graph before performing a broad manual source scan.
3. If no graph exists, build one only when it materially reduces source-reading effort; prefer local code-only structural extraction.
4. After changes, prefer incremental Graphify update rather than rebuilding the full graph.
5. Follow `.codex/skills/icefresh-graphify-policy/SKILL.md` to minimize token/credit usage.

Do not run deep semantic extraction or Graphify subagent batches by default. Use them only when the current task genuinely requires semantic analysis of non-code material.

Graphify is for navigation and impact analysis; direct source checks, tests, build/lint/typecheck, browser verification and independent release gates remain authoritative.