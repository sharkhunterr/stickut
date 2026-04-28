import { useState } from "react";
import { useStore } from "../store/useStore";
import type { ImageStep } from "../types";
import { ZoomModal } from "./ZoomModal";

const STEP_DOT: Record<ImageStep, string> = {
  "En attente": "bg-slate-300",
  Décodage: "bg-blue-400",
  "Détourage IA": "bg-blue-500",
  "Génération du contour": "bg-indigo-400",
  "Mise en page": "bg-indigo-500",
  Terminé: "bg-emerald-500",
  Échec: "bg-rose-500",
};

/** Ruban de vignettes des images uploadées, sous l'UploadZone.
 *  Vignette → zoom plein écran. Petit stepper "−  ×N  +" sous la vignette pour
 *  spécifier combien de copies de cette image placer sur la planche. */
export function UploadedStrip() {
  const images = useStore((s) => s.images);
  const setImageCount = useStore((s) => s.setImageCount);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  if (images.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <div className="flex flex-wrap gap-2">
        {images.map((img) => {
          const dotClass = STEP_DOT[img.step] ?? STEP_DOT["En attente"];
          const showAfter = Boolean(img.borderedBlobUrl);
          const src = showAfter ? (img.borderedBlobUrl as string) : img.originalBlobUrl;
          return (
            <div key={img.id} className="flex flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={() => setZoom({ src, alt: img.name })}
                className={`relative h-16 w-16 rounded border ${
                  img.unplaced ? "border-rose-500 ring-1 ring-rose-300" : "border-slate-200"
                } overflow-hidden ${showAfter ? "checker-bg" : "bg-slate-50"} hover:ring-2 hover:ring-accent`}
                title={`${img.name} — ${img.step}`}
                aria-label={`${img.name} — ${img.step}`}
              >
                <img
                  src={src}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain"
                  draggable={false}
                />
                <span
                  className={`absolute top-1 right-1 h-2 w-2 rounded-full ${dotClass} ring-1 ring-white`}
                  aria-hidden
                />
                {img.count > 1 && (
                  <span
                    className="absolute bottom-0.5 left-0.5 text-[10px] font-bold bg-accent text-white rounded px-1 leading-tight"
                    aria-hidden
                  >
                    ×{img.count}
                  </span>
                )}
              </button>
              <div className="flex items-center w-16 select-none">
                <button
                  type="button"
                  className="flex-1 text-xs leading-none rounded-l border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-30"
                  onClick={() => setImageCount(img.id, img.count - 1)}
                  disabled={img.count <= 1}
                  aria-label="Une copie de moins"
                >
                  −
                </button>
                <span className="flex-1 text-center text-[11px] font-medium text-slate-700 border-y border-slate-200 leading-none py-1">
                  ×{img.count}
                </span>
                <button
                  type="button"
                  className="flex-1 text-xs leading-none rounded-r border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-30"
                  onClick={() => setImageCount(img.id, img.count + 1)}
                  disabled={img.count >= 99}
                  aria-label="Une copie de plus"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {zoom && <ZoomModal src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </div>
  );
}
