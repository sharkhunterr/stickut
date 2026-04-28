/**
 * Layout résolu après application des overrides utilisateur sur le pack auto.
 *
 *  - `pack()` produit une PlacedSticker[] avec rotated:boolean (0° ou 90°).
 *  - L'utilisateur peut modifier chaque sticker dans le preview interactif :
 *    déplacement (xMm/yMm), redimensionnement (widthMm/heightMm), rotation libre
 *    (angleDeg, 0–360). Ces modifs sont stockées en `overrides`.
 *  - `applyOverrides()` fusionne les deux pour produire une liste finale en mm
 *    avec angleDeg systématique, consommée à la fois par le preview et l'export.
 *
 *  Les images peuvent être dupliquées (count > 1). Pour distinguer chaque copie
 *  on génère un "layoutId" synthétique = `${imageId}#${copyIndex}`. Ainsi pack,
 *  overrides et compose travaillent avec des IDs uniques, et on retrouve
 *  l'image source via parseLayoutId().
 */

import type { PackResult, PlacedSticker } from "./pack";
import type { StickerOverride } from "../../types";

export interface LayoutInput {
  /** ID synthétique unique par copie : `${sourceImageId}#${copyIndex}`. */
  layoutId: string;
  sourceImageId: string;
  widthPx: number;
  heightPx: number;
}

/** Construit un layoutId synthétique à partir d'une image et d'un index. */
export function makeLayoutId(imageId: string, copyIndex: number): string {
  return `${imageId}#${copyIndex}`;
}

export function parseLayoutId(layoutId: string): { sourceImageId: string; copyIndex: number } {
  const hash = layoutId.lastIndexOf("#");
  if (hash < 0) return { sourceImageId: layoutId, copyIndex: 0 };
  const idx = parseInt(layoutId.slice(hash + 1), 10);
  return {
    sourceImageId: layoutId.slice(0, hash),
    copyIndex: Number.isFinite(idx) ? idx : 0,
  };
}

/** Étend une liste d'images en autant de copies que `count` indique. */
export function expandImagesForLayout(
  images: { id: string; cutoutWidthPx: number; cutoutHeightPx: number; count: number }[],
): LayoutInput[] {
  const out: LayoutInput[] = [];
  for (const im of images) {
    const n = Math.max(1, Math.round(im.count));
    for (let i = 0; i < n; i++) {
      out.push({
        layoutId: makeLayoutId(im.id, i),
        sourceImageId: im.id,
        widthPx: im.cutoutWidthPx,
        heightPx: im.cutoutHeightPx,
      });
    }
  }
  return out;
}

export interface ResolvedSticker {
  id: string;
  /** Coin haut-gauche du rectangle (avant rotation), en mm. */
  xMm: number;
  yMm: number;
  /** Dimensions avant rotation, en mm. */
  widthMm: number;
  heightMm: number;
  /** Rotation autour du centre, en degrés. 0 = pas de rotation. */
  angleDeg: number;
}

export function resolvePlacement(
  pack: PackResult,
  overrides: Record<string, StickerOverride>,
): ResolvedSticker[] {
  return pack.placed.map((p) => stickerFromPack(p, overrides[p.id]));
}

function stickerFromPack(p: PlacedSticker, ov?: StickerOverride): ResolvedSticker {
  if (ov) {
    return {
      id: p.id,
      xMm: ov.xMm,
      yMm: ov.yMm,
      widthMm: ov.widthMm,
      heightMm: ov.heightMm,
      angleDeg: ov.angleDeg,
    };
  }
  // Pack auto : rotated:true ⇒ image dessinée à 90°, le bbox sur la page reste
  // (widthMm × heightMm). On re-écrit en angleDeg pour homogénéiser.
  return {
    id: p.id,
    xMm: p.xMm,
    yMm: p.yMm,
    widthMm: p.rotated ? p.heightMm : p.widthMm,
    heightMm: p.rotated ? p.widthMm : p.heightMm,
    angleDeg: p.rotated ? 90 : 0,
  };
}

/** Construit l'override initial d'un sticker à partir de son placement auto. */
export function defaultOverrideFromPlaced(p: PlacedSticker): StickerOverride {
  const r = stickerFromPack(p);
  return {
    xMm: r.xMm,
    yMm: r.yMm,
    widthMm: r.widthMm,
    heightMm: r.heightMm,
    angleDeg: r.angleDeg,
  };
}
