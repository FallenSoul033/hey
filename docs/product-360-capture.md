# IceFresh 360 capture and asset handoff

Photograph each physical package on a fixed turntable with a locked camera, lens, focus, exposure, white balance, light positions, background, and product centre. Use 24 frames at 15-degree steps or 36 frames at 10-degree steps. The first frame must match the preferred catalogue-facing angle. Keep the logo, seams, condensation/ice, label, and package proportions untouched; do not retouch the package into a different product.

Export same-size sRGB WebP frames with transparent or consistent light background. Aim for 900-1200 px square and roughly 70-140 KB per frame after visual QA. Name files `frame-01.webp` through `frame-24.webp` (or `frame-36.webp`) and place them in the matching directory under `public/assets/product-360/`.

Update that product's `manifest.json`: set `enabled` to `true` and list every file in physical rotation order in `frames`. The manifest accepts only 24-36 unique local AVIF/WebP/PNG/JPEG paths. Never enable a partial set. HoReCa must not be added to `product-360-config.js` until a suitable real 5 kg package exists and has been photographed by the same process.
