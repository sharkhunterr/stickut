/**
 * A4 canvas composition at 300 DPI.
 *
 * 2480 × 3508 px = ISO A4 portrait at 300 DPI. We optionally rasterise the
 * active frame as a background, then for each placed sticker we draw the
 * pre-bordered cutout (already produced by `border.ts`) at the right mm
 * position scaled into pixels.
 */

import type { ResolvedSticker } from "./placement";
import { rasterizeSvgToCanvas } from "./svgInject";

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
  /** Dimensions de la feuille en mm. */
  pageWidthMm: number;
  pageHeightMm: number;
  /** Liste des stickers à dessiner, déjà résolue (overrides appliqués). */
  placed: ResolvedSticker[];
  stickers: ComposeStickerSource[];
  /** Optional pre-injected SVG. Rasterised behind the stickers. */
  frameSvg?: string | null;
}

export async function composeA4(options: ComposeOptions): Promise<HTMLCanvasElement> {
  const widthPx = mmToPx(options.pageWidthMm);
  const heightPx = mmToPx(options.pageHeightMm);

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");

  ctx.clearRect(0, 0, widthPx, heightPx);

  if (options.frameSvg) {
    const frame = await rasterizeSvgToCanvas(options.frameSvg, widthPx, heightPx);
    ctx.drawImage(frame, 0, 0);
  }

  const byId = new Map(options.stickers.map((s) => [s.id, s.bordered]));

  for (const placed of options.placed) {
    const src = byId.get(placed.id);
    if (!src) continue;
    drawSticker(ctx, src, placed);
  }
  return canvas;
}

function drawSticker(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement | ImageBitmap,
  placed: ResolvedSticker,
): void {
  const xPx = mmToPx(placed.xMm);
  const yPx = mmToPx(placed.yMm);
  const wPx = mmToPx(placed.widthMm);
  const hPx = mmToPx(placed.heightMm);

  if (!placed.angleDeg) {
    ctx.drawImage(src as CanvasImageSource, xPx, yPx, wPx, hPx);
    return;
  }
  // Rotation arbitraire autour du centre du rectangle (xPx, yPx, wPx, hPx).
  ctx.save();
  ctx.translate(xPx + wPx / 2, yPx + hPx / 2);
  ctx.rotate((placed.angleDeg * Math.PI) / 180);
  ctx.drawImage(src as CanvasImageSource, -wPx / 2, -hPx / 2, wPx, hPx);
  ctx.restore();
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob a échoué"))), "image/png");
  });
}

export const DPI_300 = DPI;
export function pageDimsPx(pageWidthMm: number, pageHeightMm: number): { widthPx: number; heightPx: number } {
  return { widthPx: mmToPx(pageWidthMm), heightPx: mmToPx(pageHeightMm) };
}
