export const PRODUCT_360_MANIFESTS = Object.freeze({
  cup250: '/assets/product-360/cup250/manifest.json',
  bag1: '/assets/product-360/bag1/manifest.json',
  bag2: '/assets/product-360/bag2/manifest.json',
});

export function manifestForProduct(productId) {
  return PRODUCT_360_MANIFESTS[String(productId || '').trim()] || '';
}
