import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { composeA4 } from "../lib/canvas/compose";
import type { PackResult } from "../lib/canvas/pack";
import { pack } from "../lib/canvas/pack";
import { getTemplateSvg } from "../lib/api";
import { injectFrame } from "../lib/canvas/svgInject";

interface Props {
  onPack?: (result: PackResult) => void;
}

const PREVIEW_WIDTH_PX = 480;
const PREVIEW_HEIGHT_PX = Math.round((PREVIEW_WIDTH_PX * 297) / 210);

export function A4Preview({ onPack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const images = useStore((s) => s.images);
  const settings = useStore((s) => s.settings);
  const frame = useStore((s) => s.frame);
  const templates = useStore((s) => s.templates);
  const markUnplaced = useStore((s) => s.markImageUnplaced);

  const [frameSvg, setFrameSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = frame.selectedId;
    if (!id) {
      setFrameSvg(null);
      return;
    }
    getTemplateSvg(id)
      .then((svg) => {
        if (!cancelled) setFrameSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setFrameSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [frame.selectedId]);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;

    const render = async () => {
      const ready = images.filter((i) => i.borderedBlobUrl);
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
      onPack?.(result);
      const unplacedSet = new Set(result.unplaced);
      for (const img of images) {
        markUnplaced(img.id, unplacedSet.has(img.id));
      }

      const sources = await Promise.all(
        ready.map(async (i) => {
          const resp = await fetch(i.borderedBlobUrl as string);
          const blob = await resp.blob();
          const bitmap = await createImageBitmap(blob);
          return { id: i.id, bordered: bitmap };
        }),
      );

      let injectedSvg: string | null = null;
      if (frameSvg) {
        injectedSvg = injectFrame(frameSvg, frame.color, frame.headerText);
      }

      const a4 = await composeA4({
        pack: result,
        stickers: sources,
        frameSvg: injectedSvg,
      });

      if (cancelled) return;
      const target = canvasRef.current;
      if (!target) return;
      target.width = PREVIEW_WIDTH_PX;
      target.height = PREVIEW_HEIGHT_PX;
      const ctx = target.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(a4, 0, 0, PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX);
    };

    raf = requestAnimationFrame(() => {
      void render();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, settings, frame, frameSvg, templates]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-medium text-slate-700 mb-2">Aperçu de la planche A4</p>
      <div className="checker-bg inline-block mx-auto">
        <canvas
          ref={canvasRef}
          width={PREVIEW_WIDTH_PX}
          height={PREVIEW_HEIGHT_PX}
          className="block max-w-full h-auto"
        />
      </div>
    </div>
  );
}
