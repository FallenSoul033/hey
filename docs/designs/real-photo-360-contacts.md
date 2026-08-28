# IceFresh real-photo 360 and contacts design

## Understanding summary

- Add drag-only 360-degree product inspection without changing the existing Hero, catalogue, cards, photography, prices, CTAs, or visual language.
- Use 24-36 evenly spaced photographs of each physical package; never synthesize missing product angles.
- Keep the approved poster authoritative until a valid manifest and at least one frame are available.
- Preserve vertical mobile scrolling while horizontal pointer movement rotates and the released angle remains selected.
- Keep decorative Premium WebGL independent from the real-product viewer.
- Add a public `/contacts` page plus desktop/mobile navigation, with social links sourced from Supabase.
- Let active owner/admin profiles edit, enable, disable, order, add, and remove links; anonymous users may read enabled rows only.

## Assumptions

- The detailed user specification is the confirmed understanding and accepted design contract; the explicit autonomous/no-question requirement replaces interactive confirmation.
- The current `d9f8bcf` Premium 3D source is the latest available canonical code baseline, but production deployment and production database mutation remain forbidden.
- No approved 360 frame sets are present. The implementation therefore ships disabled manifests and keeps the current photographs until real assets are supplied.
- HTTPS is mandatory for social and map platforms. `mailto:` and `tel:` are permitted only for future `email` and `phone` platform types.

## Decision log

1. Use a standalone pointer-events viewer module and per-product manifests. This isolates interaction and asset rollout from the catalogue and WebGL code.
2. Fetch manifests near the viewport, preload only the first frame there, and start the bounded frame queue on horizontal interaction. This avoids loading every frame for every product at page load.
3. Treat a disabled/invalid manifest, slow connection, frame failure, or module error as a poster fallback with no fatal UI.
4. Configure Cup 250 g, Thermopack 1 kg, and Thermopack 2 kg only. HoReCa remains unconfigured until a real physical 5 kg package is photographed.
5. Store contacts in an organization-scoped `social_links` table with explicit grants and RLS. Known icons are local inline SVG/text marks; no social SDK is introduced.
6. Use one row per organization/platform so each published destination has a single authoritative Admin-managed value.

## Final architecture

`public/product-360-config.js` maps product IDs to manifest paths. `public/real-photo-360.js` validates 24-36 frame manifests, observes proximity, handles pointer axis locking and modular frame math, and restores the poster on any failure. Each asset directory contains a disabled manifest until real frames are approved.

`public/social-links.js` owns platform normalization, safe URL rules, automatic icons, and protected external-link markup. `public/app.js` reads enabled rows for the public page and all organization rows for manager settings. `202608280001_social_links.sql` creates constraints, indexes, audit/update triggers, explicit Data API grants, RLS policies, and Realtime publication without inserting any destination URL.
