# IceFresh RC1.6.1 — Blocker #4 Development Result

Canonical Sites target: `appgprj_6a7f95ab99fc819199edf9fc21a5eb6a`
Backend source of truth: Supabase `ogjfqnbgauuhbmauioea`
Production deployment: **NOT PERFORMED**
GitHub issue: #4

## Failed immutable base

- `IceFresh_RC1_6_Canonical_QA.zip`
- Drive ID: `1jIfRjBFsKAhLWyB5tG2cnSIihSXpRwlM`
- SHA-256: `169e8cdd0c5a7f42efac53e105e99255a2b23a8f0f4f57132dcb9fd1a1be2e55`
- Trace commit: `681022a0e72279fd2d14b503ebdf996a921f6201`
- This failed artifact was not overwritten.

## Root cause

The v2 manager/operational save wrappers correctly validate the full `p_expected_items` snapshot through `private.assert_order_items_snapshot(...)`, but then delegate to legacy save wrappers. Those legacy wrappers retain an older `_expected_item_count` guard inside the first `p_items` object. The current RC1.6 frontend intentionally sends the authoritative snapshot separately and normal item rows, so a valid 3→2 save passed the v2 concurrency guard and was then rejected by the legacy compatibility guard.

## Minimal server-side fix

`202608230001_rc161_blocker4_v2_compat.sql` preserves the v2 snapshot check as the authoritative concurrency guard. Only after the exact snapshot passes, each v2 wrapper derives `jsonb_array_length(p_expected_items)` and injects `_expected_item_count` into an internal server-side copy passed to the existing legacy writer. No frontend API change and no second independent concurrency mechanism were introduced.

Authorization remains unchanged: manager v2 requires active owner/admin; operational v2 allows active owner/admin/staff and continues delegating to the operational wrapper for staff status/price/finance restrictions. SECURITY DEFINER `search_path=''` and existing public/anon revokes plus authenticated execute grants are preserved.

## Regression evidence

The candidate function definitions were installed only inside an explicit PostgreSQL transaction against the production schema/control data and then rolled back. Runtime assertions passed for:

- baseline `000001`: 3 rows / 268900 / paid 0 / debt 268900;
- owner quantity 100→101 save/read-back;
- exact current 3-row snapshot + legitimate 2-row payload: PASS, exactly 2 rows / 223823;
- exact 2-row snapshot + re-add `cup250`: PASS, 3 rows / 269423;
- stale snapshot: rejected, no mutation;
- partial snapshot: rejected, no mutation;
- authenticated staff on manager RPC: rejected, no mutation;
- synthetic admin with exact snapshot: PASS;
- late `insufficient stock` failure after order/item replacement path: caught subtransaction left no partial mutation;
- documented baseline restored before outer rollback, and final production read-back remained exactly 3 rows / 268900 / paid 0 / debt 268900.

Production v2 function definitions were confirmed unchanged after rollback; the hotfix migration has **not** been deployed.

## Package metadata

Exact artifact contains:
- `package.json`: `12.0.0-rc.1.6`
- `package-lock.json` root version: `12.0.0-rc.1.6`
- `package-lock.json` root package version: `12.0.0-rc.1.6`

## Exact artifact changes vs failed candidate

- `package-lock.json` — version metadata only.
- `supabase/migrations/202608230001_rc161_blocker4_v2_compat.sql` — new blocker fix.
- `supabase/tests/rc161_blocker4_live_regression.sql` — new transaction-scoped live regression.
- `tests/rc161-blocker4.test.mjs` — new static/source guard tests.
- `RC1_6_1_SECURITY_HANDOFF.md` — new Security Gate handoff.

No application feature/source files were rewritten.

## Verification

PASS:
- SQL/function definitions accepted by Postgres in transaction-scoped validation.
- RC1.6 source/static suite: 47/47.
- blocker + multi-item + canonical + product-photo targeted suite: 19/19.
- blocker-specific static suite: 6/6.
- JavaScript syntax checks.
- package metadata consistency.
- runtime remove/re-add/stale/partial/auth/admin/atomicity regression described above.

NOT RUN TO COMPLETION due isolated runner package registry failure:
- `npm ci`: registry tarball fetches returned `EAI_AGAIN`; waiting npm processes were terminated after evidence capture.
- lint: `eslint` unavailable after failed install.
- full project typecheck: dependency/framework/Deno types unavailable after failed install, so module-resolution errors are not classified as candidate code failures.
- build: `vinext` unavailable after failed install.
- build-dependent `dist/server` tests cannot be considered PASS without a build.

## Security candidate

- Artifact: `IceFresh_RC1_6_1_Canonical_QA.zip`
- Google Drive ID: `1SLTcbqzZ6EMzuWI4CJf8719T0k_2Ms2f`
- Size: `2176857` bytes
- SHA-256: `9cfec531d6b5a61fa677921d7078454a96af95320ccf9b2202095df9d177656e`
- Drive download was re-hashed after upload and matched this SHA-256.

**READY for independent Security Gate, not production.**
