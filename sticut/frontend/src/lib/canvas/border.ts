/**
 * White-border pipeline for cut-out RGBA images.
 *
 * Algorithm (per research.md R7):
 *  1. Smooth the source alpha (separable box blur, 2 passes, threshold 128).
 *  2. Dilate the alpha by `radiusPx` (offset = blur radius, threshold 128).
 *  3. Smooth the dilated alpha (box blur proportional to radius, 2 passes,
 *     threshold 128).
 *  4. Compose: render the original RGBA on top of a white silhouette
 *     defined by the dilated mask using `globalCompositeOperation =
 *     "destination-over"`.
 *
 * Returns an offscreen-canvas-friendly result wrapped in HTMLCanvasElement
 * (or OffscreenCanvas where supported by the caller).
 */

const MM_PER_INCH = 25.4;

export interface BorderResult {
  canvas: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
}

export function thicknessMmToPx(thicknessMm: number, dpi: number): number {
  return Math.max(1, Math.round((thicknessMm * dpi) / MM_PER_INCH));
}

/** Apply a 1-D horizontal box blur to alpha channel only, in-place. */
function blurH(src: Uint8ClampedArray, w: number, h: number, radius: number): void {
  if (radius <= 0) return;
  const dst = new Uint8ClampedArray(src.length);
  // Copy non-alpha as-is.
  for (let i = 0; i < src.length; i++) dst[i] = src[i];
  const span = 2 * radius + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    // Prime the window: replicate edge.
    for (let k = -radius; k <= radius; k++) {
      const xs = Math.min(w - 1, Math.max(0, k));
      acc += src[(y * w + xs) * 4 + 3];
    }
    for (let x = 0; x < w; x++) {
      dst[(y * w + x) * 4 + 3] = (acc / span) | 0;
      const xOut = Math.min(w - 1, Math.max(0, x - radius));
      const xIn = Math.min(w - 1, Math.max(0, x + radius + 1));
      acc += src[(y * w + xIn) * 4 + 3] - src[(y * w + xOut) * 4 + 3];
    }
  }
  src.set(dst);
}

/** Apply a 1-D vertical box blur to alpha channel only, in-place. */
function blurV(src: Uint8ClampedArray, w: number, h: number, radius: number): void {
  if (radius <= 0) return;
  const dst = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i++) dst[i] = src[i];
  const span = 2 * radius + 1;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      const ys = Math.min(h - 1, Math.max(0, k));
      acc += src[(ys * w + x) * 4 + 3];
    }
    for (let y = 0; y < h; y++) {
      dst[(y * w + x) * 4 + 3] = (acc / span) | 0;
      const yOut = Math.min(h - 1, Math.max(0, y - radius));
      const yIn = Math.min(h - 1, Math.max(0, y + radius + 1));
      acc += src[(yIn * w + x) * 4 + 3] - src[(yOut * w + x) * 4 + 3];
    }
  }
  src.set(dst);
}

function blurAlpha(buf: Uint8ClampedArray, w: number, h: number, radius: number): void {
  if (radius <= 0) return;
  blurH(buf, w, h, radius);
  blurV(buf, w, h, radius);
}

function thresholdAlpha(buf: Uint8ClampedArray, threshold = 128): void {
  for (let i = 3; i < buf.length; i += 4) {
    buf[i] = buf[i] >= threshold ? 255 : 0;
  }
}

/**
 * Build the dilated white-silhouette mask from a source RGBA's alpha.
 * Returns an ImageData where RGB = white and A = the dilated mask.
 */
function buildMaskCanvas(
  source: ImageData,
  radiusPx: number,
): ImageData {
  const w = source.width;
  const h = source.height;
  const masked = new Uint8ClampedArray(source.data.length);
  // Start from source alpha only — RGB = white so we can paint silhouette.
  for (let i = 0; i < source.data.length; i += 4) {
    masked[i] = 255;
    masked[i + 1] = 255;
    masked[i + 2] = 255;
    masked[i + 3] = source.data[i + 3];
  }
  // Step 1: smooth the source alpha then threshold to clean.
  blurAlpha(masked, w, h, 1);
  thresholdAlpha(masked, 128);
  // Step 2: morphological dilation via blur+threshold; box blur of radius r
  // followed by threshold 1 expands the mask by r pixels.
  const dilateRadius = Math.max(1, radiusPx);
  blurAlpha(masked, w, h, dilateRadius);
  // Threshold low so the dilation actually reaches the radius edge.
  for (let i = 3; i < masked.length; i += 4) {
    masked[i] = masked[i] > 0 ? 255 : 0;
  }
  // Step 3: smooth the dilated mask for rounded corners.
  const smoothRadius = Math.max(1, Math.round(radiusPx * 0.4));
  blurAlpha(masked, w, h, smoothRadius);
  thresholdAlpha(masked, 128);
  return new ImageData(masked, w, h);
}

/**
 * Compose `cutout` over a white silhouette dilated by `radiusPx`.
 * Returns a canvas the same size as the input.
 */
export function applyWhiteBorder(cutout: ImageBitmap | HTMLCanvasElement, radiusPx: number): BorderResult {
  const w = cutout.width;
  const h = cutout.height;
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  if (!wctx) throw new Error("Canvas 2D indisponible");
  wctx.drawImage(cutout as CanvasImageSource, 0, 0);
  const sourceData = wctx.getImageData(0, 0, w, h);

  const mask = buildMaskCanvas(sourceData, radiusPx);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas 2D indisponible");

  // 1) Paint the white mask as the background.
  octx.putImageData(mask, 0, 0);
  // 2) Composite the original cutout on top.
  octx.globalCompositeOperation = "source-over";
  octx.drawImage(cutout as CanvasImageSource, 0, 0);
  octx.globalCompositeOperation = "source-over";

  return { canvas: out, widthPx: w, heightPx: h };
}

export async function applyWhiteBorderToBlob(
  blob: Blob,
  thicknessMm: number,
  dpi = 300,
): Promise<{ blob: Blob; widthPx: number; heightPx: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    const radius = thicknessMmToPx(thicknessMm, dpi);
    const { canvas, widthPx, heightPx } = applyWhiteBorder(bitmap, radius);
    const out = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob a échoué"))), "image/png");
    });
    return { blob: out, widthPx, heightPx };
  } finally {
    bitmap.close?.();
  }
}
