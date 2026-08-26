# Premium 3D image-delivery performance hotfix

## Confirmed understanding

- Fix only the confirmed hero image-delivery regression in the `906be7d` Premium 3D candidate.
- Preserve all four approved `*_MASTER.png` files byte-for-byte as the product source of truth.
- Preserve Hero=#3, cup=#1, 1kg=#2, 2kg=#3, and HoReCa5kg=#4 mappings.
- Preserve the approved 3D composition, CTA, form, catalogue, accessibility, fallbacks, reduced-motion policy, and lazy 3D loading.
- Deliver a mobile hero derivative within 150 KB and a desktop derivative within 300 KB without serving the MASTER as the primary hero asset.
- Compare baseline and candidate under the same server, browser, throttling, and runner configuration with at least three mobile runs each.
- Produce a new immutable candidate and a non-production preview; never publish production or change Supabase, DNS, aliases, or Task #38.

The supplied goal is the explicit understanding lock and authorizes implementation without another confirmation checkpoint.

## Assumptions and non-functional requirements

- The public hero breakpoint remains aligned with the existing mobile layout at 767 px.
- AVIF is the preferred delivery format; WebP is the compatibility fallback.
- A 640 × 640 mobile derivative and 1200 × 1200 desktop derivative preserve the square source composition and give adequate density at their intended layouts.
- Catalogue and gallery MASTER delivery remains unchanged in this bounded hotfix; those images are lazy and were not the confirmed LCP regression.
- The service worker continues runtime-caching product imagery and does not precache either desktop or mobile hero imagery.
- No user, authentication, database, order, or finance data path changes.

## Approaches considered

1. **Selected: media-specific AVIF/WebP `<picture>` plus matching media-specific AVIF preloads.** Deterministic mobile/desktop selection prevents a narrow viewport from fetching desktop or MASTER bytes and avoids an unnecessary JavaScript selector.
2. Width-descriptor-only `srcset`. This is valid responsive markup, but desktop DPR/layout combinations can legitimately select the 640w asset, making the required desktop delivery evidence less deterministic.
3. JavaScript viewport selection. Rejected because discovery is later, it risks LCP regression, and it duplicates native browser behavior.

## Decision log

- **D1:** Generate only Hero #3 derivatives; keep the optional catalogue derivative expansion out of this focused regression fix.
- **D2:** Use 640w and 1200w AVIF/WebP outputs derived directly from unchanged MASTER #3 with no crop or retouching.
- **D3:** Use two media-specific AVIF preload links so the preload URL is exactly the `<picture>` resource selected by Chromium.
- **D4:** Keep `fetchpriority="high"` only on the hero image and its matching responsive preload candidates.
- **D5:** Bump only the service-worker cache revision; retain runtime image caching and keep derivatives out of the install precache.
- **D6:** Gate release on exact-asset checks, full repository checks, viewport overflow/functional regression, and repeated baseline-vs-candidate performance evidence.
