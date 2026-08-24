# IceFresh RC1.6 — Development QA Handoff

Canonical Sites target: `appgprj_6a7f95ab99fc819199edf9fc21a5eb6a`  
Backend source of truth: Supabase `ogjfqnbgauuhbmauioea`  
Production deployment: **NOT PERFORMED**

## Source basis

This candidate was built from the full canonical Google Drive artifact `IceFresh_RC1_6_MultiItem_Hotfix.zip` (Drive file id `1Ib6ooPPkHJAnveMz2svOb-aYBbCylnHi`, input SHA-256 `804fcf9f5ee64762dfe58c81adebe7c7fdaa803a48a62ad5410d2824160a26bf`). The independent React/Vite CRM subset in repository root `main` was not used as the canonical frontend.

Reference release scope: GitHub Issue #2 and branch `canonical/sites-rc1.6-multi-item-hotfix`.

## RC1.6 scope

- Full canonical Sites source retained (storefront + CRM + calendar + requests + clients + products + employees + accruals/finance + analytics + production/operations + system events + AI/integrations).
- Orders are edited as `orders -> 1..N order_items` aggregates.
- Editor supports add/remove lines, per-line totals and whole-order total.
- Duplicate products are rejected before save.
- Edit reads all existing `order_items`.
- Save collects the complete line set and calls only guarded RPCs `save_order_manager_rc_v2` / `save_order_operational_rc_v2` with `p_expected_items`.
- Post-save read-back verifies persisted line set and manager total.
- Canonical product assets are bundled using the exact 1600px filenames:
  - `cup250` -> `cup-250-premium-1600.webp`
  - `bag1` -> `bag-1kg-premium-1600.webp`
  - `bag2` -> `bag-2kg-premium-1600.webp`
  - HoReCa 5 kg -> `horeca-5kg-premium-1600.webp`
- Packaged products render with `object-fit: contain`; HoReCa scene renders with `object-fit: cover`.
- Service worker cache revision bumped to `icefresh-rc1-6-v3`.
- Mobile sidebar navigation now scrolls independently (`overflow-y:auto`, overscroll containment, touch momentum) while keeping the fixed shell and bottom navigation.
- Multi-item editor grid children are constrained with `min-width:0` / `max-width:100%` safeguards to prevent phone-width horizontal overflow.

## Production control order (read-only verification)

Order `000001` / external `1-00003032` was verified against production Supabase before and after Development verification:

| Product | Quantity | Unit price |
|---|---:|---:|
| bag1 | 100 | 523 |
| bag2 | 200 | 855 |
| cup250 | 150 | 304 |

- total: `268900 KZT`
- paid: `0`
- debt: `268900`
- active order records with `000001`: `1`
- active item rows: `3`
- server snapshot guard: correct snapshot accepted; deliberately stale/partial snapshot rejected without mutating the order.
- destructive owner E2E against this control order: **NOT RUN** in Development stage by design; QA owns the controlled edit/remove/re-add/save/refresh regression.

## Development verification

### PASS

- JavaScript syntax: `public/app.js`, `public/routes.js`, `public/core.js`, `public/sw.js`.
- Source/static regression: **60/60 PASS** including routes, security, QA, UX/UI, performance, multi-item orders, exact premium-photo mapping and RC1.6 canonical regression.
- Production backend read-only regression: control order remains `3 items / 268900 / 0 / 268900` with one active order.
- RLS enabled on key production tables (`orders`, `order_items`, `profiles`, `clients`, `products`, `financial_ledger`, `stock_ledger`).
- Browser-role grants on critical ledgers/order tables are SELECT-only; frontend contains no `service_role` secret and no direct `orders` write path.
- Guarded RPC definitions verified in production: manager v2 restricts to `owner/admin`; operational v2 restricts to active `owner/admin/staff`; expected snapshot check runs before base save.
- Product assets: all four candidate WebPs are exactly `1600x1600`, bundled locally, and no Google Drive URL is written to `products.photo_path`.
- Headless Chromium CSS/layout harness:
  - ~390px product cards: no horizontal overflow; package `contain`, HoReCa `cover`.
  - ~1440px product cards: no horizontal overflow; expected image-fit rules preserved.
  - ~390px multi-item editor: no horizontal overflow; all controls inside viewport; add/remove controls visible; bottom-nav clearance retained.
  - ~390px sidebar: fixed 844px shell with independently scrollable nav; page scroll remains unchanged while nav scrolls.

### NOT RUN (environment limitation, not reported as PASS)

- `npm ci`: unavailable in isolated runner because required package tarballs are not cached and registry access fails (`ENOTCACHED` / prior `EAI_AGAIN`).
- `npm run lint`: **NOT RUN to completion** because local `eslint` cannot be installed (`eslint: not found`).
- project TypeScript check: **NOT RUN to completion** because framework/type dependencies (`next`, React types, vinext, Cloudflare types, Deno/Supabase imports) are unavailable without dependency install.
- `npm run build`: **NOT RUN to completion** because `vinext` cannot be installed (`vinext: not found`).
- build-dependent tests (`rendered-html.test.mjs`, `ai-assistant.test.mjs`): **NOT RUN** because `dist/server` cannot be generated without the build.
- full authenticated browser E2E / console check against a built Sites preview: **NOT RUN** in this runner because the dependency build is unavailable. QA must make this the first preview gate.

## Security notes for QA

Supabase security advisor still reports WARN-level items for intended authenticated `SECURITY DEFINER` RPCs and leaked-password protection being disabled. No security guard was weakened during RC1.6 Development. Verify the intended role checks during authenticated QA; do not "fix" frontend issues by disabling RLS or exposing privileged keys.

## QA focus

1. Load this exact candidate into the existing Sites project as a **preview/candidate only**, without publishing production.
2. Run dependency install/build/lint in the Sites/QA environment where registry dependencies are available.
3. Validate real ~390px and ~1440px layouts and inspect browser console.
4. Authenticate as owner and verify order `000001` opens with all 3 lines.
5. Execute the controlled edit/remove/re-add/save/refresh scenario, then restore/confirm the agreed control state.
6. Confirm staff cannot access manager finance/admin capabilities.
7. Confirm all 4 canonical premium photos render from bundled WebP assets and no stale cached asset appears.

Production publication remains outside this Development stage.
