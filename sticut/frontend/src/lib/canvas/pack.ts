/**
 * Sticker packing: wraps maxrects-packer to produce an A4 layout in mm.
 *
 * Two modes:
 *  - "fixed": every sticker's longest side is `sizeFixedMm`.
 *  - "range": every sticker's longest side is in [sizeMinMm, sizeMaxMm];
 *    we pick a target proportional to the source area so larger images get
 *    more space, then maxrects packs them with rotation enabled.
 */

import { MaxRectsPacker } from "maxrects-packer";
import type { Rect } from "../../types";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export interface StickerInput {
  id: string;
  /** Source pixel dimensions of the bordered cutout. Used for aspect ratio. */
  widthPx: number;
  heightPx: number;
}

export interface PlacedSticker {
  id: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotated: boolean;
}

export interface PackResult {
  placed: PlacedSticker[];
  unplaced: string[];
  pageWidthMm: number;
  pageHeightMm: number;
  stickerArea: Rect;
}

export type SizeMode = "fixed" | "range";

export interface PackOptions {
  mode: SizeMode;
  sizeFixedMm: number;
  sizeMinMm: number;
  sizeMaxMm: number;
  spacingMm: number;
  outerMarginMm: number;
  /** Optional explicit area (when a frame is active). In mm, in viewBox coords. */
  stickerArea?: Rect | null;
  pageWidthMm?: number;
  pageHeightMm?: number;
}

function dimsForLong(longSideMm: number, widthPx: number, heightPx: number): { w: number; h: number } {
  if (widthPx >= heightPx) {
    return { w: longSideMm, h: longSideMm * (heightPx / widthPx) };
  }
  return { w: longSideMm * (widthPx / heightPx), h: longSideMm };
}

export function pack(stickers: StickerInput[], options: PackOptions): PackResult {
  const pageW = options.pageWidthMm ?? A4_WIDTH_MM;
  const pageH = options.pageHeightMm ?? A4_HEIGHT_MM;

  const area: Rect =
    options.stickerArea ??
    {
      x: options.outerMarginMm,
      y: options.outerMarginMm,
      width: pageW - 2 * options.outerMarginMm,
      height: pageH - 2 * options.outerMarginMm,
    };

  // Compute per-sticker target dimensions in mm.
  let sized: { id: string; w: number; h: number }[];
  if (options.mode === "fixed") {
    sized = stickers.map((s) => ({ id: s.id, ...dimsForLong(options.sizeFixedMm, s.widthPx, s.heightPx) }));
  } else {
    const min = options.sizeMinMm;
    const max = options.sizeMaxMm;
    const areas = stickers.map((s) => s.widthPx * s.heightPx);
    const minArea = Math.min(...areas, 1);
    const maxArea = Math.max(...areas, minArea + 1);
    sized = stickers.map((s, idx) => {
      const t = (areas[idx] - minArea) / (maxArea - minArea || 1);
      const long = min + t * (max - min);
      return { id: s.id, ...dimsForLong(long, s.widthPx, s.heightPx) };
    });
  }

  // maxrects-packer works in integers; multiply mm by 100 → 0.01 mm precision.
  const SCALE = 100;
  const padding = Math.round(options.spacingMm * SCALE);
  const packer = new MaxRectsPacker(
    Math.round(area.width * SCALE),
    Math.round(area.height * SCALE),
    padding,
    { smart: true, pot: false, square: false, allowRotation: true },
  );

  for (const s of sized) {
    packer.add(Math.round(s.w * SCALE), Math.round(s.h * SCALE), { id: s.id });
  }

  const placed: PlacedSticker[] = [];
  const placedIds = new Set<string>();
  for (const bin of packer.bins) {
    for (const r of bin.rects) {
      const data = (r as { data?: { id?: string } }).data;
      const id = data?.id;
      if (!id) continue;
      placed.push({
        id,
        xMm: area.x + r.x / SCALE,
        yMm: area.y + r.y / SCALE,
        widthMm: r.width / SCALE,
        heightMm: r.height / SCALE,
        rotated: Boolean((r as { rot?: boolean }).rot),
      });
      placedIds.add(id);
    }
    // Single-bin guarantee: we only consume the first bin.
    break;
  }
  const unplaced = stickers.map((s) => s.id).filter((id) => !placedIds.has(id));

  return {
    placed,
    unplaced,
    pageWidthMm: pageW,
    pageHeightMm: pageH,
    stickerArea: area,
  };
}
