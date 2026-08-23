# IceFresh.kz Release Engineering Playbook

Status: project standard

This document records the release-engineering practices proven during the RC1.6.x cycle. It is intended for Development, Admin, Security Gate, and QA agents.

## 1. Canonical source and scope

- Full frontend source of truth is the canonical IceFresh Sites source associated with `appgprj_6a7f95ab99fc819199edf9fc21a5eb6a`.
- `FallenSoul033/hey -> main` is not the source of truth for the complete frontend; use it for trace, evidence, CI harnesses, and narrowly scoped maintenance only when explicitly appropriate.
- Production backend source of truth is Supabase project `ogjfqnbgauuhbmauioea`.
- Never widen a narrow hotfix into a rewrite.
- If a UI/build-only task would require changing backend, RPC, Auth/RLS, grants, migrations, permissions, or transaction semantics, stop and escalate instead of silently expanding scope.

## 2. Immutable candidate rule

Once a release candidate is handed off, its bytes are immutable.

Identity is the tuple:

1. exact filename;
2. byte size;
3. SHA-256.

Rules:

- Never overwrite an existing candidate ZIP.
- Any application/frontend byte change creates a new candidate filename and new SHA-256.
- Trace/evidence commits may be added later, but they must not mutate the already-published candidate.
- Before final handoff, explicitly record `candidate bytes changed: NO` when applicable.

## 3. Kaizen debugging sequence

For every blocker:

1. freeze and record the baseline;
2. reproduce the exact failure;
3. identify root cause;
4. apply the smallest correct patch;
5. run targeted verification;
6. run full regression;
7. only then move to the next blocker.

Do not call a check PASS unless it was actually executed against the relevant candidate or runtime.

## 4. Exact-artifact CI gate

Repository checkout is not proof that an immutable release ZIP passes.

The independent runner must receive the exact candidate artifact. Before extraction it must print and verify:

- filename;
- byte size;
- SHA-256.

If any identity value differs, stop immediately and do not extract or test the artifact.

Only after identity PASS may the runner execute the release gates.

Preferred transport for IceFresh:

- encrypted artifact carrier;
- GitHub-hosted runner;
- GitHub Actions OIDC for temporary artifact-key authorization;
- no raw transport key in frontend, repository files, logs, or release reports.

A manual `workflow_dispatch` is the preferred recovery path when connector-generated GitHub events do not trigger Actions reliably.

## 5. Standard release build gate

After exact identity PASS, run in this order:

1. `npm ci`
2. `npm run lint`
3. full project typecheck
4. `npm run build`
5. `node --test tests/*.test.mjs`
6. built-preview HTTP smoke

Record GitHub Actions run ID and job ID in release evidence.

## 6. Multi-runtime typecheck strategy

IceFresh contains multiple runtime targets and must not force them through one inaccurate TypeScript environment.

### App / Node-facing TypeScript

Use the root application TypeScript configuration for application code.

### Cloudflare Worker

- generate/use Cloudflare runtime bindings through Wrangler types;
- validate Worker code with its dedicated TypeScript target;
- keep real runtime types such as `Fetcher`, `D1Database`, and asset bindings;
- do not replace them with global `any` shims.

### Supabase Edge Functions / Deno

- validate Edge Functions with Deno tooling and a dedicated Deno configuration;
- do not make Node TypeScript pretend that `npm:` imports and Deno globals are Node modules;
- keep Supabase/Deno checking explicit and reproducible.

Do not solve runtime type problems by mass excludes, global `any`, or blanket rule weakening.

## 7. Cloudflare built-preview verification

A production-like Worker smoke must use a runtime that supplies the bindings the Worker actually expects.

For IceFresh:

- prefer Wrangler-based built preview;
- ensure the `ASSETS` binding exists through the runtime, not through fake application fallbacks;
- request `/` over HTTP;
- require a non-empty successful response;
- inspect preview logs for runtime failures such as `Server error`, `TypeError`, or unhandled exceptions.

Do not hide a missing binding by weakening production application semantics.

## 8. Security-preserving hotfix rules

Build or UI hotfixes must not weaken:

- Supabase Auth;
- RLS;
- owner/admin/staff role boundaries;
- owner-only destructive operations;
- protected RPC exposure;
- EXECUTE grants;
- transaction atomicity;
- frontend secret boundaries;
- the rule that `service_role` is never shipped to frontend code.

