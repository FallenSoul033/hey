---
name: graphify
description: "Use for questions about the IceFresh codebase, architecture, file relationships, dependency paths, change impact, and project content. Prefer an existing graphify-out/graph.json; otherwise build a local code graph and use incremental updates."
---

# Graphify — Codex project bootstrap

Official source: https://github.com/Graphify-Labs/graphify
Reviewed upstream line: `v8`, package `graphifyy` 0.9.53 lineage.

This project-scoped bootstrap makes Graphify discoverable to Codex. When Graphify is needed, first check whether the full official Codex skill has already been materialized in this project and whether `graphify-out/graph.json` exists.

## First-use bootstrap

If this file is still the bootstrap rather than the full upstream-generated Graphify skill:

1. Prefer `uv` and install/update the official package:
   `uv tool install --upgrade graphifyy`
2. Materialize the official Codex skill and its `references/` sidecar into the current project:
   `graphify install --project --platform codex`
3. Re-open the resulting `.codex/skills/graphify/SKILL.md` and follow the official Graphify instructions from that point onward.
4. Also obey the permanent IceFresh credit policy in `.codex/skills/icefresh-graphify-policy/SKILL.md`.

If `uv` is unavailable, use an isolated `pipx install graphifyy` / `pipx upgrade graphifyy` path. Do not install unrelated packages.

## IceFresh fast path

Before broad source reading:

- If `graphify-out/graph.json` exists, use `graphify query`, `graphify path`, or `graphify explain` first.
- If no graph exists and the task is primarily source-code analysis, prefer one local code-only Graphify build.
- After source changes, prefer `graphify --update` instead of rebuilding the whole graph.
- Use Graphify to narrow the relevant files and dependency paths, then inspect only the source needed for the task.

Do not treat Graphify output as release certification. Focused tests, browser verification, QA/Security/UX gates and exact-artifact checks remain independent.