import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { pack } from "../lib/canvas/pack";
import {
  resolvePlacement,
  defaultOverrideFromPlaced,
  expandImagesForLayout,
  parseLayoutId,
} from "../lib/canvas/placement";
import type { ResolvedSticker } from "../lib/canvas/placement";
import { getTemplateSvg } from "../lib/api";
import { injectFrame } from "../lib/canvas/svgInject";
import type { StickerOverride } from "../types";

const PREVIEW_MAX_PX = 480;

type DragMode =
  | { kind: "none" }
  | { kind: "move"; id: string; startX: number; startY: number; orig: StickerOverride }
  | { kind: "rotate"; id: string; centerX: number; centerY: number; startAngle: number; orig: StickerOverride }
  | { kind: "resize"; id: string; centerX: number; centerY: number; initialDist: number; orig: StickerOverride };

export function A4Preview() {
  const images = useStore((s) => s.images);
  const settings = useStore((s) => s.settings);
  const frame = useStore((s) => s.frame);
  const templates = useStore((s) => s.templates);
  const markUnplaced = useStore((s) => s.markImageUnplaced);
  const overrides = useStore((s) => s.history[s.historyIndex] ?? {});
  const setOverride = useStore((s) => s.setOverride);
  const resetOverrides = useStore((s) => s.resetOverrides);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const historyIndex = useStore((s) => s.historyIndex);
  const historyLength = useStore((s) => s.history.length);

  const [frameSvg, setFrameSvg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drag = useRef<DragMode>({ kind: "none" });
  const containerRef = useRef<HTMLDivElement>(null);

  // Dimensions du preview adaptées au format de feuille choisi.
  const pageW = settings.pageWidthMm;
  const pageH = settings.pageHeightMm;
  const aspect = pageH / pageW;
  const previewWidthPx = aspect >= 1 ? PREVIEW_MAX_PX : Math.round(PREVIEW_MAX_PX / aspect);
  const previewHeightPx = aspect >= 1 ? Math.round(PREVIEW_MAX_PX * aspect) : PREVIEW_MAX_PX;
  const pxPerMm = previewWidthPx / pageW;

  // ---- Frame SVG load
  useEffect(() => {
    let cancelled = false;
    const id = frame.selectedId;
    if (!id) {
      setFrameSvg(null);
      return;
    }
    getTemplateSvg(id)
      .then((svg) => {
        if (cancelled) return;
        try {
          setFrameSvg(injectFrame(svg, frame.color, frame.headerText));
        } catch {
          setFrameSvg(svg);
        }
      })
      .catch(() => {
        if (!cancelled) setFrameSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [frame.selectedId, frame.color, frame.headerText]);

  // Frame SVG → blob URL pour <img>.
  const frameSvgUrl = useMemo(() => {
    if (!frameSvg) return null;
    const blob = new Blob([frameSvg], { type: "image/svg+xml;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [frameSvg]);
  useEffect(() => {
    return () => {
      if (frameSvgUrl) URL.revokeObjectURL(frameSvgUrl);
    };
  }, [frameSvgUrl]);

  // ---- Compute pack auto, fusionne overrides
  const ready = useMemo(() => images.filter((i) => i.borderedBlobUrl), [images]);

  // Étend chaque image en autant de copies que `count` indique → liste de
  // layoutInputs avec layoutId synthétique, base du pack et des overrides.
  const layoutInputs = useMemo(() => expandImagesForLayout(ready), [ready]);

  const packResult = useMemo(() => {
    const stickerArea = frame.selectedId
      ? templates.find((t) => t.id === frame.selectedId)?.sticker_area ?? null
      : null;
    return pack(
      layoutInputs.map((i) => ({ id: i.layoutId, widthPx: i.widthPx, heightPx: i.heightPx })),
      {
        mode: settings.sizeMode,
        sizeFixedMm: settings.sizeFixedMm,
        sizeMinMm: settings.sizeMinMm,
        sizeMaxMm: settings.sizeMaxMm,
        spacingMm: settings.spacingMm,
        outerMarginMm: settings.outerMarginMm,
        stickerArea,
        pageWidthMm: pageW,
        pageHeightMm: pageH,
      },
    );
  }, [layoutInputs, settings, frame.selectedId, templates, pageW, pageH]);

  const resolved: ResolvedSticker[] = useMemo(
    () => resolvePlacement(packResult, overrides),
    [packResult, overrides],
  );

  // Met à jour le flag unplaced des images : une image est marquée unplaced
  // si AU MOINS UNE de ses copies n'a pas été placée.
  useEffect(() => {
    const unplacedSourceIds = new Set<string>();
    for (const lid of packResult.unplaced) {
      unplacedSourceIds.add(parseLayoutId(lid).sourceImageId);
    }
    for (const img of images) {
      markUnplaced(img.id, unplacedSourceIds.has(img.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packResult.unplaced.join("|")]);

  // ---- Pointer event handlers (move / rotate / resize)
  const beginMove = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);
    const r = resolved.find((s) => s.id === id);
    if (!r) return;
    const orig: StickerOverride = {
      xMm: r.xMm,
      yMm: r.yMm,
      widthMm: r.widthMm,
      heightMm: r.heightMm,
      angleDeg: r.angleDeg,
    };
    drag.current = { kind: "move", id, startX: e.clientX, startY: e.clientY, orig };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const beginRotate = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const cont = containerRef.current;
    const r = resolved.find((s) => s.id === id);
    if (!cont || !r) return;
    const rect = cont.getBoundingClientRect();
    const cxPx = (r.xMm + r.widthMm / 2) * pxPerMm + rect.left;
    const cyPx = (r.yMm + r.heightMm / 2) * pxPerMm + rect.top;
    const startAngle = Math.atan2(e.clientY - cyPx, e.clientX - cxPx) * (180 / Math.PI);
    drag.current = {
      kind: "rotate",
      id,
      centerX: cxPx,
      centerY: cyPx,
      startAngle: startAngle - r.angleDeg,
      orig: { xMm: r.xMm, yMm: r.yMm, widthMm: r.widthMm, heightMm: r.heightMm, angleDeg: r.angleDeg },
    };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const beginResize = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const cont = containerRef.current;
    const r = resolved.find((s) => s.id === id);
    if (!cont || !r) return;
    const rect = cont.getBoundingClientRect();
    const cxPx = (r.xMm + r.widthMm / 2) * pxPerMm + rect.left;
    const cyPx = (r.yMm + r.heightMm / 2) * pxPerMm + rect.top;
    const dx = e.clientX - cxPx;
    const dy = e.clientY - cyPx;
    const dist = Math.max(1, Math.hypot(dx, dy));
    drag.current = {
      kind: "resize",
      id,
      centerX: cxPx,
      centerY: cyPx,
      initialDist: dist,
      orig: { xMm: r.xMm, yMm: r.yMm, widthMm: r.widthMm, heightMm: r.heightMm, angleDeg: r.angleDeg },
    };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d.kind === "none") return;
    e.preventDefault();
    if (d.kind === "move") {
      const dxMm = (e.clientX - d.startX) / pxPerMm;
      const dyMm = (e.clientY - d.startY) / pxPerMm;
      const next: StickerOverride = {
        ...d.orig,
        xMm: clamp(d.orig.xMm + dxMm, -d.orig.widthMm + 5, pageW - 5),
        yMm: clamp(d.orig.yMm + dyMm, -d.orig.heightMm + 5, pageH - 5),
      };
      setOverride(d.id, next, false);
    } else if (d.kind === "rotate") {
      const angle = Math.atan2(e.clientY - d.centerY, e.clientX - d.centerX) * (180 / Math.PI);
      const next: StickerOverride = { ...d.orig, angleDeg: normaliseAngle(angle - d.startAngle) };
      setOverride(d.id, next, false);
    } else if (d.kind === "resize") {
      const dist = Math.max(1, Math.hypot(e.clientX - d.centerX, e.clientY - d.centerY));
      const scale = dist / d.initialDist;
      const newW = clamp(d.orig.widthMm * scale, 5, pageW);
      const newH = clamp(d.orig.heightMm * scale, 5, pageH);
      // Centre fixe → on recalcule x/y
      const cx = d.orig.xMm + d.orig.widthMm / 2;
      const cy = d.orig.yMm + d.orig.heightMm / 2;
      const next: StickerOverride = {
        ...d.orig,
        widthMm: newW,
        heightMm: newH,
        xMm: cx - newW / 2,
        yMm: cy - newH / 2,
      };
      setOverride(d.id, next, false);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d.kind === "none") return;
    drag.current = { kind: "none" };
    // Commit final → step undo séparé.
    const r = resolved.find((s) => s.id === d.id);
    if (r) {
      const finalOv: StickerOverride = {
        xMm: r.xMm,
        yMm: r.yMm,
        widthMm: r.widthMm,
        heightMm: r.heightMm,
        angleDeg: r.angleDeg,
      };
      setOverride(d.id, finalOv, true);
    }
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  // ---- Background click → deselect, double-click sticker → reset cet override
  const onBackgroundPointerDown = () => {
    setSelectedId(null);
  };

  const resetOne = (id: string) => {
    const placed = packResult.placed.find((p) => p.id === id);
    if (!placed) return;
    setOverride(id, defaultOverrideFromPlaced(placed), true);
  };

  // ---- Header: nb stickers, undo/redo state
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLength - 1;
  const hasOverrides = Object.keys(overrides).length > 0;

  // Cache des borderedBlobUrl par sourceImageId (pas layoutId — toutes les
  // copies d'une même image partagent le même blob).
  const srcById = useMemo(() => {
    const m = new Map<string, string>();
    for (const im of ready) if (im.borderedBlobUrl) m.set(im.id, im.borderedBlobUrl);
    return m;
  }, [ready]);

  const lookupSrc = (layoutId: string): string | undefined =>
    srcById.get(parseLayoutId(layoutId).sourceImageId);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <p className="text-sm font-medium text-slate-700">
          Aperçu{" "}
          <span className="text-xs font-normal text-slate-500">
            {pageW.toFixed(0)} × {pageH.toFixed(0)} mm
          </span>
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="px-2 py-1 text-xs rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
            title="Annuler (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="px-2 py-1 text-xs rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
            title="Rétablir (Ctrl+Y)"
          >
            ↷
          </button>
          <button
            type="button"
            onClick={() => resetOverrides()}
            disabled={!hasOverrides}
            className="px-2 py-1 text-xs rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
            title="Replacer automatiquement"
          >
            Reset
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-2">
        Clic = sélectionner · Glisser = déplacer · Poignée bleue = rotation · Poignée orange = redimensionner · Double-clic = reset un sticker
      </p>
      <div className="checker-bg inline-block mx-auto">
        <div
          ref={containerRef}
          className="relative select-none"
          style={{ width: previewWidthPx, height: previewHeightPx, touchAction: "none" }}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Frame SVG en arrière-plan */}
          {frameSvgUrl && (
            <img
              src={frameSvgUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
          )}

          {/* Stickers */}
          {resolved.map((s) => {
            const src = lookupSrc(s.id);
            if (!src) return null;
            const left = s.xMm * pxPerMm;
            const top = s.yMm * pxPerMm;
            const w = s.widthMm * pxPerMm;
            const h = s.heightMm * pxPerMm;
            const isSel = selectedId === s.id;
            return (
              <div
                key={s.id}
                style={{
                  position: "absolute",
                  left,
                  top,
                  width: w,
                  height: h,
                  transform: `rotate(${s.angleDeg}deg)`,
                  transformOrigin: "center center",
                  cursor: isSel ? "move" : "pointer",
                  outline: isSel ? "1.5px solid #2563eb" : "none",
                  outlineOffset: 0,
                }}
                onPointerDown={(e) => beginMove(e, s.id)}
                onDoubleClick={() => resetOne(s.id)}
              >
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  className="block w-full h-full pointer-events-none"
                  style={{ objectFit: "contain" }}
                />
                {isSel && (
                  <>
                    {/* Poignée rotation (haut-centre) */}
                    <div
                      onPointerDown={(e) => beginRotate(e, s.id)}
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: -22,
                        transform: "translateX(-50%)",
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: "#2563eb",
                        border: "2px solid white",
                        boxShadow: "0 0 0 1px #2563eb",
                        cursor: "grab",
                        touchAction: "none",
                      }}
                      title="Faire tourner"
                    />
                    {/* Ligne reliant la poignée rotation au sticker */}
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: -10,
                        width: 1,
                        height: 10,
                        background: "#2563eb",
                        transform: "translateX(-50%)",
                        pointerEvents: "none",
                      }}
                    />
                    {/* Poignée resize (coin bas-droit) */}
                    <div
                      onPointerDown={(e) => beginResize(e, s.id)}
                      style={{
                        position: "absolute",
                        right: -8,
                        bottom: -8,
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        background: "#f97316",
                        border: "2px solid white",
                        boxShadow: "0 0 0 1px #f97316",
                        cursor: "nwse-resize",
                        touchAction: "none",
                      }}
                      title="Redimensionner"
                    />
                  </>
                )}
              </div>
            );
          })}

          {/* Overlay vide */}
          {ready.length === 0 && images.length > 0 && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <span className="text-xs text-slate-500 bg-white/90 px-3 py-1.5 rounded-full border border-slate-200">
                {images.length} image(s) en cours de traitement…
              </span>
            </div>
          )}
        </div>
      </div>
      {packResult.unplaced.length > 0 && (
        <p className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {packResult.unplaced.length} sticker(s) trop grand(s) pour la planche — réduisez la taille.
        </p>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function normaliseAngle(a: number): number {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}
