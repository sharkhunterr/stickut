import { useState } from "react";
import { useStore } from "../store/useStore";
import { canvasToPngBlob, composeA4 } from "../lib/canvas/compose";
import { pack } from "../lib/canvas/pack";
import { getTemplateSvg } from "../lib/api";
import { injectFrame } from "../lib/canvas/svgInject";
import { buildExportFilename } from "../lib/filename";

export function ExportButton() {
  const images = useStore((s) => s.images);
  const settings = useStore((s) => s.settings);
  const frame = useStore((s) => s.frame);
  const templates = useStore((s) => s.templates);
  const setError = useStore((s) => s.setGlobalError);

  const [busy, setBusy] = useState(false);

  const ready = images.filter((i) => i.borderedBlobUrl);
  const allUnplaced = ready.length > 0 && ready.every((i) => i.unplaced);
  const disabled = ready.length === 0 || allUnplaced || busy;

  const onExport = async () => {
    setBusy(true);
    try {
      const stickerArea = frame.selectedId
        ? templates.find((t) => t.id === frame.selectedId)?.sticker_area ?? null
        : null;
      const result = pack(
        ready.map((i) => ({ id: i.id, widthPx: i.cutoutWidthPx, heightPx: i.cutoutHeightPx })),
        {
          mode: settings.sizeMode,
          sizeFixedMm: settings.sizeFixedMm,
          sizeMinMm: settings.sizeMinMm,
          sizeMaxMm: settings.sizeMaxMm,
          spacingMm: settings.spacingMm,
          outerMarginMm: settings.outerMarginMm,
          stickerArea,
        },
      );

      const sources = await Promise.all(
        ready
          .filter((i) => result.placed.some((p) => p.id === i.id))
          .map(async (i) => {
            const resp = await fetch(i.borderedBlobUrl as string);
            const blob = await resp.blob();
            const bitmap = await createImageBitmap(blob);
            return { id: i.id, bordered: bitmap };
          }),
      );

      let injectedSvg: string | null = null;
      if (frame.selectedId) {
        try {
          const raw = await getTemplateSvg(frame.selectedId);
          injectedSvg = injectFrame(raw, frame.color, frame.headerText);
        } catch (err) {
          // Frame disappeared on the server; export without frame rather than failing.
          console.warn("Frame fetch failed for export, exporting without frame", err);
        }
      }

      const canvas = await composeA4({ pack: result, stickers: sources, frameSvg: injectedSvg });
      const blob = await canvasToPngBlob(canvas);
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = buildExportFilename();
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'export.");
    } finally {
      setBusy(false);
    }
  };

  const hint = allUnplaced
    ? "Réduisez la taille pour pouvoir exporter."
    : ready.length === 0
      ? "Aucun sticker prêt à exporter."
      : null;

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button type="button" className="btn-primary" disabled={disabled} onClick={onExport}>
        {busy ? "Export en cours…" : "Exporter A4 (PNG 300 DPI)"}
      </button>
      {hint && <p className="text-xs text-slate-500 text-center">{hint}</p>}
    </div>
  );
}
