# IceFresh 3D image-delivery performance hotfix

Status: implementation complete; pending immutable candidate packaging and independent UX/UI/Performance retest.

## Scope and invariants

- Base source: `906be7d4c1cda138571eff97dbfcf694df9b6b1d` on canonical Sites v23 ancestry (`7e75b9c52f28497e41e93ba6438326f542713054`).
- Branch: `hotfix/premium-3d-image-delivery-perf`.
- The approved premium 3D composition, mapping, accessibility labels, WebGL/reduced-motion fallbacks, CLS protections, and lazy 3D loading are unchanged.
- The four approved `*_MASTER.png` source files remain byte-for-byte unchanged. They remain the authoritative product-photo mapping in `BUILT_IN_PRODUCT_PHOTOS` and are no longer delivered by the public catalogue/hero path.
- Production deployment, Sites publication, Supabase, DNS, aliases, and Task #38 are out of scope and were not changed.

## Delivery change

The hero now uses a media-specific `<picture>` and matching AVIF preloads:

- mobile `<= 767px`: `hero-bag-2kg-640.avif` (84,369 bytes), WebP fallback 97,650 bytes;
- desktop `>= 768px`: `hero-bag-2kg-1200.avif` (228,067 bytes), WebP fallback 293,256 bytes;
- `fetchpriority="high"` remains limited to the selected hero candidate;
- dimensions remain explicit and the service worker runtime-caches derivatives without precaching them.

The public catalogue/gallery also use scoped WebP display derivatives for approved products #1-#4. Admin/source mappings still resolve to the original MASTER assets.

## Reproducible verification summary

- Exact mobile runner: Chrome, 390x844, DPR 1, cold context, service worker blocked, HTTP cache disabled, 150 ms latency, 1.6 Mbps down, 750 kbps up, CPU 4x; three alternating runs per side.
- Median observed LCP: baseline 908 ms; candidate 908 ms; delta 0 ms.
- LCP element in every mobile run: the hero `<h1>`, not the image.
- Baseline hero transfer: MASTER #3, 2,685,579 encoded bytes / 2,685,879 transferred, approximately 38.55 s under the runner profile.
- Candidate hero transfer: 640 AVIF, 84,369 encoded bytes / 84,669 transferred, approximately 1.45 s.
- CLS: 0 in every Playwright and Lighthouse run.
- Critical JS: 37,625 -> 37,734 encoded bytes (+109); lazy 3D payload remains 4,467 encoded bytes.
- Lighthouse mobile, three runs per side: performance median 100 -> 100; LCP median 111.125 -> 101.467 ms; CLS 0 -> 0. Loopback Lighthouse values are corroborating evidence; the throttled Playwright result above is primary.
- Candidate public flow `*_MASTER.png` requests: 0. Baseline: 3 in the Playwright run.
- Viewport matrix passed at 320, 360, 390, 412, 430, 768, 1024, 1280, and 1440 px with direct document/catalog `scrollWidth <= clientWidth` checks, CTA/form/product mapping checks, no console errors, and no bad HTTP responses.
- Reduced motion and forced WebGL fallback preserve the static hero and CTA with zero canvases and no errors.
- Service worker readback: active `/sw.js`, cache `icefresh-rc1-6-v6`; derivative fetch 200 with exact 84,369 bytes; missing asset 404.
- Chrome DevTools MCP trace tooling was unavailable. Trace-specific DevTools measurements are `NOT VERIFIED`; raw Lighthouse JSON and reproducible Playwright/CDP evidence are supplied instead.

The immutable artifact identity, full candidate commit, exact-artifact CI logs, preview disposition, screenshots, and raw performance reports are recorded in the external evidence bundle created after this source commit.
