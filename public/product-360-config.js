export const PRODUCT_360_MANIFESTS = Object.freeze({
  cup250: '/assets/product-360/cup250/manifest.json',
  bag1: '/assets/product-360/bag1/manifest.json',
  bag2: '/assets/product-360/bag2/manifest.json',
});

export const CUP250_PIKA_V4_ANGLE_TIME_MAP = Object.freeze([
  [0, 0], [15, 0.333333], [30, 0.533333], [45, 0.8],
  [60, 1.133333], [75, 1.4], [90, 1.6], [105, 1.733333],
  [120, 1.966667], [135, 2.033333], [150, 2.233333], [165, 2.466667],
  [180, 2.633333], [195, 2.833333], [210, 2.966667], [225, 3.1],
  [240, 3.3], [255, 3.333333], [270, 3.466667], [285, 3.6],
  [300, 3.966667], [315, 4.166667], [330, 4.333333], [345, 4.533333],
  [360, 4.866667],
].map(anchor => Object.freeze(anchor)));

export const PRODUCT_360_VIDEO_POCS = Object.freeze({
  cup250: Object.freeze({
    enabled: true,
    productId: 'cup250',
    poster: '/assets/product-360/cup250/cup250-pika-v4-poster.webp',
    src: '/assets/product-360/cup250/cup250-pika-v4-scrub-h264-gop4.mp4',
    type: 'video/mp4',
    frameCount: 147,
    fps: 30,
    angleStep: 15,
    angleTimeMap: CUP250_PIKA_V4_ANGLE_TIME_MAP,
    sourceClassification: 'AI_GENERATED_FROM_APPROVED_CUP250_REFERENCES',
    sourceIdentity: Object.freeze({
      fileName: 'pika-ac9f14b1-25be-4233-a0c8-7dd80ea80d00.mp4',
      bytes: 292034,
      sha256: 'D44A5CF5939015D97D01D32A4F108BEC99F80312C0D192E3C8334340E13C8FD7',
    }),
    derivativeIdentity: Object.freeze({
      bytes: 954004,
      sha256: 'FBDF5473EA0F8810525D8B41BD98219C7B68AC78A6C192089FC3451FF4EC6CBD',
    }),
    posterIdentity: Object.freeze({
      bytes: 72644,
      sha256: '318211983748BCA7B7D29BF61AF845C263E5FB2FE27AA6FAE4133D276333258E',
    }),
    calibrationEvidence: Object.freeze({
      matrixShape: '151x24',
      matrixFloat32Sha256: 'ECF8761461ACF9EB71559B8829FDD2874405E074E070B110C26DC916C2456DD7',
      seamGlobalSsim: 0.954341,
    }),
  }),
});

export function manifestForProduct(productId) {
  return PRODUCT_360_MANIFESTS[String(productId || '').trim()] || '';
}

export function videoPocForProduct(productId) {
  return PRODUCT_360_VIDEO_POCS[String(productId || '').trim()] || null;
}
