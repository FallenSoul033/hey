---
name: icefresh-premium-3d-review
description: "Independent UX/UI + performance release-gate workflow for IceFresh.kz premium 3D/WebGL public prototypes. Use when reviewing a prototype, preview artifact, hero 3D enhancement, WebGL effect, or commercial public-site visual experiment before Development Integration."
risk: low
source: project-custom
---

# IceFresh Premium 3D Review

## Purpose

Use this skill as the standard independent UX/UI & Design System + performance review for premium 3D/WebGL experiments on the IceFresh.kz public site.

The goal is not to prove that WebGL works. The goal is to determine whether the 3D treatment **improves the commercial IceFresh experience without weakening product fidelity, usability, accessibility, SEO, mobile behavior, or performance**.

This is an independent gate. Never treat Development/Codex self-report, manifest, screenshots, tests, or claimed metrics as an automatic PASS.

## Core principles

1. **Exact artifact first.** Verify filename + byte size + SHA-256 before extraction.
2. **Real IceFresh products remain source of truth.** Never accept invented packaging, altered logo, fake product form, or synthetic product replacement.
3. **Commercial purpose over technical spectacle.** 3D must support product, CTA and brand atmosphere; it must not become a WebGL demo.
4. **Semantic HTML remains primary.** Product, CTA, order path, SEO text and accessibility must not depend on canvas.
5. **3D must be progressive enhancement.** Site must remain fully usable if WebGL is disabled, unsupported, lost, blocked or intentionally skipped.
6. **Mobile-first.** A premium desktop effect that harms 320–430px UX is a failure.
7. **Performance budget is part of UX.** Lazy/deferred 3D, small payload, offscreen pause and low-power fallback are required.
8. **Production is forbidden during prototype review.** Review preview/local artifacts only unless the user explicitly authorizes another environment.

## Required inputs

Prefer to receive:

- exact artifact filename;
- Drive/file ID or source;
- expected byte size;
- expected SHA-256;
- reported branch + commit;
- shared evidence folder;
- optional baseline artifact or baseline metrics;
- explicit production restriction.

If reported commit/branch cannot be independently verified, continue reviewing the exact artifact but record a **traceability limitation**.

## Phase 1 — Artifact identity gate

Before extraction:

- download/fetch exact artifact;
- verify filename;
- verify byte size;
- calculate SHA-256 independently;
- compare against expected values;
- do not extract if any value differs.

Report:

`Artifact identity: PASS/FAIL`

A FAIL here stops the review.

## Phase 2 — Source traceability

Independently verify when possible:

- reported branch exists;
- reported commit exists;
- artifact/manifest references are internally consistent;
- reported source did not silently modify production.

Do not make source traceability a substitute for exact-artifact identity.

If the exact artifact is valid but GitHub commit cannot be confirmed, mark:

`Known limitation: source traceability not independently confirmed.`

## Phase 3 — Product fidelity

Compare baseline/public product assets with prototype assets.

Check:

- real IceFresh product photography remains source of truth;
- cup250 / bag1 / bag2 / HoReCa assets are not replaced by fabricated versions;
- packaging shape is unchanged;
- IceFresh logo is unchanged;
- no invented labels, flavors, weights or product formats;
- hero product image is still real and commercially representative;
- changed-file list does not include unrelated product media unless explicitly intended.

Prefer byte/hash comparison when baseline assets are available.

## Phase 4 — Commercial visual review

Evaluate the prototype as a commercial food/ice brand site, not a technical demo.

### Hero composition

PASS only when:

- real product remains dominant;
- 3D/ice/glass effects remain secondary;
- effects do not cover the product;
- title and CTA remain immediately readable;
- scene feels premium, cold, clean and fresh;
- no visual clutter;
- no excessive bloom, particles, reflections or glass distortion;
- visual movement supports the IceFresh brand.

Recommended hierarchy:

1. real IceFresh product;
2. commercial value proposition;
3. primary CTA;
4. premium 3D atmosphere.

A beautiful WebGL effect that weakens this hierarchy is a FAIL.

### CTA hierarchy

Check:

