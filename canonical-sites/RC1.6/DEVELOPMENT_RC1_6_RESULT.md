# IceFresh RC1.6 — Development Result

Canonical Sites target: `appgprj_6a7f95ab99fc819199edf9fc21a5eb6a`
Backend source of truth: Supabase `ogjfqnbgauuhbmauioea`
Production deployment: **NOT PERFORMED**

## QA candidate artifact

- Google Drive: `IceFresh_RC1_6_Canonical_QA.zip`
- Drive file ID: `1jIfRjBFsKAhLWyB5tG2cnSIihSXpRwlM`
- Size: `2166909` bytes
- SHA-256: `169e8cdd0c5a7f42efac53e105e99255a2b23a8f0f4f57132dcb9fd1a1be2e55`
- Source input: full canonical Drive artifact `IceFresh_RC1_6_MultiItem_Hotfix.zip` / `1Ib6ooPPkHJAnveMz2svOb-aYBbCylnHi` / SHA-256 `804fcf9f5ee64762dfe58c81adebe7c7fdaa803a48a62ad5410d2824160a26bf`.
- Repository root `main` subset was **not** used as canonical frontend source.

## Development changes

- Finalized exact product asset names:
  - `cup250` -> `cup-250-premium-1600.webp`
  - `bag1` -> `bag-1kg-premium-1600.webp`
  - `bag2` -> `bag-2kg-premium-1600.webp`
  - HoReCa 5 kg -> `horeca-5kg-premium-1600.webp`
- Removed old unsuffixed premium files from the QA candidate.
- Bumped service-worker cache to `icefresh-rc1-6-v3`.
- Added independent/touch-friendly sidebar navigation scrolling and phone-width multi-item grid containment.
- Added RC1.6 canonical regression coverage and QA handoff documentation.

## Multi-item / backend verification

- Frontend loads all `order_items` and saves the complete line array.
- Frontend calls only `save_order_manager_rc_v2` / `save_order_operational_rc_v2` for order save and passes `p_expected_items`.
- Duplicate products are rejected.
- Production RPC definitions and role gates were inspected read-only.
- Server snapshot guard accepted the exact current snapshot and rejected a deliberately stale/partial snapshot without mutating the order.
- Control order `000001` / external `1-00003032` remains one active order with:
  - `bag1`: 100 x 523
  - `bag2`: 200 x 855
  - `cup250`: 150 x 304
  - total `268900`, paid `0`, debt `268900`.

## Verification

PASS:
- JS syntax for `app.js`, `routes.js`, `core.js`, `sw.js`.
- `npm run test:source`: 47/47 PASS.
- RC1.6 targeted multi-item/photo/canonical tests: 13/13 PASS.
- Combined source/static verification: 60/60 PASS.
- Browser CSS/layout harness: ~390px multi-item editor no horizontal overflow and controls fit; independently scrollable sidebar; ~390px/~1440px product cards no horizontal overflow; package `contain`, HoReCa `cover`.
- Production RLS remains enabled on critical tables; browser grants on order/ledger tables are SELECT-only; no frontend `service_role` and no direct `orders` write path.

NOT RUN TO COMPLETION due isolated runner package-registry limitation:
- `npm ci`: required tarballs unavailable from cache (`ENOTCACHED`; network previously returns `EAI_AGAIN`).
- `npm run lint`: local `eslint` unavailable because dependencies cannot be installed.
- project TypeScript check: framework/types unavailable because dependencies cannot be installed.
- `npm run build`: `vinext` unavailable because dependencies cannot be installed.
- build-dependent `rendered-html` and `ai-assistant` tests.
- authenticated built-preview owner E2E and real preview console inspection; these are mandatory first QA gates.

## QA handoff

**READY** for independent QA/Release verification as a non-production candidate. QA must install/build in an environment with registry access, load this exact artifact into a Sites preview/candidate, then run the authenticated order `000001` controlled edit/remove/re-add/save/refresh regression and browser console/responsive verification before any production publication.
