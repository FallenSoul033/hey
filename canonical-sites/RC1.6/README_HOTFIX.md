# IceFresh RC1.6 — Multi-item Order Hotfix

Canonical Sites project: `appgprj_6a7f95ab99fc819199edf9fc21a5eb6a`

## Scope

- Multi-item order editor: 1 order -> 1..N `order_items`.
- Per-line totals and order total in the editor.
- Internal `order_number` shown as the primary order reference; customer `external_order_number` shown secondarily.
- Duplicate products are rejected in the form.
- Save uses the full `p_items` array with the existing server RPCs.
- Post-save read-back verifies every product, quantity, manager price, item count and total before success is shown.
- Concurrency metadata (`_expected_item_count`, `_editor_version=multi-v2`) protects stale editors.
- Production DB migration blocks legacy single-row editors from silently truncating an existing multi-item order.
- Mobile order editor is responsive at phone widths.

## Production data guard

Migration `20260822183000_protect_multi_item_order_edits.sql` has been applied to production Supabase project `ogjfqnbgauuhbmauioea`.

The currently deployed legacy/single-row editor can therefore no longer silently reduce a multi-item order to one line. It must fail and require the current editor instead.

## Canonical source artifact

Google Drive source artifact: `IceFresh_RC1_6_MultiItem_Hotfix.zip`, Drive file id `1lUf0AwVv9qSI0rK3MYwG5Qucg2ar2Gu4`.
SHA-256: `354f4bb6ce0db9a9ca71681f8475dd013c44817357b82d93ffcd497f2f9145d7`.

## Regression target

Order `000001` / external `1-00003032` must remain one order with 3 items and total `268900 KZT`, paid `0`, debt `268900`.

## Verification

- `npm run test:source`: 52/52 PASS.
- `node --check public/app.js`: PASS.
- Full dependency reinstall/build could not be reproduced in the isolated runner because npm dependency download timed out; RC1.5 is the previously validated canonical base.

## Release gate

Do not mark the frontend hotfix Done until the canonical Sites project is saved/deployed and the authenticated production UI passes create/edit/remove/re-add/refresh regression with a 3-position order.