- primary CTA is visible without waiting for WebGL;
- canvas does not overlap or intercept CTA;
- ordering path is obvious;
- mobile CTA appears at the right moment in the reading flow;
- CTA works without hover.

## Phase 5 — Semantic HTML / SEO sanity

Confirm:

- H1 remains real HTML;
- product content remains real HTML;
- order form remains real HTML;
- FAQ remains real HTML if part of baseline;
- title/meta description/canonical/robots remain intact;
- Open Graph data remains intact where applicable;
- SEO copy is not moved into canvas;
- page remains meaningful with JS/WebGL disabled.

3D canvas must never become the only carrier of important brand/product information.

## Phase 6 — Accessibility gate

Minimum requirements:

- canvas is decorative;
- `aria-hidden="true"` on decorative host/canvas;
- canvas does not receive keyboard focus;
- no tabindex on decorative canvas;
- `pointer-events: none` unless an interaction is genuinely necessary;
- no focus trap;
- visible focus remains on real interactive elements;
- product image alt text remains valid;
- experience is understandable without hover;
- no essential information depends on color or motion;
- text contrast and control sizes do not regress.

If canvas is interactive, its keyboard and assistive-tech behavior must be explicitly reviewed; otherwise prefer decorative/non-interactive canvas.

## Phase 7 — Reduced motion and fallback policy

Independently verify as many cases as environment allows.

Required fallback cases:

- `prefers-reduced-motion`;
- no WebGL support;
- WebGL init/module failure;
- context loss;
- Data Saver / saveData;
- slow connection (e.g. 2G);
- low device memory;
- low hardware concurrency;
- narrow/low-power mobile policy if implemented.

Fallback must preserve:

- product image;
- title;
- CTA;
- order path;
- semantic content;
- usable page layout.

Do not require WebGL for the public site to function.

## Phase 8 — WebGL lifecycle

Verify where possible:

- lazy/deferred renderer initialization;
- heavy 3D module not in critical rendering path;
- IntersectionObserver or equivalent viewport gating;
- animation pauses when hero is offscreen;
- animation pauses when document/tab is hidden;
- animation resumes correctly;
- `webglcontextlost` is handled;
- context restoration is handled or safe fallback remains;
- teardown/destroy removes observers/listeners/resources;
- no runaway requestAnimationFrame loop.

## Phase 9 — Responsive viewport matrix

Required review matrix:

- 320px
- 360px
- 390px
- 412px
- 430px
- 768px
- 1024px
- 1280px
- 1440px

At each viewport check:

- horizontal overflow;
- product clipping;
- CTA visibility;
- title wrapping;
- hero balance;
- excessive empty space;
- 3D overlay bounds;
- canvas sizing;
- touch usability;
- order form usability;
- scroll behavior;
- console errors when runtime is available.

Mobile-first is mandatory. A prototype that is good only at 1440px is not acceptable.

## Phase 10 — Order form visual sanity

The public order form must remain usable and unchanged unless the prototype explicitly includes order-form work.

Check:

- labels remain clear;
- fields are not covered by overlay/canvas;
- submit remains visible and understandable;
- touch targets remain usable;
- keyboard/mobile viewport does not break layout;
- no new focus trap;
- no visual regression from hero code leaking into form CSS.

## Phase 11 — Performance review

Compare baseline vs prototype where possible.

At minimum assess:

- critical HTML/CSS/JS delta;
- transfer-size delta;
- lazy 3D payload;
- LCP;
- CLS;
- runtime/console errors;
- mobile behavior;
- whether core content renders before 3D;
- whether 3D payload is skipped on fallback paths.

Prefer gzip/brotli transfer size, not only raw file size.

For a decorative enhancement, keep critical-path overhead extremely small and load 3D only after core content is usable.

A useful target for IceFresh premium hero experiments is to keep the lazy transferred 3D payload around a few KB when feasible; any materially larger payload must justify itself commercially.

## Lighthouse policy

Use Lighthouse when genuinely available and reproducible.

If Lighthouse cannot be executed because of tool/environment restrictions, report exactly:

`LIGHTHOUSE = NOT VERIFIED`

