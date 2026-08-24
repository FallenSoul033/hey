# IceFresh RC1.5 — Final Security Candidate

Release identifier: `12.0.0-rc.1.5`

RC1.5 is the final source candidate after UX/UI QA, QA engineering, senior code review, technical/performance audit and security hardening.

## Main hardening in RC1.5

- React / React DOM / React Server Components aligned to 19.2.8.
- HSTS, CSP, clickjacking and MIME-sniffing protections in source/worker.
- Vite dev server restricted to `127.0.0.1`.
- Gemini API key moved from URL query string to `x-goog-api-key` header.
- Public order endpoint uses a server/DB idempotency key and an atomic serialized rate limit.
- Public-request IP hashes use a private database HMAC secret, not the Supabase service-role key.
- Production CORS allow-list excludes localhost origins.
- Registration UI requires a valid IceFresh invite link and preserves the invite through email confirmation redirect.
- Pending accounting idempotency fingerprints use SHA-256 rather than MD5.

## Production state

The RC1.5 public-request security migration and Edge Function v3 were safely deployed to the live Supabase project because they remain compatible with the currently published frontend.

The accounting/ledger migrations `202608160005_atomic_inventory_ledger_outbox.sql` and `202608210001_rc14_security_performance.sql` are intentionally NOT applied to production yet. They revoke legacy direct write access and therefore must be applied in the same coordinated cutover as the RC1.5 frontend/worker.

`public/version.json` remains `published: false` until the Sites deployment is completed and verified.

## Verification

Run source checks:

```bash
npm run test:source
```

Final production gate in a clean dependency-enabled environment:

```bash
npm ci
npm run build
npm run lint
node --test tests/*.test.mjs
```

Then run a single standard Codex Security scan, deploy the matching Sites version, apply the two coordinated accounting migrations, and perform authenticated smoke tests for owner/admin/staff.

## Known environment note

This packaged candidate keeps Vite 8.0.13 but binds the dev server to loopback only. Upgrade Vite to 8.0.16+ when the lockfile can be regenerated and the clean build re-run. This affects development-server exposure, not the production worker runtime.
