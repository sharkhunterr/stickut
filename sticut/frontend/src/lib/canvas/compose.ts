/**
 * A4 canvas composition at 300 DPI.
 *
 * 2480 × 3508 px = ISO A4 portrait at 300 DPI. We optionally rasterise the
 * active frame as a background, then for each placed sticker we draw the
 * pre-bordered cutout (already produced by `border.ts`) at the right mm
 * position scaled into pixels.
 */

import type { PackResult, PlacedSticker } from "./pack";
import { rasterizeSvgToCanvas } from "./svgInject";

const A4_WIDTH_PX = 2480;
const A4_HEIGHT_PX = 3508;
const MM_PER_INCH = 25.4;
const DPI = 300;

function mmToPx(mm: number): number {
  return Math.round((mm * DPI) / MM_PER_INCH);
}

export interface ComposeStickerSource {
  id: string;
  bordered: HTMLCanvasElement | ImageBitmap;
}

export interface ComposeOptions {
  pack: PackResult;
  stickers: ComposeStickerSource[];
  /** Optional pre-injected SVG. Rasterised behind the stickers. */
  frameSvg?: string | null;
}

export async function composeA4(options: ComposeOptions): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = A4_WIDTH_PX;
  canvas.height = A4_HEIGHT_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");

  // Transparent background by default.
  ctx.clearRect(0, 0, A4_WIDTH_PX, A4_HEIGHT_PX);

  if (options.frameSvg) {
    const frame = await rasterizeSvgToCanvas(options.frameSvg, A4_WIDTH_PX, A4_HEIGHT_PX);
    ctx.drawImage(frame, 0, 0);
  }

  const byId = new Map(options.stickers.map((s) => [s.id, s.bordered]));

  for (const placed of options.pack.placed) {
    const src = byId.get(placed.id);
    if (!src) continue;
    drawSticker(ctx, src, placed);
  }
  return canvas;
}

function drawSticker(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement | ImageBitmap,
  placed: PlacedSticker,
): void {
  const xPx = mmToPx(placed.xMm);
  const yPx = mmToPx(placed.yMm);
  const wPx = mmToPx(placed.widthMm);
  const hPx = mmToPx(placed.heightMm);

  if (!placed.rotated) {
    ctx.drawImage(src as CanvasImageSource, xPx, yPx, wPx, hPx);
    return;
  }
  // 90° CW rotation: the on-page rectangle is (wPx × hPx). The source image
  // is wider than tall (or vice versa). After rotation, swap.
  ctx.save();
  ctx.translate(xPx + wPx / 2, yPx + hPx / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src as CanvasImageSource, -hPx / 2, -wPx / 2, hPx, wPx);
  ctx.restore();
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob a échoué"))), "image/png");
  });
}

export const A4 = { widthPx: A4_WIDTH_PX, heightPx: A4_HEIGHT_PX, dpi: DPI };
