# Premium 3D Public Prototype v1

## Customer journey and purpose

The visitor should understand IceFresh, see real products, and reach the order form before any enhancement is required. The hero establishes a premium cold atmosphere and makes the primary “Оставить заявку” action dominant; catalogue browsing remains secondary. Three-dimensional depth adds commercial value only in the hero, where restrained refractive ice and water cues can make the real product photography feel tactile. Catalogue, trust copy, and order form remain static semantic content.

## Approaches considered

1. **Recommended: lazy, dependency-free WebGL hero layer around the real hero image.** A small dynamically imported module renders restrained procedural ice/glass geometry only at the composition perimeter. A central exclusion mask keeps cups, labels, and packaging visually untouched and authoritative. It preserves identity, avoids a critical-path 3D dependency, and has deterministic fallbacks.
2. Three.js scene with physically based models. Higher visual ceiling, but a much larger lazy chunk, more texture memory, and unnecessary dependency risk for this first review gate.
3. CSS-only parallax. Fast and robust, but the preflight proved that earlier “3D” work already used this approach and did not satisfy the requested immersive WebGL delta.

## Architecture

`semantic HTML + optimized hero photo + CTA -> first paint -> capability/motion/data-saver check -> IntersectionObserver -> dynamic import -> WebGL mount`

The canvas is decorative (`aria-hidden`, no pointer events, no focus). The enhancement does not start below the fold, on reduced motion, when data saving is requested, or when WebGL capability checks fail. It caps device pixel ratio, pauses when offscreen or the document is hidden, handles context loss without breaking the page, releases shaders/buffers/listeners, and leaves the static hero visible on every failure.

## Loading and fallback behavior

- The HTML does not import the 3D module synchronously.
- The hero and CTAs render before the capability check.
- Dynamic-import or initialization failures set a non-blocking fallback state.
- Reduced motion keeps the static product composition and disables continuous animation.
- Low-power/data-saver/mobile contexts use lower DPR and fewer particles; very narrow devices keep the enhancement disabled.
- The order form, catalogue, navigation, metadata, service worker, and Supabase request behavior are not changed.

## Accessibility and SEO

The canvas is purely presentational. Existing headings, product names, image alternatives, CTA buttons, form labels, canonical metadata, Open Graph metadata, and order form remain authoritative. No 3D interaction can trap keyboard focus.

## Decision log

- **D1:** Limit WebGL to the hero perimeter; mask the product-safe centre so real photography, cups, labels, and packaging remain visually dominant and untouched.
- **D2:** Use dynamic import with viewport/capability gates and no new dependency.
- **D3:** Treat every failure as a silent enhancement fallback, never as a page failure.
- **D4:** Preserve current copy, CTA hierarchy, product mapping, SEO, order path, and service worker behavior.
- **D5:** Keep the prototype local/branch-only and stop at independent UX/UI plus performance review.
