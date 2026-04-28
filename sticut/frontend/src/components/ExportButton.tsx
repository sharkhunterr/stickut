import { useState } from "react";
import { zipSync, strToU8 } from "fflate";
import { useStore } from "../store/useStore";
import { canvasToPngBlob, composeA4, pageDimsPx } from "../lib/canvas/compose";
import { pack } from "../lib/canvas/pack";
import {
  resolvePlacement,
  expandImagesForLayout,
  parseLayoutId,
} from "../lib/canvas/placement";
import { getTemplateSvg } from "../lib/api";
import { injectFrame, rasterizeSvgToCanvas } from "../lib/canvas/svgInject";
import { buildExportFilename } from "../lib/filename";

type ExportMode = "composite" | "zip";

export function ExportButton() {
  const images = useStore((s) => s.images);
  const settings = useStore((s) => s.settings);
  const frame = useStore((s) => s.frame);
  const templates = useStore((s) => s.templates);
  const overrides = useStore((s) => s.history[s.historyIndex] ?? {});
  const setError = useStore((s) => s.setGlobalError);

  const [busy, setBusy] = useState<ExportMode | null>(null);

  const ready = images.filter((i) => i.borderedBlobUrl);
  const allUnplaced = ready.length > 0 && ready.every((i) => i.unplaced);
  const disabled = ready.length === 0 || allUnplaced || busy !== null;

  const triggerDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const onExportComposite = async () => {
    setBusy("composite");
    const t0 = performance.now();
    const log = (msg: string) =>
      console.log(`[export +${Math.round(performance.now() - t0)}ms] ${msg}`);
    try {
      const expanded = expandImagesForLayout(ready);
      const stickerArea = frame.selectedId
        ? templates.find((t) => t.id === frame.selectedId)?.sticker_area ?? null
        : null;
      const result = pack(
        expanded.map((i) => ({ id: i.layoutId, widthPx: i.widthPx, heightPx: i.heightPx })),
        {
          mode: settings.sizeMode,
          sizeFixedMm: settings.sizeFixedMm,
          sizeMinMm: settings.sizeMinMm,
          sizeMaxMm: settings.sizeMaxMm,
          spacingMm: settings.spacingMm,
          outerMarginMm: settings.outerMarginMm,
          stickerArea,
          pageWidthMm: settings.pageWidthMm,
          pageHeightMm: settings.pageHeightMm,
        },
      );
      log(`packed: ${result.placed.length} placed, ${result.unplaced.length} unplaced`);
      const placed = resolvePlacement(result, overrides);

      const usedSourceIds = new Set(placed.map((p) => parseLayoutId(p.id).sourceImageId));
      const bitmapBySource = new Map<string, ImageBitmap>();
      await Promise.all(
        ready
          .filter((i) => usedSourceIds.has(i.id))
          .map(async (i) => {
            const resp = await fetch(i.borderedBlobUrl as string);
            const blob = await resp.blob();
            bitmapBySource.set(i.id, await createImageBitmap(blob));
          }),
      );
      const sources = placed
        .map((p) => {
          const bm = bitmapBySource.get(parseLayoutId(p.id).sourceImageId);
          return bm ? { id: p.id, bordered: bm } : null;
        })
        .filter((x): x is { id: string; bordered: ImageBitmap } => x !== null);

      let injectedSvg: string | null = null;
      if (frame.selectedId) {
        try {
          const raw = await getTemplateSvg(frame.selectedId);
          injectedSvg = injectFrame(raw, frame.color, frame.headerText);
        } catch (err) {
          console.warn("[export] frame fetch failed", err);
        }
      }

      const canvas = await composeA4({
        pageWidthMm: settings.pageWidthMm,
        pageHeightMm: settings.pageHeightMm,
        placed,
        stickers: sources,
        frameSvg: injectedSvg,
      });
      log(`composeA4 done (${canvas.width}×${canvas.height})`);
      const blob = await canvasToPngBlob(canvas);
      log(`toBlob done (${(blob.size / 1024).toFixed(0)} KB)`);
      triggerDownload(blob, buildExportFilename());
    } catch (err) {
      console.error("[export] composite failed", err);
      setError(err instanceof Error ? err.message : "Échec de l'export.");
    } finally {
      setBusy(null);
    }
  };

  const onExportZip = async () => {
    setBusy("zip");
    const t0 = performance.now();
    const log = (msg: string) =>
      console.log(`[export-zip +${Math.round(performance.now() - t0)}ms] ${msg}`);
    try {
      const files: Record<string, Uint8Array> = {};
      // Métadonnées de placement (utile pour reconstruire le layout dans Cricut DS).
      const meta: {
        page: { widthMm: number; heightMm: number };
        stickers: { file: string; sourceImage: string; copyIndex: number; xMm: number; yMm: number; widthMm: number; heightMm: number; angleDeg: number }[];
      } = { page: { widthMm: settings.pageWidthMm, heightMm: settings.pageHeightMm }, stickers: [] };

      // 1) Stickers individuels — un PNG par sticker placé (avec rotation appliquée).
      const expanded = expandImagesForLayout(ready);
      const stickerArea = frame.selectedId
        ? templates.find((t) => t.id === frame.selectedId)?.sticker_area ?? null
        : null;
      const result = pack(
        expanded.map((i) => ({ id: i.layoutId, widthPx: i.widthPx, heightPx: i.heightPx })),
        {
          mode: settings.sizeMode,
          sizeFixedMm: settings.sizeFixedMm,
          sizeMinMm: settings.sizeMinMm,
          sizeMaxMm: settings.sizeMaxMm,
          spacingMm: settings.spacingMm,
          outerMarginMm: settings.outerMarginMm,
          stickerArea,
          pageWidthMm: settings.pageWidthMm,
          pageHeightMm: settings.pageHeightMm,
        },
      );
      const placed = resolvePlacement(result, overrides);

      // Bitmaps source uniques.
      const usedSourceIds = new Set(placed.map((p) => parseLayoutId(p.id).sourceImageId));
      const blobBySource = new Map<string, Blob>();
      await Promise.all(
        ready
          .filter((i) => usedSourceIds.has(i.id))
          .map(async (i) => {
            const resp = await fetch(i.borderedBlobUrl as string);
            blobBySource.set(i.id, await resp.blob());
          }),
      );
      log(`fetched ${blobBySource.size} unique sticker blobs`);

      // Pour chaque sticker placé : génère un PNG aux dimensions exactes en mm
      // (300 DPI), avec rotation appliquée → l'utilisateur peut l'uploader tel
      // quel dans Cricut DS et obtenir la bonne taille physique.
      const nameById = new Map(images.map((im) => [im.id, sanitizeFilename(im.name)]));
      let nthGlobal = 0;
      for (const p of placed) {
        const { sourceImageId, copyIndex } = parseLayoutId(p.id);
        const blob = blobBySource.get(sourceImageId);
        if (!blob) continue;
        const bm = await createImageBitmap(blob);
        const png = await rasterizeStickerToPngBytes(bm, p.widthMm, p.heightMm, p.angleDeg);
        const baseName = nameById.get(sourceImageId) || sourceImageId.slice(0, 8);
        const fname = `stickers/${String(nthGlobal + 1).padStart(2, "0")}_${stripExt(baseName)}_copy${copyIndex + 1}.png`;
        files[fname] = new Uint8Array(await png.arrayBuffer());
        meta.stickers.push({
          file: fname,
          sourceImage: nameById.get(sourceImageId) || sourceImageId,
          copyIndex,
          xMm: round(p.xMm),
          yMm: round(p.yMm),
          widthMm: round(p.widthMm),
          heightMm: round(p.heightMm),
          angleDeg: round(p.angleDeg),
        });
        nthGlobal++;
        bm.close?.();
      }
      log(`${nthGlobal} sticker PNGs generated`);

      // 2) Cadre exporté à part (PNG plein format + SVG d'origine).
      if (frame.selectedId) {
        try {
          const raw = await getTemplateSvg(frame.selectedId);
          const injected = injectFrame(raw, frame.color, frame.headerText);
          files[`frame/frame.svg`] = strToU8(injected);
          const { widthPx, heightPx } = pageDimsPx(settings.pageWidthMm, settings.pageHeightMm);
          const canvas = await rasterizeSvgToCanvas(injected, widthPx, heightPx);
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob frame"))), "image/png"),
          );
          files[`frame/frame.png`] = new Uint8Array(await blob.arrayBuffer());
          log("frame exported (svg + png)");
        } catch (err) {
          console.warn("[export-zip] frame export failed", err);
        }
      }

      // 3) Métadonnées de layout.
      files["layout.json"] = strToU8(JSON.stringify(meta, null, 2));
      files["README.txt"] = strToU8(README_TEXT);

      // 4) Zip.
      const zipped = zipSync(files, { level: 6 });
      log(`zip done (${(zipped.byteLength / 1024).toFixed(0)} KB, ${Object.keys(files).length} entries)`);
      const zipBlob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
      triggerDownload(zipBlob, buildExportFilename().replace(/\.png$/i, "") + "-stickers.zip");
    } catch (err) {
      console.error("[export-zip] failed", err);
      setError(err instanceof Error ? err.message : "Échec de l'export ZIP.");
    } finally {
      setBusy(null);
    }
  };

  const hint = allUnplaced
    ? "Réduisez la taille pour pouvoir exporter."
    : ready.length === 0
      ? "Aucun sticker prêt à exporter."
      : null;

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        type="button"
        className="min-h-touch px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
        disabled={disabled}
        onClick={() => void onExportComposite()}
      >
        {busy === "composite"
          ? "Export composite en cours…"
          : `Exporter ${settings.pageFormatId === "Custom" ? "feuille" : settings.pageFormatId} (PNG 300 DPI)`}
      </button>
      <button
        type="button"
        className="min-h-touch px-4 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
        disabled={disabled}
        onClick={() => void onExportZip()}
      >
        {busy === "zip" ? "Export ZIP en cours…" : "Exporter ZIP (1 PNG par sticker + cadre)"}
      </button>
      {hint && <p className="text-xs text-slate-500 text-center">{hint}</p>}
    </div>
  );
}