Then use the best reproducible alternative available:

- exact byte deltas;
- browser Performance API/CDP when possible;
- source inspection;
- network/resource evidence;
- runtime simulations;
- baseline vs prototype reference metrics clearly labeled as non-independent if taken from Development evidence.

Never present Development-provided LCP/CLS/Lighthouse numbers as independently verified measurements.

## Evidence handling

Development/Codex evidence is **reference material only**.

Independent evidence should include as available:

- artifact identity file;
- SHA calculation;
- changed-file diff;
- baseline/prototype asset hashes;
- viewport screenshots;
- responsive measurements;
- accessibility checks;
- fallback policy simulation;
- context-loss/offscreen lifecycle simulation;
- critical/lazy byte-delta report;
- Lighthouse report or explicit NOT VERIFIED statement;
- browser/runtime limitation evidence.

If the environment blocks browser navigation or other testing, state the limitation explicitly instead of inventing a PASS.

## Blocking criteria

RETURN TO DEVELOPMENT when any of these occur:

- artifact identity mismatch;
- invented/altered IceFresh product packaging;
- 3D obscures product, title or CTA;
- 3D makes commercial hero feel like a tech demo;
- mobile horizontal overflow or unusable layout;
- order path becomes unclear;
- canvas captures focus or creates accessibility regression;
- reduced-motion not respected;
- site fails without WebGL;
- init failure produces broken hero;
- context loss leaves broken interface;
- 3D blocks core content or substantially harms LCP/CLS without strong value;
- critical console/runtime errors;
- significant SEO/semantic regression.

Do not create a blocker for small cosmetic refinements that do not harm use, product fidelity, brand consistency or performance.

## Non-blocking improvement examples

- slightly adjust peripheral 3D visibility;
- tune edge reflections without covering product;
- improve minor contrast;
- reduce particle count further;
- tighten lazy payload;
- test mid-range Android hardware;
- confirm traceability before production;
- remove a non-critical 404 resource request;
- add a real preview Lighthouse run after integration.

## Final report format

Use this exact structure:

```text
Fibery Task / UX/UI + Performance Review — Premium 3D

Artifact identity: PASS/FAIL
Visual quality: PASS/FAIL
Commercial quality: PASS/FAIL
Product fidelity: PASS/FAIL
Hero composition: PASS/FAIL
CTA hierarchy: PASS/FAIL
Mobile UX: PASS/FAIL
Desktop UX: PASS/FAIL
Accessibility: PASS/FAIL
Reduced motion: PASS/FAIL
WebGL fallback: PASS/FAIL
Context failure: PASS/FAIL
SEO: PASS/FAIL
Order form: PASS/FAIL
Performance: PASS/FAIL
Lighthouse: VERIFIED / NOT VERIFIED
Known limitations:
Blocking findings:
Non-blocking improvements:
Evidence:
Production deployment: NOT PERFORMED

FINAL VERDICT:
PASS TO DEVELOPMENT INTEGRATION
or
RETURN TO DEVELOPMENT
```

## Verdict meaning

### PASS TO DEVELOPMENT INTEGRATION

Means the prototype is good enough to move into **preview/non-production integration**. It is **not** production approval.

Recommended next gate after integration:

1. preview deployment only;
2. browser regression;
3. real Lighthouse/performance trace;
4. mid-range Android check;
5. source/commit traceability confirmation;
6. then release gate.

### RETURN TO DEVELOPMENT

Means one or more blocking findings prevent safe integration.

## Tool strategy

Use available project tools where relevant:

- Google Drive for exact artifact + evidence;
- GitHub for source traceability/diff;
- `ui-ux-pro-max` for accessibility/responsive baseline;
- `frontend-design` for commercial visual hierarchy;
- `3d-web-experience` for WebGL lifecycle/fallback review;
- `scroll-experience` for offscreen/scroll interaction sanity;
- Figma / Product Design / MiroMiro / Mobbin / UX Pilot / Themely for comparison and design-system context when useful;
- local/browser tooling for independent runtime and performance evidence.

Use tools to strengthen independent evidence, not to replace judgment.
