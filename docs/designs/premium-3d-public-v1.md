# Premium 3D Public Prototype v1

## Customer journey and purpose

The visitor should understand IceFresh, see real products, and reach the order form before any enhancement is required. The hero establishes a premium cold atmosphere and makes the primary “Оставить заявку” action dominant; catalogue browsing remains secondary. Three-dimensional depth adds commercial value in two bounded places: a restrained perimeter treatment around the approved 2 kg Hero master, and a stronger falling-ice treatment around the approved HoReCa master. Catalogue copy, product controls, trust content, and order form remain static semantic content.

## Approaches considered

1. **Recommended: one lazy, dependency-free WebGL module with Hero and HoReCa variants.** The Hero variant renders restrained procedural ice/glass and mist geometry at the composition perimeter. The HoReCa variant reuses the same shader and buffer with six falling ice forms and two low-alpha depth forms. Central exclusion masks keep the approved photography and product controls authoritative. The shared module avoids duplicate downloads, stays off the critical path, and retains deterministic fallbacks.
2. Three.js scene with physically based models. Higher visual ceiling, but a much larger lazy chunk, more texture memory, and unnecessary dependency risk for this first review gate.
3. CSS-only parallax. Fast and robust, but the preflight proved that earlier “3D” work already used this approach and did not satisfy the requested immersive WebGL delta.

## Architecture

`semantic HTML + approved master photo + CTA -> first paint -> capability/motion/data-saver check -> per-host IntersectionObserver -> shared dynamic import -> Hero or HoReCa WebGL mount`

The canvas is decorative (`aria-hidden`, no pointer events, no focus). The enhancement does not start below the fold, on reduced motion, when data saving is requested, or when WebGL capability checks fail. It caps device pixel ratio, pauses when offscreen or the document is hidden, handles context loss without breaking the page, releases shaders/buffers/listeners, and leaves the static hero visible on every failure.

## Loading and fallback behavior

- The HTML does not import the 3D module synchronously.
- The hero and CTAs render before the capability check.
- Dynamic-import or initialization failures set a non-blocking fallback state.
- Reduced motion keeps the static product composition and disables continuous animation.
- Low-power/data-saver/mobile contexts use lower DPR and fewer particles; very narrow devices keep the enhancement disabled.
- The order form, navigation, and Supabase request behavior are not changed.
- Known product IDs always resolve to the four approved Drive masters; remote product-photo paths cannot replace those public images.
- The optional 3D modules are runtime cached after first successful use but never added to the install precache.

## Accessibility and SEO

The canvas is purely presentational. Existing headings, product names, image alternatives, CTA buttons, form labels, canonical metadata, Open Graph metadata, and order form remain authoritative. No 3D interaction can trap keyboard focus.

## Decision log

- **D1:** Limit WebGL to the hero perimeter; mask the product-safe centre so real photography, cups, labels, and packaging remain visually dominant and untouched.
- **D2:** Use dynamic import with viewport/capability gates and no new dependency.
- **D3:** Treat every failure as a silent enhancement fallback, never as a page failure.
- **D4:** Preserve current copy, CTA hierarchy, product mapping, SEO, order path, and service worker behavior.
- **D5:** Keep the prototype local/branch-only and stop at independent UX/UI plus performance review.
- **D6:** Use the exact four approved 1254 × 1254 Drive master PNGs without retouching or generated packaging. Hero and card mappings follow the explicit #1–#4 assignment.
- **D7:** Reuse one scene module for both hosts; select the visual mode through a declarative host variant so no camera, drag, or demo controls enter the experience.
- **D8:** Treat the missing social-preview extension and undeclared favicon as a real 404 defect: point metadata to the bundled JPG and declare the bundled SVG favicon.
