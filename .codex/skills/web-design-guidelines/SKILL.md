---
name: web-design-guidelines
description: "Review frontend/UI code against a reproducible, pinned Vercel Web Interface Guidelines ruleset. Use for UI review, accessibility checks, responsive/layout audits, UX implementation review, or pre-release frontend gates."
argument-hint: <file-or-pattern>
source: IceFresh adaptation of community web-design-guidelines using Vercel Labs rules
---

# Web Design Guidelines — IceFresh pinned gate

Review the requested frontend/UI files against the pinned Vercel Web Interface Guidelines ruleset.

## Pinned ruleset

Always use this exact source revision for reproducible reviews:

- Repository: `vercel-labs/web-interface-guidelines`
- Commit: `e3d624baaf29dc1fc645aff3e38f03e564d2d6b1`
- Rules file: `command.md`
- Raw source: `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/e3d624baaf29dc1fc645aff3e38f03e564d2d6b1/command.md`

Never silently replace this pinned revision with `main`, `latest`, or another commit. A ruleset update must be an explicit repository change so the same application artifact receives the same review rules later.

## Workflow

1. Fetch/read the pinned rules file above.
2. Read the user-specified file(s) or pattern.
3. Review against all applicable rules, including accessibility, focus, forms, keyboard/touch interactions, responsive/layout/overflow, images/CLS, animation/reduced-motion, performance, navigation/state, hydration, locale/i18n, content handling, and UI anti-patterns.
4. Report findings grouped by file using clickable `file:line` locations.
5. Keep findings concise and high-signal. State the defect and the expected correction; explain only when the fix is non-obvious.
6. Do not modify code unless the task explicitly asks for fixes.

## IceFresh release-gate policy

For an exact-artifact gate, include the pinned ruleset commit in the evidence: `e3d624baaf29dc1fc645aff3e38f03e564d2d6b1`.

Classify findings as:

- `FAIL` — objective defect affecting accessibility, keyboard/touch operability, responsive behavior/overflow, broken interaction, hydration/runtime correctness, material performance, data/state behavior, or an explicit Acceptance Criterion.
- `ADVISORY` — subjective or product-specific design preference that does not break the approved product baseline.

The approved IceFresh visual baseline and the task's Acceptance Criteria take precedence over generic stylistic preferences. Do not redesign an already approved interface merely to match a Vercel aesthetic preference.

Localization-sensitive guidance must be interpreted for the actual product language. English-specific copy conventions (for example English Title Case) are not automatic failures for Russian or Kazakh UI.

## Output format

```text
Ruleset: vercel-labs/web-interface-guidelines@e3d624baaf29dc1fc645aff3e38f03e564d2d6b1

## path/to/File.tsx
path/to/File.tsx:42 - FAIL - icon-only button missing accessible name
path/to/File.tsx:67 - ADVISORY - optional copy/style improvement

## path/to/Other.tsx
✓ pass
```

If no applicable issues are found, report `✓ pass` for the reviewed files. Never claim a whole release is approved unless the task explicitly assigns this skill as the authoritative gate.