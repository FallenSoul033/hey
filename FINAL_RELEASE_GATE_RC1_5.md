# IceFresh RC1.5 — Final release gate

Date: 2026-08-21

## Completed in this ChatGPT session

- Final source candidate prepared: `12.0.0-rc.1.5`.
- Source/security regression: 47/47 PASS.
- Full test discovery: 54/63 PASS; the remaining 9 tests are build-dependent and fail only because `dist/server/*` is absent in this environment.
- JavaScript syntax checks: PASS.
- TypeScript/TSX parser checks: PASS.
- Secret-pattern scan: PASS.
- package.json/package-lock top-level consistency: PASS.
- Live Supabase: public-request security migration applied.
- Live Supabase: `public-order-request` Edge Function v3 deployed and ACTIVE.
- Live DB verification: `service_role` can execute `submit_public_request_rc`; `authenticated` and `anon` cannot.
- Supabase Security Advisor rerun.

## Live security advisor

Expected/known warnings remain:

1. `accept_invite` is SECURITY DEFINER and intentionally callable by authenticated users; it validates auth, invitation state and organization membership.
2. `manage_member` is SECURITY DEFINER and intentionally callable by authenticated users; it requires active owner role and prevents owner mutation.
3. Leaked Password Protection is disabled and should be enabled in Supabase Auth before final GO.

## What is intentionally not live yet

Do not apply the accounting/ledger migrations independently of the matching frontend deployment:

- `202608160005_atomic_inventory_ledger_outbox.sql`
- `202608210001_rc14_security_performance.sql`

They change table privileges and runtime semantics. Applying them before the frontend cutover can break the currently published CRM.

## Final external gate requiring Codex / Sites control plane

Use ONE standard Codex run (not deep multi-pass) to conserve tokens:

1. Open this RC1.5 source.
2. Upgrade Vite to >=8.0.16 and regenerate the lockfile.
3. Run `npm ci && npm run build && npm run lint && node --test tests/*.test.mjs`.
4. Run one standard Codex Security repository scan. Fix only validated release blockers; re-run relevant tests.
5. Save a Sites version for project `appgprj_6a7f95ab99fc819199edf9fc21a5eb6a` but do not split the backend/frontend cutover.
6. Apply the two pending accounting migrations immediately with the matching frontend deployment.
7. Deploy the saved Sites version.
8. Smoke-test `/`, `/app`, `/app/orders`, public order submission, owner/admin/staff permissions, production, reserve, shipment, sale, payment and refund.
9. Verify HSTS/noindex/PWA and rerun Supabase Security Advisor.
10. If all gates pass, set release metadata to `published: true` and mark v12 Production.

## Current verdict

RC1.5 source/backend public-request hardening: PASS.
Full v12 production cutover: PENDING the final Codex/Sites build-deploy gate above.