A release report should explicitly state whether security-sensitive files changed.

Security guards are not to be disabled merely to make CI green.

## 9. Order aggregate and concurrency invariants

Orders are aggregates:

`orders -> 1..N order_items`

Protected save paths include:

- `save_order_manager_rc_v2`
- `save_order_operational_rc_v2`

`p_expected_items` remains the authoritative optimistic-concurrency snapshot guard.

The frontend must not depend on `_expected_item_count` as its concurrency contract.

Mandatory order regressions when related code is touched:

- edit quantity succeeds;
- remove item succeeds;
- re-add item succeeds;
- stale snapshot is rejected;
- partial snapshot is rejected;
- staff cannot use manager-only save path;
- owner/admin exact snapshot succeeds;
- a late transactional failure causes no partial mutation.

## 10. Responsive modal/layout discipline

Components inside constrained surfaces such as dialogs must respond to the available container width, not just the browser viewport.

Preferred tools:

- CSS grid/flex adjustments;
- `minmax()`;
- sensible `min-width: 0` behavior;
- wrapping;
- container queries or container-aware breakpoints when appropriate;
- reduced gaps/column pressure at constrained widths.

Do not use `overflow: hidden` to conceal useful content as a substitute for a real layout fix.

Acceptance should verify both the target desktop width and the existing mobile width, including `scrollWidth <= clientWidth` within normal rounding.

## 11. AI test isolation

AI tests must verify the application contract without contacting live OpenAI, Gemini, or another production provider.

Tests must explicitly supply/mimic required environment and dependency boundaries, including:

- Supabase configuration required for authenticated paths;
- auth/user/org context;
- outbound fetch/provider mocks;
- persistent rate-limit behavior;
- test isolation between cases.

Do not change expected status codes merely to match an accidental infrastructure failure.

## 12. Evidence-only trace commits

Release evidence belongs in a dedicated trace branch/commit and should record:

- candidate filename;
- byte size;
- SHA-256;
- artifact/Drive ID when applicable;
- exact CI run ID;
- job ID;
- per-gate results;
- test count;
- built-preview result;
- production deployment status;
- candidate byte immutability statement.

Evidence commits should modify only documentation/evidence files unless a new development cycle has explicitly begun.

## 13. Handoff model

Normal release flow:

`Development -> Security Gate -> QA`

For a strictly UI-only hotfix whose diff is independently confirmed to contain no security-sensitive changes, Admin may direct the next permitted QA handoff explicitly.

Never infer production deployment permission from a successful QA or CI result.

## 14. Production safety

Production deployment is a separate operation and requires explicit approval.

A Development or verification task must end with:

`Production deployment: NOT PERFORMED`

unless the user explicitly authorized a production deployment in that task and the deployment was actually performed.

## 15. Release evidence checklist

Before declaring a candidate ready, confirm:

- [ ] canonical baseline identified;
- [ ] candidate filename recorded;
- [ ] byte size recorded;
- [ ] SHA-256 recorded;
- [ ] exact artifact identity verified before extraction;
- [ ] clean dependency install passed;
- [ ] lint passed;
- [ ] all runtime typecheck targets passed;
- [ ] build passed;
- [ ] full tests passed with count recorded;
- [ ] built-preview HTTP smoke passed;
- [ ] required functional regressions passed;
- [ ] security-sensitive diff reviewed;
- [ ] trace branch exists;
- [ ] evidence-only trace commit exists;
- [ ] production deployment status explicitly recorded;
- [ ] handoff destination explicitly stated.

## 16. Operational lessons from RC1.6.x

- A green repository checkout is weaker evidence than a green exact immutable artifact.
- Runtime-specific type systems should be modeled explicitly instead of fought through one root config.
- CI failures should be fixed at the actual contract boundary, not hidden by weakened rules.
- UI breakpoints based only on viewport width can fail inside narrow desktop modals; component/container width matters.
- GitHub Actions may suppress or not emit runs for some GitHub App generated events; keep a manual `workflow_dispatch` path for critical exact-artifact finalization.
- Release trace metadata and candidate bytes are separate concerns. Evidence can evolve after candidate creation without mutating the candidate itself.

---

This playbook is documentation only. It does not authorize production changes and does not override explicit release instructions from Admin/Security/QA.