const MM_PER_INCH = 25.4;
const DPI = 300;

function mmToPx(mm: number): number {
  return Math.round((mm * DPI) / MM_PER_INCH);
}

/** Rastérise un sticker (bordé) à ses dimensions physiques (300 DPI), rotation
 *  appliquée. Le canvas final est tight autour du sticker tourné, fond
 *  transparent. */
async function rasterizeStickerToPngBytes(
  bm: ImageBitmap,
  widthMm: number,
  heightMm: number,
  angleDeg: number,
): Promise<Blob> {
  const wPx = mmToPx(widthMm);
  const hPx = mmToPx(heightMm);

  if (!angleDeg) {
    const c = document.createElement("canvas");
    c.width = wPx;
    c.height = hPx;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    ctx.drawImage(bm, 0, 0, wPx, hPx);
    return await canvasToBlob(c);
  }

  // Bounding box après rotation autour du centre du rectangle wPx×hPx.
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  const bboxW = Math.ceil(wPx * cosA + hPx * sinA);
  const bboxH = Math.ceil(wPx * sinA + hPx * cosA);

  const c = document.createElement("canvas");
  c.width = bboxW;
  c.height = bboxH;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");
  ctx.translate(bboxW / 2, bboxH / 2);
  ctx.rotate(rad);
  ctx.drawImage(bm, -wPx / 2, -hPx / 2, wPx, hPx);
  return await canvasToBlob(c);
}

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60);
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const README_TEXT = `Stickut — export ZIP

Contenu :
  stickers/   Un PNG par sticker (transparent, dimensions exactes en mm à 300 DPI).
              Importe chaque fichier dans Cricut Design Space puis clique
              "Make this a Sticker" pour avoir le choix Kiss Cut / Die Cut /
              Cut Around.
  frame/      Le cadre choisi, en SVG (vectoriel) et en PNG plein format.
  layout.json Coordonnées de placement de chaque sticker sur la planche
              (utile si tu veux reproduire l'agencement à la main dans DS).
`;
