# IceFresh RC1.6.1 — Security Gate Handoff

## Scope
Minimal blocker hotfix for GitHub Issue #4 only. No production deployment.

Failed immutable base: `IceFresh_RC1_6_Canonical_QA.zip` / `169e8cdd0c5a7f42efac53e105e99255a2b23a8f0f4f57132dcb9fd1a1be2e55` / trace `681022a0e72279fd2d14b503ebdf996a921f6201`.

## Root cause
`save_order_manager_rc_v2` correctly validated the full `p_expected_items` snapshot, then delegated to legacy `save_order_manager_rc`. The legacy wrapper independently expected `_expected_item_count` inside the first `p_items` object and therefore rejected a legitimate 3→2 reduction even after the authoritative v2 snapshot passed.

## Fix
Migration `202608230001_rc161_blocker4_v2_compat.sql` keeps `private.assert_order_items_snapshot(...)` as the only authoritative v2 concurrency guard. After that exact snapshot succeeds, the v2 wrappers derive the verified current count from `jsonb_array_length(p_expected_items)` and inject `_expected_item_count` only into an internal server-side copy passed to the existing legacy writer. The frontend API contract is unchanged.

No Auth, RLS, manager/staff boundaries, RPC exposure, or low-level transaction semantics were loosened.

## Runtime regression evidence
The candidate functions were temporarily installed and exercised against production schema/data inside one explicit PostgreSQL transaction and then rolled back. The sequence passed:
- control order baseline 3 items / 268900 / paid 0;
- owner quantity edit 100→101;
- exact snapshot 3→2 removal, total 223823;
- exact 2-row snapshot re-add to 3 rows, total 269423;
- stale snapshot rejected with no mutation;
- partial snapshot rejected with no mutation;
- authenticated staff rejected by manager RPC with no mutation;
- synthetic admin exact snapshot accepted;
- a `Подтверждён` reservation (with current available stock = 0) failed late with `insufficient stock`, and the caught subtransaction left no partial order/item mutation;
- baseline restored to bag1 100×523, bag2 200×855, cup250 150×304, total/debt 268900, paid 0;
- outer transaction rolled back, including temporary function definitions and synthetic identities.

A reusable transaction-scoped script is included at `supabase/tests/rc161_blocker4_live_regression.sql`.

## Package metadata
`package.json` and both package-lock version fields are `12.0.0-rc.1.6`.

## Local verification
- JS syntax: PASS.
- `npm run test:source`: 47/47 PASS.
- blocker/multi-item/canonical/product-photo targeted tests: 19/19 PASS.
- package metadata consistency: PASS.
- dependency install: NOT RUN to completion because registry access returned `EAI_AGAIN` and npm remained waiting for unavailable tarballs; npm processes were terminated after evidence capture.
- lint: NOT RUN to completion (`eslint` unavailable because dependency install did not complete).
- typecheck: NOT RUN to completion as a valid candidate check; missing dependency/type modules after failed install produced module-resolution errors.
- build: NOT RUN to completion (`vinext` unavailable because dependency install did not complete).
- full build-dependent test set: NOT RUN as a valid pass; source-only tests pass, while tests requiring `dist/server` fail because build could not run.

Security Gate should re-run install/lint/type/build and the transaction-scoped SQL regression in an environment with dependency registry access before release approval.
